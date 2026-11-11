import { useId, useLayoutEffect, useRef, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react';
import { CircleAlert } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: ReactNode;
  /** 이름표를 화면에서 숨기고 화면 읽기 프로그램에만 남긴다(목록 항목처럼 구역 제목이 이름을 알려 줄 때) */
  hideLabel?: boolean;
  /** 입력 오류 문구. 입력란 바로 아래에 보인다(MTG-04 빈 항목 "내용을 입력해 주세요.") */
  error?: ReactNode;
  /** 최소 줄 수 (기본 2) */
  minRows?: number;
  /** body: 16px / large: 태블릿에서 body-lg(18) — 화면의 주 편집 내용(예: 회의록 항목) */
  textSize?: 'body' | 'large';
  ref?: Ref<HTMLTextAreaElement>;
}

/**
 * 여러 줄 입력 (MTG-04 회의록 편집). 내용만큼 높이가 늘어나 입력란 안에서 따로 스크롤하지 않는다(문서 3.1 터치 키보드 편집).
 * 글자 16px(iPad·iPhone 자동 확대 방지), 테두리는 입력란과 같다. 최소 높이 52(2줄).
 */
export function TextArea({ label, hideLabel = false, error, minRows = 2, textSize = 'body', id, className, value, ref, ...rest }: TextAreaProps) {
  const autoId = useId();
  const fieldId = id ?? `textarea-${autoId}`;
  const errorId = error ? `${fieldId}-error` : undefined;
  const inner = useRef<HTMLTextAreaElement | null>(null);

  // 내용이 바뀔 때마다 높이를 다시 잰다
  useLayoutEffect(() => {
    const element = inner.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight + 2}px`;
  }, [value]);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={fieldId} className={hideLabel ? 'sr-only' : 'text-label text-text'}>
        {label}
      </label>
      <textarea
        id={fieldId}
        ref={(element) => {
          inner.current = element;
          if (typeof ref === 'function') ref(element);
          else if (ref) ref.current = element;
        }}
        rows={minRows}
        value={value}
        {...rest}
        aria-invalid={error ? true : rest['aria-invalid']}
        aria-describedby={[rest['aria-describedby'], errorId].filter(Boolean).join(' ') || undefined}
        className={cn(
          'min-h-13 w-full resize-none overflow-hidden rounded-md border bg-bg px-3.5 py-3 text-text placeholder:text-text-muted',
          textSize === 'large' ? 'text-body tablet:text-body-lg' : 'text-body',
          'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500',
          error ? 'border-danger' : 'border-border-input',
        )}
      />
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-caption text-danger-text">
          <Icon icon={CircleAlert} size="sm" className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
