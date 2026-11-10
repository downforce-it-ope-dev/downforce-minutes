import type { MeetingDraft, MeetingSession } from '../newMeetingApi';

/*
 * 새 회의에서 만든 녹음 세션을 녹음 화면에 넘긴다 (GitHub #26).
 * 새 회의(MTG-01)는 리뉴얼 라우트라 기존 App 밖에서 그려지므로, 세션을 이 브라우저 탭(sessionStorage)에 두고
 * 기존 App이 녹음 화면을 그릴 때 읽는다. 새로고침 복원도 같은 값을 쓴다.
 * 저장소를 쓸 수 없는 브라우저에서도 같은 탭 안에서는 넘어가도록 메모리에도 둔다.
 */
export type RecordingSession = MeetingSession & { title: string; draft?: MeetingDraft };

const KEY = 'meeting-automation.recording-session';
let memory: RecordingSession | null = null;

function isValid(value: RecordingSession | null): value is RecordingSession {
  return Boolean(value?.sessionId && value.title && value.uploadPolicy && Number.isFinite(value.uploadPolicy.maxChunkBytes));
}

export function saveRecordingSession(session: RecordingSession): void {
  memory = session;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // 저장소를 못 쓰면 새로고침 복원만 안 된다
  }
}

export function restoreRecordingSession(): RecordingSession | null {
  try {
    const value = sessionStorage.getItem(KEY);
    if (value) {
      const parsed = JSON.parse(value) as RecordingSession;
      return isValid(parsed) ? parsed : null;
    }
  } catch {
    // 아래 메모리 값을 쓴다
  }
  return isValid(memory) ? memory : null;
}

export function clearRecordingSession(): void {
  memory = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}
