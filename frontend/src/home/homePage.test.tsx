import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withHealthyBackend } from '../testUtils/withHealthyBackend';
import { HomePage } from './HomePage';

vi.mock('../auth/authApi', () => ({ logout: vi.fn().mockResolvedValue(undefined) }));

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(status < 400 ? { data } : data), { status, headers: { 'Content-Type': 'application/json' } });
}

const ready = { version: 1, status: 'READY', active: { provider: 'NOTION', connectionVersion: 2, rootUrl: 'https://notion.example' }, draft: null, operation: null, canCreateMeeting: true };
const meetings = [
  { documentId: 'd1', title: '주간 회의', meetingAt: '2026-11-05T10:00:00+09:00', participants: [{ id: 'p1', name: 'Ada' }, { id: 'p2', name: 'Grace' }, { id: 'p3', name: 'Linus' }, { id: 'p4', name: 'Ken' }], documentUrl: null },
  { documentId: 'd2', title: '설계 리뷰', meetingAt: '2026-11-04T14:00:00+09:00', participants: [], documentUrl: null },
];

function install({ list = meetings, failures = [] as unknown[], listFails = 0 } = {}) {
  let listCalls = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/document-setup')) return json(ready);
    if (path.endsWith('/processing-failures')) return json({ items: failures });
    if (path.endsWith('/meetings')) {
      listCalls += 1;
      return listCalls <= listFails ? json({ error: { code: 'DOCUMENT_FAILED', message: 'x' } }, 502) : json({ items: list });
    }
    throw new Error(`Unexpected ${path}`);
  });
  vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
  return fetchMock;
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/meetings" element={<h1>회의록 목록</h1>} />
        <Route path="/meetings/new" element={<h1>새 회의 화면</h1>} />
        <Route path="/meetings/:id" element={<h1>회의록 상세</h1>} />
        <Route path="/settings/document" element={<h1>문서 연결 관리</h1>} />
        <Route path="/login" element={<h1>로그인 화면</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => localStorage.setItem('ma-auth-email', 'meet@miinit.com'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('HOME-01 메인 (#24)', () => {
  it('최근 회의 3건을 제목·일시·참석자(최대 3명 + 외 n명)로 보이고 상세로 이동한다', async () => {
    const fetchMock = install();
    renderHome();
    const first = await screen.findByRole('link', { name: '주간 회의 상세 보기' });
    expect(first.textContent).toContain('Ada, Grace, Linus, 외 1명');
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/meetings?limit=3'))).toBe(true);
    fireEvent.click(first);
    expect(await screen.findByRole('heading', { name: '회의록 상세' })).toBeTruthy();
  });

  it('목록을 불러오지 못하면 다시 시도할 수 있다', async () => {
    install({ listFails: 1 });
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('link', { name: '설계 리뷰 상세 보기' })).toBeTruthy();
  });

  it('처리에 실패한 회의가 있을 때만 배너를 보이고, 누르면 회의록 목록으로 간다', async () => {
    const failure = (sessionId: string) => ({ sessionId, version: 1, title: '실패 회의', meetingAt: '2026-11-05T10:00:00+09:00', stage: 'TRANSCRIPTION', errorCode: 'X', audioExpiresAt: null, allowedActions: [] });
    install({ failures: [failure('s1'), failure('s2')] });
    renderHome();
    fireEvent.click(await screen.findByRole('link', { name: /처리에 실패한 회의 2건/ }));
    expect(await screen.findByRole('heading', { name: '회의록 목록' })).toBeTruthy();
  });

  it('새 회의 버튼은 새 회의 화면으로 간다(상단 바에는 두지 않는다)', async () => {
    install();
    renderHome();
    const buttons = await screen.findAllByRole('button', { name: '새 회의' });
    fireEvent.click(buttons[0]);
    expect(await screen.findByRole('heading', { name: '새 회의 화면' })).toBeTruthy();
  });

  it('문서 연결 상태 칩으로 팝업을 열고 문서 연결 관리로 간다', async () => {
    install();
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /Notion 연결됨/ }));
    const dialog = screen.getByRole('dialog', { name: '문서 연결 상태' });
    expect(within(dialog).getByText('연결됨 · 버전 2')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '문서 연결 관리' }));
    expect(await screen.findByRole('heading', { name: '문서 연결 관리' })).toBeTruthy();
  });

  it('계정에 로그인 이메일을 보이고, 로그아웃을 확인하면 이메일을 지우고 로그인 화면으로 간다', async () => {
    install();
    renderHome();
    expect((await screen.findAllByText('meet@miinit.com')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: '로그아웃' })[0]);
    const confirm = await screen.findByRole('dialog', { name: '로그아웃할까요?' });
    fireEvent.click(within(confirm).getByRole('button', { name: '로그아웃' }));
    expect(await screen.findByRole('heading', { name: '로그인 화면' })).toBeTruthy();
    await waitFor(() => expect(localStorage.getItem('ma-auth-email')).toBeNull());
  });
});
