import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  /** 탭 이름 옆 작은 배지 (예: 미지정 화자 수) */
  badge?: ReactNode;
  /** badge를 화면 읽기 프로그램이 읽을 문구 */
  badgeLabel?: string;
  content: ReactNode;
}

export interface TabsProps<T extends string> {
  /** 탭 목록 이름 (화면 읽기 프로그램용) */
  label: string;
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** 탭 내용 영역 클래스 (예: 따로 스크롤) */
  panelClassName?: string;
}

/**
 * 탭 (MTG-04 3.2 태블릿 가로 오른쪽 패널 "화자 매핑 / 전사 원문").
 * 탭 높이 48, 고른 탭은 selected 면 + 아래 주 색 선. WAI-ARIA tabs: 방향키로 이동하며 바로 고르고, Tab은 고른 탭 → 내용으로 간다.
 */
export function Tabs<T extends string>({ label, items, value, onChange, className, panelClassName }: TabsProps<T>) {
  const baseId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = items.find((item) => item.value === value) ?? items[0];

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = items.length - 1;
    const next =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
        : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
          : event.key === 'Home' ? 0
            : event.key === 'End' ? last
              : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(items[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div role="tablist" aria-label={label} className="flex shrink-0 gap-1 border-b border-border">
        {items.map((item, index) => {
          const selected = item.value === current?.value;
          return (
            <button
              key={item.value}
              ref={(element) => {
                refs.current[index] = element;
              }}
              id={`${baseId}-tab-${item.value}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.value}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                '-mb-px inline-flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-t-md border-b-2 px-4 text-label',
                selected ? 'border-primary bg-selected text-selected-text' : 'border-transparent text-text-muted active:bg-bg-subtle',
              )}
            >
              {item.label}
              {item.badge !== undefined && (
                <span className="inline-flex min-w-6 items-center justify-center gap-1 rounded-full bg-warning-soft px-2 text-caption text-warning-text tabular-nums">
                  <span aria-hidden="true">{item.badge}</span>
                  {item.badgeLabel && <span className="sr-only">{item.badgeLabel}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {current && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${current.value}`}
          aria-labelledby={`${baseId}-tab-${current.value}`}
          tabIndex={0}
          className={cn('min-h-0 flex-1', panelClassName)}
        >
          {current.content}
        </div>
      )}
    </div>
  );
}
