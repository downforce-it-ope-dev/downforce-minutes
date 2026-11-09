import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSession, requestOtp, verifyOtp } from './authApi';

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('인증 API 응답 해석 (api-spec.md 인증 API)', () => {
  it('코드 발송 성공(202)은 유효·재발송 시간을 돌려준다', async () => {
    const fetchSpy = respond(202, { data: { expiresInSeconds: 60, resendAfterSeconds: 60 } });
    expect(await requestOtp('meet@miinit.com')).toEqual({ ok: true, expiresInSeconds: 60, resendAfterSeconds: 60 });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/v1\/auth\/otp-requests$/);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ email: 'meet@miinit.com' }));
  });

  it('429는 대기 시간을, 503·502는 원인을 구분한다', async () => {
    respond(429, { error: 'RATE_LIMITED', retryAfterSeconds: 37 });
    expect(await requestOtp('a@miinit.com')).toEqual({ ok: false, reason: 'RATE_LIMITED', retryAfterSeconds: 37 });
    vi.restoreAllMocks();
    respond(503, { error: 'AUTH_UNAVAILABLE' });
    expect(await requestOtp('a@miinit.com')).toEqual({ ok: false, reason: 'AUTH_UNAVAILABLE' });
    vi.restoreAllMocks();
    respond(502, { error: 'EMAIL_DELIVERY_FAILED' });
    expect(await requestOtp('a@miinit.com')).toEqual({ ok: false, reason: 'EMAIL_DELIVERY_FAILED' });
  });

  it('코드 검증의 성공·불일치·만료·잠금을 구분한다', async () => {
    respond(200, { data: { verified: true, sessionId: 'x' } });
    expect(await verifyOtp('a@miinit.com', '123456')).toEqual({ ok: true });
    vi.restoreAllMocks();
    respond(400, { data: { verified: false } });
    expect(await verifyOtp('a@miinit.com', '000000')).toEqual({ ok: false, reason: 'INVALID' });
    vi.restoreAllMocks();
    respond(410, { data: { verified: false, reason: 'EXPIRED' } });
    expect(await verifyOtp('a@miinit.com', '000000')).toEqual({ ok: false, reason: 'EXPIRED' });
    vi.restoreAllMocks();
    respond(429, {}, { 'Retry-After': '300' });
    expect(await verifyOtp('a@miinit.com', '000000')).toEqual({ ok: false, reason: 'LOCKED', retryAfterSeconds: 300 });
  });

  it('세션 확인은 401을 미인증으로, 네트워크 오류를 확인 불가로 본다', async () => {
    respond(401, { data: { authenticated: false } });
    expect(await getSession()).toEqual({ status: 'unauthenticated' });
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network'));
    expect(await getSession()).toEqual({ status: 'unavailable' });
  });
});
