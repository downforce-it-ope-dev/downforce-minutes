import type { MeetingParticipantSummary } from '../meetingListApi';

/** 회의록 목록·상세의 표시 형식 (MIN-01·MIN-02). 숫자는 화면에서 tabular-nums로 그린다 */

const pad = (value: number) => String(value).padStart(2, '0');

/** 날짜만 있는 값(시각이 없거나 자정 00:00)인지 (MIN-02-F01) */
function isDateOnly(value: string) {
  return !value.includes('T') || /T00:00(?::00(?:\.0+)?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value);
}

/** 목록 행: "2026.11.05 10:00". 날짜만 있으면 "2026.11.05" */
export function formatMeetingAt(value: string): string {
  if (isDateOnly(value)) {
    const [year, month, day] = value.slice(0, 10).split('-');
    return year && month && day ? `${year}.${month}.${day}` : '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 상세 머리: "2026년 11월 5일 오전 10:00". 날짜만 있으면 날짜만 */
export function formatMeetingAtLong(value: string): string {
  if (isDateOnly(value)) {
    const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long', timeStyle: 'short' }).format(date);
}

/** "11.06 10:00" (오디오 만료 시각) */
export function formatShortDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 'YYYY-MM-DD' → "11.01" (기간 칩) */
export function formatChipDate(value: string): string {
  return value ? `${value.slice(5, 7)}.${value.slice(8, 10)}` : '';
}

/** 참석자 최대 3명 + "외 n명" */
export function participantSummary(participants: readonly MeetingParticipantSummary[], max = 3): string {
  const names = participants.slice(0, max).map(({ name }) => name);
  if (participants.length > max) names.push(`외 ${participants.length - max}명`);
  return names.join(', ');
}
