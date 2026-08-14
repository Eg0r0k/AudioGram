//! YouTube integration, hybrid architecture:
//! - **Search** goes through rustypipe (Rust Innertube client) — fast, no
//!   subprocess, and metadata endpoints are not gated by YouTube.
//! - **Stream resolution & downloads** go through the `yt-dlp` sidecar. As of
//!   2026-07 YouTube gates raw stream URLs behind the SABR protocol / PO
//!   tokens on every client rustypipe supports (measured: iOS URLs only serve
//!   the first ~1 MiB, the other clients fail deobfuscation; upstream is
//!   dormant since 2025-06). yt-dlp keeps up with these changes daily.
//!
//! No ffmpeg: downloads request the AAC stream (`bestaudio[ext=m4a]`) as-is
//! and tags (title/artist/cover) are written in-process with lofty.

mod browse;
mod download;
mod dto;
mod error;
mod image_proxy;
mod music;
mod stream;

pub use browse::*;
pub use download::*;
pub use dto::*;
pub use error::*;
pub use image_proxy::*;
pub use music::*;
pub use stream::*;

use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime};

use rustypipe::client::RustyPipe;
use rustypipe::model::Thumbnail;

/// Sidecar filename (matches `externalBin: ["binaries/yt-dlp"]`, referenced by stem).
const SIDECAR_YTDLP: &str = "yt-dlp";
/// Subdirectory of the app data dir holding the rustypipe cache
/// (client versions, visitor data).
const RUSTYPIPE_SUBDIR: &str = "rustypipe";

/// The user-configured network proxy URL (`scheme://[user:pass@]host:port`),
/// pushed from the frontend via `set_proxy`. Threaded into the yt-dlp sidecar
/// (`--proxy`), the rustypipe search client and the `stream://` streaming
/// client so all YouTube traffic shares one proxy. `None` means "direct".
#[derive(Default)]
pub struct ProxyState(Mutex<Option<String>>);

impl ProxyState {
    fn set(&self, url: Option<String>) {
        if let Ok(mut guard) = self.0.lock() {
            *guard = url;
        }
    }

    fn get(&self) -> Option<String> {
        self.0.lock().ok().and_then(|guard| guard.clone())
    }
}

/// Lazily built RustyPipe (Innertube) client, used for **search only**.
#[derive(Default)]
pub struct YtClient(tokio::sync::Mutex<YtClientInner>);

#[derive(Default)]
struct YtClientInner {
    client: Option<RustyPipe>,
    /// Proxy URL the current client was built with; a change forces a rebuild.
    proxy: Option<String>,
}

impl YtClient {
    async fn reset(&self) {
        self.0.lock().await.client = None;
    }
}

/// Returns the shared RustyPipe client, (re)building it when the proxy changed.
/// Fully anonymous — no cookies, no login, no botguard: only metadata
/// endpoints (search, video details) are used, which YouTube does not gate.
async fn yt_client<R: Runtime>(app: &AppHandle<R>) -> Result<RustyPipe, String> {
    let proxy = app.state::<ProxyState>().get();
    let state = app.state::<YtClient>();
    let mut inner = state.0.lock().await;

    if inner.client.is_none() || inner.proxy != proxy {
        let storage_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join(RUSTYPIPE_SUBDIR);
        std::fs::create_dir_all(&storage_dir).map_err(|e| e.to_string())?;

        let mut http = reqwest::Client::builder();
        if let Some(url) = &proxy {
            http = http.proxy(reqwest::Proxy::all(url).map_err(|e| e.to_string())?);
        }

        let client = RustyPipe::builder()
            .storage_dir(storage_dir)
            .build_with_client(http)
            .map_err(|e| e.to_string())?;
        // The rustypipe cache persists auth cookies set by older app versions;
        // scrub them so every request stays anonymous.
        let _ = client.user_auth_remove_cookie().await;
        inner.client = Some(client);
        inner.proxy = proxy;
    }

    Ok(inner.client.clone().expect("client built above"))
}

/// Stores the proxy URL for later YouTube/stream use. An empty/blank URL clears it.
#[tauri::command]
pub async fn set_proxy<R: Runtime>(app: AppHandle<R>, url: Option<String>) {
    let normalized = url
        .map(|u| u.trim().to_owned())
        .filter(|u| !u.is_empty());
    app.state::<ProxyState>().set(normalized);
    // Drop the cached Innertube client so the next query picks up the new proxy.
    app.state::<YtClient>().reset().await;
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

/// Kills a spawned sidecar *with its children*.
///
/// yt-dlp ships as a PyInstaller bundle: the process Tauri spawns is only a
/// bootloader that re-executes the real extractor as a child. Terminating the
/// bootloader alone (what `CommandChild::kill` does) leaves that child
/// downloading in the background — an orphan holding the network and the
/// output file until it finishes on its own.
pub(super) fn kill_sidecar_tree(child: tauri_plugin_shell::process::CommandChild) {
    let pid = child.pid();

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        /// Keeps taskkill from flashing a console window.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        if let Err(e) = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
        {
            log::warn!("taskkill for sidecar {pid} failed: {e}");
        }
    }

    #[cfg(not(windows))]
    {
        // Children first: killing the bootloader first would reparent them.
        if let Err(e) = std::process::Command::new("pkill")
            .args(["-KILL", "-P", &pid.to_string()])
            .status()
        {
            log::warn!("pkill for sidecar children of {pid} failed: {e}");
        }
    }

    // The bootloader itself: already gone on Windows (taskkill /T), still
    // running on unix. Either way the error is not actionable.
    let _ = child.kill();
}

/// Builds the yt-dlp `--proxy` args from the shared proxy state, or empty when unset.
fn proxy_args<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
    match app.state::<ProxyState>().get() {
        Some(url) if !url.is_empty() => vec!["--proxy".into(), url],
        _ => Vec::new(),
    }
}

/// Plain reqwest client honoring the shared proxy state; used for cover fetches.
fn http_client<R: Runtime>(app: &AppHandle<R>) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder();
    if let Some(url) = app.state::<ProxyState>().get() {
        builder = builder.proxy(reqwest::Proxy::all(&url).map_err(|e| e.to_string())?);
    }
    builder.build().map_err(|e| e.to_string())
}

fn best_thumbnail(thumbnails: &[Thumbnail]) -> Option<String> {
    thumbnails
        .iter()
        .max_by_key(|t| t.width)
        .map(|t| t.url.clone())
}

fn validate_id(id: String) -> Result<String, String> {
    let id = id.trim().to_owned();
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("invalid video id".into());
    }
    Ok(id)
}

/// Album/playlist/channel browse ids are longer than video ids but share the
/// same character class.
fn validate_browse_id(id: String) -> Result<String, YtError> {
    let id = id.trim().to_owned();
    if id.is_empty()
        || id.len() > 64
        || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(YtError::invalid_input("invalid browse id"));
    }
    Ok(id)
}

pub(crate) use crate::stream::status_response;
