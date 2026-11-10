import { useId, type ReactNode, type Ref, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** 선택 상자 위 이름표 */
  label: ReactNode;
  /** 오류 상태(테두리·aria-invalid). 오류 내용은 토스트로 알린다(S-13) */
  invalid?: boolean;
  ref?: Ref<HTMLSelectElement>;
  children: ReactNode;
}

/**
 * 공통 선택 상자 (MTG-01 회의록 템플릿, 스타일 검토 8.5).
 * 기기 기본 선택 목록을 그대로 쓰고 모양만 입력란(높이 48, 태블릿 52)과 맞춘다.
 */
export function SelectField({ label, invalid = false, id, className, children, ...rest }: SelectFieldProps) {
  const autoId = useId();
  const selectId = id ?? `select-${autoId}`;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={selectId} className="text-label text-text">
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          {...rest}
          aria-invalid={invalid || undefined}
          className={cn(
            'h-12 w-full cursor-pointer appearance-none rounded-md border bg-bg pr-12 pl-3.5 text-body text-text tablet:h-13',
            'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500',
            invalid ? 'border-danger' : 'border-border-input',
          )}
        >
          {children}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-text-muted">
          <Icon icon={ChevronDown} size="lg" />
        </span>
      </div>
    </div>
  );
}
