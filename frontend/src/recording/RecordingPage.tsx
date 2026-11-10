import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { CalendarDays, CircleStop, FileText, Mic, MicOff, Pause, Play, Plus, RefreshCw, Users } from 'lucide-react';
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
  const session = restoreRecordingSession();
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

  // 오류·실패 문구는 토스트로 알린다 (같은 문구는 한 번만)
  const error = storageError || snapshot.errorMessage || '';
  useNotice(error, (message) => toast({ message, tone: 'danger', duration: 8000 }));
  useNotice(['retryable', 'failed', 'session-not-found'].includes(uploadSnapshot.status) ? (uploadSnapshot.message ?? '') : '', (message) =>
    toast({ message, tone: 'danger', duration: 8000 }),
  );
  // 종료 처리 실패가 가장 중요하므로 마지막에 띄운다(토스트는 하나만 보임)
  useNotice(endFailed ? (endSnapshot.message ?? '') : '', (message) => toast({ message, tone: 'danger', duration: 8000 }));

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

        {!snapshot.completed && <MicrophoneBar snapshot={snapshot} onRetry={actions.retryMicrophone} />}

        {/* 저장·업로드 상태: 녹음 중에는 짧게, 문제가 있을 때만 다시 시도 */}
        {active && uploadSnapshot.status !== 'retryable' && uploadSnapshot.confirmedCount > 0 && (
          <p className="text-caption text-text-muted tabular-nums">자동 저장됨 · {uploadSnapshot.confirmedCount}조각</p>
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
            <RoundActionButton ref={endTrigger} icon={CircleStop} label="회의 종료" tone="danger" size="md" onClick={() => setConfirmOpen(true)} />
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
        {draft?.participantNames && draft.participantNames.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-label text-text">
              <Icon icon={Users} size="md" className="text-text-muted" />
              참석자 <span className="tabular-nums">{draft.participantNames.length}명</span>
            </p>
            <ul className="flex flex-col">
              {draft.participantNames.map((name, index) => (
                <li key={`${name}-${index}`} className="flex h-12 items-center border-b border-border text-body text-text last:border-b-0">
                  {name}
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

const BARS = 21;

function MicrophoneBar({ snapshot, onRetry }: { snapshot: RecordingSnapshot; onRetry: () => void }) {
  const { microphoneStatus, microphoneInputDetected, microphoneLevel, state } = snapshot;
  const view =
    microphoneStatus === 'checking'
      ? { label: '마이크를 확인하고 있습니다', short: '확인 중', lamp: 'bg-neutral-400', tone: 'bg-bg-subtle' }
      : microphoneStatus === 'error'
        ? { label: '마이크를 사용할 수 없습니다', short: '사용 불가', lamp: 'bg-danger', tone: 'bg-danger-soft' }
        : microphoneInputDetected
          ? { label: '마이크 입력이 감지되었습니다', short: '입력 감지', lamp: 'bg-success-text', tone: 'bg-success-soft' }
          : { label: '마이크 입력 대기 중', short: '입력 대기', lamp: 'bg-warning-text', tone: 'bg-warning-soft' };
  const canRetry = microphoneStatus === 'error' || (microphoneStatus === 'ready' && !microphoneInputDetected);
  const tall = state === 'Recording' || state === 'Paused';
  return (
    <div className={cn('flex w-full max-w-form items-center gap-3 rounded-full py-1 pr-1 pl-4', view.tone)}>
      <div role="status" aria-live="polite" aria-label={view.label} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="relative shrink-0 text-text">
          <Icon icon={microphoneStatus === 'error' ? MicOff : Mic} size="lg" />
          <span aria-hidden="true" className={cn('absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-bg', view.lamp)} />
        </span>
        <span aria-label={`마이크 입력 레벨 ${Math.round(microphoneLevel * 100)}%`} role="img" className="flex h-12 shrink-0 items-center gap-0.5">
          {Array.from({ length: BARS }, (_, index) => {
            const position = Math.abs(index - (BARS - 1) / 2) / ((BARS - 1) / 2);
            const wave = 0.18 + microphoneLevel * (1 - position * 0.72) * (0.45 + 0.55 * Math.abs(Math.sin(index * 1.7)));
            const height = Math.max(4, Math.round(wave * (tall ? 44 : 28)));
            return <i key={index} className="w-1 rounded-full bg-brand-text" style={{ height }} />;
          })}
        </span>
        <span aria-hidden="true" className="min-w-0 truncate text-left text-body text-text">
          {view.short}
        </span>
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
