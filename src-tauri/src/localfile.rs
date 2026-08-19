//! `stream://…/local/<absolute path>` — local audio files (imported tracks,
//! offline copies, watched folders).
//!
//! Exists because Tauri's asset protocol cannot stream media on Android: the
//! WebView's intercepted-response loader treats the returned body as the
//! COMPLETE resource and applies the request's Range header itself (it skips
//! `start` bytes of the InputStream), while the asset protocol returns an
//! already-sliced 206 body. The double slice empties every chunk after the
//! first, the element gets net::ERR_FAILED and playback dies once the initial
//! buffer drains.
//!
//! So on Android the body is always the FULL file and the declared 206
//! headers describe the slice the WebView will cut out of it. Desktop
//! webviews pass intercepted bodies through untouched, so there this route
//! slices like a normal HTTP server.

use crate::stream::{parse_range_header, range_response, status_response};

pub(crate) async fn stream_local(
    path: &str,
    range: Option<String>,
) -> Result<tauri::http::Response<Vec<u8>>, String> {
    if !is_safe_abs_path(path) {
        return Ok(status_response(403));
    }

    let owned = path.to_owned();
    let bytes = match tauri::async_runtime::spawn_blocking(move || std::fs::read(&owned)).await {
        Ok(Ok(bytes)) => bytes,
        Ok(Err(e)) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(status_response(404));
        }
        Ok(Err(e)) => return Err(e.to_string()),
        Err(e) => return Err(e.to_string()),
    };

    let content_type = mime_for_path(path);

    #[cfg(target_os = "android")]
    {
        Ok(full_body_range_response(content_type, bytes, range.as_deref()))
    }
    #[cfg(not(target_os = "android"))]
    {
        Ok(range_response(
            content_type,
            &std::sync::Arc::new(bytes),
            range.as_deref(),
        ))
    }
}

/// Absolute path with no `..` segments — same trust level the asset protocol
/// scope (`**`) granted, minus traversal games.
fn is_safe_abs_path(path: &str) -> bool {
    let is_absolute = path.starts_with('/')
        || (path.len() > 2 && path.as_bytes()[1] == b':' && path.as_bytes()[0].is_ascii_alphabetic());
    is_absolute && !path.split(['/', '\\']).any(|segment| segment == "..")
}

fn mime_for_path(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or_default().to_ascii_lowercase();
    match ext.as_str() {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "ogg" | "oga" | "opus" => "audio/ogg",
        "m4a" | "mp4" => "audio/mp4",
        "aac" => "audio/aac",
        "wav" => "audio/wav",
        "wma" => "audio/x-ms-wma",
        "webm" => "audio/webm",
        _ => "application/octet-stream",
    }
}

/// Range answer whose BODY is the whole file: the Android WebView slices the
/// body per the request's Range on its own, so the headers must describe the
/// slice while the bytes must not be pre-cut.
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
fn full_body_range_response(
    content_type: &str,
    bytes: Vec<u8>,
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
                .body(bytes)
                .unwrap_or_else(|_| status_response(500))
        }
        None => base(200)
            .body(bytes)
            .unwrap_or_else(|_| status_response(500)),
    }
}

#[cfg(test)]
mod tests {
    use super::{full_body_range_response, is_safe_abs_path, mime_for_path};

    fn body_of_len(len: usize) -> Vec<u8> {
        vec![7u8; len]
    }

    #[test]
    fn no_range_is_a_full_200() {
        let resp = full_body_range_response("audio/mpeg", body_of_len(100), None);
        assert_eq!(resp.status(), 200);
        assert_eq!(resp.body().len(), 100);
        assert!(resp.headers().get("Content-Range").is_none());
    }

    #[test]
    fn range_keeps_the_full_body_but_declares_the_slice() {
        let resp = full_body_range_response("audio/mpeg", body_of_len(100), Some("bytes=40-"));
        assert_eq!(resp.status(), 206);
        assert_eq!(resp.body().len(), 100, "body must stay uncut for the webview to slice");
        assert_eq!(
            resp.headers().get("Content-Range").unwrap(),
            "bytes 40-99/100",
        );
    }

    #[test]
    fn explicit_range_end_is_clamped_to_the_file() {
        let resp = full_body_range_response("audio/mpeg", body_of_len(100), Some("bytes=10-500"));
        assert_eq!(resp.status(), 206);
        assert_eq!(resp.body().len(), 100);
        assert_eq!(
            resp.headers().get("Content-Range").unwrap(),
            "bytes 10-99/100",
        );
    }

    #[test]
    fn range_past_the_end_is_416() {
        let resp = full_body_range_response("audio/mpeg", body_of_len(100), Some("bytes=100-"));
        assert_eq!(resp.status(), 416);
        assert!(resp.body().is_empty());
    }

    #[test]
    fn rejects_relative_and_traversal_paths() {
        assert!(is_safe_abs_path("/data/data/app/tracks/a.mp3"));
        assert!(is_safe_abs_path("C:/music/a.mp3"));
        assert!(!is_safe_abs_path("tracks/a.mp3"));
        assert!(!is_safe_abs_path("/data/../etc/passwd"));
        assert!(!is_safe_abs_path("C:/music/..\\secret.mp3"));
    }

    #[test]
    fn maps_common_audio_extensions() {
        assert_eq!(mime_for_path("/a/b.mp3"), "audio/mpeg");
        assert_eq!(mime_for_path("/a/b.FLAC"), "audio/flac");
        assert_eq!(mime_for_path("/a/b.opus"), "audio/ogg");
        assert_eq!(mime_for_path("/a/b.bin"), "application/octet-stream");
    }
}
