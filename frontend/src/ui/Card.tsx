import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** card: 목록·입력 카드(모서리 20) / panel: 화면 중심의 큰 면(모서리 24) */
  variant?: 'card' | 'panel';
  /** 안쪽 여백. md: 휴대폰 16·태블릿 24 (스타일 검토 8.4) */
  padding?: 'none' | 'md';
  as?: 'div' | 'section' | 'article' | 'li';
  children: ReactNode;
}

/** 흰 면 + 부드러운 그림자 (시안 적용 기준 3.3, S-10) */
export function Card({ variant = 'card', padding = 'md', as: Tag = 'div', className, children, ...rest }: CardProps) {
  return (
    <Tag
      {...rest}
      className={cn(
        'bg-bg shadow-card',
        variant === 'panel' ? 'rounded-2xl' : 'rounded-xl',
        padding === 'md' && 'p-4 tablet:p-6',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
