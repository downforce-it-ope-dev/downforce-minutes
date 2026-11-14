import type { Participant } from '../participantsApi';
import { validateParticipant } from './participantRules';

/*
 * PTC-01-P03 CSV 일괄 등록의 파일 읽기·판정 (GitHub #37, PTC-01 3.6).
 * 사용자 결정(2026-11-12):
 * - 메일계정·이름은 필수, 부서는 선택 열이다(Backend 9611cbc 부서 추가 뒤). 부서 칸이 비어 있으면 기존 부서를 그대로 둔다
 * - 행 수·파일 크기는 제한하지 않는다
 * - 이미 등록된 메일계정이면 이메일 기준으로 갱신한다(이름·부서 중 다른 것만 고친다)
 * 파일은 브라우저 안에서만 읽고 서버로 보내지 않는다. 외부 라이브러리 없음.
 */

const EMAIL_HEADERS = ['메일계정', '메일', '이메일', 'email', 'e-mail', 'mail'];
const NAME_HEADERS = ['이름', '성명', 'name'];
const DEPARTMENT_HEADERS = ['부서', '부서명', '팀', 'department', 'dept', 'team'];

/** BOM이 있으면 UTF-8, 없으면 UTF-8로 엄격하게 읽고 실패하면 CP949(한국어 Excel 기본 CSV) */
export function decodeCsv(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  if (view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) return new TextDecoder('utf-8').decode(view.subarray(3));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(view);
  } catch {
    return new TextDecoder('euc-kr', { fatal: true }).decode(view);
  }
}

/** RFC 4180: 쉼표 구분, 큰따옴표 안의 쉼표·줄바꿈, "" → ". CRLF·LF 모두 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"' && field === '') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export interface CsvPerson {
  /** CSV 파일의 실제 줄 번호(머리글이 1) */
  line: number;
  name: string;
  email: string;
  /** 부서 칸 값(빈 칸이면 ''). 부서 열이 없는 파일이면 없음 */
  department?: string;
}

export type CsvReadResult = { ok: true; people: CsvPerson[] } | { ok: false; missing: string[] };

const normalizeHeader = (value: string) => value.replace(/^\uFEFF/, '').trim().toLowerCase();

/** 첫 행 머리글(메일계정·이름, 별칭·순서 무관)로 열을 찾는다. 세 값이 모두 빈 행은 건너뛴다 */
export function readPeople(rows: readonly string[][]): CsvReadResult {
  const header = (rows[0] ?? []).map(normalizeHeader);
  const emailColumn = header.findIndex((cell) => EMAIL_HEADERS.includes(cell));
  const nameColumn = header.findIndex((cell) => NAME_HEADERS.includes(cell));
  const departmentColumn = header.findIndex((cell) => DEPARTMENT_HEADERS.includes(cell));
  const missing = [emailColumn < 0 && '메일계정', nameColumn < 0 && '이름'].filter((value): value is string => Boolean(value));
  if (missing.length) return { ok: false, missing };
  const people: CsvPerson[] = [];
  rows.slice(1).forEach((cells, index) => {
    if (cells.every((cell) => !cell.trim())) return;
    const person: CsvPerson = { line: index + 2, name: (cells[nameColumn] ?? '').trim(), email: (cells[emailColumn] ?? '').trim().toLowerCase() };
    if (departmentColumn >= 0) person.department = (cells[departmentColumn] ?? '').trim();
    people.push(person);
  });
  return { ok: true, people };
}

export type ImportStatus = 'create' | 'rename' | 'same' | 'duplicate' | 'error';

export interface ImportItem extends CsvPerson {
  status: ImportStatus;
  /** 오류 사유 (status가 error일 때) */
  reason?: string;
  /** 고칠 기존 참석자와 바꿀 값 (status가 rename일 때) */
  existing?: Participant;
  changes?: { name?: string; department?: string };
}

export const STATUS_LABEL: Record<ImportStatus, string> = {
  create: '등록',
  rename: '갱신',
  same: '이미 등록됨',
  duplicate: '파일 안 중복',
  error: '오류',
};

/**
 * 행마다 처리 방법을 정한다.
 * 등록: 새 메일계정 / 갱신: 같은 메일계정의 기존 참석자와 이름 또는 부서(칸이 비지 않았을 때)가 다름 / 이미 등록됨: 모두 같음 /
 * 파일 안 중복: 앞 행에 같은 메일계정(첫 행만 처리) / 오류: 이름·메일계정 없음, 형식, 회사 메일 아님
 */
export function planImport(people: readonly CsvPerson[], roster: readonly Participant[]): ImportItem[] {
  const byEmail = new Map(roster.map((person) => [person.email.trim().toLowerCase(), person]));
  const seen = new Set<string>();
  return people.map((person) => {
    const errors = validateParticipant(person);
    const reason = errors.name ?? errors.email;
    if (reason) return { ...person, status: 'error', reason: shortReason(person, errors) };
    if (seen.has(person.email)) return { ...person, status: 'duplicate' };
    seen.add(person.email);
    const existing = byEmail.get(person.email);
    if (!existing) return { ...person, status: 'create' };
    const changes: { name?: string; department?: string } = {};
    if (existing.name.trim() !== person.name) changes.name = person.name;
    if (person.department && person.department !== (existing.department?.trim() ?? '')) changes.department = person.department;
    return Object.keys(changes).length === 0 ? { ...person, status: 'same' } : { ...person, status: 'rename', existing, changes };
  });
}

function shortReason(person: CsvPerson, errors: ReturnType<typeof validateParticipant>): string {
  const reasons: string[] = [];
  if (errors.name) reasons.push('이름 없음');
  if (errors.email) reasons.push(!person.email ? '메일계정 없음' : errors.email.startsWith('회사') ? '회사 메일 아님' : '메일계정 형식 오류');
  return reasons.join(' · ');
}

export function countByStatus(items: readonly ImportItem[]): Record<ImportStatus, number> {
  const counts: Record<ImportStatus, number> = { create: 0, rename: 0, same: 0, duplicate: 0, error: 0 };
  for (const item of items) counts[item.status] += 1;
  return counts;
}
