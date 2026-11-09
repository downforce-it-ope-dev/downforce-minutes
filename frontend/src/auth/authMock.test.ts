import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOCK_OTP_CODE, mockGetSession, mockLogout, mockRecordActivity, mockRequestOtp, mockVerifyOtp } from './authMock';

const EMAIL = 'meet@miinit.com';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
  vi.setSystemTime(new Date('2026-11-09T09:00:00Z'));
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

async function run<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(300);
  return promise;
}

describe('인증 목업 (Backend 정책과 같게)', () => {
  it('고정 코드로 로그인하면 세션이 생기고, 로그아웃하면 사라진다', async () => {
    expect(await mockGetSession()).toEqual({ status: 'unauthenticated' });
    expect(await run(mockRequestOtp(EMAIL))).toEqual({ ok: true, expiresInSeconds: 60, resendAfterSeconds: 60 });
    expect(await run(mockVerifyOtp(EMAIL, '000000'))).toEqual({ ok: false, reason: 'INVALID' });
    expect(await run(mockVerifyOtp(EMAIL, MOCK_OTP_CODE))).toEqual({ ok: true });
    expect(await mockGetSession()).toEqual({ status: 'authenticated', remainingIdleSeconds: 7200 });
    await mockLogout();
    expect(await mockGetSession()).toEqual({ status: 'unauthenticated' });
  });

  it('재발송은 60초 뒤에, 코드는 60초 뒤 만료된다', async () => {
    await run(mockRequestOtp(EMAIL));
    expect(await run(mockRequestOtp(EMAIL))).toMatchObject({ ok: false, reason: 'RATE_LIMITED' });
    vi.setSystemTime(Date.now() + 60_000);
    expect(await run(mockVerifyOtp(EMAIL, MOCK_OTP_CODE))).toEqual({ ok: false, reason: 'EXPIRED' });
    expect(await run(mockRequestOtp(EMAIL))).toMatchObject({ ok: true });
  });

  it('5회 틀리면 5분 잠긴다', async () => {
    await run(mockRequestOtp(EMAIL));
    for (let i = 0; i < 4; i += 1) expect(await run(mockVerifyOtp(EMAIL, '000000'))).toEqual({ ok: false, reason: 'INVALID' });
    expect(await run(mockVerifyOtp(EMAIL, '000000'))).toEqual({ ok: false, reason: 'LOCKED', retryAfterSeconds: 300 });
    expect(await run(mockVerifyOtp(EMAIL, MOCK_OTP_CODE))).toMatchObject({ ok: false, reason: 'LOCKED' });
  });

  it('2시간 활동이 없으면 세션이 끝나고, 활동하면 연장된다', async () => {
    await run(mockRequestOtp(EMAIL));
    await run(mockVerifyOtp(EMAIL, MOCK_OTP_CODE));
    vi.setSystemTime(Date.now() + 7_000_000);
    expect(await mockRecordActivity()).toEqual({ status: 'authenticated', remainingIdleSeconds: 7200 });
    vi.setSystemTime(Date.now() + 7_200_000);
    expect(await mockGetSession()).toEqual({ status: 'unauthenticated' });
  });
});
