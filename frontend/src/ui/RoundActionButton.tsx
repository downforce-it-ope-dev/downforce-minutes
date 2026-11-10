import type { Ref } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export interface RoundActionButtonProps {
  icon: LucideIcon;
  /** 버튼 아래에 늘 보이는 이름. 화면 읽기 프로그램도 이 이름으로 읽는다 */
  label: string;
  /** primary: 녹음 주 동작(분홍) / danger: 회의 종료(빨강) */
  tone?: 'primary' | 'danger';
  /** lg: 지름 80(태블릿 96) / md: 56(태블릿 64) */
  size?: 'lg' | 'md';
  disabled?: boolean;
  onClick?: () => void;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * 원형 녹음 버튼 (MTG-02, 스타일 검토 8.5: 녹음 주 버튼 80/96, 보조 56/64).
 * hover 툴팁 대신 이름을 버튼 아래에 늘 보인다. 아이콘만으로 상태를 구분하지 않는다.
 */
export function RoundActionButton({ icon, label, tone = 'primary', size = 'lg', disabled = false, onClick, ref }: RoundActionButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onClick?.()}
      className="group flex cursor-pointer flex-col items-center gap-2 aria-disabled:cursor-not-allowed"
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-full text-white transition-colors',
          size === 'lg' ? 'size-20 tablet:size-24' : 'size-14 tablet:size-16',
          tone === 'danger'
            ? 'bg-danger active:bg-red-700'
            : 'bg-linear-to-br from-primary to-primary-hover shadow-primary active:from-primary-hover',
          'group-aria-disabled:bg-none group-aria-disabled:bg-neutral-100 group-aria-disabled:text-neutral-400 group-aria-disabled:shadow-none',
        )}
      >
        <Icon icon={icon} size="xl" />
      </span>
      <span className="text-label text-text group-aria-disabled:text-neutral-500">{label}</span>
    </button>
  );
}
