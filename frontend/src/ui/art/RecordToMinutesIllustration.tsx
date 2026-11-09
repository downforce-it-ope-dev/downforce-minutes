import { useId } from 'react';
import { cn } from '../cn';

/**
 * 녹음 → AI 회의록 일러스트 (AUTH-01, HOME 안내 패널. 시안 적용 기준 4.2, S-12).
 * 녹음 알약(분홍 점 + 파형) → 화살표 → AI 배지가 붙은 회의록 문서. 장식이라 화면 읽기에서 숨긴다.
 * 크기는 폭 클래스로 정한다(비율 유지).
 */
export function RecordToMinutesIllustration({ className }: { className?: string }) {
  const id = useId();
  const pill = `rtm-pill-${id}`;
  const badge = `rtm-badge-${id}`;
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 420 400" className={cn('h-auto', className)}>
      <defs>
        <linearGradient id={pill} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="currentColor" className="text-pink-200" />
          <stop offset="1" stopColor="currentColor" className="text-lavender-300" />
        </linearGradient>
        <linearGradient id={badge} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" className="text-lavender-400" />
          <stop offset="1" stopColor="currentColor" className="text-lavender-500" />
        </linearGradient>
      </defs>
      {/* 녹음 알약 */}
      <rect x="7" y="17" width="277" height="95" rx="47.5" fill={`url(#${pill})`} />
      <circle cx="70" cy="64" r="30" className="fill-white" />
      <circle cx="70" cy="64" r="14" className="fill-pink-500" />
      <g className="fill-white">
        {[16, 32, 48, 28, 56, 32, 16, 40, 20, 28].map((height, index) => (
          <rect key={index} x={120 + index * 12} y={64 - height / 2} width="5" height={height} rx="2.5" />
        ))}
      </g>
      {/* 반짝임 */}
      <path d="M300 160 l6 -16 l6 16 l16 6 l-16 6 l-6 16 l-6 -16 l-16 -6 z" className="fill-lavender-500" />
      <path d="M330 140 l4 -10 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 z" className="fill-lavender-400" />
      {/* 화살표 */}
      <path d="M70 130 C 60 180 80 210 120 220" fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-lavender-500" />
      <path d="M106 206 L122 221 L104 232" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="stroke-lavender-500" />
      {/* 회의록 문서 */}
      <g transform="rotate(8 250 260)">
        <rect x="186" y="202" width="230" height="170" rx="24" className="fill-lavender-200 opacity-60" />
        <rect x="160" y="180" width="230" height="170" rx="24" className="fill-white" />
        <rect x="190" y="215" width="80" height="12" rx="6" className="fill-lavender-400" />
        <rect x="190" y="245" width="150" height="10" rx="5" className="fill-lavender-200" />
        <rect x="190" y="270" width="140" height="10" rx="5" className="fill-lavender-200" />
        <rect x="190" y="295" width="90" height="10" rx="5" className="fill-lavender-200" />
      </g>
      {/* AI 배지 */}
      <g transform="translate(300 170) skewX(-8)">
        <rect width="72" height="50" rx="12" fill={`url(#${badge})`} />
        <text x="12" y="37" fontSize="32" fontWeight="700" fontStyle="italic" className="fill-white font-sans">
          AI
        </text>
      </g>
    </svg>
  );
}
