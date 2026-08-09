//! YouTube integration, hybrid architecture:
//! - **Search** goes through rustypipe (Rust Innertube client) — fast, no
//!   subprocess, and metadata endpoints are not gated by YouTube.
//! - **Stream resolution & downloads** go through the `yt-dlp` sidecar. As of
//!   2026-07 YouTube gates raw stream URLs behind the SABR protocol / PO
//!   tokens on every client rustypipe supports (measured: iOS URLs only serve
//!   the first ~1 MiB, the other clients fail deobfuscation; upstream is
//!   dormant since 2025-06). yt-dlp keeps up with these changes daily.
//!
//! No ffmpeg: downloads request the AAC stream (`bestaudio[ext=m4a]`) as-is
//! and tags (title/artist/cover) are written in-process with lofty.

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use std::collections::HashMap;
use std::sync::Mutex;

use lofty::config::WriteOptions;
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::prelude::*;
use lofty::tag::{Tag, TagType};
use rustypipe::client::RustyPipe;
use rustypipe::model::{Thumbnail, VideoItem};

/// Sidecar filename (matches `externalBin: ["binaries/yt-dlp"]`, referenced by stem).
const SIDECAR_YTDLP: &str = "yt-dlp";
/// Where downloaded originals land before the import pipeline copies them into managed storage.
const DOWNLOAD_SUBDIR: &str = "youtube-cache";
/// Subdirectory of the app data dir holding the rustypipe cache
/// (client versions, visitor data).
const RUSTYPIPE_SUBDIR: &str = "rustypipe";
/// Audio container we download; always importable (see AUDIO_FILE_EXTENSIONS).
const AUDIO_FORMAT: &str = "m4a";
/// Literal marker prefixed inside the yt-dlp progress template. The leading
/// `download:` selector is consumed by yt-dlp, so we tag our own lines.
const PROGRESS_MARKER: &str = "AGPROG:";

/// A resolved googlevideo stream: the URL plus the User-Agent to fetch it
/// with. yt-dlp URLs are served to a generic browser UA.
#[derive(Clone)]
pub struct StreamEntry {
    url: String,
    user_agent: String,
}

/// In-memory map of video id → resolved stream entry, populated by `yt_resolve`
/// and consumed by the `ytstream://` proxy so seeks reuse a single resolution.
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

/// The user-configured network proxy URL (`scheme://[user:pass@]host:port`),
/// pushed from the frontend via `set_proxy`. Threaded into the yt-dlp sidecar
/// (`--proxy`), the rustypipe search client and the `ytstream://` streaming
/// client so all YouTube traffic shares one proxy. `None` means "direct".
#[derive(Default)]
pub struct ProxyState(Mutex<Option<String>>);

impl ProxyState {
    fn set(&self, url: Option<String>) {
        if let Ok(mut guard) = self.0.lock() {
            *guard = url;
        }
    }

    fn get(&self) -> Option<String> {
        self.0.lock().ok().and_then(|guard| guard.clone())
    }
}

/// Lazily built RustyPipe (Innertube) client, used for **search only**.
#[derive(Default)]
pub struct YtClient(tokio::sync::Mutex<YtClientInner>);

#[derive(Default)]
struct YtClientInner {
    client: Option<RustyPipe>,
    /// Proxy URL the current client was built with; a change forces a rebuild.
    proxy: Option<String>,
}

impl YtClient {
    async fn reset(&self) {
        self.0.lock().await.client = None;
    }
}

/// Returns the shared RustyPipe client, (re)building it when the proxy changed.
/// Fully anonymous — no cookies, no login, no botguard: only metadata
/// endpoints (search, video details) are used, which YouTube does not gate.
async fn yt_client<R: Runtime>(app: &AppHandle<R>) -> Result<RustyPipe, String> {
    let proxy = app.state::<ProxyState>().get();
    let state = app.state::<YtClient>();
    let mut inner = state.0.lock().await;

    if inner.client.is_none() || inner.proxy != proxy {
        let storage_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join(RUSTYPIPE_SUBDIR);
        std::fs::create_dir_all(&storage_dir).map_err(|e| e.to_string())?;

        let mut http = reqwest::Client::builder();
        if let Some(url) = &proxy {
            http = http.proxy(reqwest::Proxy::all(url).map_err(|e| e.to_string())?);
        }

        let client = RustyPipe::builder()
            .storage_dir(storage_dir)
            .build_with_client(http)
            .map_err(|e| e.to_string())?;
        // The rustypipe cache persists auth cookies set by older app versions;
        // scrub them so every request stays anonymous.
        let _ = client.user_auth_remove_cookie().await;
        inner.client = Some(client);
        inner.proxy = proxy;
    }

    Ok(inner.client.clone().expect("client built above"))
}

/// Stores the proxy URL for later YouTube/stream use. An empty/blank URL clears it.
#[tauri::command]
pub async fn set_proxy<R: Runtime>(app: AppHandle<R>, url: Option<String>) {
    let normalized = url
        .map(|u| u.trim().to_owned())
        .filter(|u| !u.is_empty());
    app.state::<ProxyState>().set(normalized);
    // Drop the cached Innertube client so the next query picks up the new proxy.
    app.state::<YtClient>().reset().await;
}

/// Verifies the proxy actually connects by fetching a lightweight endpoint
/// through it. Returns the round-trip latency in milliseconds on success.
#[tauri::command]
pub async fn proxy_check(url: String) -> Result<u64, String> {
    let url = url.trim().to_owned();
    if url.is_empty() {
        return Err("empty proxy url".into());
    }

    let proxy = reqwest::Proxy::all(&url).map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder()
        .proxy(proxy)
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let started = std::time::Instant::now();
    let response = client
        .get("https://www.youtube.com/generate_204")
        .header(reqwest::header::USER_AGENT, "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status().as_u16();
    if !(200..=399).contains(&status) {
        return Err(format!("proxy responded with status {status}"));
    }

    Ok(started.elapsed().as_millis() as u64)
}

/// Builds the yt-dlp `--proxy` args from the shared proxy state, or empty when unset.
fn proxy_args<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
    match app.state::<ProxyState>().get() {
        Some(url) if !url.is_empty() => vec!["--proxy".into(), url],
        _ => Vec::new(),
    }
}

/// Plain reqwest client honoring the shared proxy state; used for cover fetches.
fn http_client<R: Runtime>(app: &AppHandle<R>) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder();
    if let Some(url) = app.state::<ProxyState>().get() {
        builder = builder.proxy(reqwest::Proxy::all(&url).map_err(|e| e.to_string())?);
    }
    builder.build().map_err(|e| e.to_string())
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtSearchResult {
    id: String,
    title: String,
    uploader: Option<String>,
    duration: Option<f64>,
    thumbnail: Option<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtDownloadResult {
    /// Absolute path to the downloaded audio file, ready for the import pipeline.
    path: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "data")]
pub enum YtDownloadEvent {
    Progress { downloaded: u64, total: Option<u64> },
    Processing,
}

#[tauri::command]
pub async fn yt_search<R: Runtime>(
    app: AppHandle<R>,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<YtSearchResult>, String> {
    let query = query.trim().to_owned();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let limit = limit.unwrap_or(20).clamp(1, 50) as usize;

    let rp = yt_client(&app).await?;
    let result = rp
        .query()
        .search::<VideoItem, _>(&query)
        .await
        .map_err(|e| format!("YouTube search failed: {e}"))?;

    Ok(result
        .items
        .items
        .into_iter()
        .take(limit)
        .map(to_search_result)
        .collect())
}

fn to_search_result(item: VideoItem) -> YtSearchResult {
    YtSearchResult {
        thumbnail: best_thumbnail(&item.thumbnail),
        id: item.id,
        title: item.name,
        uploader: item.channel.map(|c| c.name),
        duration: item.duration.map(f64::from),
    }
}

fn best_thumbnail(thumbnails: &[Thumbnail]) -> Option<String> {
    thumbnails
        .iter()
        .max_by_key(|t| t.width)
        .map(|t| t.url.clone())
}

fn validate_id(id: String) -> Result<String, String> {
    let id = id.trim().to_owned();
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("invalid video id".into());
    }
    Ok(id)
}

/// Resolves the best audio stream URL via the yt-dlp sidecar and caches it
/// for the `ytstream://` proxy.
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
) -> Result<String, String> {
    let id = validate_id(id)?;

    // Cache under the id; the frontend plays `ytstream://localhost/<id>`, which the
    // proxy resolves back to this URL (avoids re-running yt-dlp on every seek).
    resolve_stream(&app, &id).await?;
    Ok(id)
}

#[tauri::command]
pub async fn yt_download<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    on_progress: Channel<YtDownloadEvent>,
) -> Result<YtDownloadResult, String> {
    let id = validate_id(id)?;

    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(DOWNLOAD_SUBDIR);
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;

    let output_template = cache_dir.join("%(id)s.%(ext)s");
    let url = format!("https://www.youtube.com/watch?v={id}");

    // No `--extract-audio`/`--embed-*`: the m4a stream is downloaded as-is
    // (no ffmpeg in the bundle) and tagged in-process with lofty below.
    let mut args: Vec<String> = vec![
        url,
        "-f".into(),
        format!("bestaudio[ext={AUDIO_FORMAT}]"),
        "--no-playlist".into(),
        "--no-warnings".into(),
        "--newline".into(),
        "--progress-template".into(),
        format!("download:{PROGRESS_MARKER}%(progress.downloaded_bytes)s/%(progress.total_bytes)s/%(progress.total_bytes_estimate)s"),
        "-o".into(),
        output_template.to_string_lossy().into_owned(),
    ];
    args.extend(proxy_args(&app));

    let (mut rx, _child) = app
        .shell()
        .sidecar(SIDECAR_YTDLP)
        .map_err(|e| e.to_string())?
        .args(args)
        .spawn()
        .map_err(|e| e.to_string())?;

    let mut last_error = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                for line in text.lines() {
                    let line = line.trim();
                    if let Some(rest) = line.strip_prefix(PROGRESS_MARKER) {
                        if let Some((downloaded, total)) = parse_progress(rest) {
                            let _ = on_progress.send(YtDownloadEvent::Progress { downloaded, total });
                        }
                    } else if line.starts_with("ERROR") {
                        last_error = line.to_owned();
                    }
                }
            }
            CommandEvent::Terminated(payload) => {
                if payload.code != Some(0) {
                    let detail = if last_error.is_empty() {
                        format!("yt-dlp exited with code {:?}", payload.code)
                    } else {
                        last_error.clone()
                    };
                    return Err(detail);
                }
            }
            _ => {}
        }
    }

    let path = cache_dir.join(format!("{id}.{AUDIO_FORMAT}"));
    if !path.exists() {
        return Err("download finished but the output file was not found".into());
    }

    let _ = on_progress.send(YtDownloadEvent::Processing);

    // Tag parity with the old `--embed-metadata --embed-thumbnail`: title,
    // artist and cover art let the import pipeline pick up proper metadata.
    // Best-effort — a tagging failure must not lose the finished download.
    if let Err(e) = embed_metadata(&app, &path, &id).await {
        log::warn!("failed to embed metadata into {id}.{AUDIO_FORMAT}: {e}");
    }

    Ok(YtDownloadResult {
        path: path.to_string_lossy().into_owned(),
    })
}

/// Parses a `downloaded/total/estimate` progress line. yt-dlp emits `NA` for
/// unknown fields, which fails to parse and is treated as absent.
fn parse_progress(rest: &str) -> Option<(u64, Option<u64>)> {
    let mut parts = rest.split('/');
    let downloaded = parts.next()?.trim().parse::<u64>().ok()?;
    let total = parts.next().and_then(|s| s.trim().parse::<u64>().ok());
    let estimate = parts.next().and_then(|s| s.trim().parse::<u64>().ok());
    Some((downloaded, total.or(estimate)))
}

/// Writes title/artist/cover into the downloaded m4a (MP4 ilst atoms).
/// Metadata comes from rustypipe (`video_details` is not stream-gated);
/// the cover is fetched from i.ytimg.com.
async fn embed_metadata<R: Runtime>(
    app: &AppHandle<R>,
    path: &std::path::Path,
    id: &str,
) -> Result<(), String> {
    let mut tag = Tag::new(TagType::Mp4Ilst);

    match yt_client(app).await {
        Ok(rp) => match rp.query().video_details(id).await {
            Ok(details) => {
                // Album = track title ("single" convention). The library's data
                // model attaches covers to ALBUMS only (CoverOwnerType has no
                // "track"), so without an album tag the importer drops the
                // embedded artwork and the track shows without a cover.
                tag.set_album(details.name.clone());
                tag.set_title(details.name);
                tag.set_artist(details.channel.name);
            }
            Err(e) => {
                log::warn!("video_details for {id} failed, tagging with id only: {e}");
                tag.set_title(id.to_owned());
                tag.set_album(id.to_owned());
            }
        },
        Err(e) => {
            log::warn!("rustypipe client unavailable, tagging with id only: {e}");
            tag.set_title(id.to_owned());
            tag.set_album(id.to_owned());
        }
    }

    if let Ok(http) = http_client(app) {
        match fetch_cover(&http, id).await {
            Some(jpeg) => tag.push_picture(
                Picture::unchecked(jpeg)
                    .pic_type(PictureType::CoverFront)
                    .mime_type(MimeType::Jpeg)
                    .build(),
            ),
            None => log::warn!("no cover fetched for {id}; track will be tagged without artwork"),
        }
    }

    let path = path.to_path_buf();
    tokio::task::spawn_blocking(move || tag.save_to_path(&path, WriteOptions::default()))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Fetches the video cover as JPEG (MP4 covers only allow JPEG/PNG).
async fn fetch_cover(http: &reqwest::Client, id: &str) -> Option<Vec<u8>> {
    for name in ["maxresdefault", "hqdefault"] {
        let url = format!("https://i.ytimg.com/vi/{id}/{name}.jpg");
        let Ok(response) = http.get(&url).send().await else {
            continue;
        };
        if !response.status().is_success() {
            continue;
        }
        if let Ok(bytes) = response.bytes().await {
            return Some(bytes.to_vec());
        }
    }
    None
}

/// Serves a cached YouTube audio stream over the `ytstream://` scheme. Proxies
/// googlevideo server-side (bypassing the webview's CORS block) and adds
/// `Access-Control-Allow-Origin: *` so the crossOrigin media element keeps
/// Web Audio EQ/analyser/normalization. Range headers are forwarded for seeking.
pub fn serve_stream<R: Runtime>(
    ctx: tauri::UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let id = request.uri().path().trim_start_matches('/').to_owned();
    let range = request
        .headers()
        .get(tauri::http::header::RANGE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let app = ctx.app_handle().clone();

    tauri::async_runtime::spawn(async move {
        let response = stream_with_retry(&app, &id, range)
            .await
            .unwrap_or_else(|_| status_response(502));
        responder.respond(response);
    });
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
    let proxy = app.state::<ProxyState>().get();

    if let Some(entry) = app.state::<YtStreamCache>().get(id) {
        let response = fetch_stream(&entry.url, &entry.user_agent, range.clone(), proxy.clone()).await?;
        if response.status() != tauri::http::StatusCode::FORBIDDEN {
            return Ok(response);
        }
        log::warn!("ytstream {id}: upstream returned 403, re-resolving stream URL");
    }

    let entry = resolve_stream(app, id).await.map_err(|e| {
        log::warn!("ytstream {id}: re-resolve failed: {e}");
        e
    })?;
    fetch_stream(&entry.url, &entry.user_agent, range, proxy).await
}

async fn fetch_stream(
    url: &str,
    user_agent: &str,
    range: Option<String>,
    proxy: Option<String>,
) -> Result<tauri::http::Response<Vec<u8>>, String> {
    let mut builder = reqwest::Client::builder();
    if let Some(url) = proxy.as_deref().filter(|p| !p.is_empty()) {
        if let Ok(proxy) = reqwest::Proxy::all(url) {
            builder = builder.proxy(proxy);
        }
    }
    let client = builder.build().map_err(|e| e.to_string())?;
    let mut req = client
        .get(url)
        .header(reqwest::header::USER_AGENT, user_agent);
    if let Some(range) = &range {
        req = req.header(reqwest::header::RANGE, range);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let headers = resp.headers().clone();
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();

    let content_type = headers
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("audio/mp4")
        .to_owned();

    let mut builder = tauri::http::Response::builder()
        .status(status)
        .header("Access-Control-Allow-Origin", "*")
        .header("Content-Type", content_type)
        .header("Accept-Ranges", "bytes");

    if let Some(cr) = headers
        .get(reqwest::header::CONTENT_RANGE)
        .and_then(|v| v.to_str().ok())
    {
        builder = builder.header("Content-Range", cr.to_owned());
    }

    builder.body(bytes).map_err(|e| e.to_string())
}

fn status_response(code: u16) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(code)
        .header("Access-Control-Allow-Origin", "*")
        .body(Vec::new())
        .unwrap_or_default()
}

/// Hosts the `ytimg://` scheme may fetch from (video thumbnails, channel art).
fn is_allowed_image_host(host: &str) -> bool {
    host == "ytimg.com" || host.ends_with(".ytimg.com") || host == "yt3.ggpht.com"
}

/// Serves YouTube cover art over the `ytimg://` scheme. `<img>` loads in the
/// webview bypass the app proxy (it only covers the Rust-side clients), so on
/// a network where YouTube is blocked thumbnails never render; this routes
/// them through the shared proxy state instead. The original https URL arrives
/// percent-encoded as the request path (built by `proxiedThumbnail` on the
/// frontend via `convertFileSrc`).
pub fn serve_image<R: Runtime>(
    ctx: tauri::UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let encoded = request.uri().path().trim_start_matches('/').to_owned();
    let app = ctx.app_handle().clone();

    tauri::async_runtime::spawn(async move {
        let response = fetch_image(&app, &encoded).await.unwrap_or_else(|e| {
            log::warn!("ytimg: {e}");
            status_response(502)
        });
        responder.respond(response);
    });
}

async fn fetch_image<R: Runtime>(
    app: &AppHandle<R>,
    encoded: &str,
) -> Result<tauri::http::Response<Vec<u8>>, String> {
    let url = percent_encoding::percent_decode_str(encoded)
        .decode_utf8()
        .map_err(|e| format!("bad encoding: {e}"))?;
    let parsed = tauri::Url::parse(&url).map_err(|e| format!("bad url: {e}"))?;

    if parsed.scheme() != "https" || !parsed.host_str().is_some_and(is_allowed_image_host) {
        return Ok(status_response(403));
    }

    let resp = http_client(app)?
        .get(parsed.as_str())
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status().as_u16();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_owned();
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();

    tauri::http::Response::builder()
        .status(status)
        .header("Access-Control-Allow-Origin", "*")
        .header("Content-Type", content_type)
        .header("Cache-Control", "public, max-age=86400")
        .body(bytes)
        .map_err(|e| e.to_string())
}
