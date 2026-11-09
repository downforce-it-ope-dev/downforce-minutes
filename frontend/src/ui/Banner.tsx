import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export type BannerTone = 'info' | 'warning' | 'danger' | 'success';

export interface BannerProps {
  tone: BannerTone;
  title?: ReactNode;
  /** 오른쪽(휴대폰은 아래)에 둘 동작. 예: 다시 시도 버튼 */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

const TONE: Record<BannerTone, { box: string; icon: LucideIcon }> = {
  info: { box: 'bg-primary-soft text-primary-soft-text', icon: Info },
  warning: { box: 'bg-warning-soft text-warning-text', icon: TriangleAlert },
  danger: { box: 'bg-danger-soft text-danger-text', icon: CircleAlert },
  success: { box: 'bg-success-soft text-success-text', icon: CircleCheck },
};

/**
 * 화면 위 안내 배너 (AUTH-01 상단 안내: 요청 과다·발송 실패·세션 만료 등).
 * 상태를 색만으로 구분하지 않도록 아이콘을 함께 둔다. 오류는 role="alert", 그 밖은 role="status".
 */
export function Banner({ tone, title, action, className, children }: BannerProps) {
  const { box, icon } = TONE[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex flex-col gap-3 rounded-lg p-4 tablet:flex-row tablet:items-center', box, className)}
    >
      <div className="flex flex-1 items-start gap-3">
        <Icon icon={icon} size="lg" className="shrink-0" />
        <div className="flex flex-col gap-1">
          {title && <p className="text-label">{title}</p>}
          <div className="text-body break-keep">{children}</div>
        </div>
      </div>
      {action && <div className="shrink-0 self-end tablet:self-auto">{action}</div>}
    </div>
  );
}
