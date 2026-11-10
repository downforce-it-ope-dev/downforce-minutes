/**
 * 기존 App(기존 레이아웃)이 그리는 경로 (GitHub #18).
 * 여기에 없는 경로는 RootRoutes가 페이지 없음(CMN-03)을 새 앱 틀로 그린다.
 * App.tsx의 <Route path>와 같아야 한다(legacyRoutes.test.ts가 검사). 화면을 리뉴얼해 옮기면 여기서도 지운다.
 */
export const LEGACY_PATHS = [
  '/settings',
  '/meetings',
  '/meetings/:documentId',
  '/meetings/:sessionId/review',
  '/meetings/:sessionId/complete',
  '/participants',
  '/settings/participants',
] as const;
