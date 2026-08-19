//! The user-configured network proxy shared by every Rust HTTP layer:
//! the yt-dlp sidecar, the rustypipe search client and the `stream://`
//! proxy routes (YouTube and Navidrome alike).

use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime};

/// The proxy URL (`scheme://[user:pass@]host:port`) pushed from the frontend
/// via `set_proxy`. `None` means "direct".
#[derive(Default)]
pub struct ProxyState(Mutex<Option<String>>);

impl ProxyState {
    pub(crate) fn set(&self, url: Option<String>) {
        if let Ok(mut guard) = self.0.lock() {
            *guard = url;
        }
    }

    pub(crate) fn get(&self) -> Option<String> {
        self.0.lock().ok().and_then(|guard| guard.clone())
    }
}

/// Stores the proxy URL for later streaming use. An empty/blank URL clears it.
#[tauri::command]
pub async fn set_proxy<R: Runtime>(app: AppHandle<R>, url: Option<String>) {
    let normalized = url
        .map(|u| u.trim().to_owned())
        .filter(|u| !u.is_empty());
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

    let proxy = reqwest::Proxy::all(&url).map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder()
        .proxy(proxy)
        .timeout(std::time::Duration::from_secs(10))
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

    Ok(started.elapsed().as_millis() as u64)
}
