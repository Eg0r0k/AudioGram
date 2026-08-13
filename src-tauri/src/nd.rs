//! Navidrome (Subsonic) configuration state and the nd routes of the
//! `stream://` proxy.
//!
//! The frontend derives `{token, salt}` from the password once per config
//! change (`nd_set_config`); the raw password never reaches Rust and the
//! token never appears in media-element URLs, DevTools or logs — upstream
//! URLs are built here and never logged.

use std::sync::RwLock;

use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde::Deserialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::stream::{forward_get, status_response};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NdConfig {
    pub base_url: String,
    pub username: String,
    /// `md5(password + salt)` — precomputed on the JS side.
    pub token: String,
    pub salt: String,
}

impl NdConfig {
    fn auth_query(&self) -> String {
        format!(
            "u={}&t={}&s={}&v=1.16.1&c=audiogram&f=json",
            utf8_percent_encode(&self.username, NON_ALPHANUMERIC),
            utf8_percent_encode(&self.token, NON_ALPHANUMERIC),
            utf8_percent_encode(&self.salt, NON_ALPHANUMERIC),
        )
    }

    fn rest_url(&self, endpoint: &str, id: &str, extra: &str) -> String {
        let base = self.base_url.trim_end_matches('/');
        let id = utf8_percent_encode(id, NON_ALPHANUMERIC);
        let auth = self.auth_query();
        format!("{base}/rest/{endpoint}?id={id}{extra}&{auth}")
    }
}

#[derive(Default)]
pub struct NdState(RwLock<Option<NdConfig>>);

impl NdState {
    pub fn get(&self) -> Option<NdConfig> {
        self.0.read().ok().and_then(|guard| guard.clone())
    }
}

/// Replaces the stored Navidrome config (`None` disables the source).
/// Called on startup and whenever the source settings change.
#[tauri::command]
pub fn nd_set_config(
    state: tauri::State<'_, NdState>,
    config: Option<NdConfig>,
) -> Result<(), String> {
    let mut guard = state
        .0
        .write()
        .map_err(|_| "nd config lock poisoned".to_string())?;
    *guard = config;
    Ok(())
}

/// `stream://…/nd/song/<songId>` → `stream.view?format=raw` with Rust-built
/// auth. Upstream 4xx/5xx becomes 502; logs carry only the song id.
pub(crate) async fn stream_song<R: Runtime>(
    app: &AppHandle<R>,
    song_id: &str,
    range: Option<String>,
) -> Result<tauri::http::Response<Vec<u8>>, String> {
    let Some(config) = app.state::<NdState>().get() else {
        return Ok(status_response(503));
    };

    let url = config.rest_url("stream.view", song_id, "&format=raw");
    let response = forward_get(&url, None, range, None).await?;
    if response.status().as_u16() >= 400 {
        log::warn!("stream nd/song/{song_id}: upstream status {}", response.status());
        return Ok(status_response(502));
    }
    Ok(response)
}

/// `stream://…/nd/cover/<coverId>?size=<px>` → `getCoverArt.view`. Proxied so
/// the canvas stays untainted for palette extraction.
pub(crate) async fn fetch_cover<R: Runtime>(
    app: &AppHandle<R>,
    cover_id: &str,
    query: Option<&str>,
) -> Result<tauri::http::Response<Vec<u8>>, String> {
    let Some(config) = app.state::<NdState>().get() else {
        return Ok(status_response(503));
    };

    let size = query
        .and_then(|q| q.split('&').find_map(|pair| pair.strip_prefix("size=")))
        .filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()))
        .map(|s| format!("&size={s}"))
        .unwrap_or_default();

    let url = config.rest_url("getCoverArt.view", cover_id, &size);
    let response = forward_get(&url, None, None, None).await?;
    if response.status().as_u16() >= 400 {
        log::warn!("stream nd/cover/{cover_id}: upstream status {}", response.status());
        return Ok(status_response(502));
    }
    Ok(response)
}
