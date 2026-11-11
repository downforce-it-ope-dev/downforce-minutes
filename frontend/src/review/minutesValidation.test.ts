import { describe, expect, it } from 'vitest';
import { sameMinutes } from './minutesValidation';

const base = {
  templateId: 'default.md',
  templateVersion: '1',
  summary: '요약',
  discussionPoints: ['a'],
  decisions: [],
  actionItems: [{ ownerParticipantId: 'p1', task: '할 일', dueDate: null }],
  followUps: [],
};

describe('sameMinutes', () => {
  it('객체 키 순서가 달라도 내용이 같으면 같다 (화면에서 새로 만든 실행 항목)', () => {
    const reordered = { ...base, actionItems: [{ task: '할 일', dueDate: null, ownerParticipantId: 'p1' }] };
    expect(sameMinutes(base, reordered)).toBe(true);
  });

  it('내용이 다르면 다르다', () => {
    expect(sameMinutes(base, { ...base, summary: '다른 요약' })).toBe(false);
    expect(sameMinutes(base, { ...base, actionItems: [] })).toBe(false);
  });
});
