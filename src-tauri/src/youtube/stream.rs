//! Stream resolution (yt-dlp `--get-url`) and the yt handler of the
//! `stream://` proxy. The scheme itself and its dispatcher live in
//! `crate::stream`; this module only serves `yt/<videoId>` paths.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use crate::stream::{forward_get, range_response, status_response};

use super::{kill_sidecar_tree, proxy_args, validate_id, ProxyState, YtError, SIDECAR_YTDLP};

/// A resolved googlevideo stream: the URL plus the request headers yt-dlp
/// would fetch it with. googlevideo binds URLs to the resolving client —
/// downloading with mismatched headers (most visibly the User-Agent) gets
/// 403, so the exact `http_headers` of the selected format ride along.
#[derive(Clone)]
pub struct StreamEntry {
    url: String,
    headers: Vec<(String, String)>,
}

/// In-memory map of video id → resolved stream entry, populated by `yt_resolve`
/// and consumed by the `stream://` proxy so seeks reuse a single resolution.
#[derive(Default)]
pub struct YtStreamCache {
    urls: Mutex<HashMap<String, StreamEntry>>,
}

impl YtStreamCache {
    fn insert(&self, id: String, entry: StreamEntry) {
        if let Ok(mut map) = self.urls.lock() {
            map.insert(id, entry);
        }
    }

    fn get(&self, id: &str) -> Option<StreamEntry> {
        self.urls.lock().ok().and_then(|map| map.get(id).cloned())
    }
}

/// Whole prefetched audio files, keyed by video id. Filled by `yt_prefetch`
/// while the previous track is still playing; the `stream://` proxy serves
/// range requests straight from memory, so the next track starts instantly
/// instead of waiting for the full googlevideo download.
///
/// Long uploads (2h mixes) are refused: warming them would pin hundreds of
/// MB of audio in memory for a head start the capped-range streaming path
/// already provides.
const MAX_PREFETCHED_TRACKS: usize = 3;
const MAX_PREFETCHED_YT_BYTES: usize = 128 * 1024 * 1024;

/// Per-request range window for googlevideo. Measured 2026-08: spans up to
/// 1 MiB answer 206, 2 MiB answers 403, larger/open ranges bounce with 302 —
/// URLs resolved without a PO token are hard-limited, so every request
/// (streaming AND prefetch) must stay under this.
const YT_RANGE_SPAN: u64 = 1024 * 1024;

struct CachedAudio {
    content_type: String,
    bytes: Arc<Vec<u8>>,
}

#[derive(Default)]
pub struct YtAudioCache {
    entries: Mutex<(HashMap<String, CachedAudio>, VecDeque<String>)>,
}

impl YtAudioCache {
    fn get(&self, id: &str) -> Option<(String, Arc<Vec<u8>>)> {
        let entries = self.entries.lock().ok()?;
        entries
            .0
            .get(id)
            .map(|audio| (audio.content_type.clone(), Arc::clone(&audio.bytes)))
    }

    fn contains(&self, id: &str) -> bool {
        self.entries
            .lock()
            .map(|entries| entries.0.contains_key(id))
            .unwrap_or(false)
    }

    /// Returns false when the track is over the per-track cap and was NOT
    /// cached — the command must surface that instead of reporting success.
    fn insert(&self, id: String, content_type: String, bytes: Vec<u8>) -> bool {
        if bytes.len() > MAX_PREFETCHED_YT_BYTES {
            return false;
        }
        let Ok(mut entries) = self.entries.lock() else {
            return false;
        };
        let (map, order) = &mut *entries;
        let audio = CachedAudio { content_type, bytes: Arc::new(bytes) };
        if map.insert(id.clone(), audio).is_none() {
            order.push_back(id);
        }
        while map.len() > MAX_PREFETCHED_TRACKS {
            let Some(oldest) = order.pop_front() else {
                break;
            };
            map.remove(&oldest);
        }
        true
    }
}

/// A wedged yt-dlp (stalled network, hung challenge) must not pin the player
/// on "loading" forever — the sidecar is killed and the call fails instead.
const RESOLVE_TIMEOUT: Duration = Duration::from_secs(25);

/// The selected format's fields from `yt-dlp -j` (single-format selection
/// merges them into the top-level info dict).
#[derive(serde::Deserialize)]
struct ResolvedInfo {
    url: Option<String>,
    format_id: Option<String>,
    #[serde(default)]
    http_headers: HashMap<String, String>,
}

/// Hop-by-hop headers reqwest must own. Accept-Encoding stays out so reqwest
/// negotiates (and transparently decodes) compression itself; Range is
/// forwarded separately per request.
fn is_forwardable_header(name: &str) -> bool {
    !matches!(
        name.to_ascii_lowercase().as_str(),
        "host" | "connection" | "content-length" | "accept-encoding" | "range"
    )
}

/// Extracts `(url, format_id, http_headers)` from `yt-dlp -j` stdout —
/// the last JSON line, in case the extractor chatters before it.
fn parse_resolve_output(stdout: &str) -> Result<(String, String, Vec<(String, String)>), String> {
    let line = stdout
        .lines()
        .map(str::trim)
        .filter(|line| line.starts_with('{'))
        .next_back()
        .ok_or_else(|| "no json in yt-dlp output".to_string())?;
    let info: ResolvedInfo =
        serde_json::from_str(line).map_err(|e| format!("yt-dlp json parse failed: {e}"))?;

    let url = info
        .url
        .filter(|url| url.starts_with("http"))
        .ok_or_else(|| "no stream url returned".to_string())?;

    let mut headers: Vec<(String, String)> = info
        .http_headers
        .into_iter()
        .filter(|(name, _)| is_forwardable_header(name))
        .collect();
    if !headers.iter().any(|(name, _)| name.eq_ignore_ascii_case("user-agent")) {
        headers.push(("User-Agent".into(), "Mozilla/5.0".into()));
    }

    Ok((url, info.format_id.unwrap_or_default(), headers))
}

/// Resolves the best audio stream URL (with its request headers) via the
/// yt-dlp sidecar and caches it for the `stream://` proxy.
async fn resolve_stream<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<StreamEntry, String> {
    let url = format!("https://www.youtube.com/watch?v={id}");
    let mut args: Vec<String> = vec![
        url,
        "-f".into(),
        "bestaudio[ext=m4a]/bestaudio".into(),
        "--no-playlist".into(),
        "--no-warnings".into(),
        "-j".into(),
    ];
    args.extend(proxy_args(app));

    let (mut rx, child) = app
        .shell()
        .sidecar(SIDECAR_YTDLP)
        .map_err(|e| e.to_string())?
        .args(args)
        .spawn()
        .map_err(|e| e.to_string())?;

    let collected = tokio::time::timeout(RESOLVE_TIMEOUT, async {
        let mut stdout = String::new();
        let mut stderr = String::new();
        let mut exit_code: Option<i32> = None;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    stdout.push_str(&String::from_utf8_lossy(&bytes));
                    stdout.push('\n');
                }
                CommandEvent::Stderr(bytes) => {
                    stderr.push_str(&String::from_utf8_lossy(&bytes));
                    stderr.push('\n');
                }
                CommandEvent::Terminated(payload) => exit_code = payload.code,
                _ => {}
            }
        }

        (stdout, stderr, exit_code)
    })
    .await;

    let (stdout, stderr, exit_code) = match collected {
        Ok(collected) => collected,
        Err(_) => {
            // The whole tree goes: a dead resolve must not keep a process
            // and the network busy.
            log::warn!("yt_resolve {id}: sidecar wedged, killing it");
            kill_sidecar_tree(child);
            return Err(format!(
                "yt-dlp resolve timed out after {}s",
                RESOLVE_TIMEOUT.as_secs()
            ));
        }
    };

    if exit_code != Some(0) {
        return Err(format!("yt-dlp resolve failed: {}", stderr.trim()));
    }

    let (stream_url, format_id, headers) = parse_resolve_output(&stdout)?;
    log::info!(
        "yt_resolve {id}: format {format_id}, {} request headers",
        headers.len()
    );

    let entry = StreamEntry { url: stream_url, headers };
    app.state::<YtStreamCache>().insert(id.to_owned(), entry.clone());
    Ok(entry)
}

#[tauri::command]
pub async fn yt_resolve<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> Result<String, YtError> {
    let id = validate_id(id).map_err(YtError::invalid_input)?;

    // Cache under the id; the frontend plays `stream://localhost/yt/<id>`, which the
    // proxy resolves back to this URL (avoids re-running yt-dlp on every seek).
    resolve_stream(&app, &id).await?;
    Ok(id)
}

/// Downloads the whole audio file for `id` into the in-memory prefetch cache
/// so the `stream://` proxy answers the upcoming track's requests instantly.
/// Called by the frontend for the next queue entry while the current track is
/// still playing.
#[tauri::command]
pub async fn yt_prefetch<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> Result<(), YtError> {
    let id = validate_id(id).map_err(YtError::invalid_input)?;
    if app.state::<YtAudioCache>().contains(&id) {
        return Ok(());
    }

    let proxy = app.state::<ProxyState>().get();
    let entry = match app.state::<YtStreamCache>().get(&id) {
        Some(entry) => entry,
        None => resolve_stream(&app, &id).await?,
    };

    let mut result = fetch_bytes(&entry.url, &entry.headers, proxy.clone()).await?;
    if result.0 == 403 {
        // Expired googlevideo URL (app restart, proxy IP change) — one retry.
        let entry = resolve_stream(&app, &id).await?;
        result = fetch_bytes(&entry.url, &entry.headers, proxy).await?;
    }

    let (status, content_type, bytes) = result;
    if !(200..300).contains(&status) {
        return Err(YtError::from(format!("prefetch failed: upstream status {status}")));
    }

    if !app.state::<YtAudioCache>().insert(id, content_type, bytes) {
        return Err(YtError::from("prefetch skipped: track exceeds the cache cap".to_owned()));
    }
    Ok(())
}

/// Handles `stream://…/yt/<videoId>`: proxied googlevideo audio (bypassing
/// the webview's CORS block), served from the prefetch cache when warm.
pub(crate) async fn stream_yt<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    range: Option<String>,
) -> Result<tauri::http::Response<Vec<u8>>, String> {
    stream_with_retry(app, id, range).await
}

/// Streams from the cached googlevideo URL, transparently re-resolving it when
/// it is missing (app restart) or rejected with 403 (URL expired after ~6 h,
/// IP change behind a rotating proxy, or a flagged session).
async fn stream_with_retry<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    range: Option<String>,
) -> Result<tauri::http::Response<Vec<u8>>, String> {
    if validate_id(id.to_owned()).is_err() {
        return Ok(status_response(404));
    }

    // Prefetched track: serve straight from memory, no network round-trip.
    if let Some((content_type, bytes)) = app.state::<YtAudioCache>().get(id) {
        return Ok(range_response(&content_type, &bytes, range.as_deref()));
    }

    let proxy = app.state::<ProxyState>().get();

    if let Some(entry) = app.state::<YtStreamCache>().get(id) {
        let response =
            forward_get(&entry.url, &entry.headers, range.clone(), proxy.clone(), YT_RANGE_SPAN)
                .await?;
        if response.status() != tauri::http::StatusCode::FORBIDDEN {
            return Ok(response);
        }
        log::warn!("stream yt/{id}: upstream returned 403, re-resolving stream URL");
    }

    let entry = resolve_stream(app, id).await.map_err(|e| {
        log::warn!("stream yt/{id}: re-resolve failed: {e}");
        e
    })?;
    let response = forward_get(&entry.url, &entry.headers, range, proxy, YT_RANGE_SPAN).await?;
    if response.status().as_u16() >= 400 {
        // A fresh URL still refused: headers/IP no longer satisfy googlevideo
        // — worth its own line, the webview only sees a generic media error.
        log::warn!(
            "stream yt/{id}: upstream status {} on a freshly resolved URL",
            response.status()
        );
    }
    Ok(response)
}

/// Total size from a `Content-Range: bytes X-Y/total` value; None for `*`.
fn content_range_total(value: &str) -> Option<usize> {
    value.rsplit('/').next()?.trim().parse().ok()
}

/// Downloads a full upstream body in [`YT_RANGE_SPAN`]-sized sequential
/// chunks (googlevideo rejects larger requests outright): `(status,
/// content_type, bytes)`. A non-2xx FIRST chunk returns with its status and
/// an empty body so the caller can run the expired-URL retry; failures past
/// that become errors. Over-cap tracks are refused as soon as the first
/// chunk's Content-Range reveals the total, before the bandwidth is spent.
async fn fetch_bytes(
    url: &str,
    headers: &[(String, String)],
    proxy: Option<String>,
) -> Result<(u16, String, Vec<u8>), String> {
    let mut builder = reqwest::Client::builder();
    if let Some(url) = proxy.as_deref().filter(|p| !p.is_empty()) {
        if let Ok(proxy) = reqwest::Proxy::all(url) {
            builder = builder.proxy(proxy);
        }
    }
    let client = builder.build().map_err(|e| e.to_string())?;

    let chunk = YT_RANGE_SPAN as usize;
    let mut buf: Vec<u8> = Vec::new();
    let mut content_type = "audio/mp4".to_owned();
    let mut total: Option<usize> = None;

    loop {
        let start = buf.len();
        let mut req = client.get(url);
        for (name, value) in headers {
            req = req.header(name.as_str(), value.as_str());
        }
        let resp = req
            .header(reqwest::header::RANGE, format!("bytes={start}-{}", start + chunk - 1))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let status = resp.status().as_u16();

        if start == 0 {
            if let Some(ct) = resp
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
            {
                content_type = ct.to_owned();
            }
            if !(200..300).contains(&status) {
                return Ok((status, content_type, Vec::new()));
            }
        }
        else if status == 416 {
            // One past the end: a total-less server told us we are done.
            break;
        }
        else if !(200..300).contains(&status) {
            return Err(format!("prefetch chunk failed: upstream status {status} at byte {start}"));
        }

        if total.is_none() {
            total = resp
                .headers()
                .get(reqwest::header::CONTENT_RANGE)
                .and_then(|v| v.to_str().ok())
                .and_then(content_range_total);
            if let Some(total) = total {
                if total > MAX_PREFETCHED_YT_BYTES {
                    return Err(format!(
                        "prefetch skipped: track is {total} bytes, over the cache cap"
                    ));
                }
            }
        }

        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        if status == 200 {
            // Server ignored the range: the body already is the whole file.
            return Ok((200, content_type, bytes.to_vec()));
        }

        let short_chunk = bytes.len() < chunk;
        buf.extend_from_slice(&bytes);
        if buf.len() > MAX_PREFETCHED_YT_BYTES {
            return Err("prefetch skipped: track exceeds the cache cap".into());
        }
        match total {
            Some(total) if buf.len() >= total => break,
            None if short_chunk => break,
            _ => {}
        }
        if bytes.is_empty() {
            break;
        }
    }

    Ok((206, content_type, buf))
}

#[cfg(test)]
mod tests {
    use super::{content_range_total, parse_resolve_output, YtAudioCache, MAX_PREFETCHED_YT_BYTES};

    #[test]
    fn parses_the_total_out_of_content_range() {
        assert_eq!(content_range_total("bytes 0-1048575/157286400"), Some(157_286_400));
        assert_eq!(content_range_total("bytes 0-1023/*"), None);
        assert_eq!(content_range_total("garbage"), None);
    }

    fn filled(cache: &YtAudioCache, id: &str, len: usize) -> bool {
        cache.insert(id.to_owned(), "audio/mp4".into(), vec![0u8; len])
    }

    #[test]
    fn cache_rejects_tracks_over_the_per_track_cap() {
        let cache = YtAudioCache::default();
        assert!(!filled(&cache, "big", MAX_PREFETCHED_YT_BYTES + 1));
        assert!(!cache.contains("big"));
    }

    #[test]
    fn cache_evicts_the_oldest_entry_beyond_the_track_cap() {
        let cache = YtAudioCache::default();
        assert!(filled(&cache, "v1", 8));
        assert!(filled(&cache, "v2", 8));
        assert!(filled(&cache, "v3", 8));
        assert!(filled(&cache, "v4", 8));

        assert!(!cache.contains("v1"));
        assert!(cache.contains("v2"));
        assert!(cache.contains("v4"));
    }

    #[test]
    fn parses_url_format_and_headers_past_yt_dlp_chatter() {
        let stdout = concat!(
            "[youtube] Extracting URL\n",
            r#"{"url": "https://rr3---sn.googlevideo.com/videoplayback?x=1", "format_id": "140", "http_headers": {"User-Agent": "com.google.ios.youtube/20.10.4 (iPhone16,2)", "Accept": "*/*", "Host": "rr3---sn.googlevideo.com", "Accept-Encoding": "gzip, deflate"}}"#,
            "\n",
        );

        let (url, format_id, headers) = parse_resolve_output(stdout).expect("parsed");

        assert_eq!(url, "https://rr3---sn.googlevideo.com/videoplayback?x=1");
        assert_eq!(format_id, "140");
        // The resolving client's identity survives; hop-by-hop headers do not.
        assert!(headers.iter().any(|(name, value)| name == "User-Agent" && value.starts_with("com.google.ios")));
        assert!(headers.iter().any(|(name, _)| name == "Accept"));
        assert!(!headers.iter().any(|(name, _)| name.eq_ignore_ascii_case("host")));
        assert!(!headers.iter().any(|(name, _)| name.eq_ignore_ascii_case("accept-encoding")));
    }

    #[test]
    fn falls_back_to_a_browser_ua_when_yt_dlp_sends_no_headers() {
        let stdout = r#"{"url": "https://example.googlevideo.com/v", "format_id": "251"}"#;

        let (_, _, headers) = parse_resolve_output(stdout).expect("parsed");

        assert_eq!(
            headers,
            vec![("User-Agent".to_owned(), "Mozilla/5.0".to_owned())],
        );
    }

    #[test]
    fn reports_output_without_json_or_url() {
        assert!(parse_resolve_output("ERROR: unable to extract\n").is_err());
        assert!(parse_resolve_output("").is_err());
        assert!(parse_resolve_output(r#"{"format_id": "140"}"#).is_err());
    }
}



