import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import { cn } from './cn';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { parseDateValue, toDateValue } from './dateValue';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const longFormat = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
const monthFormat = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' });

export interface DateFieldProps {
  label: string;
  /** 'YYYY-MM-DD' */
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * 날짜 선택 (MTG-01 회의 날짜). 기기 기본 날짜 입력은 태블릿에서 달력이 작아, 큰 달력 대화상자로 고른다.
 * - 입력란 모양 버튼(높이 56): "2026년 11월 10일 (화)" + 오늘이면 "오늘" 표시
 * - 달력: 날짜 칸 48(태블릿 56), 이전·다음 달 48, 오늘 테두리, 고른 날 주 색 면
 * - 키보드: 방향키 하루·한 주 이동, PageUp/PageDown 한 달, Enter로 고름
 */
export function DateField({ label, value, onChange, invalid = false, disabled = false, className }: DateFieldProps) {
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const selected = parseDateValue(value);
  const today = toDateValue(new Date());

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span id={labelId} className="text-label text-text">
        {label}
      </span>
      <button
        type="button"
        aria-labelledby={labelId}
        aria-describedby={`${labelId}-value`}
        aria-haspopup="dialog"
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-14 w-full cursor-pointer items-center gap-3 rounded-md border bg-bg px-4 text-left text-body-lg text-text',
          'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500',
          invalid ? 'border-danger' : 'border-border-input',
        )}
      >
        <Icon icon={CalendarDays} size="lg" className="shrink-0 text-brand-text" />
        <span id={`${labelId}-value`} className="min-w-0 flex-1 truncate tabular-nums">
          {selected ? longFormat.format(selected) : '날짜 선택'}
        </span>
        {value === today && <span className="shrink-0 rounded-full bg-brand-soft px-3 py-1 text-caption text-brand-soft-text">오늘</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen} title={label}>
        {open && (
          <MonthCalendar
            value={value}
            today={today}
            onSelect={(next) => {
              onChange(next);
              setOpen(false);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addMonths(date: Date, months: number) {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), last));
}

function MonthCalendar({ value, today, onSelect }: { value: string; today: string; onSelect: (value: string) => void }) {
  const initial = parseDateValue(value) ?? parseDateValue(today) ?? new Date();
  const [focus, setFocus] = useState(initial);
  const gridRef = useRef<HTMLDivElement>(null);

  const first = new Date(focus.getFullYear(), focus.getMonth(), 1);
  const daysInMonth = new Date(focus.getFullYear(), focus.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => new Date(focus.getFullYear(), focus.getMonth(), index + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));

  function move(next: Date) {
    setFocus(next);
    // 다시 그린 뒤 새 날짜 칸으로 초점을 옮긴다
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${toDateValue(next)}"]`)?.focus());
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: Date) {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(date, -1),
      ArrowRight: () => addDays(date, 1),
      ArrowUp: () => addDays(date, -7),
      ArrowDown: () => addDays(date, 7),
      PageUp: () => addMonths(date, -1),
      PageDown: () => addMonths(date, 1),
    };
    const next = moves[event.key];
    if (!next) return;
    event.preventDefault();
    move(next());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <IconButton icon={ChevronLeft} label="이전 달" variant="surface" onClick={() => setFocus(addMonths(focus, -1))} />
        <p aria-live="polite" className="text-title text-text tabular-nums">
          {monthFormat.format(focus)}
        </p>
        <IconButton icon={ChevronRight} label="다음 달" variant="surface" onClick={() => setFocus(addMonths(focus, 1))} />
      </div>
      <div ref={gridRef} role="grid" aria-label={monthFormat.format(focus)} className="flex flex-col gap-1">
        <div role="row" className="grid grid-cols-7">
          {WEEKDAYS.map((day, index) => (
            <span
              key={day}
              role="columnheader"
              className={cn('flex h-8 items-center justify-center text-caption', index === 0 ? 'text-danger-text' : 'text-text-muted')}
            >
              {day}
            </span>
          ))}
        </div>
        {weeks.map((week, row) => (
          <div key={row} role="row" className="grid grid-cols-7 gap-1">
            {week.map((date, column) => {
              if (!date) return <span key={column} role="gridcell" />;
              const key = toDateValue(date);
              const isSelected = key === value;
              const isToday = key === today;
              const isFocus = key === toDateValue(focus);
              return (
                <span key={column} role="gridcell" className="flex justify-center">
                  <button
                    type="button"
                    data-date={key}
                    tabIndex={isFocus ? 0 : -1}
                    aria-label={longFormat.format(date)}
                    aria-pressed={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    onClick={() => onSelect(key)}
                    onKeyDown={(event) => handleKeyDown(event, date)}
                    className={cn(
                      'flex size-12 cursor-pointer items-center justify-center rounded-full text-body-lg tabular-nums tablet:size-14',
                      isSelected
                        ? 'bg-primary font-bold text-white'
                        : cn('active:bg-bg-subtle', column === 0 ? 'text-danger-text' : 'text-text', isToday && 'border-2 border-primary font-bold'),
                    )}
                  >
                    {date.getDate()}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <Button variant="secondary" size="lg" shape="pill" fullWidth onClick={() => onSelect(today)}>
        오늘
      </Button>
    </div>
  );
}
