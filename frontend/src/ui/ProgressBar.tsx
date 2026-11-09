import { cn } from './cn';

export interface ProgressBarProps {
  value: number;
  max?: number;
  /** 화면 읽기 프로그램용 이름. 예: "남은 시간" */
  label: string;
  /** 화면 읽기 프로그램이 읽을 값 문구. 예: "4분 32초 남음". 없으면 퍼센트를 읽는다 */
  valueText?: string;
  className?: string;
}

/**
 * 진행 막대 (스타일 검토 8.6: 높이 8). 값은 글자로도 함께 보여 준다(색·막대만으로 전달하지 않음).
 * 채움 폭은 값에 따라 바뀌므로 인라인 style로 지정한다.
 */
export function ProgressBar({ value, max = 100, label, valueText, className }: ProgressBarProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(max, Math.max(0, value))}
      aria-valuetext={valueText}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-neutral-200', className)}
    >
      <div
        className="h-full rounded-full bg-primary transition-all duration-300 motion-reduce:transition-none"
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}
