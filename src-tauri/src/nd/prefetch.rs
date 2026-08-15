//! Whole-track prefetch cache and the `stream://…/nd/song/…` route.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager, Runtime};

use super::config::NdState;
use crate::stream::{forward_get, range_response, status_response};

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
