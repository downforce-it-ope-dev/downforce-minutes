import { Plus, X } from 'lucide-react';
import type { Participant } from '../participantsApi';
import type { StructuredMinutes, StructuredMinutesActionItem } from '../reviewApi';
import { Button, cn, DateField, IconButton, SelectField, TextArea } from '../ui';
import { validDueDate } from './minutesValidation';

/*
 * 회의록 편집 (MTG-04-F01~F03). 사용자 결정(2026-11-11): 다섯 구역을 한 페이지에 쌓지 않고,
 * 구역 목록(태블릿 왼쪽 세로 / 휴대폰 위 가로)에서 고른 구역 하나를 크게 편집한다. 항목을 추가해도 그 구역 안에서만 길어진다.
 * 빈 항목은 입력란 아래 오류 문구, 삭제·추가 버튼은 늘 보인다.
 */

export type MinutesSectionKey = 'summary' | 'discussionPoints' | 'decisions' | 'followUps' | 'actionItems';
type ListKey = 'discussionPoints' | 'decisions' | 'followUps';

const MINUTES_SECTIONS: ReadonlyArray<{ key: MinutesSectionKey; title: string }> = [
  { key: 'summary', title: '회의 요약' },
  { key: 'discussionPoints', title: '논의 내용' },
  { key: 'decisions', title: '결정 사항' },
  { key: 'followUps', title: '후속 조치' },
  { key: 'actionItems', title: '실행 항목' },
];

const EMPTY_ITEM = '내용을 입력해 주세요.';

function sectionCount(minutes: StructuredMinutes, key: MinutesSectionKey): number | null {
  if (key === 'summary') return null;
  return minutes[key].length;
}

function sectionHasError(minutes: StructuredMinutes, key: MinutesSectionKey): boolean {
  if (key === 'summary') return false;
  if (key === 'actionItems') return minutes.actionItems.some((item) => !item.task.trim() || !validDueDate(item.dueDate));
  return minutes[key].some((item) => !item.trim());
}

/** 구역 목록. 태블릿은 세로 목록, 휴대폰은 가로로 넘기는 줄 */
export function MinutesSectionNav({
  minutes,
  value,
  onChange,
  className,
}: {
  minutes: StructuredMinutes;
  value: MinutesSectionKey;
  onChange: (key: MinutesSectionKey) => void;
  className?: string;
}) {
  return (
    <nav aria-label="회의록 구역" className={className}>
      <ul className="flex gap-2 overflow-x-auto tablet:flex-col tablet:gap-1 tablet:overflow-visible">
        {MINUTES_SECTIONS.map(({ key, title }) => {
          const selected = key === value;
          const count = sectionCount(minutes, key);
          const error = sectionHasError(minutes, key);
          return (
            <li key={key} className="shrink-0">
              <button
                type="button"
                aria-current={selected ? 'true' : undefined}
                onClick={() => onChange(key)}
                className={cn(
                  'flex h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-full border px-4 text-label whitespace-nowrap tablet:h-14 tablet:rounded-md tablet:border-0',
                  selected ? 'border-primary bg-selected text-selected-text' : 'border-border bg-bg text-text active:bg-bg-subtle tablet:bg-transparent',
                )}
              >
                <span>{title}</span>
                <span className="flex items-center gap-1.5">
                  {error && <span aria-label="입력 확인 필요" className="size-2 rounded-full bg-danger" />}
                  {count !== null && <span className="text-caption text-text-muted tabular-nums">{count}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export interface MinutesSectionPanelProps {
  section: MinutesSectionKey;
  minutes: StructuredMinutes;
  /** 담당자로 고를 수 있는 이 회의 참석자 */
  roster: readonly Participant[];
  disabled?: boolean;
  onChange: (minutes: StructuredMinutes) => void;
}

/** 고른 구역 하나의 편집 내용 */
export function MinutesSectionPanel({ section, minutes, roster, disabled = false, onChange }: MinutesSectionPanelProps) {
  const title = MINUTES_SECTIONS.find(({ key }) => key === section)?.title ?? '';

  if (section === 'summary') {
    return (
      <section aria-label={title} className="flex flex-col gap-3">
        <h2 className="text-title text-text">{title}</h2>
        <TextArea
          label={title}
          hideLabel
          textSize="large"
          minRows={6}
          value={minutes.summary}
          disabled={disabled}
          onChange={(event) => onChange({ ...minutes, summary: event.target.value })}
        />
      </section>
    );
  }

  if (section === 'actionItems') return <ActionItems minutes={minutes} roster={roster} disabled={disabled} onChange={onChange} />;

  const key: ListKey = section;
  const items = minutes[key];
  const setItems = (next: string[]) => onChange({ ...minutes, [key]: next });
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <SectionHead title={title} disabled={disabled} onAdd={() => setItems([...items, ''])} />
      {items.length === 0 && <p className="py-6 text-center text-body text-text-muted">항목 없음</p>}
      {items.map((value, index) => (
        <div key={index} className="flex items-start gap-2">
          <span className="mt-3.5 w-6 shrink-0 text-right text-label text-text-muted tabular-nums tablet:mt-4">{index + 1}</span>
          <TextArea
            label={`${title} ${index + 1}`}
            hideLabel
            textSize="large"
            className="min-w-0 flex-1"
            value={value}
            disabled={disabled}
            error={value.trim() ? undefined : EMPTY_ITEM}
            onChange={(event) => setItems(items.map((current, at) => (at === index ? event.target.value : current)))}
          />
          <IconButton icon={X} label={`${title} ${index + 1} 삭제`} variant="surface" disabled={disabled} onClick={() => setItems(items.filter((_, at) => at !== index))} />
        </div>
      ))}
    </section>
  );
}

function ActionItems({ minutes, roster, disabled, onChange }: { minutes: StructuredMinutes; roster: readonly Participant[]; disabled: boolean; onChange: (minutes: StructuredMinutes) => void }) {
  function setAction(index: number, patch: Partial<StructuredMinutesActionItem>) {
    onChange({ ...minutes, actionItems: minutes.actionItems.map((item, at) => (at === index ? { ...item, ...patch } : item)) });
  }
  return (
    <section aria-label="실행 항목" className="flex flex-col gap-3">
      <SectionHead
        title="실행 항목"
        disabled={disabled}
        onAdd={() => onChange({ ...minutes, actionItems: [...minutes.actionItems, { task: '', ownerParticipantId: null, dueDate: null }] })}
      />
      {minutes.actionItems.length === 0 && <p className="py-6 text-center text-body text-text-muted">항목 없음</p>}
      {minutes.actionItems.map((action, index) => {
        const ownerKnown = action.ownerParticipantId === null || roster.some(({ id }) => id === action.ownerParticipantId);
        return (
          <div key={index} className="flex flex-col gap-3 rounded-lg border border-border p-3 tablet:p-4">
            <div className="flex items-start gap-2">
              <TextArea
                label={`할 일 ${index + 1}`}
                textSize="large"
                className="min-w-0 flex-1"
                value={action.task}
                disabled={disabled}
                error={action.task.trim() ? undefined : EMPTY_ITEM}
                onChange={(event) => setAction(index, { task: event.target.value })}
              />
              <IconButton
                icon={X}
                label={`실행 항목 ${index + 1} 삭제`}
                variant="surface"
                className="mt-7"
                disabled={disabled}
                onClick={() => onChange({ ...minutes, actionItems: minutes.actionItems.filter((_, at) => at !== index) })}
              />
            </div>
            <div className="grid gap-3 tablet:grid-cols-2">
              <SelectField
                label={`담당 ${index + 1}`}
                value={action.ownerParticipantId ?? ''}
                disabled={disabled}
                onChange={(event) => setAction(index, { ownerParticipantId: event.target.value || null })}
              >
                <option value="">담당자 없음</option>
                {!ownerKnown && action.ownerParticipantId && <option value={action.ownerParticipantId}>기존 담당자 유지</option>}
                {roster.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </SelectField>
              <div className="flex items-end gap-2">
                <DateField
                  label={`기한 ${index + 1}`}
                  className="min-w-0 flex-1"
                  value={action.dueDate ?? ''}
                  disabled={disabled}
                  invalid={!validDueDate(action.dueDate)}
                  onChange={(value) => setAction(index, { dueDate: value })}
                />
                {action.dueDate && (
                  <IconButton icon={X} label={`기한 ${index + 1} 지우기`} variant="surface" disabled={disabled} onClick={() => setAction(index, { dueDate: null })} />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function SectionHead({ title, disabled, onAdd }: { title: string; disabled: boolean; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-title text-text">{title}</h2>
      <Button size="sm" variant="secondary" shape="pill" icon={Plus} disabled={disabled} onClick={onAdd} aria-label={`${title} 추가`}>
        추가
      </Button>
    </div>
  );
}
