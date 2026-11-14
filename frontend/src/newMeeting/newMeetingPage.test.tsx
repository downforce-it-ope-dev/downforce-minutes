import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withHealthyBackend } from '../testUtils/withHealthyBackend';
import { restoreRecordingSession } from '../meeting/recordingSessionStore';
import { NewMeetingPage } from './NewMeetingPage';

const templates = [
  { id: 'default.md', name: '기본 회의록', version: '1.0.0' },
  { id: 'project.md', name: '프로젝트 회의', version: '1.0.0' },
];
const participants = [
  { id: 'p3', name: '홍길동', email: 'hong@miinit.com' },
  { id: 'p1', name: '김철수', email: 'kim@miinit.com' },
  { id: 'p2', name: '이영희', email: 'Me@Miinit.com' },
];
const readyConfig = {
  company: { id: 'c1', name: 'Example', timezone: 'Asia/Seoul' },
  document: { provider: 'NOTION', configured: true, connectionVersion: 3, rootUrl: 'https://notion.example' },
  setup: { status: 'READY', required: false, canCreateMeeting: true, operationId: null },
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockApi(overrides: { config?: unknown; templates?: unknown; participants?: unknown } = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path.endsWith('/app-config')) return Promise.resolve(response({ data: overrides.config ?? readyConfig }));
    if (path.endsWith('/templates')) return Promise.resolve(response({ data: { items: overrides.templates ?? templates } }));
    if (path.endsWith('/participants')) return Promise.resolve(response({ data: { items: overrides.participants ?? participants } }));
    if (path.endsWith('/meeting-sessions') && init?.method === 'POST') {
      return Promise.resolve(
        response(
          { data: { sessionId: 's-1', version: 1, status: 'CREATED', uploadPolicy: { chunkDurationSeconds: 30, maxChunkBytes: 1000, acceptedMimeTypes: ['audio/webm'] } } },
          201,
        ),
      );
    }
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
  vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
  return fetchMock;
}

function Recording() {
  return <h1>{useLocation().pathname}</h1>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/meetings/new']}>
      <Routes>
        <Route path="/meetings/new" element={<NewMeetingPage />} />
        <Route path="/meetings/:sessionId/recording" element={<Recording />} />
      </Routes>
    </MemoryRouter>,
  );
}

const list = () => within(screen.getByRole('list', { name: '참석자 목록' }));
const box = (name: RegExp) => list().getByRole('checkbox', { name });

beforeEach(() => {
  localStorage.setItem('ma-auth-email', 'me@miinit.com');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe('새 회의 (MTG-01)', () => {
  it('로그인한 사람은 자동으로 선택되고 해제할 수 없다', async () => {
    mockApi();
    renderPage();
    const self = await screen.findByRole('checkbox', { name: /이영희 \(나\)/ });
    expect(self).toHaveProperty('checked', true);
    expect(self).toHaveProperty('disabled', true);
    expect(screen.getByText('1명 선택됨')).toBeTruthy();
    fireEvent.click(self);
    expect(self).toHaveProperty('checked', true);
  });

  it('선택한 참석자가 앞쪽에 오고, 그 안과 나머지는 이름 가나다순이다(2026-11-12)', async () => {
    mockApi();
    renderPage();
    await screen.findByRole('list', { name: '참석자 목록' });
    const names = () => list().getAllByRole('checkbox').map((item) => item.getAttribute('aria-label')?.split(' ')[0]);
    // 로그인한 사람(이영희)은 자동 선택이라 맨 앞
    expect(names()).toEqual(['이영희', '김철수', '홍길동']);
    fireEvent.click(box(/홍길동/));
    expect(names()).toEqual(['이영희', '홍길동', '김철수']);
    fireEvent.click(box(/홍길동/));
    expect(names()).toEqual(['이영희', '김철수', '홍길동']);
  });

  it('다른 화면에서 받아 둔 참석자·템플릿이 있으면 바로 보이고 뒤에서 새로 받는다', async () => {
    const fetchMock = mockApi();
    renderPage();
    await screen.findByRole('list', { name: '참석자 목록' });
    cleanup();
    // 두 번째 열기: 참석자·템플릿 요청이 끝나기 전에도 목록과 템플릿이 보인다
    const base = fetchMock.getMockImplementation()!;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      if (path.endsWith('/participants') || path.endsWith('/templates')) await gate;
      return base(input, init);
    });
    renderPage();
    expect(screen.getByRole('list', { name: '참석자 목록' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '기본 회의록' })).toBeTruthy();
    release();
  });

  it('검색어를 바꿔도 선택이 유지되고, 선택됨 보기로 다시 확인한다', async () => {
    mockApi();
    renderPage();
    await screen.findByRole('list', { name: '참석자 목록' });
    const search = screen.getByRole('searchbox', { name: '참석자 검색' });
    fireEvent.change(search, { target: { value: 'hong' } });
    expect(list().getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.click(box(/홍길동/));
    fireEvent.click(screen.getByRole('button', { name: '검색어 지우기' }));
    expect(box(/홍길동/)).toHaveProperty('checked', true);
    expect(screen.getByText('2명 선택됨')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /선택됨 2/ }));
    expect(list().getAllByRole('checkbox').map((item) => item.getAttribute('aria-label'))).toEqual([
      '이영희 (나) Me@Miinit.com',
      '홍길동 hong@miinit.com',
    ]);
  });

  it('부서가 있으면 이름 옆에 보이고 부서로도 검색한다', async () => {
    mockApi({ participants: [{ ...participants[0], department: 'AX팀' }, { ...participants[1], department: '' }, participants[2]] });
    renderPage();
    await screen.findByRole('list', { name: '참석자 목록' });
    const search = screen.getByRole('searchbox', { name: '참석자 검색' });
    expect(search.getAttribute('placeholder')).toBe('이름·이메일·부서');
    expect(list().getByText('AX팀')).toBeTruthy();
    fireEvent.change(search, { target: { value: 'ax' } });
    expect(list().getAllByRole('checkbox').map((item) => item.getAttribute('aria-label'))).toEqual(['홍길동 AX팀 hong@miinit.com']);
    // "it"는 회사 도메인(@miinit.com)이 아니라 부서로만 맞는다. 보이지 않는 글자·전각 영문이 섞인 부서도 찾는다(2026-11-14)
    cleanup();
    mockApi({ participants: [{ ...participants[0], department: 'I\u200bT개발팀' }, { ...participants[1], department: 'ＩＴ지원팀' }, participants[2]] });
    renderPage();
    await screen.findByRole('list', { name: '참석자 목록' });
    fireEvent.change(screen.getByRole('searchbox', { name: '참석자 검색' }), { target: { value: 'it' } });
    expect(list().getAllByRole('checkbox')).toHaveLength(2);
  });

  it('전체 선택은 검색어가 있을 때만 보이고 검색 결과만 고른다', async () => {
    mockApi();
    renderPage();
    await screen.findByRole('list', { name: '참석자 목록' });
    expect(screen.queryByRole('button', { name: '전체 선택' })).toBeNull();
    fireEvent.change(screen.getByRole('searchbox', { name: '참석자 검색' }), { target: { value: '@miinit' } });
    fireEvent.click(screen.getByRole('button', { name: '전체 선택' }));
    expect(screen.getByText('3명 선택됨')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '선택 해제' }));
    // 로그인한 사람은 남는다
    expect(screen.getByText('1명 선택됨')).toBeTruthy();
  });

  it('제목이 없으면 테두리와 토스트로 알리고 요청하지 않는다', async () => {
    const fetchMock = mockApi();
    renderPage();
    await screen.findByRole('list', { name: '참석자 목록' });
    fireEvent.click(screen.getByRole('button', { name: '회의 시작' }));
    expect(await screen.findByText('회의 제목을 입력해 주세요.')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: '회의 제목' }).getAttribute('aria-invalid')).toBe('true');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/meeting-sessions'))).toBe(false);
  });

  it('회의를 시작하면 로그인한 사람을 포함해 세션을 만들고 녹음 화면으로 넘긴다', async () => {
    const fetchMock = mockApi();
    renderPage();
    await screen.findByRole('list', { name: '참석자 목록' });
    expect(screen.getByRole('radio', { name: '기본 회의록' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: '프로젝트 회의' }));
    fireEvent.change(screen.getByRole('textbox', { name: '회의 제목' }), { target: { value: '  주간 회의 ' } });
    fireEvent.click(box(/김철수/));
    fireEvent.click(screen.getByRole('button', { name: '회의 시작' }));

    expect(await screen.findByRole('heading', { name: '/meetings/s-1/recording' })).toBeTruthy();
    const post = fetchMock.mock.calls.find(([url]) => String(url).includes('/meeting-sessions'));
    const body = JSON.parse(String(post?.[1]?.body));
    expect(body).toMatchObject({ title: '주간 회의', templateId: 'project.md', participantIds: ['p2', 'p1'], documentConnectionVersion: 3 });
    expect(restoreRecordingSession()).toMatchObject({ sessionId: 's-1', title: '주간 회의', draft: { participantIds: ['p2', 'p1'] } });
  });

  it('로그인 이메일이 참석자 목록에 없으면 아무도 미리 선택하지 않는다', async () => {
    localStorage.setItem('ma-auth-email', 'nobody@miinit.com');
    mockApi();
    renderPage();
    await screen.findByRole('list', { name: '참석자 목록' });
    expect(screen.getByText('0명 선택됨')).toBeTruthy();
    expect(list().getAllByRole('checkbox').every((item) => !(item as HTMLInputElement).disabled)).toBe(true);
  });

  it('참석자가 없으면 시작할 수 없고, 새 참석자를 등록하면 바로 선택된다', async () => {
    const fetchMock = mockApi({ participants: [] });
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input, init) => {
      if (String(input).endsWith('/participants') && init?.method === 'POST') {
        return Promise.resolve(response({ data: { id: 'p9', name: '새사람', email: 'new@miinit.com' } }, 201));
      }
      return base(input, init);
    });
    renderPage();
    expect(await screen.findByText('등록된 참석자가 없습니다.')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: '회의 시작' }).getAttribute('aria-disabled')).toBe('true'));

    fireEvent.click(screen.getByRole('button', { name: '새 참석자' }));
    const dialog = await screen.findByRole('dialog', { name: '새 참석자' });
    fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
    expect(await screen.findByText('이름을 입력해 주세요.')).toBeTruthy();
    expect(within(dialog).getByRole('textbox', { name: '이름' }).getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(within(dialog).getByRole('textbox', { name: '이름' }), { target: { value: '새사람' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '이메일' }), { target: { value: 'new@miinit.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
    expect(await screen.findByRole('checkbox', { name: '새사람 new@miinit.com' })).toHaveProperty('checked', true);
    expect(screen.queryByRole('dialog', { name: '새 참석자' })).toBeNull();
    const post = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/participants') && init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ name: '새사람', email: 'new@miinit.com' });
    expect(screen.getByRole('button', { name: '회의 시작' }).getAttribute('aria-disabled')).toBeNull();
  });

  it('회의 날짜는 오늘이 기본이고 달력에서 고른다', async () => {
    mockApi();
    renderPage();
    await screen.findByRole('list', { name: '참석자 목록' });
    const field = screen.getByRole('button', { name: '회의 날짜' });
    expect(field.textContent).toContain('오늘');
    fireEvent.click(field);
    const dialog = await screen.findByRole('dialog', { name: '회의 날짜' });
    const today = within(dialog).getByRole('button', { current: 'date' });
    expect(today.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(dialog).getByRole('button', { name: '다음 달' }));
    fireEvent.click(within(dialog).getAllByRole('button', { name: /15일/ })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '회의 날짜' })).toBeNull());
    expect(screen.getByRole('button', { name: '회의 날짜' }).textContent).toContain('15일');
    expect(screen.getByRole('button', { name: '회의 날짜' }).textContent).not.toContain('오늘');
  });
});
