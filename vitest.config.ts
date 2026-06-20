import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vitest config for the editor app's unit tests. The pure core (conflict state
// machine, readiness race, diagnostics mapping, debounce) is tested without a
// live sandbox; the React surface uses jsdom + Testing Library with the SDK and
// the working-tree port mocked.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
