import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 인증은 실제 API 해석을 검사한다. 목업은 authMock.test.ts가 직접 검사한다
  define: { __UI_PREVIEW__: 'true', __AUTH_MOCK__: 'false' },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    pool: 'threads',
    isolate: true,
    maxWorkers: 1,
  },
});
