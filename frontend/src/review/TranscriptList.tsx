import { useEffect, useRef } from 'react';
import type { ReviewSpeaker, TranscriptSegment } from '../reviewApi';
import { cn } from '../ui';
import { formatClock } from './speakerPreview';

/**
 * 전사 원문 (MTG-04-P01, 문서 3.5). 화자 이름(지정한 참석자 또는 "화자 A") + 시작 시각 + 발화, 시간 순.
 * focusSegmentId가 오면 그 발화로 스크롤하고 잠시 강조한다("원문에서 보기").
 */
export function TranscriptList({
  segments,
  speakers,
  nameOf,
  colorOf,
  focusSegmentId,
}: {
  segments: readonly TranscriptSegment[];
  speakers: readonly ReviewSpeaker[];
  /** 화자 표시 이름 (매핑한 참석자 이름 또는 화자 라벨) */
  nameOf: (speaker: ReviewSpeaker) => string;
  colorOf: (speakerId: string) => string;
  focusSegmentId?: string | null;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const ordered = [...segments].sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  const byId = new Map(speakers.map((speaker) => [speaker.speakerId, speaker]));

  useEffect(() => {
    if (!focusSegmentId) return;
    const target = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-segment]') ?? [])].find((item) => item.dataset.segment === focusSegmentId);
    target?.scrollIntoView?.({ block: 'center' });
  }, [focusSegmentId]);

  if (ordered.length === 0) return <p className="p-4 text-body text-text-muted">전사 원문이 없습니다.</p>;

  return (
    <ol ref={listRef} aria-label="전사 원문" className="flex flex-col gap-1 p-2">
      {ordered.map((segment) => {
        const speaker = byId.get(segment.speakerId);
        return (
          <li
            key={segment.segmentId}
            data-segment={segment.segmentId}
            className={cn('flex flex-col gap-1 rounded-md px-3 py-3', segment.segmentId === focusSegmentId && 'bg-selected')}
          >
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className={cn('size-3 shrink-0 rounded-full', colorOf(segment.speakerId))} />
              <span className="text-label text-text">{speaker ? nameOf(speaker) : segment.speakerId}</span>
              <span className="text-caption text-text-muted tabular-nums">{formatClock(segment.startMs)}</span>
            </span>
            <span className="text-body-lg text-text">{segment.text}</span>
          </li>
        );
      })}
    </ol>
  );
}
