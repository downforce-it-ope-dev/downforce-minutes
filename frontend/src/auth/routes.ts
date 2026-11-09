/** 로그인 화면으로 넘기는 값 (라우터 state. 주소창에 이메일·코드를 남기지 않는다) */
export interface LoginLocationState {
  /** 이메일 변경으로 돌아올 때 입력값 유지 */
  email?: string;
  /** 로그인 후 돌아갈 내부 경로 (AUTH-01-F06, #15에서 채움) */
  from?: string;
  /** expired: 세션 만료로 들어옴 (상단 안내) */
  reason?: 'expired';
}

/** 인증 코드 화면으로 넘기는 값 */
export interface VerifyLocationState {
  email: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  from?: string;
}

/** 로그인 후 이동할 경로. 내부 경로(/로 시작, //·\ 없음)만 허용하고 아니면 홈 */
export function safeReturnPath(from: string | undefined): string {
  if (!from || !from.startsWith('/') || from.startsWith('//') || from.includes('\\') || from.startsWith('/login')) return '/';
  return from;
}
