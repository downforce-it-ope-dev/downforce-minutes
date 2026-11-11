import type { ReviewSpeaker, TranscriptSegment } from '../reviewApi';

/*
 * 화자 매핑 카드의 발화 미리보기·통계 (MTG-04-F12, 3.7). API-010 transcript segment로 화면에서 계산하고 서버에 저장하지 않는다.
 */

export type SpeakerStats = {
  /** 발화 횟수 */
  count: number;
  /** 말한 시간 (endMs - startMs 합) */
  totalMs: number;
  /** 전체 발화 시간 대비 비율 0~1 */
  ratio: number;
};

/** 대표 발화로 고를 최소 글자 수 (맞장구·짧은 대답 제외) */
export const MIN_PREVIEW_LENGTH = 10;
/** "발화 더 보기"로 펼칠 수 있는 최대 개수 */
export const MAX_PREVIEW_COUNT = 10;

function durationOf(segment: TranscriptSegment): number {
  return Math.max(0, segment.endMs - segment.startMs);
}

function textLength(segment: TranscriptSegment): number {
  return segment.text.trim().length;
}

/** 화자별 통계. 발화가 없는 화자도 0으로 넣는다 */
export function speakerStats(speakers: readonly ReviewSpeaker[], segments: readonly TranscriptSegment[]): Map<string, SpeakerStats> {
  const totals = new Map<string, { count: number; totalMs: number }>(speakers.map(({ speakerId }) => [speakerId, { count: 0, totalMs: 0 }]));
  let allMs = 0;
  for (const segment of segments) {
    const total = totals.get(segment.speakerId);
    if (!total) continue;
    total.count += 1;
    total.totalMs += durationOf(segment);
    allMs += durationOf(segment);
  }
  return new Map([...totals].map(([speakerId, total]) => [speakerId, { ...total, ratio: allMs > 0 ? total.totalMs / allMs : 0 }]));
}

/**
 * 대표 발화. 그 화자 발화 중 10자 이상인 것에서 글자 수가 많은 순으로 limit개를 고른 뒤 시각 순으로 보인다.
 * 10자 이상 발화가 모자라면 남은 칸을 앞 발화(시각 순)로 채운다.
 */
export function representativeUtterances(speakerId: string, segments: readonly TranscriptSegment[], limit: number): TranscriptSegment[] {
  const own = segments.filter((segment) => segment.speakerId === speakerId && textLength(segment) > 0);
  const byTime = (left: TranscriptSegment, right: TranscriptSegment) => left.startMs - right.startMs || left.endMs - right.endMs;
  const long = own
    .filter((segment) => textLength(segment) >= MIN_PREVIEW_LENGTH)
    .sort((left, right) => textLength(right) - textLength(left) || byTime(left, right))
    .slice(0, limit);
  const picked = new Set(long.map(({ segmentId }) => segmentId));
  const fill = [...own].sort(byTime).filter(({ segmentId }) => !picked.has(segmentId)).slice(0, Math.max(0, limit - long.length));
  return [...long, ...fill].sort(byTime);
}

/** 카드 순서: 말한 시간이 긴 화자부터. 같으면 서버 순서 */
export function orderSpeakersByTalkTime(speakers: readonly ReviewSpeaker[], stats: Map<string, SpeakerStats>): ReviewSpeaker[] {
  return speakers
    .map((speaker, index) => ({ speaker, index }))
    .sort((left, right) => (stats.get(right.speaker.speakerId)?.totalMs ?? 0) - (stats.get(left.speaker.speakerId)?.totalMs ?? 0) || left.index - right.index)
    .map(({ speaker }) => speaker);
}

/** 서버 라벨("Speaker A", "speaker_a", "A")을 "화자 A"로 바꿔 보인다. 형식을 모르면 서버 라벨 그대로 */
export function speakerDisplayLabel(label: string): string {
  const match = /^(?:speaker[\s_-]*)?([a-z0-9]{1,3})$/i.exec(label.trim());
  return match ? `화자 ${match[1].toUpperCase()}` : label;
}

/** 화자 표시의 짧은 이름 ("화자 A" → "A") */
export function speakerShortLabel(label: string): string {
  const display = speakerDisplayLabel(label);
  return display.startsWith('화자 ') ? display.slice(3) : display;
}

/** mm:ss (1시간 이상이면 h:mm:ss) */
export function formatClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const pad = (value: number) => String(value).padStart(2, '0');
  return totalMinutes >= 60 ? `${Math.floor(totalMinutes / 60)}:${pad(totalMinutes % 60)}:${pad(seconds)}` : `${pad(totalMinutes)}:${pad(seconds)}`;
}

/** "6분 12초", "45초" */
export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.round(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}초`;
  return seconds === 0 ? `${minutes}분` : `${minutes}분 ${seconds}초`;
}
