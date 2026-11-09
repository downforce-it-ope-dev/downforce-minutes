import { loadEnv, defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { assertAllowedPublicViteEnvironment, publicBundleEntries, scanPublicBundle } from './publicBuildSecurity';

function publicBuildSecurityPlugin(): Plugin {
  return {
    name: 'public-build-security',
    apply: 'build',
    generateBundle(_options, bundle) {
      const violations = scanPublicBundle(publicBundleEntries(bundle));
      if (violations.length > 0) {
        const summary = violations.map(({ fileName, rule }) => `${fileName} [${rule}]`).join(', ');
        this.error(`PUBLIC_BUNDLE_CANARY: ${summary}`);
      }
    },
  };
}

export default defineConfig(({ command, mode }) => {
  // 부품 확인 화면(/__ui) 포함 여부. 개발 서버, Vercel Preview 빌드, UI_PREVIEW=1일 때만 넣는다.
  // 운영 빌드(Vercel Production·로컬 build)에서는 false라 화면 코드가 번들에서 빠진다 (GitHub #9).
  // loadEnv는 .env 파일과 실행 환경 변수를 함께 읽는다. 이 값은 define으로만 쓰고 import.meta.env로 노출하지 않는다.
  const previewEnvironment = loadEnv(mode, '.', ['VERCEL_ENV', 'UI_PREVIEW']);
  const uiPreview = command === 'serve' || previewEnvironment.VERCEL_ENV === 'preview' || previewEnvironment.UI_PREVIEW === '1';

  const publicEnvironmentPrefix = 'VITE_API_BASE_URL';
  const loadedEnvironment = loadEnv(mode, '.', publicEnvironmentPrefix);
  assertAllowedPublicViteEnvironment(loadedEnvironment);

  // 개발 서버 전용 프록시 대상입니다. VITE_ 접두사가 없어 브라우저 번들에 포함되지 않습니다.
  // 기본값은 로컬 백엔드이며, 다른 백엔드를 쓰려면 DEV_API_PROXY_TARGET으로 지정합니다.
  const devApiProxyTarget = loadEnv(mode, '.', 'DEV_API_PROXY_TARGET').DEV_API_PROXY_TARGET || 'http://127.0.0.1:8080';

  return {
    envPrefix: publicEnvironmentPrefix,
    define: { __UI_PREVIEW__: JSON.stringify(uiPreview) },
    plugins: [react(), tailwindcss(), publicBuildSecurityPlugin()],
    server: {
      proxy: {
        '/api': {
          target: devApiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
