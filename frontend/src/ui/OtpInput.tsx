import { useId, useLayoutEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from './cn';

export interface OtpInputProps {
  /** 지금까지 입력한 숫자 (0~length자리) */
  value: string;
  onChange: (value: string) => void;
  /** length자리를 모두 채운 순간 한 번 부른다 */
  onComplete?: (value: string) => void;
  length?: number;
  /** 칸 묶음의 이름 (화면 읽기 프로그램용). 예: "인증 코드 6자리" */
  label: string;
  /** 오류 상태. 문구는 바깥에서 보여 주고 describedBy로 연결한다 */
  error?: boolean;
  /** 오류·안내 문구 요소의 id */
  describedBy?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

const DIGITS = /\d/g;

/**
 * 인증 코드 입력 칸 (AUTH-02, 스타일 검토 8.6: 칸 48(태블릿 52), 사이 8).
 * 숫자만 받고, 붙여넣기·자동 채우기(one-time-code)로 들어온 여러 자리는 칸에 나눠 넣는다.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  label,
  error = false,
  describedBy,
  disabled = false,
  autoFocus = false,
  className,
}: OtpInputProps) {
  const groupId = useId();
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? '');

  function focusAt(index: number) {
    const target = refs.current[Math.max(0, Math.min(length - 1, index))];
    target?.focus();
    target?.select();
  }

  // 값이 바뀐 뒤(다시 그린 뒤)에 옮길 칸. 바로 옮기면 onFocus가 예전 값으로 판단해 첫 칸으로 되돌린다
  const pendingFocus = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    const index = pendingFocus.current;
    pendingFocus.current = null;
    focusAt(index);
  });

  function commit(next: string, focusIndex: number) {
    const clean = next.slice(0, length);
    if (clean === value) {
      focusAt(focusIndex);
      return;
    }
    pendingFocus.current = focusIndex;
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  }

  /** index 칸부터 숫자들을 채운다 (입력·붙여넣기 공통) */
  function fillFrom(index: number, raw: string) {
    const incoming = raw.match(DIGITS)?.join('') ?? '';
    if (!incoming) return;
    if (incoming.length === 1) {
      // 한 자리 입력: 그 칸만 바꾸고 뒤 칸은 그대로 둔다
      const next = (value.slice(0, index) + incoming + value.slice(index + 1)).slice(0, length);
      commit(next, Math.min(index + 1, length - 1));
      return;
    }
    // 여러 자리(붙여넣기·자동 채우기): index부터 차례로 채운다
    const next = (value.slice(0, index) + incoming).slice(0, length);
    commit(next, Math.min(next.length, length - 1));
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (digits[index]) {
        commit(value.slice(0, index), index);
      } else if (index > 0) {
        commit(value.slice(0, index - 1), index - 1);
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusAt(Math.min(index + 1, value.length));
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    fillFrom(index, event.clipboardData.getData('text'));
  }

  return (
    <div
      role="group"
      aria-labelledby={`${groupId}-label`}
      aria-describedby={describedBy}
      className={cn('flex gap-2', className)}
    >
      <span id={`${groupId}-label`} className="sr-only">
        {label}
      </span>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          // 채운 칸 다음 칸까지만 입력을 받아 칸을 건너뛰지 않게 한다
          onFocus={() => {
            if (index > value.length) focusAt(value.length);
          }}
          autoFocus={autoFocus && index === 0}
          disabled={disabled}
          value={digit}
          aria-label={`${index + 1}번째 자리`}
          aria-invalid={error || undefined}
          // 채워진 칸에 입력하면 값이 두 글자가 되므로 기존 숫자를 빼고 새 숫자만 쓴다
          onChange={(event) => fillFrom(index, digit ? event.target.value.replace(digit, '') || digit : event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          className={cn(
            'size-12 tablet:size-13 rounded-md border bg-bg text-center text-title text-text tabular-nums caret-primary',
            'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500',
            error ? 'border-danger' : 'border-border-input focus:border-primary',
          )}
        />
      ))}
    </div>
  );
}
