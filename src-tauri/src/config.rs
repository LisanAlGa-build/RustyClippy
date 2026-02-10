use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum LlmProviderType {
    OpenAI,
    LMStudio,
    Ollama,
    CustomAPI,
    BuiltIn,
}

impl Default for LlmProviderType {
    fn default() -> Self {
        Self::OpenAI
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub llm_provider: LlmProviderType,
    pub openai_api_key: Option<String>,
    #[serde(default = "default_openai_model")]
    pub openai_model: String,
    #[serde(default)]
    pub custom_api_url: Option<String>,
    #[serde(default)]
    pub custom_api_key: Option<String>,
    #[serde(default)]
    pub custom_model: Option<String>,
    #[serde(default)]
    pub builtin_model_path: Option<String>,
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    #[serde(default)]
    pub tts_enabled: bool,
    #[serde(default)]
    pub tts_voice: Option<String>,
}

fn default_openai_model() -> String {
    "gpt-4".to_string()
}

fn default_temperature() -> f32 {
    0.9
}

impl Default for Config {
    fn default() -> Self {
        Self {
            llm_provider: LlmProviderType::OpenAI,
            openai_api_key: None,
            openai_model: default_openai_model(),
            custom_api_url: None,
            custom_api_key: None,
            custom_model: None,
            builtin_model_path: None,
            temperature: default_temperature(),
            tts_enabled: false,
            tts_voice: None,
        }
    }
}

impl Config {
    pub fn load() -> Result<Self> {
        let config_path = Self::config_path()?;
        
        if config_path.exists() {
            let content = std::fs::read_to_string(&config_path)?;
            let config: Config = serde_json::from_str(&content)?;
            Ok(config)
        } else {
            Ok(Config::default())
        }
    }
    
    pub fn save(&self) -> Result<()> {
        let config_path = Self::config_path()?;
        
        if let Some(parent) = config_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        
        let content = serde_json::to_string_pretty(self)?;
        std::fs::write(&config_path, content)?;
        Ok(())
    }
    
    fn config_path() -> Result<PathBuf> {
        let config_dir = dirs::config_dir()
            .ok_or_else(|| anyhow::anyhow!("Could not find config directory"))?;
        Ok(config_dir.join("rusty-clippy").join("config.json"))
    }

    /// Get the data directory for models and TTS assets
    pub fn data_dir() -> Result<PathBuf> {
        let data_dir = dirs::data_dir()
            .ok_or_else(|| anyhow::anyhow!("Could not find data directory"))?;
        let app_data = data_dir.join("rusty-clippy").join("models");
        std::fs::create_dir_all(&app_data)?;
        Ok(app_data)
    }
}
