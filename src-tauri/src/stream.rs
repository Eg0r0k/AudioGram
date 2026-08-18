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

use std::sync::Arc;

use tauri::{AppHandle, Runtime};

pub fn status_response(code: u16) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(code)
        .header("Access-Control-Allow-Origin", "*")
        .body(Vec::new())
        .unwrap_or_default()
}

/// Default per-request range window for sources without their own limit
/// (Navidrome). See [`cap_range_span`] for why ranges are capped at all.
pub(crate) const DEFAULT_RANGE_SPAN: u64 = 8 * 1024 * 1024;

/// Caps any range to `max_span` bytes: `bytes=X-` (the media element's probe
/// and seek form) and over-long explicit ranges become `bytes=X-(X+span-1)`.
///
/// Two reasons. The proxy buffers bodies in memory before responding, so an
/// uncapped range on a 2-hour track means ~150 MB of silence before the first
/// byte reaches the webview. And googlevideo outright rejects large spans on
/// URLs resolved without a PO token (measured 2026-08: ≤1 MiB → 206, 2 MiB →
/// 403, larger/open → 302 bounce), so the YT side must stay under that.
/// A capped 206 + Content-Range makes the element stream progressively.
///
/// Absent headers and malformed/suffix specs pass through untouched.
fn cap_range_span(range: Option<String>, max_span: u64) -> Option<String> {
    let raw = range?;
    let capped = raw
        .strip_prefix("bytes=")
        .and_then(|spec| spec.split_once('-'))
        .and_then(|(start, end)| {
            let start: u64 = start.trim().parse().ok()?;
            let capped_end = start.saturating_add(max_span - 1);
            let end = match end.trim() {
                "" => capped_end,
                end => end.parse::<u64>().ok()?.min(capped_end),
            };
            Some(format!("bytes={start}-{end}"))
        });
    Some(capped.unwrap_or(raw))
}

/// GET `url` forwarding an optional Range header (capped to `max_range_span`
/// — see [`cap_range_span`]), propagating status, Content-Type, Content-Range
/// and Accept-Ranges back to the webview. Generic across sources; `headers`
/// (upstream-required request headers) and `proxy` are per-source concerns.
pub(crate) async fn forward_get(
    url: &str,
    headers: &[(String, String)],
    range: Option<String>,
    proxy: Option<String>,
    max_range_span: u64,
) -> Result<tauri::http::Response<Vec<u8>>, String> {
    let range = cap_range_span(range, max_range_span);
    let mut builder = reqwest::Client::builder();
    if let Some(url) = proxy.as_deref().filter(|p| !p.is_empty()) {
        if let Ok(proxy) = reqwest::Proxy::all(url) {
            builder = builder.proxy(proxy);
        }
    }
    let client = builder.build().map_err(|e| e.to_string())?;

    let mut req = client.get(url);
    for (name, value) in headers {
        req = req.header(name.as_str(), value.as_str());
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

/// Serves a fully cached body honoring an optional `Range` header — the media
/// element probes with `bytes=0-` first and follows up with seek ranges.
pub(crate) fn range_response(
    content_type: &str,
    bytes: &Arc<Vec<u8>>,
    range: Option<&str>,
) -> tauri::http::Response<Vec<u8>> {
    let total = bytes.len();

    let base = |status: u16| {
        tauri::http::Response::builder()
            .status(status)
            .header("Access-Control-Allow-Origin", "*")
            .header("Content-Type", content_type)
            .header("Accept-Ranges", "bytes")
    };

    match range.and_then(parse_range_header) {
        Some((start, _)) if start >= total => base(416)
            .header("Content-Range", format!("bytes */{total}"))
            .body(Vec::new())
            .unwrap_or_else(|_| status_response(500)),
        Some((start, end)) => {
            let end = end.map_or(total - 1, |e| e.min(total - 1));
            base(206)
                .header("Content-Range", format!("bytes {start}-{end}/{total}"))
                .body(bytes[start..=end].to_vec())
                .unwrap_or_else(|_| status_response(500))
        }
        // No (or unsupported) range: a full 200 body is a valid answer to any
        // Range request per RFC 9110.
        None => base(200)
            .body(bytes.as_ref().clone())
            .unwrap_or_else(|_| status_response(500)),
    }
}

/// Parses `bytes=start-end?` (suffix ranges like `bytes=-500` are not used by
/// media elements and fall back to a full response).
fn parse_range_header(raw: &str) -> Option<(usize, Option<usize>)> {
    let spec = raw.strip_prefix("bytes=")?;
    let (start, end) = spec.split_once('-')?;
    let start = start.trim().parse().ok()?;
    let end = end.trim();
    let end = if end.is_empty() {
        None
    } else {
        Some(end.parse().ok()?)
    };
    Some((start, end))
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

#[cfg(test)]
mod tests {
    use super::cap_range_span;

    const SPAN: u64 = 1024;

    #[test]
    fn caps_the_open_probe_and_seek_ranges() {
        assert_eq!(
            cap_range_span(Some("bytes=0-".into()), SPAN).as_deref(),
            Some("bytes=0-1023"),
        );
        assert_eq!(
            cap_range_span(Some("bytes=5000-".into()), SPAN).as_deref(),
            Some("bytes=5000-6023"),
        );
    }

    #[test]
    fn caps_explicit_ranges_longer_than_the_span() {
        assert_eq!(
            cap_range_span(Some("bytes=100-999999".into()), SPAN).as_deref(),
            Some("bytes=100-1123"),
        );
    }

    #[test]
    fn keeps_explicit_ranges_within_the_span() {
        assert_eq!(
            cap_range_span(Some("bytes=100-200".into()), SPAN).as_deref(),
            Some("bytes=100-200"),
        );
    }

    #[test]
    fn passes_through_absent_suffix_and_malformed_specs() {
        assert_eq!(cap_range_span(None, SPAN), None);
        // Suffix ranges ("last N bytes") have no start to cap from.
        assert_eq!(cap_range_span(Some("bytes=-500".into()), SPAN).as_deref(), Some("bytes=-500"));
        assert_eq!(cap_range_span(Some("items=0-".into()), SPAN).as_deref(), Some("items=0-"));
        assert_eq!(cap_range_span(Some("bytes=abc-".into()), SPAN).as_deref(), Some("bytes=abc-"));
    }
}
