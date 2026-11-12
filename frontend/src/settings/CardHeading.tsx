import { CircleAlert, CircleCheck, CircleDashed } from 'lucide-react';
import type { IntegrationState } from '../settingsApi';
import { cn, Icon } from '../ui';

const STATE_VIEW: Record<IntegrationState, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  available: { label: '연결됨', tone: 'success' },
  'not-configured': { label: '설정 필요', tone: 'warning' },
  'not-selected': { label: '선택 안 됨', tone: 'neutral' },
  unreachable: { label: '연결 불가', tone: 'danger' },
  'root-inaccessible': { label: '구조 접근 불가', tone: 'danger' },
  'health-unknown': { label: '확인 불가', tone: 'danger' },
};

const TONE = {
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  danger: 'bg-danger-soft text-danger-text',
  neutral: 'bg-bg-subtle text-text-muted',
} as const;

/** 카드 제목 + 상태 배지(아이콘 + 글자, 색만으로 구분하지 않음). 불러오는 중이면 배지 대신 "확인 중" */
export function CardHeading({ id, title, state }: { id: string; title: string; state?: IntegrationState }) {
  const view = state ? STATE_VIEW[state] : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id={id} className="text-title text-text">
        {title}
      </h2>
      <span className={cn('inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-caption', view ? TONE[view.tone] : TONE.neutral)}>
        <Icon icon={!view ? CircleDashed : view.tone === 'success' ? CircleCheck : CircleAlert} size="sm" />
        {view?.label ?? '확인 중'}
      </span>
    </div>
  );
}
