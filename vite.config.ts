import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2020',
    // Phaser is ~1.5 MB by itself. The Race screen is lazily imported in App.tsx
    // so it lands in its own chunk, which keeps this warning to that one chunk.
    chunkSizeWarningLimit: 1600,
  },
});