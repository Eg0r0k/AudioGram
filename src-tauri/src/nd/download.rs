//! Offline-copy downloads: `nd_download` streams the original file into the
//! temp dir with progress and polled cancellation.

use std::collections::HashMap;
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime};

use super::config::{NdConfig, NdState};

/// Where `nd_download` writes before the JS side moves the finished file
/// into offline storage via `importFile`. Orphans (crashed downloads) are
/// swept by the download manager before its first job starts.
const DOWNLOAD_TMP_SUBDIR: &str = "downloads-tmp";

/// Progress emitted at most every this many bytes — chunks are tiny.
const PROGRESS_EMIT_STEP: u64 = 256 * 1024;

/// In-flight ND downloads by song id — cancellation flags consumed by
/// `nd_download_cancel`. The manager guarantees one active job per track, so
/// the song id is the natural key (job ids stay a JS concept).
#[derive(Default)]
pub struct NdDownloadRegistry(Mutex<HashMap<String, Arc<AtomicBool>>>);

impl NdDownloadRegistry {
    fn register(&self, id: &str) -> Result<Arc<AtomicBool>, String> {
        let mut map = self.0.lock().map_err(|_| "registry poisoned".to_string())?;
        if map.contains_key(id) {
            return Err("download already in progress".into());
        }
        let flag = Arc::new(AtomicBool::new(false));
        map.insert(id.to_owned(), Arc::clone(&flag));
        Ok(flag)
    }

    fn deregister(&self, id: &str) {
        if let Ok(mut map) = self.0.lock() {
            map.remove(id);
        }
    }

    fn cancel(&self, id: &str) -> bool {
        let Ok(map) = self.0.lock() else {
            return false;
        };
        match map.get(id) {
            Some(flag) => {
                flag.store(true, Ordering::SeqCst);
                true
            }
            None => false,
        }
    }
}

/// Same wire shape as `YtDownloadEvent` — the download manager is
/// source-agnostic over `{ type, data }` progress events.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "data")]
pub enum NdDownloadEvent {
    Progress { downloaded: u64, total: Option<u64> },
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NdDownloadResult {
    /// Absolute path of the finished temp file.
    pub path: String,
    /// Extension the file was written with (normalized lowercase).
    pub ext: String,
}

fn ext_from_content_type(content_type: &str) -> Option<&'static str> {
    match content_type.split(';').next().unwrap_or("").trim() {
        "audio/flac" | "audio/x-flac" => Some("flac"),
        "audio/mpeg" => Some("mp3"),
        "audio/mp4" | "audio/m4a" | "audio/x-m4a" => Some("m4a"),
        "audio/ogg" | "application/ogg" => Some("ogg"),
        "audio/opus" => Some("opus"),
        "audio/wav" | "audio/x-wav" => Some("wav"),
        "audio/aac" => Some("aac"),
        _ => None,
    }
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn normalized_suffix(suffix: Option<&str>) -> Option<String> {
    let s = suffix?.trim().to_ascii_lowercase();
    if s.is_empty() || s.len() > 8 || !s.chars().all(|c| c.is_ascii_alphanumeric()) {
        return None;
    }
    Some(s)
}

/// Downloads the whole original file (`stream.view?format=raw`) into
/// `downloads-tmp/<songId>.<ext>`, streaming progress over the channel.
/// Cancellation is polled between chunks; a cancelled download removes its
/// partial file and errors with "cancelled". Logs carry only the song id.
#[tauri::command]
pub async fn nd_download<R: Runtime>(
    app: AppHandle<R>,
    song_id: String,
    suffix: Option<String>,
    on_progress: Channel<NdDownloadEvent>,
) -> Result<NdDownloadResult, String> {
    if !valid_id(&song_id) {
        return Err("invalid song id".into());
    }
    let Some(config) = app.state::<NdState>().get() else {
        return Err("nd source is not configured".into());
    };

    let cancelled = app.state::<NdDownloadRegistry>().register(&song_id)?;
    let result = download_to_tmp(&app, &config, &song_id, suffix, &on_progress, &cancelled).await;
    app.state::<NdDownloadRegistry>().deregister(&song_id);

    match &result {
        Ok(_) => log::info!("nd_download {song_id}: done"),
        Err(e) => log::info!("nd_download {song_id}: {e}"),
    }
    result
}

async fn download_to_tmp<R: Runtime>(
    app: &AppHandle<R>,
    config: &NdConfig,
    song_id: &str,
    suffix: Option<String>,
    on_progress: &Channel<NdDownloadEvent>,
    cancelled: &AtomicBool,
) -> Result<NdDownloadResult, String> {
    let url = config.rest_url("stream.view", song_id, "&format=raw");
    let client = reqwest::Client::new();
    let mut resp = client.get(&url).send().await.map_err(|e| {
        // reqwest errors can embed the URL (auth token) — never propagate it.
        format!("request failed: {}", e.without_url())
    })?;

    let status = resp.status().as_u16();
    if status != 200 {
        return Err(format!("upstream status {status}"));
    }

    let ext = normalized_suffix(suffix.as_deref())
        .or_else(|| {
            resp.headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .and_then(ext_from_content_type)
                .map(str::to_owned)
        })
        .unwrap_or_else(|| "bin".to_owned());
    let total = resp.content_length();

    let tmp_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(DOWNLOAD_TMP_SUBDIR);
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let path = tmp_dir.join(format!("{song_id}.{ext}"));

    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut last_emitted: u64 = 0;

    loop {
        if cancelled.load(Ordering::SeqCst) {
            drop(file);
            let _ = std::fs::remove_file(&path);
            return Err("cancelled".into());
        }
        let chunk = match resp.chunk().await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(e) => {
                drop(file);
                let _ = std::fs::remove_file(&path);
                return Err(format!("download failed: {}", e.without_url()));
            }
        };
        if let Err(e) = file.write_all(&chunk) {
            drop(file);
            let _ = std::fs::remove_file(&path);
            return Err(e.to_string());
        }
        downloaded += chunk.len() as u64;
        if downloaded - last_emitted >= PROGRESS_EMIT_STEP {
            last_emitted = downloaded;
            let _ = on_progress.send(NdDownloadEvent::Progress { downloaded, total });
        }
    }

    file.flush().map_err(|e| e.to_string())?;
    let _ = on_progress.send(NdDownloadEvent::Progress {
        downloaded,
        total: Some(downloaded),
    });
    Ok(NdDownloadResult {
        path: path.to_string_lossy().into_owned(),
        ext,
    })
}

/// Flags the in-flight download as cancelled; the download loop notices
/// between chunks. Idempotent — cancelling a finished download is a no-op.
#[tauri::command]
pub fn nd_download_cancel<R: Runtime>(app: AppHandle<R>, song_id: String) -> Result<(), String> {
    if !app.state::<NdDownloadRegistry>().cancel(&song_id) {
        log::info!("nd_download_cancel {song_id}: not in flight");
    }
    Ok(())
}
