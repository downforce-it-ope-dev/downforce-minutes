import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  finalizeProcessingFailure,
  getProcessingStatus,
  ProcessingApiError,
  retryProcessing,
  type ProcessingAction,
  type ProcessingSnapshot,
} from '../processingApi';
import { ProcessingPoller } from '../processingPoller';
import { STAGE_INDEX } from './processingCopy';

/*
 * 회의 처리 상태 연결 (MTG-03, GitHub #28).
 * 기존 ProcessingPage.tsx의 처리(반복 조회·화면 복귀 시 재조회·재시도·오디오 다운로드 확인·실패 마무리)를 그대로 옮겼다.
 * 화면은 이 훅의 상태만 그린다. 확인 대화상자의 초점·Esc 처리는 공통 Dialog(Radix)가 맡는다.
 * 작업 오류 문구는 화면에 두지 않고 notify(토스트)로 보낸다(S-13).
 */

export type ProcessingFailure = 'network' | 'missing' | 'invalid' | 'session-mismatch' | 'unavailable';

const DOWNLOAD_RETURN_KEY = 'processing-download-return';
const AUDIO_UNAVAILABLE = '오디오를 사용할 수 없거나 보관 기한이 지났습니다. 최신 상태를 확인해 주세요.';

function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function failureFor(error: ProcessingApiError, httpUnavailable: boolean): ProcessingFailure {
  if (error.code === 'SESSION_NOT_FOUND') return 'missing';
  if (error.code === 'INVALID_RESPONSE') return 'invalid';
  if (httpUnavailable && error.code === 'HTTP_ERROR' && error.status !== undefined && error.status < 500 && error.status !== 408 && error.status !== 429) return 'unavailable';
  return 'network';
}

export function useProcessingSession(sessionId: string, notify: (message: string) => void) {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<ProcessingSnapshot | null>(null);
  const [failure, setFailure] = useState<ProcessingFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDownload, setConfirmDownload] = useState(false);
  const [downloadReadySessionId, setDownloadReadySessionId] = useState<string | null>(null);
  const downloadReady = downloadReadySessionId === sessionId;
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [transcriptionElapsedSeconds, setTranscriptionElapsedSeconds] = useState(0);
  const navigated = useRef(false);
  const inFlight = useRef(false);
  const snapshotRef = useRef<ProcessingSnapshot | null>(null);
  const reconcilingDownloadRef = useRef(false);
  const notifyRef = useRef(notify);

  useEffect(() => {
    notifyRef.current = notify;
  });
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const applySnapshot = useCallback(
    (next: ProcessingSnapshot) => {
      if (next.sessionId !== sessionId) {
        setFailure('session-mismatch');
        return;
      }
      if (snapshotRef.current && next.version < snapshotRef.current.version) return;
      const wasTranscribing = snapshotRef.current?.status === 'PROCESSING' && snapshotRef.current.processing.stage === 'TRANSCRIPTION';
      if (!wasTranscribing && next.status === 'PROCESSING' && next.processing.stage === 'TRANSCRIPTION') setTranscriptionElapsedSeconds(0);
      snapshotRef.current = next;
      setSnapshot(next);
      const canDownload = next.status === 'PROCESSING_FAILED' && next.processing.audioAvailable === true && next.allowedActions.includes('DOWNLOAD_AUDIO');
      setDownloadReadySessionId((readySessionId) => (readySessionId === sessionId && canDownload ? sessionId : null));
      if (!canDownload) setConfirmDownload(false);
      setFailure(null);
      if (next.status === 'REVIEW' && !navigated.current) {
        navigated.current = true;
        navigate(`/meetings/${encodeURIComponent(sessionId)}/review`, { replace: true });
      }
    },
    [navigate, sessionId],
  );

  const refresh = useCallback(async () => {
    try {
      applySnapshot(await getProcessingStatus(sessionId));
    } catch (error) {
      setFailure(failureFor(error instanceof ProcessingApiError ? error : new ProcessingApiError('NETWORK_ERROR'), true));
    }
  }, [applySnapshot, sessionId]);

  useEffect(() => {
    let live = true;
    const poller = new ProcessingPoller({
      sessionId,
      getStatus: (id, signal) => getProcessingStatus(id, signal),
      onSnapshot: (next) => {
        if (live) applySnapshot(next);
      },
      onError: (error) => {
        if (live) setFailure(failureFor(error, true));
      },
    });
    poller.start();
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (sessionStorage.getItem(DOWNLOAD_RETURN_KEY) === sessionId) {
        // 원본 오디오를 받고 돌아오면 최신 상태를 확인한 뒤 저장 여부를 묻는다(MTG-03-P01)
        sessionStorage.removeItem(DOWNLOAD_RETURN_KEY);
        setConfirmDownload(false);
        reconcilingDownloadRef.current = true;
        setBusy(true);
        void getProcessingStatus(sessionId)
          .then((latest) => {
            applySnapshot(latest);
            if (latest.status === 'PROCESSING_FAILED' && latest.processing.audioAvailable === true && latest.allowedActions.includes('DOWNLOAD_AUDIO')) {
              setConfirmDownload(true);
            } else {
              notifyRef.current(AUDIO_UNAVAILABLE);
            }
          })
          .catch(() => {
            setFailure('network');
            notifyRef.current('오디오 상태를 확인하지 못했습니다. 연결을 확인하고 다시 확인해 주세요.');
          })
          .finally(() => {
            reconcilingDownloadRef.current = false;
            setBusy(false);
          });
      } else if (reconcilingDownloadRef.current) return;
      else if (snapshotRef.current?.status === 'PROCESSING_FAILED') void refresh();
      else poller.refreshNow();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onVisibilityChange);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onVisibilityChange);
      poller.stop();
    };
  }, [applySnapshot, refresh, sessionId]);

  // 오디오 보관 만료: 1분마다 남은 시간을 다시 계산하고, 만료 시각에 상태를 다시 조회한다(MTG-03-F09)
  useEffect(() => {
    const expiresAt = snapshot?.processing.audioExpiresAt;
    if (!expiresAt || snapshot?.status !== 'PROCESSING_FAILED') return;
    const expiry = Date.parse(expiresAt);
    if (!Number.isFinite(expiry)) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 60_000);
    const expiryRefresh = window.setTimeout(() => void refresh(), Math.max(0, expiry - Date.now()));
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(expiryRefresh);
    };
  }, [refresh, snapshot?.processing.audioExpiresAt, snapshot?.status]);

  const expiryTime = snapshot?.processing.audioExpiresAt ? Date.parse(snapshot.processing.audioExpiresAt) : Number.NaN;
  const expiresInMinutes =
    snapshot?.status === 'PROCESSING_FAILED' && Number.isFinite(expiryTime) ? Math.max(0, Math.ceil((expiryTime - clockNow) / 60_000)) : null;
  const isProcessing = failure === null && snapshot?.status === 'PROCESSING';
  const isTranscribing = isProcessing && snapshot?.processing.stage === 'TRANSCRIPTION';
  /** 처리 중이거나 요청을 보내는 동안 화면 이탈을 경고한다(MTG-03-F10) */
  const navigationGuardActive = snapshot === null ? failure === null : snapshot.status === 'PROCESSING' || busy;

  useEffect(() => {
    if (!isTranscribing) return;
    let elapsed = 0;
    const timer = window.setInterval(() => setTranscriptionElapsedSeconds(++elapsed), 1_000);
    return () => window.clearInterval(timer);
  }, [isTranscribing]);

  const allowed = (action: ProcessingAction) => {
    if (failure !== null) return false;
    if (snapshot?.allowedActions.includes(action) !== true) return false;
    if (action === 'DOWNLOAD_AUDIO') return snapshot?.processing.audioAvailable === true;
    return true;
  };

  const mutate = async (kind: 'retry' | 'finalize', disposition?: 'DOWNLOADED' | 'DISCARDED') => {
    if (!snapshot || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const key = newKey();
    try {
      if (kind === 'retry') await retryProcessing(sessionId, snapshot.version, key);
      else await finalizeProcessingFailure(sessionId, snapshot.version, disposition!, key);
      setConfirmDiscard(false);
      setConfirmDownload(false);
      await refresh();
    } catch (error) {
      const mapped = error instanceof ProcessingApiError ? error : new ProcessingApiError('NETWORK_ERROR', undefined, true);
      notifyRef.current(
        mapped.code === 'DOCUMENT_FAILED'
          ? '실패 기록을 저장하지 못했습니다. 상태를 확인한 뒤 다시 시도해 주세요.'
          : mapped.code === 'AUDIO_NOT_AVAILABLE'
            ? '다시 처리할 오디오를 찾지 못했습니다. 보관 기한이 지났을 수 있습니다.'
            : mapped.code === 'SESSION_STATE_CONFLICT'
              ? '현재 회의 상태에서는 다시 시도할 수 없습니다. 최신 상태를 확인해 주세요.'
              : '요청 결과를 확인하지 못했습니다. 최신 상태를 다시 확인합니다.',
      );
      await refresh();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const checkDownloadAvailability = async () => {
    setBusy(true);
    setDownloadReadySessionId(null);
    try {
      const latest = await getProcessingStatus(sessionId);
      applySnapshot(latest);
      if (latest.status === 'PROCESSING_FAILED' && latest.processing.audioAvailable === true && latest.allowedActions.includes('DOWNLOAD_AUDIO')) {
        setDownloadReadySessionId(sessionId);
      } else notifyRef.current(AUDIO_UNAVAILABLE);
    } catch (error) {
      setFailure(failureFor(error instanceof ProcessingApiError ? error : new ProcessingApiError('NETWORK_ERROR'), false));
      notifyRef.current('오디오 상태를 확인하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const reportedStage = snapshot?.processing?.stage ? STAGE_INDEX[snapshot.processing.stage] : -1;
  const progress = snapshot?.processing?.progressPercent;
  const validProgress = typeof progress === 'number' && Number.isFinite(progress) && progress >= 0 && progress <= 100;
  // 서버 진행률은 작업 단계 기준이며 오디오 처리량이 아니다(MTG-03-F02). 화자 분석 100%면 다음 단계로 본다
  const activeStage = isProcessing && reportedStage === 2 && validProgress && progress === 100 ? 3 : reportedStage;

  return {
    snapshot,
    failure,
    busy,
    activeStage,
    isProcessing,
    isTranscribing,
    transcriptionElapsedSeconds,
    expiresInMinutes,
    downloadReady,
    navigationGuardActive,
    confirmDiscard,
    confirmDownload,
    allowed,
    actions: {
      refresh: () => void refresh(),
      retry: () => void mutate('retry'),
      prepareDownload: () => void checkDownloadAvailability(),
      /** 다운로드 링크를 누르면 돌아왔을 때 저장 여부를 묻도록 표시해 둔다 */
      markDownloadStarted: () => sessionStorage.setItem(DOWNLOAD_RETURN_KEY, sessionId),
      setConfirmDiscard,
      setConfirmDownload,
      finalize: (disposition: 'DOWNLOADED' | 'DISCARDED') => void mutate('finalize', disposition),
    },
  };
}
