import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withHealthyBackend } from '../testUtils/withHealthyBackend';
import { MeetingDetailRoute } from './MeetingDetailPage';
import { MeetingsPage } from './MeetingsPage';
import { filterOwnMeetings } from './myMeetings';

const MEETINGS = [
  { documentId: 'doc-old', title: '고객 지원 주간 회의', meetingAt: '2026-10-10T12:00:00+09:00', participants: [{ id: 'p2', name: '이영희' }], documentUrl: null },
  { documentId: 'doc/new', title: '제품 전략 회의', meetingAt: '2026-10-14T10:00:00+09:00', participants: [{ id: 'p1', name: '홍길동' }, { id: 'p2', name: '이영희' }, { id: 'p3', name: '김철수' }, { id: 'p4', name: '박민수' }], documentUrl: null },
  // 로그인한 사람(이영희, p2)이 참석하지 않은 회의는 보이지 않는다
  { documentId: 'doc-other', title: '다른 팀 회의', meetingAt: '2026-10-12T09:00:00+09:00', participants: [{ id: 'p1', name: '홍길동' }], documentUrl: null },
];
const ROSTER = [
  { id: 'p1', name: '홍길동', email: 'hong@miinit.com' },
  { id: 'p2', name: '이영희', email: 'Me@Miinit.com' },
];
const FAILURE = {
  sessionId: 's-fail', version: 4, title: '실패한 회의', meetingAt: '2026-11-05T10:00:00+09:00', stage: 'TRANSCRIPTION',
  errorCode: 'X', audioExpiresAt: '2026-11-06T10:00:00+09:00', allowedActions: ['RETRY_PROCESSING'],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockApi({ meetings = MEETINGS, failures = [] as unknown[], listStatus = 200, retry }: { meetings?: unknown[]; failures?: unknown[]; listStatus?: number; retry?: () => Response } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path.endsWith('/processing-failures')) return json({ data: { items: failures } });
    if (path.endsWith('/participants')) return json({ data: { items: ROSTER } });
    if (path.endsWith('/processing/retry') && init?.method === 'POST') return retry ? retry() : json({ data: { sessionId: 's-fail', status: 'PROCESSING', stage: 'TRANSCRIPTION' } }, 202);
    if (path === '/api/v1/meetings') return listStatus === 200 ? json({ data: { items: meetings } }) : json({ error: { code: 'INTERNAL' } }, listStatus);
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
  return fetchMock;
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderList(entry = '/meetings') {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/meetings" element={<MeetingsPage />} />
        <Route path="/meetings/:sessionId/processing" element={<p>처리</p>} />
        <Route path="/meetings/:documentId" element={<MeetingDetailRoute />} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

const rows = () => within(screen.getByRole('list', { name: '회의록' })).getAllByRole('link');

beforeEach(() => localStorage.setItem('ma-auth-email', 'me@miinit.com'));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('회의록 목록 (MIN-01)', () => {
  it('최신순 2줄 행(회의명, 일시 · 참석자 최대 3명)과 건수를 보이고 행을 누르면 상세로 간다', async () => {
    mockApi();
    renderList();
    expect(await screen.findByRole('list', { name: '회의록' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: '회의록' })).toBeTruthy();
    expect(screen.getByText('총 2건')).toBeTruthy();
    // 휴대폰 둘째 줄과 태블릿 열이 함께 있다(크기마다 한쪽만 보인다)
    expect(rows()[0].textContent).toContain('제품 전략 회의');
    expect(rows()[0].textContent).toContain('2026.10.14 10:00 · 홍길동, 이영희, 김철수, 외 1명');
    expect(rows()[1].textContent).toContain('고객 지원 주간 회의');
    expect(screen.queryByText('다른 팀 회의')).toBeNull();
    expect(rows()[0].getAttribute('href')).toBe('/meetings/doc%2Fnew');
    expect(screen.queryByRole('heading', { name: /처리 실패/ })).toBeNull();
  });

  it('검색은 입력하는 즉시 회의명·참석자로 거르고, 조건은 주소에 남는다. 결과가 없으면 조건 초기화', async () => {
    const fetchMock = mockApi();
    renderList();
    await screen.findByRole('list', { name: '회의록' });
    const before = fetchMock.mock.calls.length;
    const search = screen.getByRole('searchbox', { name: '회의 검색' });
    fireEvent.change(search, { target: { value: '홍길동' } });
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('제품 전략 회의');
    expect(screen.getByText('총 1건')).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toBe('/meetings?q=%ED%99%8D%EA%B8%B8%EB%8F%99');

    fireEvent.change(search, { target: { value: '없는 회의' } });
    expect(screen.getByText('검색 결과 없음')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('region', { name: '회의 목록' })).getByRole('button', { name: '조건 초기화' }));
    expect(rows()).toHaveLength(2);
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it('주소의 기간을 적용해 건수 옆과 기간 버튼에 표시하고, 정렬 버튼으로 오래된순으로 바꾼다', async () => {
    mockApi({ meetings: [...MEETINGS, { documentId: 'doc-x', title: '11월 회의', meetingAt: '2026-11-02T09:00:00+09:00', participants: [], documentUrl: null }] });
    renderList('/meetings?from=2026-10-01&to=2026-10-31');
    await screen.findByRole('list', { name: '회의록' });
    expect(screen.getByRole('button', { name: '기간 10.01 ~ 10.31' })).toBeTruthy();
    expect(screen.getByText('총 2건 · 10.01 ~ 10.31')).toBeTruthy();
    expect(rows()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '정렬: 최신순' }));
    expect(rows()[0].textContent).toContain('고객 지원 주간 회의');
    expect(screen.getByTestId('where').textContent).toContain('sort=old');
  });

  it('기간 버튼은 시작일·종료일 대화상자를 열고 초기화로 기간을 지운다. 조건이 있을 때만 초기화 버튼이 보인다', async () => {
    mockApi();
    renderList('/meetings?from=2026-10-13');
    await screen.findByRole('list', { name: '회의록' });
    expect(rows()).toHaveLength(1);
    expect(screen.getByRole('button', { name: '조건 초기화' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /기간 10\.13 ~/ }));
    const dialog = await screen.findByRole('dialog', { name: '기간' });
    expect(within(dialog).getByRole('button', { name: '시작일' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: '종료일' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '초기화' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '확인' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '기간' })).toBeNull());
    expect(rows()).toHaveLength(2);
    expect(screen.getByRole('button', { name: '기간' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '조건 초기화' })).toBeNull();
  });

  it('처리 실패 회의가 있으면 목록 위에 보이고, 다시 처리하면 회의 처리 화면으로 간다', async () => {
    const fetchMock = mockApi({ failures: [FAILURE] });
    renderList();
    const section = await screen.findByRole('region', { name: /처리 실패 1건/ });
    expect(section.textContent).toContain('음성 인식 실패');
    expect(section.textContent).toContain('오디오 만료 11.06 10:00');
    fireEvent.click(within(section).getByRole('button', { name: '실패한 회의 다시 처리' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/meetings/s-fail/processing'));
    const post = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/processing/retry'));
    expect(new Headers(post?.[1]?.headers).get('If-Match')).toBe('"4"');
  });

  it('오디오가 만료돼 다시 처리하지 못하면 토스트로 알린다', async () => {
    mockApi({ failures: [FAILURE], retry: () => json({ error: { code: 'AUDIO_NOT_AVAILABLE' } }, 409) });
    renderList();
    const section = await screen.findByRole('region', { name: /처리 실패 1건/ });
    fireEvent.click(within(section).getByRole('button', { name: '실패한 회의 다시 처리' }));
    expect(await screen.findByText('오디오 보관 기간이 지나 다시 처리할 수 없습니다')).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toBe('/meetings');
  });

  it('회의가 없으면 빈 상태, 조회에 실패하면 다시 시도', async () => {
    mockApi({ meetings: [] });
    renderList();
    expect(await screen.findByText('회의 기록이 없습니다')).toBeTruthy();
    cleanup();

    const fetchMock = mockApi({ listStatus: 500 });
    renderList();
    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/v1/meetings')).length).toBe(2));
  });

  it('상세에서 목록으로 돌아오면 검색 조건이 그대로다', async () => {
    mockApi();
    const detail = { documentId: 'doc/new', title: '제품 전략 회의', meetingAt: '2026-10-14T10:00:00+09:00', participants: [], minutes: { summary: '', discussionPoints: [], decisions: [], actionItems: [], followUps: [] }, transcript: [], documentUrl: null };
    const base = vi.mocked(fetch);
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      new URL(String(input), 'http://localhost').pathname === '/api/v1/meetings/doc%2Fnew' ? Promise.resolve(json({ data: detail })) : base(input, init)));
    renderList('/meetings?q=%EC%A0%9C%ED%92%88');
    fireEvent.click((await screen.findAllByRole('link', { name: /제품 전략 회의/ }))[0]);
    fireEvent.click(await screen.findByRole('button', { name: '회의록 목록' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/meetings?q=%EC%A0%9C%ED%92%88'));
    expect(screen.getByRole('searchbox', { name: '회의 검색' })).toHaveProperty('value', '제품');
  });

  it('로그인 이메일이 참석자 명단에 없으면 아무 회의도 보이지 않는다', async () => {
    localStorage.setItem('ma-auth-email', 'nobody@miinit.com');
    mockApi();
    renderList();
    expect(await screen.findByText('회의 기록이 없습니다')).toBeTruthy();
  });
});

describe('filterOwnMeetings', () => {
  it('로그인 이메일(대소문자·공백 무시)과 같은 참석자가 있는 회의만 남긴다', () => {
    const roster = [{ id: 'p1', name: 'A', email: ' Me@Miinit.com ' }, { id: 'p2', name: 'B', email: 'b@miinit.com' }];
    const meetings = [
      { documentId: '1', title: 'mine', meetingAt: '2026-10-01T10:00:00Z', participants: [{ id: 'p1', name: 'A' }], documentUrl: null },
      { documentId: '2', title: 'other', meetingAt: '2026-10-01T10:00:00Z', participants: [{ id: 'p2', name: 'B' }], documentUrl: null },
    ];
    expect(filterOwnMeetings(meetings, roster, 'me@miinit.com').map(({ title }) => title)).toEqual(['mine']);
    expect(filterOwnMeetings(meetings, roster, null)).toEqual([]);
    expect(filterOwnMeetings(meetings, roster, 'x@miinit.com')).toEqual([]);
  });
});
