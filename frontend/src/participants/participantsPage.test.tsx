import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Participant } from '../participantsApi';
import { withHealthyBackend } from '../testUtils/withHealthyBackend';
import { filterParticipants, NO_DEPARTMENT, sortParticipants, validateParticipant } from './participantRules';
import { ParticipantsPage } from './ParticipantsPage';

vi.mock('../auth/authApi', () => ({ logout: vi.fn().mockResolvedValue(undefined) }));

const ROSTER: Participant[] = [
  { id: 'p2', name: '홍길동', email: 'hong@miinit.com' },
  { id: 'p1', name: '김철수', email: 'kim@miinit.com' },
  { id: 'p3', name: '외부인', email: 'guest@example.com' },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Handler = (method: string, path: string, init: RequestInit) => Response | Promise<Response> | null;

function mockApi(roster: Participant[] = ROSTER, handler: Handler = () => null) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    const method = init.method ?? 'GET';
    const handled = await handler(method, path, init);
    if (handled) return handled;
    if (path === '/api/v1/participants' && method === 'GET') return json({ data: { items: roster } });
    throw new Error(`Unexpected ${method} ${path}`);
  });
  vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
  return fetchMock;
}

const calls = (fetchMock: ReturnType<typeof mockApi>, method: string) => fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method);

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/participants']}>
      <ParticipantsPage />
    </MemoryRouter>,
  );
}

const rows = () => within(screen.getByRole('list', { name: '참석자 목록' })).getAllByRole('listitem');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('참석자 관리 (PTC-01)', () => {
  it('이름 가나다순 목록과 인원 수를 보이고, 검색은 이름·이메일로 바로 거른다', async () => {
    mockApi();
    renderPage();
    await screen.findByRole('list', { name: '참석자 목록' });
    expect(screen.getByRole('heading', { level: 1, name: '참석자' })).toBeTruthy();
    expect(rows().map((row) => row.textContent)).toEqual(['김김철수kim@miinit.com', '외외부인guest@example.com', '홍홍길동hong@miinit.com']);
    expect(screen.getByText('참석자 3명')).toBeTruthy();
    // 부서 기능은 응답에 department가 없으면 숨긴다
    expect(screen.queryByRole('combobox', { name: '부서' })).toBeNull();
    fireEvent.change(screen.getByRole('searchbox', { name: '참석자 검색' }), { target: { value: 'HONG' } });
    expect(rows()).toHaveLength(1);
    fireEvent.change(screen.getByRole('searchbox', { name: '참석자 검색' }), { target: { value: '없음' } });
    expect(screen.getByText('검색 결과 없음')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('region', { name: '참석자' })).getByRole('button', { name: '검색어 지우기' }));
    expect(rows()).toHaveLength(3);
  });

  it('추가: 회사 메일이 아니면 이메일 아래 오류만 보이고 보내지 않는다. 올바르면 같은 입력은 같은 멱등 키로 다시 보낸다', async () => {
    let posts = 0;
    const fetchMock = mockApi(ROSTER, (method, path) => {
      if (method !== 'POST' || path !== '/api/v1/participants') return null;
      posts += 1;
      if (posts === 1) throw new TypeError('connection lost');
      return json({ data: { id: 'p9', name: '새사람', email: 'new@miinit.com' } }, 201);
    });
    renderPage();
    await screen.findByRole('list', { name: '참석자 목록' });
    fireEvent.click(screen.getByRole('button', { name: '참석자 추가' }));
    const dialog = await screen.findByRole('dialog', { name: '참석자 추가' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '이름' }), { target: { value: '새사람' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '이메일' }), { target: { value: 'new@gmail.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    expect(await within(dialog).findByText('회사 메일(@miinit.com)만 등록할 수 있습니다.')).toBeTruthy();
    expect(within(dialog).getByRole('textbox', { name: '이메일' }).getAttribute('aria-invalid')).toBe('true');
    expect(calls(fetchMock, 'POST')).toHaveLength(0);

    fireEvent.change(within(dialog).getByRole('textbox', { name: '이메일' }), { target: { value: 'new@miinit.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    expect(await screen.findByText('요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    expect(await screen.findByText('참석자를 추가했습니다')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '참석자 추가' })).toBeNull());
    const keys = calls(fetchMock, 'POST').map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'));
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(JSON.parse(String(calls(fetchMock, 'POST')[1][1]?.body))).toEqual({ name: '새사람', email: 'new@miinit.com' });
    expect(rows().map((row) => row.textContent)).toContain('새새사람new@miinit.com');
  });

  it('수정: 행을 누르면 열리고 바뀐 값만 보낸다. 이메일을 그대로 두면 회사 외 주소도 이름을 고칠 수 있다', async () => {
    const fetchMock = mockApi(ROSTER, (method, path, init) =>
      method === 'PATCH' && path === '/api/v1/participants/p3' ? json({ data: { id: 'p3', ...JSON.parse(String(init.body)), email: 'guest@example.com' } }) : null);
    renderPage();
    await screen.findByRole('list', { name: '참석자 목록' });
    fireEvent.click(screen.getByRole('button', { name: '외부인 수정' }));
    let dialog = await screen.findByRole('dialog', { name: '참석자 수정' });
    // 바뀐 값이 없으면 보내지 않고 닫는다
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls(fetchMock, 'PATCH')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: '외부인 수정' }));
    dialog = await screen.findByRole('dialog', { name: '참석자 수정' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '이름' }), { target: { value: '손님' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    expect(await screen.findByText('참석자를 수정했습니다')).toBeTruthy();
    expect(JSON.parse(String(calls(fetchMock, 'PATCH')[0][1]?.body))).toEqual({ name: '손님' });
    expect(screen.getByRole('button', { name: '손님 수정' })).toBeTruthy();
  });

  it('삭제: 확인(취소/삭제) 뒤 지우고, 이미 없는 참석자면 새로고침을 권한다', async () => {
    let deletes = 0;
    const fetchMock = mockApi(ROSTER, (method) => {
      if (method !== 'DELETE') return null;
      deletes += 1;
      return deletes === 1 ? json({ error: { code: 'PARTICIPANT_NOT_FOUND' } }, 404) : new Response(null, { status: 204 });
    });
    renderPage();
    await screen.findByRole('list', { name: '참석자 목록' });
    fireEvent.click(screen.getByRole('button', { name: '홍길동 삭제' }));
    let dialog = await screen.findByRole('dialog', { name: '삭제하시겠습니까?' });
    expect(dialog.textContent).toContain('hong@miinit.com');
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    expect(await screen.findByText('이미 삭제된 참석자입니다.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '새로고침' })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    expect(await screen.findByText('참석자를 삭제했습니다')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('button', { name: '홍길동 수정' })).toBeNull());
    expect(calls(fetchMock, 'DELETE')[1][0]).toContain('/participants/p2');

    // 수정 폼의 삭제도 같은 확인을 거친다
    fireEvent.click(screen.getByRole('button', { name: '김철수 수정' }));
    dialog = await screen.findByRole('dialog', { name: '참석자 수정' });
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    expect(await screen.findByRole('dialog', { name: '삭제하시겠습니까?' })).toBeTruthy();
  });

  it('부서(응답에 department가 있을 때): 부서 → 이름 순, 부서 배지, 부서 거르기, 폼의 부서 입력', async () => {
    const roster: Participant[] = [
      { id: 'a', name: '홍길동', email: 'hong@miinit.com', department: 'AX팀' },
      { id: 'b', name: '김철수', email: 'kim@miinit.com', department: '' },
      { id: 'c', name: '박서준', email: 'park@miinit.com', department: 'AX팀' },
    ];
    const fetchMock = mockApi(roster, (method, path, init) =>
      method === 'PATCH' && path === '/api/v1/participants/b' ? json({ data: { ...roster[1], ...JSON.parse(String(init.body)) } }) : null);
    renderPage();
    await screen.findByRole('list', { name: '참석자 목록' });
    expect(rows().map((row) => row.textContent)).toEqual(['박박서준AX팀park@miinit.com', '홍홍길동AX팀hong@miinit.com', '김김철수kim@miinit.com']);
    fireEvent.change(screen.getByRole('combobox', { name: '부서' }), { target: { value: NO_DEPARTMENT } });
    expect(rows()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '김철수 수정' }));
    const dialog = await screen.findByRole('dialog', { name: '참석자 수정' });
    fireEvent.change(within(dialog).getByRole('combobox', { name: '부서' }), { target: { value: ' AX팀 ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    expect(await screen.findByText('참석자를 수정했습니다')).toBeTruthy();
    expect(JSON.parse(String(calls(fetchMock, 'PATCH')[0][1]?.body))).toEqual({ department: 'AX팀' });
  });

  it('목록을 불러오지 못하면 다시 시도한다', async () => {
    let gets = 0;
    mockApi(ROSTER, (method) => (method === 'GET' && ++gets === 1 ? json({ error: { code: 'PARTICIPANT_LIST_FAILED' } }, 500) : null));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('list', { name: '참석자 목록' })).toBeTruthy();
  });
});

describe('participantRules', () => {
  it('이름·이메일 필수, 형식, 회사 메일만(도메인 검사는 끌 수 있다)', () => {
    expect(validateParticipant({ name: ' ', email: '' })).toEqual({ name: '이름을 입력해 주세요.', email: '이메일을 입력해 주세요.' });
    expect(validateParticipant({ name: 'a', email: 'bad' }).email).toBe('올바른 이메일 주소를 입력해 주세요.');
    expect(validateParticipant({ name: 'a', email: 'A@MIINIT.COM' })).toEqual({});
    expect(validateParticipant({ name: 'a', email: 'a@gmail.com' }).email).toBe('회사 메일(@miinit.com)만 등록할 수 있습니다.');
    expect(validateParticipant({ name: 'a', email: 'a@gmail.com' }, { checkDomain: false })).toEqual({});
  });

  it('부서 → 이름 정렬(부서 없음은 뒤), 이름·이메일·부서 검색', () => {
    const roster: Participant[] = [
      { id: '1', name: '나', email: 'n@miinit.com', department: '' },
      { id: '2', name: '다', email: 'd@miinit.com', department: 'B팀' },
      { id: '3', name: '가', email: 'g@miinit.com', department: 'B팀' },
      { id: '4', name: '라', email: 'r@miinit.com', department: 'A팀' },
    ];
    expect(sortParticipants(roster).map(({ name }) => name)).toEqual(['라', '가', '다', '나']);
    expect(filterParticipants(roster, 'b팀').map(({ id }) => id)).toEqual(['2', '3']);
    expect(filterParticipants(roster, '', 'A팀').map(({ id }) => id)).toEqual(['4']);
  });
});
