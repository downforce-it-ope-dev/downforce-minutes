import { describe, expect, it } from 'vitest';
import type { TranscriptSegment } from '../reviewApi';
import {
  formatClock,
  formatDuration,
  orderSpeakersByTalkTime,
  representativeUtterances,
  speakerDisplayLabel,
  speakerShortLabel,
  speakerStats,
} from './speakerPreview';

function seg(segmentId: string, speakerId: string, startSec: number, endSec: number, text: string): TranscriptSegment {
  return { segmentId, speakerId, startMs: startSec * 1000, endMs: endSec * 1000, text };
}

const speakers = [
  { speakerId: 'a', label: 'Speaker A', participantId: null },
  { speakerId: 'b', label: 'Speaker B', participantId: null },
  { speakerId: 'c', label: 'speaker_c', participantId: null },
];

describe('화자 통계', () => {
  it('발화 횟수·말한 시간·전체 대비 비율을 화자별로 계산하고, 발화가 없는 화자는 0으로 둔다', () => {
    const stats = speakerStats(speakers, [seg('1', 'a', 0, 30, '가'), seg('2', 'b', 30, 40, '나'), seg('3', 'a', 40, 70, '다'), seg('4', 'x', 70, 80, '모르는 화자')]);
    expect(stats.get('a')).toEqual({ count: 2, totalMs: 60_000, ratio: 60 / 70 });
    expect(stats.get('b')).toEqual({ count: 1, totalMs: 10_000, ratio: 10 / 70 });
    expect(stats.get('c')).toEqual({ count: 0, totalMs: 0, ratio: 0 });
  });

  it('끝 시각이 시작보다 앞선 구간은 0으로 센다', () => {
    expect(speakerStats(speakers, [seg('1', 'a', 10, 5, '잘못된 구간')]).get('a')).toEqual({ count: 1, totalMs: 0, ratio: 0 });
  });

  it('말한 시간이 긴 화자부터 정렬하고 같으면 서버 순서를 지킨다', () => {
    const stats = speakerStats(speakers, [seg('1', 'b', 0, 50, '가'), seg('2', 'a', 50, 60, '나'), seg('3', 'c', 60, 70, '다')]);
    expect(orderSpeakersByTalkTime(speakers, stats).map(({ speakerId }) => speakerId)).toEqual(['b', 'a', 'c']);
  });
});

describe('대표 발화', () => {
  const segments = [
    seg('1', 'a', 0, 2, '네'),
    seg('2', 'a', 3, 10, '이번 주 배포 일정부터 정리하고 넘어갈게요.'),
    seg('3', 'b', 11, 12, '저는 반대입니다 그 부분은 다시 봐야 합니다'),
    seg('4', 'a', 13, 20, 'QA는 목요일까지 끝내는 걸로 하고 금요일에 배포합니다.'),
    seg('5', 'a', 21, 22, '좋아요'),
    seg('6', 'a', 23, 30, '그럼 결정 사항은 그렇게 정리할게요.'),
    seg('7', 'a', 31, 40, '다음 주에는 고객사 일정 확인이 먼저입니다'),
  ];

  it('10자 이상 발화에서 긴 순으로 고른 뒤 시각 순으로 보인다', () => {
    expect(representativeUtterances('a', segments, 3).map(({ segmentId }) => segmentId)).toEqual(['2', '4', '7']);
  });

  it('10자 이상 발화가 모자라면 남은 칸을 앞 발화로 채운다', () => {
    const short = [seg('1', 'a', 0, 1, '네'), seg('2', 'a', 2, 3, '이번 주 배포 일정부터 정리'), seg('3', 'a', 4, 5, '좋아요'), seg('4', 'a', 6, 7, '맞아요')];
    expect(representativeUtterances('a', short, 3).map(({ segmentId }) => segmentId)).toEqual(['1', '2', '3']);
  });

  it('빈 발화는 고르지 않고, 다른 화자의 발화는 섞지 않는다', () => {
    expect(representativeUtterances('b', [...segments, seg('8', 'b', 50, 51, '   ')], 3).map(({ segmentId }) => segmentId)).toEqual(['3']);
    expect(representativeUtterances('c', segments, 3)).toEqual([]);
  });
});

describe('표시 형식', () => {
  it('서버 라벨을 "화자 A"로 바꾸고, 모르는 형식은 그대로 둔다', () => {
    expect(speakerDisplayLabel('Speaker A')).toBe('화자 A');
    expect(speakerDisplayLabel('speaker_b')).toBe('화자 B');
    expect(speakerDisplayLabel('C')).toBe('화자 C');
    expect(speakerDisplayLabel('사회자')).toBe('사회자');
    expect(speakerShortLabel('Speaker A')).toBe('A');
  });

  it('시각은 mm:ss(1시간 이상 h:mm:ss), 길이는 분·초로 보인다', () => {
    expect(formatClock(65_000)).toBe('01:05');
    expect(formatClock(3_725_000)).toBe('1:02:05');
    expect(formatDuration(372_000)).toBe('6분 12초');
    expect(formatDuration(45_000)).toBe('45초');
    expect(formatDuration(120_000)).toBe('2분');
  });
});
