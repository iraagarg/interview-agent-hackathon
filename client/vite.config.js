import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    fs: {
      // The candidate list is imported straight from /data so there is one
      // source of truth shared with the server, rather than a copy that drifts.
      allow: ['..'],
    },
  },
});
