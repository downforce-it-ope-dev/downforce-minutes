import { cn } from '../cn';
import symbolUrl from './df-symbol.png';

export interface LogoSymbolProps {
  /** sm: 32 / md: 40 / lg: 48 */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE = { sm: 'size-8', md: 'size-10', lg: 'size-12' } as const;

/**
 * 다운포스 심볼 로고 (CMN-01 레일, D-10).
 * 원본: 회사 CI 페이지(downforce.co.kr/company/ci)의 Symbol 이미지에서 흰 바탕을 지우고 정사각형으로 잘랐다.
 * SVG 원본(S-02)을 받으면 같은 자리에서 교체한다.
 */
export function LogoSymbol({ size = 'md', className }: LogoSymbolProps) {
  return <img src={symbolUrl} alt="Downforce" className={cn('shrink-0 object-contain', SIZE[size], className)} />;
}
