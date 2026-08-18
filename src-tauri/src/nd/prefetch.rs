//! Whole-track prefetch cache and the `stream://…/nd/song/…` route.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager, Runtime};

use super::config::NdState;
use crate::stream::{forward_get, range_response, status_response, DEFAULT_RANGE_SPAN};

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

    /// Returns false when the track is over the per-track cap and was NOT
    /// cached — the command must surface that instead of reporting success.
    fn insert(&self, id: String, content_type: String, bytes: Vec<u8>) -> bool {
        if bytes.len() > MAX_PREFETCHED_ND_BYTES {
            return false;
        }
        let Ok(mut entries) = self.entries.lock() else {
            return false;
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
        true
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
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    if status != 200 {
        return Err(format!("prefetch failed: upstream status {status}"));
    }

    // Refuse over-cap tracks BEFORE reading the body — a whole-file download
    // that insert() then drops would waste the bandwidth every retry.
    if let Some(len) = response.content_length() {
        if len as usize > MAX_PREFETCHED_ND_BYTES {
            return Err(format!("prefetch skipped: track is {len} bytes, over the cache cap"));
        }
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("audio/mpeg")
        .to_owned();
    let bytes = response.bytes().await.map_err(|e| e.to_string())?.to_vec();

    if !app.state::<NdAudioCache>().insert(song_id, content_type, bytes) {
        return Err("prefetch skipped: track exceeds the cache cap".into());
    }
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
    let response = forward_get(&url, &[], range, None, DEFAULT_RANGE_SPAN).await?;
    if response.status().as_u16() >= 400 {
        log::warn!("stream nd/song/{song_id}: upstream status {}", response.status());
        return Ok(status_response(502));
    }
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn filled(cache: &NdAudioCache, id: &str, len: usize) -> bool {
        cache.insert(id.to_owned(), "audio/flac".into(), vec![0u8; len])
    }

    #[test]
    fn insert_and_get_round_trip() {
        let cache = NdAudioCache::default();
        assert!(filled(&cache, "s1", 16));

        let (content_type, bytes) = cache.get("s1").expect("cached entry");
        assert_eq!(content_type, "audio/flac");
        assert_eq!(bytes.len(), 16);
        assert!(cache.contains("s1"));
        assert!(!cache.contains("s2"));
    }

    #[test]
    fn insert_rejects_tracks_over_the_per_track_cap() {
        let cache = NdAudioCache::default();
        assert!(!filled(&cache, "big", MAX_PREFETCHED_ND_BYTES + 1));
        assert!(!cache.contains("big"));
    }

    #[test]
    fn insert_evicts_the_oldest_entry_beyond_the_track_cap() {
        let cache = NdAudioCache::default();
        assert!(filled(&cache, "s1", 8));
        assert!(filled(&cache, "s2", 8));
        assert!(filled(&cache, "s3", 8));

        assert!(!cache.contains("s1"));
        assert!(cache.contains("s2"));
        assert!(cache.contains("s3"));
    }

    #[test]
    fn reinserting_an_id_does_not_evict_others() {
        let cache = NdAudioCache::default();
        assert!(filled(&cache, "s1", 8));
        assert!(filled(&cache, "s2", 8));
        assert!(filled(&cache, "s2", 24));

        assert!(cache.contains("s1"));
        assert_eq!(cache.get("s2").expect("updated entry").1.len(), 24);
    }
}
