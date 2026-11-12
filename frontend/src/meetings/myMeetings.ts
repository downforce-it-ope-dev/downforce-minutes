import { loadAccountEmail } from '../auth/accountEmail';
import { listMeetings, type MeetingSummary } from '../meetingListApi';
import { listParticipants, type Participant } from '../participantsApi';

/*
 * 내 회의록 (사용자 결정 2026-11-12, #32).
 * 회의 목록 API는 문서 서비스에 저장된 회사 전체 회의를 주고, 만든 사람 정보가 없다.
 * 새 회의에서 로그인한 사람은 참석자로 자동 선택되므로, 로그인 이메일과 같은 참석자가 들어 있는 회의만 보인다.
 * 화면에서 거르는 것이라 접근 제한은 아니다(만든 사람 기준·접근 제한은 Backend 변경이 필요하다).
 */

/** 로그인 이메일과 같은 참석자가 들어 있는 회의만. 이메일이 없거나 명단에 없으면 빈 목록 */
export function filterOwnMeetings(meetings: readonly MeetingSummary[], roster: readonly Participant[], accountEmail: string | null): MeetingSummary[] {
  const email = accountEmail?.trim().toLowerCase();
  if (!email) return [];
  const selfIds = new Set(roster.filter((person) => person.email.trim().toLowerCase() === email).map(({ id }) => id));
  if (selfIds.size === 0) return [];
  return meetings.filter((meeting) => meeting.participants.some(({ id }) => selfIds.has(id)));
}

/** 내 회의록. 서버 목록(최근 최대 100건)을 받아 거른 뒤 limit만큼 */
export async function listMyMeetings(limit?: number): Promise<MeetingSummary[]> {
  const [meetings, roster] = await Promise.all([listMeetings(), listParticipants()]);
  const mine = filterOwnMeetings(meetings, roster, loadAccountEmail());
  return limit === undefined ? mine : mine.slice(0, limit);
}
