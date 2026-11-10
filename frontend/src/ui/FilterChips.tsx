import { cn } from './cn';

export interface FilterChipOption<T extends string> {
  value: T;
  label: string;
  /** 칩 옆 개수 (고정폭 숫자) */
  count?: number;
}

export interface FilterChipsProps<T extends string> {
  /** 칩 묶음 이름 (화면 읽기 프로그램용) */
  label: string;
  options: readonly FilterChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * 보기 필터 칩 (MTG-01 "전체 n / 선택됨 n"). 하나만 고른다.
 * 보이는 높이 40, 위아래 4px씩 넓혀 누르는 영역 48. 고른 칩은 선택 면(분홍 계열) + 굵은 글자로, 색만으로 구분하지 않는다.
 */
export function FilterChips<T extends string>({ label, options, value, onChange, className }: FilterChipsProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            aria-label={option.count === undefined ? undefined : `${option.label} ${option.count}`}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-label before:absolute before:inset-x-0 before:-inset-y-1',
              selected ? 'border-primary bg-selected text-selected-text' : 'border-border bg-bg text-text active:bg-bg-subtle',
            )}
          >
            {option.label}
            {option.count !== undefined && <span className="tabular-nums">{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
