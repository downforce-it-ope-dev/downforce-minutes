import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { CalendarDays, CircleStop, CloudUpload, FileText, Mic, MicOff, Pause, Play, Plus, RefreshCw, Users } from 'lucide-react';
import { useReportSessionWork } from '../auth/sessionWork';
import { browserMediaAdapter } from '../browserMediaAdapter';
import { NavigationLeaveGuard } from '../components/NavigationLeaveGuard';
import { restoreRecordingSession, type RecordingSession } from '../meeting/recordingSessionStore';
import type { MediaRecorderAdapter, RecordingSnapshot } from '../recordingController';
import { formatElapsedTime } from '../recordingTime';
import {
  AppShell,
  Button,
  ButtonLink,
  Card,
  cn,
  Dialog,
  Icon,
  IconButton,
  parseDateValue,
  ProgressBar,
  RoundActionButton,
  useToast,
} from '../ui';
import { useRecordingSession } from './useRecordingSession';
import { useWakeLock } from './useWakeLock';

/*
 * MTG-02 회의 녹음 (GitHub #27, docs/renewal/화면기획/MTG-02_회의녹음.md). 집중 모드: 메뉴 없이 제목과 (시작 전에만) 뒤로 가기.
 * - 탁자에 둔 태블릿에서 떨어져 보이도록 상태 배지·경과 시간을 위쪽에 크게, 녹음 버튼 2개만 아래에 둔다
 * - 녹음 중은 브랜드 분홍 배지(빨강은 오류와 헷갈려 쓰지 않음), 일시정지는 보라 배지
 * - 태블릿 가로: 왼쪽 녹음 패널 + 오른쪽 회의 정보(날짜·템플릿·참석자, 읽기 전용)
 * - 오류·실패 알림은 토스트, 화면에는 짧은 상태와 다시 시도 버튼만 둔다(S-13)
 */

export function RecordingRoute({ mediaAdapter = browserMediaAdapter }: { mediaAdapter?: MediaRecorderAdapter }) {
  const { sessionId } = useParams();
  // 다시 그릴 때마다 저장소에서 새 객체를 만들면 녹음기가 다시 만들어지므로 경로가 바뀔 때만 읽는다
  const session = useMemo(() => (sessionId ? restoreRecordingSession() : null), [sessionId]);
  if (!session || session.sessionId !== sessionId) return <SessionMissing />;
  return <RecordingScreen key={session.sessionId} session={session} mediaAdapter={mediaAdapter} />;
}

function SessionMissing() {
  return (
    <AppShell title="회의 녹음" focus back={{ to: '/', label: '홈' }}>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <h2 className="text-headline text-text">녹음 세션을 찾을 수 없습니다</h2>
        <ButtonLink to="/meetings/new" icon={Plus} size="lg" shape="pill">
          새 회의 시작
        </ButtonLink>
      </div>
    </AppShell>
  );
}

const dateFormat = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

const END_FAILURES = ['retryable', 'incomplete', 'upload-failed', 'failed'] as const;
const END_RUNNING = ['stopping', 'persisting', 'uploading', 'starting'] as const;
const END_STEP_LABEL: Record<string, string> = {
  stopping: '녹음 정리 중',
  persisting: '오디오 저장 중',
  uploading: '오디오 업로드 중',
  starting: '처리 시작 중',
  complete: '처리 시작',
};

function RecordingScreen({ session, mediaAdapter }: { session: RecordingSession; mediaAdapter: MediaRecorderAdapter }) {
  const recording = useRecordingSession(session, mediaAdapter);
  const [returning, setReturning] = useState(false);
  const { snapshot, endSnapshot } = recording;
  const started = snapshot.state !== 'Ready' || snapshot.completed;
  const active = snapshot.state === 'Recording' || snapshot.state === 'Paused';
  const busy = recording.navigationLocked || active || (END_RUNNING as readonly string[]).includes(endSnapshot.status);

  // 녹음 중에는 세션을 계속 갱신하고, 만료돼도 로그인 화면으로 보내지 않는다(#15). 화면 이탈은 경고한다
  useReportSessionWork(busy, busy);

  return (
    <AppShell
      title="회의 녹음"
      focus
      toastPlacement="top"
      back={
        started
          ? undefined
          : {
              label: '회의 준비로 돌아가기',
              onClick: () => {
                if (returning) return;
                setReturning(true);
                void recording.actions.returnToSetup().catch(() => setReturning(false));
              },
            }
      }
    >
      <NavigationLeaveGuard active={busy} />
      <RecordingBody session={session} recording={recording} returning={returning} />
    </AppShell>
  );
}

function RecordingBody({
  session,
  recording,
  returning,
}: {
  session: RecordingSession;
  recording: ReturnType<typeof useRecordingSession>;
  returning: boolean;
}) {
  const toast = useToast();
  const { snapshot, uploadSnapshot, endSnapshot, storageError, actions } = recording;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const endTrigger = useRef<HTMLButtonElement>(null);
  const active = snapshot.state === 'Recording' || snapshot.state === 'Paused';
  const endFailed = (END_FAILURES as readonly string[]).includes(endSnapshot.status);
  const endRunning = (END_RUNNING as readonly string[]).includes(endSnapshot.status);
  const recovering = (snapshot.completed && Boolean(storageError || snapshot.errorMessage)) || endFailed;

  useWakeLock(active, () => toast({ message: '이 기기에서는 화면 꺼짐 방지를 쓸 수 없습니다.' }));

  // 오류·실패 문구는 토스트로 알린다. 토스트는 하나만 보이므로 가장 중요한 것 하나만 고른다
  // (종료 처리 실패 > 업로드 실패 > 마이크·저장 오류). 같은 문구는 한 번만 띄운다
  const uploadProblem = ['retryable', 'failed', 'session-not-found'].includes(uploadSnapshot.status) ? (uploadSnapshot.message ?? '') : '';
  const notice = (endFailed ? endSnapshot.message : '') || uploadProblem || storageError || snapshot.errorMessage || '';
  useNotice(notice, (message) => toast({ message, tone: 'danger', duration: 8000 }));

  const draft = session.draft;
  const parsedDate = draft?.meetingDate ? parseDateValue(draft.meetingDate) : null;
  const meetingDate = parsedDate ? dateFormat.format(parsedDate) : draft?.meetingDate;

  return (
    <div className="flex flex-1 flex-col gap-6 tablet-lg:flex-row">
      <Card variant="panel" as="section" aria-label="녹음" className="flex flex-1 flex-col items-center gap-5 py-8 text-center tablet:gap-6 tablet:py-10">
        <h2 className="line-clamp-2 max-w-reading text-title text-text tablet-lg:sr-only">{session.title}</h2>
        <StatusBadge snapshot={snapshot} />
        <p aria-label="경과 시간" className="text-display text-text tabular-nums">
          {formatElapsedTime(snapshot.state === 'Ready' && !snapshot.completed ? 0 : snapshot.elapsedMs)}
        </p>

        {!snapshot.completed && (
          <>
            <LevelWaveform level={snapshot.microphoneLevel} state={snapshot.state} />
            {/* 마이크 상태 + 자동 저장 표시 */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <MicrophoneChip snapshot={snapshot} onRetry={actions.retryMicrophone} />
              {/* 자동 저장: 조각 수는 업로드 묶음마다 다시 세어 의미가 없어, 녹음 중 깜빡이는 저장 아이콘만 보인다 */}
              {snapshot.state === 'Recording' && !['retryable', 'failed', 'session-not-found'].includes(uploadSnapshot.status) && (
                <span
                  role="img"
                  aria-label="자동 저장 중"
                  className="inline-flex size-10 items-center justify-center rounded-full bg-bg-subtle text-brand-text tablet:size-12"
                >
                  <Icon icon={CloudUpload} size="lg" className="animate-pulse motion-reduce:animate-none" />
                </span>
              )}
            </div>
          </>
        )}
        {uploadSnapshot.status === 'retryable' && (
          <div className="flex items-center gap-3">
            <p className="text-label text-danger-text">업로드 중단</p>
            <Button size="md" variant="secondary" shape="pill" icon={RefreshCw} onClick={actions.retryUpload}>
              업로드 재시도
            </Button>
          </div>
        )}
        {(endRunning || endSnapshot.status === 'complete') && (
          <div role="status" aria-label="처리 시작 상태" className="flex w-full max-w-form flex-col gap-2">
            <p className="text-label text-text">{END_STEP_LABEL[endSnapshot.status]}</p>
            <ProgressBar
              label="처리 시작 진행"
              value={endSnapshot.status === 'uploading' && uploadSnapshot.totalCount > 0 ? uploadSnapshot.confirmedCount : stepValue(endSnapshot.status)}
              max={endSnapshot.status === 'uploading' && uploadSnapshot.totalCount > 0 ? uploadSnapshot.totalCount : 4}
            />
          </div>
        )}
        {endFailed && (
          <div role="status" aria-label="처리 시작 상태" className="flex flex-col items-center gap-3">
            <p className="text-label text-danger-text">{endSnapshot.status === 'upload-failed' ? '업로드 실패' : '처리 시작 실패'}</p>
            {endSnapshot.status !== 'upload-failed' && (
              <Button size="md" variant="secondary" shape="pill" icon={RefreshCw} onClick={actions.retryProcessing}>
                처리 시작 재시도
              </Button>
            )}
          </div>
        )}

        {/* 녹음 버튼은 아래쪽에 둘만 둔다. 다른 누르는 요소와 떨어뜨려 잘못 누르지 않게 한다 */}
        <div className="mt-auto flex items-start justify-center gap-8 pt-4 tablet:gap-12">
          {snapshot.state === 'Ready' && !snapshot.completed && !endFailed && (
            <RoundActionButton
              icon={Mic}
              label="녹음 시작"
              disabled={snapshot.microphoneStatus !== 'ready' || !snapshot.microphoneInputDetected || returning}
              onClick={() => void actions.start()}
            />
          )}
          {snapshot.state === 'Recording' && <RoundActionButton icon={Pause} label="일시정지" onClick={actions.pause} />}
          {snapshot.state === 'Paused' && <RoundActionButton icon={Play} label="녹음 재개" onClick={actions.resume} />}
          {active && (
            <RoundActionButton ref={endTrigger} icon={CircleStop} label="회의 종료" tone="danger" onClick={() => setConfirmOpen(true)} />
          )}
          {snapshot.state === 'Ready' && recovering && (
            <div className="flex flex-wrap justify-center gap-3">
              <ButtonLink to="/meetings/new" icon={Plus} size="lg" shape="pill">
                새 회의 시작
              </ButtonLink>
              <ButtonLink to="/meetings" variant="secondary" size="lg" shape="pill">
                회의록 목록
              </ButtonLink>
            </div>
          )}
        </div>
        {__UI_PREVIEW__ && <DiagnosticsPanel recording={recording} />}
      </Card>

      {/* 태블릿 가로: 회의 정보 (읽기 전용) */}
      <Card as="section" aria-label="회의 정보" className="hidden w-90 shrink-0 flex-col gap-5 overflow-y-auto tablet-lg:flex">
        <p className="text-title text-text">{session.title}</p>
        {meetingDate && (
          <p className="flex items-center gap-2 text-body text-text tabular-nums">
            <Icon icon={CalendarDays} size="md" className="text-text-muted" />
            {meetingDate}
          </p>
        )}
        {draft?.templateName && (
          <p className="flex items-center gap-2 text-body text-text">
            <Icon icon={FileText} size="md" className="text-text-muted" />
            {draft.templateName}
          </p>
        )}
        {draft?.participants && draft.participants.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-label text-text">
              <Icon icon={Users} size="md" className="text-text-muted" />
              참석자 <span className="tabular-nums">{draft.participants.length}명</span>
            </p>
            <ul aria-label="참석자" className="flex flex-col">
              {draft.participants.map(({ name, email }, index) => (
                <li key={`${email}-${index}`} className="flex min-h-15 flex-col justify-center border-b border-border py-2 last:border-b-0">
                  <span className="text-body font-semibold text-text">{name}</span>
                  <span className="truncate text-caption text-text-muted">{email}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="회의를 종료할까요?"
        footer={
          <>
            <Button
              variant="danger"
              size="lg"
              shape="pill"
              onClick={() => {
                setConfirmOpen(false);
                actions.confirmEnd();
              }}
            >
              회의 종료
            </Button>
            <Button variant="secondary" size="lg" shape="pill" autoFocus onClick={() => setConfirmOpen(false)}>
              계속 녹음
            </Button>
          </>
        }
      />
    </div>
  );
}

function stepValue(status: string) {
  return { stopping: 1, persisting: 2, uploading: 3, starting: 3.5, complete: 4 }[status] ?? 0;
}

/** 값이 바뀌어 비어 있지 않을 때 한 번 부른다 (같은 오류 문구를 거듭 띄우지 않게) */
function useNotice(value: string, show: (value: string) => void) {
  const last = useRef('');
  const showRef = useRef(show);
  useEffect(() => {
    showRef.current = show;
  });
  useEffect(() => {
    if (value && value !== last.current) showRef.current(value);
    last.current = value;
  }, [value]);
}

function StatusBadge({ snapshot }: { snapshot: RecordingSnapshot }) {
  const view = snapshot.completed
    ? { label: '녹음 종료', className: 'bg-bg-subtle text-text', dot: 'bg-neutral-500' }
    : snapshot.state === 'Recording'
      ? { label: '녹음 중', className: 'bg-brand text-neutral-900', dot: 'bg-primary animate-pulse motion-reduce:animate-none' }
      : snapshot.state === 'Paused'
        ? { label: '일시정지됨', className: 'bg-accent text-neutral-900', dot: 'bg-neutral-900' }
        : { label: '녹음 대기', className: 'bg-bg-subtle text-text', dot: 'bg-neutral-400' };
  return (
    <p role="status" aria-live="polite" className={cn('inline-flex h-10 items-center gap-2 rounded-full px-5 text-label tablet:h-12 tablet:text-title', view.className)}>
      <span aria-hidden="true" className={cn('size-3 rounded-full', view.dot)} />
      {view.label}
    </p>
  );
}

const BARS = 40;
/** 휴대폰은 앞쪽 막대를 줄인다 */
const PHONE_HIDDEN = 14;

/**
 * 입력 파형 (MTG-02-F03). 최근 약 3.6초의 입력 레벨을 오른쪽에서 왼쪽으로 흘려 보이는 막대 그래프.
 * 가운데 선을 기준으로 위아래로 자라고, 분홍→보라 그라데이션이다. 녹음 중이 아니면 흐리게 보인다(장식이라 화면 읽기 제외).
 */
function LevelWaveform({ level, state }: { level: number; state: RecordingSnapshot['state'] }) {
  const [history, setHistory] = useState<number[]>(() => Array.from({ length: BARS }, () => 0));
  const levelRef = useRef(level);
  useEffect(() => {
    levelRef.current = level;
  }, [level]);
  // 레벨 값이 같아도(조용할 때 0이 이어져도) 일정한 간격으로 한 칸씩 흘려 보낸다
  useEffect(() => {
    const timer = window.setInterval(() => setHistory((current) => [...current.slice(1), levelRef.current]), 90);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex h-20 w-full max-w-form items-center justify-center gap-1 tablet:h-28 tablet:gap-1.5',
        state !== 'Recording' && 'opacity-50',
      )}
    >
      {history.map((value, index) => {
        // 작은 소리도 보이게 키우고, 끝으로 갈수록 살짝 낮춘다
        const edge = 1 - Math.abs(index - (BARS - 1) / 2) / BARS;
        const ratio = Math.min(1, 0.08 + Math.sqrt(value) * 1.1 * (0.7 + 0.3 * edge));
        return (
          <i
            key={index}
            className={cn(
              'w-1.5 shrink-0 rounded-full bg-linear-to-t from-primary to-lavender-500 transition-all duration-100 motion-reduce:transition-none tablet:w-2',
              index < PHONE_HIDDEN && 'hidden tablet:block',
            )}
            style={{ height: `${Math.round(ratio * 100)}%` }}
          />
        );
      })}
    </div>
  );
}

function MicrophoneChip({ snapshot, onRetry }: { snapshot: RecordingSnapshot; onRetry: () => void }) {
  const { microphoneStatus, microphoneInputDetected } = snapshot;
  const view =
    microphoneStatus === 'checking'
      ? { label: '마이크를 확인하고 있습니다', short: '확인 중', lamp: 'bg-neutral-400', tone: 'bg-bg-subtle' }
      : microphoneStatus === 'error'
        ? { label: '마이크를 사용할 수 없습니다', short: '사용 불가', lamp: 'bg-danger', tone: 'bg-danger-soft' }
        : microphoneInputDetected
          ? { label: '마이크 입력이 감지되었습니다', short: '입력 감지', lamp: 'bg-success-text', tone: 'bg-success-soft' }
          : { label: '마이크 입력 대기 중', short: '입력 대기', lamp: 'bg-warning-text', tone: 'bg-warning-soft' };
  const canRetry = microphoneStatus === 'error' || (microphoneStatus === 'ready' && !microphoneInputDetected);
  return (
    <div className="flex items-center gap-2">
      <div
        role="status"
        aria-live="polite"
        aria-label={view.label}
        className={cn('inline-flex h-10 items-center gap-2 rounded-full px-4 text-body text-text tablet:h-12 tablet:px-5 tablet:text-body-lg', view.tone)}
      >
        <span className="relative shrink-0">
          <Icon icon={microphoneStatus === 'error' ? MicOff : Mic} size="md" />
          <span aria-hidden="true" className={cn('absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-bg', view.lamp)} />
        </span>
        <span aria-hidden="true">{view.short}</span>
      </div>
      {canRetry && (
        <IconButton
          icon={RefreshCw}
          label={microphoneStatus === 'error' ? '마이크 다시 확인' : '마이크 입력 다시 확인'}
          variant="surface"
          onClick={onRetry}
        />
      )}
    </div>
  );
}

/**
 * 녹음 진단 (Preview·개발 서버에서 주소에 ?debug를 붙였을 때만, 운영 빌드에는 없음).
 * 실제 기기에서 마이크 레벨이 들어오는지, 녹음기가 조각을 넘기는지, 업로드 상태가 어떤지 숫자로 본다.
 */
function DiagnosticsPanel({ recording }: { recording: ReturnType<typeof useRecordingSession> }) {
  const [searchParams] = useSearchParams();
  if (!searchParams.has('debug')) return null;
  const { snapshot, uploadSnapshot, endSnapshot, diagnostics } = recording;
  const rows: Array<[string, string]> = [
    ['state', `${snapshot.state}${snapshot.completed ? ' (completed)' : ''}`],
    ['mic', `${snapshot.microphoneStatus} / detected=${snapshot.microphoneInputDetected}`],
    ['level', `${snapshot.microphoneLevel.toFixed(3)} (updates ${diagnostics.levelUpdates})`],
    ['elapsedMs', String(snapshot.elapsedMs)],
    ['chunks', `${diagnostics.chunks} (${diagnostics.chunkBytes} bytes)`],
    ['upload', `${uploadSnapshot.status} ${uploadSnapshot.confirmedCount}/${uploadSnapshot.totalCount} pending=${uploadSnapshot.pendingCount}`],
    ['end', endSnapshot.status],
    ['error', recording.storageError || snapshot.errorMessage || uploadSnapshot.message || endSnapshot.message || '-'],
    ['audioContext', typeof AudioContext === 'undefined' ? 'unsupported' : 'available'],
    ['mediaRecorder', typeof MediaRecorder === 'undefined' ? 'unsupported' : 'available'],
  ];
  return (
    <dl aria-label="녹음 진단" className="grid w-full max-w-form grid-cols-3 gap-x-3 gap-y-1 rounded-md bg-bg-subtle p-3 text-left text-caption text-text">
      {rows.map(([key, value]) => (
        <div key={key} className="col-span-3 grid grid-cols-3 gap-x-3">
          <dt className="font-semibold">{key}</dt>
          <dd className="col-span-2 break-all tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
