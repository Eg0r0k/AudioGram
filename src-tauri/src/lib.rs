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

fn dir_size(path: &Path) -> std::io::Result<u64> {
    let mut total = 0;

    if !path.exists() {
        return Ok(0);
    }

    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let metadata = entry.metadata()?;

        if metadata.is_dir() {
            total += dir_size(&entry.path())?;
        } else {
            total += metadata.len();
        }
    }

    Ok(total)
}

#[tauri::command]
fn app_data_folder_size(app: tauri::AppHandle, folder: String) -> Result<u64, String> {
    match folder.as_str() {
        "tracks" | "lyrics" => {}
        _ => return Err("unsupported app data folder".into()),
    }

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    dir_size(&app_data_dir.join(folder)).map_err(|e| e.to_string())
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
        .plugin(tauri_plugin_opener::init());

    #[cfg(desktop)]
    let builder = builder
        .manage(discord::DiscordPresenceState::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let files: Vec<String> = args.into_iter().skip(1).collect();

            if !files.is_empty() {
                println!("Second instance files: {:?}", files);

                let _ = app.emit("files-opened", files);
            }
        }))
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build());

    #[cfg(desktop)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        app_data_folder_size,
        discord::discord_set_activity,
        discord::discord_clear_activity,
        updater::check_update,
        updater::install_update,
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
