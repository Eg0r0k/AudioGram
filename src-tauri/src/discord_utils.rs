use std::time::{SystemTime, UNIX_EPOCH};

use discord_rich_presence::activity;

use crate::discord::DiscordActivityPayload;

pub fn build_activity(payload: DiscordActivityPayload) -> activity::Activity<'static> {
    let title = presence_text(Some(payload.title), "Unknown track");
    let artist = presence_text(payload.artist, "Unknown artist");
    let album = payload.album.and_then(|value| {
        let value = presence_text(Some(value), "");
        (!value.is_empty()).then_some(value)
    });

    let mut presence = activity::Activity::new()
        .activity_type(activity::ActivityType::Listening)
        .name("Audiogram")
        .details(title)
        .state(match album {
            Some(album) => format!("{artist} - {album}"),
            None => artist,
        });

    if let Some(timestamps) = build_timestamps(payload.duration, payload.position) {
        presence = presence.timestamps(timestamps);
    }

    presence
}

fn build_timestamps(duration: Option<f64>, position: Option<f64>) -> Option<activity::Timestamps> {
    let duration = duration?.max(0.0).round() as i64;
    if duration <= 0 {
        return None;
    }

    let position = position
        .unwrap_or(0.0)
        .max(0.0)
        .min(duration as f64)
        .round() as i64;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_secs() as i64;
    let start = now.saturating_sub(position);
    let end = start.saturating_add(duration);

    Some(activity::Timestamps::new().start(start).end(end))
}

fn presence_text(value: Option<String>, fallback: &str) -> String {
    let text = value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback.to_owned());

    text.chars().take(128).collect()
}
