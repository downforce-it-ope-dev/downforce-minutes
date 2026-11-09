import type { OtpRequestResult, OtpVerifyResult, SessionResult } from './authApi';

/*
 * 인증 목업 (Backend CORS 허용 전까지 Preview·개발 서버에서 화면 흐름을 확인하는 용도).
 * vite.config.ts의 __AUTH_MOCK__이 true일 때만 authApi가 이 모듈을 쓴다. 운영 빌드에서는 항상 false다.
 * 정책은 구현된 Backend와 같게 둔다(R-19): 코드 유효 60초, 재발송 60초, 5회 실패 시 5분 잠금, 유휴 2시간.
 * 메일은 보내지 않는다. 인증 코드는 MOCK_OTP_CODE 하나다.
 */

export const MOCK_OTP_CODE = '123456';
export const MOCK_SESSION_KEY = 'ma-auth-mock-session';
const MOCK_OTP_KEY = 'ma-auth-mock-otp';

const CODE_SECONDS = 60;
const RESEND_SECONDS = 60;
const MAX_FAILURES = 5;
const LOCK_SECONDS = 300;
const IDLE_SECONDS = 7_200;

interface PendingOtp {
  email: string;
  issuedAt: number;
  failures: number;
  lockedUntil: number | null;
}

interface MockSession {
  email: string;
  lastActivityAt: number;
}

function read<T>(storage: () => Storage, key: string): T | null {
  try {
    const raw = storage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: unknown) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, JSON.stringify(value));
  } catch {
    // 저장소를 쓸 수 없으면 새로고침 때 로그인이 풀린다. 목업이라 그대로 둔다
  }
}

const session = () => localStorage;
const otp = () => sessionStorage;

const delay = () => new Promise((resolve) => setTimeout(resolve, 300));
const secondsLeft = (until: number, now: number) => Math.max(1, Math.ceil((until - now) / 1000));

export async function mockRequestOtp(email: string): Promise<OtpRequestResult> {
  await delay();
  const now = Date.now();
  const pending = read<PendingOtp>(otp, MOCK_OTP_KEY);
  if (pending?.email === email) {
    if (pending.lockedUntil && pending.lockedUntil > now) {
      return { ok: false, reason: 'RATE_LIMITED', retryAfterSeconds: secondsLeft(pending.lockedUntil, now) };
    }
    const resendAt = pending.issuedAt + RESEND_SECONDS * 1000;
    if (resendAt > now) return { ok: false, reason: 'RATE_LIMITED', retryAfterSeconds: secondsLeft(resendAt, now) };
  }
  write(otp, MOCK_OTP_KEY, { email, issuedAt: now, failures: 0, lockedUntil: null } satisfies PendingOtp);
  return { ok: true, expiresInSeconds: CODE_SECONDS, resendAfterSeconds: RESEND_SECONDS };
}

export async function mockVerifyOtp(email: string, code: string): Promise<OtpVerifyResult> {
  await delay();
  const now = Date.now();
  const pending = read<PendingOtp>(otp, MOCK_OTP_KEY);
  if (!pending || pending.email !== email) return { ok: false, reason: 'INVALID' };
  if (pending.lockedUntil && pending.lockedUntil > now) {
    return { ok: false, reason: 'LOCKED', retryAfterSeconds: secondsLeft(pending.lockedUntil, now) };
  }
  if (pending.issuedAt + CODE_SECONDS * 1000 <= now) return { ok: false, reason: 'EXPIRED' };
  if (code === MOCK_OTP_CODE) {
    write(otp, MOCK_OTP_KEY, null);
    write(session, MOCK_SESSION_KEY, { email, lastActivityAt: now } satisfies MockSession);
    return { ok: true };
  }
  const failures = pending.failures + 1;
  if (failures >= MAX_FAILURES) {
    write(otp, MOCK_OTP_KEY, { ...pending, failures, lockedUntil: now + LOCK_SECONDS * 1000 });
    return { ok: false, reason: 'LOCKED', retryAfterSeconds: LOCK_SECONDS };
  }
  write(otp, MOCK_OTP_KEY, { ...pending, failures });
  return { ok: false, reason: 'INVALID' };
}

function activeSession(now: number): MockSession | null {
  const current = read<MockSession>(session, MOCK_SESSION_KEY);
  if (!current || current.lastActivityAt + IDLE_SECONDS * 1000 <= now) {
    if (current) write(session, MOCK_SESSION_KEY, null);
    return null;
  }
  return current;
}

export async function mockGetSession(): Promise<SessionResult> {
  const now = Date.now();
  const current = activeSession(now);
  if (!current) return { status: 'unauthenticated' };
  return { status: 'authenticated', remainingIdleSeconds: Math.floor((current.lastActivityAt + IDLE_SECONDS * 1000 - now) / 1000) };
}

export async function mockRecordActivity(): Promise<SessionResult> {
  const now = Date.now();
  const current = activeSession(now);
  if (!current) return { status: 'unauthenticated' };
  write(session, MOCK_SESSION_KEY, { ...current, lastActivityAt: now });
  return { status: 'authenticated', remainingIdleSeconds: IDLE_SECONDS };
}

export async function mockLogout(): Promise<void> {
  write(session, MOCK_SESSION_KEY, null);
}
