import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { App } from './App';
import { GuestOnly, RequireAuth } from './auth/AuthGate';
import { LoginPage } from './auth/LoginPage';
import { VerifyPage } from './auth/VerifyPage';
import { ToastProvider } from './ui';

// 부품 확인 화면. 운영 빌드에서는 __UI_PREVIEW__가 false라 이 import가 번들에서 빠진다.
const UiPreview = __UI_PREVIEW__ ? lazy(() => import('./ui-preview/UiPreview')) : null;

/**
 * 최상위 라우트 (GitHub #9, 라우트별 레이아웃 선택).
 * 리뉴얼 라우트는 기존 레이아웃(App의 헤더·하단 탭 바·기존 CSS) 밖에서 그린다.
 * 그 밖의 모든 경로는 지금과 똑같이 기존 App이 처리하되, 로그인한 경우에만 들어간다.
 */
export function RootRoutes() {
  return (
    <Routes>
      {/* R2 로그인 (AUTH-01·02). 로그인한 상태면 원래 가려던 화면으로 보낸다 */}
      <Route
        path="/login"
        element={
          <GuestOnly>
            <ToastProvider>
              <LoginPage />
            </ToastProvider>
          </GuestOnly>
        }
      />
      <Route
        path="/login/verify"
        element={
          <GuestOnly>
            <ToastProvider>
              <VerifyPage />
            </ToastProvider>
          </GuestOnly>
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
      {/* 그 밖의 화면은 로그인해야 들어간다 (AUTH-01-F06, #15) */}
      <Route
        path="*"
        element={
          <RequireAuth>
            <App />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
