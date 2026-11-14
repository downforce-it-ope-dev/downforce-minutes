import { useMemo, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import type { Participant } from '../participantsApi';
import { Button, Card, Checkbox, cn, FilterChips, IconButton, TextField } from '../ui';

type View = 'all' | 'selected';

export interface ParticipantPickerProps {
  participants: readonly Participant[];
  selectedIds: readonly string[];
  /** 로그인한 사람. 늘 선택돼 있고 해제할 수 없다 */
  selfId: string | null;
  status: 'loading' | 'ready' | 'error';
  invalid?: boolean;
  onToggle: (id: string) => void;
  onSetMany: (ids: string[], select: boolean) => void;
  /** 머리 오른쪽 동작 (새 참석자 등록 열기) */
  action?: ReactNode;
  className?: string;
  /** 큰 태블릿에서도 한 단으로(옆에 새 참석자 패널이 열려 폭이 좁을 때) */
  singleColumn?: boolean;
}

const collator = new Intl.Collator('ko');

/**
 * 참석자 선택 영역 (MTG-01-F04, 기획 3.1 표).
 * 머리(제목·선택 수·검색·보기 필터)는 고정하고 태블릿에서는 목록만 따로 스크롤한다. 휴대폰은 페이지 스크롤.
 * 검색어를 바꿔도 선택은 유지한다. 선택한 참석자를 앞쪽에 두고, 선택한 사람끼리·안 한 사람끼리는 이름 가나다순이다(사용자 결정 2026-11-12).
 * 새 참석자 등록은 화면(NewMeetingPage)이 오른쪽 패널·대화상자로 붙인다. 부서가 있으면 이름 옆에 보이고 검색에도 쓴다(Backend 9611cbc).
 */
export function ParticipantPicker({
  participants,
  selectedIds,
  selfId,
  status,
  invalid = false,
  onToggle,
  onSetMany,
  action,
  className,
  singleColumn = false,
}: ParticipantPickerProps) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('all');

  const sorted = useMemo(() => {
    const chosen = new Set(selectedIds);
    return [...participants].sort((a, b) => Number(chosen.has(b.id)) - Number(chosen.has(a.id)) || collator.compare(a.name, b.name));
  }, [participants, selectedIds]);
  const keyword = query.trim().toLowerCase();
  const visible = sorted.filter(
    (item) =>
      (view === 'all' || selectedIds.includes(item.id)) &&
      (!keyword || [item.name, item.email, item.department ?? ''].some((value) => value.toLowerCase().includes(keyword))),
  );
  const visibleIds = visible.map(({ id }) => id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const selectedCount = selectedIds.length;

  return (
    <Card
      as="section"
      padding="none"
      aria-labelledby="participant-picker-title"
      className={cn('flex flex-col overflow-hidden', invalid && 'outline-2 outline-danger', className)}
    >
      <div className="flex flex-col gap-3 px-4 pt-4 tablet:px-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="participant-picker-title" className="text-title text-text">
            참석자
          </h2>
          <div className="flex items-center gap-3">
            <p aria-live="polite" className="text-label text-brand-text tabular-nums">
              {selectedCount}명 선택됨
            </p>
            {action}
          </div>
        </div>
        <div className={cn('flex flex-col gap-3', !singleColumn && 'tablet-lg:flex-row tablet-lg:items-center')}>
          <TextField
            label="참석자 검색"
            hideLabel
            type="search"
            icon={Search}
            placeholder={participants.some(({ department }) => department?.trim()) ? '이름·이메일·부서' : '이름·이메일'}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={status !== 'ready'}
            className="min-w-0 flex-1"
            trailing={
              query && <IconButton icon={X} label="검색어 지우기" variant="surface" onClick={() => setQuery('')} />
            }
          />
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-2">
            <FilterChips
              label="보기"
              value={view}
              onChange={setView}
              options={[
                { value: 'all', label: '전체', count: participants.length },
                { value: 'selected', label: '선택됨', count: selectedCount },
              ]}
            />
            <div className="flex items-center gap-2">
              {/* 검색어가 있을 때만: 전체 명단을 한 번에 고르는 실수를 막는다 */}
              {keyword && visibleIds.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => onSetMany(visibleIds, !allVisibleSelected)}>
                  {allVisibleSelected ? '선택 해제' : '전체 선택'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-b-xl border-t border-border tablet:min-h-0 tablet:flex-1 tablet:overflow-y-auto">
        {status === 'loading' && participants.length === 0 ? (
          <ul aria-label="참석자 목록" aria-busy="true" className="flex flex-col gap-1 p-2">
            {[0, 1, 2, 3, 4].map((row) => (
              <li key={row} className="flex h-15 items-center gap-3 px-3">
                <span className="size-6 rounded-sm bg-bg-subtle" />
                <span className="h-3 w-1/3 rounded-full bg-bg-subtle" />
              </li>
            ))}
          </ul>
        ) : status === 'ready' && participants.length === 0 ? (
          <div className="flex flex-col items-center gap-4 px-4 py-10">
            <p className="text-body text-text-muted">등록된 참석자가 없습니다.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10">
            <p className="text-body text-text-muted">검색 결과 없음</p>
            {query && (
              <Button size="sm" variant="secondary" shape="pill" onClick={() => setQuery('')}>
                검색어 지우기
              </Button>
            )}
          </div>
        ) : (
          <ul aria-label="참석자 목록" className={cn('flex flex-col gap-1 p-2', !singleColumn && 'tablet-lg:block tablet-lg:columns-2 tablet-lg:gap-x-2')}>
            {/* 큰 태블릿: 가나다순을 위에서 아래로 두 단에 나눠 한 번에 두 배를 보인다 */}
            {visible.map((item) => {
              const checked = selectedIds.includes(item.id);
              const self = item.id === selfId;
              const department = item.department?.trim();
              return (
                <li key={item.id} className="tablet-lg:mb-1 tablet-lg:break-inside-avoid">
                  <label
                    className={cn(
                      'flex min-h-17 items-center gap-3 rounded-md px-3 tablet:min-h-14',
                      self ? 'cursor-default' : 'cursor-pointer active:bg-bg-subtle',
                      checked && 'bg-selected',
                    )}
                  >
                    <Checkbox
                      aria-label={`${item.name}${self ? ' (나)' : ''}${department ? ` ${department}` : ''} ${item.email}`}
                      checked={checked}
                      disabled={self || status !== 'ready'}
                      onChange={() => onToggle(item.id)}
                    />
                    <span className="flex min-w-0 flex-1 flex-col tablet:flex-row tablet:items-center tablet:gap-3">
                      <span className="flex items-center gap-2 text-body font-semibold text-text">
                        {item.name}
                        {self && <span className="rounded-full bg-brand-soft px-2 text-caption text-brand-soft-text">나</span>}
                        {department && <span className="rounded-sm bg-accent-soft px-2 text-caption font-normal text-accent-soft-text">{department}</span>}
                      </span>
                      <span className="truncate text-caption text-text-muted">{item.email}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

    </Card>
  );
}
