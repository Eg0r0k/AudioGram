//! Cover proxy: the `/{token}/nd/cover/…` route of the loopback media server.
//!
//! No server-side cache: responses carry `Cache-Control: public, max-age=86400`
//! and the loopback transport is plain HTTP, so the webview's own HTTP cache
//! already serves repeat loads without reaching this route. (An in-memory
//! cache lived here when the transport was a custom scheme, which WebView2
//! refused to HTTP-cache; the move to loopback HTTP made it redundant.)

use futures_util::TryStreamExt;
use http_body_util::{BodyExt, StreamBody};

/// `/{token}/nd/cover/<coverId>?size=<px>` → `getCoverArt.view`. Proxied so
/// the canvas stays untainted for palette extraction; the body streams
/// through without buffering.
pub(crate) async fn serve_cover(
    config: Option<super::config::NdConfig>,
    client: &reqwest::Client,
    cover_id: &str,
    query: Option<&str>,
    origin: Option<&str>,
) -> http::Response<crate::media_server::Body> {
    use crate::media_server::status_response;

    let size = query
        .and_then(|q| q.split('&').find_map(|pair| pair.strip_prefix("size=")))
        .filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()))
        .map(|s| format!("&size={s}"))
        .unwrap_or_default();

    let Some(config) = config else {
        return status_response(503, origin);
    };

    let url = config.rest_url("getCoverArt.view", cover_id, &size);
    let response = match client.get(&url).send().await {
        Ok(response) => response,
        Err(e) => {
            // reqwest errors can embed the URL (auth token) — never log it.
            log::warn!(
                "media nd/cover/{cover_id}: request failed: {}",
                e.without_url()
            );
            return status_response(502, origin);
        }
    };
    if response.status().as_u16() != 200 {
        log::warn!(
            "media nd/cover/{cover_id}: upstream status {}",
            response.status()
        );
        return status_response(502, origin);
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_owned();
    let content_length = response
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    // Covers are cacheable, unlike tokenized audio: the browser may keep them
    // for a day, which kills the `<img>` remount re-fetch flicker.
    let mut builder = crate::media_server::cors(http::Response::builder().status(200), origin)
        .header("Content-Type", content_type)
        .header("Cache-Control", "public, max-age=86400");
    if let Some(len) = content_length {
        builder = builder.header("Content-Length", len);
    }

    let stream = response
        .bytes_stream()
        .map_err(|e| std::io::Error::other(e.without_url().to_string()))
        .map_ok(hyper::body::Frame::data);
    builder
        .body(StreamBody::new(stream).boxed())
        .unwrap_or_else(|_| status_response(500, origin))
}

#[cfg(test)]
mod tests {
    use super::*;
    use http_body_util::BodyExt;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

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
    async fn serve_cover_unconfigured_is_503() {
        let resp = serve_cover(None, &direct(), "c1", None, None).await;

        assert_eq!(resp.status(), 503);
    }

    #[tokio::test]
    async fn serve_cover_streams_upstream_and_passes_size() {
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
        let config = test_config(upstream);

        let client = direct();
        let first = serve_cover(Some(config.clone()), &client, "c1", Some("size=300"), None).await;
        assert_eq!(first.status(), 200);
        assert_eq!(first.headers()["Content-Type"], "image/png");
        assert_eq!(first.headers()["Cache-Control"], "public, max-age=86400");
        let body = first.into_body().collect().await.expect("body").to_bytes();
        assert_eq!(body.as_ref(), b"img");

        // Caching is the webview's job now — the proxy itself stays stateless.
        let second = serve_cover(Some(config), &client, "c1", Some("size=300"), None).await;
        assert_eq!(second.status(), 200);
        let body = second.into_body().collect().await.expect("body").to_bytes();
        assert_eq!(body.as_ref(), b"img");

        assert_eq!(
            hits.load(Ordering::SeqCst),
            2,
            "no server-side cache left behind"
        );
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

        let resp = serve_cover(Some(test_config(upstream)), &direct(), "c1", None, None).await;

        assert_eq!(resp.status(), 502);
    }
}
