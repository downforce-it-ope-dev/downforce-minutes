import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowDownUp, CalendarDays, ChevronRight, Mic, Plus, RefreshCw, RotateCcw, Search, X } from 'lucide-react';
import { AccountButton, SidebarAccount } from '../auth/AccountMenu';
import { filterMeetings, hasInvalidDateRange } from '../meetingFilters';
import { listMeetings, type MeetingSummary } from '../meetingListApi';
import {
  AppShell,
  Button,
  Card,
  ChoiceGroup,
  cn,
  DateField,
  Dialog,
  Icon,
  IconButton,
  TABLET_LG_QUERY,
  TextField,
  useMediaQuery,
  useToast,
} from '../ui';
import { formatChipDate, formatMeetingAt, participantSummary } from './meetingFormat';
import { sortMeetings } from './meetingView';
import { ProcessingFailures } from './ProcessingFailures';

/*
 * MIN-01 회의록 목록 (GitHub #32, docs/renewal/화면기획/MIN-01_회의록목록.md).
 * - 검색(회의명·참석자)은 입력하는 즉시 화면 안에서 거른다. 서버 목록은 최대 100건(API-017)
 * - 기간·정렬: 큰 태블릿은 왼쪽 필터 단(280)에 늘 보이고, 그보다 작으면 "기간"·정렬 칩으로 접는다
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

const SORT_OPTIONS = [
  { value: 'new', label: '최신순' },
  { value: 'old', label: '오래된순' },
] as const;

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
      fillHeight="tablet-lg"
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
  const wide = useMediaQuery(TABLET_LG_QUERY);

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
  const filtered = Boolean(filters.query || filters.from || filters.to);

  const setDate = (patch: { from?: string; to?: string }) => {
    const next = { from: patch.from ?? filters.from, to: patch.to ?? filters.to };
    if (hasInvalidDateRange(next.from, next.to)) toast({ message: '시작일이 종료일보다 늦습니다', tone: 'danger' });
    update(patch);
  };
  const reset = () => update({ query: '', from: '', to: '' });

  const searchField = (
    <TextField
      label="회의 검색"
      hideLabel
      type="search"
      icon={Search}
      placeholder="회의명 또는 참석자"
      value={filters.query}
      onChange={(event) => update({ query: event.target.value })}
      trailing={filters.query && <IconButton icon={X} label="검색어 지우기" variant="surface" onClick={() => update({ query: '' })} />}
    />
  );
  const dateFields = (
    <>
      <DateField label="시작일" value={filters.from} invalid={invalidRange} onChange={(from) => setDate({ from })} />
      <DateField label="종료일" value={filters.to} invalid={invalidRange} onChange={(to) => setDate({ to })} />
    </>
  );
  const periodLabel = filters.from || filters.to ? `${formatChipDate(filters.from)} ~ ${formatChipDate(filters.to)}` : '기간';

  return (
    <div className="flex flex-col gap-4 tablet-lg:min-h-0 tablet-lg:flex-1 tablet-lg:flex-row tablet-lg:gap-6">
      {wide ? (
      /* 큰 태블릿: 왼쪽 필터 단(고정) */
      <aside aria-label="검색 조건" className="flex w-70 shrink-0 flex-col gap-6">
        {searchField}
        <div className="flex flex-col gap-4">{dateFields}</div>
        <ChoiceGroup label="정렬" options={SORT_OPTIONS} value={filters.sort} onChange={(sort) => update({ sort })} />
        <Button variant="secondary" shape="pill" icon={RotateCcw} disabled={!filtered} onClick={reset}>
          조건 초기화
        </Button>
      </aside>
      ) : (
      /* 그보다 작으면: 검색 + 기간·정렬 칩 */
      <div className="flex flex-col gap-3">
        {searchField}
        <div className="flex flex-wrap gap-2">
          <ChipButton icon={CalendarDays} selected={Boolean(filters.from || filters.to)} invalid={invalidRange} haspopup onClick={() => setPeriodOpen(true)}>
            <span className="tabular-nums">{periodLabel}</span>
          </ChipButton>
          <ChipButton
            icon={ArrowDownUp}
            selected={filters.sort === 'old'}
            label={`정렬: ${filters.sort === 'new' ? '최신순' : '오래된순'}`}
            onClick={() => update({ sort: filters.sort === 'new' ? 'old' : 'new' })}
          >
            {filters.sort === 'new' ? '최신순' : '오래된순'}
          </ChipButton>
        </div>
      </div>
      )}
      <Dialog
        open={periodOpen && !wide}
        onOpenChange={setPeriodOpen}
        title="기간"
        footer={
          <>
            <Button variant="secondary" shape="pill" disabled={!filters.from && !filters.to} onClick={() => update({ from: '', to: '' })}>
              초기화
            </Button>
            <Button shape="pill" onClick={() => setPeriodOpen(false)}>
              확인
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">{dateFields}</div>
      </Dialog>

      {/* 목록 단 (큰 태블릿은 따로 스크롤) */}
      <section
        aria-label="회의 목록"
        className="tablet-lg:-m-1.5 tablet-lg:min-h-0 tablet-lg:flex-1 tablet-lg:overflow-y-auto tablet-lg:p-1.5"
      >
        {/* 안쪽 묶음: 영역 높이가 정해져도 항목이 줄어들지 않고 영역이 스크롤되게 한다 */}
        <div className="flex flex-col gap-3">
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
              총 {visible.length}건
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
        </div>
      </section>
    </div>
  );
}

/** 2줄 목록 행 (태블릿 76 / 휴대폰 72). 행 전체가 상세 링크다 */
function MeetingRows({ meetings, listSearch }: { meetings: readonly MeetingSummary[]; listSearch: string }) {
  return (
    <Card as="div" padding="none" className="overflow-hidden">
      <ul aria-label="회의록">
        {meetings.map((meeting) => {
          const people = participantSummary(meeting.participants);
          return (
            <li key={meeting.documentId} className="border-b border-border last:border-b-0">
              <Link
                to={`/meetings/${encodeURIComponent(meeting.documentId)}`}
                state={{ listSearch }}
                className="flex min-h-18 items-center gap-3 px-4 py-3 active:bg-selected tablet:min-h-19 tablet:px-5"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-label text-text">{meeting.title}</span>
                  <span className="truncate text-caption text-text-muted">
                    <span className="tabular-nums">{formatMeetingAt(meeting.meetingAt)}</span>
                    {people && ` · ${people}`}
                  </span>
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
        <div key={row} className="flex h-18 flex-col border-b border-border last:border-b-0 justify-center gap-2 px-4 tablet:h-19">
          <span className="h-3 w-1/2 animate-pulse rounded-full bg-bg-subtle motion-reduce:animate-none" />
          <span className="h-3 w-1/3 animate-pulse rounded-full bg-bg-subtle motion-reduce:animate-none" />
        </div>
      ))}
    </Card>
  );
}

/** 조건 칩 (보이는 높이 40, 누르는 영역 48). 조건이 적용되면 선택 색 */
function ChipButton({
  icon,
  selected,
  invalid = false,
  haspopup = false,
  label,
  onClick,
  children,
}: {
  icon: typeof Search;
  selected: boolean;
  invalid?: boolean;
  haspopup?: boolean;
  label?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup={haspopup ? 'dialog' : undefined}
      onClick={onClick}
      className={cn(
        'relative inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-label before:absolute before:inset-x-0 before:-inset-y-1',
        selected ? 'border-primary bg-selected text-selected-text' : 'border-border bg-bg text-text active:bg-bg-subtle',
        invalid && 'border-danger',
      )}
    >
      <Icon icon={icon} size="md" />
      {children}
    </button>
  );
}
