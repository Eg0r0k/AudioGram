//! Loopback HTTP media server — the transport for all audio (and proxied
//! covers) on every platform.
//!
//! Replaces the `stream://` custom protocol: wry cannot stream custom-protocol
//! bodies (on Android the whole body is materialized into one Java `byte[]`,
//! which OOMs on large files), while a real HTTP server on `127.0.0.1` gives
//! the media element honest Range semantics and true streaming.
//!
//! Bound to `127.0.0.1:0` (random port) BEFORE the webview starts; every
//! request path must begin with a per-launch random token segment:
//! `/{token}/local/<enc path>`, `/{token}/nd/song/<id>`,
//! `/{token}/nd/cover/<id>?size=<px>`, `/{token}/yt/<videoId>`,
//! `/{token}/ytimg/<enc https url>`.

use std::future::Future;
use std::sync::Arc;

use http_body_util::{combinators::BoxBody, BodyExt, Full, StreamBody};
use tauri::{AppHandle, Runtime};

/// Response body: either a buffered chunk or a stream (local-file spans,
/// pass-through upstream bodies).
pub(crate) type Body = BoxBody<bytes::Bytes, std::io::Error>;

/// Bound address + the per-launch path token, managed as tauri state and
/// handed to the frontend via the `media_server_base` command.
pub struct MediaServerState {
    pub port: u16,
    pub token: String,
}

/// The frontend prefixes every media URL with this base:
/// `http://127.0.0.1:{port}/{token}`. Queried once at bootstrap (top-level
/// await in main.ts) — the socket is bound before the webview exists, so
/// this can never race server readiness.
#[tauri::command]
pub fn media_server_base(state: tauri::State<'_, MediaServerState>) -> String {
    format!("http://127.0.0.1:{}/{}", state.port, state.token)
}

/// What a `Range` header means for a resource of `total` bytes.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum RangeOutcome {
    /// Absent or malformed/unsupported spec — serve the whole body as 200.
    Full,
    /// Serve `start..=end` as 206.
    Slice { start: u64, end: u64 },
    /// Nothing satisfiable — 416 with `Content-Range: bytes */total`.
    Unsatisfiable,
}

/// Resolves a single-range `bytes=` spec against a known total length.
/// Suffix ranges (`bytes=-N`) are honored; multipart ranges and malformed
/// specs fall back to a full 200 (a valid answer per RFC 9110).
pub(crate) fn resolve_range(range: Option<&str>, total: u64) -> RangeOutcome {
    let Some(raw) = range else {
        return RangeOutcome::Full;
    };
    let Some(spec) = raw.strip_prefix("bytes=") else {
        return RangeOutcome::Full;
    };
    let Some((start, end)) = spec.split_once('-') else {
        return RangeOutcome::Full;
    };
    let (start, end) = (start.trim(), end.trim());

    if start.is_empty() {
        let Ok(suffix_len) = end.parse::<u64>() else {
            return RangeOutcome::Full;
        };
        if suffix_len == 0 || total == 0 {
            return RangeOutcome::Unsatisfiable;
        }
        return RangeOutcome::Slice {
            start: total.saturating_sub(suffix_len),
            end: total - 1,
        };
    }

    let Ok(start) = start.parse::<u64>() else {
        return RangeOutcome::Full;
    };
    if start >= total {
        return RangeOutcome::Unsatisfiable;
    }
    let end = if end.is_empty() {
        total - 1
    } else {
        match end.parse::<u64>() {
            Ok(end) => end,
            Err(_) => return RangeOutcome::Full,
        }
    };
    if end < start {
        return RangeOutcome::Full;
    }
    RangeOutcome::Slice {
        start,
        end: end.min(total - 1),
    }
}

/// Absolute path with no `..` segments and no UNC/device prefix. UNC paths
/// (`//server/share`, `\\server\share`) would make `std::fs::read` reach into
/// SMB on Windows — reject them outright.
pub(crate) fn is_safe_abs_path(path: &str) -> bool {
    if path.starts_with("//") || path.starts_with("\\\\") {
        return false;
    }
    let bytes = path.as_bytes();
    let is_absolute = path.starts_with('/')
        || (path.len() > 2 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic());
    is_absolute && !path.split(['/', '\\']).any(|segment| segment == "..")
}

pub(crate) fn mime_for_path(path: &str) -> &'static str {
    let ext = path
        .rsplit('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    match ext.as_str() {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "ogg" | "oga" | "opus" => "audio/ogg",
        "m4a" | "mp4" => "audio/mp4",
        "aac" => "audio/aac",
        "wav" => "audio/wav",
        "ape" => "audio/x-ape",
        "wma" => "audio/x-ms-wma",
        "webm" => "audio/webm",
        _ => "application/octet-stream",
    }
}

/// Strips the leading `/{token}/` from a request path; `None` when the token
/// does not match (the caller answers 404 without distinguishing why).
pub(crate) fn split_token_route<'a>(path: &'a str, token: &str) -> Option<&'a str> {
    if token.is_empty() {
        return None;
    }
    path.strip_prefix('/')?
        .strip_prefix(token)?
        .strip_prefix('/')
}

/// 32 hex chars from 16 CSPRNG bytes — the per-launch URL token.
pub(crate) fn new_token() -> String {
    let mut buf = [0u8; 16];
    getrandom::fill(&mut buf).expect("OS CSPRNG is available");
    hex::encode(buf)
}

/// The `Access-Control-Allow-Origin` value for a request `Origin`: known
/// webview origins are reflected (so `crossOrigin` elements stay untainted),
/// absent origins get `*` (headerless media probes), anything else gets
/// `"null"` so a drive-by browser page cannot read responses even with a
/// leaked token.
pub(crate) fn allow_origin(origin: Option<&str>) -> &'static str {
    match origin {
        None => "*",
        Some("http://tauri.localhost") => "http://tauri.localhost",
        Some("https://tauri.localhost") => "https://tauri.localhost",
        Some("tauri://localhost") => "tauri://localhost",
        Some("http://localhost:1420") => "http://localhost:1420",
        Some(_) => "null",
    }
}

// ── Response builders ────────────────────────────────────────────────

fn empty_body() -> Body {
    Full::new(bytes::Bytes::new())
        .map_err(|never| match never {})
        .boxed()
}

pub(crate) fn full_body(bytes: bytes::Bytes) -> Body {
    Full::new(bytes).map_err(|never| match never {}).boxed()
}

/// CORS + Vary on every response; `Vary: Origin` whenever the value depends
/// on the request's Origin (i.e. the header was present).
pub(crate) fn cors(
    builder: http::response::Builder,
    origin: Option<&str>,
) -> http::response::Builder {
    let builder = builder.header("Access-Control-Allow-Origin", allow_origin(origin));
    if origin.is_some() {
        builder.header("Vary", "Origin")
    } else {
        builder
    }
}

pub(crate) fn status_response(code: u16, origin: Option<&str>) -> http::Response<Body> {
    cors(http::Response::builder().status(code), origin)
        .body(empty_body())
        .unwrap_or_default()
}

/// Common headers of every audio answer. `no-store`: tokenized URLs must
/// not outlive the session in the HTTP cache.
fn audio_base(status: u16, content_type: &str, origin: Option<&str>) -> http::response::Builder {
    cors(http::Response::builder().status(status), origin)
        .header("Content-Type", content_type)
        .header("Accept-Ranges", "bytes")
        .header("Cache-Control", "no-store")
        // Content-Range/Content-Length are not CORS-safelisted; without this
        // a scripted fetch on the webview origin cannot read them.
        .header(
            "Access-Control-Expose-Headers",
            "Content-Range, Accept-Ranges, Content-Length",
        )
}

/// Serves a fully in-memory body (prefetch caches) honoring Range. `Bytes`
/// slices are refcounted views, so neither answer copies the audio.
pub(crate) fn memory_range_response(
    content_type: &str,
    bytes: &bytes::Bytes,
    range: Option<&str>,
    origin: Option<&str>,
) -> http::Response<Body> {
    let total = bytes.len() as u64;
    match resolve_range(range, total) {
        RangeOutcome::Unsatisfiable => audio_base(416, content_type, origin)
            .header("Content-Range", format!("bytes */{total}"))
            .body(empty_body())
            .unwrap_or_else(|_| status_response(500, origin)),
        RangeOutcome::Slice { start, end } => audio_base(206, content_type, origin)
            .header("Content-Range", format!("bytes {start}-{end}/{total}"))
            .body(full_body(bytes.slice(start as usize..=end as usize)))
            .unwrap_or_else(|_| status_response(500, origin)),
        RangeOutcome::Full => audio_base(200, content_type, origin)
            .body(full_body(bytes.clone()))
            .unwrap_or_else(|_| status_response(500, origin)),
    }
}

// ── Upstream forwarding ──────────────────────────────────────────────

/// Caps any range to `max_span` bytes: `bytes=X-` (the media element's probe
/// and seek form) and over-long explicit ranges become `bytes=X-(X+span-1)`.
///
/// Sole remaining reason (the in-memory buffering one died with `stream://`):
/// googlevideo outright rejects large spans on URLs resolved without a PO
/// token (measured 2026-08: ≤1 MiB → 206, 2 MiB → 403, larger/open → 302
/// bounce), so the YT side must stay under that. A capped 206 +
/// Content-Range makes the element stream progressively.
///
/// Absent headers and malformed/suffix specs pass through untouched.
pub(crate) fn cap_range_span(range: Option<String>, max_span: u64) -> Option<String> {
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

/// GET `url` forwarding an optional Range header (capped to `max_span` when
/// given — see [`cap_range_span`]), propagating status, Content-Type,
/// Content-Range, Content-Length and Accept-Ranges, and passing the upstream
/// body through AS A STREAM — nothing is buffered on any platform. `headers`
/// (upstream-required request headers) are a per-source concern; `client` is
/// the shared proxy-aware one from [`crate::proxy::ProxyState::client`].
/// Errors never embed the URL (nd URLs carry auth tokens).
pub(crate) async fn forward_stream(
    client: &reqwest::Client,
    url: &str,
    headers: &[(String, String)],
    range: Option<String>,
    max_span: Option<u64>,
    origin: Option<&str>,
) -> Result<http::Response<Body>, String> {
    use futures_util::TryStreamExt;

    let range = match max_span {
        Some(span) => cap_range_span(range, span),
        None => range,
    };

    let mut req = client.get(url);
    for (name, value) in headers {
        req = req.header(name.as_str(), value.as_str());
    }
    if let Some(range) = &range {
        req = req.header(reqwest::header::RANGE, range);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("request failed: {}", e.without_url()))?;
    let status = resp.status().as_u16();
    let upstream_headers = resp.headers().clone();

    let content_type = upstream_headers
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("audio/mp4");

    let mut builder = audio_base(status, content_type, origin);
    for name in [
        reqwest::header::CONTENT_RANGE,
        reqwest::header::CONTENT_LENGTH,
    ] {
        if let Some(value) = upstream_headers.get(&name).and_then(|v| v.to_str().ok()) {
            builder = builder.header(name.as_str(), value.to_owned());
        }
    }

    let stream = resp
        .bytes_stream()
        .map_err(|e| std::io::Error::other(e.without_url().to_string()))
        .map_ok(hyper::body::Frame::data);
    builder
        .body(StreamBody::new(stream).boxed())
        .map_err(|e| e.to_string())
}

// ── Local files ──────────────────────────────────────────────────────

/// Body that streams `len` bytes of an already-positioned file in 64 KiB
/// chunks — the full file is never in memory on any platform.
fn file_stream_body(file: tokio::fs::File, len: u64) -> Body {
    use futures_util::TryStreamExt;
    let reader = tokio::io::AsyncReadExt::take(file, len);
    let stream = tokio_util::io::ReaderStream::with_capacity(reader, 64 * 1024);
    StreamBody::new(stream.map_ok(hyper::body::Frame::data)).boxed()
}

/// `local/<abs path>`: opens the file, seeks to the requested range and
/// streams the span. ALAC-in-mp4 sources (undecodable by any Chromium
/// webview) are transparently swapped for their cached WAV rendition —
/// the response then carries `audio/wav` and ranges resolve against it.
async fn serve_local(
    path: &str,
    range: Option<&str>,
    origin: Option<&str>,
    transcode_cache: Option<&std::path::Path>,
) -> http::Response<Body> {
    if !is_safe_abs_path(path) {
        return status_response(403, origin);
    }

    let mut path = std::borrow::Cow::Borrowed(path);
    if crate::transcode::is_transcode_candidate(&path) {
        if let Some(cache) = transcode_cache {
            let src = std::path::PathBuf::from(path.as_ref());
            let cache = cache.to_path_buf();
            let rendition =
                tokio::task::spawn_blocking(move || crate::transcode::rendition_path(&src, &cache))
                    .await
                    .ok()
                    .flatten();
            if let Some(rendition) = rendition {
                path = std::borrow::Cow::Owned(rendition.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    let path = path.as_ref();

    let mut file = match tokio::fs::File::open(path).await {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return status_response(404, origin);
        }
        Err(e) => {
            log::warn!("media local: open failed: {e}");
            return status_response(500, origin);
        }
    };
    let total = match file.metadata().await {
        Ok(meta) => meta.len(),
        Err(e) => {
            log::warn!("media local: metadata failed: {e}");
            return status_response(500, origin);
        }
    };
    let content_type = mime_for_path(path);

    match resolve_range(range, total) {
        RangeOutcome::Unsatisfiable => audio_base(416, content_type, origin)
            .header("Content-Range", format!("bytes */{total}"))
            .body(empty_body())
            .unwrap_or_else(|_| status_response(500, origin)),
        RangeOutcome::Full => audio_base(200, content_type, origin)
            .header("Content-Length", total.to_string())
            .body(file_stream_body(file, total))
            .unwrap_or_else(|_| status_response(500, origin)),
        RangeOutcome::Slice { start, end } => {
            use tokio::io::AsyncSeekExt;
            if let Err(e) = file.seek(std::io::SeekFrom::Start(start)).await {
                log::warn!("media local: seek failed: {e}");
                return status_response(500, origin);
            }
            let len = end - start + 1;
            audio_base(206, content_type, origin)
                .header("Content-Range", format!("bytes {start}-{end}/{total}"))
                .header("Content-Length", len.to_string())
                .body(file_stream_body(file, len))
                .unwrap_or_else(|_| status_response(500, origin))
        }
    }
}

// ── Router ───────────────────────────────────────────────────────────

/// Remote (non-local-file) routes: `nd/…` and `yt/…`. Split behind a trait
/// so the HTTP core needs no `AppHandle` — the production impl wraps one,
/// tests use a stub.
pub(crate) trait RemoteRoutes: Clone + Send + Sync + 'static {
    /// `None` means "no such route" → 404. `rest` arrives percent-decoded.
    fn dispatch(
        &self,
        rest: String,
        query: Option<String>,
        range: Option<String>,
        origin: Option<String>,
    ) -> impl Future<Output = Option<http::Response<Body>>> + Send;
}

/// Production remote routes backed by the tauri app (nd/yt modules read
/// their managed state and, for yt, spawn the resolver sidecar).
pub(crate) struct AppRoutes<R: Runtime>(pub AppHandle<R>);

impl<R: Runtime> Clone for AppRoutes<R> {
    fn clone(&self) -> Self {
        AppRoutes(self.0.clone())
    }
}

impl<R: Runtime> RemoteRoutes for AppRoutes<R> {
    async fn dispatch(
        &self,
        rest: String,
        query: Option<String>,
        range: Option<String>,
        origin: Option<String>,
    ) -> Option<http::Response<Body>> {
        use tauri::Manager;

        let app = &self.0;
        let origin = origin.as_deref();

        // Every remote route talks to its upstream through the shared client;
        // cache hits pay only a mutex lock for it. The one failure is an
        // unparsable proxy URL, which no route could work around anyway.
        let client = match crate::proxy::http_client(app) {
            Ok(client) => client,
            Err(e) => {
                log::warn!("media {rest}: client: {e}");
                return Some(status_response(502, origin));
            }
        };

        if let Some(id) = rest.strip_prefix("nd/song/") {
            let config = app.state::<crate::nd::NdState>().get();
            let cache = app.state::<crate::nd::NdAudioCache>();
            return Some(
                crate::nd::serve_song(config, &cache, &client, id, range.as_deref(), origin).await,
            );
        }
        if let Some(id) = rest.strip_prefix("nd/cover/") {
            let config = app.state::<crate::nd::NdState>().get();
            return Some(
                crate::nd::serve_cover(config, &client, id, query.as_deref(), origin).await,
            );
        }
        #[cfg(desktop)]
        if let Some(id) = rest.strip_prefix("yt/") {
            return Some(crate::youtube::serve_yt(app, &client, id, range, origin).await);
        }
        #[cfg(desktop)]
        if let Some(url) = rest.strip_prefix("ytimg/") {
            return Some(crate::youtube::serve_image(&client, url, origin).await);
        }
        #[cfg(not(desktop))]
        let _ = range;

        None
    }
}

/// Token check + dispatch on the first path segment. Every error path is a
/// plain status response; upstream URLs never leak into errors.
pub(crate) async fn handle<T: RemoteRoutes>(
    remote: T,
    token: &str,
    transcode_cache: Option<&std::path::Path>,
    req: http::Request<hyper::body::Incoming>,
) -> http::Response<Body> {
    let origin = req
        .headers()
        .get("Origin")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    // CORS preflight: suffix ranges (`bytes=-N`) are not safelisted, so a
    // scripted fetch OPTIONS-probes first. Answered for any path — it leaks
    // nothing and the GET itself still 404s without the token.
    if req.method() == http::Method::OPTIONS {
        return cors(http::Response::builder().status(204), origin.as_deref())
            .header("Access-Control-Allow-Methods", "GET")
            .header("Access-Control-Allow-Headers", "Range")
            .body(empty_body())
            .unwrap_or_default();
    }

    if req.method() != http::Method::GET {
        return status_response(405, origin.as_deref());
    }

    let Some(rest) = split_token_route(req.uri().path(), token) else {
        return status_response(404, origin.as_deref());
    };
    let rest = percent_encoding::percent_decode_str(rest)
        .decode_utf8()
        .map(|s| s.into_owned())
        .unwrap_or_else(|_| rest.to_owned());

    let range = req
        .headers()
        .get("Range")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    if let Some(local_path) = rest.strip_prefix("local/") {
        return serve_local(
            local_path,
            range.as_deref(),
            origin.as_deref(),
            transcode_cache,
        )
        .await;
    }

    let query = req.uri().query().map(str::to_owned);
    match remote.dispatch(rest, query, range, origin.clone()).await {
        Some(response) => response,
        None => status_response(404, origin.as_deref()),
    }
}

// ── Server lifecycle ─────────────────────────────────────────────────

/// Binds `127.0.0.1:0` and mints the token. Called BEFORE the webview
/// exists so the frontend can never observe a non-listening server.
pub fn bind_on_loopback() -> std::io::Result<(std::net::TcpListener, MediaServerState)> {
    let listener = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))?;
    let port = listener.local_addr()?.port();
    Ok((
        listener,
        MediaServerState {
            port,
            token: new_token(),
        },
    ))
}

/// Accept loop: one http1 connection task per client. Runs until the
/// process dies — the socket's lifetime IS the app's lifetime.
pub(crate) async fn run_accept_loop<T: RemoteRoutes>(
    remote: T,
    token: String,
    transcode_cache: Option<std::path::PathBuf>,
    listener: tokio::net::TcpListener,
) {
    let transcode_cache = transcode_cache.map(Arc::new);
    loop {
        let stream = match listener.accept().await {
            Ok((stream, _addr)) => stream,
            Err(e) => {
                // Transient accept errors (EMFILE, aborted handshakes) must
                // not turn into a hot spin.
                log::warn!("media server accept: {e}");
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                continue;
            }
        };

        let remote = remote.clone();
        let token = token.clone();
        let transcode_cache = transcode_cache.clone();
        tokio::spawn(async move {
            let service = hyper::service::service_fn(move |req| {
                let remote = remote.clone();
                let token = token.clone();
                let transcode_cache = transcode_cache.clone();
                async move {
                    let cache = transcode_cache.as_deref().map(|p| p.as_path());
                    Ok::<_, std::convert::Infallible>(handle(remote, &token, cache, req).await)
                }
            });
            let io = hyper_util::rt::TokioIo::new(stream);
            if let Err(e) = hyper::server::conn::http1::Builder::new()
                .serve_connection(io, service)
                .await
            {
                // Media elements abort connections on every seek — routine.
                log::debug!("media server conn: {e}");
            }
        });
    }
}

/// Entry point for `lib.rs`: wraps the app handle and spawns the loop on
/// tauri's async runtime. The listener is already bound (before the webview
/// existed), so requests can never race server readiness.
pub fn spawn<R: Runtime>(app: AppHandle<R>, token: String, listener: std::net::TcpListener) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = listener.set_nonblocking(true) {
            log::error!("media server: set_nonblocking failed: {e}");
            return;
        }
        let listener = match tokio::net::TcpListener::from_std(listener) {
            Ok(listener) => listener,
            Err(e) => {
                log::error!("media server: listener conversion failed: {e}");
                return;
            }
        };
        use tauri::Manager;
        let transcode_cache = app
            .path()
            .app_cache_dir()
            .map(|dir| dir.join("transcode"))
            .ok();
        if let Some(cache) = &transcode_cache {
            crate::transcode::clean_stale_tmp(cache);
        }
        run_accept_loop(AppRoutes(app), token, transcode_cache, listener).await;
    });
}

#[cfg(test)]
pub(crate) mod test_support {
    use super::*;

    /// Minimal in-process upstream: every request goes through `handler`,
    /// which sees the full request head. Returns the upstream's base URL.
    pub(crate) async fn spawn_upstream<F>(handler: F) -> String
    where
        F: Fn(&http::Request<hyper::body::Incoming>) -> http::Response<Full<bytes::Bytes>>
            + Clone
            + Send
            + Sync
            + 'static,
    {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind upstream");
        let base = format!(
            "http://127.0.0.1:{}",
            listener.local_addr().expect("addr").port()
        );
        tokio::spawn(async move {
            loop {
                let Ok((stream, _addr)) = listener.accept().await else {
                    break;
                };
                let handler = handler.clone();
                tokio::spawn(async move {
                    let service = hyper::service::service_fn(move |req| {
                        let handler = handler.clone();
                        async move { Ok::<_, std::convert::Infallible>(handler(&req)) }
                    });
                    let _ = hyper::server::conn::http1::Builder::new()
                        .serve_connection(hyper_util::rt::TokioIo::new(stream), service)
                        .await;
                });
            }
        });
        base
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── resolve_range ────────────────────────────────────────────────

    #[test]
    fn no_range_serves_the_full_body() {
        assert_eq!(resolve_range(None, 100), RangeOutcome::Full);
    }

    #[test]
    fn open_range_runs_to_the_last_byte() {
        assert_eq!(
            resolve_range(Some("bytes=0-"), 100),
            RangeOutcome::Slice { start: 0, end: 99 }
        );
        assert_eq!(
            resolve_range(Some("bytes=40-"), 100),
            RangeOutcome::Slice { start: 40, end: 99 }
        );
    }

    #[test]
    fn explicit_range_is_clamped_to_the_resource() {
        assert_eq!(
            resolve_range(Some("bytes=10-49"), 100),
            RangeOutcome::Slice { start: 10, end: 49 }
        );
        assert_eq!(
            resolve_range(Some("bytes=10-500"), 100),
            RangeOutcome::Slice { start: 10, end: 99 }
        );
    }

    #[test]
    fn suffix_range_serves_the_tail() {
        assert_eq!(
            resolve_range(Some("bytes=-30"), 100),
            RangeOutcome::Slice { start: 70, end: 99 }
        );
        // A suffix longer than the file is the whole file per RFC 9110.
        assert_eq!(
            resolve_range(Some("bytes=-500"), 100),
            RangeOutcome::Slice { start: 0, end: 99 }
        );
    }

    #[test]
    fn start_past_the_end_is_unsatisfiable() {
        assert_eq!(
            resolve_range(Some("bytes=100-"), 100),
            RangeOutcome::Unsatisfiable
        );
        assert_eq!(
            resolve_range(Some("bytes=200-300"), 100),
            RangeOutcome::Unsatisfiable
        );
        assert_eq!(
            resolve_range(Some("bytes=-0"), 100),
            RangeOutcome::Unsatisfiable
        );
        assert_eq!(
            resolve_range(Some("bytes=0-"), 0),
            RangeOutcome::Unsatisfiable
        );
    }

    #[test]
    fn malformed_and_multipart_specs_fall_back_to_full() {
        assert_eq!(resolve_range(Some("items=0-1"), 100), RangeOutcome::Full);
        assert_eq!(resolve_range(Some("bytes=abc-"), 100), RangeOutcome::Full);
        assert_eq!(resolve_range(Some("bytes=50-10"), 100), RangeOutcome::Full);
        assert_eq!(
            resolve_range(Some("bytes=0-1,5-9"), 100),
            RangeOutcome::Full
        );
        assert_eq!(resolve_range(Some("bytes="), 100), RangeOutcome::Full);
    }

    // ── is_safe_abs_path ─────────────────────────────────────────────

    #[test]
    fn accepts_plain_absolute_paths() {
        assert!(is_safe_abs_path("/data/data/app/tracks/a.mp3"));
        assert!(is_safe_abs_path("C:/music/a.mp3"));
    }

    #[test]
    fn rejects_relative_and_traversal_paths() {
        assert!(!is_safe_abs_path("tracks/a.mp3"));
        assert!(!is_safe_abs_path("/data/../etc/passwd"));
        assert!(!is_safe_abs_path("C:/music/..\\secret.mp3"));
    }

    #[test]
    fn rejects_unc_and_device_prefixes() {
        assert!(!is_safe_abs_path("//server/share/a.mp3"));
        assert!(!is_safe_abs_path("\\\\server\\share\\a.mp3"));
        assert!(!is_safe_abs_path("\\\\?\\C:\\music\\a.mp3"));
        assert!(!is_safe_abs_path("//./PhysicalDrive0"));
    }

    // ── mime_for_path ────────────────────────────────────────────────

    #[test]
    fn maps_common_audio_extensions() {
        assert_eq!(mime_for_path("/a/b.mp3"), "audio/mpeg");
        assert_eq!(mime_for_path("/a/b.FLAC"), "audio/flac");
        assert_eq!(mime_for_path("/a/b.opus"), "audio/ogg");
        assert_eq!(mime_for_path("/a/b.bin"), "application/octet-stream");
    }

    // ── split_token_route ────────────────────────────────────────────

    #[test]
    fn splits_the_token_off_the_route() {
        assert_eq!(
            split_token_route("/abc123/local/C%3A/x.mp3", "abc123"),
            Some("local/C%3A/x.mp3")
        );
        assert_eq!(
            split_token_route("/abc123/nd/song/s1", "abc123"),
            Some("nd/song/s1")
        );
    }

    #[test]
    fn rejects_wrong_or_missing_tokens() {
        assert_eq!(split_token_route("/evil/local/x", "abc123"), None);
        assert_eq!(split_token_route("/abc123", "abc123"), None);
        assert_eq!(split_token_route("/", "abc123"), None);
        assert_eq!(split_token_route("/abc123extra/local/x", "abc123"), None);
    }

    // ── new_token ────────────────────────────────────────────────────

    #[test]
    fn tokens_are_32_hex_chars_and_unique() {
        let a = new_token();
        let b = new_token();
        assert_eq!(a.len(), 32);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }

    // ── allow_origin ─────────────────────────────────────────────────

    #[test]
    fn reflects_known_webview_origins() {
        assert_eq!(
            allow_origin(Some("http://tauri.localhost")),
            "http://tauri.localhost"
        );
        assert_eq!(
            allow_origin(Some("https://tauri.localhost")),
            "https://tauri.localhost"
        );
        assert_eq!(allow_origin(Some("tauri://localhost")), "tauri://localhost");
        assert_eq!(
            allow_origin(Some("http://localhost:1420")),
            "http://localhost:1420"
        );
    }

    #[test]
    fn blocks_unknown_origins_and_wildcards_headerless_requests() {
        assert_eq!(allow_origin(Some("https://evil.example")), "null");
        assert_eq!(allow_origin(None), "*");
    }

    // ── cap_range_span (moved verbatim from stream.rs) ───────────────

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
        assert_eq!(
            cap_range_span(Some("bytes=-500".into()), SPAN).as_deref(),
            Some("bytes=-500")
        );
        assert_eq!(
            cap_range_span(Some("items=0-".into()), SPAN).as_deref(),
            Some("items=0-")
        );
        assert_eq!(
            cap_range_span(Some("bytes=abc-".into()), SPAN).as_deref(),
            Some("bytes=abc-")
        );
    }
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    use std::io::Write;

    /// Remote stub: knows no routes — everything lands on the core's 404,
    /// which is exactly what the core-mechanics tests need.
    #[derive(Clone)]
    struct NoRemote;

    impl RemoteRoutes for NoRemote {
        async fn dispatch(
            &self,
            _rest: String,
            _query: Option<String>,
            _range: Option<String>,
            _origin: Option<String>,
        ) -> Option<http::Response<Body>> {
            None
        }
    }

    /// Real server on `:0` + the current-runtime accept loop; returns the
    /// base URL and the token.
    async fn spawn_test_server() -> (String, String) {
        let (listener, state) = bind_on_loopback().expect("bind loopback");
        listener.set_nonblocking(true).expect("nonblocking");
        let tokio_listener = tokio::net::TcpListener::from_std(listener).expect("tokio listener");
        let base = format!("http://127.0.0.1:{}", state.port);
        let token = state.token.clone();
        let cache = std::env::temp_dir().join(format!("media-server-test-cache-{}", new_token()));
        tokio::spawn(run_accept_loop(
            NoRemote,
            state.token,
            Some(cache),
            tokio_listener,
        ));
        (base, token)
    }

    fn temp_audio_file(bytes: &[u8]) -> std::path::PathBuf {
        let dir = std::env::temp_dir();
        let path = dir.join(format!("media-server-test-{}.mp3", new_token()));
        let mut file = std::fs::File::create(&path).expect("create temp file");
        file.write_all(bytes).expect("write temp file");
        path
    }

    fn encode_path(path: &std::path::Path) -> String {
        let normalized = path.to_string_lossy().replace('\\', "/");
        percent_encoding::utf8_percent_encode(&normalized, percent_encoding::NON_ALPHANUMERIC)
            .to_string()
    }

    const FILE_BODY: &[u8] = b"0123456789abcdefghij"; // 20 bytes

    #[tokio::test]
    async fn serves_the_whole_file_as_200() {
        let (base, token) = spawn_test_server().await;
        let path = temp_audio_file(FILE_BODY);

        let resp = reqwest::get(format!("{base}/{token}/local/{}", encode_path(&path)))
            .await
            .expect("request");

        assert_eq!(resp.status(), 200);
        assert_eq!(resp.headers()["Content-Type"], "audio/mpeg");
        assert_eq!(resp.headers()["Accept-Ranges"], "bytes");
        assert_eq!(resp.headers()["Cache-Control"], "no-store");
        assert_eq!(resp.headers()["Access-Control-Allow-Origin"], "*");
        assert_eq!(resp.bytes().await.expect("body").as_ref(), FILE_BODY);
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn serves_an_open_range_as_206_with_content_range() {
        let (base, token) = spawn_test_server().await;
        let path = temp_audio_file(FILE_BODY);

        let client = reqwest::Client::new();
        let resp = client
            .get(format!("{base}/{token}/local/{}", encode_path(&path)))
            .header("Range", "bytes=10-")
            .send()
            .await
            .expect("request");

        assert_eq!(resp.status(), 206);
        assert_eq!(resp.headers()["Content-Range"], "bytes 10-19/20");
        // Content-Range is not CORS-safelisted — without the expose header
        // scripted readers (fetch) on the webview origin cannot see it.
        assert_eq!(
            resp.headers()["Access-Control-Expose-Headers"],
            "Content-Range, Accept-Ranges, Content-Length",
        );
        assert_eq!(resp.bytes().await.expect("body").as_ref(), &FILE_BODY[10..]);
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn serves_explicit_and_suffix_ranges() {
        let (base, token) = spawn_test_server().await;
        let path = temp_audio_file(FILE_BODY);
        let client = reqwest::Client::new();
        let url = format!("{base}/{token}/local/{}", encode_path(&path));

        let explicit = client
            .get(&url)
            .header("Range", "bytes=5-9")
            .send()
            .await
            .expect("explicit");
        assert_eq!(explicit.status(), 206);
        assert_eq!(explicit.headers()["Content-Range"], "bytes 5-9/20");
        assert_eq!(
            explicit.bytes().await.expect("body").as_ref(),
            &FILE_BODY[5..=9]
        );

        let suffix = client
            .get(&url)
            .header("Range", "bytes=-4")
            .send()
            .await
            .expect("suffix");
        assert_eq!(suffix.status(), 206);
        assert_eq!(suffix.headers()["Content-Range"], "bytes 16-19/20");
        assert_eq!(
            suffix.bytes().await.expect("body").as_ref(),
            &FILE_BODY[16..]
        );
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn range_past_eof_is_416_with_total() {
        let (base, token) = spawn_test_server().await;
        let path = temp_audio_file(FILE_BODY);

        let client = reqwest::Client::new();
        let resp = client
            .get(format!("{base}/{token}/local/{}", encode_path(&path)))
            .header("Range", "bytes=20-")
            .send()
            .await
            .expect("request");

        assert_eq!(resp.status(), 416);
        assert_eq!(resp.headers()["Content-Range"], "bytes */20");
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn answers_cors_preflight_for_range_requests() {
        // Suffix ranges (`bytes=-N`) are not CORS-safelisted, so a scripted
        // fetch preflights with OPTIONS before the GET.
        let (base, token) = spawn_test_server().await;

        let client = reqwest::Client::new();
        let resp = client
            .request(reqwest::Method::OPTIONS, format!("{base}/{token}/local/x"))
            .header("Origin", "http://tauri.localhost")
            .header("Access-Control-Request-Method", "GET")
            .header("Access-Control-Request-Headers", "range")
            .send()
            .await
            .expect("preflight");

        assert_eq!(resp.status(), 204);
        assert_eq!(
            resp.headers()["Access-Control-Allow-Origin"],
            "http://tauri.localhost"
        );
        assert_eq!(resp.headers()["Access-Control-Allow-Methods"], "GET");
        assert_eq!(resp.headers()["Access-Control-Allow-Headers"], "Range");
    }

    fn fixture(name: &str) -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name)
    }

    #[tokio::test]
    async fn alac_m4a_is_served_as_transcoded_wav() {
        let (base, token) = spawn_test_server().await;
        let url = format!(
            "{base}/{token}/local/{}",
            encode_path(&fixture("tiny-alac.m4a"))
        );

        let resp = reqwest::get(&url).await.expect("request");
        assert_eq!(resp.status(), 200);
        assert_eq!(resp.headers()["Content-Type"], "audio/wav");
        assert_eq!(resp.headers()["Accept-Ranges"], "bytes");
        let total: u64 = resp.headers()["Content-Length"]
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        let body = resp.bytes().await.expect("body");
        assert_eq!(&body[..4], b"RIFF");
        assert_eq!(body.len() as u64, total);

        let client = reqwest::Client::new();
        let tail = client
            .get(&url)
            .header("Range", format!("bytes={}-", total - 4))
            .send()
            .await
            .expect("range request");
        assert_eq!(tail.status(), 206);
        assert_eq!(
            tail.headers()["Content-Range"].to_str().unwrap(),
            format!("bytes {}-{}/{}", total - 4, total - 1, total),
        );
        assert_eq!(
            tail.bytes().await.expect("body").as_ref(),
            &body[body.len() - 4..]
        );
    }

    #[tokio::test]
    async fn ape_is_served_as_transcoded_wav() {
        let (base, token) = spawn_test_server().await;
        let url = format!(
            "{base}/{token}/local/{}",
            encode_path(&fixture("tiny-impulse.ape"))
        );

        let resp = reqwest::get(&url).await.expect("request");
        assert_eq!(resp.status(), 200);
        assert_eq!(resp.headers()["Content-Type"], "audio/wav");
        let body = resp.bytes().await.expect("body");
        assert_eq!(&body[..4], b"RIFF");
        // 1.0s of 16-bit 44.1kHz stereo PCM behind a 44-byte header.
        assert_eq!(body.len(), 44 + 44100 * 2 * 2);
    }

    #[tokio::test]
    async fn aac_m4a_is_served_raw() {
        let (base, token) = spawn_test_server().await;
        let path = fixture("tiny-aac.m4a");
        let size = std::fs::metadata(&path).expect("fixture size").len();

        let resp = reqwest::get(format!("{base}/{token}/local/{}", encode_path(&path)))
            .await
            .expect("request");
        assert_eq!(resp.status(), 200);
        assert_eq!(resp.headers()["Content-Type"], "audio/mp4");
        assert_eq!(resp.bytes().await.expect("body").len() as u64, size);
    }

    #[tokio::test]
    async fn wrong_token_is_a_plain_404() {
        let (base, _token) = spawn_test_server().await;
        let path = temp_audio_file(FILE_BODY);

        let resp = reqwest::get(format!("{base}/deadbeef/local/{}", encode_path(&path)))
            .await
            .expect("request");

        assert_eq!(resp.status(), 404);
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn traversal_and_unc_paths_are_403() {
        let (base, token) = spawn_test_server().await;
        let client = reqwest::Client::new();

        let traversal = client
            .get(format!("{base}/{token}/local/%2Fdata%2F..%2Fetc%2Fpasswd"))
            .send()
            .await
            .expect("traversal");
        assert_eq!(traversal.status(), 403);

        let unc = client
            .get(format!("{base}/{token}/local/%2F%2Fserver%2Fshare%2Fa.mp3"))
            .send()
            .await
            .expect("unc");
        assert_eq!(unc.status(), 403);
    }

    #[tokio::test]
    async fn missing_file_is_404_and_unknown_route_is_404() {
        let (base, token) = spawn_test_server().await;
        let client = reqwest::Client::new();

        let missing = client
            .get(format!(
                "{base}/{token}/local/C%3A%2Fdoes-not-exist%2Fx.mp3"
            ))
            .send()
            .await
            .expect("missing");
        assert_eq!(missing.status(), 404);

        let unknown = client
            .get(format!("{base}/{token}/nope/what"))
            .send()
            .await
            .expect("unknown");
        assert_eq!(unknown.status(), 404);
    }

    // ── forward_stream ───────────────────────────────────────────────

    #[tokio::test]
    async fn forward_stream_propagates_status_headers_and_body() {
        let upstream = test_support::spawn_upstream(|_req| {
            http::Response::builder()
                .status(206)
                .header("Content-Type", "audio/flac")
                .header("Content-Range", "bytes 5-9/100")
                .body(Full::new(bytes::Bytes::from_static(b"56789")))
                .expect("upstream response")
        })
        .await;

        let resp = forward_stream(
            &reqwest::Client::new(),
            &format!("{upstream}/rest/stream.view"),
            &[],
            Some("bytes=5-9".into()),
            None,
            Some("http://tauri.localhost"),
        )
        .await
        .expect("forwarded");

        assert_eq!(resp.status(), 206);
        assert_eq!(resp.headers()["Content-Type"], "audio/flac");
        assert_eq!(resp.headers()["Content-Range"], "bytes 5-9/100");
        assert_eq!(resp.headers()["Accept-Ranges"], "bytes");
        assert_eq!(resp.headers()["Cache-Control"], "no-store");
        assert_eq!(
            resp.headers()["Access-Control-Allow-Origin"],
            "http://tauri.localhost"
        );
        let body = resp.into_body().collect().await.expect("body").to_bytes();
        assert_eq!(body.as_ref(), b"56789");
    }

    #[tokio::test]
    async fn forward_stream_caps_open_ranges_and_forwards_request_headers() {
        // The upstream echoes what it received so the test can see the
        // capped Range and the custom header arrive.
        let upstream = test_support::spawn_upstream(|req| {
            let range = req
                .headers()
                .get("Range")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("none")
                .to_owned();
            let marker = req
                .headers()
                .get("X-Test")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("none")
                .to_owned();
            http::Response::builder()
                .status(200)
                .body(Full::new(bytes::Bytes::from(format!("{range}|{marker}"))))
                .expect("upstream response")
        })
        .await;

        let client = reqwest::Client::new();
        let capped = forward_stream(
            &client,
            &upstream,
            &[("X-Test".into(), "1".into())],
            Some("bytes=0-".into()),
            Some(1024),
            None,
        )
        .await
        .expect("capped");
        let body = capped.into_body().collect().await.expect("body").to_bytes();
        assert_eq!(body.as_ref(), b"bytes=0-1023|1");

        let uncapped = forward_stream(&client, &upstream, &[], Some("bytes=0-".into()), None, None)
            .await
            .expect("uncapped");
        let body = uncapped
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        assert_eq!(body.as_ref(), b"bytes=0-|none");
    }

    #[tokio::test]
    async fn reflects_a_known_origin_with_vary() {
        let (base, token) = spawn_test_server().await;
        let path = temp_audio_file(FILE_BODY);

        let client = reqwest::Client::new();
        let resp = client
            .get(format!("{base}/{token}/local/{}", encode_path(&path)))
            .header("Origin", "http://tauri.localhost")
            .send()
            .await
            .expect("request");

        assert_eq!(
            resp.headers()["Access-Control-Allow-Origin"],
            "http://tauri.localhost"
        );
        assert_eq!(resp.headers()["Vary"], "Origin");
        let _ = std::fs::remove_file(path);
    }
}
