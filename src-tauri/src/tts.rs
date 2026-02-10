use anyhow::{anyhow, Result};
use kokoro_tts::{KokoroTts, Voice};
use rodio::{buffer::SamplesBuffer, OutputStream, Sink};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Managed Tauri state for TTS
pub struct TtsState(pub Mutex<Option<KokoroTTSEngine>>);

/// Kokoro TTS engine wrapper
#[derive(Clone)]
pub struct KokoroTTSEngine {
    model_path: PathBuf,
    voices_path: PathBuf,
    sample_rate: u32,
}

impl KokoroTTSEngine {
    /// Create a new TTS engine from a data directory.
    /// Expects the HuggingFace cache layout under data_dir.
    pub fn new(data_dir: &Path) -> Result<Self> {
        let (model_path, voices_path) = find_tts_files(data_dir)?;

        if !model_path.exists() {
            return Err(anyhow!(
                "TTS model file not found: {}",
                model_path.display()
            ));
        }
        if !voices_path.exists() {
            return Err(anyhow!(
                "TTS voices file not found: {}",
                voices_path.display()
            ));
        }

        Ok(Self {
            model_path,
            voices_path,
            sample_rate: 24000,
        })
    }

    /// Synthesize text and play it through the default audio output
    pub fn speak(&self, text: &str) -> Result<()> {
        let model_path = self.model_path.clone();
        let voices_path = self.voices_path.clone();
        let sample_rate = self.sample_rate;
        let text = text.to_string();

        // kokoro-tts is async, so we need a runtime
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| anyhow!("Failed to create runtime: {}", e))?;

        rt.block_on(async {
            let tts = KokoroTts::new(&model_path, &voices_path)
                .await
                .map_err(|e| anyhow!("Failed to create TTS: {}", e))?;

            let (samples, _duration) = tts
                .synth(&text, Voice::AfHeart(1.0))
                .await
                .map_err(|e| anyhow!("Failed to synthesize: {}", e))?;

            play_audio(&samples, sample_rate)?;
            Ok(())
        })
    }
}

/// Play audio samples through the default output device
fn play_audio(samples: &[f32], sample_rate: u32) -> Result<()> {
    let (_stream, stream_handle) =
        OutputStream::try_default().map_err(|e| anyhow!("Failed to open audio output: {}", e))?;

    let sink =
        Sink::try_new(&stream_handle).map_err(|e| anyhow!("Failed to create audio sink: {}", e))?;

    let source = SamplesBuffer::new(1, sample_rate, samples.to_vec());
    sink.append(source);

    // Block until playback finishes
    sink.sleep_until_end();

    Ok(())
}

/// Build the combined voices.bin file in kokoro-tts format from the downloaded af.bin
/// Called after downloading from onnx-community/Kokoro-82M-ONNX
pub fn build_voices_file(data_dir: &Path) -> Result<(), String> {
    let hf_cache = data_dir.join("models--onnx-community--Kokoro-82M-ONNX");
    let snapshots_dir = hf_cache.join("snapshots");

    let mut snapshot_dir = None;
    for entry in std::fs::read_dir(&snapshots_dir).map_err(|e| format!("Failed to read snapshots: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        if entry.path().is_dir() {
            snapshot_dir = Some(entry.path());
            break;
        }
    }
    let snapshot_dir = snapshot_dir.ok_or("No snapshot directory found")?;

    let af_bin_path = snapshot_dir.join("voices").join("af.bin");
    let af_bytes = std::fs::read(&af_bin_path).map_err(|e| format!("Failed to read af.bin: {}", e))?;

    // af.bin is 524288 bytes = 131072 f32. Reshape to (512, 1, 256) for kokoro-tts format
    let n_f32 = af_bytes.len() / 4;
    let n_vectors = n_f32 / 256;
    let mut pack: Vec<Vec<Vec<f32>>> = Vec::with_capacity(n_vectors);
    for i in 0..n_vectors {
        let start = i * 256 * 4;
        let mut vec256 = Vec::with_capacity(256);
        for j in 0..256 {
            let offset = start + j * 4;
            let bytes: [u8; 4] = af_bytes[offset..offset + 4]
                .try_into()
                .map_err(|_| "Invalid af.bin layout")?;
            vec256.push(f32::from_le_bytes(bytes));
        }
        pack.push(vec![vec256]);
    }

    let mut voices: HashMap<String, Vec<Vec<Vec<f32>>>> = HashMap::new();
    voices.insert("af_heart".to_string(), pack);

    let voices_path = snapshot_dir.join("voices.bin");
    let mut file = std::fs::File::create(&voices_path).map_err(|e| format!("Failed to create voices.bin: {}", e))?;
    bincode::encode_into_std_write(&voices, &mut file, bincode::config::standard())
        .map_err(|e| format!("Failed to encode voices: {}", e))?;

    Ok(())
}

/// Find TTS model files in the HuggingFace cache directory structure
fn find_tts_files(data_dir: &Path) -> Result<(PathBuf, PathBuf)> {
    // onnx-community/Kokoro-82M-ONNX: onnx/model_quantized.onnx + voices.bin (built from voices/af.bin)
    let hf_cache = data_dir.join("models--onnx-community--Kokoro-82M-ONNX");
    if hf_cache.exists() {
        let snapshots_dir = hf_cache.join("snapshots");
        if snapshots_dir.exists() {
            if let Ok(mut entries) = std::fs::read_dir(&snapshots_dir) {
                if let Some(Ok(entry)) = entries.next() {
                    let snapshot_dir = entry.path();
                    let model = snapshot_dir.join("onnx").join("model_quantized.onnx");
                    let voices = snapshot_dir.join("voices.bin");
                    return Ok((model, voices));
                }
            }
        }
    }

    // Fallback: direct paths
    let model = data_dir.join("model_quantized.onnx");
    let voices = data_dir.join("voices.bin");

    Ok((model, voices))
}
