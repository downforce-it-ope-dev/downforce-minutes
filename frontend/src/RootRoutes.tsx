import { lazy, Suspense } from 'react';
import { matchRoutes, Route, Routes, useLocation } from 'react-router';
import { App } from './App';
import { GuestOnly, RequireAuth } from './auth/AuthGate';
import { LoginPage } from './auth/LoginPage';
import { VerifyPage } from './auth/VerifyPage';
import { DocumentGate } from './documentGate/DocumentGate';
import { DocumentSetupPage } from './documentSetup/DocumentSetupPage';
import { HomePage } from './home/HomePage';
import { LEGACY_PATHS } from './legacyRoutes';
import { NewMeetingPage } from './newMeeting/NewMeetingPage';
import { NotFoundPage } from './notFound/NotFoundPage';
import { ProcessingRoute } from './processing/ProcessingPage';
import { RecordingRoute } from './recording/RecordingPage';
import { ReviewRoute } from './review/ReviewPage';
import { ServerRecoveryOverlay } from './recovery/ServerRecoveryOverlay';
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
    <>
      <AppRoutes />
      {/* 서버 연결 복구 (CMN-02, #18). 기존 화면과 리뉴얼 화면 모두 위에 뜬다 */}
      <ServerRecoveryOverlay />
    </>
  );
}

function AppRoutes() {
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
      {/* 홈 (HOME-01, #24). 로그인 → 문서 연결 확인 다음에 그린다 */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <DocumentGate>
              <HomePage />
            </DocumentGate>
          </RequireAuth>
        }
      />
      {/* 새 회의 (MTG-01, #26). 회의 생성 후 녹음 화면(기존 App)으로 세션을 넘긴다 */}
      <Route
        path="/meetings/new"
        element={
          <RequireAuth>
            <DocumentGate>
              <NewMeetingPage />
            </DocumentGate>
          </RequireAuth>
        }
      />
      {/* 회의 녹음 (MTG-02, #27). 집중 모드 */}
      <Route
        path="/meetings/:sessionId/recording"
        element={
          <RequireAuth>
            <RecordingRoute />
          </RequireAuth>
        }
      />
      {/* 회의 처리 (MTG-03, #28). 집중 모드. 처리 완료(REVIEW)면 검토 화면(기존 App)으로 간다 */}
      <Route
        path="/meetings/:sessionId/processing"
        element={
          <RequireAuth>
            <ProcessingRoute />
          </RequireAuth>
        }
      />
      {/* 회의록 검토 (MTG-04, #29). 집중 모드 */}
      <Route
        path="/meetings/:sessionId/review"
        element={
          <RequireAuth>
            <ReviewRoute />
          </RequireAuth>
        }
      />
      {/* 문서 연결 (SET-02~06, #20~#22). 기존 App 레이아웃 밖에서 그린다 */}
      <Route
        path="/setup/document"
        element={
          <RequireAuth>
            <DocumentSetupPage />
          </RequireAuth>
        }
      />
      <Route
        path="/settings/document"
        element={
          <RequireAuth>
            <DocumentSetupPage settings />
          </RequireAuth>
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
      {/* 그 밖의 화면은 로그인해야 들어간다 (AUTH-01-F06, #15). 기존 경로가 아니면 페이지 없음(CMN-03, #18) */}
      <Route
        path="*"
        element={
          <RequireAuth>
            <LegacyOrNotFound />
          </RequireAuth>
        }
      />
    </Routes>
  );
}

const LEGACY_ROUTE_OBJECTS = LEGACY_PATHS.map((path) => ({ path }));

/** 기존 경로면 기존 App, 아니면 새 앱 틀의 페이지 없음. 한 자리에서 고르므로 기존 화면끼리 이동해도 App 상태가 유지된다 */
function LegacyOrNotFound() {
  const location = useLocation();
  return matchRoutes(LEGACY_ROUTE_OBJECTS, location) ? <App /> : <NotFoundPage />;
}
