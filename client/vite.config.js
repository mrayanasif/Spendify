import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Keeps API calls same-origin in development, so no CORS surprises.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    // Tesseract.js uses dynamic imports that need to be pre-bundled
    include: ['tesseract.js'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
