import { getApiBaseUrl } from './apiBase';
import { apiFetch } from './apiFetch';
/** department는 Backend 부서 추가(9611cbc) 뒤의 응답에 온다(빈 문자열은 부서 없음). 필드가 없으면(이전 Backend) 부서 기능을 숨긴다 */
export type Participant = { id: string; name: string; email: string; department?: string };
export type ParticipantInput = { name: string; email: string; department?: string };
export type ParticipantPatch = Partial<ParticipantInput>;
export type ParticipantField = 'name' | 'email' | 'department';

type ApiErrorBody = {
  error?: {
    code?: string;
    details?: { fieldErrors?: Array<{ field?: string; code?: string }> };
  };
};

export class ParticipantApiError extends Error {
  readonly code: string;
  readonly fieldErrors: Partial<Record<ParticipantField, string>>;

  constructor(code: string, fieldErrors: Partial<Record<ParticipantField, string>> = {}) {
    super(safeMessage(code));
    this.name = 'ParticipantApiError';
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

function safeMessage(code: string): string {
  if (code === 'DOCUMENT_CHANGE_BUSY') return '문서 서비스 변경 중에는 참석자 쓰기가 차단됩니다. 변경 완료 후 목록을 새로고침하고 다시 시도해 주세요.';
  if (code === 'DOCUMENT_SETTINGS_VERSION_CONFLICT') return '문서 연결 버전이 변경되었습니다. 목록을 새로고침하고 다시 시도해 주세요.';
  if (code === 'PARTICIPANT_NOT_FOUND') return '이 참석자는 목록에서 사라졌습니다. 목록을 새로고침해 주세요.';
  if (code === 'VALIDATION_FAILED') return '입력 내용을 확인해 주세요.';
  if (code === 'PARTICIPANT_LIST_FAILED') return '참석자 목록을 불러오지 못했습니다.';
  return '요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

function baseUrl(): string {
  return getApiBaseUrl();
}

async function request<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(`${baseUrl()}/api/v1${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    }, timeoutMs ? { timeoutMs } : {});
  } catch {
    throw new ParticipantApiError('NETWORK_ERROR');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    const error = body as ApiErrorBody | undefined;
    const code = error?.error?.code || 'REQUEST_FAILED';
    const fieldErrors: Partial<Record<ParticipantField, string>> = {};
    for (const fieldError of error?.error?.details?.fieldErrors ?? []) {
      if (fieldError.field === 'name' || fieldError.field === 'email' || fieldError.field === 'department') {
        fieldErrors[fieldError.field] = fieldError.code || 'INVALID';
      }
    }
    throw new ParticipantApiError(code, fieldErrors);
  }
  return body as T;
}

/*
 * 참석자 목록 기억 (회의록·참석자 로딩 문제, 2026-11-12).
 * Backend는 Notion에서 참석자마다 본문을 따로 읽어 목록이 느리다(참석자 수만큼 호출). 화면을 오갈 때마다 새로 받지 않도록
 * - 받은 목록을 기억해 두고 화면은 먼저 그것을 보인 뒤 뒤에서 새로 받는다(peekParticipants → listParticipants)
 * - 같은 요청이 진행 중이면 새로 보내지 않고 함께 기다린다
 * - 느린 목록이 15초에 끊기지 않게 제한 시간을 60초로 둔다
 * 테스트마다 fetch를 바꾸므로 fetch별로 따로 기억한다.
 */
const LIST_TIMEOUT_MS = 60_000;
type RosterSlot = { value?: Participant[]; pending?: Promise<Participant[]> };
const rosterSlots = new WeakMap<typeof fetch, RosterSlot>();

function rosterSlot(): RosterSlot {
  let slot = rosterSlots.get(fetch);
  if (!slot) {
    slot = {};
    rosterSlots.set(fetch, slot);
  }
  return slot;
}

/** 마지막으로 받은 참석자 목록(없으면 undefined). 화면을 바로 그릴 때 쓴다 */
export function peekParticipants(): Participant[] | undefined {
  return rosterSlot().value;
}

/** 화면에서 바꾼 결과(추가·수정·삭제·CSV)를 기억한 목록에도 반영한다 */
export function rememberParticipants(next: Participant[]): void {
  rosterSlot().value = next;
}

/** 서버에서 새로 받는다. 진행 중인 같은 요청이 있으면 그것을 함께 기다린다 */
export function listParticipants(): Promise<Participant[]> {
  const slot = rosterSlot();
  if (slot.pending) return slot.pending;
  const loading: Promise<Participant[]> = (async () => {
    const result = await request<{ data: { items: Participant[] } }>('/participants', undefined, LIST_TIMEOUT_MS);
    if (!Array.isArray(result?.data?.items)) throw new ParticipantApiError('INVALID_PARTICIPANT_LIST');
    slot.value = result.data.items;
    return result.data.items;
  })().finally(() => {
    if (slot.pending === loading) slot.pending = undefined;
  });
  slot.pending = loading;
  return loading;
}

export async function createParticipant(input: ParticipantInput, key: string): Promise<Participant> {
  const result = await request<{ data: Participant }>('/participants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(input),
  });
  return result.data;
}

export async function updateParticipant(id: string, patch: ParticipantPatch): Promise<Participant> {
  const result = await request<{ data: Participant }>(`/participants/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return result.data;
}

export async function deleteParticipant(id: string): Promise<void> {
  await request<void>(`/participants/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
