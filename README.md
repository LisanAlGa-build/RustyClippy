# 📎 Rusty Clippy

> *"It looks like you're building a desktop app. Would you like help with that?"*

Rusty Clippy is an AI-powered resurrection of the beloved (and sometimes annoying) Microsoft Office assistant! Built with Rust and Tauri 2.0, Clippy is back with modern AI capabilities powered by OpenAI.

![Clippy](https://user-images.githubusercontent.com/placeholder-clippy.gif)

## Features

- 🤖 **AI-Powered**: Chat with Clippy using OpenAI's GPT models
- 📎 **Classic Animations**: Original Clippy sprite animations from the Microsoft Agent era
- 🪟 **Floating Character**: Clippy floats on your desktop, just like the old days
- 💬 **Chat Interface**: Modern chat window for conversations
- 🎭 **Personality**: Clippy maintains his quirky, overly-helpful personality
- ⚙️ **System Tray**: Easy access from your system tray
- 🎨 **Beautiful UI**: Modern gradient design with smooth animations

## Prerequisites

- **Rust**: Install from [rustup.rs](https://rustup.rs/)
- **Node.js**: Version 18 or higher
- **OpenAI API Key**: Get one from [platform.openai.com](https://platform.openai.com/)

## Installation

1. **Prerequisites**
   - Rust toolchain: Install from [rustup.rs](https://rustup.rs/)
   - Node.js 18+: Install from [nodejs.org](https://nodejs.org/)
   - OpenAI API key: Get from [platform.openai.com](https://platform.openai.com/)

2. **Navigate to project directory**
   ```bash
   cd /Users/nathantregub/Dev/rusty_clippy
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Run in development mode**
   ```bash
   npm run dev
   ```
   
   First run will take several minutes as Rust compiles all dependencies.

5. **Configure your API key**
   - Once the app starts, Clippy will appear on your screen
   - Click on the Clippy system tray icon in your menu bar
   - Select "Settings"
   - Enter your OpenAI API key
   - Click OK to save

## Building for Production

```bash
npm run build
```

The built application will be in `src-tauri/target/release/bundle/`.

On macOS, you'll find `Rusty Clippy.app` in the `dmg` folder.

## Usage

1. **Start the app** - Clippy will appear as a floating character on your screen
2. **Click on Clippy** - Opens the chat window
3. **Chat away!** - Ask Clippy anything, just like talking to ChatGPT
4. **Drag Clippy** - Click and drag to move him around your desktop
5. **System Tray** - Right-click the tray icon for options

## Architecture

```
┌─────────────────────────────────────┐
│         Tauri Application           │
├─────────────────┬───────────────────┤
│  Rust Backend   │  Web Frontend     │
│                 │                   │
│  • OpenAI API   │  • Sprite Engine  │
│  • Config Store │  • Chat UI        │
│  • IPC Commands │  • TypeScript     │
│  • Streaming    │  • Animations     │
└─────────────────┴───────────────────┘
```

## Tech Stack

- **Backend**: Rust, Tokio (async runtime), Reqwest (HTTP client)
- **Frontend**: TypeScript, Vanilla JS (no frameworks)
- **Desktop Framework**: Tauri 2.0
- **AI**: OpenAI GPT-4 (configurable)
- **Assets**: Original Clippy sprites from [clippy.js](https://github.com/clippyjs/clippy.js)

## Project Structure

```
rusty_clippy/
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── lib.rs          # Main library
│   │   ├── main.rs         # Entry point
│   │   ├── commands.rs     # Tauri IPC commands
│   │   ├── llm/            # LLM integration
│   │   ├── personality.rs  # Clippy's personality
│   │   └── config.rs       # Configuration management
│   └── Cargo.toml
├── src/                    # Frontend
│   ├── index.html          # Clippy window
│   ├── chat.html           # Chat window
│   ├── scripts/
│   │   ├── clippy-agent.ts # Sprite animator
│   │   ├── main.ts         # Main window logic
│   │   └── chat.ts         # Chat window logic
│   ├── styles/
│   └── assets/
│       └── agents/Clippy/  # Sprite sheets
└── package.json
```

## Configuration

Config file location: `~/.config/rusty-clippy/config.json`

```json
{
  "openai_api_key": "sk-...",
  "openai_model": "gpt-4",
  "temperature": 0.9
}
```

## Future Enhancements

- 🦙 **Ollama Support**: Run local LLMs
- 🎙️ **Voice Input/Output**: Talk to Clippy
- 🔌 **Plugin System**: Extend Clippy's capabilities
- 👥 **Multiple Characters**: Bring back Merlin, Rover, and more!
- 🧠 **Context Awareness**: Clippy can see what you're working on
- 💾 **Chat History**: Persistent conversation storage

## Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Improve documentation

## License

This project is open source. The original Clippy assets are property of Microsoft and are used here for nostalgic and educational purposes via the public clippy.js library.

## Acknowledgments

- Microsoft for creating the original Clippy
- [clippy.js](https://github.com/clippyjs/clippy.js) for preserving the sprite animations
- The Tauri team for an amazing desktop framework
- OpenAI for making AI accessible

---

*Made with ❤️ and a lot of nostalgia*

**"It looks like you're enjoying this app. That makes me happy!" - Clippy**
