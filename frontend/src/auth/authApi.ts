import { getApiBaseUrl } from '../apiBase';
import { mockGetSession, mockLogout, mockRecordActivity, mockRequestOtp, mockVerifyOtp } from './authMock';

/*
 * 인증 API (Backend 저장소 구현, docs/product/api-spec.md "인증 API", README R-18·R-19).
 * 502(메일 발송 실패)·503(메일 미설정)을 업무 오류로 쓰므로 apiFetch(서버 장애 복구 흐름)를 쓰지 않는다.
 * 세션 쿠키(ma_session)는 HttpOnly라 스크립트에서 읽지 않는다. 같은 출처 요청이라 브라우저가 자동으로 보낸다.
 * __AUTH_MOCK__이 true(개발 서버·Vercel Preview 기본값)이면 Backend 대신 authMock을 쓴다. 운영 빌드에서는 항상 false다.
 */

const TIMEOUT_MS = 15_000;

export type OtpRequestResult =
  | { ok: true; expiresInSeconds: number; resendAfterSeconds: number }
  | { ok: false; reason: 'RATE_LIMITED'; retryAfterSeconds: number }
  | { ok: false; reason: 'INVALID_EMAIL' | 'AUTH_UNAVAILABLE' | 'EMAIL_DELIVERY_FAILED' | 'NETWORK' };

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'LOCKED'; retryAfterSeconds: number }
  | { ok: false; reason: 'INVALID' | 'EXPIRED' | 'NETWORK' };

export type SessionResult =
  | { status: 'authenticated'; remainingIdleSeconds: number }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

async function post(path: string, body?: unknown): Promise<Response> {
  return send(path, {
    method: 'POST',
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${getApiBaseUrl()}/api/v1/auth${path}`, {
      credentials: 'same-origin',
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function retryAfter(response: Response, body: Record<string, unknown>): number {
  const fromBody = Number(body.retryAfterSeconds);
  if (Number.isFinite(fromBody) && fromBody > 0) return fromBody;
  const fromHeader = Number(response.headers.get('Retry-After'));
  return Number.isFinite(fromHeader) && fromHeader > 0 ? fromHeader : 60;
}

/** 인증 코드 발송 (AUTH-01-F04, 재발송 AUTH-02) */
async function realRequestOtp(email: string): Promise<OtpRequestResult> {
  let response: Response;
  try {
    response = await post('/otp-requests', { email });
  } catch {
    return { ok: false, reason: 'NETWORK' };
  }
  const body = await readJson(response);
  if (response.status === 202 || response.ok) {
    const data = (body.data ?? {}) as { expiresInSeconds?: number; resendAfterSeconds?: number };
    return { ok: true, expiresInSeconds: data.expiresInSeconds ?? 60, resendAfterSeconds: data.resendAfterSeconds ?? 60 };
  }
  if (response.status === 429) return { ok: false, reason: 'RATE_LIMITED', retryAfterSeconds: retryAfter(response, body) };
  if (response.status === 400) return { ok: false, reason: 'INVALID_EMAIL' };
  if (body.error === 'AUTH_UNAVAILABLE' || response.status === 503) return { ok: false, reason: 'AUTH_UNAVAILABLE' };
  return { ok: false, reason: 'EMAIL_DELIVERY_FAILED' };
}

/** 인증 코드 검증 → 성공하면 Backend가 세션 쿠키를 심는다 (AUTH-02) */
async function realVerifyOtp(email: string, code: string): Promise<OtpVerifyResult> {
  let response: Response;
  try {
    response = await post('/otp-verifications', { email, code });
  } catch {
    return { ok: false, reason: 'NETWORK' };
  }
  const body = await readJson(response);
  if (response.ok && (body.data as { verified?: boolean } | undefined)?.verified) return { ok: true };
  if (response.status === 429) return { ok: false, reason: 'LOCKED', retryAfterSeconds: retryAfter(response, body) };
  if (response.status === 410) return { ok: false, reason: 'EXPIRED' };
  if (response.status === 400) return { ok: false, reason: 'INVALID' };
  return { ok: false, reason: 'NETWORK' };
}

/** 세션 확인 (활동으로 세지 않음) */
async function realGetSession(): Promise<SessionResult> {
  try {
    const response = await send('/session', { method: 'GET', headers: { Accept: 'application/json' } });
    if (response.status === 401) return { status: 'unauthenticated' };
    if (!response.ok) return { status: 'unavailable' };
    const data = ((await readJson(response)).data ?? {}) as { remainingIdleSeconds?: number };
    return { status: 'authenticated', remainingIdleSeconds: data.remainingIdleSeconds ?? 0 };
  } catch {
    return { status: 'unavailable' };
  }
}

/** 활동 갱신 (마지막 활동 후 2시간 연장) */
async function realRecordActivity(): Promise<SessionResult> {
  try {
    const response = await post('/session/activity');
    if (response.status === 401) return { status: 'unauthenticated' };
    if (!response.ok) return { status: 'unavailable' };
    return { status: 'authenticated', remainingIdleSeconds: 7200 };
  } catch {
    return { status: 'unavailable' };
  }
}

async function realLogout(): Promise<void> {
  try {
    await post('/logout');
  } catch {
    // 네트워크 오류여도 화면은 로그인으로 보낸다. 세션은 2시간 뒤 만료된다
  }
}

export const requestOtp: (email: string) => Promise<OtpRequestResult> = __AUTH_MOCK__ ? mockRequestOtp : realRequestOtp;
export const verifyOtp: (email: string, code: string) => Promise<OtpVerifyResult> = __AUTH_MOCK__ ? mockVerifyOtp : realVerifyOtp;
export const getSession: () => Promise<SessionResult> = __AUTH_MOCK__ ? mockGetSession : realGetSession;
export const recordActivity: () => Promise<SessionResult> = __AUTH_MOCK__ ? mockRecordActivity : realRecordActivity;
export const logout: () => Promise<void> = __AUTH_MOCK__ ? mockLogout : realLogout;
