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
  return field === 'name' ? '이름을 확인해 주세요.' : field === 'email' ? '이메일을 확인해 주세요.' : '팀을 확인해 주세요.';
}

/** 응답에 팀 필드가 있으면(Backend 팀 확장 뒤) 팀 기능을 켠다 */
export function hasTeamField(roster: readonly Participant[]): boolean {
  return roster.some((person) => 'team' in person);
}

const collator = new Intl.Collator('ko-KR');

/** 팀이 있으면 팀 → 이름, 없으면 이름 가나다순. 팀 없음은 뒤로 */
export function sortParticipants(roster: readonly Participant[]): Participant[] {
  return [...roster].sort((left, right) => {
    const a = left.team?.trim() ?? '';
    const b = right.team?.trim() ?? '';
    if (a !== b) return !a ? 1 : !b ? -1 : collator.compare(a, b);
    return collator.compare(left.name, right.name);
  });
}

/** 팀 이름 목록(가나다순, 중복 없음) */
export function teamNames(roster: readonly Participant[]): string[] {
  return [...new Set(roster.map((person) => person.team?.trim()).filter((team): team is string => Boolean(team)))].sort(collator.compare);
}

export const NO_TEAM = '__none__';

/** 검색(이름·이메일·팀) + 팀 거르기('' 모든 팀, NO_TEAM 팀 없음) */
export function filterParticipants(roster: readonly Participant[], query: string, team = ''): Participant[] {
  const keyword = query.normalize('NFKC').trim().toLocaleLowerCase();
  return roster.filter((person) => {
    if (team === NO_TEAM ? Boolean(person.team?.trim()) : team && person.team?.trim() !== team) return false;
    if (!keyword) return true;
    return [person.name, person.email, person.team ?? ''].some((value) => value.normalize('NFKC').toLocaleLowerCase().includes(keyword));
  });
}
