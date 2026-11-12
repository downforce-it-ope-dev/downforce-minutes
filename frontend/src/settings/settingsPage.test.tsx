import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_SETTINGS_STORAGE_KEY } from '../emailSettingsStorage';
import { withHealthyBackend } from '../testUtils/withHealthyBackend';
import { SettingsPage } from './SettingsPage';

vi.mock('../auth/authApi', () => ({ logout: vi.fn().mockResolvedValue(undefined) }));

const CONFIG = {
  company: { id: 'c', name: 'E', timezone: 'Asia/Seoul' },
  document: { provider: 'NOTION', configured: true, connectionVersion: 2, rootUrl: 'https://notion.example' },
  email: { enabled: true, configured: true },
};
const HEALTH = {
  document: { provider: 'NOTION', configured: true, reachable: true, rootAccessible: true },
  email: { configured: true, reachable: true },
};
const CONFIGURED = {
  configured: true, connectionVerified: true, maskedClientId: '••••1234', maskedClientSecret: '••••••••', maskedRefreshToken: '••••••••',
  senderAddress: 'minutes@gmail.com', verifiedAt: null,
};
const EMPTY = { configured: false, connectionVerified: false, maskedClientId: null, maskedClientSecret: null, maskedRefreshToken: null, senderAddress: null, verifiedAt: null };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Handler = (method: string, path: string, init: RequestInit) => Response | null;

function mockApi({ email = CONFIGURED as unknown, config = CONFIG as unknown, health = HEALTH as unknown, extra = (() => null) as Handler } = {}) {
  let current = email;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    const method = init.method ?? 'GET';
    const handled = extra(method, path, init);
    if (handled) return handled;
    if (path === '/api/v1/app-config') return config ? json({ data: config }) : json({ error: { code: 'X' } }, 500);
    if (path === '/api/v1/integrations/health') return health ? json({ data: health }) : json({ error: { code: 'X' } }, 500);
    if (path === '/api/v1/integrations/email') {
      if (method === 'PUT') current = { ...CONFIGURED, senderAddress: JSON.parse(String(init.body)).senderAddress };
      if (method === 'DELETE') current = EMPTY;
      return json({ data: current });
    }
    if (path === '/api/v1/integrations/email/test' && method === 'POST') return json({ data: { connected: true, message: '' } });
    if (path === '/api/v1/integrations/email/test-message' && method === 'POST') return json({ data: { sent: true, message: '' } });
    throw new Error(`Unexpected ${method} ${path}`);
  });
  vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
  return fetchMock;
}

const calls = (fetchMock: ReturnType<typeof mockApi>, method: string, suffix: string) =>
  fetchMock.mock.calls.filter(([url, init]) => (init?.method ?? 'GET') === method && String(url).endsWith(suffix));

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <SettingsPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('설정 (SET-01)', () => {
  it('문서 연결·이메일 카드와 상태 배지를 보이고 Slack은 없다', async () => {
    mockApi();
    renderPage();
    const documentCard = await screen.findByRole('region', { name: '문서 연결' });
    expect(await within(documentCard).findByText('Notion')).toBeTruthy();
    expect(within(documentCard).getByText('연결됨')).toBeTruthy();
    // 중간 문서 연결 화면 없이 바로 서비스 선택으로 간다(2026-11-12)
    expect(within(documentCard).getByRole('link', { name: '변경' }).getAttribute('href')).toBe('/settings/document');
    const emailCard = screen.getByRole('region', { name: '이메일 (Gmail)' });
    expect(await within(emailCard).findByText('minutes@gmail.com')).toBeTruthy();
    // 보기에서는 발신 주소만 보인다(클라이언트 ID·보안 키·연결 토큰은 수정할 때만, 2026-11-12)
    expect(within(emailCard).queryByText('••••1234')).toBeNull();
    expect(screen.queryByText(/Slack|알림/)).toBeNull();
  });

  it('시험 메일은 발신 주소로 보내고 토스트로 알린다', async () => {
    const fetchMock = mockApi();
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '시험 메일' }));
    expect(await screen.findByText('minutes@gmail.com로 시험 메일을 보냈습니다')).toBeTruthy();
    expect(calls(fetchMock, 'POST', '/test-message')).toHaveLength(1);
  });

  it('수정: 빈 항목은 테두리로 막고, 다 채우면 공백을 지워 저장한 뒤 연결을 시험한다', async () => {
    const fetchMock = mockApi();
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '수정' }));
    const form = screen.getByRole('form', { name: '이메일 설정' });
    fireEvent.click(within(form).getByRole('button', { name: '저장' }));
    expect(await screen.findByText('모든 항목을 입력해 주세요')).toBeTruthy();
    expect(within(form).getByLabelText('발신 이메일 주소').getAttribute('aria-invalid')).toBe('true');
    expect(calls(fetchMock, 'PUT', '/integrations/email')).toHaveLength(0);

    for (const [label, value] of [['발신 이메일 주소', ' new@gmail.com '], ['Google 클라이언트 ID', 'id'], ['클라이언트 보안 키', 'secret'], ['연결 토큰', 'token']]) {
      fireEvent.change(within(form).getByLabelText(label), { target: { value } });
    }
    fireEvent.click(within(form).getByRole('button', { name: '저장' }));
    expect(await screen.findByText('저장하고 연결을 확인했습니다')).toBeTruthy();
    expect(JSON.parse(String(calls(fetchMock, 'PUT', '/integrations/email')[0][1]?.body))).toEqual({
      senderAddress: 'new@gmail.com', clientId: 'id', clientSecret: 'secret', refreshToken: 'token',
    });
    expect(calls(fetchMock, 'POST', '/integrations/email/test')).toHaveLength(1);
    expect(await screen.findByText('new@gmail.com')).toBeTruthy();
  });

  it('삭제는 확인을 거친 뒤 지우고 입력 폼을 보인다', async () => {
    const fetchMock = mockApi();
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
    const dialog = await screen.findByRole('dialog', { name: '이메일 설정을 삭제하시겠습니까?' });
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    expect(await screen.findByText('이메일 설정을 삭제했습니다')).toBeTruthy();
    expect(calls(fetchMock, 'DELETE', '/integrations/email')).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole('form', { name: '이메일 설정' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: '취소' })).toBeNull();
  });

  it('서버 설정이 비어 있으면 브라우저에 보관한 값으로 복구한다(D-09)', async () => {
    localStorage.setItem(EMAIL_SETTINGS_STORAGE_KEY, JSON.stringify({ clientId: 'id', clientSecret: 's', refreshToken: 't', senderAddress: 'kept@gmail.com' }));
    const fetchMock = mockApi({ email: EMPTY });
    renderPage();
    expect(await screen.findByText('kept@gmail.com')).toBeTruthy();
    expect(calls(fetchMock, 'PUT', '/integrations/email')).toHaveLength(1);
  });

  it('둘 다 불러오지 못하면 다시 시도, 하나만 실패하면 확인 가능한 정보와 토스트', async () => {
    mockApi({ config: null, health: null });
    renderPage();
    expect(await screen.findByText('설정을 불러오지 못했습니다')).toBeTruthy();
    cleanup();

    mockApi({ health: null });
    renderPage();
    expect(await screen.findByText('연결 상태 일부를 불러오지 못했습니다')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: '문서 연결' })).getByText('확인 불가')).toBeTruthy();
  });
});
