import { loadEnv, defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
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

export default defineConfig(({ mode }) => {
  const publicEnvironmentPrefix = 'VITE_API_BASE_URL';
  const loadedEnvironment = loadEnv(mode, '.', publicEnvironmentPrefix);
  assertAllowedPublicViteEnvironment(loadedEnvironment);

  // 개발 서버 전용 프록시 대상입니다. VITE_ 접두사가 없어 브라우저 번들에 포함되지 않습니다.
  // 기본값은 로컬 백엔드이며, 다른 백엔드를 쓰려면 DEV_API_PROXY_TARGET으로 지정합니다.
  const devApiProxyTarget = loadEnv(mode, '.', 'DEV_API_PROXY_TARGET').DEV_API_PROXY_TARGET || 'http://127.0.0.1:8080';

  return {
    envPrefix: publicEnvironmentPrefix,
    plugins: [react(), publicBuildSecurityPlugin()],
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
