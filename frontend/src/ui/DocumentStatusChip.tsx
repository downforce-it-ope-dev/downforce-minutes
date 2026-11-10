import { FileText } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export type DocumentStatus = 'connected' | 'attention' | 'disconnected';

export interface DocumentStatusChipProps {
  status: DocumentStatus;
  /** 누르면 문서 연결 정보(HOME-01-P01)를 연다. 없으면 표시만 한다 */
  onClick?: () => void;
  /** 상태 문구를 바꾼다 (예: "Notion 연결됨"). 없으면 상태별 기본 문구 */
  label?: string;
  /** 휴대폰에서 문구를 숨기고 아이콘만 보인다 (상단 바) */
  compact?: boolean;
  /** 연결된 서비스. 주면 문서 아이콘 대신 서비스 로고를 쓴다 */
  provider?: 'NOTION' | 'CONFLUENCE' | null;
  /** 모든 폭에서 글자 없이 아이콘(+ 상태 점)만 보인다. 문구는 화면 읽기 프로그램에 남긴다 */
  iconOnly?: boolean;
  className?: string;
}

const STATUS: Record<DocumentStatus, { label: string; dot: string }> = {
  connected: { label: '문서 연결', dot: 'bg-success-text' },
  attention: { label: '점검 필요', dot: 'bg-warning-text' },
  disconnected: { label: '연결 안 됨', dot: 'bg-danger' },
};

/**
 * 문서 연결 상태 칩 (CMN-01-F06, 시안 적용 기준 4.3). 흰 알약 + 상태 점 + 문구.
 * 상태를 색만으로 구분하지 않도록 문구가 상태마다 다르다. 데이터 연결은 쓰는 화면에서 한다.
 */
export function DocumentStatusChip({ status, label: customLabel, onClick, compact = false, provider, iconOnly = false, className }: DocumentStatusChipProps) {
  const { label: defaultLabel, dot } = STATUS[status];
  const label = customLabel ?? defaultLabel;
  const body = (
    <>
      <span className="relative">
        {provider ? (
          <img src={provider === 'NOTION' ? '/assets/notion.ico' : '/assets/confluence.svg'} alt="" className="size-6" />
        ) : (
          <Icon icon={FileText} size="md" />
        )}
        <span className={cn('absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-bg', dot)} aria-hidden="true" />
      </span>
      {/* 휴대폰 상단 바는 좁아 아이콘과 상태 점만 보인다. 문구는 화면 읽기 프로그램에 남긴다 */}
      <span className={iconOnly ? 'sr-only' : compact ? 'sr-only tablet:not-sr-only' : undefined}>{label}</span>
    </>
  );
  const shape = cn(
    'inline-flex h-12 items-center gap-2 rounded-full bg-bg text-label text-text shadow-card',
    iconOnly ? 'w-12 justify-center' : compact ? 'justify-center px-3 tablet:px-4' : 'px-4',
    className,
  );
  if (!onClick) return <span className={shape}>{body}</span>;
  return (
    <button type="button" onClick={onClick} className={cn(shape, 'cursor-pointer active:bg-bg-subtle')}>
      {body}
    </button>
  );
}
