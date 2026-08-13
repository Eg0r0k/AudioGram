//! Track downloads via the yt-dlp sidecar with in-process tagging (lofty).

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use lofty::config::WriteOptions;
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::prelude::*;
use lofty::tag::{Tag, TagType};

use super::{
    http_client, is_allowed_image_host, proxy_args, validate_id, yt_client, YtError, SIDECAR_YTDLP,
};

/// Where downloaded originals land before the import pipeline copies them into managed storage.
const DOWNLOAD_SUBDIR: &str = "youtube-cache";
/// Audio container we download; always importable (see AUDIO_FILE_EXTENSIONS).
const AUDIO_FORMAT: &str = "m4a";
/// Literal marker prefixed inside the yt-dlp progress template. The leading
/// `download:` selector is consumed by yt-dlp, so we tag our own lines.
const PROGRESS_MARKER: &str = "AGPROG:";

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtDownloadResult {
    /// Absolute path to the downloaded audio file, ready for the import pipeline.
    path: String,
}

/// Known-good metadata supplied by the frontend (search/playlist results), so
/// YT Music tracks get real artist/album tags instead of the channel-name
/// heuristic derived from `video_details`.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YtTrackMeta {
    pub title: String,
    pub artists: Vec<String>,
    pub album: Option<String>,
    pub cover_url: Option<String>,
}

/// In-flight yt-dlp processes by video id — the double-download guard and the
/// handle `yt_download_cancel` kills.
#[derive(Default)]
pub struct YtDownloadRegistry(Mutex<HashMap<String, DownloadHandle>>);

struct DownloadHandle {
    /// Taken (consumed) by cancellation; `CommandChild::kill` takes ownership.
    child: Option<CommandChild>,
    cancelled: bool,
}

impl YtDownloadRegistry {
    /// Registers a spawned download; errors if the id is already in flight.
    fn register(&self, id: &str, child: CommandChild) -> Result<(), YtError> {
        let mut map = self.0.lock().map_err(|_| YtError::unknown("registry poisoned"))?;
        if map.contains_key(id) {
            return Err(YtError::invalid_input("download already in progress"));
        }
        map.insert(id.to_owned(), DownloadHandle { child: Some(child), cancelled: false });
        Ok(())
    }

    /// Removes the entry, reporting whether the download had been cancelled.
    fn deregister(&self, id: &str) -> bool {
        self.0
            .lock()
            .ok()
            .and_then(|mut map| map.remove(id))
            .is_some_and(|handle| handle.cancelled)
    }

    /// Marks the download cancelled and kills the child if still running.
    fn cancel(&self, id: &str) -> bool {
        let Ok(mut map) = self.0.lock() else { return false };
        let Some(handle) = map.get_mut(id) else { return false };
        handle.cancelled = true;
        if let Some(child) = handle.child.take() {
            if let Err(e) = child.kill() {
                log::warn!("yt_download_cancel {id}: kill failed: {e}");
            }
        }
        true
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "data")]
pub enum YtDownloadEvent {
    Progress { downloaded: u64, total: Option<u64> },
    Processing,
}

#[tauri::command]
pub async fn yt_download<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    meta: Option<YtTrackMeta>,
    on_progress: Channel<YtDownloadEvent>,
) -> Result<YtDownloadResult, YtError> {
    let id = validate_id(id).map_err(YtError::invalid_input)?;

    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(DOWNLOAD_SUBDIR);
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;

    let output_template = cache_dir.join("%(id)s.%(ext)s");
    let url = format!("https://www.youtube.com/watch?v={id}");

    // No `--extract-audio`/`--embed-*`: the m4a stream is downloaded as-is
    // (no ffmpeg in the bundle) and tagged in-process with lofty below.
    let mut args: Vec<String> = vec![
        url,
        "-f".into(),
        format!("bestaudio[ext={AUDIO_FORMAT}]"),
        "--no-playlist".into(),
        "--no-warnings".into(),
        "--newline".into(),
        "--progress-template".into(),
        format!("download:{PROGRESS_MARKER}%(progress.downloaded_bytes)s/%(progress.total_bytes)s/%(progress.total_bytes_estimate)s"),
        "-o".into(),
        output_template.to_string_lossy().into_owned(),
    ];
    args.extend(proxy_args(&app));

    let (mut rx, child) = app
        .shell()
        .sidecar(SIDECAR_YTDLP)
        .map_err(|e| e.to_string())?
        .args(args)
        .spawn()
        .map_err(|e| e.to_string())?;

    let registry = app.state::<YtDownloadRegistry>();
    registry.register(&id, child)?;

    let mut last_error = String::new();
    let mut exit_error: Option<String> = None;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                for line in text.lines() {
                    let line = line.trim();
                    if let Some(rest) = line.strip_prefix(PROGRESS_MARKER) {
                        if let Some((downloaded, total)) = parse_progress(rest) {
                            let _ = on_progress.send(YtDownloadEvent::Progress { downloaded, total });
                        }
                    } else if line.starts_with("ERROR") {
                        last_error = line.to_owned();
                    }
                }
            }
            CommandEvent::Terminated(payload) => {
                if payload.code != Some(0) {
                    exit_error = Some(if last_error.is_empty() {
                        format!("yt-dlp exited with code {:?}", payload.code)
                    } else {
                        last_error.clone()
                    });
                }
            }
            _ => {}
        }
    }

    let was_cancelled = registry.deregister(&id);
    if was_cancelled {
        cleanup_partial_files(&cache_dir, &id);
        return Err(YtError::cancelled("download cancelled"));
    }
    if let Some(detail) = exit_error {
        return Err(YtError::unknown(detail));
    }

    let path = cache_dir.join(format!("{id}.{AUDIO_FORMAT}"));
    if !path.exists() {
        return Err(YtError::unknown("download finished but the output file was not found"));
    }

    let _ = on_progress.send(YtDownloadEvent::Processing);

    // Tag parity with the old `--embed-metadata --embed-thumbnail`: title,
    // artist and cover art let the import pipeline pick up proper metadata.
    // Best-effort — a tagging failure must not lose the finished download.
    if let Err(e) = embed_metadata(&app, &path, &id, meta).await {
        log::warn!("failed to embed metadata into {id}.{AUDIO_FORMAT}: {e}");
    }

    Ok(YtDownloadResult {
        path: path.to_string_lossy().into_owned(),
    })
}

/// Kills an in-flight download. No-op when the id is not downloading.
#[tauri::command]
pub async fn yt_download_cancel<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), YtError> {
    let id = validate_id(id).map_err(YtError::invalid_input)?;
    app.state::<YtDownloadRegistry>().cancel(&id);
    Ok(())
}

/// Removes yt-dlp leftovers after a kill. Windows may hold the `.part` lock
/// briefly, hence best-effort.
fn cleanup_partial_files(cache_dir: &std::path::Path, id: &str) {
    for suffix in [
        format!("{id}.{AUDIO_FORMAT}.part"),
        format!("{id}.{AUDIO_FORMAT}.ytdl"),
        format!("{id}.{AUDIO_FORMAT}"),
    ] {
        let path = cache_dir.join(&suffix);
        if path.exists() {
            if let Err(e) = std::fs::remove_file(&path) {
                log::warn!("failed to remove partial file {suffix}: {e}");
            }
        }
    }
}

/// Parses a `downloaded/total/estimate` progress line. yt-dlp emits `NA` for
/// unknown fields, which fails to parse and is treated as absent.
fn parse_progress(rest: &str) -> Option<(u64, Option<u64>)> {
    let mut parts = rest.split('/');
    let downloaded = parts.next()?.trim().parse::<u64>().ok()?;
    let total = parts.next().and_then(|s| s.trim().parse::<u64>().ok());
    let estimate = parts.next().and_then(|s| s.trim().parse::<u64>().ok());
    Some((downloaded, total.or(estimate)))
}

/// Writes title/artist/cover into the downloaded m4a (MP4 ilst atoms).
/// Frontend-supplied `meta` wins (YT Music tracks carry real artist/album);
/// otherwise metadata falls back to rustypipe `video_details` (not
/// stream-gated) and the cover to i.ytimg.com.
async fn embed_metadata<R: Runtime>(
    app: &AppHandle<R>,
    path: &std::path::Path,
    id: &str,
    meta: Option<YtTrackMeta>,
) -> Result<(), String> {
    let mut tag = Tag::new(TagType::Mp4Ilst);
    let mut cover_url: Option<String> = None;

    if let Some(meta) = meta {
        // Album fallback = track title ("single" convention). The library's
        // data model attaches covers to ALBUMS only (CoverOwnerType has no
        // "track"), so without an album tag the importer drops the embedded
        // artwork and the track shows without a cover.
        tag.set_album(meta.album.unwrap_or_else(|| meta.title.clone()));
        tag.set_title(meta.title);
        if !meta.artists.is_empty() {
            tag.set_artist(meta.artists.join(", "));
        }
        // SSRF guard: the frontend-provided URL must point at a known host.
        cover_url = meta.cover_url.filter(|url| {
            tauri::Url::parse(url).is_ok_and(|u| {
                u.scheme() == "https" && u.host_str().is_some_and(is_allowed_image_host)
            })
        });
    } else {
        match yt_client(app).await {
            Ok(rp) => match rp.query().video_details(id).await {
                Ok(details) => {
                    tag.set_album(details.name.clone());
                    tag.set_title(details.name);
                    tag.set_artist(details.channel.name);
                }
                Err(e) => {
                    log::warn!("video_details for {id} failed, tagging with id only: {e}");
                    tag.set_title(id.to_owned());
                    tag.set_album(id.to_owned());
                }
            },
            Err(e) => {
                log::warn!("rustypipe client unavailable, tagging with id only: {e}");
                tag.set_title(id.to_owned());
                tag.set_album(id.to_owned());
            }
        }
    }

    if let Ok(http) = http_client(app) {
        match fetch_cover(&http, id, cover_url.as_deref()).await {
            Some((bytes, mime)) => tag.push_picture(
                Picture::unchecked(bytes)
                    .pic_type(PictureType::CoverFront)
                    .mime_type(mime)
                    .build(),
            ),
            None => log::warn!("no cover fetched for {id}; track will be tagged without artwork"),
        }
    }

    let path = path.to_path_buf();
    tokio::task::spawn_blocking(move || tag.save_to_path(&path, WriteOptions::default()))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Fetches the cover, preferring the caller-provided (already host-validated)
/// URL over the i.ytimg fallbacks. MP4 covers only allow JPEG/PNG, so other
/// content types (lh3 serves webp without the `-rj` suffix) are skipped.
async fn fetch_cover(
    http: &reqwest::Client,
    id: &str,
    preferred: Option<&str>,
) -> Option<(Vec<u8>, MimeType)> {
    let fallbacks = ["maxresdefault", "hqdefault"]
        .map(|name| format!("https://i.ytimg.com/vi/{id}/{name}.jpg"));
    let urls = preferred
        .map(str::to_owned)
        .into_iter()
        .chain(fallbacks);

    for url in urls {
        let Ok(response) = http.get(&url).send().await else {
            continue;
        };
        if !response.status().is_success() {
            continue;
        }
        let mime = match response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
        {
            Some(ct) if ct.starts_with("image/jpeg") => MimeType::Jpeg,
            Some(ct) if ct.starts_with("image/png") => MimeType::Png,
            _ => continue,
        };
        if let Ok(bytes) = response.bytes().await {
            return Some((bytes.to_vec(), mime));
        }
    }
    None
}
