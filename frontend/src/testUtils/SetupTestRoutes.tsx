import { Route, Routes } from 'react-router';
import { DocumentGate } from '../documentGate/DocumentGate';
import { DocumentSetupPage } from '../documentSetup/DocumentSetupPage';
import { HomePage } from '../home/HomePage';
import { NewMeetingPage } from '../newMeeting/NewMeetingPage';
import { NotFoundPage } from '../notFound/NotFoundPage';
import { SettingsPage } from '../settings/SettingsPage';
import { ParticipantsPage } from '../participants/ParticipantsPage';

/** 테스트용 라우트. 실제 RootRoutes와 같은 화면을 그린다(로그인 확인 제외) */
export function SetupTestRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DocumentGate><HomePage /></DocumentGate>} />
      <Route path="/meetings/new" element={<DocumentGate><NewMeetingPage /></DocumentGate>} />
      <Route path="/participants" element={<DocumentGate><ParticipantsPage /></DocumentGate>} />
      <Route path="/settings/participants" element={<DocumentGate><ParticipantsPage /></DocumentGate>} />
      <Route path="/setup/document" element={<DocumentSetupPage />} />
      <Route path="/settings/document" element={<DocumentSetupPage settings />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
