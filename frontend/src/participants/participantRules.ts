import type { Participant, ParticipantField } from '../participantsApi';

/*
 * 참석자 입력 규칙 (PTC-01-F03·F04, 결정 2026-11-09). 참석자 관리 폼과 새 회의의 새 참석자 폼이 같이 쓴다.
 * - 이름·이메일 필수, 이메일 형식 + 회사 메일(@miinit.com)만. 수정 폼은 이메일을 바꿀 때만 도메인을 본다
 */
export const COMPANY_DOMAIN = 'miinit.com';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParticipantErrors = Partial<Record<ParticipantField, string>>;

export function isCompanyEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${COMPANY_DOMAIN}`);
}

export function validateParticipant(fields: { name: string; email: string }, { checkDomain = true } = {}): ParticipantErrors {
  const errors: ParticipantErrors = {};
  const name = fields.name.trim();
  const email = fields.email.trim();
  if (!name) errors.name = '이름을 입력해 주세요.';
  if (!email) errors.email = '이메일을 입력해 주세요.';
  else if (!EMAIL.test(email)) errors.email = '올바른 이메일 주소를 입력해 주세요.';
  else if (checkDomain && !isCompanyEmail(email)) errors.email = `회사 메일(@${COMPANY_DOMAIN})만 등록할 수 있습니다.`;
  return errors;
}

/** 서버 입력 오류 코드 → 문구 */
export function serverFieldMessage(field: ParticipantField, code: string): string {
  if (code.includes(' ')) return code;
  if (field === 'name' && (code === 'NotBlank' || code === 'NotEmpty')) return '이름을 입력해 주세요.';
  if (field === 'email' && (code === 'NotBlank' || code === 'NotEmpty')) return '이메일을 입력해 주세요.';
  if (field === 'email' && code === 'Email') return '올바른 이메일 주소를 입력해 주세요.';
  return field === 'name' ? '이름을 확인해 주세요.' : field === 'email' ? '이메일을 확인해 주세요.' : '부서를 확인해 주세요.';
}

/** 응답에 부서 필드가 있으면(Backend 9611cbc 뒤) 부서 기능을 켠다 */
export function hasDepartmentField(roster: readonly Participant[]): boolean {
  return roster.some((person) => 'department' in person);
}

const collator = new Intl.Collator('ko-KR');

/** 부서가 있으면 부서 → 이름, 없으면 이름 가나다순. 부서 없음은 뒤로 */
export function sortParticipants(roster: readonly Participant[]): Participant[] {
  return [...roster].sort((left, right) => {
    const a = left.department?.trim() ?? '';
    const b = right.department?.trim() ?? '';
    if (a !== b) return !a ? 1 : !b ? -1 : collator.compare(a, b);
    return collator.compare(left.name, right.name);
  });
}

/** 부서 이름 목록(가나다순, 중복 없음) */
export function departmentNames(roster: readonly Participant[]): string[] {
  return [...new Set(roster.map((person) => person.department?.trim()).filter((department): department is string => Boolean(department)))].sort(collator.compare);
}

export const NO_DEPARTMENT = '__none__';

/** 비교용 글자: 유니코드 정규화(NFKC: 전각 영문 ＩＴ → IT, 분해된 한글 합침) + 소문자 + 공백·보이지 않는 글자(폭 없는 공백 등 \p{Cf}) 제거 */
const compact = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\s\p{Cf}]+/gu, '');

/**
 * 참석자 검색어 일치 (부분 일치, 2026-11-14 사용자 요청). 참석자 관리와 새 회의 참석자 선택이 같이 쓴다.
 * - 이름·이메일·부서 중 하나에 검색어가 들어 있으면 맞다. 대소문자·띄어쓰기는 보지 않는다("경영지원" → "경영 지원팀")
 * - 이메일은 @ 앞부분만 본다. 모두 같은 회사 도메인(@miinit.com)이라 "it"를 넣으면 전원이 맞아 목록이 줄지 않았다(2026-11-14 사용자 보고).
 *   검색어에 @가 있으면 이메일 전체와 비교한다
 * - 검색어를 띄어 쓰면 낱말마다 어느 칸에든 들어 있어야 한다("ax 홍" → AX팀의 홍길동)
 */
export function matchesParticipant(person: Pick<Participant, 'name' | 'email' | 'department'>, query: string): boolean {
  const terms = query.split(/\s+/).map(compact).filter(Boolean);
  if (terms.length === 0) return true;
  const name = compact(person.name);
  const email = compact(person.email);
  const localPart = email.split('@')[0];
  const department = compact(person.department ?? '');
  return terms.every(
    (term) => name.includes(term) || department.includes(term) || (term.includes('@') ? email : localPart).includes(term),
  );
}

/** 검색(이름·이메일·부서) + 부서 거르기('' 모든 부서, NO_DEPARTMENT 부서 없음) */
export function filterParticipants(roster: readonly Participant[], query: string, department = ''): Participant[] {
  return roster.filter((person) => {
    if (department === NO_DEPARTMENT ? Boolean(person.department?.trim()) : department && person.department?.trim() !== department) return false;
    return matchesParticipant(person, query);
  });
}
