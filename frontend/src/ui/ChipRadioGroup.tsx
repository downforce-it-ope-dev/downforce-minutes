import { useRef, type KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export interface ChipRadioOption {
  /** 빈 문자열은 "고르지 않음"(예: 미지정) */
  value: string;
  label: string;
  /** 칩 안 작은 표시 (예: "· B" 다른 화자에 지정됨) */
  hint?: string;
  /** hint를 화면 읽기 프로그램이 읽을 문구 (예: "화자 B에 지정됨") */
  hintLabel?: string;
}

export interface ChipRadioGroupProps {
  /** 그룹 이름 (화면 읽기 프로그램용, 예: "화자 A의 참석자") */
  label: string;
  options: readonly ChipRadioOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * 칩으로 하나 고르기 (MTG-04 3.7 화자 매핑 참석자 칩).
 * - 칩 보이는 높이 40, 누르는 영역 48, 칩 사이 8, 폭에 맞춰 줄바꿈
 * - 선택: 주 색 면 + 흰 글자 + 체크 아이콘(색 + 아이콘으로 구분). 기본: 흰 면 + 입력란 테두리
 * - radiogroup: 방향키로 이동·선택, Tab은 고른 칩 하나에만 멈춘다(라디오 그룹 표준)
 */
export function ChipRadioGroup({ label, options, value, onChange, disabled = false, className }: ChipRadioGroupProps) {
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
    <div role="radiogroup" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value || '__none'}
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
              'relative inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-label whitespace-nowrap before:absolute before:inset-x-0 before:-inset-y-1',
              'disabled:cursor-not-allowed disabled:opacity-60',
              selected ? 'border-primary bg-primary text-white' : 'border-border-input bg-bg text-text active:bg-bg-subtle',
            )}
          >
            {selected && <Icon icon={Check} size="sm" />}
            <span>{option.label}</span>
            {option.hint && (
              <span className={cn('text-caption', selected ? 'text-white' : 'text-text-muted')}>
                <span aria-hidden="true">{option.hint}</span>
                {option.hintLabel && <span className="sr-only">, {option.hintLabel}</span>}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
