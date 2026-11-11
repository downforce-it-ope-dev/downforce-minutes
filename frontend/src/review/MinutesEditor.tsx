import { Plus, X } from 'lucide-react';
import type { Participant } from '../participantsApi';
import type { StructuredMinutes, StructuredMinutesActionItem } from '../reviewApi';
import { Button, Card, DateField, IconButton, SelectField, TextArea } from '../ui';
import { validDueDate } from './minutesValidation';

/*
 * 회의록 편집 (MTG-04-F01~F03, 문서 3.1). 회의 요약, 논의 내용·결정 사항·후속 조치(항목 목록), 실행 항목(할 일·담당·기한).
 * 빈 항목은 입력란 아래 오류 문구(대화상자 밖이지만 어느 항목인지 알려야 해 문서 3.1을 따른다), 삭제·추가 버튼은 늘 보인다.
 */

type ListKey = 'discussionPoints' | 'decisions' | 'followUps';

const LIST_SECTIONS: ReadonlyArray<{ key: ListKey; title: string; item: string }> = [
  { key: 'discussionPoints', title: '논의 내용', item: '논의 내용' },
  { key: 'decisions', title: '결정 사항', item: '결정 사항' },
  { key: 'followUps', title: '후속 조치', item: '후속 조치' },
];

const EMPTY_ITEM = '내용을 입력해 주세요.';

export interface MinutesEditorProps {
  minutes: StructuredMinutes;
  /** 담당자로 고를 수 있는 이 회의 참석자 */
  roster: readonly Participant[];
  disabled?: boolean;
  onChange: (minutes: StructuredMinutes) => void;
}

export function MinutesEditor({ minutes, roster, disabled = false, onChange }: MinutesEditorProps) {
  function setList(key: ListKey, items: string[]) {
    onChange({ ...minutes, [key]: items });
  }
  function setAction(index: number, patch: Partial<StructuredMinutesActionItem>) {
    onChange({ ...minutes, actionItems: minutes.actionItems.map((item, at) => (at === index ? { ...item, ...patch } : item)) });
  }

  return (
    <div className="flex flex-col gap-6 tablet:gap-8">
      <Card as="section" aria-labelledby="minutes-summary-title" className="flex flex-col gap-3">
        <h2 id="minutes-summary-title" className="text-title text-text">
          회의 요약
        </h2>
        <TextArea
          label="회의 요약"
          hideLabel
          minRows={3}
          value={minutes.summary}
          disabled={disabled}
          onChange={(event) => onChange({ ...minutes, summary: event.target.value })}
        />
      </Card>

      {LIST_SECTIONS.map(({ key, title, item }) => (
        <Card as="section" key={key} aria-labelledby={`minutes-${key}-title`} className="flex flex-col gap-3">
          <SectionHead id={`minutes-${key}-title`} title={title} disabled={disabled} onAdd={() => setList(key, [...minutes[key], ''])} />
          {minutes[key].map((value, index) => (
            <div key={index} className="flex items-start gap-2">
              <TextArea
                label={`${item} ${index + 1}`}
                hideLabel
                className="min-w-0 flex-1"
                value={value}
                disabled={disabled}
                error={value.trim() ? undefined : EMPTY_ITEM}
                onChange={(event) => setList(key, minutes[key].map((current, at) => (at === index ? event.target.value : current)))}
              />
              <IconButton
                icon={X}
                label={`${item} ${index + 1} 삭제`}
                variant="surface"
                disabled={disabled}
                onClick={() => setList(key, minutes[key].filter((_, at) => at !== index))}
              />
            </div>
          ))}
        </Card>
      ))}

      <Card as="section" aria-labelledby="minutes-actions-title" className="flex flex-col gap-3">
        <SectionHead
          id="minutes-actions-title"
          title="실행 항목"
          disabled={disabled}
          onAdd={() => onChange({ ...minutes, actionItems: [...minutes.actionItems, { task: '', ownerParticipantId: null, dueDate: null }] })}
        />
        {minutes.actionItems.map((action, index) => {
          const ownerKnown = action.ownerParticipantId === null || roster.some(({ id }) => id === action.ownerParticipantId);
          return (
            <div key={index} className="flex flex-col gap-3 rounded-lg border border-border p-3 tablet:p-4">
              <div className="flex items-start gap-2">
                <TextArea
                  label={`할 일 ${index + 1}`}
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
      </Card>
    </div>
  );
}

function SectionHead({ id, title, disabled, onAdd }: { id: string; title: string; disabled: boolean; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="text-title text-text">
        {title}
      </h2>
      <Button size="sm" variant="secondary" shape="pill" icon={Plus} disabled={disabled} onClick={onAdd} aria-label={`${title} 추가`}>
        추가
      </Button>
    </div>
  );
}
