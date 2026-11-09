import { useId } from 'react';
import { cn } from '../cn';

export interface LogoProps {
  /** sm: 높이 24 / md: 32 / lg: 40(태블릿 48) */
  size?: 'sm' | 'md' | 'lg';
  /** 아래에 제품 이름 "Minutes"를 붙인다(사이드바) */
  withProduct?: boolean;
  className?: string;
}

const HEIGHT = { sm: 'h-6', md: 'h-8', lg: 'h-10 tablet:h-12' } as const;

/**
 * 글자 로고 (시안 적용 기준 S-12, 4.2). 로고 원본(S-02)을 받기 전까지 쓴다.
 * "DOWN" 파랑(blue-500), "FORCE" 분홍→보라 그라데이션(pink-500→lavender-500).
 * 크기는 높이 클래스로 정하고 폭은 비율대로 따라간다. 로고라 색 대비 기준 예외다.
 */
export function Logo({ size = 'md', withProduct = false, className }: LogoProps) {
  const gradientId = `logo-force-${useId()}`;
  return (
    <span className={cn('inline-flex flex-col items-center gap-0.5', className)}>
      <svg viewBox="0 0 220 40" role="img" aria-label="Downforce" className={cn('w-auto', HEIGHT[size])}>
        <title>Downforce</title>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
            {/* stop-color는 클래스로 줄 수 없어 글자색(currentColor)을 이어받게 한다 */}
            <stop offset="0" stopColor="currentColor" className="text-pink-500" />
            <stop offset="1" stopColor="currentColor" className="text-lavender-500" />
          </linearGradient>
        </defs>
        <text
          x="0"
          y="31"
          fontSize="34"
          fontWeight="700"
          textLength="218"
          lengthAdjust="spacingAndGlyphs"
          className="font-sans"
        >
          <tspan className="fill-blue-500">DOWN</tspan>
          <tspan fill={`url(#${gradientId})`}>FORCE</tspan>
        </text>
      </svg>
      {withProduct && <span className="text-label text-text-muted">Minutes</span>}
    </span>
  );
}
