use std::sync::Mutex;

use discord_rich_presence::{DiscordIpc, DiscordIpcClient};
use serde::Deserialize;

use crate::discord_utils::build_activity;

pub type DiscordPresenceState = Mutex<DiscordPresence>;

#[derive(Default)]
pub struct DiscordPresence {
    client_id: Option<String>,
    client: Option<DiscordIpcClient>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordActivityPayload {
    pub(crate) client_id: String,
    pub(crate) title: String,
    pub(crate) artist: Option<String>,
    pub(crate) album: Option<String>,
    pub(crate) duration: Option<f64>,
    pub(crate) position: Option<f64>,
}

#[tauri::command]
pub fn discord_set_activity(
    state: tauri::State<'_, DiscordPresenceState>,
    payload: DiscordActivityPayload,
) -> Result<(), String> {
    let mut presence = state.lock().map_err(|e| e.to_string())?;
    presence.set_activity(payload)
}

#[tauri::command]
pub fn discord_clear_activity(state: tauri::State<'_, DiscordPresenceState>) -> Result<(), String> {
    let mut presence = state.lock().map_err(|e| e.to_string())?;
    presence.clear_activity()
}

impl DiscordPresence {
    fn set_activity(&mut self, payload: DiscordActivityPayload) -> Result<(), String> {
        let client_id = payload.client_id.trim().to_owned();
        if client_id.is_empty() {
            return Err("Discord Client ID is not configured".into());
        }

        let activity = build_activity(payload);
        let client = self.ensure_client(&client_id)?;

        match client.set_activity(activity.clone()) {
            Ok(()) => Ok(()),
            Err(_) => {
                client.reconnect().map_err(|e| e.to_string())?;
                client.set_activity(activity).map_err(|e| e.to_string())
            }
        }
    }

    fn clear_activity(&mut self) -> Result<(), String> {
        let Some(client) = self.client.as_mut() else {
            return Ok(());
        };

        match client.clear_activity() {
            Ok(()) => Ok(()),
            Err(_) => {
                self.client = None;
                self.client_id = None;
                Ok(())
            }
        }
    }

    fn ensure_client(&mut self, client_id: &str) -> Result<&mut DiscordIpcClient, String> {
        let should_recreate = self.client.is_none() || self.client_id.as_deref() != Some(client_id);

        if should_recreate {
            if let Some(client) = self.client.as_mut() {
                let _ = client.close();
            }

            let mut client = DiscordIpcClient::new(client_id);
            client.connect().map_err(|e| e.to_string())?;

            self.client = Some(client);
            self.client_id = Some(client_id.to_owned());
        }

        self.client
            .as_mut()
            .ok_or_else(|| "Discord IPC client is not initialized".into())
    }
}
