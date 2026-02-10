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

3. **Configure OpenAI API Key**:
   - Look for the Clippy icon in your system tray (menu bar on macOS)
   - Click the tray icon → Select "Settings"
   - Enter your OpenAI API key
   - Click OK

4. **Start chatting**:
   - Click on the floating Clippy character
   - He'll wave and open the chat window
   - Type your message and press Enter or click Send

## Features

- **Floating Clippy**: Drag him anywhere on your screen
- **Chat Interface**: Ask Clippy anything, powered by GPT-4
- **Animations**: Watch Clippy animate while idle and when responding
- **System Tray**: Easy access to settings and controls

## Troubleshooting

### Clippy doesn't appear
- Check that the app is running (look for the tray icon)
- Try clicking "Show Clippy" from the tray menu

### "API key not set" error
- Make sure you've configured your OpenAI API key in Settings
- The key should start with `sk-`

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
- Change the OpenAI model in Settings (default is GPT-4)

Enjoy your AI-powered Clippy! 📎
