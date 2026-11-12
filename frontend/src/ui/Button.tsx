import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from 'react';
import { Link } from 'react-router';
import { LoaderCircle, type LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export type ButtonVariant = 'primary' | 'hero' | 'secondary' | 'ghost' | 'danger' | 'danger-secondary';
export type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> {
  variant?: ButtonVariant;
  /** lg 56 / md 48 / sm 40(누르는 영역 48). hero는 크기를 무시한다(휴대폰 56, 태블릿 72) */
  size?: ButtonSize;
  /** 앞쪽 아이콘 */
  icon?: LucideIcon;
  /** 처리 중. 누를 수 없고 회전 표시가 나온다. 문구는 부르는 쪽에서 바꾼다(예: "보내는 중…") */
  loading?: boolean;
  /**
   * 사용할 수 없는 상태. 초점은 받되(화면 읽기 프로그램이 알 수 있게) 눌러도 동작하지 않는다.
   * `aria-disabled`로 알리고, 이유는 가까운 안내 문구로 함께 보여 준다.
   */
  disabled?: boolean;
  fullWidth?: boolean;
  /** pill: 알약 모양(시안 AUTH-02 "이메일 변경"). hero는 항상 알약 */
  shape?: 'default' | 'pill';
  ref?: Ref<HTMLButtonElement>;
  children: ReactNode;
}

const BASE =
  'relative inline-flex items-center justify-center gap-2 font-sans whitespace-nowrap select-none transition-colors cursor-pointer aria-disabled:cursor-not-allowed';

// 글자 토큰은 크기·변형 중 한 곳에만 둔다(같은 요소에 text-* 토큰이 둘이면 우선순위가 CSS 출력 순서에 달림)
const SIZE: Record<ButtonSize, string> = {
  lg: 'h-14 px-6 text-label',
  md: 'h-12 px-5 text-label',
  // 보이는 높이 40, 위아래 4px씩 넓혀 누르는 영역 48
  sm: 'h-10 px-4 text-label before:absolute before:inset-x-0 before:-inset-y-1',
};

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-white active:bg-primary-hover aria-disabled:bg-neutral-100 aria-disabled:text-neutral-400',
  hero:
    'h-14 tablet:h-18 low:h-14 px-8 rounded-full text-title bg-linear-to-r from-primary to-primary-hover text-white shadow-primary aria-disabled:bg-none aria-disabled:bg-neutral-100 aria-disabled:text-neutral-400 aria-disabled:shadow-none',
  secondary:
    'border border-border bg-bg text-text active:bg-bg-subtle aria-disabled:bg-neutral-100 aria-disabled:text-neutral-400',
  ghost: 'bg-transparent text-link active:bg-accent-soft aria-disabled:text-neutral-400 aria-disabled:bg-transparent',
  danger: 'bg-danger text-white active:bg-red-700 aria-disabled:bg-neutral-100 aria-disabled:text-neutral-400',
  // 위험 동작의 보조 버튼(예: 수정 폼의 삭제). 확인 대화상자를 거쳐 실제 삭제는 danger로 한다
  'danger-secondary':
    'border border-border bg-bg text-danger-text active:bg-danger-soft aria-disabled:bg-neutral-100 aria-disabled:text-neutral-400',
};

/** 공통 버튼 (시안 적용 기준 4.1, 스타일 검토 8.5) */
export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  shape = 'default',
  type = 'button',
  className,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const inactive = disabled || loading;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (inactive) {
      // aria-disabled는 브라우저가 막지 않으므로 직접 막는다(submit 포함)
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <button
      type={type}
      {...rest}
      aria-disabled={inactive || undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
      className={cn(
        BASE,
        variant !== 'hero' && SIZE[size],
        // 모서리는 한 곳에서만 정한다(같은 요소에 rounded-*가 둘이면 우선순위가 CSS 출력 순서에 달림)
        variant !== 'hero' && (shape === 'pill' ? 'rounded-full' : 'rounded-md'),
        VARIANT[variant],
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading ? (
        <Icon icon={LoaderCircle} size="md" className="animate-spin motion-reduce:animate-none" />
      ) : (
        // 큰 버튼(lg 56)은 아이콘도 24로 키운다(태블릿 기준)
        icon && <Icon icon={icon} size={variant === 'hero' ? 'xl' : size === 'lg' ? 'lg' : 'md'} />
      )}
      {children}
    </button>
  );
}

export interface ButtonLinkProps {
  /** 앱 안 경로 */
  to: string;
  variant?: Exclude<ButtonVariant, 'hero'>;
  size?: ButtonSize;
  icon?: LucideIcon;
  fullWidth?: boolean;
  shape?: 'default' | 'pill';
  className?: string;
  /** 이동 전에 할 일 (예: 입력 지우기) */
  onClick?: () => void;
  children: ReactNode;
}

/** 버튼 모양의 화면 이동 링크. 이동은 링크로 둬야 새 탭 열기·화면 읽기 프로그램이 올바르게 동작한다 */
export function ButtonLink({ to, variant = 'primary', size = 'md', icon, fullWidth = false, shape = 'default', className, onClick, children }: ButtonLinkProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(BASE, SIZE[size], shape === 'pill' ? 'rounded-full' : 'rounded-md', VARIANT[variant], fullWidth && 'w-full', className)}
    >
      {icon && <Icon icon={icon} size={size === 'lg' ? 'lg' : 'md'} />}
      {children}
    </Link>
  );
}

export interface ButtonAnchorProps extends Omit<ButtonLinkProps, 'to'> {
  /** 앱 밖 주소 (파일 다운로드 등) */
  href: string;
  /** 파일로 받기 (a download) */
  download?: boolean;
  /** 새 탭에서 열기. rel="noopener"를 함께 붙인다 */
  newTab?: boolean;
  ref?: Ref<HTMLAnchorElement>;
}

/** 버튼 모양의 앱 밖 링크 (MTG-03 원본 오디오 다운로드). 앱 안 이동은 ButtonLink를 쓴다 */
export function ButtonAnchor({ href, download, newTab, ref, variant = 'primary', size = 'md', icon, fullWidth = false, shape = 'default', className, onClick, children }: ButtonAnchorProps) {
  return (
    <a
      ref={ref}
      href={href}
      download={download || undefined}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noopener' : undefined}
      onClick={onClick}
      className={cn(BASE, SIZE[size], shape === 'pill' ? 'rounded-full' : 'rounded-md', VARIANT[variant], fullWidth && 'w-full', className)}
    >
      {icon && <Icon icon={icon} size={size === 'lg' ? 'lg' : 'md'} />}
      {children}
    </a>
  );
}
