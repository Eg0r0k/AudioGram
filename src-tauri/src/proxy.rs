//! The user-configured network proxy shared by every Rust HTTP layer: the
//! yt-dlp sidecar, the rustypipe search client and the remote routes of the
//! loopback media server (YouTube and Navidrome alike).
//!
//! The shared [`reqwest::Client`] lives here too: the media element opens a
//! fresh Range request per seek and every ~1 MiB of a YouTube stream, and a
//! client built per request means a new connection pool — and a new TLS
//! handshake — every time. One client per proxy configuration keeps the
//! connections alive across requests.

use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager, Runtime};

/// Reaching the server at all.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
/// Gap between two reads of the body. NOT a total request timeout: a whole
/// track legitimately takes minutes to stream, but a source that goes quiet
/// mid-body must not hang forever — an upstream that stalls after sending its
/// headers leaves the media element waiting for bytes that never arrive, with
/// nothing on this side ever giving up. If that happens before the element has
/// metadata the engine's own readiness timeout eventually errors out; if it
/// happens mid-playback nothing does, and playback simply stops.
const READ_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Default)]
struct ProxyInner {
    /// `scheme://[user:pass@]host:port`; `None` means "direct".
    url: Option<String>,
    /// Built lazily for the current `url`, dropped whenever it changes.
    client: Option<reqwest::Client>,
}

/// The proxy URL pushed from the frontend via `set_proxy`, plus the shared
/// HTTP client honoring it.
#[derive(Default)]
pub struct ProxyState(Mutex<ProxyInner>);

impl ProxyState {
    pub(crate) fn set(&self, url: Option<String>) {
        if let Ok(mut inner) = self.0.lock() {
            if inner.url != url {
                inner.url = url;
                inner.client = None;
            }
        }
    }

    pub(crate) fn get(&self) -> Option<String> {
        self.0.lock().ok().and_then(|inner| inner.url.clone())
    }

    /// The shared client for the current proxy, built on first use after
    /// every proxy change. `reqwest::Client` is an `Arc` inside, so the clone
    /// is a refcount bump and every caller shares one connection pool.
    /// Errors are proxy-config errors — they never carry request URLs.
    pub(crate) fn client(&self) -> Result<reqwest::Client, String> {
        let mut inner = self
            .0
            .lock()
            .map_err(|_| "proxy state poisoned".to_string())?;
        if let Some(client) = &inner.client {
            return Ok(client.clone());
        }
        let client = client_builder(inner.url.as_deref())?
            .connect_timeout(CONNECT_TIMEOUT)
            .read_timeout(READ_TIMEOUT)
            .build()
            .map_err(|e| e.to_string())?;
        inner.client = Some(client.clone());
        Ok(client)
    }
}

/// A reqwest builder with the proxy applied — the one place a proxy URL is
/// parsed, so every client (including the one handed to rustypipe) agrees
/// on what an invalid URL means: an error, never a silent direct connection.
pub(crate) fn client_builder(proxy: Option<&str>) -> Result<reqwest::ClientBuilder, String> {
    let mut builder = reqwest::Client::builder();
    if let Some(url) = proxy {
        builder = builder.proxy(reqwest::Proxy::all(url).map_err(|e| e.to_string())?);
    }
    Ok(builder)
}

/// The shared client honoring the proxy state — see [`ProxyState::client`].
pub(crate) fn http_client<R: Runtime>(app: &AppHandle<R>) -> Result<reqwest::Client, String> {
    app.state::<ProxyState>().client()
}

/// Stores the proxy URL for later streaming use. An empty/blank URL clears it.
#[tauri::command]
pub async fn set_proxy<R: Runtime>(app: AppHandle<R>, url: Option<String>) {
    let normalized = url.map(|u| u.trim().to_owned()).filter(|u| !u.is_empty());
    app.state::<ProxyState>().set(normalized);
    // Drop the cached Innertube client so the next query picks up the new proxy.
    #[cfg(desktop)]
    app.state::<crate::youtube::YtClient>().reset().await;
}

/// Verifies the proxy actually connects by fetching a lightweight endpoint
/// through it. Returns the round-trip latency in milliseconds on success.
#[tauri::command]
pub async fn proxy_check(url: String) -> Result<u64, String> {
    let url = url.trim().to_owned();
    if url.is_empty() {
        return Err("empty proxy url".into());
    }

    let client = client_builder(Some(&url))?
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let started = std::time::Instant::now();
    let response = client
        .get("https://www.youtube.com/generate_204")
        .header(reqwest::header::USER_AGENT, "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status().as_u16();
    if !(200..=399).contains(&status) {
        return Err(format!("proxy responded with status {status}"));
    }

    Ok(u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX))
}

#[cfg(test)]
mod tests {
    use super::ProxyState;

    #[test]
    fn client_is_shared_until_the_proxy_changes() {
        let state = ProxyState::default();

        // `reqwest::Client` has no identity API, so the cache slot itself is
        // what the test observes.
        state.client().expect("direct client");
        assert!(state.0.lock().unwrap().client.is_some());

        state.set(Some("socks5://127.0.0.1:1080".into()));
        assert!(
            state.0.lock().unwrap().client.is_none(),
            "proxy change drops the client"
        );

        state.client().expect("proxied client");
        state.set(Some("socks5://127.0.0.1:1080".into()));
        assert!(
            state.0.lock().unwrap().client.is_some(),
            "same url keeps the client"
        );
    }

    #[test]
    fn an_invalid_proxy_url_is_an_error_not_a_direct_connection() {
        let state = ProxyState::default();
        state.set(Some("not a url".into()));

        assert!(state.client().is_err());
    }
}
