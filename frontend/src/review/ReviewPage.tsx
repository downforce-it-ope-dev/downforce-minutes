import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Plus, RefreshCw, Save, ScrollText, Send } from 'lucide-react';
import { useReportSessionWork } from '../auth/sessionWork';
import { NavigationLeaveGuard } from '../components/NavigationLeaveGuard';
import type { ReviewSpeaker } from '../reviewApi';
import { AppShell, Button, ButtonLink, Card, Dialog, IconButton, ProgressBar, Tabs, ToastBridge, type ToastFunction } from '../ui';
import { MinutesSectionNav, MinutesSectionPanel, type MinutesSectionKey } from './MinutesEditor';
import { installSampleReviewApi } from './sampleReviewApi';
import { SpeakerMappingSection } from './SpeakerMappingSection';
import { speakerDisplayLabel } from './speakerPreview';
import { TranscriptList } from './TranscriptList';
import { useReviewSession, type MappingChange } from './useReviewSession';

/*
 * MTG-04 회의록 검토 (GitHub #29, docs/renewal/화면기획/MTG-04_회의록검토.md). 집중 모드(메뉴 없음, 뒤로 가기 → 회의록 목록).
 * 사용자 결정(2026-11-11):
 * - 상단 바: 저장 버튼(바뀐 내용이 있을 때만) + 전사 원문 버튼. "저장됨" 같은 상태 글자는 두지 않는다
 * - 본문은 탭 "화자 매핑 / 회의록". 미지정 화자가 있으면 화자 매핑부터 연다
 * - 화자 매핑: 화자마다 한 줄 카드, 왼쪽에 화자·대화 내용, 오른쪽에서 참석자를 고른다
 * - 회의록: 구역 목록에서 하나를 골라 크게 편집한다(항목이 늘어도 그 구역 안에서만 스크롤)
 * - 발송은 화면 아래 가운데. 버튼 문구는 짧은 단어
 * - 작업 결과·오류는 토스트, 발송을 막는 이유와 미지정 화자 확인만 대화상자(P02)
 */

const SPEAKER_COLORS = ['bg-pink-500', 'bg-lavender-500', 'bg-blue-500', 'bg-pink-700', 'bg-lavender-700', 'bg-blue-700', 'bg-neutral-500'];

export function ReviewRoute() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  // 화면 확인용 샘플 (Preview·개발 서버 전용, 운영 빌드에서는 빠진다): /meetings/sample-review/review?sample
  const sample = __UI_PREVIEW__ && searchParams.has('sample');
  const [sampleReady] = useState(() => (sample ? installSampleReviewApi() : null));
  useEffect(() => () => sampleReady?.(), [sampleReady]);
  if (!sessionId) return null;
  return <ReviewScreen key={sessionId} sessionId={sessionId} />;
}

function ReviewScreen({ sessionId }: { sessionId: string }) {
  const toastRef = useRef<ToastFunction | null>(null);
  const connectToast = useCallback((toast: ToastFunction) => {
    toastRef.current = toast;
  }, []);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [focusSegment, setFocusSegment] = useState<string | null>(null);
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

  const openTranscript = (segmentId: string | null) => {
    setFocusSegment(segmentId);
    setTranscriptOpen(true);
  };

  const topActions = review.review ? (
    <>
      <Button
        size="md"
        variant={review.minutes.dirty ? 'primary' : 'secondary'}
        shape="pill"
        icon={Save}
        disabled={!review.minutes.canSave}
        loading={review.minutes.status === 'saving'}
        onClick={review.actions.saveMinutes}
      >
        저장
      </Button>
      <IconButton icon={ScrollText} label="전사 원문" variant="surface" aria-haspopup="dialog" onClick={() => openTranscript(null)} />
    </>
  ) : null;

  return (
    <AppShell title="회의록 검토" focus back={{ to: '/meetings', label: '회의록 목록' }} fillHeight toastPlacement="action" focusActions={topActions}>
      <ToastBridge onReady={connectToast} />
      <NavigationLeaveGuard active={review.navigationGuardActive} />
      <ReviewBody sessionId={sessionId} review={review} onShowInTranscript={openTranscript} />
      {review.review && (
        <Dialog open={transcriptOpen} onOpenChange={setTranscriptOpen} title="전사 원문" size="form">
          <TranscriptList
            segments={review.review.transcript}
            speakers={review.review.speakers}
            nameOf={(speaker) => speakerName(review, speaker)}
            colorOf={(speakerId) => speakerColor(review, speakerId)}
            focusSegmentId={focusSegment}
          />
        </Dialog>
      )}
    </AppShell>
  );
}

type Review = ReturnType<typeof useReviewSession>;

function speakerName(review: Review, speaker: ReviewSpeaker) {
  const id = review.mapping.valueOf(speaker.speakerId);
  if (!id) return speakerDisplayLabel(speaker.label);
  return review.participants.all.find((item) => item.id === id)?.name ?? speaker.participantName ?? speakerDisplayLabel(speaker.label);
}

function speakerColor(review: Review, speakerId: string) {
  const index = review.review?.speakers.findIndex((speaker) => speaker.speakerId === speakerId) ?? -1;
  return SPEAKER_COLORS[Math.max(0, index) % SPEAKER_COLORS.length];
}

function ReviewBody({ sessionId, review, onShowInTranscript }: { sessionId: string; review: Review; onShowInTranscript: (segmentId: string) => void }) {
  const [tab, setTab] = useState<'mapping' | 'minutes' | null>(null);
  const [section, setSection] = useState<MinutesSectionKey>('summary');
  const [confirmUnassigned, setConfirmUnassigned] = useState(false);

  const data = review.review;
  // 처음 불러왔을 때 한 번만 고른다(미지정이 있으면 화자 매핑). 지정을 끝내도 탭이 저절로 바뀌지 않게 한다
  if (data && tab === null) setTab(review.mapping.unassignedCount > 0 ? 'mapping' : 'minutes');
  if (review.loading && !data) return <ReviewSkeleton />;
  if (!data) return <ReviewFailure failure={review.failure} sessionId={sessionId} onReload={review.actions.reload} />;

  const minutes = review.minutes.current;
  const unassigned = review.mapping.unassignedCount;
  const currentTab = tab ?? (unassigned > 0 ? 'mapping' : 'minutes');

  function send() {
    if (unassigned > 0) setConfirmUnassigned(true);
    else review.actions.complete();
  }

  const mapping = (
    <div className="h-full overflow-y-auto pt-4 pb-2">
      <SpeakerMappingSection
        speakers={data.speakers}
        segments={data.transcript}
        roster={review.participants.roster}
        valueOf={review.mapping.valueOf}
        nameOf={(speaker) => speakerName(review, speaker)}
        colorOf={(speakerId) => speakerColor(review, speakerId)}
        status={review.mapping.status}
        canMap={review.mapping.canMap}
        needsSettings={review.config.needsSettings}
        rosterStatus={review.participants.status}
        onAssign={review.actions.assignSpeaker}
        onRetry={review.actions.retryMappings}
        onReloadRoster={review.actions.reloadRoster}
        onShowInTranscript={onShowInTranscript}
      />
    </div>
  );

  const editor = minutes ? (
    <div className="flex h-full flex-col gap-4 pt-4 tablet:flex-row tablet:gap-6">
      <MinutesSectionNav minutes={minutes} value={section} onChange={setSection} className="shrink-0 tablet:w-48" />
      <Card className="min-h-0 flex-1 tablet:overflow-y-auto">
        <MinutesSectionPanel section={section} minutes={minutes} roster={review.participants.roster} disabled={!review.minutes.editable} onChange={review.actions.updateMinutes} />
      </Card>
    </div>
  ) : (
    <Card className="mt-4">
      <p className="text-body text-text-muted">표시할 회의록이 없습니다.</p>
    </Card>
  );

  return (
    <div className="flex flex-1 flex-col gap-4 tablet:min-h-0">
      {review.regeneration && (
        <Card className="flex flex-col gap-3">
          <p className="text-label text-text">회의록 재생성 중</p>
          <ProgressBar label="회의록 재생성 진행" value={review.regeneration.progress ?? 0} max={100} />
        </Card>
      )}
      {review.minutes.recoveryPending && (
        <div className="flex justify-end">
          <Button size="md" variant="secondary" shape="pill" icon={RefreshCw} onClick={review.actions.checkMinutesResult}>
            저장 확인
          </Button>
        </div>
      )}

      <Tabs
        label="검토"
        value={currentTab}
        onChange={setTab}
        className="tablet:min-h-0 tablet:flex-1"
        panelClassName="tablet:overflow-hidden"
        items={[
          {
            value: 'mapping',
            label: '화자 매핑',
            badge: unassigned > 0 ? unassigned : undefined,
            badgeLabel: unassigned > 0 ? `미지정 ${unassigned}명` : undefined,
            content: mapping,
          },
          { value: 'minutes', label: '회의록', content: editor },
        ]}
      />

      {/* 발송: 화면 아래 가운데. 휴대폰은 화면 아래 고정 */}
      <div className="h-20 tablet:hidden short:hidden" aria-hidden="true" />
      <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-safe tablet:static tablet:px-0 tablet:pb-0 short:static short:px-0 short:pb-0">
        <div className="mx-auto mb-4 w-full max-w-form tablet:mb-0">
          <Button size="lg" shape="pill" icon={Send} fullWidth className="shadow-primary" loading={review.completing} onClick={send}>
            {review.completing ? '발송 중…' : '발송'}
          </Button>
        </div>
      </div>

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
