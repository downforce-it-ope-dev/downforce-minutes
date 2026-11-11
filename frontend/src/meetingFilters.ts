import type { MeetingSummary } from './meetingListApi';

export type MeetingFilters = { query: string; from: string; to: string };

export function hasInvalidDateRange(from: string, to: string): boolean {
  return Boolean(from && to && from > to);
}

function localDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalized(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

export function filterMeetings(meetings: MeetingSummary[], filters: MeetingFilters): MeetingSummary[] {
  const query = normalized(filters.query);
  const invalidRange = hasInvalidDateRange(filters.from, filters.to);
  return meetings.filter((meeting) => {
    if (query && !normalized(meeting.title).includes(query)
      && !meeting.participants.some(({ name }) => normalized(name).includes(query))) return false;
    if (!invalidRange) {
      const date = localDate(meeting.meetingAt);
      if (date === null || (filters.from && date < filters.from) || (filters.to && date > filters.to)) return false;
    }
    return true;
  });
}
