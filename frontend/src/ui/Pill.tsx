import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export type PillTone = 'accent' | 'brand' | 'neutral';

export interface PillProps {
  /** accent: 정보·보조(보라) / brand: 강조(분홍) / neutral: 중립 */
  tone?: PillTone;
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
}

const TONE: Record<PillTone, string> = {
  accent: 'bg-accent-soft text-accent-soft-text',
  brand: 'bg-brand-soft text-brand-soft-text',
  neutral: 'bg-bg-subtle text-text-muted',
};

/**
 * 정보 알약 (시안 적용 기준 4.1). 누를 수 없는 표시용이다.
 * 강조할 숫자는 <Pill.Strong>으로 감싼다(굵기 700, 고정폭 숫자).
 */
export function Pill({ tone = 'accent', icon, className, children }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-body whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {icon && <Icon icon={icon} size="sm" />}
      {children}
    </span>
  );
}

/** 알약 안 강조 숫자 */
Pill.Strong = function PillStrong({ children }: { children: ReactNode }) {
  return <strong className="font-bold tabular-nums">{children}</strong>;
};
