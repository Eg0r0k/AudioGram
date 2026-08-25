//! The `ytimg://` thumbnail proxy scheme.

use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;

use bytes::Bytes;
use tauri::{AppHandle, Manager, Runtime};

use super::{http_client, status_response};

/// WebView2 does not put custom-scheme responses into its HTTP cache, so the
/// `Cache-Control` header on proxied thumbnails is ignored and every remount
/// of an `<img>` re-fetches the cover over the network — long enough that the
/// frontend replays its load animation. Keep the bytes in memory instead.
const MAX_CACHED_IMAGES: usize = 256;
const MAX_CACHEABLE_BYTES: usize = 1024 * 1024;

struct CachedImage {
    content_type: String,
    bytes: Bytes,
}

#[derive(Default)]
pub struct YtImageCache {
    entries: Mutex<(HashMap<String, CachedImage>, VecDeque<String>)>,
}

impl YtImageCache {
    fn get(&self, url: &str) -> Option<(String, Bytes)> {
        let entries = self.entries.lock().ok()?;
        entries
            .0
            .get(url)
            .map(|img| (img.content_type.clone(), img.bytes.clone()))
    }

    fn insert(&self, url: String, content_type: String, bytes: Bytes) {
        if bytes.len() > MAX_CACHEABLE_BYTES {
            return;
        }
        let Ok(mut entries) = self.entries.lock() else {
            return;
        };
        let (map, order) = &mut *entries;
        if map
            .insert(
                url.clone(),
                CachedImage {
                    content_type,
                    bytes,
                },
            )
            .is_none()
        {
            order.push_back(url);
        }
        while map.len() > MAX_CACHED_IMAGES {
            let Some(oldest) = order.pop_front() else {
                break;
            };
            map.remove(&oldest);
        }
    }
}

/// Hosts the `ytimg://` scheme may fetch from (video thumbnails, channel art,
/// YT Music covers). Exact googleusercontent hosts only — the wildcard domain
/// hosts arbitrary user content.
pub(super) fn is_allowed_image_host(host: &str) -> bool {
    host == "ytimg.com"
        || host.ends_with(".ytimg.com")
        || host == "yt3.ggpht.com"
        || host == "lh3.googleusercontent.com"
        || host == "yt3.googleusercontent.com"
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

    let cache = app.state::<YtImageCache>();
    if let Some((content_type, bytes)) = cache.get(parsed.as_str()) {
        return image_response(200, &content_type, bytes.to_vec());
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
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

    if status == 200 {
        cache.insert(
            parsed.as_str().to_owned(),
            content_type.clone(),
            bytes.clone(),
        );
    }

    // The custom-protocol responder needs an owned `Vec` — the one copy.
    image_response(status, &content_type, bytes.to_vec())
}

fn image_response(
    status: u16,
    content_type: &str,
    bytes: Vec<u8>,
) -> Result<tauri::http::Response<Vec<u8>>, String> {
    tauri::http::Response::builder()
        .status(status)
        .header("Access-Control-Allow-Origin", "*")
        .header("Content-Type", content_type)
        .header("Cache-Control", "public, max-age=86400")
        .body(bytes)
        .map_err(|e| e.to_string())
}
