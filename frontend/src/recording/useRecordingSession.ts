import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { getReceivedAudioStatus, putAudioChunk } from '../audioUploadApi';
import { ChunkRecorderAdapter } from '../chunkRecorderAdapter';
import { ChunkRepository } from '../chunkRepository';
import { ChunkUploadCoordinator, type ChunkUploadSnapshot } from '../chunkUploadCoordinator';
import { clearRecordingSession, type RecordingSession } from '../meeting/recordingSessionStore';
import { cancelMeetingSession } from '../newMeetingApi';
import { startProcessing } from '../processingStartApi';
import { RecordingController, type MediaRecorderAdapter, type RecordingSnapshot } from '../recordingController';
import { ProcessingAttemptStore, RecordingEndCoordinator, type RecordingEndSnapshot } from '../recordingEndCoordinator';

/*
 * 녹음 세션 연결 (MTG-02, GitHub #27).
 * 기존 App.tsx ActiveMeetingRecordingRoute의 처리를 그대로 옮겼다(녹음 컨트롤러·조각 저장·업로드·종료 처리).
 * 화면은 이 훅의 상태만 그리고, 동작은 actions로 부른다. 녹음·업로드 로직 파일은 바꾸지 않는다.
 */

export const STORAGE_ERROR = '녹음 데이터를 브라우저 임시 저장소에 보관하지 못했습니다. 저장 공간이나 브라우저 상태를 확인해 주세요.';

export function useRecordingSession(session: RecordingSession, mediaAdapter: MediaRecorderAdapter) {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<RecordingSnapshot>({ state: 'Ready', elapsedMs: 0, microphoneStatus: 'checking', microphoneLevel: 0, microphoneInputDetected: false });
  const [storageError, setStorageError] = useState('');
  const [uploadSnapshot, setUploadSnapshot] = useState<ChunkUploadSnapshot>({ status: 'idle', totalCount: 0, confirmedCount: 0, pendingCount: 0 });
  const [endSnapshot, setEndSnapshot] = useState<RecordingEndSnapshot>({ status: 'idle' });
  /** 녹음 중·일시정지·종료 처리 중에는 화면을 벗어나지 못하게 한다 (이탈 경고, 세션 유지) */
  const [navigationLocked, setNavigationLocked] = useState(false);
  /** 진단용(?debug, Preview·개발 서버): 녹음기가 넘긴 조각 수와 마이크 레벨 갱신 횟수 */
  const [diagnostics, setDiagnostics] = useState({ chunks: 0, chunkBytes: 0, levelUpdates: 0 });
  const controllerRef = useRef<RecordingController | null>(null);
  const lastLevel = useRef(0);
  const persistenceTail = useRef<Promise<unknown>>(Promise.resolve());
  const persistenceError = useRef<unknown>(null);
  const finalDurationMs = useRef<number | null>(null);
  const stopPromise = useRef<Promise<number> | null>(null);
  const stopWaiter = useRef<{ resolve: (durationMs: number) => void; reject: (error: unknown) => void } | null>(null);
  const repository = useMemo(
    () => new ChunkRepository({ dbName: 'meeting-automation-chunks', maxChunkBytes: session.uploadPolicy.maxChunkBytes }),
    [session.uploadPolicy.maxChunkBytes],
  );
  const uploader = useMemo(() => {
    const fetchImpl = globalThis.fetch.bind(globalThis);
    return new ChunkUploadCoordinator({
      repository,
      api: {
        getReceivedSequences: async (sessionId) => (await getReceivedAudioStatus(sessionId, fetchImpl)).receivedSequences,
        putChunk: async (_sessionId, chunk) => putAudioChunk(chunk, fetchImpl),
      },
      onChange: setUploadSnapshot,
    });
  }, [repository]);
  const endCoordinator = useRef<RecordingEndCoordinator | null>(null);

  useEffect(() => {
    const coordinator = new RecordingEndCoordinator({
      sessionId: session.sessionId,
      stopRecorderAndWait: () => {
        if (finalDurationMs.current !== null) return Promise.resolve(finalDurationMs.current);
        if (stopPromise.current) return stopPromise.current;
        const waitingForStop = new Promise<number>((resolve, reject) => {
          const controller = controllerRef.current;
          if (!controller) {
            reject(new Error('Recorder is unavailable.'));
            return;
          }
          stopWaiter.current = { resolve, reject };
          controller.stop();
          const current = controller.getSnapshot();
          if (current.errorMessage && !current.completed) {
            stopWaiter.current = null;
            reject(new Error('Recorder did not stop cleanly.'));
          }
        });
        stopPromise.current = waitingForStop;
        return waitingForStop;
      },
      waitForPersistence: async () => {
        await persistenceTail.current;
        if (persistenceError.current) throw new Error('Chunk persistence did not complete.');
      },
      flushUploads: async () => {
        const result = await uploader.uploadPending(session.sessionId);
        const pending = await repository.getPending(session.sessionId);
        if (pending.chunks.length > 0 || (pending.session?.pendingCount ?? 0) > 0) {
          return { ...result, status: 'retryable', pendingCount: pending.chunks.length };
        }
        return result;
      },
      reconcileUploads: () => uploader.reconcile(session.sessionId),
      getAudioState: () => repository.getPending(session.sessionId),
      startProcessing: (request, idempotencyKey) => startProcessing(session.sessionId, request, idempotencyKey),
      clearLocalAudio: () => repository.clearSessionAudio(session.sessionId),
      navigateToProcessing: (sessionId) => navigate(`/meetings/${encodeURIComponent(sessionId)}/processing`),
      attemptStore: new ProcessingAttemptStore(),
      onChange: setEndSnapshot,
    });
    endCoordinator.current = coordinator;
    return () => {
      if (endCoordinator.current === coordinator) endCoordinator.current = null;
    };
  }, [navigate, repository, session.sessionId, uploader]);

  useEffect(() => () => repository.close(), [repository]);
  useEffect(() => {
    void uploader.uploadPending(session.sessionId).catch(() => undefined);
  }, [uploader, session.sessionId]);

  useLayoutEffect(() => {
    let active = true;
    const chunkAdapter = new ChunkRecorderAdapter({
      repository,
      sessionId: session.sessionId,
      onError: () => {
        if (!active) return;
        setStorageError(STORAGE_ERROR);
        controllerRef.current?.stop();
      },
    });
    const current = new RecordingController({
      uploadPolicy: session.uploadPolicy,
      adapter: mediaAdapter,
      onChange: (next) => {
        if (lastLevel.current !== next.microphoneLevel) {
          lastLevel.current = next.microphoneLevel;
          setDiagnostics((d) => ({ ...d, levelUpdates: d.levelUpdates + 1 }));
        }
        setSnapshot(next);
        if (next.completed) setNavigationLocked(false);
        else if (next.state === 'Recording' || next.state === 'Paused') setNavigationLocked(true);
        if (next.errorMessage && stopWaiter.current) {
          const waiter = stopWaiter.current;
          stopWaiter.current = null;
          waiter.reject(new Error('Recorder did not stop cleanly.'));
        }
      },
      onChunk: (chunk) => {
        setDiagnostics((d) => ({ ...d, chunks: d.chunks + 1, chunkBytes: d.chunkBytes + chunk.blob.size }));
        const persisted = persistenceTail.current.catch(() => undefined).then(() => chunkAdapter.accept(chunk));
        persistenceTail.current = persisted;
        void persisted
          .then(() => uploader.uploadPending(session.sessionId))
          .catch((error: unknown) => {
            persistenceError.current = error;
            setStorageError(STORAGE_ERROR);
            controllerRef.current?.stop();
          });
      },
      onStopComplete: (elapsedMs) => {
        finalDurationMs.current = elapsedMs;
        setSnapshot((previous) => ({ ...previous, state: 'Ready', elapsedMs, completed: true }));
        void persistenceTail.current.then(() => uploader.uploadPending(session.sessionId)).catch(() => undefined);
        stopWaiter.current?.resolve(elapsedMs);
        stopWaiter.current = null;
      },
    });
    controllerRef.current = current;
    void current.prepareMicrophone();
    return () => {
      active = false;
      current.dispose();
      if (controllerRef.current === current) controllerRef.current = null;
    };
  }, [session, mediaAdapter, repository, uploader]);

  const actions = {
    async start() {
      setNavigationLocked(true);
      const controller = controllerRef.current;
      if (!controller) {
        setNavigationLocked(false);
        return;
      }
      await controller.start();
      const current = controller.getSnapshot();
      if (current.state === 'Ready' && current.errorMessage && !current.completed) setNavigationLocked(false);
    },
    pause: () => controllerRef.current?.pause(),
    resume: () => controllerRef.current?.resume(),
    confirmEnd() {
      setNavigationLocked(true);
      void endCoordinator.current?.start();
    },
    retryUpload() {
      void uploader.retryManually(session.sessionId).then((result) => {
        if (endSnapshot.status === 'upload-failed' && result.status === 'complete') void endCoordinator.current?.start();
      });
    },
    retryProcessing() {
      setNavigationLocked(true);
      void endCoordinator.current?.start();
    },
    retryMicrophone: () => void controllerRef.current?.prepareMicrophone(),
    /** 녹음 시작 전에만: 세션을 취소하고 입력값을 들고 새 회의로 돌아간다 */
    async returnToSetup() {
      await cancelMeetingSession(session.sessionId);
      setNavigationLocked(false);
      clearRecordingSession();
      navigate('/meetings/new', { state: session.draft ? { draft: session.draft } : null });
    },
  };

  return { snapshot, storageError, uploadSnapshot, endSnapshot, navigationLocked, diagnostics, actions };
}
