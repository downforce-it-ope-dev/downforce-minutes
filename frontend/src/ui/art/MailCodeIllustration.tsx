import { useId } from 'react';
import { cn } from '../cn';

/**
 * 인증 코드 메일 일러스트 (AUTH-02. 시안 적용 기준 4.2, S-12).
 * 코드 말풍선이 나오는 봉투, 녹음 알약, AI 배지가 붙은 체크 문서. 장식이라 화면 읽기에서 숨긴다.
 */
export function MailCodeIllustration({ className }: { className?: string }) {
  const id = useId();
  const envelope = `mc-env-${id}`;
  const pill = `mc-pill-${id}`;
  const badge = `mc-badge-${id}`;
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 440 380" className={cn('h-auto', className)}>
      <defs>
        <linearGradient id={envelope} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" className="text-lavender-200" />
          <stop offset="1" stopColor="currentColor" className="text-lavender-300" />
        </linearGradient>
        <linearGradient id={pill} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="currentColor" className="text-pink-200" />
          <stop offset="1" stopColor="currentColor" className="text-lavender-200" />
        </linearGradient>
        <linearGradient id={badge} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" className="text-lavender-400" />
          <stop offset="1" stopColor="currentColor" className="text-lavender-500" />
        </linearGradient>
      </defs>
      {/* 알림 표시 */}
      <path d="M140 10 l10 18 M175 0 v20 M210 10 l-12 16" strokeWidth="5" strokeLinecap="round" className="stroke-lavender-500" />
      {/* 봉투 뒤판 + 코드 말풍선 + 앞판 */}
      <path d="M93 110 L170 50 L247 110 V245 Q247 260 232 260 H108 Q93 260 93 245 Z" fill={`url(#${envelope})`} />
      <rect x="115" y="70" width="150" height="80" rx="14" className="fill-white" />
      <g className="fill-lavender-500">
        {[140, 163, 186, 209, 232].map((cx) => (
          <circle key={cx} cx={cx} cy="112" r="7" />
        ))}
      </g>
      <path d="M93 130 L170 190 L247 130 V245 Q247 260 232 260 H108 Q93 260 93 245 Z" className="fill-lavender-200" />
      <path d="M93 250 L170 185 L247 250" fill="none" strokeWidth="3" className="stroke-white opacity-70" />
      {/* 위로 가는 화살표 */}
      <path d="M180 280 C 200 250 210 230 220 205" fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-lavender-500" />
      <path d="M208 214 L221 202 L228 218" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="stroke-lavender-500" />
      {/* 녹음 알약 */}
      <rect x="7" y="300" width="190" height="69" rx="34.5" fill={`url(#${pill})`} />
      <circle cx="48" cy="334" r="22" className="fill-white" />
      <circle cx="48" cy="334" r="10" className="fill-pink-500" />
      <g className="fill-white">
        {[16, 32, 44, 28, 40, 20, 32, 16].map((height, index) => (
          <rect key={index} x={84 + index * 10} y={334 - height / 2} width="4" height={height} rx="2" />
        ))}
      </g>
      {/* 체크 문서 */}
      <g transform="rotate(6 330 270)">
        <rect x="240" y="185" width="180" height="180" rx="22" className="fill-white" />
        <path
          d="M262 232 l6 6 l12 -14 M262 270 l6 6 l12 -14 M262 308 l6 6 l12 -14"
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-lavender-500"
        />
        <rect x="294" y="226" width="100" height="10" rx="5" className="fill-lavender-200" />
        <rect x="294" y="264" width="90" height="10" rx="5" className="fill-lavender-200" />
        <rect x="294" y="302" width="70" height="10" rx="5" className="fill-lavender-200" />
      </g>
      {/* AI 배지 */}
      <g transform="translate(336 160) skewX(-8)">
        <rect width="88" height="56" rx="14" fill={`url(#${badge})`} />
        <text x="14" y="42" fontSize="36" fontWeight="700" fontStyle="italic" className="fill-white font-sans">
          AI
        </text>
      </g>
    </svg>
  );
}
