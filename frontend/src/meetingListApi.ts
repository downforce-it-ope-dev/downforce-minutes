import { getApiBaseUrl } from './apiBase';
import { apiFetch } from './apiFetch';
import { normalizeApiError, type SafeApiError } from './lib/api/normalizeApiError';

export type MeetingParticipantSummary = { id: string; name: string };
export type MeetingSummary = {
  documentId: string;
  title: string;
  meetingAt: string;
  participants: MeetingParticipantSummary[];
  documentUrl: string | null;
};
export type ProcessingFailureSummary = {
  sessionId: string;
  version: number;
  title: string;
  meetingAt: string;
  stage: string;
  errorCode: string;
  audioExpiresAt: string | null;
  allowedActions: string[];
};

export class MeetingListApiError extends Error {
  readonly code: string;

  constructor(readonly safe: SafeApiError) {
    super(safe.message);
    this.code = safe.code;
    this.name = 'MeetingListApiError';
  }
}

const pendingMeetingLists = new WeakMap<typeof fetch, Map<string, Promise<MeetingSummary[]>>>();
const pendingProcessingFailures = new WeakMap<typeof fetch, Promise<ProcessingFailureSummary[]>>();

function baseUrl(): string {
  return getApiBaseUrl();
}

function isMeetingSummary(value: unknown): value is MeetingSummary {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<MeetingSummary>;
  return typeof item.documentId === 'string'
    && typeof item.title === 'string'
    && typeof item.meetingAt === 'string'
    && Array.isArray(item.participants)
    && item.participants.every((participant) => typeof participant?.id === 'string' && typeof participant?.name === 'string')
    && (typeof item.documentUrl === 'string' || item.documentUrl === null);
}

/*
 * 회의 목록 기억 (회의록 로딩 문제, 2026-11-12). 받은 목록을 주소별로 기억해 두고 화면은 먼저 그것을 보인 뒤 뒤에서 새로 받는다.
 * 진행 중인 같은 요청은 함께 기다린다(아래 pendingMeetingLists). 느린 목록이 15초에 끊기지 않게 제한 시간은 60초.
 */
const LIST_TIMEOUT_MS = 60_000;
const lastMeetingLists = new WeakMap<typeof fetch, Map<string, MeetingSummary[]>>();

function meetingListUrl(limit?: number) {
  const query = limit === undefined ? '' : `?limit=${encodeURIComponent(String(limit))}`;
  return `${baseUrl()}/api/v1/meetings${query}`;
}

/** 마지막으로 받은 회의 목록(없으면 undefined) */
export function peekMeetings(limit?: number): MeetingSummary[] | undefined {
  return lastMeetingLists.get(fetch)?.get(meetingListUrl(limit));
}

export function listMeetings(limit?: number): Promise<MeetingSummary[]> {
  const url = meetingListUrl(limit);
  const fetchImpl = fetch;
  let requestsForClient = pendingMeetingLists.get(fetchImpl);
  if (!requestsForClient) {
    requestsForClient = new Map<string, Promise<MeetingSummary[]>>();
    pendingMeetingLists.set(fetchImpl, requestsForClient);
  }
  const pending = requestsForClient.get(url);
  if (pending) return pending;

  const request = requestMeetingList(url, fetchImpl).then((items) => {
    let last = lastMeetingLists.get(fetchImpl);
    if (!last) {
      last = new Map();
      lastMeetingLists.set(fetchImpl, last);
    }
    last.set(url, items);
    return items;
  }).finally(() => {
    if (requestsForClient?.get(url) === request) requestsForClient.delete(url);
  });
  requestsForClient.set(url, request);
  return request;
}

export function listProcessingFailures(): Promise<ProcessingFailureSummary[]> {
  const fetchImpl = fetch;
  const pending = pendingProcessingFailures.get(fetchImpl);
  if (pending) return pending;
  const request = requestProcessingFailures(fetchImpl).finally(() => {
    if (pendingProcessingFailures.get(fetchImpl) === request) pendingProcessingFailures.delete(fetchImpl);
  });
  pendingProcessingFailures.set(fetchImpl, request);
  return request;
}

async function requestProcessingFailures(fetchImpl: typeof fetch): Promise<ProcessingFailureSummary[]> {
  const url = `${baseUrl()}/api/v1/meeting-sessions/processing-failures`;
  try {
    const response = await apiFetch(url, { headers: { Accept: 'application/json' } }, {}, fetchImpl);
    const body: unknown = await response.json();
    if (!response.ok || typeof body !== 'object' || body === null || !('data' in body)) {
      throw new MeetingListApiError(normalizeApiError(body, response.status));
    }
    const data = (body as { data?: { items?: unknown } }).data;
    if (!data || !Array.isArray(data.items) || !data.items.every(isProcessingFailureSummary)) {
      throw new MeetingListApiError(normalizeApiError({ error: { code: 'MEETING_LIST_FAILED' } }, response.status));
    }
    return data.items;
  } catch (error) {
    if (error instanceof MeetingListApiError) throw error;
    throw new MeetingListApiError(normalizeApiError({ error: { code: 'NETWORK_ERROR' } }));
  }
}

function isProcessingFailureSummary(value: unknown): value is ProcessingFailureSummary {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<ProcessingFailureSummary>;
  return typeof item.sessionId === 'string' && typeof item.version === 'number'
    && typeof item.title === 'string' && typeof item.meetingAt === 'string'
    && typeof item.stage === 'string' && typeof item.errorCode === 'string'
    && (typeof item.audioExpiresAt === 'string' || item.audioExpiresAt === null)
    && Array.isArray(item.allowedActions) && item.allowedActions.every((action) => typeof action === 'string');
}

async function requestMeetingList(url: string, fetchImpl: typeof fetch): Promise<MeetingSummary[]> {
  try {
    const response = await apiFetch(url, { headers: { Accept: 'application/json' } }, { timeoutMs: LIST_TIMEOUT_MS }, fetchImpl);
    const body: unknown = await response.json();
    if (!response.ok || typeof body !== 'object' || body === null || !('data' in body)) {
      throw new MeetingListApiError(normalizeApiError(body, response.status));
    }
    const data = (body as { data?: { items?: unknown } }).data;
    if (!data || !Array.isArray(data.items) || !data.items.every(isMeetingSummary)) {
      throw new MeetingListApiError(normalizeApiError({ error: { code: 'MEETING_LIST_FAILED' } }, response.status));
    }
    return data.items;
  } catch (error) {
    if (error instanceof MeetingListApiError) throw error;
    throw new MeetingListApiError(normalizeApiError({ error: { code: 'NETWORK_ERROR' } }));
  }
}
