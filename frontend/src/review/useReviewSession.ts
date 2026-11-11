import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { getMinutesRegenerationSnapshot, type MinutesRegenerationSnapshot } from '../minutesRegenerationApi';
import { getDocumentAppConfig, listMeetingParticipants, type DocumentAppConfig } from '../newMeetingApi';
import type { Participant } from '../participantsApi';
import { ProcessingPoller } from '../processingPoller';
import { confirmReview, createIdempotencyKey, getPublishSnapshot, PublishApiError, publishSession } from '../publishApi';
import {
  getReviewSession,
  ReviewApiError,
  updateReviewMinutes,
  updateSpeakerMappings,
  type ReviewSession,
  type SpeakerMappingInput,
  type StructuredMinutes,
} from '../reviewApi';
import { minutesAreValid, sameMinutes, snapshotMinutes } from './minutesValidation';

/*
 * 회의록 검토 상태 연결 (MTG-04, GitHub #29).
 * 기존 ReviewSpeakerPage.tsx의 처리를 옮겼다: 검토 데이터 조회, 재생성 진행 이어 보기, 회의록 저장(버전 충돌·결과 불명확 시 최신 확인,
 * 수정 내용 유지, 자동 재전송 없음), 확정 → 문서 저장·전달 시작. 화면은 sessionId마다 새로 그린다(key).
 * 바뀐 것 (문서 3.7):
 * - 화자 매핑은 칩을 누르면 마지막 입력 후 300ms에 모든 화자 매핑을 함께 저장한다(API-011). 저장 중에 또 바꾸면 끝난 뒤 이어서 저장한다
 * - 버전 충돌(412)이면 최신 매핑을 다시 불러온다. 실패하면 바꾼 값을 유지하고 "다시 저장"을 보인다
 * - 작업 결과·오류 문구는 notify(토스트)로 보낸다(S-13). 발송을 막는 확인 안내만 notice(대화상자, P02)로 둔다
 */

export type ReviewFailureCode = 'SESSION_NOT_FOUND' | 'SESSION_NOT_IN_REVIEW' | 'OTHER';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export type MappingChange = { speakerId: string; previous: string | null; next: string | null };
type Resource<T> = { status: 'loading' | 'ready' | 'error'; data?: T };

export const MAPPING_SAVE_DELAY_MS = 300;

export interface ReviewEvents {
  notify: (message: string, tone?: 'info' | 'success' | 'danger') => void;
  /** 매핑 저장이 끝났을 때(되돌리기 토스트용). 마지막으로 바꾼 화자 */
  mappingSaved: (change: MappingChange, review: ReviewSession) => void;
}

function failureCode(error: unknown): ReviewFailureCode {
  if (error instanceof ReviewApiError && (error.code === 'SESSION_NOT_FOUND' || error.apiCode === 'SESSION_NOT_FOUND')) return 'SESSION_NOT_FOUND';
  if (error instanceof ReviewApiError && error.code === 'SESSION_NOT_IN_REVIEW') return 'SESSION_NOT_IN_REVIEW';
  return 'OTHER';
}

export function useReviewSession(sessionId: string, events: ReviewEvents) {
  const navigate = useNavigate();
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  });
  const notify = (message: string, tone: 'info' | 'success' | 'danger' = 'danger') => eventsRef.current.notify(message, tone);

  const [review, setReview] = useState<ReviewSession | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ReviewFailureCode | null>(null);
  const [participants, setParticipants] = useState<Resource<Participant[]>>({ status: 'loading' });
  const [config, setConfig] = useState<Resource<DocumentAppConfig>>({ status: 'loading' });
  const [regeneration, setRegeneration] = useState<{ progress: number | null } | null>(null);
  const [completing, setCompleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // 회의록: 고친 내용(draft)과 서버 기준(baseline). draft가 없으면 서버 회의록을 그대로 쓴다
  const [minutesDraft, setMinutesDraft] = useState<StructuredMinutes | null | undefined>(undefined);
  const [minutesBaseline, setMinutesBaseline] = useState<StructuredMinutes | null | undefined>(undefined);
  const [minutesState, setMinutesState] = useState<{ status: SaveStatus; recoverySnapshot?: StructuredMinutes }>({ status: 'idle' });
  // 화자 매핑: 저장 전 바꾼 값(화자 id → 참석자 id, null은 미지정)
  const [mappingDraft, setMappingDraft] = useState<Record<string, string | null>>({});
  const [mappingState, setMappingState] = useState<SaveStatus>('idle');

  const reviewRef = useRef<ReviewSession | undefined>(undefined);
  const latestVersion = useRef<number | null>(null);
  const serverBase = useRef<{ version: number; minutes: StructuredMinutes | null } | null>(null);
  const minutesDraftRef = useRef<StructuredMinutes | null | undefined>(undefined);
  const minutesSaveInFlight = useRef(false);
  const mappingDraftRef = useRef<Record<string, string | null>>({});
  const mappingTimer = useRef<number | undefined>(undefined);
  const mappingInFlight = useRef(false);
  const mappingPending = useRef(false);
  const lastChange = useRef<MappingChange | null>(null);
  const confirmInFlight = useRef(false);
  const confirmAttempt = useRef<{ version: number; key: string } | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.clearTimeout(mappingTimer.current);
    };
  }, []);

  const rememberMinutesBase = useCallback((version: number, minutes: StructuredMinutes | null): boolean => {
    if (serverBase.current && version < serverBase.current.version) return false;
    serverBase.current = { version, minutes };
    setMinutesBaseline(minutes);
    return true;
  }, []);

  /** 더 낮은 버전의 응답은 버린다. 반영하면 true */
  const applySnapshot = useCallback(
    (data: ReviewSession): boolean => {
      if (!alive.current || data.sessionId !== sessionId) return false;
      if (latestVersion.current !== null && data.version < latestVersion.current) return false;
      if (serverBase.current && data.version < serverBase.current.version) return false;
      latestVersion.current = data.version;
      rememberMinutesBase(data.version, data.minutes);
      reviewRef.current = data;
      setFailure(null);
      setReview(data);
      setLoading(false);
      return true;
    },
    [rememberMinutesBase, sessionId],
  );

  const recordFailure = useCallback((error: unknown) => {
    if (!alive.current) return;
    const code = failureCode(error);
    setFailure(code);
    setLoading(false);
    // 그 밖의 오류는 이미 보이는 검토 내용을 그대로 둔다
    if (code !== 'OTHER') {
      reviewRef.current = undefined;
      setReview(undefined);
    }
  }, []);

  const applyRegenerationResult = useCallback(
    (snapshot: MinutesRegenerationSnapshot): boolean => {
      const operation = snapshot.lastOperation;
      if (
        snapshot.status !== 'REVIEW' || snapshot.sessionId !== sessionId || !snapshot.review ||
        snapshot.review.sessionId !== snapshot.sessionId || snapshot.review.version !== snapshot.version ||
        operation?.type !== 'MINUTES_REGENERATION' || !['SUCCEEDED', 'FAILED'].includes(operation.outcome) ||
        typeof operation.requestedTemplateId !== 'string' || operation.requestedTemplateId.length === 0 ||
        snapshot.review.lastOperation?.type !== operation.type || snapshot.review.lastOperation.outcome !== operation.outcome ||
        snapshot.review.lastOperation.requestedTemplateId !== operation.requestedTemplateId
      ) return false;
      if (!applySnapshot(snapshot.review)) return false;
      // 재생성 결과로 바꾸므로 고치던 내용은 버린다
      minutesDraftRef.current = undefined;
      setMinutesDraft(undefined);
      notify(operation.outcome === 'SUCCEEDED' ? '회의록 재생성이 끝나 최신 회의록을 표시합니다.' : '재생성에 실패해 이전 회의록을 복구했습니다.', operation.outcome === 'SUCCEEDED' ? 'success' : 'danger');
      return true;
    },
    [applySnapshot, sessionId],
  );

  const loadReview = useCallback(async () => {
    setLoading(true);
    try {
      applySnapshot(await getReviewSession(sessionId));
    } catch (error) {
      recordFailure(error);
    }
  }, [applySnapshot, recordFailure, sessionId]);

  // 조회만 한다(처음 불러오기는 상태가 이미 loading). 다시 시도는 아래 load*가 loading으로 바꾼 뒤 부른다
  const fetchRoster = useCallback(async () => {
    try {
      const data = await listMeetingParticipants();
      if (alive.current) setParticipants({ status: 'ready', data });
    } catch {
      if (alive.current) setParticipants((current) => ({ status: 'error', data: current.data }));
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await getDocumentAppConfig();
      if (alive.current) setConfig({ status: 'ready', data });
    } catch {
      if (alive.current) setConfig((current) => ({ status: 'error', data: current.data }));
    }
  }, []);

  const loadRoster = useCallback(async () => {
    setParticipants((current) => ({ status: 'loading', data: current.data }));
    await fetchRoster();
  }, [fetchRoster]);

  const loadConfig = useCallback(async () => {
    setConfig((current) => ({ status: 'loading', data: current.data }));
    await fetchConfig();
  }, [fetchConfig]);

  // 첫 조회. Review가 아니면 재생성 진행 중인지 확인해 이어 본다(MTG-04-F09)
  useEffect(() => {
    const controller = new AbortController();
    void getReviewSession(sessionId)
      .then((data) => applySnapshot(data))
      .catch((error: unknown) => {
        if (!alive.current) return;
        if (error instanceof ReviewApiError && error.code === 'SESSION_NOT_IN_REVIEW') {
          void getMinutesRegenerationSnapshot(sessionId, controller.signal)
            .then((snapshot) => {
              if (!alive.current) return;
              if (snapshot.status === 'PROCESSING' && snapshot.processing.stage === 'DRAFT_REGENERATION') {
                setLoading(false);
                setRegeneration({ progress: snapshot.processing.progressPercent ?? null });
                return;
              }
              if (snapshot.status === 'REVIEW' && applyRegenerationResult(snapshot)) return;
              recordFailure(error);
            })
            .catch(() => recordFailure(error));
          return;
        }
        recordFailure(error);
      });
    // 참석자·문서 설정: 상태가 이미 loading이라 응답이 오면 바로 채운다
    listMeetingParticipants()
      .then((data) => alive.current && setParticipants({ status: 'ready', data }))
      .catch(() => alive.current && setParticipants({ status: 'error' }));
    getDocumentAppConfig()
      .then((data) => alive.current && setConfig({ status: 'ready', data }))
      .catch(() => alive.current && setConfig({ status: 'error' }));
    return () => controller.abort();
  }, [applyRegenerationResult, applySnapshot, recordFailure, sessionId]);

  const regenerating = regeneration !== null;
  useEffect(() => {
    if (!regenerating) return;
    const poller = new ProcessingPoller({
      sessionId,
      getStatus: (id, signal) => getMinutesRegenerationSnapshot(id, signal),
      onSnapshot: (snapshot: MinutesRegenerationSnapshot) => {
        if (snapshot.sessionId !== sessionId) return;
        if (snapshot.status === 'PROCESSING') {
          if (snapshot.processing.stage === 'DRAFT_REGENERATION') {
            setRegeneration({ progress: snapshot.processing.progressPercent ?? null });
          } else {
            setRegeneration(null);
            recordFailure(new ReviewApiError('SESSION_NOT_IN_REVIEW'));
          }
          return;
        }
        setRegeneration(null);
        if (snapshot.status === 'REVIEW' && applyRegenerationResult(snapshot)) return;
        recordFailure(new ReviewApiError('SESSION_NOT_IN_REVIEW'));
      },
      onError: (error) => {
        if (error.code !== 'SESSION_NOT_FOUND') return;
        setRegeneration(null);
        recordFailure(new ReviewApiError('SESSION_NOT_FOUND', 404));
      },
    });
    poller.start();
    return () => poller.stop();
  }, [applyRegenerationResult, recordFailure, regenerating, sessionId]);

  const providerReady = config.status === 'ready' && Boolean(config.data?.document?.provider) && config.data?.document?.configured === true;
  const needsSettings = config.status === 'ready' && (!config.data?.document?.provider || config.data.document.configured !== true);
  const roster = (participants.data ?? []).filter(({ id }) => review?.participantIds.includes(id));

  // ── 회의록 ──
  const currentMinutes = minutesDraft !== undefined ? minutesDraft : (review?.minutes ?? null);
  const baselineMinutes = minutesBaseline !== undefined ? minutesBaseline : (review?.minutes ?? null);
  const minutesDirty = Boolean(review && !sameMinutes(currentMinutes, baselineMinutes));
  const minutesValid = currentMinutes ? minutesAreValid(currentMinutes) : false;
  const canUpdateMinutes = review?.allowedActions.includes('UPDATE_MINUTES') === true;

  const updateMinutes = (draft: StructuredMinutes) => {
    minutesDraftRef.current = draft;
    setMinutesDraft(draft);
  };

  const currentDraftFor = () => (minutesDraftRef.current !== undefined ? minutesDraftRef.current : (serverBase.current?.minutes ?? null));

  async function reconcileMinutes(submitted: StructuredMinutes, conflict: boolean) {
    try {
      const latest = await getReviewSession(sessionId);
      const accepted = rememberMinutesBase(latest.version, latest.minutes);
      if (accepted) applySnapshot(latest);
      const base = serverBase.current?.minutes ?? latest.minutes;
      if (sameMinutes(submitted, base) || sameMinutes(currentDraftFor(), base)) {
        setMinutesState({ status: 'saved' });
        notify(sameMinutes(submitted, base) ? '저장 결과가 확인되었습니다.' : '최신 회의록과 일치합니다.', 'success');
      } else {
        setMinutesState({ status: 'error' });
        notify(
          conflict
            ? '최신 회의 정보를 불러왔습니다. 수정 내용은 유지했으며 자동 저장하지 않았습니다. 확인 후 다시 저장해 주세요.'
            : '저장 결과가 서버 회의록과 다릅니다. 수정 내용은 유지했으며 확인 후 다시 저장해 주세요.',
        );
      }
    } catch (error) {
      recordFailure(error);
      setMinutesState({ status: 'error', recoverySnapshot: snapshotMinutes(submitted) });
      notify(
        failureCode(error) === 'SESSION_NOT_FOUND'
          ? '회의를 찾을 수 없습니다. 새 회의를 시작해 주세요.'
          : failureCode(error) === 'SESSION_NOT_IN_REVIEW'
            ? '이 회의는 더 이상 검토 상태가 아닙니다. 처리 상태를 확인해 주세요.'
            : '저장 결과를 확인하지 못했습니다. 수정 내용은 유지됩니다. 최신 상태를 다시 확인해 주세요.',
      );
    }
  }

  async function saveMinutes() {
    const current = reviewRef.current;
    const draft = currentMinutes;
    if (!current || !draft || !current.allowedActions.includes('UPDATE_MINUTES') || minutesSaveInFlight.current || !minutesAreValid(draft)) return;
    const base = serverBase.current ?? { version: current.version, minutes: current.minutes };
    if (!base.minutes) return;
    const submitted = snapshotMinutes({ ...draft, templateId: base.minutes.templateId, templateVersion: base.minutes.templateVersion });
    if (sameMinutes(submitted, base.minutes)) return;

    minutesSaveInFlight.current = true;
    setMinutesState({ status: 'saving' });
    try {
      const result = await updateReviewMinutes(sessionId, base.version, submitted);
      rememberMinutesBase(result.version, result.minutes);
      try {
        const latest = await getReviewSession(sessionId);
        const applied = applySnapshot(latest);
        if (!applied && latest.version >= result.version) rememberMinutesBase(latest.version, latest.minutes);
        if (sameMinutes(currentDraftFor(), serverBase.current?.minutes)) {
          setMinutesState({ status: 'saved' });
          notify('회의록이 저장되었습니다.', 'success');
        } else {
          setMinutesState({ status: 'error' });
          notify('최신 회의록이 반영되었습니다. 수정 내용은 유지했으며 확인 후 다시 저장해 주세요.');
        }
      } catch (error) {
        recordFailure(error);
        const code = failureCode(error);
        setMinutesState(code === 'OTHER' ? { status: 'saved', recoverySnapshot: snapshotMinutes(submitted) } : { status: 'error' });
        notify(
          code === 'SESSION_NOT_FOUND'
            ? '회의를 찾을 수 없습니다. 새 회의를 시작해 주세요.'
            : code === 'SESSION_NOT_IN_REVIEW'
              ? '회의록은 저장되었지만 검토 상태가 아닙니다. 처리 상태를 확인해 주세요.'
              : '저장했습니다. 최신 회의 정보를 확인하지 못했습니다. 다시 확인해 주세요.',
        );
      }
    } catch (error) {
      const code = failureCode(error);
      if (code !== 'OTHER') {
        recordFailure(error);
        setMinutesState({ status: 'error' });
        notify(code === 'SESSION_NOT_FOUND' ? '회의를 찾을 수 없습니다. 새 회의를 시작해 주세요.' : '이 회의는 더 이상 검토 상태가 아닙니다. 처리 상태를 확인해 주세요.');
      } else if (error instanceof ReviewApiError && (error.status === 412 || error.apiCode === 'SESSION_STATE_CONFLICT' || error.outcomeUnknown)) {
        // 다시 자동으로 보내지 않고 최신 상태와 맞춰 본다
        await reconcileMinutes(submitted, error.status === 412 || error.apiCode === 'SESSION_STATE_CONFLICT');
      } else {
        const fieldLabels: Record<string, string> = {
          summary: '회의 요약', discussionPoints: '논의 내용', decisions: '결정 사항',
          actionItems: '실행 항목', followUps: '후속 조치', templateId: '템플릿', templateVersion: '템플릿 버전',
        };
        const invalidFields = error instanceof ReviewApiError
          ? [...new Set(error.fieldErrors.map((field) => fieldLabels[field]).filter((label): label is string => Boolean(label)))]
          : [];
        setMinutesState({ status: 'error' });
        notify(
          invalidFields.length > 0
            ? `저장하지 못했습니다. 다음 항목을 확인해 주세요: ${invalidFields.join(', ')}. 수정 내용은 유지됩니다.`
            : '저장하지 못했습니다. 기존 저장 내용과 수정 내용은 유지됩니다. 다시 시도해 주세요.',
        );
      }
    } finally {
      minutesSaveInFlight.current = false;
    }
  }

  async function checkMinutesResult() {
    const submitted = minutesState.recoverySnapshot;
    if (!submitted || minutesSaveInFlight.current) return;
    minutesSaveInFlight.current = true;
    setMinutesState({ status: 'saving', recoverySnapshot: submitted });
    try {
      await reconcileMinutes(submitted, false);
    } finally {
      minutesSaveInFlight.current = false;
    }
  }

  // ── 화자 매핑 ──
  const canMap = Boolean(review?.allowedActions.includes('UPDATE_SPEAKER_MAPPING')) && providerReady && !regenerating;
  const mappingValue = (speakerId: string): string | null => {
    if (Object.prototype.hasOwnProperty.call(mappingDraft, speakerId)) return mappingDraft[speakerId];
    return review?.speakers.find((speaker) => speaker.speakerId === speakerId)?.participantId ?? null;
  };
  const mappingDirty = Boolean(review?.speakers.some((speaker) => Object.prototype.hasOwnProperty.call(mappingDraft, speaker.speakerId) && mappingDraft[speaker.speakerId] !== speaker.participantId));
  const unassignedCount = review?.speakers.filter((speaker) => !mappingValue(speaker.speakerId)).length ?? 0;

  /** 저장된 값과 같아진 화자는 바꾼 값 목록에서 뺀다 */
  function pruneMappingDraft(speakers: ReviewSession['speakers']) {
    const next = { ...mappingDraftRef.current };
    for (const speaker of speakers) {
      if (Object.prototype.hasOwnProperty.call(next, speaker.speakerId) && next[speaker.speakerId] === speaker.participantId) delete next[speaker.speakerId];
    }
    mappingDraftRef.current = next;
    setMappingDraft(next);
  }

  function clearMappingDraft() {
    mappingDraftRef.current = {};
    setMappingDraft({});
  }

  async function reconcileMappings(attempt: SpeakerMappingInput[], uncertain: boolean) {
    try {
      const latest = await getReviewSession(sessionId);
      if (!alive.current) return;
      const exact = latest.speakers.length === attempt.length && latest.speakers.every((speaker, index) =>
        speaker.speakerId === attempt[index]?.speakerId && speaker.participantId === attempt[index]?.participantId);
      if (!applySnapshot(latest)) return;
      if (exact && uncertain) {
        pruneMappingDraft(latest.speakers);
        setMappingState('saved');
        notify('매핑 저장이 확인되었습니다.', 'success');
      } else if (!uncertain) {
        // 다른 곳에서 바뀌었다: 최신 매핑을 보인다
        clearMappingDraft();
        setMappingState('idle');
        notify('다른 곳에서 매핑이 바뀌어 최신 상태를 불러왔습니다.', 'info');
      } else {
        setMappingState('error');
        notify('매핑 저장 결과가 서버와 다릅니다. 바꾼 값은 유지했습니다. 다시 저장해 주세요.');
      }
    } catch {
      if (!alive.current) return;
      setMappingState('error');
      notify('저장 결과를 확인하지 못했습니다. 바꾼 값은 유지됩니다. 다시 저장해 주세요.');
    }
  }

  async function flushMappings() {
    window.clearTimeout(mappingTimer.current);
    const current = reviewRef.current;
    if (!current || !alive.current) return;
    if (mappingInFlight.current) {
      mappingPending.current = true;
      return;
    }
    const attempt = current.speakers.map((speaker) => ({
      speakerId: speaker.speakerId,
      participantId: Object.prototype.hasOwnProperty.call(mappingDraftRef.current, speaker.speakerId) ? mappingDraftRef.current[speaker.speakerId] : speaker.participantId,
    }));
    if (attempt.every((mapping, index) => mapping.participantId === current.speakers[index]?.participantId)) {
      pruneMappingDraft(current.speakers);
      return;
    }
    mappingInFlight.current = true;
    setMappingState('saving');
    try {
      const result = await updateSpeakerMappings(sessionId, current.version, attempt);
      if (!alive.current) return;
      const byId = new Map(result.mappings.map((mapping) => [mapping.speakerId, mapping]));
      const speakers = current.speakers.map((speaker) => {
        const mapping = byId.get(speaker.speakerId);
        return mapping ? { ...speaker, participantId: mapping.participantId, participantName: mapping.participantName } : speaker;
      });
      const committed = { ...current, version: result.version, speakers };
      if (!applySnapshot(committed)) {
        setMappingState('error');
        notify('더 최신 회의 정보가 확인되어 저장 결과를 반영하지 않았습니다. 최신 상태를 확인해 주세요.');
        return;
      }
      pruneMappingDraft(speakers);
      setMappingState('saved');
      if (lastChange.current && !mappingPending.current) eventsRef.current.mappingSaved(lastChange.current, committed);
      // 권한(allowedActions)이 바뀌었을 수 있어 다시 읽는다
      try {
        const latest = await getReviewSession(sessionId);
        if (latest.version >= result.version) applySnapshot(latest);
      } catch {
        notify('매핑은 저장되었습니다. 최신 회의 권한을 확인하지 못했습니다. 다시 불러와 확인해 주세요.');
      }
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof Error && 'status' in error && error.status === 412) await reconcileMappings(attempt, false);
      else if (error instanceof Error && 'outcomeUnknown' in error && error.outcomeUnknown === true) await reconcileMappings(attempt, true);
      else {
        setMappingState('error');
        notify('매핑을 저장하지 못했습니다. 바꾼 값은 유지됩니다. 다시 저장해 주세요.');
      }
    } finally {
      mappingInFlight.current = false;
      if (mappingPending.current && alive.current) {
        mappingPending.current = false;
        void flushMappings();
      }
    }
  }

  /** 칩을 누르면 바로 지정하고, 마지막 입력 후 300ms에 묶어 저장한다 */
  const assignSpeaker = (speakerId: string, participantId: string | null) => {
    if (!canMap) return;
    const previous = mappingValue(speakerId);
    if (previous === participantId) return;
    lastChange.current = { speakerId, previous, next: participantId };
    mappingDraftRef.current = { ...mappingDraftRef.current, [speakerId]: participantId };
    setMappingDraft(mappingDraftRef.current);
    setNotice(null);
    window.clearTimeout(mappingTimer.current);
    mappingTimer.current = window.setTimeout(() => void flushMappings(), MAPPING_SAVE_DELAY_MS);
  };

  // ── 확정 → 문서 저장·전달 ──
  // 매핑 저장 중 여부는 mappingState('saving')로 본다(요청과 함께 바뀜). 렌더 중에는 ref를 읽지 않는다
  const savingAny = minutesState.status === 'saving' || mappingState === 'saving';
  /** 발송을 막는 이유. 없으면 null (P02) */
  const completionBlocker = (): string | null => {
    const current = reviewRef.current;
    if (!current) return '최신 회의 정보를 확인한 뒤 다시 시도해 주세요.';
    if (minutesDirty) return '변경된 내용이 있으니 저장하세요.';
    if (savingAny) return '저장 중인 변경사항이 있습니다. 저장이 끝날 때까지 기다려 주세요.';
    if (mappingDirty) return '화자 매핑을 저장한 뒤 검토를 완료해 주세요.';
    if (!current.allowedActions.includes('CONFIRM')) return '최신 회의 정보를 확인한 뒤 다시 시도해 주세요.';
    if (!providerReady) return '문서 서비스 연결을 확인한 뒤 다시 시도해 주세요.';
    return null;
  };

  async function complete() {
    const current = reviewRef.current;
    if (!current || confirmInFlight.current || completing) return;
    const blocker = completionBlocker();
    if (blocker) {
      setNotice(blocker);
      return;
    }
    setNotice(null);
    confirmInFlight.current = true;
    setCompleting(true);
    const attempt = confirmAttempt.current?.version === current.version ? confirmAttempt.current : { version: current.version, key: createIdempotencyKey() };
    confirmAttempt.current = attempt;
    let confirmed = false;
    try {
      let confirmedVersion: number;
      try {
        confirmedVersion = await confirmReview(sessionId, attempt.version, attempt.key);
      } catch (error) {
        if (!(error instanceof PublishApiError) || !error.outcomeUnknown) throw error;
        const latest = await getPublishSnapshot(sessionId);
        if (latest.status === 'CONFIRMED' && latest.allowedActions.includes('PUBLISH')) confirmedVersion = latest.version;
        else if (latest.status === 'REVIEW') confirmedVersion = await confirmReview(sessionId, attempt.version, attempt.key);
        else throw new Error('회의 상태가 변경되어 완료할 수 없습니다.');
      }
      confirmed = true;
      confirmAttempt.current = null;
      // Slack 알림은 폐기했다(D-11, #30): 알림은 켜지 않는다
      await publishSession(sessionId, confirmedVersion, createIdempotencyKey(), current.participantIds, false);
      navigate(`/meetings/${encodeURIComponent(sessionId)}/complete`, { replace: true });
    } catch (error) {
      // 확정됐거나 결과가 불명확하면 결과 화면에서 상태를 확인한다
      if (confirmed || (error instanceof PublishApiError && error.outcomeUnknown)) navigate(`/meetings/${encodeURIComponent(sessionId)}/complete`, { replace: true });
      else notify('회의록을 확정하거나 전달하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.');
    } finally {
      confirmInFlight.current = false;
      if (alive.current) setCompleting(false);
    }
  }

  const navigationGuardActive = mappingDirty || minutesDirty || savingAny || completing;

  return {
    review,
    loading,
    failure,
    regeneration,
    participants: { status: participants.status, roster, all: participants.data ?? [] },
    config: { status: config.status, providerReady, needsSettings },
    minutes: {
      current: currentMinutes,
      dirty: minutesDirty,
      valid: minutesValid,
      status: minutesState.status,
      canSave: canUpdateMinutes && minutesDirty && minutesValid && minutesState.status !== 'saving' && !regenerating,
      recoveryPending: Boolean(minutesState.recoverySnapshot),
      editable: !regenerating,
    },
    mapping: { valueOf: mappingValue, dirty: mappingDirty, status: mappingState, canMap, unassignedCount },
    completing,
    notice,
    navigationGuardActive,
    actions: {
      reload: () => void loadReview(),
      reloadRoster: () => void loadRoster(),
      reloadConfig: () => void loadConfig(),
      updateMinutes,
      saveMinutes: () => void saveMinutes(),
      checkMinutesResult: () => void checkMinutesResult(),
      assignSpeaker,
      retryMappings: () => void flushMappings(),
      complete: () => void complete(),
      dismissNotice: () => setNotice(null),
    },
  };
}
