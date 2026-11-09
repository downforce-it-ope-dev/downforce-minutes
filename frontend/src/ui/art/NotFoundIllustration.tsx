import { cn } from '../cn';

/**
 * 페이지 없음 일러스트 (CMN-03, CMN-02와 같은 톤). 빈 문서 위의 돋보기. 장식이라 화면 읽기에서 숨긴다.
 */
export function NotFoundIllustration({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 160 160" className={cn('h-auto', className)}>
      <circle cx="80" cy="80" r="72" className="fill-lavender-100" />
      {/* 빈 문서 */}
      <rect x="40" y="34" width="62" height="80" rx="10" className="fill-white" />
      <path d="M52 54 H88 M52 68 H80 M52 82 H72" strokeWidth="6" strokeLinecap="round" className="stroke-pink-200" />
      {/* 돋보기 */}
      <circle cx="98" cy="96" r="20" strokeWidth="8" className="fill-white stroke-blue-400" />
      <path d="M112 110 L128 126" strokeWidth="10" strokeLinecap="round" className="stroke-lavender-500" />
      <circle cx="98" cy="96" r="4" className="fill-pink-400" />
    </svg>
  );
}
