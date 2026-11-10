import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AsyncState } from './components/async-state/AsyncState';
import { normalizeApiError, type SafeApiError } from './lib/api/normalizeApiError';
import { listMeetings, MeetingListApiError, type MeetingSummary } from './meetingListApi';
import { filterMeetings, hasInvalidDateRange, type MeetingFilters } from './meetingFilters';
import { ProcessingFailureList } from './ProcessingFailureList';

type ListResult =
  | { status: 'loading' }
  | { status: 'ready'; data: MeetingSummary[]; loadedAttempt: number; warning?: SafeApiError }
  | { status: 'error'; error: SafeApiError };

function formatMeetingDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '날짜 정보 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function participantSummary(meeting: MeetingSummary, showNames: boolean): string {
  if (!showNames) return `참석자 ${meeting.participants.length}명`;
  const names = meeting.participants.slice(0, 3).map(({ name }) => name);
  if (meeting.participants.length > 3) names.push(`외 ${meeting.participants.length - 3}명`);
  return names.length ? names.join(', ') : '참석자 정보 없음';
}

function MeetingRows({ meetings, showParticipantNames, linkRows = false, separateParticipantLine = false }: { meetings: MeetingSummary[]; showParticipantNames: boolean; linkRows?: boolean; separateParticipantLine?: boolean }) {
  const navigate = useNavigate();
  return (
    <ul className="meeting-summary-list">
      {meetings.map((meeting) => (
        <li className="meeting-summary-row" key={meeting.documentId}>
          {linkRows ? <button className="meeting-summary-button" type="button" aria-label={`${meeting.title} 상세 보기`}
            onClick={() => navigate(`/meetings/${encodeURIComponent(meeting.documentId)}`)}>
            <span className="meeting-summary-copy"><h3>{meeting.title}</h3><span className="meeting-summary-meta"><time>{formatMeetingDate(meeting.meetingAt)}</time>{!separateParticipantLine && <><span aria-hidden="true">·</span><span>{participantSummary(meeting, showParticipantNames)}</span></>}</span>{separateParticipantLine && <span className="meeting-summary-participants">{participantSummary(meeting, showParticipantNames)}</span>}</span>
            <span className="meeting-summary-arrow" aria-hidden="true">›</span>
          </button> : <><h3>{meeting.title}</h3><p>{formatMeetingDate(meeting.meetingAt)}</p><p>{participantSummary(meeting, showParticipantNames)}</p></>}
        </li>
      ))}
    </ul>
  );
}

function MeetingList({ limit, emptyMessage, enableFilters = false, quietEmpty = false, linkRows = false, showRecentParticipantNames = false }: { limit?: number; emptyMessage: string; enableFilters?: boolean; quietEmpty?: boolean; linkRows?: boolean; showRecentParticipantNames?: boolean }) {
  const [result, setResult] = useState<ListResult>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState<MeetingFilters>({ query: '', from: '', to: '' });
  const [appliedFilters, setAppliedFilters] = useState<MeetingFilters>({ query: '', from: '', to: '' });
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const retry = () => setAttempt((value) => value + 1);

  useEffect(() => {
    let active = true;
    void listMeetings(limit).then((items) => {
      if (!active) return;
      setResult({ status: 'ready', data: items, loadedAttempt: attempt });
    }).catch((reason: unknown) => {
      if (!active) return;
      const safeError = reason instanceof MeetingListApiError ? reason.safe : normalizeApiError(null);
      setResult((current) => current.status === 'ready'
        ? { status: 'ready', data: current.data, loadedAttempt: attempt, warning: safeError }
        : { status: 'error', error: safeError });
    });
    return () => { active = false; };
  }, [limit, attempt]);

  const refreshing = result.status === 'ready' && result.loadedAttempt < attempt;

  const visibleMeetings = useMemo(() => result.status === 'ready'
    ? (enableFilters ? filterMeetings(result.data, appliedFilters) : result.data).slice(0, limit ?? 100)
    : [], [enableFilters, appliedFilters, limit, result]);

  if (result.status === 'loading') return <AsyncState state={{ status: 'loading', label: '회의 목록을 불러오는 중…', fullPage: enableFilters }} renderReady={() => null} />;
  if (result.status === 'error') return <AsyncState state={{ status: 'error', title: '회의 목록을 불러오지 못했습니다.', error: result.error, onRetry: retry }} renderReady={() => null} />;
  if (result.data.length === 0) return <AsyncState state={{
    status: 'empty', title: emptyMessage,
    visual: quietEmpty ? <img className="empty-meetings-icon" src="/assets/empty-meetings.svg" alt="회의 기록 없음" /> : undefined,
    visuallyHideTitle: quietEmpty,
  }} renderReady={() => null} />;
  if (!enableFilters) return <AsyncState state={{ status: 'ready', data: visibleMeetings, refreshing, warning: result.warning, onRetry: retry }} renderReady={(items) => <MeetingRows meetings={items} showParticipantNames={limit === undefined || showRecentParticipantNames} linkRows={linkRows} separateParticipantLine={showRecentParticipantNames} />} />;
  const invalidRange = hasInvalidDateRange(filters.from, filters.to);
  return (
    <AsyncState state={{ status: 'ready', data: visibleMeetings, refreshing, warning: result.warning, onRetry: retry }} renderReady={(items) => <>
      <section className="meeting-filter-shell" aria-label="회의 검색 조건">
        <form className="meeting-filters" aria-label="회의 필터" onSubmit={(event) => { event.preventDefault(); setAppliedFilters(filters); }}>
          <label className="meeting-search-field"><span className="visually-hidden">회의 검색</span><span className="meeting-search-control">
            <input type="search" aria-label="회의 검색" value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              onBlur={() => setAppliedFilters((current) => ({ ...current, query: filters.query }))}
              placeholder="회의명 또는 참석자" />
            <button className="meeting-search-clear" type="button" aria-label="검색어 초기화" title="검색어 초기화" disabled={!filters.query}
              onClick={() => { setFilters((current) => ({ ...current, query: '' })); setAppliedFilters((current) => ({ ...current, query: '' })); }}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8" /></svg>
            </button>
          </span></label>
          <div className="meeting-filter-details-row">
            <button className="meeting-filter-toggle" type="button" aria-expanded={filtersExpanded}
              onClick={() => setFiltersExpanded((expanded) => !expanded)}>
              상세 조건<svg viewBox="0 0 20 20" aria-hidden="true"><path d={filtersExpanded ? 'm5 12 5-5 5 5' : 'm5 8 5 5 5-5'} /></svg>
            </button>
          </div>
          {filtersExpanded && <fieldset className="meeting-date-range" aria-describedby={invalidRange ? 'meeting-date-error' : undefined}>
            <legend>검색 기간</legend>
            <label><span>시작일</span><input type="date" aria-label="시작일" value={filters.from}
              onChange={(event) => { const from = event.target.value; setFilters((current) => ({ ...current, from })); setAppliedFilters((current) => ({ ...current, from })); }} aria-invalid={invalidRange} /></label>
            <span className="meeting-date-separator" aria-hidden="true">~</span>
            <label><span>종료일</span><input type="date" aria-label="종료일" value={filters.to}
              onChange={(event) => { const to = event.target.value; setFilters((current) => ({ ...current, to })); setAppliedFilters((current) => ({ ...current, to })); }} aria-invalid={invalidRange} /></label>
          </fieldset>}
          {invalidRange && <p id="meeting-date-error" className="field-error" role="alert">시작일은 종료일보다 늦을 수 없습니다. 날짜 범위는 적용하지 않았습니다.</p>}
        </form>
      </section>
      <p className="meeting-result-count">총 {items.length}건</p>
      {items.length === 0 ? (
        <div className="state-card empty-card"><p>검색 결과가 없습니다.</p></div>
      ) : <MeetingRows meetings={items} showParticipantNames linkRows />}
    </>} />
  );
}

export function MeetingsPage() {
  const navigate = useNavigate();
  return (
    <main className="meetings-page page-scroll-layout">
      <header className="meetings-heading">
        <h1><svg className="meetings-heading-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 6h11M9 12h11M9 18h11" />
          <path d="M4 6h.01M4 12h.01M4 18h.01" />
        </svg>회의 기록</h1>
      </header>
      <div className="meetings-list-viewport page-scroll-content">
        <ProcessingFailureList />
        <MeetingList emptyMessage="회의 기록이 없습니다. 회의를 완료하면 여기에 표시됩니다." enableFilters quietEmpty />
      </div>
      <div className="meetings-create-dock"><button className="button button-primary" type="button" onClick={() => navigate('/meetings/new')}>새 회의 시작</button></div>
    </main>
  );
}

export { MeetingList };
