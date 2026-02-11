# Quick Start Guide

## Running Rusty Clippy

1. **Install dependencies** (first time only):
   ```bash
   npm install
   ```

2. **Start the app**:
   ```bash
   npm run dev
   ```
   
   **Note**: The first run will take 3-5 minutes to compile Rust dependencies. Subsequent runs will be much faster.

3. **Configure AI Provider (Optional)**:
   - By default, Clippy uses a local LLM so you can start chatting immediately.
   - To use OpenAI or other providers:
     - Click the tray icon → Select "Settings"
     - Choose your provider and enter API keys if required

4. **Start chatting**:
   - Click on the floating Clippy character
   - He'll wave and open the chat window
   - Type your message and press Enter or click Send

## Features

- **Floating Clippy**: Drag him anywhere on your screen
- **Chat Interface**: Ask Clippy anything, powered by Local LLM or cloud providers
- **Animations**: Watch Clippy animate while idle and when responding
- **System Tray**: Easy access to settings and controls

## Troubleshooting

### Clippy doesn't appear
- Check that the app is running (look for the tray icon)
- Try clicking "Show Clippy" from the tray menu

### "API key not set" error
- This only applies if you have selected a cloud provider like OpenAI.
- Make sure you've configured your API key in Settings.

### Compilation errors
- Make sure you have Rust installed: `rustc --version`
- Make sure you have Node.js 18+: `node --version`
- Try `rm -rf node_modules && npm install`

### Chat window doesn't open
- Try clicking Clippy again
- Check the browser console for errors

## Next Steps

- Customize Clippy's personality in `src-tauri/src/personality.rs`
- Adjust chat window styling in `src/styles/chat.css`
- Add more animations (check `src/assets/agents/Clippy/map.json` for available animations)
- Change the AI provider or model in Settings

Enjoy your AI-powered Clippy! 📎
