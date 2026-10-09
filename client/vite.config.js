import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // Shareable event pages are server-rendered by the API, not the SPA.
      // Vercel rewrites /e to the API in production; this is the dev twin, so
      // a share link can be opened and checked locally. The key is a regex on
      // purpose: a plain '/e' is a string prefix to Vite and would swallow
      // '/events' along with it.
      '^/e/': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
