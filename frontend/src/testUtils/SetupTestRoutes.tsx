import { Route, Routes } from 'react-router';
import { App } from '../App';
import { DocumentSetupPage } from '../documentSetup/DocumentSetupPage';

/** 문서 연결 테스트용 라우트. 실제 RootRoutes처럼 문서 연결 화면은 App 밖, 나머지는 App이 그린다(로그인 확인 제외) */
export function SetupTestRoutes() {
  return (
    <Routes>
      <Route path="/setup/document" element={<DocumentSetupPage />} />
      <Route path="/settings/document" element={<DocumentSetupPage settings />} />
      <Route path="*" element={<App />} />
    </Routes>
  );
}
