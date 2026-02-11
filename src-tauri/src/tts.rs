use anyhow::{anyhow, Result};
use piper_rs::synth::PiperSpeechSynthesizer;
use rodio::{buffer::SamplesBuffer, OutputStream, Sink};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tracing::{error, info, warn};

/// Default voice model to download from HuggingFace
const DEFAULT_VOICE_MODEL: &str = "en_US-amy-medium";
const DEFAULT_SAMPLE_RATE: u32 = 22050;

/// Managed Tauri state for TTS — uses Arc so we can clone a handle for blocking threads
pub struct TtsState(pub Mutex<Option<Arc<PiperTTSEngine>>>);

/// Piper TTS engine wrapper — cross-platform, offline, fast neural TTS.
pub struct PiperTTSEngine {
    synth: PiperSpeechSynthesizer,
    sample_rate: u32,
    _speaker_id: Option<i64>,
}

// PiperSpeechSynthesizer doesn't implement Send by default, but we only
// access it from one thread at a time (behind a Mutex + spawn_blocking).
unsafe impl Send for PiperTTSEngine {}

impl PiperTTSEngine {
    /// Create a new Piper TTS engine from a model config path.
    /// The config JSON must be next to the .onnx model file.
    pub fn new(config_path: &Path, speaker_id: Option<i64>) -> Result<Self> {
        info!("Piper TTS: loading model from {:?}", config_path);
        let model = piper_rs::from_config_path(config_path)
            .map_err(|e| anyhow!("Failed to load Piper model: {:?}", e))?;

        if let Some(sid) = speaker_id {
            model.set_speaker(sid);
        }

        let synth = PiperSpeechSynthesizer::new(model)
            .map_err(|e| anyhow!("Failed to create Piper synthesizer: {:?}", e))?;

        info!("Piper TTS: model loaded successfully");
        Ok(Self {
            synth,
            sample_rate: DEFAULT_SAMPLE_RATE,
            _speaker_id: speaker_id,
        })
    }

    /// Synthesize text and play it through the default audio output.
    /// This is fully synchronous — call from a blocking thread.
    pub fn speak(&self, text: &str) -> Result<()> {
        info!("Piper TTS: synthesizing \"{}\" ({} chars)", text, text.len());

        let audio = self
            .synth
            .synthesize_parallel(text.to_string(), None)
            .map_err(|e| anyhow!("Piper synthesis failed: {:?}", e))?;

        let mut samples: Vec<f32> = Vec::new();
        for result in audio {
            let chunk = result.map_err(|e| anyhow!("Piper audio chunk error: {:?}", e))?;
            let raw: Vec<f32> = chunk.into_vec();
            samples.extend_from_slice(&raw);
        }

        if samples.is_empty() {
            warn!("Piper TTS: synthesis returned empty audio");
            return Ok(());
        }

        // Append 250ms of silence to prevent the audio from being cut off too early
        let silence_samples = (self.sample_rate as f32 * 0.25) as usize;
        samples.extend(std::iter::repeat(0.0f32).take(silence_samples));

        info!(
            "Piper TTS: synthesized {} samples ({:.1}s at {} Hz), playing...",
            samples.len(),
            samples.len() as f64 / self.sample_rate as f64,
            self.sample_rate
        );

        play_audio(&samples, self.sample_rate)?;
        info!("Piper TTS: playback finished");
        Ok(())
    }
}

/// Play f32 audio samples through the default output device.
fn play_audio(samples: &[f32], sample_rate: u32) -> Result<()> {
    let (_stream, stream_handle) = OutputStream::try_default().map_err(|e| {
        error!("Failed to open audio output: {}", e);
        anyhow!("Failed to open audio output: {}", e)
    })?;

    let sink = Sink::try_new(&stream_handle).map_err(|e| {
        error!("Failed to create audio sink: {}", e);
        anyhow!("Failed to create audio sink: {}", e)
    })?;

    let source = SamplesBuffer::new(1, sample_rate, samples.to_vec());
    sink.append(source);
    sink.sleep_until_end();
    Ok(())
}

/// Get the directory where Piper voice models are stored.
pub fn voices_dir() -> Result<PathBuf> {
    let dir = crate::config::Config::data_dir()?.join("piper-voices");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Check if the default voice model is already downloaded.
pub fn default_voice_ready() -> bool {
    if let Ok(dir) = voices_dir() {
        let config = dir
            .join(DEFAULT_VOICE_MODEL)
            .join(format!("{}.onnx.json", DEFAULT_VOICE_MODEL));
        config.exists()
    } else {
        false
    }
}

/// Check if a specific voice model is ready.
pub fn voice_ready(voice_name: &str) -> bool {
    if let Ok(dir) = voices_dir() {
        let config = dir
            .join(voice_name)
            .join(format!("{}.onnx.json", voice_name));
        config.exists()
    } else {
        false
    }
}

/// Get the config path for the default voice model.
pub fn default_voice_config() -> Result<PathBuf> {
    let dir = voices_dir()?;
    Ok(dir
        .join(DEFAULT_VOICE_MODEL)
        .join(format!("{}.onnx.json", DEFAULT_VOICE_MODEL)))
}

/// Get the config path for a specific voice model.
pub fn voice_config(voice_name: &str) -> Result<PathBuf> {
    let dir = voices_dir()?;
    Ok(dir
        .join(voice_name)
        .join(format!("{}.onnx.json", voice_name)))
}

/// Download a Piper voice model from HuggingFace.
/// Returns the path to the config JSON file.
pub fn download_voice(voice_name: &str, data_dir: &Path) -> Result<PathBuf, String> {
    use std::io::Write;

    let voice_dir = data_dir.join("piper-voices").join(voice_name);
    std::fs::create_dir_all(&voice_dir).map_err(|e| format!("Failed to create dir: {}", e))?;

    let onnx_file = format!("{}.onnx", voice_name);
    let config_file = format!("{}.onnx.json", voice_name);

    // Determine the HuggingFace path based on voice name convention
    // e.g. en_US-amy-medium -> en/en_US/amy/medium/en_US-amy-medium.onnx
    let parts: Vec<&str> = voice_name.splitn(3, '-').collect();
    if parts.len() < 3 {
        return Err(format!(
            "Invalid voice name format: {}. Expected: lang_REGION-name-quality",
            voice_name
        ));
    }
    let lang_region = parts[0]; // e.g. "en_US"
    let lang = lang_region.split('_').next().unwrap_or("en"); // e.g. "en"
    let name = parts[1]; // e.g. "amy"
    let quality = parts[2]; // e.g. "medium"

    let base_url = format!(
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/{}/{}/{}/{}/",
        lang, lang_region, name, quality
    );

    // Download ONNX model
    let onnx_path = voice_dir.join(&onnx_file);
    if !onnx_path.exists() {
        info!("Downloading Piper voice model: {}", onnx_file);
        let url = format!("{}{}", base_url, onnx_file);
        let response = reqwest::blocking::get(&url)
            .map_err(|e| format!("Failed to download model: {}", e))?;
        if !response.status().is_success() {
            return Err(format!("Download failed: HTTP {}", response.status()));
        }
        let bytes = response
            .bytes()
            .map_err(|e| format!("Failed to read model bytes: {}", e))?;
        let mut file =
            std::fs::File::create(&onnx_path).map_err(|e| format!("Failed to create file: {}", e))?;
        file.write_all(&bytes)
            .map_err(|e| format!("Failed to write model: {}", e))?;
        info!("Downloaded {} ({} bytes)", onnx_file, bytes.len());
    }

    // Download config JSON
    let config_path = voice_dir.join(&config_file);
    if !config_path.exists() {
        info!("Downloading Piper voice config: {}", config_file);
        let url = format!("{}{}", base_url, config_file);
        let response = reqwest::blocking::get(&url)
            .map_err(|e| format!("Failed to download config: {}", e))?;
        if !response.status().is_success() {
            return Err(format!("Config download failed: HTTP {}", response.status()));
        }
        let bytes = response
            .bytes()
            .map_err(|e| format!("Failed to read config bytes: {}", e))?;
        let mut file = std::fs::File::create(&config_path)
            .map_err(|e| format!("Failed to create config file: {}", e))?;
        file.write_all(&bytes)
            .map_err(|e| format!("Failed to write config: {}", e))?;
        info!("Downloaded {}", config_file);
    }

    Ok(config_path)
}
