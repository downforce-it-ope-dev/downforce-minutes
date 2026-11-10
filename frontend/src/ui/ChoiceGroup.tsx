import { useId, useRef, type KeyboardEvent } from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

export interface ChoiceGroupProps<T extends string> {
  /** 묶음 이름표 (화면에 보인다) */
  label: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}

/**
 * 버튼으로 하나를 고르는 선택 (MTG-01 회의록 템플릿). 선택 상자 대신 눌러서 바로 고른다.
 * 높이 56(누르는 영역 48 이상). 고른 버튼은 주 색 테두리 + 선택 면 + 체크 아이콘으로, 색만으로 구분하지 않는다.
 * radiogroup: 방향키로 이동하며 고르고, Tab은 고른 버튼 하나에만 멈춘다.
 */
export function ChoiceGroup<T extends string>({ label, options, value, onChange, disabled = false, invalid = false, className }: ChoiceGroupProps<T>) {
  const labelId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = Math.max(0, options.findIndex((option) => option.value === value));

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span id={labelId} className="text-label text-text">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} aria-invalid={invalid || undefined} className="flex flex-wrap gap-2">
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              ref={(element) => {
                refs.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={index === current ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                'inline-flex h-14 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 text-label whitespace-nowrap',
                'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500',
                selected ? 'border-2 border-primary bg-selected text-selected-text' : 'border-border-input bg-bg text-text active:bg-bg-subtle',
                invalid && !selected && 'border-danger',
              )}
            >
              <Icon icon={selected ? Check : (option.icon ?? Check)} size="md" className={cn(!selected && !option.icon && 'invisible')} />
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
