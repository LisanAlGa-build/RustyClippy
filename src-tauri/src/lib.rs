mod commands;
mod config;
mod llm;
mod personality;
pub mod tts;

use tauri::{Manager, Emitter};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use std::sync::{Arc, Mutex};

// Conversation state
#[derive(Default)]
pub struct ConversationState {
    pub history: Vec<commands::ChatMessage>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("rusty_clippy=info".parse().unwrap()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(ConversationState::default()))
        .manage(tts::TtsState(Mutex::new(None)))
        .setup(|app| {
            setup_system_tray(app)?;

            // Auto-initialize Piper TTS if voice model is already downloaded
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Get configured voice or fallback to default
                let voice = crate::config::Config::load()
                    .ok()
                    .and_then(|c| c.tts_voice)
                    .unwrap_or_else(|| "en_US-amy-medium".to_string());

                if tts::voice_ready(&voice) {
                    if let Ok(config_path) = tts::voice_config(&voice) {
                        match tokio::task::spawn_blocking(move || {
                            tts::PiperTTSEngine::new(&config_path, None)
                        })
                        .await
                        {
                            Ok(Ok(engine)) => {
                                if let Some(tts_state) =
                                    app_handle.try_state::<tts::TtsState>()
                                {
                                    if let Ok(mut guard) = tts_state.0.lock() {
                                        *guard = Some(Arc::new(engine));
                                        tracing::info!(
                                            "Piper TTS auto-initialized on startup"
                                        );
                                    }
                                }
                            }
                            Ok(Err(e)) => {
                                tracing::warn!("Piper TTS auto-init failed: {}", e)
                            }
                            Err(e) => {
                                tracing::warn!("Piper TTS auto-init task error: {}", e)
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::send_message,
            commands::get_config,
            commands::save_config,
            commands::open_settings_window,
            commands::download_model,
            commands::download_tts_model,
            commands::speak_text,
            commands::preview_voice,
            commands::is_tts_initialized,
            commands::is_voice_downloaded,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup_system_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show_i = MenuItem::with_id(app, "show", "Show Clippy", true, None::<&str>)?;
    let settings_i = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_i, &settings_i, &quit_i])?;

    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("clippy") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "settings" => {
                if let Some(window) = app.get_webview_window("clippy") {
                    let _ = window.emit("open-settings", ());
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
