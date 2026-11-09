import { cn } from '../cn';

export interface ServerRecoveryIllustrationProps {
  /** waiting: 끊어진 플러그 사이에 신호 점이 깜박인다 / ready: 플러그가 연결된다 */
  state: 'waiting' | 'ready';
  className?: string;
}

/**
 * 서버 연결 복구 일러스트 (CMN-02, CI 3색). 장식이라 화면 읽기에서 숨긴다.
 * 동작 줄이기 설정이면 깜박임을 끈다(motion-reduce).
 */
export function ServerRecoveryIllustration({ state, className }: ServerRecoveryIllustrationProps) {
  const ready = state === 'ready';
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 160 160" className={cn('h-auto', className)}>
      <circle cx="80" cy="80" r="72" className="fill-lavender-100" />
      <circle cx="80" cy="80" r="56" className="fill-white opacity-70" />
      {/* 왼쪽 플러그 (파랑) */}
      <g className={cn('transition-transform duration-500 motion-reduce:transition-none', ready ? 'translate-x-0' : '-translate-x-4.5')}>
        <path d="M26 80 H44" strokeWidth="8" strokeLinecap="round" className="stroke-blue-400" />
        <rect x="44" y="62" width="30" height="36" rx="10" className="fill-blue-400" />
        <path d="M74 70 H84 M74 90 H84" strokeWidth="6" strokeLinecap="round" className="stroke-blue-500" />
      </g>
      {/* 오른쪽 소켓 (분홍) */}
      <g className={cn('transition-transform duration-500 motion-reduce:transition-none', ready ? 'translate-x-0' : 'translate-x-4.5')}>
        <rect x="84" y="62" width="30" height="36" rx="10" className="fill-pink-400" />
        <path d="M114 80 H134" strokeWidth="8" strokeLinecap="round" className="stroke-pink-400" />
      </g>
      {ready ? (
        <g className="fill-lavender-500">
          <path d="M80 26 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 Z" />
          <path d="M118 36 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" />
        </g>
      ) : (
        <g className="animate-pulse fill-lavender-500 motion-reduce:animate-none">
          <circle cx="68" cy="52" r="4" />
          <circle cx="80" cy="52" r="4" />
          <circle cx="92" cy="52" r="4" />
        </g>
      )}
    </svg>
  );
}
