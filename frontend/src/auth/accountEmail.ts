/*
 * 로그인한 이메일 (CMN-01-F05, GitHub #24).
 * 세션 API 응답에 이메일이 없어, 인증에 성공할 때 이 브라우저(localStorage)에 저장해 계정 표시에 쓴다(사용자 결정 2026-11-10).
 * 로그아웃하면 지운다. 저장소를 쓸 수 없으면 이메일 없이 표시한다.
 */
const KEY = 'ma-auth-email';

export function saveAccountEmail(email: string) {
  try {
    localStorage.setItem(KEY, email);
  } catch {
    // 저장소를 못 쓰면 계정 표시에 이메일이 빠질 뿐이다
  }
}

export function loadAccountEmail(): string | null {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
    // 이메일 저장 전(2026-11-10 이전)에 로그인한 브라우저: 이전 로그인 기록(목업 세션)에 남은 이메일을 쓴다
    const legacy = JSON.parse(localStorage.getItem('ma-auth-mock-session') ?? 'null') as { email?: unknown } | null;
    return typeof legacy?.email === 'string' ? legacy.email : null;
  } catch {
    return null;
  }
}

export function clearAccountEmail() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem('ma-auth-mock-session');
  } catch {
    // 무시
  }
}
