import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listMyMeetings, peekMyMeetings } from './meetings/myMeetings';
import { listParticipants, peekParticipants } from './participantsApi';
import { ParticipantsPage } from './participants/ParticipantsPage';
import { withHealthyBackend } from './testUtils/withHealthyBackend';

/*
 * 회의록·참석자 로딩 개선 (2026-11-12): 같은 요청 합치기, 받은 목록 기억, 내 참석자 ID 기억.
 */
vi.mock('./auth/authApi', () => ({ logout: vi.fn().mockResolvedValue(undefined) }));

const ROSTER = [
  { id: 'p1', name: '홍길동', email: 'me@miinit.com' },
  { id: 'p2', name: '김철수', email: 'kim@miinit.com' },
];
const MEETINGS = [
  { documentId: 'mine', title: '내 회의', meetingAt: '2026-11-05T10:00:00+09:00', participants: [{ id: 'p1', name: '홍길동' }], documentUrl: null },
  { documentId: 'other', title: '남의 회의', meetingAt: '2026-11-04T10:00:00+09:00', participants: [{ id: 'p2', name: '김철수' }], documentUrl: null },
];

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

/** 참석자 목록은 release()를 부를 때까지 끝나지 않는다(느린 Backend 흉내) */
function slowApi() {
  const waiting: Array<() => void> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path === '/api/v1/participants') {
      await new Promise<void>((resolve) => waiting.push(resolve));
      return json({ data: { items: ROSTER } });
    }
    if (path === '/api/v1/meetings') return json({ data: { items: MEETINGS } });
    if (path.endsWith('/processing-failures')) return json({ data: { items: [] } });
    throw new Error(`Unexpected ${path}`);
  });
  vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
  const calls = (path: string) => fetchMock.mock.calls.filter(([url]) => new URL(String(url), 'http://localhost').pathname === path).length;
  return { release: () => waiting.splice(0).forEach((resolve) => resolve()), calls, fetchMock };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('목록 기억과 요청 합치기', () => {
  it('진행 중인 같은 참석자 목록 요청은 한 번만 보내고, 받은 목록을 기억한다', async () => {
    const api = slowApi();
    // 같은 fetch로 이어서 부르도록 stub된 fetch를 그대로 쓴다
    const first = listParticipants();
    const second = listParticipants();
    expect(peekParticipants()).toBeUndefined();
    api.release();
    expect(await first).toEqual(ROSTER);
    expect(await second).toEqual(ROSTER);
    expect(api.calls('/api/v1/participants')).toBe(1);
    expect(peekParticipants()).toEqual(ROSTER);
  });

  it('참석자 화면에 다시 들어오면 기억한 목록을 바로 보이고 뒤에서 새로 받는다', async () => {
    const api = slowApi();
    const loaded = listParticipants();
    api.release();
    await loaded;
    render(
      <MemoryRouter>
        <ParticipantsPage />
      </MemoryRouter>,
    );
    // 새 요청이 아직 끝나지 않았어도 목록이 보인다
    expect(screen.getByRole('list', { name: '참석자 목록' })).toBeTruthy();
    expect(screen.queryByLabelText('참석자 목록 불러오는 중')).toBeNull();
    expect(api.calls('/api/v1/participants')).toBe(2);
    api.release();
  });

  it('내 참석자 ID를 기억한 뒤에는 느린 참석자 목록을 기다리지 않고 내 회의록을 준다', async () => {
    localStorage.setItem('ma-auth-email', 'Me@miinit.com');
    const api = slowApi();
    const first = listMyMeetings();
    api.release();
    expect((await first).map(({ documentId }) => documentId)).toEqual(['mine']);

    // 두 번째: 참석자 목록이 끝나지 않아도 결과가 나온다
    const second = await listMyMeetings();
    expect(second.map(({ documentId }) => documentId)).toEqual(['mine']);
    expect(peekMyMeetings(1)?.map(({ documentId }) => documentId)).toEqual(['mine']);
    api.release();
  });
});
