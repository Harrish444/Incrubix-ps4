import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = `http://localhost:${env.API_PORT || '8787'}`;
  return {
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': apiTarget,
      '/health': apiTarget,
      '/ready': apiTarget,
      '/connector': apiTarget,
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  };
});
