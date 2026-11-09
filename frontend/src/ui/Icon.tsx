import type { LucideIcon } from 'lucide-react';

/** 아이콘 크기 (px). 기준은 24 (스타일 검토 8.5) */
const SIZE = { sm: 16, md: 20, lg: 24, xl: 32 } as const;
export type IconSize = keyof typeof SIZE;

export interface IconProps {
  /** lucide-react 아이콘 컴포넌트 */
  icon: LucideIcon;
  size?: IconSize;
  /** 의미가 있는 아이콘이면 레이블을 준다. 없으면 장식으로 보고 화면 읽기에서 숨긴다 */
  label?: string;
  className?: string;
}

/**
 * 공통 아이콘 (#5 결정). 화면에서 lucide-react를 직접 쓰지 않고 이 컴포넌트를 쓴다.
 * 색은 글자색(currentColor)을 따르므로 부모의 text-* 클래스로 정한다.
 */
export function Icon({ icon: Glyph, size = 'lg', label, className }: IconProps) {
  const px = SIZE[size];
  return label ? (
    <Glyph size={px} strokeWidth={2} role="img" aria-label={label} focusable={false} className={className} />
  ) : (
    <Glyph size={px} strokeWidth={2} aria-hidden="true" focusable={false} className={className} />
  );
}
