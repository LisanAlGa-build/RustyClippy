use crate::config::{Config, LlmProviderType};
use crate::llm::{openai::OpenAIProvider, local::LocalLLMProvider, LLMProvider, Message};
use crate::personality;
use crate::tts::TtsState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tokio_stream::StreamExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct StreamEvent {
    pub token: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorEvent {
    pub error: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DoneEvent {}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgressEvent {
    pub percent: f64,
    pub status: String,
}

// Use the ConversationState from lib.rs
use crate::ConversationState;

/// Build the appropriate LLM provider based on config
fn build_provider(config: &Config) -> Result<Box<dyn LLMProvider>, String> {
    match config.llm_provider {
        LlmProviderType::OpenAI => {
            let key = config
                .openai_api_key
                .clone()
                .ok_or_else(|| "OpenAI API key not set. Please configure it in settings.".to_string())?;
            Ok(Box::new(OpenAIProvider::new(key, config.openai_model.clone())))
        }
        LlmProviderType::LMStudio => {
            let url = config
                .custom_api_url
                .clone()
                .unwrap_or_else(|| "http://localhost:1234/v1".into());
            let model = config
                .custom_model
                .clone()
                .unwrap_or_else(|| "default".into());
            let key = config
                .custom_api_key
                .clone()
                .unwrap_or_else(|| "lm-studio".into());
            Ok(Box::new(OpenAIProvider::new(key, model).with_base_url(url)))
        }
        LlmProviderType::Ollama => {
            let url = config
                .custom_api_url
                .clone()
                .unwrap_or_else(|| "http://localhost:11434/v1".into());
            let model = config
                .custom_model
                .clone()
                .unwrap_or_else(|| "llama3.2".into());
            Ok(Box::new(
                OpenAIProvider::new("ollama".into(), model).with_base_url(url),
            ))
        }
        LlmProviderType::CustomAPI => {
            let url = config
                .custom_api_url
                .clone()
                .ok_or_else(|| "Custom API URL is required.".to_string())?;
            let model = config
                .custom_model
                .clone()
                .unwrap_or_else(|| "default".into());
            let key = config.custom_api_key.clone().unwrap_or_default();
            Ok(Box::new(OpenAIProvider::new(key, model).with_base_url(url)))
        }
        LlmProviderType::BuiltIn => {
            let model_path = config
                .builtin_model_path
                .clone()
                .ok_or_else(|| "No local model path configured. Please download or select a model in settings.".to_string())?;
            LocalLLMProvider::new(&model_path)
                .map(|p| Box::new(p) as Box<dyn LLMProvider>)
                .map_err(|e| format!("Failed to load local model: {}", e))
        }
    }
}

#[tauri::command]
pub async fn send_message(
    app: AppHandle,
    message: String,
    state: State<'_, std::sync::Mutex<ConversationState>>,
) -> Result<(), String> {
    // Load config
    let config = Config::load().map_err(|e| format!("Failed to load config: {}", e))?;
    
    // Build the appropriate provider
    let provider = build_provider(&config)?;
    
    // Add user message to history
    {
        let mut conv_state = state.lock().unwrap();
        conv_state.history.push(ChatMessage {
            role: "user".to_string(),
            content: message.clone(),
        });
    }
    
    // Prepare messages with system prompt
    let mut messages = vec![Message {
        role: "system".to_string(),
        content: personality::get_system_prompt(),
    }];
    
    // Add conversation history
    {
        let conv_state = state.lock().unwrap();
        for msg in &conv_state.history {
            messages.push(Message {
                role: msg.role.clone(),
                content: msg.content.clone(),
            });
        }
    }
    
    // Stream response
    let mut stream = provider
        .stream_completion(messages, config.temperature)
        .await
        .map_err(|e| format!("Failed to get completion: {}", e))?;
    
    let mut full_response = String::new();
    
    while let Some(result) = stream.next().await {
        match result {
            Ok(token) => {
                full_response.push_str(&token);
                let _ = app.emit("chat-token", StreamEvent { token });
            }
            Err(e) => {
                let _ = app.emit("chat-error", ErrorEvent {
                    error: format!("Stream error: {}", e),
                });
                return Err(format!("Stream error: {}", e));
            }
        }
    }
    
    // Add assistant response to history
    {
        let mut conv_state = state.lock().unwrap();
        conv_state.history.push(ChatMessage {
            role: "assistant".to_string(),
            content: full_response,
        });
    }
    
    let _ = app.emit("chat-done", DoneEvent {});
    
    Ok(())
}

#[tauri::command]
pub fn get_config() -> Result<Config, String> {
    Config::load().map_err(|e| format!("Failed to load config: {}", e))
}

#[tauri::command]
pub fn save_config(config: Config) -> Result<(), String> {
    config
        .save()
        .map_err(|e| format!("Failed to save config: {}", e))
}

#[tauri::command]
pub async fn download_model(app: AppHandle) -> Result<String, String> {
    use hf_hub::api::sync::ApiBuilder;

    let _ = app.emit(
        "model-download-progress",
        DownloadProgressEvent {
            percent: 0.0,
            status: "Starting download...".into(),
        },
    );

    let data_dir =
        Config::data_dir().map_err(|e| format!("Failed to get data directory: {}", e))?;

    let _ = app.emit(
        "model-download-progress",
        DownloadProgressEvent {
            percent: 10.0,
            status: "Connecting to HuggingFace...".into(),
        },
    );

    // Download Gemma 3 1B Q4_K_M from HuggingFace
    let api = ApiBuilder::new()
        .with_cache_dir(data_dir.clone())
        .build()
        .map_err(|e| format!("Failed to create HF API: {}", e))?;

    let _ = app.emit(
        "model-download-progress",
        DownloadProgressEvent {
            percent: 20.0,
            status: "Downloading Gemma 3 1B (Q4_K_M)...".into(),
        },
    );

    let model_path = tokio::task::spawn_blocking(move || {
        api.model("bartowski/google_gemma-3-1b-it-GGUF".to_string())
            .get("google_gemma-3-1b-it-Q4_K_M.gguf")
    })
    .await
    .map_err(|e| format!("Download task failed: {}", e))?
    .map_err(|e| format!("Failed to download model: {}", e))?;

    let model_path_str = model_path.to_string_lossy().to_string();

    let _ = app.emit(
        "model-download-progress",
        DownloadProgressEvent {
            percent: 100.0,
            status: "Download complete!".into(),
        },
    );

    // Auto-save the model path to config
    let mut config = Config::load().map_err(|e| format!("Failed to load config: {}", e))?;
    config.builtin_model_path = Some(model_path_str.clone());
    config
        .save()
        .map_err(|e| format!("Failed to save config: {}", e))?;

    Ok(model_path_str)
}

#[tauri::command]
pub async fn download_tts_model(app: AppHandle) -> Result<(), String> {
    use hf_hub::api::sync::ApiBuilder;

    let _ = app.emit(
        "model-download-progress",
        DownloadProgressEvent {
            percent: 0.0,
            status: "Starting TTS model download...".into(),
        },
    );

    let data_dir =
        Config::data_dir().map_err(|e| format!("Failed to get data directory: {}", e))?;

    let api = ApiBuilder::new()
        .with_cache_dir(data_dir.clone())
        .build()
        .map_err(|e| format!("Failed to create HF API: {}", e))?;

    let _ = app.emit(
        "model-download-progress",
        DownloadProgressEvent {
            percent: 10.0,
            status: "Downloading Kokoro TTS model...".into(),
        },
    );

    // Download Kokoro ONNX model + voices from onnx-community (https://huggingface.co/onnx-community/Kokoro-82M-ONNX)
    let api_clone = api.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let repo = api_clone.model("onnx-community/Kokoro-82M-ONNX".to_string());
        // Download ONNX model (use quantized for smaller size ~92MB)
        repo.get("onnx/model_quantized.onnx")
            .map_err(|e| format!("Failed to download ONNX model: {}", e))?;
        // Download af.bin voice (American Female - we use as af_heart)
        repo.get("voices/af.bin")
            .map_err(|e| format!("Failed to download voice: {}", e))?;
        // Build combined voices file in kokoro-tts format from the single downloaded voice
        crate::tts::build_voices_file(&data_dir)?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Download task failed: {}", e))?
    .map_err(|e| e)?;

    let _ = app.emit(
        "model-download-progress",
        DownloadProgressEvent {
            percent: 100.0,
            status: "TTS model download complete!".into(),
        },
    );

    Ok(())
}

#[tauri::command]
pub async fn speak_text(
    text: String,
    tts_state: State<'_, TtsState>,
) -> Result<(), String> {
    // Clone the engine out of the lock so we don't hold it across await
    let engine = {
        let tts = tts_state.0.lock().map_err(|e| format!("TTS lock error: {}", e))?;
        tts.clone()
    };
    
    if let Some(engine) = engine {
        tokio::task::spawn_blocking(move || {
            engine.speak(&text)
        })
        .await
        .map_err(|e| format!("TTS task error: {}", e))?
        .map_err(|e| format!("TTS error: {}", e))?;
        Ok(())
    } else {
        Err("TTS not initialized. Please download the TTS model first.".into())
    }
}

#[tauri::command]
pub async fn init_tts(tts_state: State<'_, TtsState>) -> Result<(), String> {
    use crate::tts::KokoroTTSEngine;
    
    let data_dir =
        Config::data_dir().map_err(|e| format!("Failed to get data directory: {}", e))?;
    
    let engine = tokio::task::spawn_blocking(move || {
        KokoroTTSEngine::new(&data_dir)
    })
    .await
    .map_err(|e| format!("TTS init task error: {}", e))?
    .map_err(|e| format!("Failed to initialize TTS: {}", e))?;
    
    let mut tts = tts_state.0.lock().map_err(|e| format!("TTS lock error: {}", e))?;
    *tts = Some(engine);
    
    Ok(())
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
    // Check if settings window already exists
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    
    let _settings_window = WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App("settings.html".into()))
        .title("Clippy Settings")
        .inner_size(420.0, 620.0)
        .resizable(true)
        .decorations(true)
        .center()
        .build()
        .map_err(|e| format!("Failed to create settings window: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub fn open_chat_window(app: AppHandle) -> Result<(), String> {
    // Check if chat window already exists
    if let Some(window) = app.get_webview_window("chat") {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    
    // Get clippy window position
    let clippy_window = app
        .get_webview_window("clippy")
        .ok_or_else(|| "Clippy window not found".to_string())?;
    
    let position = clippy_window
        .outer_position()
        .map_err(|e| format!("Failed to get clippy position: {}", e))?;
    
    // Create chat window positioned next to Clippy
    let _chat_window = WebviewWindowBuilder::new(&app, "chat", WebviewUrl::App("chat.html".into()))
        .title("Chat with Clippy")
        .inner_size(350.0, 500.0)
        .position(position.x as f64 + 220.0, position.y as f64)
        .resizable(true)
        .decorations(true)
        .always_on_top(true)
        .build()
        .map_err(|e| format!("Failed to create chat window: {}", e))?;
    
    Ok(())
}
