//! Navidrome (Subsonic) configuration state and the nd routes of the
//! `stream://` proxy.
//!
//! The frontend derives `{token, salt}` from the password once per config
//! change (`nd_set_config`); the raw password never reaches Rust and the
//! token never appears in media-element URLs, DevTools or logs — upstream
//! URLs are built here and never logged.

use std::collections::{HashMap, VecDeque};
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde::Deserialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime};

use crate::stream::{forward_get, range_response, status_response};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NdConfig {
    pub base_url: String,
    pub username: String,
    /// `md5(password + salt)` — precomputed on the JS side.
    pub token: String,
    pub salt: String,
}

impl NdConfig {
    fn auth_query(&self) -> String {
        format!(
            "u={}&t={}&s={}&v=1.16.1&c=audiogram&f=json",
            utf8_percent_encode(&self.username, NON_ALPHANUMERIC),
            utf8_percent_encode(&self.token, NON_ALPHANUMERIC),
            utf8_percent_encode(&self.salt, NON_ALPHANUMERIC),
        )
    }

    fn rest_url(&self, endpoint: &str, id: &str, extra: &str) -> String {
        let base = self.base_url.trim_end_matches('/');
        let id = utf8_percent_encode(id, NON_ALPHANUMERIC);
        let auth = self.auth_query();
        format!("{base}/rest/{endpoint}?id={id}{extra}&{auth}")
    }
}

#[derive(Default)]
pub struct NdState(RwLock<Option<NdConfig>>);

impl NdState {
    pub fn get(&self) -> Option<NdConfig> {
        self.0.read().ok().and_then(|guard| guard.clone())
    }
}

/// Replaces the stored Navidrome config (`None` disables the source).
/// Called on startup and whenever the source settings change.
#[tauri::command]
pub fn nd_set_config(
    state: tauri::State<'_, NdState>,
    config: Option<NdConfig>,
) -> Result<(), String> {
    let mut guard = state
        .0
        .write()
        .map_err(|_| "nd config lock poisoned".to_string())?;
    *guard = config;
    Ok(())
}

/// Whole prefetched ND tracks, keyed by song id — the counterpart of the YT
/// prefetch cache: `nd_prefetch` fills it for the next queue entry while the
/// current track plays, and `stream_song` answers range requests from memory
/// so the next track starts instantly. Raw FLAC can be large, so the cache
/// is small and per-track capped.
const MAX_PREFETCHED_ND_TRACKS: usize = 2;
const MAX_PREFETCHED_ND_BYTES: usize = 128 * 1024 * 1024;

#[derive(Default)]
pub struct NdAudioCache {
    entries: Mutex<(HashMap<String, (String, Arc<Vec<u8>>)>, VecDeque<String>)>,
}

impl NdAudioCache {
    fn get(&self, id: &str) -> Option<(String, Arc<Vec<u8>>)> {
        let entries = self.entries.lock().ok()?;
        entries
            .0
            .get(id)
            .map(|(content_type, bytes)| (content_type.clone(), Arc::clone(bytes)))
    }

    fn contains(&self, id: &str) -> bool {
        self.entries
            .lock()
            .map(|entries| entries.0.contains_key(id))
            .unwrap_or(false)
    }

    fn insert(&self, id: String, content_type: String, bytes: Vec<u8>) {
        if bytes.len() > MAX_PREFETCHED_ND_BYTES {
            return;
        }
        let Ok(mut entries) = self.entries.lock() else {
            return;
        };
        let (map, order) = &mut *entries;
        if map.insert(id.clone(), (content_type, Arc::new(bytes))).is_none() {
            order.push_back(id);
        }
        while map.len() > MAX_PREFETCHED_ND_TRACKS {
            let Some(oldest) = order.pop_front() else {
                break;
            };
            map.remove(&oldest);
        }
    }
}

/// Downloads the whole audio file for the next queue entry into the
/// in-memory cache. Called by the frontend while the current track plays.
#[tauri::command]
pub async fn nd_prefetch<R: Runtime>(
    app: AppHandle<R>,
    song_id: String,
) -> Result<(), String> {
    if app.state::<NdAudioCache>().contains(&song_id) {
        return Ok(());
    }
    let Some(config) = app.state::<NdState>().get() else {
        return Err("nd source is not configured".into());
    };

    let url = config.rest_url("stream.view", &song_id, "&format=raw");
    let response = forward_get(&url, None, None, None).await?;
    let status = response.status().as_u16();
    if status != 200 {
        return Err(format!("prefetch failed: upstream status {status}"));
    }

    let content_type = response
        .headers()
        .get("Content-Type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("audio/mpeg")
        .to_owned();
    app.state::<NdAudioCache>()
        .insert(song_id, content_type, response.body().clone());
    Ok(())
}

/// `stream://…/nd/song/<songId>` → `stream.view?format=raw` with Rust-built
/// auth, served from the prefetch cache when warm. Upstream 4xx/5xx becomes
/// 502; logs carry only the song id.
pub(crate) async fn stream_song<R: Runtime>(
    app: &AppHandle<R>,
    song_id: &str,
    range: Option<String>,
) -> Result<tauri::http::Response<Vec<u8>>, String> {
    if let Some((content_type, bytes)) = app.state::<NdAudioCache>().get(song_id) {
        return Ok(range_response(&content_type, &bytes, range.as_deref()));
    }

    let Some(config) = app.state::<NdState>().get() else {
        return Ok(status_response(503));
    };

    let url = config.rest_url("stream.view", song_id, "&format=raw");
    let response = forward_get(&url, None, range, None).await?;
    if response.status().as_u16() >= 400 {
        log::warn!("stream nd/song/{song_id}: upstream status {}", response.status());
        return Ok(status_response(502));
    }
    Ok(response)
}

/// Where `nd_download` writes before the JS side moves the finished file
/// into offline storage via `importFile`. Orphans (crashed downloads) are
/// swept by the download manager before its first job starts.
const DOWNLOAD_TMP_SUBDIR: &str = "downloads-tmp";

/// Progress emitted at most every this many bytes — chunks are tiny.
const PROGRESS_EMIT_STEP: u64 = 256 * 1024;

/// In-flight ND downloads by song id — cancellation flags consumed by
/// `nd_download_cancel`. The manager guarantees one active job per track, so
/// the song id is the natural key (job ids stay a JS concept).
#[derive(Default)]
pub struct NdDownloadRegistry(Mutex<HashMap<String, Arc<AtomicBool>>>);

impl NdDownloadRegistry {
    fn register(&self, id: &str) -> Result<Arc<AtomicBool>, String> {
        let mut map = self.0.lock().map_err(|_| "registry poisoned".to_string())?;
        if map.contains_key(id) {
            return Err("download already in progress".into());
        }
        let flag = Arc::new(AtomicBool::new(false));
        map.insert(id.to_owned(), Arc::clone(&flag));
        Ok(flag)
    }

    fn deregister(&self, id: &str) {
        if let Ok(mut map) = self.0.lock() {
            map.remove(id);
        }
    }

    fn cancel(&self, id: &str) -> bool {
        let Ok(map) = self.0.lock() else {
            return false;
        };
        match map.get(id) {
            Some(flag) => {
                flag.store(true, Ordering::SeqCst);
                true
            }
            None => false,
        }
    }
}

/// Same wire shape as `YtDownloadEvent` — the download manager is
/// source-agnostic over `{ type, data }` progress events.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "data")]
pub enum NdDownloadEvent {
    Progress { downloaded: u64, total: Option<u64> },
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NdDownloadResult {
    /// Absolute path of the finished temp file.
    pub path: String,
    /// Extension the file was written with (normalized lowercase).
    pub ext: String,
}

fn ext_from_content_type(content_type: &str) -> Option<&'static str> {
    match content_type.split(';').next().unwrap_or("").trim() {
        "audio/flac" | "audio/x-flac" => Some("flac"),
        "audio/mpeg" => Some("mp3"),
        "audio/mp4" | "audio/m4a" | "audio/x-m4a" => Some("m4a"),
        "audio/ogg" | "application/ogg" => Some("ogg"),
        "audio/opus" => Some("opus"),
        "audio/wav" | "audio/x-wav" => Some("wav"),
        "audio/aac" => Some("aac"),
        _ => None,
    }
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn normalized_suffix(suffix: Option<&str>) -> Option<String> {
    let s = suffix?.trim().to_ascii_lowercase();
    if s.is_empty() || s.len() > 8 || !s.chars().all(|c| c.is_ascii_alphanumeric()) {
        return None;
    }
    Some(s)
}

/// Downloads the whole original file (`stream.view?format=raw`) into
/// `downloads-tmp/<songId>.<ext>`, streaming progress over the channel.
/// Cancellation is polled between chunks; a cancelled download removes its
/// partial file and errors with "cancelled". Logs carry only the song id.
#[tauri::command]
pub async fn nd_download<R: Runtime>(
    app: AppHandle<R>,
    song_id: String,
    suffix: Option<String>,
    on_progress: Channel<NdDownloadEvent>,
) -> Result<NdDownloadResult, String> {
    if !valid_id(&song_id) {
        return Err("invalid song id".into());
    }
    let Some(config) = app.state::<NdState>().get() else {
        return Err("nd source is not configured".into());
    };

    let cancelled = app.state::<NdDownloadRegistry>().register(&song_id)?;
    let result = download_to_tmp(&app, &config, &song_id, suffix, &on_progress, &cancelled).await;
    app.state::<NdDownloadRegistry>().deregister(&song_id);

    match &result {
        Ok(_) => log::info!("nd_download {song_id}: done"),
        Err(e) => log::info!("nd_download {song_id}: {e}"),
    }
    result
}

async fn download_to_tmp<R: Runtime>(
    app: &AppHandle<R>,
    config: &NdConfig,
    song_id: &str,
    suffix: Option<String>,
    on_progress: &Channel<NdDownloadEvent>,
    cancelled: &AtomicBool,
) -> Result<NdDownloadResult, String> {
    let url = config.rest_url("stream.view", song_id, "&format=raw");
    let client = reqwest::Client::new();
    let mut resp = client.get(&url).send().await.map_err(|e| {
        // reqwest errors can embed the URL (auth token) — never propagate it.
        format!("request failed: {}", e.without_url())
    })?;

    let status = resp.status().as_u16();
    if status != 200 {
        return Err(format!("upstream status {status}"));
    }

    let ext = normalized_suffix(suffix.as_deref())
        .or_else(|| {
            resp.headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .and_then(ext_from_content_type)
                .map(str::to_owned)
        })
        .unwrap_or_else(|| "bin".to_owned());
    let total = resp.content_length();

    let tmp_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(DOWNLOAD_TMP_SUBDIR);
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let path = tmp_dir.join(format!("{song_id}.{ext}"));

    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut last_emitted: u64 = 0;

    loop {
        if cancelled.load(Ordering::SeqCst) {
            drop(file);
            let _ = std::fs::remove_file(&path);
            return Err("cancelled".into());
        }
        let chunk = match resp.chunk().await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(e) => {
                drop(file);
                let _ = std::fs::remove_file(&path);
                return Err(format!("download failed: {}", e.without_url()));
            }
        };
        if let Err(e) = file.write_all(&chunk) {
            drop(file);
            let _ = std::fs::remove_file(&path);
            return Err(e.to_string());
        }
        downloaded += chunk.len() as u64;
        if downloaded - last_emitted >= PROGRESS_EMIT_STEP {
            last_emitted = downloaded;
            let _ = on_progress.send(NdDownloadEvent::Progress { downloaded, total });
        }
    }

    file.flush().map_err(|e| e.to_string())?;
    let _ = on_progress.send(NdDownloadEvent::Progress {
        downloaded,
        total: Some(downloaded),
    });
    Ok(NdDownloadResult {
        path: path.to_string_lossy().into_owned(),
        ext,
    })
}

/// Flags the in-flight download as cancelled; the download loop notices
/// between chunks. Idempotent — cancelling a finished download is a no-op.
#[tauri::command]
pub fn nd_download_cancel<R: Runtime>(app: AppHandle<R>, song_id: String) -> Result<(), String> {
    if !app.state::<NdDownloadRegistry>().cancel(&song_id) {
        log::info!("nd_download_cancel {song_id}: not in flight");
    }
    Ok(())
}

/// WebView2 does not put custom-scheme responses into its HTTP cache (same
/// story as the `ytimg://` thumbnails), so every `<img>` remount would
/// re-fetch the cover from the server and replay the load animation. Keep
/// the bytes in memory instead. Keyed by `coverId?size` — no auth material.
const MAX_CACHED_COVERS: usize = 256;
const MAX_CACHEABLE_COVER_BYTES: usize = 1024 * 1024;

#[derive(Default)]
pub struct NdCoverCache {
    entries: Mutex<(HashMap<String, (String, Vec<u8>)>, VecDeque<String>)>,
}

impl NdCoverCache {
    fn get(&self, key: &str) -> Option<(String, Vec<u8>)> {
        let entries = self.entries.lock().ok()?;
        entries.0.get(key).cloned()
    }

    fn insert(&self, key: String, content_type: String, bytes: Vec<u8>) {
        if bytes.len() > MAX_CACHEABLE_COVER_BYTES {
            return;
        }
        let Ok(mut entries) = self.entries.lock() else {
            return;
        };
        let (map, order) = &mut *entries;
        if map.insert(key.clone(), (content_type, bytes)).is_none() {
            order.push_back(key);
        }
        while map.len() > MAX_CACHED_COVERS {
            let Some(oldest) = order.pop_front() else {
                break;
            };
            map.remove(&oldest);
        }
    }
}

fn cover_response(content_type: &str, bytes: Vec<u8>) -> Result<tauri::http::Response<Vec<u8>>, String> {
    tauri::http::Response::builder()
        .status(200)
        .header("Access-Control-Allow-Origin", "*")
        .header("Content-Type", content_type)
        .header("Cache-Control", "public, max-age=86400")
        .body(bytes)
        .map_err(|e| e.to_string())
}

/// `stream://…/nd/cover/<coverId>?size=<px>` → `getCoverArt.view`. Proxied so
/// the canvas stays untainted for palette extraction; served from the
/// in-memory cache after the first fetch.
pub(crate) async fn fetch_cover<R: Runtime>(
    app: &AppHandle<R>,
    cover_id: &str,
    query: Option<&str>,
) -> Result<tauri::http::Response<Vec<u8>>, String> {
    let size = query
        .and_then(|q| q.split('&').find_map(|pair| pair.strip_prefix("size=")))
        .filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()))
        .map(|s| format!("&size={s}"))
        .unwrap_or_default();

    let cache_key = format!("{cover_id}{size}");
    if let Some((content_type, bytes)) = app.state::<NdCoverCache>().get(&cache_key) {
        return cover_response(&content_type, bytes);
    }

    let Some(config) = app.state::<NdState>().get() else {
        return Ok(status_response(503));
    };

    let url = config.rest_url("getCoverArt.view", cover_id, &size);
    let response = forward_get(&url, None, None, None).await?;
    if response.status().as_u16() >= 400 {
        log::warn!("stream nd/cover/{cover_id}: upstream status {}", response.status());
        return Ok(status_response(502));
    }

    if response.status().as_u16() == 200 {
        let content_type = response
            .headers()
            .get("Content-Type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("image/jpeg")
            .to_owned();
        app.state::<NdCoverCache>()
            .insert(cache_key, content_type, response.body().clone());
    }
    Ok(response)
}
