import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Vite config for @orch/web (Orch Web UI).
 *
 * Server binds to 127.0.0.1:4142 (localhost-only, port distinct from core 4141).
 * I-7: localhost bind enforced via server.host = '127.0.0.1'.
 * strictPort: true — fail fast if 4142 is occupied rather than silently shifting.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4142,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4142,
    strictPort: true,
  },
});
