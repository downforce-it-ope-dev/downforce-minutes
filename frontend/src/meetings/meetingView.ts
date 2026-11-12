import type { MeetingDetail } from '../meetingDetailApi';
import type { MeetingSummary } from '../meetingListApi';
import { formatMeetingAtLong } from './meetingFormat';

/** 회의록 목록·상세의 화면 밖 계산 (MIN-01 정렬, MIN-02 섹션·복사 텍스트) */

export type SectionKey = 'summary' | 'discussionPoints' | 'decisions' | 'followUps' | 'actionItems';

export const SECTIONS: ReadonlyArray<{ key: SectionKey; title: string }> = [
  { key: 'summary', title: '회의 요약' },
  { key: 'discussionPoints', title: '논의 내용' },
  { key: 'decisions', title: '결정 사항' },
  { key: 'followUps', title: '후속 조치' },
  { key: 'actionItems', title: '실행 항목' },
];


/** 내용이 있는 섹션만. 요약은 비어도 "요약이 없습니다."로 둔다 */
export function visibleSections(detail: MeetingDetail) {
  return SECTIONS.filter(({ key }) => key === 'summary' || detail.minutes[key].length > 0);
}

export function ownerName(detail: MeetingDetail, id: string | null) {
  if (!id) return null;
  return detail.participants.find((participant) => participant.id === id)?.name ?? null;
}

/** 복사할 회의록 텍스트. 화면과 같은 섹션 순서 (F07) */
export function minutesText(detail: MeetingDetail): string {
  const lines = [detail.title, formatMeetingAtLong(detail.meetingAt)];
  if (detail.participants.length) lines.push(`참석자: ${detail.participants.map(({ name }) => name).join(', ')}`);
  for (const { key, title } of visibleSections(detail)) {
    lines.push('', title);
    if (key === 'summary') lines.push(detail.minutes.summary || '요약이 없습니다.');
    else if (key === 'actionItems') {
      for (const item of detail.minutes.actionItems) {
        const meta = [ownerName(detail, item.ownerParticipantId) && `담당 ${ownerName(detail, item.ownerParticipantId)}`, item.dueDate && `기한 ${item.dueDate}`].filter(Boolean);
        lines.push(`- ${item.task}${meta.length ? ` (${meta.join(', ')})` : ''}`);
      }
    } else for (const item of detail.minutes[key]) lines.push(`- ${item}`);
  }
  return lines.join('\n');
}


export function sortMeetings(meetings: readonly MeetingSummary[], sort: 'new' | 'old'): MeetingSummary[] {
  const time = (meeting: MeetingSummary) => {
    const value = new Date(meeting.meetingAt).getTime();
    return Number.isNaN(value) ? null : value;
  };
  return [...meetings].sort((left, right) => {
    const a = time(left);
    const b = time(right);
    // 날짜를 알 수 없는 회의는 정렬과 관계없이 뒤로
    if (a === null || b === null) return a === null ? (b === null ? 0 : 1) : -1;
    return sort === 'new' ? b - a : a - b;
  });
}

