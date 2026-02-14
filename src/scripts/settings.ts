import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';

// Elements
const providerSelect = document.getElementById('provider') as HTMLSelectElement;
const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
const modelSelect = document.getElementById('model') as HTMLSelectElement;
const toggleBtn = document.getElementById('toggle-key') as HTMLButtonElement;
const customApiUrl = document.getElementById('custom-api-url') as HTMLInputElement;
const customApiKey = document.getElementById('custom-api-key') as HTMLInputElement;
const customModel = document.getElementById('custom-model') as HTMLInputElement;
const builtinModelPath = document.getElementById('builtin-model-path') as HTMLInputElement;
const browseModelBtn = document.getElementById('browse-model-btn') as HTMLButtonElement;
const downloadModelBtn = document.getElementById('download-model-btn') as HTMLButtonElement;
const modelDownloadStatus = document.getElementById('model-download-status') as HTMLDivElement;
const tempSlider = document.getElementById('temperature') as HTMLInputElement;
const tempValue = document.getElementById('temp-value') as HTMLSpanElement;
const ttsEnabledCheckbox = document.getElementById('tts-enabled') as HTMLInputElement;
const downloadTtsBtn = document.getElementById('download-tts-btn') as HTMLButtonElement;
const ttsDownloadStatus = document.getElementById('tts-download-status') as HTMLDivElement;
const testTtsBtn = document.getElementById('test-tts-btn') as HTMLButtonElement;
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;

// Sections
const openaiSection = document.getElementById('openai-section') as HTMLDivElement;
const localApiSection = document.getElementById('localapi-section') as HTMLDivElement;
const builtinSection = document.getElementById('builtin-section') as HTMLDivElement;
const ttsOptions = document.getElementById('tts-options') as HTMLDivElement;

// Voice selection element (created dynamically)
let voiceSelect: HTMLSelectElement;

async function checkVoiceStatus() {
  if (!voiceSelect) return;
  const voice = voiceSelect.value;
  
  try {
    const downloaded = await invoke('is_voice_downloaded', { voice }) as boolean;
    if (downloaded) {
      ttsDownloadStatus.textContent = 'Voice ready';
      ttsDownloadStatus.className = 'progress-status success';
      ttsDownloadStatus.style.display = 'block';
      downloadTtsBtn.textContent = 'Voice Downloaded';
      downloadTtsBtn.disabled = true;
    } else {
      ttsDownloadStatus.style.display = 'none';
      downloadTtsBtn.textContent = 'Download Voice';
      downloadTtsBtn.disabled = false;
    }
  } catch (error) {
    console.error('Failed to check voice status:', error);
  }
}

function initVoiceSelector() {
  if (!ttsOptions) return;

  const container = document.createElement('div');
  container.style.marginBottom = '10px';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.gap = '10px';

  const label = document.createElement('label');
  label.textContent = 'Voice:';
  
  voiceSelect = document.createElement('select');
  voiceSelect.style.flex = '1';
  voiceSelect.className = 'voice-select'; // For potential styling
  voiceSelect.addEventListener('change', checkVoiceStatus);

  // Common Piper voices
  const voices = [
    { id: 'en_US-amy-medium', name: 'Amy (Female)' },
    { id: 'en_US-kathleen-low', name: 'Kathleen (Female)' },
    { id: 'en_US-lessac-medium', name: 'Lessac (Female)' },
    { id: 'en_US-libritts-high', name: 'LibriTTS (Male)' },
    { id: 'en_US-ryan-medium', name: 'Ryan (Male)' }
  ];

  voices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.name;
    voiceSelect.appendChild(opt);
  });

  container.appendChild(label);
  container.appendChild(voiceSelect);

  // Insert at the top of ttsOptions
  if (ttsOptions.firstChild) {
    ttsOptions.insertBefore(container, ttsOptions.firstChild);
  } else {
    ttsOptions.appendChild(container);
  }
}

// Default URLs for each provider
const PROVIDER_DEFAULTS: Record<string, { url: string; model: string }> = {
  LMStudio: { url: 'http://localhost:1234/v1', model: 'default' },
  Ollama: { url: 'http://localhost:11434/v1', model: 'llama3.2' },
  CustomAPI: { url: '', model: '' },
};

// Show/hide sections based on provider
function updateProviderSections() {
  const provider = providerSelect.value;
  openaiSection.style.display = provider === 'OpenAI' ? '' : 'none';
  localApiSection.style.display = ['LMStudio', 'Ollama', 'CustomAPI'].includes(provider) ? '' : 'none';
  builtinSection.style.display = provider === 'BuiltIn' ? '' : 'none';

  if (PROVIDER_DEFAULTS[provider]) {
    if (!customApiUrl.value) customApiUrl.value = PROVIDER_DEFAULTS[provider].url;
    if (!customModel.value) customModel.value = PROVIDER_DEFAULTS[provider].model;
  }
}

providerSelect.addEventListener('change', () => {
  customApiUrl.value = '';
  customApiKey.value = '';
  customModel.value = '';
  updateProviderSections();
});

// Toggle API key visibility
toggleBtn.addEventListener('click', () => {
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    toggleBtn.textContent = 'Hide';
  } else {
    apiKeyInput.type = 'password';
    toggleBtn.textContent = 'Show';
  }
});

// Update temperature display
tempSlider.addEventListener('input', () => {
  tempValue.textContent = tempSlider.value;
});

// TTS toggle
ttsEnabledCheckbox.addEventListener('change', () => {
  ttsOptions.style.display = ttsEnabledCheckbox.checked ? '' : 'none';
});

// Browse for model file
browseModelBtn.addEventListener('click', async () => {
  try {
    const selected = await open({
      filters: [{ name: 'GGUF Models', extensions: ['gguf'] }],
      multiple: false,
    });
    if (selected) {
      builtinModelPath.value = selected as string;
    }
  } catch (error) {
    showStatus(`Browse failed: ${error}`, 'error');
  }
});

// Download default LLM model
downloadModelBtn.addEventListener('click', async () => {
  downloadModelBtn.disabled = true;
  modelDownloadStatus.textContent = 'Starting download...';
  modelDownloadStatus.style.display = 'block';

  try {
    const modelPath = await invoke('download_model') as string;
    builtinModelPath.value = modelPath;
    modelDownloadStatus.textContent = 'Download complete!';
    modelDownloadStatus.className = 'progress-status success';
  } catch (error) {
    modelDownloadStatus.textContent = `Error: ${error}`;
    modelDownloadStatus.className = 'progress-status error';
  } finally {
    downloadModelBtn.disabled = false;
  }
});

// Download TTS voice model (Piper)
downloadTtsBtn.addEventListener('click', async () => {
  downloadTtsBtn.disabled = true;
  ttsDownloadStatus.textContent = 'Starting voice download...';
  ttsDownloadStatus.style.display = 'block';

  try {
    const voice = voiceSelect ? voiceSelect.value : 'en_US-amy-medium';
    await invoke('download_tts_model', { voice });
    ttsDownloadStatus.textContent = 'Voice model ready!';
    ttsDownloadStatus.className = 'progress-status success';
    downloadTtsBtn.textContent = 'Voice Downloaded';
    downloadTtsBtn.disabled = true;
  } catch (error) {
    ttsDownloadStatus.textContent = `Error: ${error}`;
    ttsDownloadStatus.className = 'progress-status error';
    downloadTtsBtn.disabled = false;
  }
});

// Test TTS voice
testTtsBtn.addEventListener('click', async () => {
  testTtsBtn.disabled = true;
  ttsDownloadStatus.textContent = 'Speaking...';
  ttsDownloadStatus.style.display = 'block';

  try {
    const voice = voiceSelect ? voiceSelect.value : 'en_US-amy-medium';
    await invoke('preview_voice', { text: "Hi! I'm Clippy, your helpful assistant!", voice });
    ttsDownloadStatus.textContent = 'Voice test complete!';
    ttsDownloadStatus.className = 'progress-status success';
  } catch (error) {
    ttsDownloadStatus.textContent = `Error: ${error}`;
    ttsDownloadStatus.className = 'progress-status error';
  } finally {
    testTtsBtn.disabled = false;
  }
});

// Listen for download progress events
listen('model-download-progress', (event: any) => {
  const { percent, status } = event.payload;
  if (modelDownloadStatus.style.display !== 'none') {
    modelDownloadStatus.textContent = `${status} (${Math.round(percent)}%)`;
  }
  if (ttsDownloadStatus.style.display !== 'none') {
    ttsDownloadStatus.textContent = `${status} (${Math.round(percent)}%)`;
  }
});

// Load current config
async function loadConfig() {
  try {
    const config = await invoke('get_config') as any;

    providerSelect.value = config.llm_provider || 'BuiltIn';
    apiKeyInput.value = config.openai_api_key || '';
    modelSelect.value = config.openai_model || 'gpt-4';
    customApiUrl.value = config.custom_api_url || '';
    customApiKey.value = config.custom_api_key || '';
    customModel.value = config.custom_model || '';
    builtinModelPath.value = config.builtin_model_path || '';
    tempSlider.value = String(config.temperature ?? 0.9);
    tempValue.textContent = tempSlider.value;
    ttsEnabledCheckbox.checked = config.tts_enabled || false;
    if (config.tts_voice && voiceSelect) {
      voiceSelect.value = config.tts_voice;
    }

    updateProviderSections();
    ttsOptions.style.display = ttsEnabledCheckbox.checked ? '' : 'none';

    await checkVoiceStatus();
  } catch (error) {
    showStatus('Failed to load settings', 'error');
  }
}

// Save
saveBtn.addEventListener('click', async () => {
  const provider = providerSelect.value;

  if (provider === 'OpenAI' && !apiKeyInput.value.trim()) {
    showStatus('Please enter an OpenAI API key', 'error');
    return;
  }
  if (provider === 'CustomAPI' && !customApiUrl.value.trim()) {
    showStatus('Please enter a custom API URL', 'error');
    return;
  }
  if (provider === 'BuiltIn' && !builtinModelPath.value.trim()) {
    showStatus('Please select or download a model file', 'error');
    return;
  }

  try {
    const config: any = {
      llm_provider: provider,
      openai_api_key: apiKeyInput.value.trim() || null,
      openai_model: modelSelect.value,
      custom_api_url: customApiUrl.value.trim() || null,
      custom_api_key: customApiKey.value.trim() || null,
      custom_model: customModel.value.trim() || null,
      builtin_model_path: builtinModelPath.value.trim() || null,
      temperature: parseFloat(tempSlider.value),
      tts_enabled: ttsEnabledCheckbox.checked,
      tts_voice: voiceSelect ? voiceSelect.value : null,
    };
    await invoke('save_config', { config });
    showStatus('Settings saved! Clippy is ready to chat.', 'success');

    setTimeout(async () => {
      try {
        await getCurrentWindow().close();
      } catch {
        // Ignore
      }
    }, 1200);
  } catch (error) {
    showStatus(`Failed to save: ${error}`, 'error');
  }
});

// Cancel
cancelBtn.addEventListener('click', async () => {
  try {
    await getCurrentWindow().close();
  } catch {
    // Ignore
  }
});

function showStatus(text: string, type: 'success' | 'error') {
  statusEl.textContent = text;
  statusEl.className = `status ${type}`;
}

// Init
initVoiceSelector();
loadConfig();
