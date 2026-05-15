mod cloud_storage;
mod ffmpeg;
mod yt_dlp;

use std::sync::{atomic::{AtomicBool, Ordering}, Arc};
use tauri::Emitter;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

pub fn run() {
    let mut builder = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            yt_dlp::ensure_yt_dlp,
            ffmpeg::ensure_ffmpeg,
            cloud_storage::cloud_storage_hash_file,
            cloud_storage::cloud_storage_rename_file,
        ]);

    // E2E only: ativa o WebDriver plugin em builds debug pra que o
    // `tauri-wd` CLI consiga controlar o app durante testes E2E no macOS.
    // Em release builds, o cfg(debug_assertions) é falso e o plugin nunca
    // é instanciado.
    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_webdriver_automation::init());
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:leviticus.db",
                    vec![
                        tauri_plugin_sql::Migration {
                            version: 1,
                            description: "initial_schema",
                            sql: include_str!("../migrations/001_local_schema.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                        tauri_plugin_sql::Migration {
                            version: 2,
                            description: "groups_color_index",
                            sql: include_str!("../migrations/002_groups_color_index.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                        tauri_plugin_sql::Migration {
                            version: 3,
                            description: "song_type",
                            sql: include_str!("../migrations/003_song_type.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                        tauri_plugin_sql::Migration {
                            version: 4,
                            description: "playlist_horario_e_secao",
                            sql: include_str!("../migrations/004_playlist_horario_e_secao.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                        tauri_plugin_sql::Migration {
                            version: 5,
                            description: "org_settings_columns",
                            sql: include_str!("../migrations/005_org_settings_columns.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                        tauri_plugin_sql::Migration {
                            version: 6,
                            description: "cloud_storage",
                            sql: include_str!("../migrations/006_cloud_storage.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();

            let play_pause = Shortcut::new(None, Code::MediaPlayPause);
            let next_track = Shortcut::new(None, Code::MediaTrackNext);
            let prev_track = Shortcut::new(None, Code::MediaTrackPrevious);

            // Um AtomicBool por tecla para filtrar key-repeat do macOS.
            // swap(true) retorna o valor anterior: se já era true, a tecla
            // estava pressionada — é um repeat, ignora. Released limpa o flag.
            let pp_held = Arc::new(AtomicBool::new(false));
            let nx_held = Arc::new(AtomicBool::new(false));
            let pv_held = Arc::new(AtomicBool::new(false));

            // Registrar teclas de mídia pode falhar se o sistema não der permissão
            // (ex: macOS sem Acessibilidade) — não deixar isso derrubar o app
            let _ = app.global_shortcut().on_shortcuts(
                [play_pause, next_track, prev_track],
                move |_app, shortcut, event| {
                    let held = match shortcut.key {
                        Code::MediaPlayPause    => &pp_held,
                        Code::MediaTrackNext    => &nx_held,
                        Code::MediaTrackPrevious => &pv_held,
                        _ => return,
                    };
                    match event.state {
                        ShortcutState::Released => { held.store(false, Ordering::Relaxed); return; }
                        ShortcutState::Pressed  => { if held.swap(true, Ordering::Relaxed) { return; } }
                    }
                    let event_name = match shortcut.key {
                        Code::MediaPlayPause    => "media-play-pause",
                        Code::MediaTrackNext    => "media-next",
                        Code::MediaTrackPrevious => "media-prev",
                        _ => return,
                    };
                    let _ = handle.emit(event_name, ());
                },
            );

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
