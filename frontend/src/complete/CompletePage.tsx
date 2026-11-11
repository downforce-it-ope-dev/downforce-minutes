import { useCallback, useRef } from 'react';
import { useParams } from 'react-router';
import { Check, CircleAlert, FileText, List, LoaderCircle, Mail, Plus, RefreshCw, Send, X } from 'lucide-react';
import type { PublishDelivery } from '../publishApi';
import { AppShell, Button, ButtonLink, Card, cn, Icon, IconButton, ToastBridge, type ToastFunction } from '../ui';
import { failureMessage, useCompleteSession, type StepState } from './useCompleteSession';

/*
 * MTG-05 회의 결과 (GitHub #30, docs/renewal/화면기획/MTG-05_회의결과.md). 집중 모드(뒤로 가기 → 회의록 목록).
 * - 위: 결과 요약(큰 상태 아이콘 + 결과 제목) / 단계: 회의록 저장 → 이메일 전달 → 완료 (Slack 단계 없음, D-11)
 * - 태블릿 가로: 왼쪽 요약·단계, 오른쪽 이메일 수신자 / 그 밖: 1단
 * - 아래: 저장된 회의록 보기(또는 재시도) + 새 회의·회의록 목록. 상단 바에 상태 새로고침
 * - 안내·오류는 토스트(S-13). 오류 코드는 "자세히"에 접어 둔다
 */

const STEP_LABEL: Record<StepState, string> = { complete: '완료', current: '진행 중', waiting: '대기', failed: '실패' };

export function CompleteRoute() {
  const { sessionId } = useParams();
  if (!sessionId) return null;
  return <CompleteScreen key={sessionId} sessionId={sessionId} />;
}

function CompleteScreen({ sessionId }: { sessionId: string }) {
  const toastRef = useRef<ToastFunction | null>(null);
  const connectToast = useCallback((toast: ToastFunction) => {
    toastRef.current = toast;
  }, []);
  const result = useCompleteSession(sessionId, (message, tone = 'danger') => toastRef.current?.({ message, tone }));

  return (
    <AppShell
      title="회의 결과"
      focus
      back={{ to: '/meetings', label: '회의록 목록' }}
      toastPlacement="action"
      focusActions={result.snapshot ? <IconButton icon={RefreshCw} label="상태 새로고침" variant="surface" onClick={result.actions.reload} /> : null}
    >
      <ToastBridge onReady={connectToast} />
      <CompleteBody result={result} />
    </AppShell>
  );
}

function CompleteBody({ result }: { result: ReturnType<typeof useCompleteSession> }) {
  const { snapshot } = result;
  if (!result.loaded) {
    return (
      <div aria-busy="true" aria-label="불러오는 중" className="flex flex-col gap-6">
        <Card className="h-40">
          <span className="sr-only">회의 결과를 불러오는 중</span>
        </Card>
        <Card className="h-56">
          <span />
        </Card>
      </div>
    );
  }
  if (!snapshot) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <h2 className="text-headline text-text">{result.loadFailure === 'NOT_FOUND' ? '회의를 찾을 수 없습니다' : '회의 결과를 불러오지 못했습니다'}</h2>
        {result.loadFailure === 'NOT_FOUND' ? (
          <ButtonLink to="/meetings/new" icon={Plus} size="lg" shape="pill">
            새 회의 시작
          </ButtonLink>
        ) : (
          <Button size="lg" shape="pill" icon={RefreshCw} onClick={result.actions.reload}>
            다시 불러오기
          </Button>
        )}
      </div>
    );
  }

  const { steps } = result;
  const overall: StepState = steps.document === 'failed' || steps.done === 'failed' ? 'failed' : steps.done === 'complete' ? 'complete' : 'current';
  const heading =
    snapshot.status === 'DOCUMENT_FAILED' || steps.document === 'failed'
      ? '문서 저장 실패'
      : !result.documentSaved
        ? '회의록 저장 중'
        : steps.done === 'failed'
          ? '일부 전달 실패'
          : steps.done === 'current'
            ? '전달 중'
            : '완료';
  const failure = result.documentFailure;
  const people = new Map(result.participants.map((participant) => [participant.id, participant]));

  const stepRows: Array<{ title: string; state: StepState; detail?: string; code?: string }> = [
    {
      title: '회의록 저장',
      state: steps.document,
      detail: steps.document === 'failed' && failure ? failureMessage(failure.errorCode) : undefined,
      code: steps.document === 'failed' ? failure?.errorCode : undefined,
    },
    ...(result.deliveries.length > 0 ? [{ title: '이메일 전달', state: steps.email }] : []),
    { title: '완료', state: steps.done },
  ];

  const primary = result.savedDocumentId ? (
    <ButtonLink to={`/meetings/${encodeURIComponent(result.savedDocumentId)}`} icon={FileText} size="lg" shape="pill" className="w-full tablet:w-auto">
      저장된 회의록 보기
    </ButtonLink>
  ) : result.canRetryPublish ? (
    <Button size="lg" shape="pill" icon={Send} className="w-full tablet:w-auto" loading={result.publishing} onClick={result.actions.retryPublish}>
      {snapshot.status === 'DOCUMENT_FAILED' ? '저장 재시도' : '다시 전달'}
    </Button>
  ) : null;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="grid gap-6 tablet-lg:grid-cols-2 tablet-lg:items-start">
        <div className="flex flex-col gap-6">
          <Card variant="panel" as="section" aria-label="결과 요약" className="flex flex-col items-center gap-4 py-8 text-center">
            <StateIcon state={overall} size="lg" />
            <h2 aria-live="polite" className="text-headline text-text">
              {heading}
            </h2>
          </Card>
          <Card as="section" aria-label="처리 단계" className="flex flex-col">
            <ol className="flex flex-col">
              {stepRows.map((step) => (
                <li key={step.title} aria-current={step.state === 'current' ? 'step' : undefined} className="flex gap-4 border-b border-border py-4 last:border-b-0">
                  <StateIcon state={step.state} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-label text-text">{step.title}</span>
                      <span className={cn('text-caption', step.state === 'failed' ? 'text-danger-text' : 'text-text-muted')}>{STEP_LABEL[step.state]}</span>
                    </div>
                    {step.detail && <p className="text-caption text-text-muted">{step.detail}</p>}
                    {step.code && (
                      <details className="text-caption text-text-muted">
                        <summary className="cursor-pointer py-2">자세히</summary>
                        <span className="tabular-nums">오류 코드 {step.code}</span>
                      </details>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {result.deliveries.length > 0 && (
          <Card as="section" aria-labelledby="email-results-title" className="flex flex-col gap-2">
            <h2 id="email-results-title" className="flex items-center gap-2 text-title text-text">
              <Icon icon={Mail} size="md" className="text-text-muted" />
              이메일
            </h2>
            <ul aria-live="polite" className="flex flex-col">
              {sortFailedFirst(result.deliveries).map((delivery, index) => {
                const person = delivery.recipientParticipantId ? people.get(delivery.recipientParticipantId) : undefined;
                const name = person?.name || delivery.recipientParticipantId || '참석자';
                const busy = Boolean(delivery.deliveryId && result.busyRows.has(delivery.deliveryId));
                const canRetry = Boolean(delivery.deliveryId && delivery.status === 'FAILED' && delivery.retryable === true && result.emailConfigured);
                return (
                  <li key={delivery.deliveryId ?? index} className="flex min-h-19 items-center gap-3 border-b border-border py-3 last:border-b-0">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-label text-text">{name}</span>
                      {person?.email && <span className="truncate text-caption text-text-muted">{person.email}</span>}
                    </div>
                    <DeliveryStatus delivery={delivery} />
                    {canRetry && (
                      <Button size="sm" variant="secondary" shape="pill" loading={busy} aria-label={`${name} 재전송`} onClick={() => void result.actions.retry(delivery, name)}>
                        재전송
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>

      {/* 아래 실행: 주 동작 하나 + 다음 행동 */}
      <div className="mt-auto flex flex-col gap-3 tablet:flex-row tablet:items-center tablet:justify-center">
        {primary}
        <div className="flex gap-3">
          <ButtonLink to="/meetings/new" variant="secondary" icon={Plus} size="md" shape="pill" className="flex-1">
            새 회의
          </ButtonLink>
          <ButtonLink to="/meetings" variant="secondary" icon={List} size="md" shape="pill" className="flex-1">
            회의록 목록
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

/** 실패한 수신자를 먼저 보인다 (나머지 순서는 그대로) */
function sortFailedFirst(rows: readonly PublishDelivery[]) {
  return [...rows].sort((left, right) => Number(right.status === 'FAILED') - Number(left.status === 'FAILED'));
}

function DeliveryStatus({ delivery }: { delivery: PublishDelivery }) {
  const view =
    delivery.status === 'SENT'
      ? { label: '전달 완료', className: 'bg-success-soft text-success-text' }
      : delivery.status === 'PENDING' || delivery.status === 'SENDING'
        ? { label: '전달 중', className: 'bg-bg-subtle text-text-muted' }
        : { label: '전달 실패', className: 'bg-danger-soft text-danger-text' };
  return <span className={cn('shrink-0 rounded-full px-3 py-1 text-caption', view.className)}>{view.label}</span>;
}

function StateIcon({ state, size = 'md' }: { state: StepState; size?: 'md' | 'lg' }) {
  const view =
    state === 'complete'
      ? { icon: Check, className: 'bg-success-soft text-success-text' }
      : state === 'failed'
        ? { icon: X, className: 'bg-danger-soft text-danger-text' }
        : state === 'current'
          ? { icon: LoaderCircle, className: 'bg-primary-soft text-primary-soft-text' }
          : { icon: CircleAlert, className: 'bg-bg-subtle text-text-muted' };
  return (
    <span aria-hidden="true" className={cn('flex shrink-0 items-center justify-center rounded-full', size === 'lg' ? 'size-20' : 'size-8', view.className)}>
      <Icon icon={view.icon} size={size === 'lg' ? 'xl' : 'md'} className={state === 'current' ? 'animate-spin motion-reduce:animate-none' : undefined} />
    </span>
  );
}
