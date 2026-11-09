/*
 * 기존 화면 e2e용 로그인 상태 (GitHub #15).
 * 개발 서버는 인증 목업(src/auth/authMock.ts)을 쓰므로, 목업 세션을 localStorage에 넣어 진입 보호를 통과시킨다.
 * 로그인 화면 자체를 검사하는 auth.spec.ts는 이 상태를 쓰지 않는다.
 */
const MOCK_SESSION_KEY = 'ma-auth-mock-session';

export function mockSessionState(baseURL: string) {
  return {
    cookies: [],
    origins: [
      {
        origin: baseURL,
        localStorage: [{ name: MOCK_SESSION_KEY, value: JSON.stringify({ email: 'e2e@miinit.com', lastActivityAt: Date.now() }) }],
      },
    ],
  };
}
