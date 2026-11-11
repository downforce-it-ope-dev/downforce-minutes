import type { StructuredMinutes } from '../reviewApi';

/* 회의록 편집 검사 (기존 ReviewMinutesEditor에서 옮김, MTG-04-F02·F03) */

export function validDueDate(value: string | null): boolean {
  if (value === null || value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** 빈 목록 항목·빈 할 일·잘못된 기한이 없으면 저장할 수 있다. 빈 요약·빈 구역은 허용한다 */
export function minutesAreValid(minutes: StructuredMinutes): boolean {
  return (
    [...minutes.discussionPoints, ...minutes.decisions, ...minutes.followUps].every((item) => item.trim().length > 0) &&
    minutes.actionItems.every((item) => item.task.trim().length > 0 && validDueDate(item.dueDate))
  );
}

export function sameMinutes(left: StructuredMinutes | null | undefined, right: StructuredMinutes | null | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function snapshotMinutes(minutes: StructuredMinutes): StructuredMinutes {
  return {
    ...minutes,
    discussionPoints: [...minutes.discussionPoints],
    decisions: [...minutes.decisions],
    actionItems: minutes.actionItems.map((item) => ({ ...item })),
    followUps: [...minutes.followUps],
  };
}
