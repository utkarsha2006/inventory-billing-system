import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin in dev: the refresh cookie (path /api/v1/auth) works with no CORS setup.
    proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } },
  },
});