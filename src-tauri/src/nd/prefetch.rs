//! Whole-track prefetch cache and the `/{token}/nd/song/…` route of the
//! loopback media server.

use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;

use bytes::Bytes;
use tauri::{AppHandle, Manager, Runtime};

use super::config::NdState;

/// Whole prefetched ND tracks, keyed by song id — the counterpart of the YT
/// prefetch cache: `nd_prefetch` fills it for the next queue entry while the
/// current track plays, and `stream_song` answers range requests from memory
/// so the next track starts instantly. Raw FLAC can be large, so the cache
/// is small and per-track capped.
const MAX_PREFETCHED_ND_TRACKS: usize = 2;
const MAX_PREFETCHED_ND_BYTES: usize = 128 * 1024 * 1024;

/// `(content type, audio)` — `Bytes` so a cache hit and every Range slice
/// served from it are refcounted views, never copies.
type CachedTrack = (String, Bytes);

#[derive(Default)]
pub struct NdAudioCache {
    entries: Mutex<(HashMap<String, CachedTrack>, VecDeque<String>)>,
}

impl NdAudioCache {
    fn get(&self, id: &str) -> Option<CachedTrack> {
        let entries = self.entries.lock().ok()?;
        entries.0.get(id).cloned()
    }

    fn contains(&self, id: &str) -> bool {
        self.entries
            .lock()
            .map(|entries| entries.0.contains_key(id))
            .unwrap_or(false)
    }

    /// Returns false when the track is over the per-track cap and was NOT
    /// cached — the command must surface that instead of reporting success.
    /// `pub(crate)`: the media-server tests seed the cache directly.
    pub(crate) fn insert(&self, id: String, content_type: String, bytes: Bytes) -> bool {
        if bytes.len() > MAX_PREFETCHED_ND_BYTES {
            return false;
        }
        let Ok(mut entries) = self.entries.lock() else {
            return false;
        };
        let (map, order) = &mut *entries;
        if map.insert(id.clone(), (content_type, bytes)).is_none() {
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
pub async fn nd_prefetch<R: Runtime>(app: AppHandle<R>, song_id: String) -> Result<(), String> {
    if app.state::<NdAudioCache>().contains(&song_id) {
        return Ok(());
    }
    let Some(config) = app.state::<NdState>().get() else {
        return Err("nd source is not configured".into());
    };

    let url = config.rest_url("stream.view", &song_id, "&format=raw");
    let response = crate::proxy::http_client(&app)?
        .get(&url)
        .send()
        .await
        // reqwest errors can embed the URL (auth token) — never propagate it.
        .map_err(|e| format!("request failed: {}", e.without_url()))?;
    let status = response.status().as_u16();
    if status != 200 {
        return Err(format!("prefetch failed: upstream status {status}"));
    }

    // Refuse over-cap tracks BEFORE reading the body — a whole-file download
    // that insert() then drops would waste the bandwidth every retry.
    if let Some(len) = response.content_length() {
        if len > MAX_PREFETCHED_ND_BYTES as u64 {
            return Err(format!(
                "prefetch skipped: track is {len} bytes, over the cache cap"
            ));
        }
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("audio/mpeg")
        .to_owned();
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    if !app
        .state::<NdAudioCache>()
        .insert(song_id, content_type, bytes)
    {
        return Err("prefetch skipped: track exceeds the cache cap".into());
    }
    Ok(())
}

/// `/{token}/nd/song/<songId>` → `stream.view?format=raw` with Rust-built
/// auth. Served from the prefetch cache when warm (even unconfigured — the
/// bytes are already local), otherwise the upstream body streams through
/// untouched. Upstream 4xx/5xx becomes 502; logs carry only the song id.
pub(crate) async fn serve_song(
    config: Option<super::config::NdConfig>,
    cache: &NdAudioCache,
    client: &reqwest::Client,
    song_id: &str,
    range: Option<&str>,
    origin: Option<&str>,
) -> http::Response<crate::media_server::Body> {
    use crate::media_server::{forward_stream, memory_range_response, status_response};

    if let Some((content_type, bytes)) = cache.get(song_id) {
        return memory_range_response(&content_type, &bytes, range, origin);
    }

    let Some(config) = config else {
        return status_response(503, origin);
    };

    let url = config.rest_url("stream.view", song_id, "&format=raw");
    let response =
        match forward_stream(client, &url, &[], range.map(str::to_owned), None, origin).await {
            Ok(response) => response,
            Err(e) => {
                log::warn!("media nd/song/{song_id}: {e}");
                return status_response(502, origin);
            }
        };
    if response.status().as_u16() >= 400 {
        log::warn!(
            "media nd/song/{song_id}: upstream status {}",
            response.status()
        );
        return status_response(502, origin);
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use http_body_util::BodyExt;

    fn filled(cache: &NdAudioCache, id: &str, len: usize) -> bool {
        cache.insert(
            id.to_owned(),
            "audio/flac".into(),
            Bytes::from(vec![0u8; len]),
        )
    }

    fn direct() -> reqwest::Client {
        reqwest::Client::new()
    }

    fn test_config(base_url: String) -> super::super::config::NdConfig {
        super::super::config::NdConfig {
            base_url,
            username: "u".into(),
            token: "t".into(),
            salt: "s".into(),
        }
    }

    #[tokio::test]
    async fn serve_song_unconfigured_is_503() {
        let cache = NdAudioCache::default();

        let resp = serve_song(None, &cache, &direct(), "s1", None, None).await;

        assert_eq!(resp.status(), 503);
    }

    #[tokio::test]
    async fn serve_song_answers_ranges_from_the_prefetch_cache_before_any_network() {
        let cache = NdAudioCache::default();
        assert!(cache.insert(
            "s1".into(),
            "audio/flac".into(),
            Bytes::from_static(b"0123456789")
        ));

        // Config is None: a cache hit must never need the network.
        let resp = serve_song(None, &cache, &direct(), "s1", Some("bytes=4-"), None).await;

        assert_eq!(resp.status(), 206);
        assert_eq!(resp.headers()["Content-Type"], "audio/flac");
        assert_eq!(resp.headers()["Content-Range"], "bytes 4-9/10");
        let body = resp.into_body().collect().await.expect("body").to_bytes();
        assert_eq!(body.as_ref(), b"456789");
    }

    #[tokio::test]
    async fn serve_song_streams_the_upstream_body_through() {
        let upstream = crate::media_server::test_support::spawn_upstream(|req| {
            assert!(req.uri().path().starts_with("/rest/stream.view"));
            http::Response::builder()
                .status(200)
                .header("Content-Type", "audio/flac")
                .body(http_body_util::Full::new(bytes::Bytes::from_static(
                    b"flacbody",
                )))
                .expect("upstream response")
        })
        .await;
        let cache = NdAudioCache::default();

        let resp = serve_song(
            Some(test_config(upstream)),
            &cache,
            &direct(),
            "s1",
            None,
            None,
        )
        .await;

        assert_eq!(resp.status(), 200);
        assert_eq!(resp.headers()["Content-Type"], "audio/flac");
        let body = resp.into_body().collect().await.expect("body").to_bytes();
        assert_eq!(body.as_ref(), b"flacbody");
    }

    #[tokio::test]
    async fn serve_song_maps_upstream_errors_to_502() {
        let upstream = crate::media_server::test_support::spawn_upstream(|_req| {
            http::Response::builder()
                .status(404)
                .body(http_body_util::Full::new(bytes::Bytes::new()))
                .expect("upstream response")
        })
        .await;
        let cache = NdAudioCache::default();

        let resp = serve_song(
            Some(test_config(upstream)),
            &cache,
            &direct(),
            "s1",
            None,
            None,
        )
        .await;

        assert_eq!(resp.status(), 502);
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
