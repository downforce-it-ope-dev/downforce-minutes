import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeetingDetail } from '../meetingDetailApi';
import { withHealthyBackend } from '../testUtils/withHealthyBackend';
import { MeetingDetailRoute } from './MeetingDetailPage';
import { minutesText, safeDocumentUrl } from './meetingView';

const DETAIL: MeetingDetail = {
  documentId: 'doc/a',
  title: '주간 회의',
  meetingAt: '2026-11-05T10:00:00+09:00',
  participants: [{ id: 'p1', name: '홍길동' }, { id: 'p2', name: '김철수' }],
  minutes: {
    summary: '이번 주 일정을 정리했다.',
    discussionPoints: ['배포 일정'],
    decisions: [],
    actionItems: [{ ownerParticipantId: 'p1', task: '일정표 공유', dueDate: '2026-11-12' }, { ownerParticipantId: null, task: '회의실 예약', dueDate: null }],
    followUps: ['다음 주 점검'],
  },
  transcript: [
    { segmentId: 's2', speakerId: 'p2', startMs: 15_000, endMs: 20_000, text: '확인했습니다.' },
    { segmentId: 's1', speakerId: 'p1', startMs: 1_000, endMs: 9_000, text: '이번 주 일정은 이렇습니다.' },
  ],
  documentUrl: 'https://notion.example/page',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockDetail(respond: () => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    void input;
    return respond();
  });
  vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
  return fetchMock;
}

function renderDetail() {
  render(
    <MemoryRouter initialEntries={['/meetings/doc%2Fa']}>
      <Routes>
        <Route path="/meetings/:documentId" element={<MeetingDetailRoute />} />
        <Route path="/meetings" element={<p>목록</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('회의록 상세 (MIN-02)', () => {
  it('회의 정보와 내용이 있는 섹션만 검토 화면과 같은 이름·순서로 위아래로 보인다', async () => {
    const fetchMock = mockDetail(() => json({ data: DETAIL }));
    renderDetail();
    expect(await screen.findByRole('heading', { level: 2, name: '주간 회의' })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/v1/meetings/doc%2Fa'))).toBe(true);
    expect(screen.getByText(/참석자 홍길동, 김철수/)).toBeTruthy();
    const article = screen.getByRole('article');
    expect(within(article).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['회의 요약', '논의 내용', '후속 조치', '실행 항목']);
    const actions = within(screen.getByRole('region', { name: '실행 항목' })).getAllByRole('listitem');
    expect(actions.map((item) => item.textContent)).toEqual(['일정표 공유담당 홍길동기한 2026-11-12', '회의실 예약담당 미지정기한 없음']);
    // 목차는 두지 않는다(사용자 결정 2026-11-11)
    expect(screen.queryByRole('navigation', { name: '목차' })).toBeNull();
    // 편집 동작 없음
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('원본 문서는 새 탭으로 열고, http(s)가 아니면 숨긴다', async () => {
    mockDetail(() => json({ data: DETAIL }));
    renderDetail();
    const link = await screen.findByRole('link', { name: '원본 문서' });
    expect(link.getAttribute('href')).toBe('https://notion.example/page');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    cleanup();

    mockDetail(() => json({ data: { ...DETAIL, documentUrl: 'javascript:alert(1)' } }));
    renderDetail();
    await screen.findByRole('heading', { level: 2, name: '주간 회의' });
    expect(screen.queryByRole('link', { name: '원본 문서' })).toBeNull();
    expect(safeDocumentUrl(null)).toBeNull();
  });

  it('전사 원문은 시간 순으로 참석자 이름과 함께 보이고 Esc로 닫는다', async () => {
    mockDetail(() => json({ data: DETAIL }));
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: '전사 원문' }));
    const dialog = await screen.findByRole('dialog', { name: '전사 원문' });
    const items = within(dialog).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['홍길동00:01이번 주 일정은 이렇습니다.', '김철수00:15확인했습니다.']);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '전사 원문' })).toBeNull());
  });

  it('복사하면 섹션 순서대로 텍스트를 넣고 토스트로 알린다', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    mockDetail(() => json({ data: DETAIL }));
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: '복사' }));
    expect(await screen.findByText('회의록을 복사했습니다')).toBeTruthy();
    const text = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(text).toBe(minutesText(DETAIL));
    expect(text.split('\n')).toEqual([
      '주간 회의', expect.stringContaining('2026년 11월 5일'), '참석자: 홍길동, 김철수',
      '', '회의 요약', '이번 주 일정을 정리했다.',
      '', '논의 내용', '- 배포 일정',
      '', '후속 조치', '- 다음 주 점검',
      '', '실행 항목', '- 일정표 공유 (담당 홍길동, 기한 2026-11-12)', '- 회의실 예약',
    ]);
  });

  it('없는 회의록은 목록으로 안내하고, 조회 실패는 다시 시도한다', async () => {
    mockDetail(() => json({ error: { code: 'MEETING_NOT_FOUND' } }, 404));
    renderDetail();
    expect(await screen.findByText('회의록을 찾을 수 없습니다')).toBeTruthy();
    expect(screen.getByRole('link', { name: '회의록 목록' }).getAttribute('href')).toBe('/meetings');
    cleanup();

    let calls = 0;
    mockDetail(() => (++calls === 1 ? json({ error: { code: 'INTERNAL' } }, 500) : json({ data: DETAIL })));
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('heading', { level: 2, name: '주간 회의' })).toBeTruthy();
  });
});
