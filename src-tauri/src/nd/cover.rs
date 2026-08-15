//! Cover proxy and its in-memory cache: the `stream://…/nd/cover/…` route.

use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime};

use super::config::NdState;
use crate::stream::{forward_get, status_response};

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
