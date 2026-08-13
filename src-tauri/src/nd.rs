//! Navidrome (Subsonic) configuration state.
//!
//! Credentials arrive once from the frontend (`nd_set_config`) and live only
//! in this state; the `stream://` proxy builds auth tokens from it on the
//! Rust side so they never appear in media-element URLs, DevTools or logs.

use std::sync::RwLock;

use serde::Deserialize;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
// Field reads land with the stream:// nd routes.
#[allow(dead_code)]
pub struct NdConfig {
    pub base_url: String,
    pub username: String,
    pub password: String,
}

#[derive(Default)]
pub struct NdState(RwLock<Option<NdConfig>>);

impl NdState {
    // Consumed by the stream:// nd routes.
    #[allow(dead_code)]
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
