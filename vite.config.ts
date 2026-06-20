import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The editor — a forkable immediately.run system app (EDITOR_AS_APP_SPEC, plan
// Phase 04). It renders raw CodeMirror 6 in an opaque iframe and reaches the
// kernel only through the SDK (the rw working-tree port + the editor channels +
// the session intents). `base: './'` so a Pages-hosted build resolves its own
// assets. https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
});
