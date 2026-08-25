//! Whole-track prefetch cache and the `/{token}/nd/song/…` route of the
//! loopback media server.

use std::ops::Deref;

use tauri::{AppHandle, Manager, Runtime};

use super::config::NdState;
use crate::audio_cache::{AudioCache, CachedAudio};

/// Raw FLAC can be large, so the ND cache is small and per-track capped.
const MAX_PREFETCHED_ND_TRACKS: usize = 2;
const MAX_PREFETCHED_ND_BYTES: usize = 128 * 1024 * 1024;

/// The ND instance of [`AudioCache`] — a newtype because tauri manages
/// state by type, and the yt path has its own.
pub(crate) struct NdAudioCache(AudioCache);

impl Default for NdAudioCache {
    fn default() -> Self {
        Self(AudioCache::new(
            MAX_PREFETCHED_ND_TRACKS,
            MAX_PREFETCHED_ND_BYTES,
        ))
    }
}

impl Deref for NdAudioCache {
    type Target = AudioCache;

    fn deref(&self) -> &AudioCache {
        &self.0
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

    if let Some(CachedAudio {
        content_type,
        bytes,
    }) = cache.get(song_id)
    {
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
    use bytes::Bytes;
    use http_body_util::BodyExt;

    fn test_config(base_url: String) -> super::super::config::NdConfig {
        super::super::config::NdConfig {
            base_url,
            username: "u".into(),
            token: "t".into(),
            salt: "s".into(),
        }
    }

    fn direct() -> reqwest::Client {
        reqwest::Client::new()
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
}
