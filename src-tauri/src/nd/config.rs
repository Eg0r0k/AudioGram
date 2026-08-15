//! Navidrome config state: the auth material and URL building shared by
//! every nd route.

use std::sync::RwLock;

use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde::Deserialize;

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

    pub(super) fn rest_url(&self, endpoint: &str, id: &str, extra: &str) -> String {
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
