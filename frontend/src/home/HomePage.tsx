import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CalendarDays, ChevronRight, Clock, Mic, RefreshCw, Repeat, Share2, Sparkles, TriangleAlert, Users } from 'lucide-react';
import { AccountButton, SidebarAccount } from '../auth/AccountMenu';
import { getSetupSnapshot, type DocumentProvider, type SetupSnapshot } from '../documentSetupApi';
import { listProcessingFailures, type MeetingSummary } from '../meetingListApi';
import { listMyMeetings, peekMyMeetings } from '../meetings/myMeetings';
import { restoreEmailSettingsOnce } from '../emailSettingsApi';
import {
  AppShell,
  Button,
  ButtonLink,
  Card,
  cn,
  Dialog,
  DocumentStatusChip,
  Icon,
  MeetingFlowVisual,
  Waveform,
  type DocumentStatus,
} from '../ui';

/*
 * HOME-01 메인 (GitHub #24, 시안 "DOWNFORCE 회의록 대시보드", 시안 적용 기준 5.3).
 * - 사이드바(태블릿 가로)·레일(태블릿 세로)·탭 바(휴대폰) 앱 틀, 상단 바: 제목 "홈" + 문서 연결 상태 칩 + (레일·휴대폰) 계정
 * - 안내 패널(일러스트 + 단계 칩, 시안 그대로) + 새 회의 큰 버튼. 휴대폰은 새 회의를 탭 바 위에 고정
 * - 처리 실패 배너(있을 때만), 최근 회의 3건(태블릿 가로: 카드 3개 / 그 밖: 목록 행). 녹음 길이는 API에 없어 넣지 않음
 * - 설명 문구 없이 제목·버튼·데이터만 둔다(S-13)
 */

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

function providerLabel(provider: DocumentProvider) {
  return provider === 'NOTION' ? 'Notion' : 'Confluence';
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function participantSummary(meeting: MeetingSummary) {
  const names = meeting.participants.slice(0, 3).map(({ name }) => name);
  if (meeting.participants.length > 3) names.push(`외 ${meeting.participants.length - 3}명`);
  return names.join(', ');
}

/** 문서 연결 상태 문구 (HOME-01 2장 표) */
function connectionView(connection: Load<SetupSnapshot>): { status: DocumentStatus; label: string } {
  if (connection.status === 'loading') return { status: 'attention', label: '확인 중' };
  if (connection.status === 'error') return { status: 'attention', label: '확인 필요' };
  const snapshot = connection.data;
  const active = snapshot.active;
  if (!active) return { status: 'disconnected', label: '연결 필요' };
  if (snapshot.status === 'SWITCHING') return { status: 'attention', label: `${providerLabel(active.provider)} 전환 중` };
  if (snapshot.status === 'ATTENTION_REQUIRED') return { status: 'attention', label: '점검 필요' };
  if (snapshot.status === 'READY' && snapshot.canCreateMeeting) return { status: 'connected', label: `${providerLabel(active.provider)} 연결됨` };
  return { status: 'attention', label: '설정 확인 필요' };
}

export function HomePage() {
  const navigate = useNavigate();
  const [connection, setConnection] = useState<Load<SetupSnapshot>>({ status: 'loading' });
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [connectionOpen, setConnectionOpen] = useState(false);

  // 서버 메일 설정이 비어 있으면 브라우저에 보관한 값으로 복구한다(D-09). 기존 레이아웃이 앱 시작 때 하던 일을 홈으로 옮겼다(#39)
  useEffect(() => {
    restoreEmailSettingsOnce();
  }, []);

  useEffect(() => {
    let live = true;
    getSetupSnapshot()
      .then(({ snapshot }) => live && setConnection({ status: 'ready', data: snapshot }))
      .catch(() => live && setConnection({ status: 'error' }));
    return () => {
      live = false;
    };
  }, [connectionAttempt]);

  const chip = connectionView(connection);

  return (
    <AppShell
      title="홈"
      hideTitle
      account={<SidebarAccount />}
      actions={
        <>
          {/* 연결된 서비스 로고 + 상태 점만 보인다. 상태 문구는 화면 읽기 프로그램용 */}
          <DocumentStatusChip
            status={chip.status}
            label={chip.label}
            provider={connection.status === 'ready' ? connection.data.active?.provider : null}
            iconOnly
            onClick={() => setConnectionOpen(true)}
          />
          <span className="tablet-lg:hidden">
            <AccountButton />
          </span>
        </>
      }
    >
      <div className="flex flex-1 flex-col gap-6 tablet:gap-8">
        <FailureBanner />

        {/* 안내 패널 + 새 회의 (태블릿 이상) */}
        {/* 높이가 낮은 큰 태블릿 가로(low): 그림을 줄여 왼쪽, 단계·새 회의 버튼을 오른쪽에 두어 최근 회의록까지 한 화면에 들어오게 한다(2026-11-12) */}
        <Card variant="panel" as="section" aria-label="새 회의" className="hidden flex-col items-center gap-8 py-8 tablet:flex low:flex-row low:justify-center low:gap-12 low:py-6">
          <MeetingFlowVisual />
          <div className="flex flex-col items-center gap-6">
          <ol aria-label="회의록 만드는 순서" className="flex flex-wrap items-center justify-center gap-2">
            {[
              { icon: Mic, label: '음성 녹음' },
              { icon: Sparkles, label: 'AI 회의록 생성' },
              { icon: Share2, label: '저장 · 공유' },
            ].map(({ icon, label }, index) => (
              <li key={label} className="flex items-center gap-2">
                {index > 0 && <Icon icon={ChevronRight} size="md" className="text-text-muted" />}
                {/* 누를 수 없는 표시라 버튼처럼 보이지 않게 테두리·그림자 없이 둔다 */}
                <span className="inline-flex h-11 items-center gap-2 rounded-full bg-bg-subtle px-4 text-label text-text">
                  <Icon icon={icon} size="md" className="text-brand-text" />
                  {label}
                </span>
              </li>
            ))}
          </ol>
          <span className="hidden w-full low:flex">
            <Button variant="hero" icon={Mic} className="w-full" onClick={() => navigate('/meetings/new')}>
              새 회의
            </Button>
          </span>
          </div>
        </Card>
        {/* 시안처럼 새 회의 버튼 위아래 여백을 넉넉히 둔다. 높이가 낮은 큰 태블릿 가로는 위 카드 안에 둔다 */}
        <div className="low:hidden">
          <div className="hidden justify-center py-4 tablet:flex">
            <Button variant="hero" icon={Mic} className="w-full max-w-form" onClick={() => navigate('/meetings/new')}>
              새 회의
            </Button>
          </div>
        </div>

        <RecentMeetings />

        {/* 휴대폰: 새 회의를 탭 바 위에 고정 (낮은 화면은 본문 끝) */}
        <div className="h-20 tablet:hidden short:hidden" aria-hidden="true" />
        <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-safe tablet:hidden short:static short:px-0 short:pb-0">
          <div className="mb-20 short:mb-0">
            <Button variant="hero" icon={Mic} className="w-full" onClick={() => navigate('/meetings/new')}>
              새 회의
            </Button>
          </div>
        </div>
      </div>

      <ConnectionDialog
        open={connectionOpen}
        onOpenChange={setConnectionOpen}
        connection={connection}
        onRetry={() => {
          setConnection({ status: 'loading' });
          setConnectionAttempt((value) => value + 1);
        }}
      />
    </AppShell>
  );
}

/** 처리 실패 배너 (HOME-01-F05). 실패 회의가 있을 때만 보인다 */
function FailureBanner() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    listProcessingFailures()
      .then((items) => live && setCount(items.length))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (count === 0) return null;
  return (
    <Link
      to="/meetings"
      className="flex min-h-14 items-center gap-3 rounded-lg bg-danger-soft px-4 text-danger-text tablet:min-h-15"
    >
      <Icon icon={TriangleAlert} size="lg" className="shrink-0" />
      <span className="flex-1 text-label">처리에 실패한 회의 {count}건</span>
      <Icon icon={ChevronRight} size="lg" className="shrink-0" />
    </Link>
  );
}

/**
 * 화면 확인용 샘플 (Preview·개발 서버 전용, 운영 빌드에서는 빠진다). 홈 주소에 ?sample 을 붙이면 최근 회의록에 3건을 보인다.
 * 실제 API는 부르지 않는다.
 */
const SAMPLE_MEETINGS: MeetingSummary[] = [
  { documentId: 'sample-1', title: 'AX 개발 미팅', meetingAt: '2026-11-05T10:00:00+09:00', participants: [{ id: 's1', name: '김가나' }, { id: 's2', name: '이다라' }], documentUrl: null },
  { documentId: 'sample-2', title: 'IAM 설계 리뷰', meetingAt: '2026-11-04T14:00:00+09:00', participants: [{ id: 's3', name: '박마바' }], documentUrl: null },
  { documentId: 'sample-3', title: 'GCP 인프라 논의', meetingAt: '2026-11-03T09:30:00+09:00', participants: [{ id: 's4', name: '최사아' }, { id: 's5', name: '정자차' }, { id: 's6', name: '강카타' }, { id: 's7', name: '조파하' }], documentUrl: null },
] as MeetingSummary[];

function useSample() {
  return __UI_PREVIEW__ && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('sample');
}

/** 최근 회의 3건 (HOME-01-F02·F03). 회의록 목록과 같이 내가 참석자인 회의만 */
function RecentMeetings() {
  const sample = useSample();
  // 이미 받아 둔 목록이 있으면 바로 보이고 뒤에서 새로 받는다(로딩 개선 2026-11-12)
  const [meetings, setMeetings] = useState<Load<MeetingSummary[]>>(() => {
    if (sample) return { status: 'ready', data: SAMPLE_MEETINGS };
    const cached = peekMyMeetings(3);
    return cached ? { status: 'ready', data: cached } : { status: 'loading' };
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (sample) return;
    let live = true;
    listMyMeetings(3)
      .then((items) => live && setMeetings({ status: 'ready', data: items }))
      .catch(() => live && setMeetings((current) => (current.status === 'ready' ? current : { status: 'error' })));
    return () => {
      live = false;
    };
  }, [attempt, sample]);

  const tones = ['text-blue-500', 'text-pink-500', 'text-lavender-500'];
  return (
    // 최근 회의록은 별도 카드 구역으로, 태블릿에서는 화면 아래쪽에 붙인다
    <section aria-labelledby="recent-title" className="flex flex-col gap-4 rounded-2xl bg-bg/60 p-4 shadow-card tablet:mt-auto tablet:p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 id="recent-title" className="flex items-center gap-2 text-title text-text">
          <Icon icon={Clock} size="lg" className="text-text-muted" />
          최근 회의록
        </h2>
        <ButtonLink to="/meetings" variant="ghost" shape="pill">
          전체 보기
          <Icon icon={ChevronRight} size="md" />
        </ButtonLink>
      </div>

      {meetings.status === 'loading' && (
        <ul aria-label="최근 회의록 불러오는 중" className="grid gap-3 tablet-lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <li key={index} className="h-19 animate-pulse rounded-xl bg-bg/70 motion-reduce:animate-none tablet-lg:h-36" />
          ))}
        </ul>
      )}

      {meetings.status === 'error' && (
        <Card className="flex flex-col items-start gap-4 tablet:flex-row tablet:items-center">
          <p className="flex-1 text-body text-text">회의 목록을 불러오지 못했습니다</p>
          <Button variant="secondary" shape="pill" icon={RefreshCw} onClick={() => setAttempt((value) => value + 1)}>
            다시 시도
          </Button>
        </Card>
      )}

      {meetings.status === 'ready' && meetings.data.length === 0 && (
        <Card className="text-body text-text-muted">회의 기록이 없습니다</Card>
      )}

      {meetings.status === 'ready' && meetings.data.length > 0 && (
        <ul className="grid gap-3 tablet-lg:grid-cols-3">
          {meetings.data.map((meeting, index) => (
            <li key={meeting.documentId}>
              <Link
                to={`/meetings/${encodeURIComponent(meeting.documentId)}`}
                aria-label={`${meeting.title} 상세 보기`}
                className={cn(
                  'flex min-h-19 items-center gap-4 rounded-xl bg-bg px-4 py-3 shadow-card active:bg-bg-subtle',
                  'tablet-lg:h-full tablet-lg:flex-col tablet-lg:items-start tablet-lg:gap-3 tablet-lg:p-5',
                )}
              >
                <span className={cn('flex h-10 w-14 shrink-0 items-center justify-center rounded-full bg-bg-subtle', tones[index % tones.length])}>
                  <span className="h-6">
                    <Waveform bars={7} />
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-label text-text">{meeting.title}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-text-muted">
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Icon icon={CalendarDays} size="sm" />
                      {formatDate(meeting.meetingAt)}
                    </span>
                    {meeting.participants.length > 0 && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <Icon icon={Users} size="sm" className="shrink-0" />
                        <span className="truncate">{participantSummary(meeting)}</span>
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** HOME-01-P01 문서 연결 상태 */
function ConnectionDialog({
  open,
  onOpenChange,
  connection,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: Load<SetupSnapshot>;
  onRetry: () => void;
}) {
  const navigate = useNavigate();
  const active = connection.status === 'ready' ? connection.data.active : null;
  const ready = connection.status === 'ready' && connection.data.status === 'READY' && connection.data.canCreateMeeting;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="문서 연결 상태">
      <div className="flex flex-col gap-6">
        {connection.status === 'loading' && <p role="status" className="text-body text-text-muted">확인 중</p>}
        {connection.status === 'error' && (
          <>
            <p role="alert" className="flex items-center gap-2 text-body text-danger-text">
              <Icon icon={TriangleAlert} size="lg" />
              연결 상태를 확인할 수 없습니다
            </p>
            <Button size="lg" shape="pill" variant="secondary" icon={RefreshCw} fullWidth onClick={onRetry}>
              다시 확인
            </Button>
          </>
        )}
        {connection.status === 'ready' && active && (
          <>
            <div className="flex items-center gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-bg shadow-card">
                <img src={active.provider === 'NOTION' ? '/assets/notion.ico' : '/assets/confluence.svg'} alt="" className="size-7" />
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-title text-text">{providerLabel(active.provider)}</span>
                <span className="text-caption text-text-muted tabular-nums">
                  {connection.data.status === 'SWITCHING' ? '전환 중' : ready ? `연결됨 · 버전 ${active.connectionVersion}` : '연결 상태 확인 필요'}
                </span>
              </span>
            </div>
            <Button
              size="lg"
              shape="pill"
              fullWidth
              icon={Repeat}
              onClick={() => {
                onOpenChange(false);
                // 바로 서비스 선택(변경)으로 간다. 중간 문서 연결 화면은 없앴다(2026-11-12)
                navigate('/settings/document');
              }}
            >
              변경
            </Button>
          </>
        )}
        {connection.status === 'ready' && !active && (
          <>
            <p className="text-body text-text">연결된 문서 서비스가 없습니다</p>
            <Button
              size="lg"
              shape="pill"
              fullWidth
              onClick={() => {
                onOpenChange(false);
                navigate('/setup/document');
              }}
            >
              문서 서비스 연결
            </Button>
          </>
        )}
      </div>
    </Dialog>
  );
}
