import type { ButtonHTMLAttributes, MouseEvent, Ref } from 'react';
import { LoaderCircle, type LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export type IconButtonVariant = 'plain' | 'surface' | 'primary' | 'danger';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'aria-label'> {
  icon: LucideIcon;
  /** 화면 읽기 프로그램이 읽는 이름. 아이콘만 있는 버튼이므로 필수 */
  label: string;
  /**
   * plain: 48×48 투명 (닫기, 뒤로 가기)
   * surface: 48×48 흰 원 + 카드 그림자 (상단 바 보조 동작)
   * primary: 64×64 분홍 원 + 빛 번짐 (로그인 화살표처럼 화면의 대표 동작)
   * danger: 48×48 투명 + 위험 글자 색 (목록 행의 삭제)
   */
  variant?: IconButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

const VARIANT: Record<IconButtonVariant, string> = {
  plain: 'size-12 text-text active:bg-bg-subtle aria-disabled:text-neutral-400',
  surface:
    'size-12 border border-border bg-bg text-text shadow-card active:bg-bg-subtle aria-disabled:text-neutral-400 aria-disabled:shadow-none',
  danger: 'size-12 text-danger-text active:bg-danger-soft aria-disabled:text-neutral-400',
  primary:
    'size-16 bg-primary text-white shadow-primary active:bg-primary-hover aria-disabled:bg-neutral-100 aria-disabled:text-neutral-400 aria-disabled:shadow-none',
};

/** 아이콘만 있는 버튼 (시안 적용 기준 4.1) */
export function IconButton({
  icon,
  label,
  variant = 'plain',
  loading = false,
  disabled = false,
  type = 'button',
  className,
  onClick,
  ...rest
}: IconButtonProps) {
  const inactive = disabled || loading;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (inactive) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <button
      type={type}
      {...rest}
      aria-label={label}
      aria-disabled={inactive || undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer aria-disabled:cursor-not-allowed',
        VARIANT[variant],
        className,
      )}
    >
      <Icon
        icon={loading ? LoaderCircle : icon}
        size={variant === 'primary' ? 'xl' : 'lg'}
        className={loading ? 'animate-spin motion-reduce:animate-none' : undefined}
      />
    </button>
  );
}
