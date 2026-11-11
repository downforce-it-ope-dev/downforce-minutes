import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Check, CircleAlert, LoaderCircle, Plus, RefreshCw, ScrollText, Send } from 'lucide-react';
import { useReportSessionWork } from '../auth/sessionWork';
import { NavigationLeaveGuard } from '../components/NavigationLeaveGuard';
import type { ReviewSpeaker } from '../reviewApi';
import {
  AppShell,
  Button,
  ButtonLink,
  Card,
  cn,
  Dialog,
  Icon,
  IconButton,
  ProgressBar,
  TABLET_LG_QUERY,
  Tabs,
  useMediaQuery,
  useToast,
} from '../ui';
import { MinutesEditor } from './MinutesEditor';
import { SpeakerMappingSection } from './SpeakerMappingSection';
import { speakerDisplayLabel } from './speakerPreview';
import { TranscriptList } from './TranscriptList';
import { useReviewSession, type MappingChange } from './useReviewSession';

/*
 * MTG-04 회의록 검토 (GitHub #29, docs/renewal/화면기획/MTG-04_회의록검토.md). 집중 모드(메뉴 없음, 뒤로 가기 → 회의록 목록).
 * - 휴대폰·태블릿 세로: 화자 매핑 카드(태블릿 2열) → 회의록 편집, 1단 페이지 스크롤. 전사 원문은 상단 버튼으로 대화상자
 * - 태블릿 가로: 왼쪽 회의록 편집(따로 스크롤) + 오른쪽 384 패널 탭 "화자 매핑 / 전사 원문"(미지정이 있으면 매핑 탭부터)
 * - 아래 고정 바: 저장 / 발송. 버튼 문구는 짧은 단어(사용자 결정 2026-11-10)
 * - 작업 결과·오류는 토스트, 발송을 막는 이유와 미지정 화자 확인만 대화상자(P02)
 */

const SPEAKER_COLORS = ['bg-pink-500', 'bg-lavender-500', 'bg-blue-500', 'bg-pink-700', 'bg-lavender-700', 'bg-blue-700', 'bg-neutral-500'];

export function ReviewRoute() {
  const { sessionId } = useParams();
  if (!sessionId) return null;
  return <ReviewScreen key={sessionId} sessionId={sessionId} />;
}

type ToastFn = ReturnType<typeof useToast>;

/** AppShell 안에서만 토스트를 쓸 수 있어, 바깥(검토 상태)으로 토스트 함수를 넘긴다 */
function ToastBridge({ onReady }: { onReady: (toast: ToastFn) => void }) {
  const toast = useToast();
  useLayoutEffect(() => {
    onReady(toast);
  }, [onReady, toast]);
  return null;
}

function ReviewScreen({ sessionId }: { sessionId: string }) {
  const toastRef = useRef<ToastFn | null>(null);
  const connectToast = useCallback((toast: ToastFn) => {
    toastRef.current = toast;
  }, []);
  const wide = useMediaQuery(TABLET_LG_QUERY);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const review = useReviewSession(sessionId, {
    notify: (message, tone = 'danger') => toastRef.current?.({ message, tone }),
    mappingSaved: (change: MappingChange, session) => {
      const speaker = session.speakers.find(({ speakerId }) => speakerId === change.speakerId);
      if (!speaker) return;
      const label = speakerDisplayLabel(speaker.label);
      toastRef.current?.({
        message: change.next ? `${label}: ${speaker.participantName ?? '참석자'} 지정` : `${label}: 미지정`,
        tone: 'success',
        duration: 5000,
        action: { label: '되돌리기', onClick: () => review.actions.assignSpeaker(change.speakerId, change.previous) },
      });
    },
  });

  // 진행 중 작업(저장 안 한 변경·저장 중·발송 중)이 있으면 화면 이탈을 경고하고 세션 만료로 로그인 화면에 보내지 않는다
  useReportSessionWork(review.navigationGuardActive, false);

  // 상단 바: 저장 상태 + (태블릿 가로가 아니면) 전사 원문 버튼
  // 매핑은 마지막 입력 후 0.3초에 저장하므로, 그 사이(dirty)도 저장 중으로 보인다
  const saveView = review.minutes.status === 'saving' || review.mapping.status === 'saving' || (review.mapping.dirty && review.mapping.status !== 'error')
    ? { icon: LoaderCircle, label: '저장 중', className: 'text-text-muted', spin: true }
    : review.minutes.status === 'error' || review.mapping.status === 'error'
      ? { icon: CircleAlert, label: '저장 실패', className: 'text-danger-text', spin: false }
      : review.minutes.dirty
        ? { icon: CircleAlert, label: '저장 안 됨', className: 'text-warning-text', spin: false }
        : { icon: Check, label: '저장됨', className: 'text-text-muted', spin: false };
  const topActions = review.review ? (
    <>
      <span role="status" aria-live="polite" className={cn('inline-flex items-center gap-1.5 text-caption', saveView.className)}>
        <Icon icon={saveView.icon} size="sm" className={saveView.spin ? 'animate-spin motion-reduce:animate-none' : undefined} />
        {saveView.label}
      </span>
      {!wide && <IconButton icon={ScrollText} label="전사 원문" variant="surface" aria-haspopup="dialog" onClick={() => setTranscriptOpen(true)} />}
    </>
  ) : null;

  return (
    <AppShell title="회의록 검토" focus back={{ to: '/meetings', label: '회의록 목록' }} fillHeight="tablet-lg" toastPlacement="action" focusActions={topActions}>
      <ToastBridge onReady={connectToast} />
      <NavigationLeaveGuard active={review.navigationGuardActive} />
      <ReviewBody sessionId={sessionId} review={review} wide={wide} transcriptOpen={transcriptOpen} onTranscriptOpenChange={setTranscriptOpen} />
    </AppShell>
  );
}

function ReviewBody({
  sessionId,
  review,
  wide,
  transcriptOpen,
  onTranscriptOpenChange: setTranscriptOpen,
}: {
  sessionId: string;
  review: ReturnType<typeof useReviewSession>;
  wide: boolean;
  transcriptOpen: boolean;
  onTranscriptOpenChange: (open: boolean) => void;
}) {
  const [panelTab, setPanelTab] = useState<'mapping' | 'transcript' | null>(null);
  const [focusSegment, setFocusSegment] = useState<string | null>(null);
  const [confirmUnassigned, setConfirmUnassigned] = useState(false);

  const data = review.review;
  const nameOf = (speaker: ReviewSpeaker) => {
    const id = review.mapping.valueOf(speaker.speakerId);
    if (!id) return speakerDisplayLabel(speaker.label);
    return review.participants.all.find((item) => item.id === id)?.name ?? speaker.participantName ?? speakerDisplayLabel(speaker.label);
  };
  const colorOf = (speakerId: string) => {
    const index = data?.speakers.findIndex((speaker) => speaker.speakerId === speakerId) ?? -1;
    return SPEAKER_COLORS[Math.max(0, index) % SPEAKER_COLORS.length];
  };

  const showInTranscript = (segmentId: string) => {
    setFocusSegment(segmentId);
    if (wide) setPanelTab('transcript');
    else setTranscriptOpen(true);
  };

  if (review.loading && !data) return <ReviewSkeleton />;
  if (!data) return <ReviewFailure failure={review.failure} sessionId={sessionId} onReload={review.actions.reload} />;

  const minutes = review.minutes.current;
  const unassigned = review.mapping.unassignedCount;
  const tab = panelTab ?? (unassigned > 0 ? 'mapping' : 'transcript');

  const mappingSection = (columns: 'auto' | 'one') => (
    <SpeakerMappingSection
      speakers={data.speakers}
      segments={data.transcript}
      roster={review.participants.roster}
      valueOf={review.mapping.valueOf}
      nameOf={nameOf}
      colorOf={colorOf}
      status={review.mapping.status}
      canMap={review.mapping.canMap}
      needsSettings={review.config.needsSettings}
      rosterStatus={review.participants.status}
      onAssign={review.actions.assignSpeaker}
      onRetry={review.actions.retryMappings}
      onReloadRoster={review.actions.reloadRoster}
      onShowInTranscript={showInTranscript}
      columns={columns}
    />
  );
  const transcript = (
    <TranscriptList segments={data.transcript} speakers={data.speakers} nameOf={nameOf} colorOf={colorOf} focusSegmentId={focusSegment} />
  );

  function send() {
    if (unassigned > 0) setConfirmUnassigned(true);
    else review.actions.complete();
  }

  const actionBar = (
    <div className="flex items-center justify-end gap-3">
      {review.minutes.recoveryPending && (
        <Button size="md" variant="secondary" shape="pill" icon={RefreshCw} onClick={review.actions.checkMinutesResult}>
          저장 확인
        </Button>
      )}
      <Button size="lg" variant="secondary" shape="pill" disabled={!review.minutes.canSave} loading={review.minutes.status === 'saving'} onClick={review.actions.saveMinutes}>
        저장
      </Button>
      <Button size="lg" shape="pill" icon={Send} className="min-w-0 flex-1 shadow-primary tablet:max-w-80" loading={review.completing} onClick={send}>
        {review.completing ? '발송 중…' : '발송'}
      </Button>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col gap-6 tablet-lg:min-h-0 tablet-lg:flex-row">

      {/* 왼쪽(또는 1단): 재생성 상태 → (1단이면 화자 매핑) → 회의록 편집 */}
      <div className="flex min-w-0 flex-1 flex-col gap-6 tablet-lg:min-h-0">
        <div className="flex flex-col gap-6 tablet:gap-8 tablet-lg:min-h-0 tablet-lg:flex-1 tablet-lg:overflow-y-auto tablet-lg:pr-1">
          {review.regeneration && (
            <Card className="flex flex-col gap-3">
              <p className="text-label text-text">회의록 재생성 중</p>
              <ProgressBar label="회의록 재생성 진행" value={review.regeneration.progress ?? 0} max={100} />
            </Card>
          )}
          {!wide && mappingSection('auto')}
          {minutes ? (
            <MinutesEditor minutes={minutes} roster={review.participants.roster} disabled={!review.minutes.editable} onChange={review.actions.updateMinutes} />
          ) : (
            <Card>
              <p className="text-body text-text-muted">표시할 회의록이 없습니다.</p>
            </Card>
          )}
        </div>
        {/* 아래 고정 실행 바: 휴대폰·태블릿 세로는 화면 아래, 태블릿 가로는 왼쪽 단 아래 */}
        <div className="h-20 tablet-lg:hidden short:hidden" aria-hidden="true" />
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg px-4 pt-3 pb-safe tablet:px-6 tablet-lg:static tablet-lg:rounded-xl tablet-lg:border-0 tablet-lg:bg-transparent tablet-lg:p-0 short:static">
          <div className="mx-auto mb-3 max-w-content tablet-lg:mb-0">{actionBar}</div>
        </div>
      </div>

      {/* 태블릿 가로: 오른쪽 패널 */}
      {wide && (
        <Card padding="none" as="section" aria-label="화자 매핑과 전사 원문" className="flex w-96 shrink-0 flex-col overflow-hidden">
          <Tabs
            label="검토 패널"
            value={tab}
            onChange={setPanelTab}
            className="flex-1"
            panelClassName="overflow-y-auto"
            items={[
              {
                value: 'mapping',
                label: '화자 매핑',
                badge: unassigned > 0 ? unassigned : undefined,
                badgeLabel: unassigned > 0 ? `미지정 ${unassigned}명` : undefined,
                content: <div className="p-4">{mappingSection('one')}</div>,
              },
              { value: 'transcript', label: '전사 원문', content: transcript },
            ]}
          />
        </Card>
      )}

      {!wide && (
        <Dialog open={transcriptOpen} onOpenChange={setTranscriptOpen} title="전사 원문" size="form">
          {transcript}
        </Dialog>
      )}

      {/* 발송을 막는 이유 (P02) */}
      <Dialog
        open={Boolean(review.notice)}
        onOpenChange={(open) => !open && review.actions.dismissNotice()}
        title="확인 필요"
        footer={
          <Button size="lg" shape="pill" onClick={review.actions.dismissNotice}>
            확인
          </Button>
        }
      >
        <p className="text-body text-text">{review.notice}</p>
      </Dialog>

      {/* 미지정 화자가 있을 때 발송 확인 (차단하지 않음) */}
      <Dialog
        open={confirmUnassigned}
        onOpenChange={setConfirmUnassigned}
        title={`미지정 화자 ${unassigned}명`}
        footer={
          <>
            <Button variant="secondary" size="lg" shape="pill" onClick={() => setConfirmUnassigned(false)}>
              취소
            </Button>
            <Button
              size="lg"
              shape="pill"
              icon={Send}
              onClick={() => {
                setConfirmUnassigned(false);
                review.actions.complete();
              }}
            >
              발송
            </Button>
          </>
        }
      >
        <p className="text-body text-text">미지정 화자는 &lsquo;화자 A&rsquo;처럼 화자 이름으로 저장됩니다.</p>
      </Dialog>
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div aria-busy="true" aria-label="불러오는 중" className="flex flex-col gap-6">
      {[0, 1].map((row) => (
        <Card key={row} className="flex flex-col gap-3">
          <span className="h-4 w-1/3 rounded-full bg-bg-subtle" />
          <span className="h-12 w-full rounded-md bg-bg-subtle" />
        </Card>
      ))}
    </div>
  );
}

function ReviewFailure({ failure, sessionId, onReload }: { failure: string | null; sessionId: string; onReload: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      {failure === 'SESSION_NOT_FOUND' ? (
        <>
          <h2 className="text-headline text-text">회의를 찾을 수 없습니다</h2>
          <ButtonLink to="/meetings/new" icon={Plus} size="lg" shape="pill">
            새 회의 시작
          </ButtonLink>
        </>
      ) : failure === 'SESSION_NOT_IN_REVIEW' ? (
        <>
          <h2 className="text-headline text-text">검토 단계가 아닙니다</h2>
          <ButtonLink to={`/meetings/${encodeURIComponent(sessionId)}/processing`} size="lg" shape="pill">
            처리 상태 확인
          </ButtonLink>
        </>
      ) : (
        <>
          <h2 className="text-headline text-text">회의 정보를 불러오지 못했습니다</h2>
          <Button size="lg" shape="pill" icon={RefreshCw} onClick={onReload}>
            다시 불러오기
          </Button>
        </>
      )}
    </div>
  );
}
