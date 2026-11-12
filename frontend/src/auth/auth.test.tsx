import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../ui';
import { GuestOnly, RequireAuth } from './AuthGate';
import { LoginPage } from './LoginPage';
import { VerifyPage } from './VerifyPage';
import { checkLoginEmail, normalizeEmail } from './email';
import { safeReturnPath } from './routes';
import * as authApi from './authApi';
import * as emailSettingsApi from '../emailSettingsApi';

vi.mock('./authApi', () => ({ requestOtp: vi.fn(), verifyOtp: vi.fn(), getSession: vi.fn() }));
vi.mock('../emailSettingsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../emailSettingsApi')>()),
  getEmailSettings: vi.fn(),
  saveEmailSettings: vi.fn(),
  verifyEmailConnection: vi.fn(),
}));

const requestOtp = vi.mocked(authApi.requestOtp);
const verifyOtp = vi.mocked(authApi.verifyOtp);
const getSession = vi.mocked(authApi.getSession);
const getEmailSettings = vi.mocked(emailSettingsApi.getEmailSettings);
const saveEmailSettings = vi.mocked(emailSettingsApi.saveEmailSettings);
const verifyEmailConnection = vi.mocked(emailSettingsApi.verifyEmailConnection);

const settings = (configured: boolean) => ({
  configured,
  connectionVerified: configured,
  maskedClientId: null,
  maskedClientSecret: null,
  maskedRefreshToken: null,
  senderAddress: null,
  verifiedAt: null,
});

function renderAt(entry: string | { pathname: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/login/verify" element={<VerifyPage />} />
          <Route path="/" element={<h1>홈 화면</h1>} />
          <Route path="/meetings" element={<h1>회의록 화면</h1>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const verifyState = { email: 'meet@miinit.com', expiresInSeconds: 60, resendAfterSeconds: 60 };

beforeEach(() => {
  getEmailSettings.mockResolvedValue(settings(true));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('이메일 검사', () => {
  it('정규화하고 형식·회사 도메인을 검사한다', () => {
    expect(normalizeEmail('  Meet@MIINIT.com ')).toBe('meet@miinit.com');
    expect(checkLoginEmail('')).toBe('empty');
    expect(checkLoginEmail('meet@')).toBe('format');
    expect(checkLoginEmail('meet@gmail.com')).toBe('domain');
    expect(checkLoginEmail('meet@miinit.com')).toBe('ok');
  });

  it('로그인 후에는 내부 경로로만 돌아간다', () => {
    expect(safeReturnPath('/meetings')).toBe('/meetings');
    expect(safeReturnPath('https://evil.example')).toBe('/');
    expect(safeReturnPath('//evil.example')).toBe('/');
    expect(safeReturnPath('/login/verify')).toBe('/');
    expect(safeReturnPath(undefined)).toBe('/');
  });
});

describe('AUTH-01 로그인', () => {
  const emailInput = () => screen.getByLabelText('회사 이메일');
  const submit = () => screen.getByRole('button', { name: '인증 코드 받기' });

  it('회사 도메인이 아니면 요청하지 않고 토스트로 알리며 입력란을 오류 상태로 둔다', async () => {
    renderAt('/login');
    fireEvent.change(emailInput(), { target: { value: 'meet@gmail.com' } });
    await waitFor(() => expect(submit().getAttribute('aria-disabled')).toBeNull());
    fireEvent.click(submit());
    expect(await screen.findByText('회사 이메일 주소(@miinit.com)로만 로그인할 수 있습니다.')).toBeTruthy();
    expect(emailInput().getAttribute('aria-invalid')).toBe('true');
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it('정규화한 이메일로 코드를 요청하고 인증 코드 화면으로 간다', async () => {
    requestOtp.mockResolvedValue({ ok: true, expiresInSeconds: 60, resendAfterSeconds: 60 });
    renderAt('/login');
    fireEvent.change(emailInput(), { target: { value: ' Meet@Miinit.com ' } });
    await waitFor(() => expect(submit().getAttribute('aria-disabled')).toBeNull());
    fireEvent.click(submit());
    expect(await screen.findByRole('heading', { name: '인증 코드 입력' })).toBeTruthy();
    expect(requestOtp).toHaveBeenCalledWith('meet@miinit.com');
    expect(screen.getByText('meet@miinit.com')).toBeTruthy();
  });

  it('재발송 대기(429)면 남은 시간을 안내한다', async () => {
    requestOtp.mockResolvedValue({ ok: false, reason: 'RATE_LIMITED', retryAfterSeconds: 42 });
    renderAt('/login');
    fireEvent.change(emailInput(), { target: { value: 'meet@miinit.com' } });
    await waitFor(() => expect(submit().getAttribute('aria-disabled')).toBeNull());
    fireEvent.click(submit());
    // 토스트 알림 영역도 status라 문구로 찾는다
    expect(await screen.findByText('잠시 후 다시 시도해 주세요. (42초 후 가능)')).toBeTruthy();
  });

  it('메일 설정이 없으면 설정 아이콘을 보이고, 코드 요청 대신 메일 설정을 안내한다', async () => {
    getEmailSettings.mockResolvedValue(settings(false));
    saveEmailSettings.mockResolvedValue(settings(true));
    verifyEmailConnection.mockResolvedValue({ connected: true, message: '' });
    renderAt('/login');
    const openSetup = await screen.findByRole('button', { name: '메일 설정' });
    fireEvent.change(emailInput(), { target: { value: 'meet@miinit.com' } });
    fireEvent.click(submit());
    expect(await screen.findByText('인증 코드를 보낼 메일 설정이 필요합니다.')).toBeTruthy();
    expect(requestOtp).not.toHaveBeenCalled();
    fireEvent.click(openSetup);

    const dialog = await screen.findByRole('dialog', { name: '메일 설정' });
    expect(dialog).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Google 클라이언트 ID'), { target: { value: 'id' } });
    fireEvent.change(screen.getByLabelText('클라이언트 보안 키'), { target: { value: 'secret' } });
    fireEvent.change(screen.getByLabelText('연결 토큰 (Refresh Token)'), { target: { value: 'token' } });
    fireEvent.change(screen.getByLabelText('발신 이메일 주소'), { target: { value: 'mail@miinit.com' } });
    fireEvent.click(screen.getByRole('button', { name: '저장하고 연결 확인' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(saveEmailSettings).toHaveBeenCalledWith({ clientId: 'id', clientSecret: 'secret', refreshToken: 'token', senderAddress: 'mail@miinit.com' });
    expect(verifyEmailConnection).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '메일 설정' })).toBeNull();
    expect(screen.getByText('메일 연결을 확인했습니다.')).toBeTruthy();
  });
});

describe('AUTH-02 인증 코드', () => {
  const cell = (n: number) => screen.getByRole('textbox', { name: `${n}번째 자리` });
  const typeCode = (value: string) => fireEvent.paste(cell(1), { clipboardData: { getData: () => value } });

  it('이메일 정보 없이 들어오면 로그인 화면으로 돌려보낸다', async () => {
    renderAt('/login/verify');
    expect(await screen.findByRole('heading', { name: '회사 이메일로 로그인하세요.' })).toBeTruthy();
  });

  it('6자리를 채우면 검증하고 원래 가려던 화면으로 간다', async () => {
    verifyOtp.mockResolvedValue({ ok: true });
    renderAt({ pathname: '/login/verify', state: { ...verifyState, from: '/meetings' } });
    typeCode('123456');
    expect(await screen.findByRole('heading', { name: '회의록 화면' })).toBeTruthy();
    expect(verifyOtp).toHaveBeenCalledWith('meet@miinit.com', '123456');
  });

  it('틀린 코드면 토스트로 알리고 칸을 비운다', async () => {
    verifyOtp.mockResolvedValue({ ok: false, reason: 'INVALID' });
    renderAt({ pathname: '/login/verify', state: verifyState });
    typeCode('111111');
    expect(await screen.findByText('코드가 올바르지 않습니다. 다시 확인해 주세요.')).toBeTruthy();
    expect((cell(1) as HTMLInputElement).value).toBe('');
  });

  it('5회 실패로 잠기면 토스트로 알리고, 처음으로 누르면 로그인 화면으로 간다', async () => {
    verifyOtp.mockResolvedValue({ ok: false, reason: 'LOCKED', retryAfterSeconds: 300 });
    renderAt({ pathname: '/login/verify', state: verifyState });
    typeCode('222222');
    expect(await screen.findByText('시도 횟수를 초과했습니다. 5분 뒤에 다시 시도해 주세요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /코드 다시 받기/ }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '처음으로' }));
    expect(await screen.findByRole('heading', { name: '회사 이메일로 로그인하세요.' })).toBeTruthy();
    expect((screen.getByLabelText('회사 이메일') as HTMLInputElement).value).toBe('meet@miinit.com');
  });

  it('60초가 지나면 만료되고, 다시 받기로 새 코드를 받으면 알린다', async () => {
    vi.useFakeTimers();
    requestOtp.mockResolvedValue({ ok: true, expiresInSeconds: 60, resendAfterSeconds: 60 });
    renderAt({ pathname: '/login/verify', state: verifyState });
    const resend = () => screen.getByRole('button', { name: /코드 다시 받기/ });
    expect(resend().getAttribute('aria-disabled')).toBe('true');
    expect(resend().textContent).not.toContain('초');

    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(screen.getByText('00:00')).toBeTruthy();
    expect(screen.getByRole('button', { name: '확인' }).getAttribute('aria-disabled')).toBe('true');
    expect(resend().getAttribute('aria-disabled')).toBeNull();

    await act(async () => {
      fireEvent.click(resend());
    });
    expect(requestOtp).toHaveBeenCalledWith('meet@miinit.com');
    expect(screen.getByText('새 인증 코드를 보냈습니다.')).toBeTruthy();
    expect(screen.getByText('01:00')).toBeTruthy();
  });
});

describe('진입 보호 (#15)', () => {
  function renderGate(entry: string) {
    return render(
      <MemoryRouter initialEntries={[entry]}>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
            <Route path="*" element={<RequireAuth><h1>기존 화면</h1></RequireAuth>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );
  }

  it('로그인하지 않았으면 로그인 화면을 먼저 보이고, 가려던 경로를 기억한다', async () => {
    getSession.mockResolvedValue({ status: 'unauthenticated' });
    requestOtp.mockResolvedValue({ ok: true, expiresInSeconds: 60, resendAfterSeconds: 60 });
    renderGate('/meetings?tab=done');
    expect(await screen.findByRole('heading', { name: '회사 이메일로 로그인하세요.' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '기존 화면' })).toBeNull();
  });

  it('로그인했으면 기존 화면을 보이고, 로그인 화면에 오면 홈으로 보낸다', async () => {
    getSession.mockResolvedValue({ status: 'authenticated', remainingIdleSeconds: 7200 });
    renderGate('/');
    expect(await screen.findByRole('heading', { name: '기존 화면' })).toBeTruthy();
    cleanup();
    renderGate('/login');
    expect(await screen.findByRole('heading', { name: '기존 화면' })).toBeTruthy();
  });

  it('세션을 확인할 수 없으면 다시 시도할 수 있다', async () => {
    getSession.mockResolvedValueOnce({ status: 'unavailable' }).mockResolvedValueOnce({ status: 'authenticated', remainingIdleSeconds: 7200 });
    renderGate('/');
    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('heading', { name: '기존 화면' })).toBeTruthy();
  });
});
