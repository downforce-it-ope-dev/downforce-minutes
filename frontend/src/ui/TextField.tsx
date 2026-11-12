import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { CircleAlert, type LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** 입력란 위에 보이는 이름표. 예시 글자(placeholder)만으로 대신하지 않는다 */
  label: ReactNode;
  /** 입력란 아래 도움말 */
  help?: ReactNode;
  /** 오류 문구. 있으면 테두리·문구가 오류 상태가 되고 aria-invalid가 켜진다 */
  error?: ReactNode;
  /** 문구 없이 오류 상태(테두리·aria-invalid)만 켠다. 오류 내용은 토스트로 알릴 때 쓴다 */
  invalid?: boolean;
  /** 입력란 안 앞쪽 아이콘 (장식) */
  icon?: LucideIcon;
  /** default: 모서리 12 / pill: 알약형 (한 줄짜리 단독 입력, 시안 로그인 화면) */
  shape?: 'default' | 'pill';
  /** 이름표를 화면에서 숨기고 화면 읽기 프로그램에만 남긴다. 화면에 다른 제목이 이름표 역할을 할 때만 쓴다 */
  hideLabel?: boolean;
  /** 높이는 48(태블릿 52)로 같다. md: 글자 16 / lg: 글자 title — 화면에서 가장 중요한 한 줄 입력(예: 회의 제목). 옆 입력과 높이를 맞춘다 */
  inputSize?: 'md' | 'lg';
  /** 입력란 오른쪽에 붙일 요소(입력란과 세로 가운데 정렬). 예: 로그인 화살표 버튼 */
  trailing?: ReactNode;
  /**
   * 입력란 안 오른쪽에 둘 요소(예: 검색어 지우기 ×). 입력 글자가 가리지 않게 오른쪽 여백을 넓힌다.
   * 입력 중에 나타났다 사라지게 하지 말고 늘 넘긴 뒤 보이기만 바꾼다(입력란 구조가 바뀌면 Android 한글 조합이 깨질 수 있다)
   */
  inside?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

/**
 * 공통 텍스트 입력 (시안 적용 기준 4.1, 스타일 검토 8.5).
 * 높이 48(태블릿 52), 글자 16px(iPad·iPhone 자동 확대 방지).
 */
export function TextField({
  label,
  help,
  error,
  invalid = false,
  icon,
  shape = 'default',
  hideLabel = false,
  trailing,
  inside,
  inputSize = 'md',
  id,
  className,
  'aria-describedby': describedBy,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? `field-${autoId}`;
  const helpId = help ? `${inputId}-help` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const isInvalid = Boolean(error) || invalid;
  const describedByIds = [describedBy, helpId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : 'text-label text-text'}>
        {label}
      </label>
      <div className="flex items-center gap-4">
      <div className="relative min-w-0 flex-1">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-text-muted">
            <Icon icon={icon} size="lg" />
          </span>
        )}
        <input
          id={inputId}
          {...rest}
          aria-invalid={isInvalid || undefined}
          aria-describedby={describedByIds}
          className={cn(
            'w-full border bg-bg text-text placeholder:text-text-muted',
            'h-12 tablet:h-13 low:h-12', inputSize === 'lg' ? 'text-title' : 'text-body',
            'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500',
            shape === 'pill' ? 'rounded-full px-5 shadow-card' : 'rounded-md px-3.5',
            icon && (shape === 'pill' ? 'pl-14' : 'pl-12'),
            inside !== undefined && 'pr-14',
            isInvalid ? 'border-danger' : 'border-border-input',
          )}
        />
        {inside !== undefined && <span className="absolute inset-y-0 right-1 flex items-center">{inside}</span>}
      </div>
      {trailing}
      </div>
      {help && (
        <p id={helpId} className="text-caption text-text-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-caption text-danger-text">
          <Icon icon={CircleAlert} size="sm" className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
