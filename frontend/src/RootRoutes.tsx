import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import './tailwind.css';
import { GuestOnly, RequireAuth } from './auth/AuthGate';
import { LoginPage } from './auth/LoginPage';
import { VerifyPage } from './auth/VerifyPage';
import { DocumentGate } from './documentGate/DocumentGate';
import { DocumentSetupPage } from './documentSetup/DocumentSetupPage';
import { HomePage } from './home/HomePage';
import { MeetingDetailRoute } from './meetings/MeetingDetailPage';
import { MeetingsPage } from './meetings/MeetingsPage';
import { NewMeetingPage } from './newMeeting/NewMeetingPage';
import { NotFoundPage } from './notFound/NotFoundPage';
import { ParticipantsPage } from './participants/ParticipantsPage';
import { SettingsPage } from './settings/SettingsPage';
import { ProcessingRoute } from './processing/ProcessingPage';
import { RecordingRoute } from './recording/RecordingPage';
import { ReviewRoute } from './review/ReviewPage';
import { CompleteRoute } from './complete/CompletePage';
import { ServerRecoveryOverlay } from './recovery/ServerRecoveryOverlay';
import { ToastProvider } from './ui';

// 부품 확인 화면. 운영 빌드에서는 __UI_PREVIEW__가 false라 이 import가 번들에서 빠진다.
const UiPreview = __UI_PREVIEW__ ? lazy(() => import('./ui-preview/UiPreview')) : null;

/**
 * 최상위 라우트 (GitHub #9, 라우트별 레이아웃 선택).
 * 모든 화면이 리뉴얼 라우트다(R8 #39에서 기존 레이아웃 App을 지웠다). 로그인·부품 확인 화면을 뺀 경로는 로그인해야 들어간다.
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
      {/* 회의록 목록 (MIN-01, #32)·상세 (MIN-02, #33) */}
      <Route
        path="/meetings"
        element={
          <RequireAuth>
            <MeetingsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/meetings/:documentId"
        element={
          <RequireAuth>
            <MeetingDetailRoute />
          </RequireAuth>
        }
      />
      {/* 참석자 관리 (PTC-01, #36). 설정 아래 경로도 같은 화면 */}
      {['/participants', '/settings/participants'].map((path) => (
        <Route
          key={path}
          path={path}
          element={
            <RequireAuth>
              <DocumentGate>
                <ParticipantsPage />
              </DocumentGate>
            </RequireAuth>
          }
        />
      ))}
      {/* 새 회의 (MTG-01, #26). 회의 생성 후 녹음 화면으로 세션을 넘긴다 */}
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
      {/* 회의 처리 (MTG-03, #28). 집중 모드. 처리 완료(REVIEW)면 검토 화면으로 간다 */}
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
      {/* 회의 결과 (MTG-05, #30). 집중 모드 */}
      <Route
        path="/meetings/:sessionId/complete"
        element={
          <RequireAuth>
            <CompleteRoute />
          </RequireAuth>
        }
      />
      {/* 문서 연결 (SET-02~06, #20~#22) */}
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
      {/* 설정 (SET-01, #39) */}
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        }
      />
      {/* 그 밖의 경로는 로그인 뒤 페이지 없음(CMN-03, #18). 기존 레이아웃(App)은 모든 화면을 리뉴얼해 지웠다(#39) */}
      <Route
        path="*"
        element={
          <RequireAuth>
            <NotFoundPage />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
