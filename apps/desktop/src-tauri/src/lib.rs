use tauri::Emitter;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

pub fn run() {
    tauri::Builder::default()
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
                    ],
                )
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();

            let play_pause = Shortcut::new(None, Code::MediaPlayPause);
            let next_track = Shortcut::new(None, Code::MediaTrackNext);
            let prev_track = Shortcut::new(None, Code::MediaTrackPrevious);

            // Registrar teclas de mídia pode falhar se o sistema não der permissão
            // (ex: macOS sem Acessibilidade) — não deixar isso derrubar o app
            let _ = app.global_shortcut().on_shortcuts(
                [play_pause, next_track, prev_track],
                move |_app, shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    let event = match shortcut.key {
                        Code::MediaPlayPause => "media-play-pause",
                        Code::MediaTrackNext => "media-next",
                        Code::MediaTrackPrevious => "media-prev",
                        _ => return,
                    };
                    let _ = handle.emit(event, ());
                },
            );

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
