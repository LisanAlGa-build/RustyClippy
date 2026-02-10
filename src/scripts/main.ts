import { ClippyAgent } from './clippy-agent';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

let agent: ClippyAgent;

// Drag/click state
let mouseDownPos: { x: number; y: number } | null = null;
let nativeDragStarted = false;

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

    // ─── Settings button (completely separate from canvas) ───
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

    // ─── Canvas: drag on move, click on release without move ───
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      mouseDownPos = { x: e.screenX, y: e.screenY };
      nativeDragStarted = false;
    });

    // Detect movement to start native drag
    canvas.addEventListener('mousemove', async (e) => {
      if (!mouseDownPos || nativeDragStarted) return;
      
      const dx = Math.abs(e.screenX - mouseDownPos.x);
      const dy = Math.abs(e.screenY - mouseDownPos.y);
      
      // Only start drag after 4px of movement
      if (dx > 4 || dy > 4) {
        nativeDragStarted = true;
        try {
          await getCurrentWindow().startDragging();
        } catch {
          // Not in Tauri context
        }
        // Clean up after native drag ends
        mouseDownPos = null;
      }
    });

    // mouseup without drag = click
    document.addEventListener('mouseup', () => {
      if (mouseDownPos && !nativeDragStarted) {
        // This was a click on the canvas, not a drag
        handleClippyClick();
      }
      mouseDownPos = null;
      nativeDragStarted = false;
    });

    // Suppress the native click event on canvas (we handle it via mouseup)
    canvas.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    console.log('Clippy ready!', agent.getAvailableAnimations().length, 'animations');
    
    setupSettingsListener();
  } catch (error) {
    console.error('Failed to load Clippy:', error);
  }
}

async function setupSettingsListener() {
  try {
    await listen('open-settings', () => openSettingsDialog());
  } catch {
    // Expected in browser context
  }
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
  openChat();
  agent.play('Greeting', () => playIdleLoop());
}

async function openChat() {
  try {
    await invoke('open_chat_window');
  } catch {
    // Expected in browser context
  }
}

async function openSettingsDialog() {
  try {
    await invoke('open_settings_window');
    agent.play('GetTechy', playIdleLoop);
  } catch {
    // Expected in browser context
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initClippy);
} else {
  initClippy();
}
