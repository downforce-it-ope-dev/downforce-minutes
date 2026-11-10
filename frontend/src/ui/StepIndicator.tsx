import { Check } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export interface StepIndicatorProps {
  /** 단계 이름 */
  steps: readonly string[];
  /** 현재 단계 (0부터) */
  current: number;
  className?: string;
}

/**
 * 마법사 단계 표시 (SET-03 3.1). 표시 전용이라 누를 수 없다.
 * - 태블릿: 모든 단계를 가로로. 완료는 ✓, 현재는 primary 색 + 굵기(색만으로 구분하지 않음)
 * - 휴대폰: "1/3 서비스 선택"처럼 현재 단계만
 * - 태블릿 가로(tablet-lg): 세로 목록 (2단 화면의 왼쪽 열)
 * 크기: 글자 label, 단계 점 24, 전체 높이 48(제안값 채택)
 */
export function StepIndicator({ steps, current, className }: StepIndicatorProps) {
  return (
    <nav aria-label="진행 단계" className={cn('flex min-h-12 items-center', className)}>
      <p className="text-label text-primary-soft-text tablet:hidden">
        <span className="tabular-nums">
          {current + 1}/{steps.length}
        </span>{' '}
        {steps[current]}
      </p>
      <ol className="hidden items-center gap-2 tablet:flex tablet-lg:flex-col tablet-lg:items-start tablet-lg:gap-4">
        {steps.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={step} className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
              {index > 0 && <span className="h-px w-6 bg-border tablet-lg:hidden" aria-hidden="true" />}
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full text-caption tabular-nums',
                  done && 'bg-primary-soft text-primary-soft-text',
                  active && 'bg-primary text-white',
                  !done && !active && 'border border-border-input text-text-muted',
                )}
              >
                {done ? <Icon icon={Check} size="sm" /> : index + 1}
              </span>
              <span className={cn('text-label', active ? 'text-primary-soft-text' : 'text-text-muted')}>
                {step}
                {done && <span className="sr-only"> 완료</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
