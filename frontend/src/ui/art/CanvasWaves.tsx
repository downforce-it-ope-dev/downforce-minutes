import { cn } from '../cn';

export interface CanvasWavesProps {
  /** auth: 인증 화면(위 오른쪽·아래 물결이 크다) / app: 앱 틀(아래쪽만 옅게) */
  variant?: 'auth' | 'app';
  className?: string;
}

/**
 * 바탕 가장자리 물결 (시안 3장 바탕, 시안 적용 기준 4.2).
 * 부모 영역을 가득 채우는 장식이다. 누름을 막지 않고 화면 읽기에서 숨긴다.
 * 비율을 유지하지 않고 늘려 화면 크기와 상관없이 가장자리에 붙게 한다.
 */
export function CanvasWaves({ variant = 'auth', className }: CanvasWavesProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1180 852"
      preserveAspectRatio="none"
      className={cn('pointer-events-none absolute inset-0 size-full', className)}
    >
      {variant === 'auth' && (
        <>
          <path d="M790 0 C 880 110 980 160 1180 120 L1180 0 Z" className="fill-pink-200 opacity-75" />
          <path d="M930 180 C 1030 150 1100 140 1180 90 L1180 205 C 1100 215 1010 205 930 180 Z" className="fill-lavender-200 opacity-80" />
        </>
      )}
      <path d="M0 600 C 140 590 300 650 480 852 L0 852 Z" className={cn('fill-blue-100', variant === 'auth' ? 'opacity-90' : 'opacity-50')} />
      <path
        d="M0 700 C 220 690 420 800 640 770 C 860 740 1000 580 1180 560 L1180 852 L0 852 Z"
        className={cn('fill-pink-200', variant === 'auth' ? 'opacity-70' : 'opacity-30')}
      />
      <path d="M0 800 C 300 760 520 840 760 852 L0 852 Z" className={cn('fill-pink-100', variant === 'auth' ? 'opacity-90' : 'opacity-50')} />
    </svg>
  );
}
