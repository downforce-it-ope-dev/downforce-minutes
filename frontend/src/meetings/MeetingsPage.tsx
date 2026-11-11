import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, CalendarDays, ChevronRight, Mic, Plus, RefreshCw, RotateCcw, Search, X, type LucideIcon } from 'lucide-react';
import { AccountButton, SidebarAccount } from '../auth/AccountMenu';
import { filterMeetings, hasInvalidDateRange } from '../meetingFilters';
import { listMeetings, type MeetingSummary } from '../meetingListApi';
import {
  AppShell,
  Button,
  Card,
  cn,
  DateField,
  Dialog,
  Icon,
  IconButton,
  TextField,
  useToast,
} from '../ui';
import { formatChipDate, formatMeetingAt, participantSummary } from './meetingFormat';
import { sortMeetings } from './meetingView';
import { ProcessingFailures } from './ProcessingFailures';

/*
 * MIN-01 회의록 목록 (GitHub #32, docs/renewal/화면기획/MIN-01_회의록목록.md).
 * - 검색(회의명·참석자)은 입력하는 즉시 화면 안에서 거른다. 서버 목록은 최대 100건(API-017)
 * - 사용자 결정(2026-11-11): 검색은 위쪽 넓은 알약형 검색창(검색 사이트처럼), 기간·정렬·초기화는 그 옆 원형 아이콘 버튼.
 *   기간 버튼은 시작일·종료일 대화상자를 연다. 목록은 그 아래 전체 폭, 태블릿 이상은 회의명·일시·참석자를 한 줄로 늘어놓는다
 * - 조건은 주소(?q·from·to·sort)에 남겨 상세에서 돌아와도 유지한다(MIN-02 목록으로)
 * - 처리 실패 회의는 목록 위에 있을 때만 보인다(F07·F08)
 * - 오류·안내는 토스트, 입력 오류는 테두리만(S-13)
 */

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: MeetingSummary[] };

export interface MeetingListFilters {
  query: string;
  from: string;
  to: string;
  sort: 'new' | 'old';
}

function useListFilters() {
  const [params, setParams] = useSearchParams();
  const filters: MeetingListFilters = {
    query: params.get('q') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    sort: params.get('sort') === 'old' ? 'old' : 'new',
  };
  const update = (patch: Partial<MeetingListFilters>) => {
    const next = { ...filters, ...patch };
    const search = new URLSearchParams();
    if (next.query) search.set('q', next.query);
    if (next.from) search.set('from', next.from);
    if (next.to) search.set('to', next.to);
    if (next.sort === 'old') search.set('sort', 'old');
    setParams(search, { replace: true });
  };
  return { filters, update, search: params.toString() };
}

export function MeetingsPage() {
  const navigate = useNavigate();
  return (
    <AppShell
      title="회의록"
      account={<SidebarAccount />}
      actions={
        <>
          <span className="hidden tablet:flex">
            <Button shape="pill" icon={Plus} onClick={() => navigate('/meetings/new')}>
              새 회의
            </Button>
          </span>
          <span className="tablet-lg:hidden">
            <AccountButton />
          </span>
        </>
      }
    >
      <MeetingsBody />
      {/* 휴대폰: 새 회의를 탭 바 위에 고정 (낮은 화면은 본문 끝) */}
      <div className="h-20 tablet:hidden short:hidden" aria-hidden="true" />
      <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-safe tablet:hidden short:static short:mt-4 short:px-0 short:pb-0">
        <div className="mb-20 short:mb-0">
          <Button variant="hero" icon={Mic} className="w-full" onClick={() => navigate('/meetings/new')}>
            새 회의
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

function MeetingsBody() {
  const toast = useToast();
  const { filters, update, search } = useListFilters();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [periodOpen, setPeriodOpen] = useState(false);

  useEffect(() => {
    let live = true;
    listMeetings()
      .then((items) => live && setLoad({ status: 'ready', data: items }))
      .catch(() => {
        if (!live) return;
        // 이미 보이는 목록이 있으면 그대로 두고 알리기만 한다
        setLoad((current) => (current.status === 'ready' ? current : { status: 'error' }));
        if (attempt > 0) toast({ message: '회의 목록을 불러오지 못했습니다', tone: 'danger' });
      });
    return () => {
      live = false;
    };
  }, [attempt, toast]);

  const invalidRange = hasInvalidDateRange(filters.from, filters.to);
  // 최대 100건이라 그릴 때마다 거르고 정렬해도 충분하다
  const visible = load.status === 'ready' ? sortMeetings(filterMeetings(load.data, filters), filters.sort) : [];
  const hasPeriod = Boolean(filters.from || filters.to);
  const filtered = Boolean(filters.query || hasPeriod);
  const period = hasPeriod ? `${formatChipDate(filters.from)} ~ ${formatChipDate(filters.to)}` : '';
  const newest = filters.sort === 'new';

  const setDate = (patch: { from?: string; to?: string }) => {
    const next = { from: patch.from ?? filters.from, to: patch.to ?? filters.to };
    if (hasInvalidDateRange(next.from, next.to)) toast({ message: '시작일이 종료일보다 늦습니다', tone: 'danger' });
    update(patch);
  };
  const reset = () => update({ query: '', from: '', to: '' });

  return (
    <div className="flex flex-col gap-4 tablet:gap-6">
      {/* 위쪽: 넓은 검색창 + 원형 버튼(기간·정렬·초기화) */}
      <div role="search" aria-label="회의 검색 조건" className="flex items-center gap-2 tablet:gap-3">
        <TextField
          label="회의 검색"
          hideLabel
          type="search"
          shape="pill"
          icon={Search}
          placeholder="회의명 또는 참석자"
          value={filters.query}
          onChange={(event) => update({ query: event.target.value })}
          className="min-w-0 flex-1"
          inside={filters.query && <IconButton icon={X} label="검색어 지우기" onClick={() => update({ query: '' })} />}
        />
        <div className="flex shrink-0 items-center gap-2 tablet:gap-3">
          <RoundButton
            icon={CalendarDays}
            label={hasPeriod ? `기간 ${period}` : '기간'}
            selected={hasPeriod}
            invalid={invalidRange}
            haspopup
            onClick={() => setPeriodOpen(true)}
          />
          <RoundButton
            icon={newest ? ArrowDownWideNarrow : ArrowUpNarrowWide}
            label={`정렬: ${newest ? '최신순' : '오래된순'}`}
            selected={!newest}
            onClick={() => update({ sort: newest ? 'old' : 'new' })}
          />
          {filtered && <RoundButton icon={RotateCcw} label="조건 초기화" selected={false} onClick={reset} />}
        </div>
      </div>
      <Dialog
        open={periodOpen}
        onOpenChange={setPeriodOpen}
        title="기간"
        footer={
          <>
            <Button variant="secondary" shape="pill" disabled={!hasPeriod} onClick={() => update({ from: '', to: '' })}>
              초기화
            </Button>
            <Button shape="pill" onClick={() => setPeriodOpen(false)}>
              확인
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <DateField label="시작일" value={filters.from} invalid={invalidRange} onChange={(from) => setDate({ from })} />
          <DateField label="종료일" value={filters.to} invalid={invalidRange} onChange={(to) => setDate({ to })} />
        </div>
      </Dialog>

      <section aria-label="회의 목록" className="flex flex-col gap-3">
        <ProcessingFailures />
        {load.status === 'loading' && <ListSkeleton />}
        {load.status === 'error' && (
          <Card className="flex flex-col items-start gap-4 tablet:flex-row tablet:items-center">
            <p className="flex-1 text-body text-text">회의 목록을 불러오지 못했습니다</p>
            <Button variant="secondary" shape="pill" icon={RefreshCw} onClick={() => setAttempt((value) => value + 1)}>
              다시 시도
            </Button>
          </Card>
        )}
        {load.status === 'ready' && load.data.length === 0 && (
          <Card className="py-10 text-center text-body text-text-muted">회의 기록이 없습니다</Card>
        )}
        {load.status === 'ready' && load.data.length > 0 && (
          <>
            <p aria-live="polite" className="px-1 text-caption text-text-muted tabular-nums">
              총 {visible.length}건{period && ` · ${period}`}
            </p>
            {visible.length === 0 ? (
              <Card className="flex flex-col items-center gap-4 py-10">
                <p className="text-body text-text-muted">검색 결과 없음</p>
                <Button size="sm" variant="secondary" shape="pill" icon={RotateCcw} onClick={reset}>
                  조건 초기화
                </Button>
              </Card>
            ) : (
              <MeetingRows meetings={visible} listSearch={search} />
            )}
          </>
        )}
      </section>
    </div>
  );
}

/**
 * 회의 목록. 행 전체가 상세 링크다.
 * 휴대폰: 2줄 행 72(회의명 / 일시 · 참석자). 태블릿 이상: 한 줄 행 60에 회의명 | 일시 | 참석자를 가로로 늘어놓고 위에 열 이름을 둔다
 */
function MeetingRows({ meetings, listSearch }: { meetings: readonly MeetingSummary[]; listSearch: string }) {
  return (
    <Card as="div" padding="none" className="overflow-hidden">
      {/* 열 이름 (보기용). 행마다 같은 순서라 화면 읽기 프로그램은 행 내용만 읽는다 */}
      <div aria-hidden="true" className="hidden h-12 items-center gap-4 border-b border-border bg-bg-subtle px-5 text-caption text-text-muted tablet:flex">
        <span className="min-w-0 flex-1">회의명</span>
        <span className="w-36 shrink-0">일시</span>
        <span className="w-48 shrink-0 tablet-lg:w-72">참석자</span>
        <span className="w-6 shrink-0" />
      </div>
      <ul aria-label="회의록">
        {meetings.map((meeting) => {
          const people = participantSummary(meeting.participants);
          const when = formatMeetingAt(meeting.meetingAt);
          return (
            <li key={meeting.documentId} className="border-b border-border last:border-b-0">
              <Link
                to={`/meetings/${encodeURIComponent(meeting.documentId)}`}
                state={{ listSearch }}
                className="flex min-h-18 items-center gap-3 px-4 py-3 active:bg-selected tablet:min-h-15 tablet:gap-4 tablet:px-5"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1 tablet:flex-row tablet:items-center tablet:gap-4">
                  <span className="truncate text-label text-text tablet:min-w-0 tablet:flex-1">{meeting.title}</span>
                  {/* 휴대폰: 둘째 줄 "일시 · 참석자" */}
                  <span className="truncate text-caption text-text-muted tablet:hidden">
                    <span className="tabular-nums">{when}</span>
                    {people && ` · ${people}`}
                  </span>
                  {/* 태블릿 이상: 열 */}
                  <span className="hidden w-36 shrink-0 text-body text-text-muted tabular-nums tablet:block">{when}</span>
                  <span className="hidden w-48 shrink-0 truncate text-body text-text-muted tablet:block tablet-lg:w-72">{people || '-'}</span>
                </span>
                <Icon icon={ChevronRight} size="lg" className="shrink-0 text-text-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <Card as="div" padding="none" aria-busy="true" aria-label="회의 목록 불러오는 중">
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="flex h-18 flex-col justify-center gap-2 border-b border-border px-4 last:border-b-0 tablet:h-15 tablet:flex-row tablet:items-center tablet:gap-4 tablet:px-5">
          <span className="h-3 w-1/2 animate-pulse rounded-full bg-bg-subtle motion-reduce:animate-none tablet:w-auto tablet:flex-1" />
          <span className="h-3 w-1/3 animate-pulse rounded-full bg-bg-subtle motion-reduce:animate-none tablet:w-36" />
        </div>
      ))}
    </Card>
  );
}

/** 원형 아이콘 버튼 (검색창과 같은 높이 48, 태블릿 52). 조건이 적용되면 선택 색 */
function RoundButton({
  icon,
  label,
  selected,
  invalid = false,
  haspopup = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  selected: boolean;
  invalid?: boolean;
  haspopup?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-haspopup={haspopup ? 'dialog' : undefined}
      onClick={onClick}
      className={cn(
        'inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full border shadow-card tablet:size-13',
        selected ? 'border-primary bg-selected text-selected-text' : 'border-border bg-bg text-text active:bg-bg-subtle',
        invalid && 'border-danger',
      )}
    >
      <Icon icon={icon} size="lg" />
    </button>
  );
}
