import { ClippyAgent } from './clippy-agent';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

let agent: ClippyAgent;

// Drag/click state
let mouseDownPos: { x: number; y: number } | null = null;
let nativeDragStarted = false;

// Chat state
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const chatMessages: Message[] = [];
let isStreaming = false;
let currentAssistantMessage = '';
let isChatOpen = false;

// Window is always 420x600 — transparent areas pass through clicks on macOS.
// No dynamic resizing needed.

async function initClippy() {
  const canvas = document.getElementById('clippy-canvas') as HTMLCanvasElement;
  if (!canvas) return;

  agent = new ClippyAgent(canvas);

  try {
    await agent.load(
      '/assets/agents/Clippy/agent.png',
      '/assets/agents/Clippy/map.json'
    );

    playIdleLoop();

    // ─── Settings button ───
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
      });
      settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        openSettingsDialog();
      });
    }

    // ─── Canvas: drag on move, click on release ───
    // ─── Canvas: drag on move, click on release ───
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      mouseDownPos = { x: e.screenX, y: e.screenY };
      nativeDragStarted = false;
    });

    canvas.addEventListener('mousemove', async (e) => {
      if (!mouseDownPos || nativeDragStarted) return;
      const dx = Math.abs(e.screenX - mouseDownPos.x);
      const dy = Math.abs(e.screenY - mouseDownPos.y);
      if (dx > 4 || dy > 4) {
        nativeDragStarted = true;
        try { await getCurrentWindow().startDragging(); } catch {}
        mouseDownPos = null;
      }
    });

    document.addEventListener('mouseup', () => {
      if (mouseDownPos && !nativeDragStarted) {
        handleClippyClick();
      }
      mouseDownPos = null;
      nativeDragStarted = false;
    });

    canvas.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    console.log('Clippy ready!', agent.getAvailableAnimations().length, 'animations');

    // ─── Chat UI setup ───
    setupChat();
    setupSettingsListener();
  } catch (error) {
    console.error('Failed to load Clippy:', error);
  }
}

// ═══════════════════════════════════════════════
// Chat bubble logic (integrated, no separate window)
// ═══════════════════════════════════════════════

function setupChat() {
  const bubble = document.getElementById('chat-bubble')!;
  const closeBtn = document.getElementById('close-chat-btn')!;
  const clearBtn = document.getElementById('clear-chat-btn')!;
  const sendBtn = document.getElementById('send-button') as HTMLButtonElement;
  const inputField = document.getElementById('message-input') as HTMLInputElement;

  closeBtn.addEventListener('click', () => toggleChat(false));
  clearBtn.addEventListener('click', clearChat);
  sendBtn.addEventListener('click', sendMessage);

  inputField.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Prevent clicks inside the bubble from being treated as Clippy clicks
  bubble.addEventListener('mousedown', (e) => e.stopPropagation());
  bubble.addEventListener('click', (e) => e.stopPropagation());

  // Setup streaming listeners
  setupChatListeners();
}

async function setupChatListeners() {
  try {
    await listen('chat-token', (event: any) => handleToken(event.payload.token));
    await listen('chat-error', (event: any) => handleError(event.payload.error));
    await listen('chat-done', () => handleDone());
    console.log('Chat listeners ready');
  } catch (error) {
    console.error('Failed to setup chat listeners:', error);
  }
}

function toggleChat(open?: boolean) {
  const bubble = document.getElementById('chat-bubble')!;
  isChatOpen = open !== undefined ? open : !isChatOpen;

  if (isChatOpen) {
    bubble.classList.remove('hidden');
    if (chatMessages.length === 0) {
      addMessage('assistant', "Hi! I'm Clippy! It looks like you're trying to chat with an AI assistant. I'm here to help! What can I do for you today?");
    }
    setTimeout(() => {
      (document.getElementById('message-input') as HTMLInputElement)?.focus();
    }, 100);
  } else {
    bubble.classList.add('hidden');
  }
}

async function sendMessage() {
  const inputField = document.getElementById('message-input') as HTMLInputElement;
  const sendBtn = document.getElementById('send-button') as HTMLButtonElement;

  const userMessage = inputField.value.trim();
  if (!userMessage || isStreaming) return;

  addMessage('user', userMessage);
  inputField.value = '';

  isStreaming = true;
  sendBtn.disabled = true;
  inputField.disabled = true;

  currentAssistantMessage = '';
  addStreamingMessage();

  // Play a thinking animation
  agent.play('Processing', () => {});

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
    if (currentAssistantMessage) {
      addSpeakButton(streamingEl, currentAssistantMessage);
    }
  }
  if (currentAssistantMessage) {
    chatMessages.push({ role: 'assistant', content: currentAssistantMessage });
  }
  finishStreaming();
  // Return to idle
  playIdleLoop();
}

function finishStreaming() {
  isStreaming = false;
  const sendBtn = document.getElementById('send-button') as HTMLButtonElement;
  const inputField = document.getElementById('message-input') as HTMLInputElement;
  sendBtn.disabled = false;
  inputField.disabled = false;
  inputField.focus();
}

function addMessage(role: 'user' | 'assistant', content: string) {
  chatMessages.push({ role, content });

  const container = document.getElementById('messages')!;
  const messageEl = document.createElement('div');
  messageEl.className = `message ${role === 'user' ? 'user-message' : 'assistant-message'}`;
  messageEl.innerHTML = `<div class="message-content">${escapeHtml(content)}</div>`;

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
  speakBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';

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
  const container = document.getElementById('messages')!;
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
    const container = document.getElementById('messages')!;
    container.scrollTop = container.scrollHeight;
  }
}

function clearChat() {
  chatMessages.length = 0;
  const container = document.getElementById('messages')!;
  container.innerHTML = '';
  addMessage('assistant', "Chat cleared! What would you like to talk about?");
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ═══════════════════════════════════════════════
// Clippy interaction
// ═══════════════════════════════════════════════

async function setupSettingsListener() {
  try {
    await listen('open-settings', () => openSettingsDialog());
  } catch {}
}

function playIdleLoop() {
  const idleAnims = ['RestPose', 'Idle1_1', 'IdleFingerTap', 'IdleHeadScratch', 'IdleSideToSide'];
  const randomIdle = idleAnims[Math.floor(Math.random() * idleAnims.length)];

  agent.play(randomIdle, () => {
    if (Math.random() < 0.15) {
      const funAnims = ['Wave', 'GetAttention', 'LookDown', 'LookUp', 'LookLeft', 'LookRight', 'IdleEyeBrowRaise'];
      const randomAnim = funAnims[Math.floor(Math.random() * funAnims.length)];
      agent.play(randomAnim, playIdleLoop);
    } else {
      playIdleLoop();
    }
  });
}

function handleClippyClick() {
  toggleChat();
  agent.play('Greeting', () => playIdleLoop());
}

async function openSettingsDialog() {
  try {
    await invoke('open_settings_window');
    agent.play('GetTechy', playIdleLoop);
  } catch {}
}

// ─── Init ───

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initClippy);
} else {
  initClippy();
}
