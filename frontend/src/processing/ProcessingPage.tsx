import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { Check, Download, FileWarning, LoaderCircle, Plus, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { useReportSessionWork } from '../auth/sessionWork';
import { NavigationLeaveGuard } from '../components/NavigationLeaveGuard';
import { restoreRecordingSession } from '../meeting/recordingSessionStore';
import { audioDownloadUrl } from '../processingApi';
import { AppShell, Button, ButtonAnchor, ButtonLink, Card, cn, Dialog, Icon, ProgressBar, useToast } from '../ui';
import { failureMessage, formatElapsed, STAGE_INDEX, STAGE_LABELS, STAGE_NAMES } from './processingCopy';
import { useProcessingSession } from './useProcessingSession';

/*
 * MTG-03 회의 처리 (GitHub #28, docs/renewal/화면기획/MTG-03_회의처리.md). 집중 모드: 메뉴·뒤로 가기 없음.
 * - 녹음을 마친 태블릿을 탁자에 둔 채 보는 화면: 회의 제목, 4단계 표시(태블릿 가로·휴대폰 세로), 단계 기준 진행 막대
 * - 실패: 실패한 단계를 단계 표시에 함께 보이고, 원인·오디오 보관 시간과 복구 버튼(다시 시도·다운로드·실패 마무리)을 둔다
 * - 확인은 공통 대화상자(휴대폰 하단 시트), 작업 오류·연결 오류는 토스트(S-13)
 */

export function ProcessingRoute() {
  const { sessionId = '' } = useParams();
  return <ProcessingScreen key={sessionId} sessionId={sessionId} />;
}

function ProcessingScreen({ sessionId }: { sessionId: string }) {
  return (
    <AppShell title="회의 처리" focus>
      <ProcessingContent sessionId={sessionId} />
    </AppShell>
  );
}

/** 토스트는 AppShell 안에서만 쓸 수 있으므로 상태 연결을 이 안에 둔다 */
function ProcessingContent({ sessionId }: { sessionId: string }) {
  const toast = useToast();
  const processing = useProcessingSession(sessionId, (message) => toast({ message, tone: 'danger', duration: 8000 }));
  const { snapshot, failure, navigationGuardActive } = processing;
  // 녹음 화면에서 넘어왔으면 같은 탭 저장소에 회의 제목이 있다(재처리로 들어오면 없음)
  const title = useMemo(() => {
    const session = restoreRecordingSession();
    return session?.sessionId === sessionId ? session.title : '';
  }, [sessionId]);

  // 처리 대기 중에는 세션을 계속 갱신하고, 만료돼도 로그인 화면으로 보내지 않는다(R-05). 처리 중 이탈은 경고한다
  useReportSessionWork(navigationGuardActive, true);
  useConnectionNotice(failure === 'network', Boolean(snapshot), (message) => toast({ message, tone: 'danger', duration: 8000 }));

  return (
    <>
      <NavigationLeaveGuard active={navigationGuardActive} />
      <div className="mx-auto flex w-full max-w-content flex-1 flex-col gap-6">
        <ProcessingBody processing={processing} title={title} sessionId={sessionId} />
      </div>
    </>
  );
}

/** 연결 오류는 한 번만 알린다. 첫 조회 전이면 화면에 다시 시도가 있고, 조회 후면 기존 화면을 그대로 둔다 */
function useConnectionNotice(active: boolean, hasSnapshot: boolean, show: (message: string) => void) {
  const shown = useRef(false);
  const showRef = useRef(show);
  useEffect(() => {
    showRef.current = show;
  });
  useEffect(() => {
    if (!active) {
      shown.current = false;
      return;
    }
    if (shown.current) return;
    shown.current = true;
    showRef.current(hasSnapshot ? '처리 상태를 새로고침하지 못했습니다. 자동으로 다시 확인합니다.' : '연결을 확인해 주세요. 처리 상태는 자동으로 다시 확인합니다.');
  }, [active, hasSnapshot]);
}

type Processing = ReturnType<typeof useProcessingSession>;

function ProcessingBody({ processing, title, sessionId }: { processing: Processing; title: string; sessionId: string }) {
  const { snapshot, failure } = processing;

  if (failure === 'missing') {
    return (
      <Message title="회의를 찾을 수 없습니다">
        <ButtonLink to="/meetings/new" icon={Plus} size="lg" shape="pill">
          새 회의 시작
        </ButtonLink>
      </Message>
    );
  }
  if (failure === 'invalid' || failure === 'unavailable' || failure === 'session-mismatch') {
    return (
      <Message title="회의 처리 상태를 확인할 수 없습니다">
        <Button icon={RefreshCw} size="lg" shape="pill" onClick={processing.actions.refresh}>
          다시 시도
        </Button>
      </Message>
    );
  }
  if (!snapshot) {
    return failure === 'network' ? (
      <Message title="처리 상태를 불러오지 못했습니다">
        <Button icon={RefreshCw} size="lg" shape="pill" onClick={processing.actions.refresh}>
          다시 시도
        </Button>
      </Message>
    ) : (
      <Message title="처리 상태 확인 중" busy />
    );
  }
  if (snapshot.status === 'COMPLETED_WITH_WARNINGS') {
    return (
      <Message title="실패 기록을 저장했습니다" detail="메일로 회의가 전달되지 않았습니다.">
        <ButtonLink to="/" size="lg" shape="pill" variant="secondary">
          홈
        </ButtonLink>
      </Message>
    );
  }

  const failed = snapshot.status === 'PROCESSING_FAILED';
  return (
    <>
      <Card variant="panel" as="section" aria-label="처리 단계" className="flex flex-col gap-6 tablet:gap-8 tablet:p-8">
        {title && <h2 className="line-clamp-2 text-title text-text">{title}</h2>}
        <StageList processing={processing} />
        {!failed && <StageProgress processing={processing} />}
      </Card>
      {failed && <FailureCard processing={processing} sessionId={sessionId} />}
    </>
  );
}

function Message({ title, detail, busy, children }: { title: string; detail?: string; busy?: boolean; children?: ReactNode }) {
  return (
    <Card variant="panel" as="section" aria-labelledby="processing-message" className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      {busy && <Icon icon={LoaderCircle} size="xl" className="animate-spin text-primary-soft-text motion-reduce:animate-none" />}
      <h2 id="processing-message" role={busy ? 'status' : undefined} className="text-headline text-text">
        {title}
      </h2>
      {detail && <p className="text-body-lg text-text-muted">{detail}</p>}
      {children}
    </Card>
  );
}

type StepState = 'done' | 'current' | 'failed' | 'waiting';

function StageList({ processing }: { processing: Processing }) {
  const { snapshot, activeStage, isProcessing, isTranscribing, transcriptionElapsedSeconds } = processing;
  const failed = snapshot?.status === 'PROCESSING_FAILED';
  const failedStage = failed && snapshot?.processing.stage ? STAGE_INDEX[snapshot.processing.stage] : -1;
  const stateOf = (index: number): StepState => {
    if (snapshot?.status === 'REVIEW') return 'done';
    if (failed) return index === failedStage ? 'failed' : index < failedStage ? 'done' : 'waiting';
    if (!isProcessing) return 'waiting';
    return index < activeStage ? 'done' : index === activeStage ? 'current' : 'waiting';
  };
  return (
    <ol className="flex flex-col tablet:grid tablet:grid-cols-4 tablet:gap-2">
      {STAGE_NAMES.map((name, index) => {
        const state = stateOf(index);
        return (
          <li
            key={name}
            aria-current={state === 'current' ? 'step' : undefined}
            className="relative flex min-h-12 items-center gap-3 tablet:flex-col tablet:gap-3 tablet:text-center"
          >
            {/* 단계 사이 선: 휴대폰은 원 아래 세로선, 태블릿은 원 오른쪽 가로선 */}
            {index < STAGE_NAMES.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-10 left-4 h-4 w-px -translate-x-1/2 tablet:top-4 tablet:left-1/2 tablet:h-px tablet:w-full tablet:translate-x-6',
                  state === 'done' ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
            <StepMark state={state} />
            <span className={cn('text-label', state === 'current' || state === 'failed' ? 'text-text' : 'text-text-muted')}>
              {name}
              <span className="sr-only">{{ done: ' 완료', current: ' 진행 중', failed: ' 실패', waiting: ' 대기' }[state]}</span>
              {state === 'current' && isTranscribing && (
                <span className="ml-2 text-caption text-text-muted tabular-nums tablet:hidden" aria-hidden="true">
                  {formatElapsed(transcriptionElapsedSeconds)}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StepMark({ state }: { state: StepState }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-bg',
        state === 'done' && 'bg-primary text-white',
        state === 'current' && 'border-2 border-primary',
        state === 'failed' && 'bg-danger text-white',
        state === 'waiting' && 'border-2 border-border-input',
      )}
    >
      {state === 'done' && <Icon icon={Check} size="sm" />}
      {state === 'failed' && <Icon icon={X} size="sm" />}
      {state === 'current' && <span className="size-3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />}
    </span>
  );
}

function StageProgress({ processing }: { processing: Processing }) {
  const { activeStage, isTranscribing, transcriptionElapsedSeconds } = processing;
  if (activeStage < 0) {
    return (
      <p role="status" className="text-body text-text-muted">
        처리 상태를 확인하고 있습니다.
      </p>
    );
  }
  const step = activeStage + 1;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p role="status" className="text-body-lg text-text">
          전체 {STAGE_NAMES.length}단계 중 {step}단계 · {STAGE_NAMES[activeStage]} 진행 중
        </p>
        {isTranscribing && (
          <p role="timer" aria-label={`음성 인식 경과 시간 ${formatElapsed(transcriptionElapsedSeconds)}`} className="text-title text-text tabular-nums">
            경과 {formatElapsed(transcriptionElapsedSeconds)}
          </p>
        )}
      </div>
      <ProgressBar value={step} max={STAGE_NAMES.length} label="전체 처리 단계" valueText={`${STAGE_NAMES.length}단계 중 ${step}단계`} />
    </div>
  );
}

function FailureCard({ processing, sessionId }: { processing: Processing; sessionId: string }) {
  const { snapshot, busy, allowed, downloadReady, expiresInMinutes, confirmDiscard, confirmDownload, actions } = processing;
  if (!snapshot) return null;
  const stage = snapshot.processing.stage;
  const canRetry = allowed('RETRY_PROCESSING');
  const canDownload = allowed('DOWNLOAD_AUDIO');
  const canFinalize = allowed('FINALIZE_PROCESSING_FAILURE');
  return (
    <Card as="section" padding="none" aria-labelledby="processing-failed-title" className="overflow-hidden">
      <div className="flex items-center gap-3 bg-danger-soft px-4 py-4 text-danger-text tablet:px-6">
        <Icon icon={TriangleAlert} size="md" />
        <h2 id="processing-failed-title" className="text-title">
          처리를 완료하지 못했습니다
        </h2>
      </div>
      <div className="flex flex-col gap-5 p-4 tablet:p-6">
        <p role="alert" className="text-body-lg text-text">
          {failureMessage(snapshot.processing.errorCode, stage)}
        </p>
        <dl className="-mt-2 flex flex-col gap-2 text-body">
          {stage && (
            <div className="flex gap-2 text-text-muted">
              <dt>실패한 단계</dt>
              <dd className="text-text">{STAGE_LABELS[stage]}</dd>
            </div>
          )}
          {expiresInMinutes !== null && (
            <div className="flex gap-2 text-text-muted">
              <dt>오디오 보관</dt>
              <dd className="text-text tabular-nums">{expiresInMinutes === 0 ? '만료됨' : `약 ${expiresInMinutes}분 남음`}</dd>
            </div>
          )}
        </dl>
        {(canRetry || canDownload || canFinalize) && (
          <div className="flex flex-col gap-3 tablet:flex-row tablet:flex-wrap tablet:items-center">
            {canRetry && (
              <Button size="lg" icon={RefreshCw} loading={busy} disabled={busy} onClick={actions.retry} className="tablet:min-w-60">
                다시 시도
              </Button>
            )}
            {canDownload &&
              (downloadReady ? (
                <ButtonAnchor href={audioDownloadUrl(sessionId)} download newTab variant="secondary" icon={Download} onClick={actions.markDownloadStarted}>
                  오디오 다운로드
                </ButtonAnchor>
              ) : (
                <Button variant="secondary" icon={Download} disabled={busy} onClick={actions.prepareDownload}>
                  다운로드 준비
                </Button>
              ))}
            {canFinalize && (
              <Button variant="secondary" icon={FileWarning} disabled={busy} onClick={() => actions.setConfirmDiscard(true)} className="tablet:ml-auto">
                실패 마무리
              </Button>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={confirmDownload}
        onOpenChange={actions.setConfirmDownload}
        title="오디오를 기기에 저장했나요?"
        description="저장된 것을 확인한 경우에만 다운로드 완료로 기록합니다."
        dismissible={!busy}
        footer={
          <>
            <Button size="lg" shape="pill" autoFocus loading={busy} disabled={busy} onClick={() => actions.finalize('DOWNLOADED')}>
              저장했어요
            </Button>
            <Button variant="secondary" size="lg" shape="pill" disabled={busy} onClick={() => actions.setConfirmDownload(false)}>
              아니요
            </Button>
          </>
        }
      />
      <Dialog
        open={confirmDiscard}
        onOpenChange={actions.setConfirmDiscard}
        title="오디오 없이 마무리할까요?"
        description="오디오를 보관하지 않고 실패 기록을 저장합니다. 되돌릴 수 없습니다."
        dismissible={!busy}
        footer={
          <>
            <Button variant="danger" size="lg" shape="pill" loading={busy} disabled={busy} onClick={() => actions.finalize('DISCARDED')}>
              실패 마무리
            </Button>
            <Button variant="secondary" size="lg" shape="pill" autoFocus disabled={busy} onClick={() => actions.setConfirmDiscard(false)}>
              취소
            </Button>
          </>
        }
      />
    </Card>
  );
}
