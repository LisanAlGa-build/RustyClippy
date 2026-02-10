import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const messages: Message[] = [];
let isStreaming = false;
let currentAssistantMessage = '';

async function init() {
  const sendButton = document.getElementById('send-button') as HTMLButtonElement;
  const inputField = document.getElementById('message-input') as HTMLInputElement;
  const clearButton = document.getElementById('clear-button') as HTMLButtonElement;

  sendButton.addEventListener('click', sendMessage);

  inputField.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  clearButton.addEventListener('click', clearChat);

  // Listen for streaming events
  try {
    await listen('chat-token', (event: any) => {
      handleToken(event.payload.token);
    });

    await listen('chat-error', (event: any) => {
      handleError(event.payload.error);
    });

    await listen('chat-done', () => {
      handleDone();
    });
    
    console.log('Chat listeners ready');
  } catch (error) {
    console.error('Failed to setup chat listeners:', error);
  }

  // Welcome message
  addMessage('assistant', "Hi! I'm Clippy! It looks like you're trying to chat with an AI assistant. I'm here to help! What can I do for you today?");
}

async function sendMessage() {
  const inputField = document.getElementById('message-input') as HTMLInputElement;
  const sendButton = document.getElementById('send-button') as HTMLButtonElement;
  
  const userMessage = inputField.value.trim();
  if (!userMessage || isStreaming) return;

  addMessage('user', userMessage);
  inputField.value = '';

  isStreaming = true;
  sendButton.disabled = true;
  inputField.disabled = true;

  currentAssistantMessage = '';
  addStreamingMessage();

  try {
    await invoke('send_message', { message: userMessage });
  } catch (error) {
    handleError(`${error}`);
  }
}

function handleToken(token: string) {
  currentAssistantMessage += token;
  updateStreamingMessage(currentAssistantMessage);
}

function handleError(error: string) {
  const streamingEl = document.getElementById('streaming-message');
  if (streamingEl) {
    streamingEl.classList.remove('streaming');
    streamingEl.removeAttribute('id');
    streamingEl.innerHTML = `<div class="message-content error">Error: ${error}</div>`;
  }
  finishStreaming();
}

function handleDone() {
  const streamingEl = document.getElementById('streaming-message');
  if (streamingEl) {
    streamingEl.classList.remove('streaming');
    streamingEl.removeAttribute('id');

    // Add speak button to the completed message
    if (currentAssistantMessage) {
      addSpeakButton(streamingEl, currentAssistantMessage);
    }
  }
  
  if (currentAssistantMessage) {
    messages.push({ role: 'assistant', content: currentAssistantMessage });
  }
  finishStreaming();
}

function finishStreaming() {
  isStreaming = false;
  const sendButton = document.getElementById('send-button') as HTMLButtonElement;
  const inputField = document.getElementById('message-input') as HTMLInputElement;
  sendButton.disabled = false;
  inputField.disabled = false;
  inputField.focus();
}

function addMessage(role: 'user' | 'assistant', content: string) {
  messages.push({ role, content });
  
  const container = document.getElementById('messages') as HTMLDivElement;
  const messageEl = document.createElement('div');
  messageEl.className = `message ${role === 'user' ? 'user-message' : 'assistant-message'}`;
  messageEl.innerHTML = `<div class="message-content">${escapeHtml(content)}</div>`;

  // Add speak button for assistant messages
  if (role === 'assistant') {
    addSpeakButton(messageEl, content);
  }

  container.appendChild(messageEl);
  container.scrollTop = container.scrollHeight;
}

function addSpeakButton(messageEl: Element, text: string) {
  const speakBtn = document.createElement('button');
  speakBtn.className = 'speak-btn';
  speakBtn.title = 'Read aloud';
  speakBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
  
  speakBtn.addEventListener('click', async () => {
    speakBtn.classList.add('speaking');
    speakBtn.disabled = true;
    try {
      await invoke('speak_text', { text });
    } catch (error) {
      console.error('TTS error:', error);
    } finally {
      speakBtn.classList.remove('speaking');
      speakBtn.disabled = false;
    }
  });

  messageEl.appendChild(speakBtn);
}

function addStreamingMessage() {
  const container = document.getElementById('messages') as HTMLDivElement;
  const messageEl = document.createElement('div');
  messageEl.className = 'message assistant-message streaming';
  messageEl.id = 'streaming-message';
  messageEl.innerHTML = '<div class="message-content"></div>';
  container.appendChild(messageEl);
  container.scrollTop = container.scrollHeight;
}

function updateStreamingMessage(content: string) {
  const streamingEl = document.querySelector('#streaming-message .message-content');
  if (streamingEl) {
    streamingEl.innerHTML = escapeHtml(content);
    const container = document.getElementById('messages') as HTMLDivElement;
    container.scrollTop = container.scrollHeight;
  }
}

function clearChat() {
  messages.length = 0;
  const container = document.getElementById('messages') as HTMLDivElement;
  container.innerHTML = '';
  addMessage('assistant', "Chat cleared! What would you like to talk about?");
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
