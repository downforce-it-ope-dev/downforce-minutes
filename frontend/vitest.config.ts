import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: { __UI_PREVIEW__: 'true' },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    pool: 'threads',
    isolate: true,
    maxWorkers: 1,
  },
});
