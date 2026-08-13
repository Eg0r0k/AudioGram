//! Navidrome (Subsonic) configuration state and the nd routes of the
//! `stream://` proxy.
//!
//! The frontend derives `{token, salt}` from the password once per config
//! change (`nd_set_config`); the raw password never reaches Rust and the
//! token never appears in media-element URLs, DevTools or logs — upstream
//! URLs are built here and never logged.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, RwLock};

use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde::Deserialize;
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
