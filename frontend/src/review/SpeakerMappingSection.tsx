import { useMemo, useState } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import type { Participant } from '../participantsApi';
import type { ReviewSpeaker, TranscriptSegment } from '../reviewApi';
import { Button, ButtonLink, Card, ChipRadioGroup, cn, Icon, ProgressBar } from '../ui';
import {
  formatClock,
  formatDuration,
  MAX_PREVIEW_COUNT,
  orderSpeakersByTalkTime,
  representativeUtterances,
  speakerDisplayLabel,
  speakerShortLabel,
  speakerStats,
} from './speakerPreview';
import type { SaveStatus } from './useReviewSession';

/*
 * 화자 매핑 (MTG-04-F05·F12, 문서 3.7). 화자 1명당 카드 1장: 통계, 대표 발화, 참석자 칩(한 번 눌러 지정, 자동 저장).
 * 카드 순서는 말한 시간이 긴 화자부터이고 지정해도 바뀌지 않는다. 설명 문구는 두지 않는다(S-13).
 */

const PREVIEW_COUNT = 3;

export interface SpeakerMappingSectionProps {
  speakers: readonly ReviewSpeaker[];
  segments: readonly TranscriptSegment[];
  roster: readonly Participant[];
  valueOf: (speakerId: string) => string | null;
  nameOf: (speaker: ReviewSpeaker) => string;
  colorOf: (speakerId: string) => string;
  status: SaveStatus;
  canMap: boolean;
  needsSettings: boolean;
  rosterStatus: 'loading' | 'ready' | 'error';
  onAssign: (speakerId: string, participantId: string | null) => void;
  onRetry: () => void;
  onReloadRoster: () => void;
  onShowInTranscript: (segmentId: string) => void;
  /** two: 태블릿 세로 2열 / one: 1열(휴대폰, 태블릿 가로 오른쪽 패널) */
  columns?: 'auto' | 'one';
  className?: string;
}

export function SpeakerMappingSection({
  speakers,
  segments,
  roster,
  valueOf,
  nameOf,
  colorOf,
  status,
  canMap,
  needsSettings,
  rosterStatus,
  onAssign,
  onRetry,
  onReloadRoster,
  onShowInTranscript,
  columns = 'auto',
  className,
}: SpeakerMappingSectionProps) {
  const stats = useMemo(() => speakerStats(speakers, segments), [speakers, segments]);
  const ordered = useMemo(() => orderSpeakersByTalkTime(speakers, stats), [speakers, stats]);
  const assigned = speakers.filter(({ speakerId }) => valueOf(speakerId)).length;

  return (
    <section aria-labelledby="speaker-mapping-title" className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="speaker-mapping-title" className="text-title text-text">
            화자 매핑
          </h2>
          <div className="flex items-center gap-3">
            <MappingStatus status={status} onRetry={onRetry} />
            <p className="text-label text-text tabular-nums">
              {speakers.length}명 중 {assigned}명 지정
            </p>
          </div>
        </div>
        {speakers.length > 0 && <ProgressBar label="화자 지정 진행" value={assigned} max={speakers.length} valueText={`${speakers.length}명 중 ${assigned}명 지정`} />}
      </div>

      {needsSettings && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-warning-soft p-4">
          <p className="text-label text-warning-text">문서 연결 필요</p>
          <ButtonLink to="/settings/document" size="sm" variant="secondary" shape="pill">
            문서 연결
          </ButtonLink>
        </div>
      )}
      {rosterStatus === 'error' && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-danger-soft p-4">
          <p className="text-label text-danger-text">참석자 목록을 불러오지 못했습니다.</p>
          <Button size="sm" variant="secondary" shape="pill" icon={RefreshCw} onClick={onReloadRoster}>
            다시 불러오기
          </Button>
        </div>
      )}

      {speakers.length === 0 ? (
        <p className="text-body text-text-muted">감지된 화자가 없습니다.</p>
      ) : (
        <ul className={cn('grid gap-4', columns === 'auto' && speakers.length > 1 && 'tablet:grid-cols-2')}>
          {ordered.map((speaker) => (
            <SpeakerCard
              key={speaker.speakerId}
              speaker={speaker}
              speakers={speakers}
              segments={segments}
              roster={roster}
              stats={stats.get(speaker.speakerId)}
              valueOf={valueOf}
              nameOf={nameOf}
              color={colorOf(speaker.speakerId)}
              disabled={!canMap}
              onAssign={onAssign}
              onShowInTranscript={onShowInTranscript}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function MappingStatus({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === 'saving') return <p className="text-caption text-text-muted">저장 중</p>;
  if (status === 'saved') return <p className="text-caption text-text-muted">저장됨</p>;
  if (status === 'error')
    return (
      <Button size="sm" variant="ghost" icon={RefreshCw} onClick={onRetry}>
        다시 저장
      </Button>
    );
  return null;
}

function SpeakerCard({
  speaker,
  speakers,
  segments,
  roster,
  stats,
  valueOf,
  nameOf,
  color,
  disabled,
  onAssign,
  onShowInTranscript,
}: {
  speaker: ReviewSpeaker;
  speakers: readonly ReviewSpeaker[];
  segments: readonly TranscriptSegment[];
  roster: readonly Participant[];
  stats?: { count: number; totalMs: number; ratio: number };
  valueOf: (speakerId: string) => string | null;
  nameOf: (speaker: ReviewSpeaker) => string;
  color: string;
  disabled: boolean;
  onAssign: (speakerId: string, participantId: string | null) => void;
  onShowInTranscript: (segmentId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = speakerDisplayLabel(speaker.label);
  const value = valueOf(speaker.speakerId);
  const previews = useMemo(
    () => representativeUtterances(speaker.speakerId, segments, expanded ? MAX_PREVIEW_COUNT : PREVIEW_COUNT),
    [speaker.speakerId, segments, expanded],
  );
  const total = segments.filter((segment) => segment.speakerId === speaker.speakerId && segment.text.trim()).length;

  // 다른 화자에 이미 지정된 참석자는 칩에 "· B"를 붙인다(그래도 고를 수 있다)
  const otherOwner = (participantId: string) => {
    const other = speakers.find((item) => item.speakerId !== speaker.speakerId && valueOf(item.speakerId) === participantId);
    return other ? speakerShortLabel(other.label) : null;
  };
  const options = [
    ...roster.map(({ id, name }) => {
      const owner = otherOwner(id);
      return { value: id, label: name, hint: owner ? `· ${owner}` : undefined, hintLabel: owner ? `화자 ${owner}에 지정됨` : undefined };
    }),
    // 참석자 목록에 없는 사람이 지정돼 있으면 그대로 보인다
    ...(value && !roster.some(({ id }) => id === value) ? [{ value, label: nameOf(speaker) }] : []),
    { value: '', label: '미지정' },
  ];

  return (
    <li>
      <Card as="article" aria-label={label} className="flex h-full flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-label text-text">
              <span aria-hidden="true" className={cn('size-3 rounded-full', color)} />
              {label}
            </h3>
            {stats && (
              <p className="text-caption text-text-muted tabular-nums">
                발화 {stats.count}회 · {formatDuration(stats.totalMs)} ({Math.round(stats.ratio * 100)}%)
              </p>
            )}
          </div>
          {value ? (
            <span className="self-start rounded-full bg-selected px-3 py-1 text-label text-selected-text">{nameOf(speaker)}</span>
          ) : (
            <span className="inline-flex items-center gap-1 self-start rounded-full bg-warning-soft px-3 py-1 text-label text-warning-text">
              <Icon icon={TriangleAlert} size="sm" />
              미지정
            </span>
          )}
        </div>

        {previews.length > 0 && (
          <ol className="flex flex-col gap-2 border-t border-border pt-3">
            {previews.map((segment, index) => (
              <li key={segment.segmentId} className={cn('flex gap-3', !expanded && index === 2 && 'hidden tablet:flex')}>
                <span className="w-12 shrink-0 text-caption text-text-muted tabular-nums">{formatClock(segment.startMs)}</span>
                <span className="line-clamp-2 text-body text-text">{segment.text}</span>
              </li>
            ))}
          </ol>
        )}
        {(total > PREVIEW_COUNT || previews.length > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {total > PREVIEW_COUNT ? (
              <Button size="sm" variant="ghost" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>
                {expanded ? '접기' : `발화 더 보기 (${total})`}
              </Button>
            ) : (
              <span />
            )}
            {previews[0] && (
              <Button size="sm" variant="ghost" onClick={() => onShowInTranscript(previews[0].segmentId)}>
                원문에서 보기
              </Button>
            )}
          </div>
        )}

        <div className="mt-auto border-t border-border pt-3">
          <ChipRadioGroup
            label={`${label}의 참석자`}
            options={options}
            value={value ?? ''}
            disabled={disabled}
            onChange={(next) => onAssign(speaker.speakerId, next || null)}
          />
        </div>
      </Card>
    </li>
  );
}
