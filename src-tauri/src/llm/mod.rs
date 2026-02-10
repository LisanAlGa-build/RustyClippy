pub mod local;
pub mod openai;

use anyhow::Result;
use async_trait::async_trait;
use tokio_stream::Stream;

#[derive(Debug, Clone)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[async_trait]
pub trait LLMProvider: Send + Sync {
    async fn stream_completion(
        &self,
        messages: Vec<Message>,
        temperature: f32,
    ) -> Result<Box<dyn Stream<Item = Result<String>> + Send + Unpin>>;
}
