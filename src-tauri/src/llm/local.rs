use super::{LLMProvider, Message};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
#[allow(deprecated)]
use llama_cpp_2::model::{AddBos, LlamaModel, Special};
use llama_cpp_2::sampling::LlamaSampler;
use std::num::NonZeroU32;
use std::path::Path;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tokio_stream::Stream;

/// A local LLM provider using llama.cpp via llama-cpp-2 bindings
pub struct LocalLLMProvider {
    model_path: String,
}

impl LocalLLMProvider {
    pub fn new(model_path: &str) -> Result<Self> {
        // Verify the file exists
        if !Path::new(model_path).exists() {
            return Err(anyhow!("Model file not found: {}", model_path));
        }
        Ok(Self {
            model_path: model_path.to_string(),
        })
    }
}

/// Format chat messages into a prompt string for the model
fn format_chat_prompt(messages: &[Message]) -> String {
    // Use a simple chat format compatible with most instruction-tuned models
    // Gemma uses <start_of_turn>user\n...<end_of_turn>\n<start_of_turn>model\n
    let mut prompt = String::new();

    for msg in messages {
        match msg.role.as_str() {
            "system" => {
                prompt.push_str("<start_of_turn>user\n");
                prompt.push_str("System instruction: ");
                prompt.push_str(&msg.content);
                prompt.push_str("<end_of_turn>\n");
            }
            "user" => {
                prompt.push_str("<start_of_turn>user\n");
                prompt.push_str(&msg.content);
                prompt.push_str("<end_of_turn>\n");
            }
            "assistant" => {
                prompt.push_str("<start_of_turn>model\n");
                prompt.push_str(&msg.content);
                prompt.push_str("<end_of_turn>\n");
            }
            _ => {}
        }
    }

    // Signal model to generate
    prompt.push_str("<start_of_turn>model\n");
    prompt
}

#[async_trait]
impl LLMProvider for LocalLLMProvider {
    async fn stream_completion(
        &self,
        messages: Vec<Message>,
        temperature: f32,
    ) -> Result<Box<dyn Stream<Item = Result<String>> + Send + Unpin>> {
        let model_path = self.model_path.clone();
        let (tx, rx) = mpsc::channel::<Result<String>>(32);

        // Run inference in a blocking thread
        tokio::task::spawn_blocking(move || {
            let result = run_inference(&model_path, &messages, temperature, tx.clone());
            if let Err(e) = result {
                let _ = tx.blocking_send(Err(e));
            }
        });

        Ok(Box::new(Box::pin(ReceiverStream::new(rx))))
    }
}

fn run_inference(
    model_path: &str,
    messages: &[Message],
    temperature: f32,
    tx: mpsc::Sender<Result<String>>,
) -> Result<()> {
    // Initialize backend
    let backend = LlamaBackend::init().map_err(|e| anyhow!("Failed to init backend: {}", e))?;

    // Load model with Metal GPU layers on macOS
    let model_params = LlamaModelParams::default().with_n_gpu_layers(1000);

    let model = LlamaModel::load_from_file(&backend, model_path, &model_params)
        .map_err(|e| anyhow!("Failed to load model: {}", e))?;

    // Create context
    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(Some(NonZeroU32::new(2048).unwrap()))
        .with_n_batch(512);

    let mut ctx = model
        .new_context(&backend, ctx_params)
        .map_err(|e| anyhow!("Failed to create context: {}", e))?;

    // Format messages into prompt
    let prompt = format_chat_prompt(messages);

    // Tokenize
    let tokens = model
        .str_to_token(&prompt, AddBos::Always)
        .map_err(|e| anyhow!("Failed to tokenize: {}", e))?;

    // Create batch and add prompt tokens
    let mut batch = LlamaBatch::new(2048, 1);
    for (i, token) in tokens.iter().enumerate() {
        let is_last = i == tokens.len() - 1;
        batch
            .add(*token, i as i32, &[0], is_last)
            .map_err(|e| anyhow!("Failed to add token to batch: {}", e))?;
    }

    // Process prompt
    ctx.decode(&mut batch)
        .map_err(|e| anyhow!("Failed to decode prompt: {}", e))?;

    // Setup sampler with temperature
    let mut sampler = if temperature < 0.01 {
        LlamaSampler::greedy()
    } else {
        LlamaSampler::chain_simple([
            LlamaSampler::temp(temperature),
            LlamaSampler::dist(0),
        ])
    };

    // Generate tokens
    let max_tokens = 512;
    let mut n_decoded = tokens.len() as i32;

    for _ in 0..max_tokens {
        let new_token = sampler.sample(&ctx, batch.n_tokens() - 1);
        sampler.accept(new_token);

        // Check for end of generation
        if model.is_eog_token(new_token) {
            break;
        }

        // Decode token to string
        #[allow(deprecated)]
        let token_str = model
            .token_to_str(new_token, Special::Tokenize)
            .unwrap_or_default();

        // Check for end-of-turn tag (Gemma uses <end_of_turn>)
        if token_str.contains("<end_of_turn>") || token_str.contains("<eos>") {
            break;
        }

        if !token_str.is_empty() {
            if tx.blocking_send(Ok(token_str)).is_err() {
                // Receiver dropped, stop generating
                break;
            }
        }

        // Prepare next batch
        batch.clear();
        batch
            .add(new_token, n_decoded, &[0], true)
            .map_err(|e| anyhow!("Failed to add token: {}", e))?;
        n_decoded += 1;

        ctx.decode(&mut batch)
            .map_err(|e| anyhow!("Failed to decode: {}", e))?;
    }

    Ok(())
}
