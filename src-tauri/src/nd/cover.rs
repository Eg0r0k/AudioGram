//! Cover proxy and its in-memory cache: the `/{token}/nd/cover/…` route of
//! the loopback media server.

use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;

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

/// `/{token}/nd/cover/<coverId>?size=<px>` → `getCoverArt.view`. Proxied so
/// the canvas stays untainted for palette extraction; served from the
/// in-memory cache after the first fetch. Deliberately buffered (covers are
/// ≤1 MiB-cacheable) — streaming would bypass the cache.
pub(crate) async fn serve_cover(
    config: Option<super::config::NdConfig>,
    cache: &NdCoverCache,
    proxy: Option<String>,
    cover_id: &str,
    query: Option<&str>,
    origin: Option<&str>,
) -> http::Response<crate::media_server::Body> {
    use crate::media_server::{proxied_client, status_response};

    let size = query
        .and_then(|q| q.split('&').find_map(|pair| pair.strip_prefix("size=")))
        .filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()))
        .map(|s| format!("&size={s}"))
        .unwrap_or_default();

    let cache_key = format!("{cover_id}{size}");
    if let Some((content_type, bytes)) = cache.get(&cache_key) {
        return cover_ok(&content_type, bytes, origin);
    }

    let Some(config) = config else {
        return status_response(503, origin);
    };

    let url = config.rest_url("getCoverArt.view", cover_id, &size);
    let client = match proxied_client(proxy) {
        Ok(client) => client,
        Err(e) => {
            log::warn!("media nd/cover/{cover_id}: client: {e}");
            return status_response(502, origin);
        }
    };
    let response = match client.get(&url).send().await {
        Ok(response) => response,
        Err(e) => {
            // reqwest errors can embed the URL (auth token) — never log it.
            log::warn!("media nd/cover/{cover_id}: request failed: {}", e.without_url());
            return status_response(502, origin);
        }
    };
    if response.status().as_u16() != 200 {
        log::warn!("media nd/cover/{cover_id}: upstream status {}", response.status());
        return status_response(502, origin);
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_owned();
    let bytes = match response.bytes().await {
        Ok(bytes) => bytes.to_vec(),
        Err(e) => {
            log::warn!("media nd/cover/{cover_id}: body failed: {}", e.without_url());
            return status_response(502, origin);
        }
    };

    cache.insert(cache_key, content_type.clone(), bytes.clone());
    cover_ok(&content_type, bytes, origin)
}

/// Covers are cacheable, unlike tokenized audio: the browser may keep them
/// for a day, which kills the `<img>` remount re-fetch flicker.
fn cover_ok(
    content_type: &str,
    bytes: Vec<u8>,
    origin: Option<&str>,
) -> http::Response<crate::media_server::Body> {
    crate::media_server::cors(http::Response::builder().status(200), origin)
        .header("Content-Type", content_type)
        .header("Cache-Control", "public, max-age=86400")
        .body(crate::media_server::full_body(bytes::Bytes::from(bytes)))
        .unwrap_or_else(|_| crate::media_server::status_response(500, origin))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use http_body_util::BodyExt;

    fn test_config(base_url: String) -> super::super::config::NdConfig {
        super::super::config::NdConfig {
            base_url,
            username: "u".into(),
            token: "t".into(),
            salt: "s".into(),
        }
    }

    #[tokio::test]
    async fn serve_cover_unconfigured_is_503() {
        let cache = NdCoverCache::default();

        let resp = serve_cover(None, &cache, None, "c1", None, None).await;

        assert_eq!(resp.status(), 503);
    }

    #[tokio::test]
    async fn serve_cover_fetches_once_passes_size_and_replays_from_cache() {
        let hits = Arc::new(AtomicUsize::new(0));
        let seen_hits = Arc::clone(&hits);
        let upstream = crate::media_server::test_support::spawn_upstream(move |req| {
            seen_hits.fetch_add(1, Ordering::SeqCst);
            assert!(req.uri().path().starts_with("/rest/getCoverArt.view"));
            assert!(
                req.uri().query().unwrap_or_default().contains("size=300"),
                "size query must reach the upstream"
            );
            http::Response::builder()
                .status(200)
                .header("Content-Type", "image/png")
                .body(http_body_util::Full::new(bytes::Bytes::from_static(b"img")))
                .expect("upstream response")
        })
        .await;
        let cache = NdCoverCache::default();
        let config = test_config(upstream);

        let first = serve_cover(Some(config.clone()), &cache, None, "c1", Some("size=300"), None).await;
        assert_eq!(first.status(), 200);
        assert_eq!(first.headers()["Content-Type"], "image/png");
        assert_eq!(first.headers()["Cache-Control"], "public, max-age=86400");
        let body = first.into_body().collect().await.expect("body").to_bytes();
        assert_eq!(body.as_ref(), b"img");

        let second = serve_cover(Some(config), &cache, None, "c1", Some("size=300"), None).await;
        assert_eq!(second.status(), 200);
        let body = second.into_body().collect().await.expect("body").to_bytes();
        assert_eq!(body.as_ref(), b"img");

        assert_eq!(hits.load(Ordering::SeqCst), 1, "second answer must come from the cache");
    }

    #[tokio::test]
    async fn serve_cover_maps_upstream_errors_to_502() {
        let upstream = crate::media_server::test_support::spawn_upstream(|_req| {
            http::Response::builder()
                .status(500)
                .body(http_body_util::Full::new(bytes::Bytes::new()))
                .expect("upstream response")
        })
        .await;
        let cache = NdCoverCache::default();

        let resp = serve_cover(Some(test_config(upstream)), &cache, None, "c1", None, None).await;

        assert_eq!(resp.status(), 502);
    }
}
