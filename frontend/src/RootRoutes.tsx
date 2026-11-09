import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { App } from './App';
import { LoginPage } from './auth/LoginPage';
import { VerifyPage } from './auth/VerifyPage';
import { ToastProvider } from './ui';

// 부품 확인 화면. 운영 빌드에서는 __UI_PREVIEW__가 false라 이 import가 번들에서 빠진다.
const UiPreview = __UI_PREVIEW__ ? lazy(() => import('./ui-preview/UiPreview')) : null;

/**
 * 최상위 라우트 (GitHub #9, 라우트별 레이아웃 선택).
 * 리뉴얼 라우트는 기존 레이아웃(App의 헤더·하단 탭 바·기존 CSS) 밖에서 그린다.
 * 그 밖의 모든 경로는 지금과 똑같이 기존 App이 처리한다.
 */
export function RootRoutes() {
  return (
    <Routes>
      {/* R2 로그인 (AUTH-01·02). 화면 진입 보호는 #15에서 붙인다 */}
      <Route
        path="/login"
        element={
          <ToastProvider>
            <LoginPage />
          </ToastProvider>
        }
      />
      <Route
        path="/login/verify"
        element={
          <ToastProvider>
            <VerifyPage />
          </ToastProvider>
        }
      />
      {UiPreview && (
        <Route
          path="/__ui"
          element={
            <Suspense fallback={null}>
              <UiPreview />
            </Suspense>
          }
        />
      )}
      <Route path="*" element={<App />} />
    </Routes>
  );
}
