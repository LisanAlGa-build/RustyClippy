import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        chat: resolve(__dirname, 'src/chat.html'),
        settings: resolve(__dirname, 'src/settings.html'),
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  // Prevent vite from obscuring rust errors
  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' },
  },
});
