import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During `npm run dev`, the React app runs on Vite's dev server (:5173) with HMR,
// and proxies the WebSocket to the bridge server on :8080. In production
// (`npm run build`), the bridge server serves the built files directly, so no
// proxy is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
      '/healthz': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
