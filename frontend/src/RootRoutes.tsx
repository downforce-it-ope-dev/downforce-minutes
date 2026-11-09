import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { App } from './App';

// 부품 확인 화면. 운영 빌드에서는 __UI_PREVIEW__가 false라 이 import가 번들에서 빠진다.
const UiPreview = __UI_PREVIEW__ ? lazy(() => import('./ui-preview/UiPreview')) : null;

/**
 * 최상위 라우트 (GitHub #9, 라우트별 레이아웃 선택).
 * 리뉴얼 라우트는 기존 레이아웃(App의 헤더·하단 탭 바·기존 CSS) 밖에서 그린다.
 * 그 밖의 모든 경로는 지금과 똑같이 기존 App이 처리한다.
 * 리뉴얼 화면을 공개할 때 여기에 라우트를 추가한다(예: /login).
 */
export function RootRoutes() {
  return (
    <Routes>
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
