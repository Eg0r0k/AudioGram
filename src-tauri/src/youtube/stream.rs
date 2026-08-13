//! Stream resolution (yt-dlp `--get-url`) and the yt handler of the
//! `stream://` proxy. The scheme itself and its dispatcher live in
//! `crate::stream`; this module only serves `yt/<videoId>` paths.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_shell::ShellExt;

use crate::stream::{forward_get, range_response, status_response};

use super::{proxy_args, validate_id, ProxyState, YtError, SIDECAR_YTDLP};

/// A resolved googlevideo stream: the URL plus the User-Agent to fetch it
/// with. yt-dlp URLs are served to a generic browser UA.
#[derive(Clone)]
pub struct StreamEntry {
    url: String,
    user_agent: String,
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
const MAX_PREFETCHED_TRACKS: usize = 3;

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

    fn insert(&self, id: String, content_type: String, bytes: Vec<u8>) {
        let Ok(mut entries) = self.entries.lock() else {
            return;
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
    }
}

/// Resolves the best audio stream URL via the yt-dlp sidecar and caches it
/// for the `stream://` proxy.
async fn resolve_stream<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<StreamEntry, String> {
    let url = format!("https://www.youtube.com/watch?v={id}");
    let mut args: Vec<String> = vec![
        url,
        "-f".into(),
        "bestaudio[ext=m4a]/bestaudio".into(),
        "--no-playlist".into(),
        "--no-warnings".into(),
        "--get-url".into(),
    ];
    args.extend(proxy_args(app));

    let output = app
        .shell()
        .sidecar(SIDECAR_YTDLP)
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp resolve failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stream_url = stdout
        .lines()
        .map(str::trim)
        .find(|line| line.starts_with("http"))
        .map(str::to_owned)
        .ok_or_else(|| "no stream url returned".to_string())?;

    let entry = StreamEntry {
        url: stream_url,
        user_agent: "Mozilla/5.0".into(),
    };
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

    let mut result = fetch_bytes(&entry.url, &entry.user_agent, proxy.clone()).await?;
    if result.0 == 403 {
        // Expired googlevideo URL (app restart, proxy IP change) — one retry.
        let entry = resolve_stream(&app, &id).await?;
        result = fetch_bytes(&entry.url, &entry.user_agent, proxy).await?;
    }

    let (status, content_type, bytes) = result;
    if !(200..300).contains(&status) {
        return Err(YtError::from(format!("prefetch failed: upstream status {status}")));
    }

    app.state::<YtAudioCache>().insert(id, content_type, bytes);
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
        let response = forward_get(&entry.url, Some(&entry.user_agent), range.clone(), proxy.clone()).await?;
        if response.status() != tauri::http::StatusCode::FORBIDDEN {
            return Ok(response);
        }
        log::warn!("stream yt/{id}: upstream returned 403, re-resolving stream URL");
    }

    let entry = resolve_stream(app, id).await.map_err(|e| {
        log::warn!("stream yt/{id}: re-resolve failed: {e}");
        e
    })?;
    forward_get(&entry.url, Some(&entry.user_agent), range, proxy).await
}

/// Downloads a full upstream body: `(status, content_type, bytes)`.
async fn fetch_bytes(
    url: &str,
    user_agent: &str,
    proxy: Option<String>,
) -> Result<(u16, String, Vec<u8>), String> {
    let mut builder = reqwest::Client::builder();
    if let Some(url) = proxy.as_deref().filter(|p| !p.is_empty()) {
        if let Ok(proxy) = reqwest::Proxy::all(url) {
            builder = builder.proxy(proxy);
        }
    }
    let client = builder.build().map_err(|e| e.to_string())?;

    let resp = client
        .get(url)
        .header(reqwest::header::USER_AGENT, user_agent)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status().as_u16();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("audio/mp4")
        .to_owned();
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();

    Ok((status, content_type, bytes))
}



