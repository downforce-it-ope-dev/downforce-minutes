/** 로그인 허용 도메인 (D-02). Backend는 도메인을 검사하지 않으므로 Frontend가 코드 요청 전에 검사한다(R-19) */
export const COMPANY_EMAIL_DOMAIN = 'miinit.com';

/** 앞뒤 공백 제거 + 소문자 (AUTH-01-F01, Backend 정규화와 같음) */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Backend 검증과 같은 형식 규칙 */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isCompanyEmail(value: string): boolean {
  return value.endsWith(`@${COMPANY_EMAIL_DOMAIN}`);
}

export type EmailCheck = 'ok' | 'empty' | 'format' | 'domain';

/** 이메일 입력 검사 (AUTH-01-F02·F03). value는 정규화한 값 */
export function checkLoginEmail(value: string): EmailCheck {
  if (!value) return 'empty';
  if (!isValidEmail(value)) return 'format';
  if (!isCompanyEmail(value)) return 'domain';
  return 'ok';
}

export const EMAIL_CHECK_MESSAGE: Record<Exclude<EmailCheck, 'ok'>, string> = {
  empty: '이메일을 입력해 주세요.',
  format: '올바른 이메일 주소를 입력해 주세요.',
  domain: '회사 이메일 주소(@miinit.com)로만 로그인할 수 있습니다.',
};
