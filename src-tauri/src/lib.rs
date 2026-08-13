use std::{fs, path::Path};

use tauri::{Emitter, Manager};

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

#[cfg(desktop)]
mod nd;

#[cfg(desktop)]
mod stream;

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
        "tracks" | "lyrics" => {}
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .max_file_size(5 * 1_024 * 1_024) // 5 MB per log file
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(desktop)]
    let builder = builder
        .manage(discord::DiscordPresenceState::default())
        .manage(youtube::YtStreamCache::default())
        .manage(youtube::YtImageCache::default())
        .manage(youtube::YtAudioCache::default())
        .manage(youtube::ProxyState::default())
        .manage(youtube::YtClient::default())
        .manage(youtube::YtDownloadRegistry::default())
        .manage(nd::NdState::default())
        .manage(nd::NdCoverCache::default())
        .manage(nd::NdAudioCache::default())
        .register_asynchronous_uri_scheme_protocol("stream", stream::serve)
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
        discord::discord_set_activity,
        discord::discord_clear_activity,
        updater::check_update,
        updater::install_update,
        youtube::yt_search,
        youtube::yt_search_continue,
        youtube::yt_music_search,
        youtube::yt_continue,
        youtube::yt_music_suggest,
        youtube::yt_music_playlist,
        youtube::yt_music_album,
        youtube::yt_music_artist,
        youtube::yt_resolve,
        youtube::yt_prefetch,
        youtube::yt_download,
        youtube::yt_download_cancel,
        youtube::set_proxy,
        youtube::proxy_check,
        nd::nd_set_config,
        nd::nd_prefetch,
    ]);

    #[cfg(mobile)]
    let builder = builder.invoke_handler(tauri::generate_handler![]);

    builder
        .setup(|app| {
            #[cfg(desktop)]
            {
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
