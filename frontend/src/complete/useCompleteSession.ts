import { useCallback, useEffect, useRef, useState } from 'react';
import { getDocumentAppConfig, NewMeetingApiError } from '../newMeetingApi';
import { listParticipants, type Participant } from '../participantsApi';
import { createIdempotencyKey, getPublishSnapshot, PublishApiError, publishSession, retryDelivery, type PublishDelivery, type PublishSnapshot } from '../publishApi';

/*
 * 회의 결과 상태 연결 (MTG-05, GitHub #30).
 * 기존 CompletePage.tsx의 처리를 옮겼다: 저장·전달 상태 조회, 확정만 된 회의의 자동 저장·전달 시작, 진행 중 1.5초 자동 갱신,
 * 전달 1건 재시도(같은 클릭은 같은 멱등 키, 결과 불명확 시 최신 확인), 저장·전달 재시도.
 * 바뀐 것: Slack 단계를 없앴다(D-11). 알림 채널(NOTIFICATION) 전달은 보이지 않고, 저장·전달 요청에 알림을 켜지 않는다.
 * 안내·오류 문구는 notify(토스트)로 보낸다(S-13).
 */

export type StepState = 'complete' | 'current' | 'waiting' | 'failed';
type ConnectionCheck = 'checking' | 'failed' | 'unknown' | 'complete' | null;

export function failureMessage(code: string): string {
  switch (code) {
    case 'DOCUMENT_STRUCTURE_NOT_FOUND': return '필수 문서 구조를 찾을 수 없습니다.';
    case 'PARTICIPANT_LIST_FAILED': return '문서 서비스에서 참석자 목록을 가져오지 못했습니다.';
    case 'DOCUMENT_CONNECTION_CHANGED': return '문서 연결 정보가 변경되어 저장 요청을 처리하지 못했습니다.';
    case 'DOCUMENT_FAILED':
    case 'DOCUMENT_FAILURE': return '문서 서비스가 회의록 저장 요청을 처리하지 못했습니다.';
    case 'NETWORK_ERROR': return '서버에 연결하지 못했습니다. 네트워크와 서버 상태를 확인해 주세요.';
    case 'SESSION_VERSION_CONFLICT': return '회의 상태가 변경되어 요청이 거절되었습니다. 최신 상태를 다시 불러와 주세요.';
    case 'SESSION_STATE_CONFLICT': return '현재 회의 상태에서는 저장을 시작할 수 없습니다. 최신 상태를 확인해 주세요.';
    case 'INVALID_APP_CONFIG': return '문서 연결 설정을 읽지 못했습니다. 연결 설정을 확인해 주세요.';
    case 'EMAIL_FAILED': return '이메일 서비스가 참석자에게 전달하지 못했습니다.';
    case 'DELIVERY_NOT_FOUND': return '전달 작업을 찾을 수 없습니다. 상태를 새로고침해 주세요.';
    case 'DELIVERY_STATE_CONFLICT': return '전달 상태가 변경되어 재시도를 접수하지 못했습니다.';
    case 'DELIVERY_NOT_RETRYABLE': return '이 전달 작업은 다시 시도할 수 없는 상태입니다.';
    default: return '작업을 완료하지 못했습니다.';
  }
}

function requestFailureMessage(error: unknown): string {
  if (error instanceof PublishApiError || error instanceof NewMeetingApiError) return failureMessage(error.code);
  return '요청을 완료하지 못했습니다. 상태를 새로고침해 확인해 주세요.';
}

export function documentIsSaved(snapshot: PublishSnapshot): boolean {
  return Boolean(snapshot.document) || ['DOCUMENT_SAVED', 'DELIVERING', 'COMPLETED', 'COMPLETED_WITH_WARNINGS'].includes(snapshot.status);
}

export function deliveryStepState(rows: readonly PublishDelivery[]): StepState {
  if (rows.some(({ status }) => status === 'FAILED')) return 'failed';
  if (rows.length > 0 && rows.every(({ status }) => status === 'SENT')) return 'complete';
  if (rows.some(({ status }) => status === 'PENDING' || status === 'SENDING')) return 'current';
  return 'waiting';
}

export function useCompleteSession(sessionId: string, notify: (message: string, tone?: 'info' | 'success' | 'danger') => void) {
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  });
  const [snapshot, setSnapshot] = useState<PublishSnapshot | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadFailure, setLoadFailure] = useState<'NOT_FOUND' | 'OTHER' | null>(null);
  const [connectionCheck, setConnectionCheck] = useState<ConnectionCheck>(null);
  const [busyRows, setBusyRows] = useState<Set<string>>(() => new Set());
  const [publishing, setPublishing] = useState(false);
  const busyRef = useRef(new Set<string>());
  const retryKeysRef = useRef(new Map<string, { key: string; accepted: boolean }>());
  const snapshotRef = useRef<PublishSnapshot | null>(null);
  const requestSequence = useRef(0);
  const autoPublishAttempts = useRef(new Set<string>());
  const manualPublishInFlight = useRef(false);

  const applySnapshot = useCallback((next: PublishSnapshot) => {
    if (next.sessionId !== sessionId) return snapshotRef.current;
    const current = snapshotRef.current;
    if (current && next.version < current.version) return current;
    snapshotRef.current = next;
    for (const delivery of next.deliveries ?? []) {
      const attempt = delivery.deliveryId ? retryKeysRef.current.get(delivery.deliveryId) : undefined;
      if (delivery.deliveryId && attempt?.accepted && !busyRef.current.has(delivery.deliveryId) && (delivery.status === 'SENT' || delivery.status === 'FAILED')) {
        retryKeysRef.current.delete(delivery.deliveryId);
      }
    }
    setSnapshot(next);
    setLoadFailure(null);
    return next;
  }, [sessionId]);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const next = await getPublishSnapshot(sessionId);
    if (sequence !== requestSequence.current || next.sessionId !== sessionId) return snapshotRef.current;
    return applySnapshot(next);
  }, [applySnapshot, sessionId]);

  // 첫 조회: 상태·참석자(이름·이메일)·이메일 설정을 함께 불러온다
  useEffect(() => {
    let active = true;
    Promise.allSettled([getPublishSnapshot(sessionId), listParticipants(), getDocumentAppConfig()]).then(([snapshotResult, participantResult, configResult]) => {
      if (!active) return;
      if (snapshotResult.status === 'fulfilled') applySnapshot(snapshotResult.value);
      else setLoadFailure(snapshotResult.reason instanceof PublishApiError && snapshotResult.reason.status === 404 ? 'NOT_FOUND' : 'OTHER');
      setParticipants(participantResult.status === 'fulfilled' ? participantResult.value : []);
      setEmailConfigured(configResult.status === 'fulfilled' && configResult.value.email?.enabled === true && configResult.value.email.configured === true);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [applySnapshot, sessionId]);

  const deliveries = (snapshot?.deliveries ?? []).filter((delivery) => delivery.channel === 'EMAIL');
  const hasPending = deliveries.some(({ status }) => status === 'PENDING' || status === 'SENDING');
  const isPublishing = snapshot?.status === 'PUBLISHING';
  useEffect(() => {
    if (!hasPending && !isPublishing && busyRows.size === 0) return undefined;
    const timer = window.setInterval(() => {
      void refresh().catch(() => notifyRef.current('진행 상태를 확인하지 못했습니다. 자동으로 다시 확인합니다.'));
    }, 1500);
    return () => window.clearInterval(timer);
  }, [busyRows.size, hasPending, isPublishing, refresh]);

  const startPublish = useCallback(
    async (current: PublishSnapshot) => {
      const config = await getDocumentAppConfig();
      const emailOn = config.email?.enabled === true && config.email.configured === true;
      // Slack 알림은 폐기했다(D-11)
      await publishSession(sessionId, current.version, createIdempotencyKey(), emailOn ? (current.meeting?.participantIds ?? []) : [], false);
    },
    [sessionId],
  );

  const settleUnknownPublish = useCallback(async () => {
    setConnectionCheck('unknown');
    try {
      const latest = await refresh();
      if (latest && latest.status !== 'CONFIRMED') setConnectionCheck('complete');
    } catch {
      // 결과를 모르는 상태로 둔다
    }
  }, [refresh]);

  // 검토 확정만 되고 저장·전달이 시작되지 않았으면 자동으로 시작한다(MTG-05-F03)
  useEffect(() => {
    if (!snapshot || snapshot.status !== 'CONFIRMED' || !snapshot.allowedActions.includes('PUBLISH')) return undefined;
    const attemptId = `${sessionId}:${snapshot.version}`;
    if (autoPublishAttempts.current.has(attemptId)) return undefined;
    autoPublishAttempts.current.add(attemptId);
    let active = true;
    Promise.resolve()
      .then(() => {
        if (active) setConnectionCheck('checking');
        return startPublish(snapshot);
      })
      .then(() => {
        if (!active) return;
        setConnectionCheck('complete');
        void refresh();
      })
      .catch(async (error: unknown) => {
        if (!active) return;
        if (error instanceof PublishApiError && error.outcomeUnknown) await settleUnknownPublish();
        else {
          setConnectionCheck('failed');
          notifyRef.current(requestFailureMessage(error));
        }
      });
    return () => {
      active = false;
    };
  }, [refresh, sessionId, settleUnknownPublish, snapshot, startPublish]);

  async function retry(delivery: PublishDelivery, label: string) {
    const id = delivery.deliveryId;
    if (!id || delivery.status !== 'FAILED' || delivery.retryable !== true || !emailConfigured || busyRef.current.has(id)) return;
    const attempt = retryKeysRef.current.get(id) ?? { key: createIdempotencyKey(), accepted: false };
    retryKeysRef.current.set(id, attempt);
    busyRef.current.add(id);
    setBusyRows(new Set(busyRef.current));
    try {
      try {
        await retryDelivery(sessionId, id, attempt.key);
        attempt.accepted = true;
      } catch (error) {
        if (!(error instanceof PublishApiError) || !error.outcomeUnknown) throw error;
        const latest = await refresh();
        const current = latest?.deliveries?.find((row) => row.deliveryId === id);
        if (current?.status === 'PENDING' || current?.status === 'SENDING' || current?.status === 'SENT') {
          attempt.accepted = true;
          if (current.status === 'SENT') retryKeysRef.current.delete(id);
          notifyRef.current('최신 전달 상태를 확인했습니다.', 'info');
          return;
        }
        if (!current || current.status !== 'FAILED' || current.retryable !== true) {
          notifyRef.current('최신 전달 상태를 확인했습니다.', 'info');
          return;
        }
        // 같은 클릭은 같은 키로 다시 보낸다. 새 키는 다음 클릭에서만 만든다
        await retryDelivery(sessionId, id, attempt.key);
        attempt.accepted = true;
      }
      notifyRef.current(`${label} 재전송을 접수했습니다.`, 'success');
      await refresh();
    } catch (error) {
      const conflict = error instanceof PublishApiError && (error.status === 409 || error.status === 404);
      try {
        const latest = await refresh();
        const current = latest?.deliveries?.find((row) => row.deliveryId === id);
        if (!attempt.accepted && conflict && current && (current.status === 'SENT' || current.status === 'FAILED')) retryKeysRef.current.delete(id);
      } catch {
        // 마지막 상태와 이 클릭의 멱등 키를 유지한다
      }
      notifyRef.current(conflict ? '최신 상태를 확인했습니다. 중복 전달을 막기 위해 자동으로 다시 보내지 않습니다.' : '재전송 결과를 확인할 수 없습니다. 상태를 새로고침해 주세요.');
    } finally {
      busyRef.current.delete(id);
      const latestStatus = snapshotRef.current?.deliveries?.find((row) => row.deliveryId === id)?.status;
      if (attempt.accepted && (latestStatus === 'SENT' || latestStatus === 'FAILED')) retryKeysRef.current.delete(id);
      setBusyRows(new Set(busyRef.current));
    }
  }

  async function retryPublish() {
    const current = snapshotRef.current;
    if (!current || !current.allowedActions.includes('PUBLISH') || manualPublishInFlight.current) return;
    manualPublishInFlight.current = true;
    setPublishing(true);
    setConnectionCheck('checking');
    try {
      await startPublish(current);
      setConnectionCheck('complete');
      notifyRef.current('다시 전달 요청을 접수했습니다.', 'success');
      await refresh();
    } catch (error) {
      if (error instanceof PublishApiError && error.outcomeUnknown) await settleUnknownPublish();
      else {
        setConnectionCheck('failed');
        notifyRef.current(requestFailureMessage(error));
      }
    } finally {
      manualPublishInFlight.current = false;
      setPublishing(false);
    }
  }

  async function reload() {
    try {
      await refresh();
    } catch (error) {
      setLoadFailure(error instanceof PublishApiError && error.status === 404 ? 'NOT_FOUND' : 'OTHER');
      notifyRef.current('회의 결과를 불러오지 못했습니다.');
    }
  }

  // ── 화면에 보일 값 ──
  const documentSaved = snapshot ? documentIsSaved(snapshot) : false;
  const documentState: StepState = !snapshot
    ? 'waiting'
    : snapshot.status === 'DOCUMENT_FAILED' || connectionCheck === 'failed'
      ? 'failed'
      : documentSaved
        ? 'complete'
        : snapshot.status === 'PUBLISHING' || connectionCheck === 'checking' || connectionCheck === 'unknown'
          ? 'current'
          : 'waiting';
  const emailState: StepState = documentSaved ? deliveryStepState(deliveries) : 'waiting';
  // 전체 결과(위 결과 제목·아이콘, 저장된 회의록 보기 여부). 단계 목록에는 따로 보이지 않는다
  const doneState: StepState = !documentSaved ? 'waiting' : deliveries.some(({ status }) => status === 'FAILED') ? 'failed' : hasPending ? 'current' : 'complete';
  const savedDocumentId = snapshot?.document?.documentId;

  return {
    loaded,
    loadFailure,
    snapshot,
    participants,
    emailConfigured,
    deliveries,
    documentSaved,
    steps: { document: documentState, email: emailState, done: doneState },
    documentFailure: snapshot?.documentFailure ?? null,
    savedDocumentId: documentSaved && doneState === 'complete' ? savedDocumentId : undefined,
    canRetryPublish: Boolean(snapshot?.allowedActions.includes('PUBLISH') && (snapshot.status === 'DOCUMENT_FAILED' || snapshot.status === 'CONFIRMED')),
    publishing,
    busyRows,
    actions: { retry, retryPublish: () => void retryPublish(), reload: () => void reload() },
  };
}
