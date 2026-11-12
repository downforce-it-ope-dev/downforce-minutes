import { loadAccountEmail } from '../auth/accountEmail';
import { listMeetings, peekMeetings, type MeetingSummary } from '../meetingListApi';
import { listParticipants, peekParticipants, type Participant } from '../participantsApi';

/*
 * 내 회의록 (사용자 결정 2026-11-12, #32).
 * 회의 목록 API는 문서 서비스에 저장된 회사 전체 회의를 주고, 만든 사람 정보가 없다.
 * 새 회의에서 로그인한 사람은 참석자로 자동 선택되므로, 로그인 이메일과 같은 참석자가 들어 있는 회의만 보인다.
 * 화면에서 거르는 것이라 접근 제한은 아니다(만든 사람 기준·접근 제한은 Backend 변경이 필요하다).
 *
 * 로딩 개선(2026-11-12): 참석자 목록은 Backend에서 느리므로, 로그인 이메일에 해당하는 참석자 ID를 이 브라우저에 기억해 두고
 * 다음부터는 회의 목록만 기다린다. 참석자 목록은 뒤에서 새로 받아 기억한 ID를 고친다.
 */
const SELF_IDS_KEY = 'ma-self-participant-ids';

/** 로그인 이메일과 같은 참석자 ID들. 이메일이 없거나 명단에 없으면 빈 배열 */
export function selfParticipantIds(roster: readonly Participant[], accountEmail: string | null): string[] {
  const email = accountEmail?.trim().toLowerCase();
  if (!email) return [];
  return roster.filter((person) => person.email.trim().toLowerCase() === email).map(({ id }) => id);
}

/** 로그인 이메일과 같은 참석자가 들어 있는 회의만. 이메일이 없거나 명단에 없으면 빈 목록 */
export function filterOwnMeetings(meetings: readonly MeetingSummary[], roster: readonly Participant[], accountEmail: string | null): MeetingSummary[] {
  return byParticipantIds(meetings, selfParticipantIds(roster, accountEmail));
}

function byParticipantIds(meetings: readonly MeetingSummary[], ids: readonly string[]): MeetingSummary[] {
  if (ids.length === 0) return [];
  const set = new Set(ids);
  return meetings.filter((meeting) => meeting.participants.some(({ id }) => set.has(id)));
}

function loadSelfIds(email: string | null): string[] | null {
  if (!email) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(SELF_IDS_KEY) ?? 'null') as { email?: unknown; ids?: unknown } | null;
    return saved?.email === email.trim().toLowerCase() && Array.isArray(saved.ids) && saved.ids.length > 0 ? (saved.ids as string[]) : null;
  } catch {
    return null;
  }
}

function saveSelfIds(email: string | null, ids: string[]) {
  if (!email) return;
  try {
    if (ids.length) localStorage.setItem(SELF_IDS_KEY, JSON.stringify({ email: email.trim().toLowerCase(), ids }));
    else localStorage.removeItem(SELF_IDS_KEY);
  } catch {
    // 저장소를 못 쓰면 매번 참석자 목록을 기다린다
  }
}

const limited = (items: MeetingSummary[], limit?: number) => (limit === undefined ? items : items.slice(0, limit));

/** 이미 받아 둔 목록으로 바로 그릴 수 있으면 내 회의록, 아니면 undefined */
export function peekMyMeetings(limit?: number): MeetingSummary[] | undefined {
  const meetings = peekMeetings();
  if (!meetings) return undefined;
  const email = loadAccountEmail();
  const roster = peekParticipants();
  const ids = roster ? selfParticipantIds(roster, email) : loadSelfIds(email);
  if (!ids) return undefined;
  return limited(byParticipantIds(meetings, ids), limit);
}

/** 내 회의록. 서버 목록(최근 최대 100건)을 받아 거른 뒤 limit만큼 */
export async function listMyMeetings(limit?: number): Promise<MeetingSummary[]> {
  const email = loadAccountEmail();
  const rosterIds = listParticipants().then((roster) => {
    const ids = selfParticipantIds(roster, email);
    saveSelfIds(email, ids);
    return ids;
  });
  const remembered = loadSelfIds(email);
  // 기억한 ID가 있으면 참석자 목록을 기다리지 않는다(뒤에서 받아 기억만 고친다)
  if (remembered) rosterIds.catch(() => undefined);
  const [meetings, ids] = await Promise.all([listMeetings(), remembered ?? rosterIds]);
  return limited(byParticipantIds(meetings, ids), limit);
}
