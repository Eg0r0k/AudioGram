use std::{fs, path::Path};

use tauri::Manager;

#[cfg(desktop)]
use tauri::Emitter;

#[cfg(desktop)]
mod updater;

#[cfg(desktop)]
mod tray;

#[cfg(desktop)]
mod discord;

#[cfg(desktop)]
mod discord_utils;

#[cfg(desktop)]
mod youtube;

mod media_server;

mod nd;

mod transcode;

mod proxy;

fn dir_size(path: &Path) -> u64 {
    let mut total = 0;

    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };

    for entry in entries.flatten() {
        let Ok(metadata) = entry.metadata() else {
            continue;
        };

        if metadata.is_dir() {
            total += dir_size(&entry.path());
        } else {
            total += metadata.len();
        }
    }

    total
}

#[tauri::command]
async fn app_data_folder_size(app: tauri::AppHandle, folder: String) -> Result<u64, String> {
    match folder.as_str() {
        "tracks" | "lyrics" | "offline" | "offline/nd" | "offline/yt" => {}
        _ => return Err("unsupported app data folder".into()),
    }

    let target = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(folder);

    tauri::async_runtime::spawn_blocking(move || dir_size(&target))
        .await
        .map_err(|e| e.to_string())
}

/// True when `rel` can be safely joined under app-data: relative, and made of
/// plain components only (no `..`, no roots, no prefixes).
fn is_safe_import_target(rel: &Path) -> bool {
    !rel.as_os_str().is_empty()
        && rel
            .components()
            .all(|c| matches!(c, std::path::Component::Normal(_)))
}

/// Native-side copy for track import. The JS fallback streams Android SAF
/// sources (`content://`, unreachable by std::fs) through the WebView bridge
/// in 1 MiB chunks — ~500 IPC crossings for a 250 MB file, which takes
/// minutes on a phone. Here the SAF URI resolves to a raw fd once and the
/// whole `io::copy` stays native.
#[tauri::command]
async fn import_local_file(
    app: tauri::AppHandle,
    source: String,
    target_rel: String,
) -> Result<u64, String> {
    use std::str::FromStr;
    use tauri_plugin_fs::{FilePath, FsExt, OpenOptions};

    let rel = std::path::PathBuf::from(&target_rel);
    if !is_safe_import_target(&rel) {
        return Err("invalid target path".into());
    }

    let target = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(rel);
    let source_path = FilePath::from_str(&source).map_err(|e| e.to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut options = OpenOptions::new();
        options.read(true);
        let mut src = app
            .fs()
            .open(source_path, options)
            .map_err(|e| e.to_string())?;
        let mut dst = std::fs::File::create(&target).map_err(|e| e.to_string())?;
        std::io::copy(&mut src, &mut dst).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod import_target_tests {
    use super::is_safe_import_target;
    use std::path::Path;

    #[test]
    fn accepts_plain_relative_paths() {
        assert!(is_safe_import_target(Path::new("tracks/a.flac")));
        assert!(is_safe_import_target(Path::new("offline/nd/x.mp3")));
    }

    #[test]
    fn rejects_traversal_roots_and_empty() {
        assert!(!is_safe_import_target(Path::new("../x")));
        assert!(!is_safe_import_target(Path::new("tracks/../../x")));
        assert!(!is_safe_import_target(Path::new("/abs/path")));
        assert!(!is_safe_import_target(Path::new("")));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Bound BEFORE any webview exists so the frontend can never observe a
    // non-listening media server. Binding loopback:0 only fails on a broken
    // network stack — without the playback transport the app is useless, so
    // failing fast beats limping on.
    let (media_listener, media_state) = media_server::bind_on_loopback()
        .expect("failed to bind the loopback media server");
    let media_token = media_state.token.clone();

    let builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                // Trace is the plugin default and on Android the jni crate
                // traces every native call — thousands of lines per second of
                // audio, drowning app messages and hammering the log file.
                .level(log::LevelFilter::Info)
                .max_file_size(5 * 1_024 * 1_024) // 5 MB per log file
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .manage(proxy::ProxyState::default())
        .manage(nd::NdState::default())
        .manage(nd::NdAudioCache::default())
        .manage(nd::NdDownloadRegistry::default())
        .manage(media_state);

    #[cfg(desktop)]
    let builder = builder
        .manage(discord::DiscordPresenceState::default())
        .manage(youtube::YtStreamCache::default())
        .manage(youtube::YtImageCache::default())
        .manage(youtube::YtAudioCache::default())
        .manage(youtube::YtClient::default())
        .manage(youtube::YtDownloadRegistry::default())
        .register_asynchronous_uri_scheme_protocol("ytimg", youtube::serve_image)
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let files: Vec<String> = args.into_iter().skip(1).collect();

            if !files.is_empty() {
                println!("Second instance files: {:?}", files);

                let _ = app.emit("files-opened", files);
            }
        }))
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build());

    #[cfg(desktop)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        app_data_folder_size,
        import_local_file,
        media_server::media_server_base,
        discord::discord_set_activity,
        discord::discord_clear_activity,
        updater::check_update,
        updater::install_update,
        youtube::yt_search,
        youtube::yt_search_continue,
        youtube::yt_music_search,
        youtube::yt_music_details,
        youtube::yt_continue,
        youtube::yt_music_suggest,
        youtube::yt_music_playlist,
        youtube::yt_music_album,
        youtube::yt_music_artist,
        youtube::yt_resolve,
        youtube::yt_prefetch,
        youtube::yt_download,
        youtube::yt_download_cancel,
        proxy::set_proxy,
        proxy::proxy_check,
        nd::nd_set_config,
        nd::nd_prefetch,
        nd::nd_download,
        nd::nd_download_cancel,
    ]);

    #[cfg(mobile)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        app_data_folder_size,
        import_local_file,
        media_server::media_server_base,
        proxy::set_proxy,
        proxy::proxy_check,
        nd::nd_set_config,
        nd::nd_prefetch,
        nd::nd_download,
        nd::nd_download_cancel,
    ]);

    builder
        .setup(move |_app| {
            // The config windows are created after setup returns, so the
            // accept loop is live before the first frontend request (and the
            // bound socket's backlog would hold early connections anyway).
            media_server::spawn(_app.handle().clone(), media_token, media_listener);

            #[cfg(desktop)]
            {
                let app = _app;
                tray::setup_tray(app)?;

                let files: Vec<String> = std::env::args().skip(1).collect();
                if !files.is_empty() {
                    let app_handle = app.handle().clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        let _ = app_handle.emit("files-opened", files);
                    });
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
