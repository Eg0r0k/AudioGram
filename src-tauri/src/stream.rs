//! The generalized `stream://` audio/cover proxy scheme.
//!
//! Dispatches on the first path segment:
//! - `yt/<videoId>`            → proxied googlevideo audio (youtube module)
//! - `nd/song/<songId>`        → Navidrome `stream.view?format=raw`
//! - `nd/cover/<coverId>?size=`→ Navidrome `getCoverArt.view`
//!
//! The path arrives percent-encoded (built by `convertFileSrc`), so an
//! embedded `?size=` query is decoded out of the path here. Range headers are
//! forwarded upstream; responses carry `Access-Control-Allow-Origin: *` so
//! the crossOrigin media element keeps Web Audio processing and canvas
//! palette extraction stays untainted.

use tauri::{AppHandle, Runtime};

pub fn status_response(code: u16) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(code)
        .header("Access-Control-Allow-Origin", "*")
        .body(Vec::new())
        .unwrap_or_default()
}

/// GET `url` forwarding an optional Range header, propagating status,
/// Content-Type, Content-Range and Accept-Ranges back to the webview.
/// Generic across sources; `user_agent`/`proxy` are per-source concerns.
pub(crate) async fn forward_get(
    url: &str,
    user_agent: Option<&str>,
    range: Option<String>,
    proxy: Option<String>,
) -> Result<tauri::http::Response<Vec<u8>>, String> {
    let mut builder = reqwest::Client::builder();
    if let Some(url) = proxy.as_deref().filter(|p| !p.is_empty()) {
        if let Ok(proxy) = reqwest::Proxy::all(url) {
            builder = builder.proxy(proxy);
        }
    }
    let client = builder.build().map_err(|e| e.to_string())?;

    let mut req = client.get(url);
    if let Some(agent) = user_agent {
        req = req.header(reqwest::header::USER_AGENT, agent);
    }
    if let Some(range) = &range {
        req = req.header(reqwest::header::RANGE, range);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let headers = resp.headers().clone();
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();

    let content_type = headers
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("audio/mp4")
        .to_owned();

    let mut builder = tauri::http::Response::builder()
        .status(status)
        .header("Access-Control-Allow-Origin", "*")
        .header("Content-Type", content_type)
        .header("Accept-Ranges", "bytes");

    if let Some(cr) = headers
        .get(reqwest::header::CONTENT_RANGE)
        .and_then(|v| v.to_str().ok())
    {
        builder = builder.header("Content-Range", cr.to_owned());
    }

    builder.body(bytes).map_err(|e| e.to_string())
}

pub fn serve<R: Runtime>(
    ctx: tauri::UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let encoded = request.uri().path().trim_start_matches('/').to_owned();
    let decoded = percent_encoding::percent_decode_str(&encoded)
        .decode_utf8()
        .map(|p| p.into_owned())
        .unwrap_or(encoded);

    // convertFileSrc percent-encodes the whole path, so a `?size=` query may
    // arrive embedded in it; a real URI query is the fallback.
    let (path, embedded_query) = match decoded.split_once('?') {
        Some((path, query)) => (path.to_owned(), Some(query.to_owned())),
        None => (decoded, None),
    };
    let query = embedded_query.or_else(|| request.uri().query().map(str::to_owned));

    let range = request
        .headers()
        .get(tauri::http::header::RANGE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let app = ctx.app_handle().clone();

    tauri::async_runtime::spawn(async move {
        let response = route(&app, &path, query.as_deref(), range)
            .await
            .unwrap_or_else(|e| {
                // `e` never carries upstream URLs (they embed auth tokens).
                log::warn!("stream {path}: {e}");
                status_response(502)
            });
        responder.respond(response);
    });
}

async fn route<R: Runtime>(
    app: &AppHandle<R>,
    path: &str,
    query: Option<&str>,
    range: Option<String>,
) -> Result<tauri::http::Response<Vec<u8>>, String> {
    if let Some(id) = path.strip_prefix("yt/") {
        return crate::youtube::stream_yt(app, id, range).await;
    }
    if let Some(id) = path.strip_prefix("nd/song/") {
        return crate::nd::stream_song(app, id, range).await;
    }
    if let Some(id) = path.strip_prefix("nd/cover/") {
        return crate::nd::fetch_cover(app, id, query).await;
    }
    Ok(status_response(404))
}
