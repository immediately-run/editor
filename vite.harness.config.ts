import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// DEV-ONLY: run the editor app standalone with the SDK aliased to the harness
// mock (src/dev/sdkMock.ts), which supplies the editor-session channel + an
// in-memory rw working-tree port. Load /harness.html. Production builds use the
// real SDK via the default vite.config.ts.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@immediately-run/sdk': fileURLToPath(new URL('./src/dev/sdkMock.ts', import.meta.url)),
    },
  },
});
