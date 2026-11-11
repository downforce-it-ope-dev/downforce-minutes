import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { listProcessingFailures, type ProcessingFailureSummary } from '../meetingListApi';
import { ProcessingApiError, retryProcessing } from '../processingApi';
import { Button, Icon, TABLET_QUERY, useMediaQuery, useToast } from '../ui';
import { formatMeetingAt, formatShortDateTime } from './meetingFormat';

const STAGE_LABELS: Record<string, string> = {
  AUDIO_ASSEMBLY: '오디오 준비',
  TRANSCRIPTION: '음성 인식',
  DIARIZATION: '화자 분석',
  MINUTES_GENERATION: '회의록 생성',
  DRAFT_READY: '회의록 생성',
  DRAFT_REGENERATION: '회의록 재생성',
};

function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 처리 실패 내역 (MIN-01-F07·F08). 실패 회의가 없으면 아무것도 그리지 않는다.
 * - 태블릿은 3건, 휴대폰은 1건까지 보이고 나머지는 "모두 보기"로 편다(목록 본문이 밀려나지 않게)
 * - 다시 처리: 서버가 허용(RETRY_PROCESSING)할 때만. 성공하면 회의 처리 화면(MTG-03), 실패는 토스트
 * - 조회 실패도 토스트(다시 시도)로 알린다(S-13)
 */
export function ProcessingFailures() {
  const navigate = useNavigate();
  const toast = useToast();
  const tablet = useMediaQuery(TABLET_QUERY);
  const [items, setItems] = useState<ProcessingFailureSummary[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let live = true;
    listProcessingFailures()
      .then((next) => live && setItems(next))
      .catch(() => {
        if (live) toast({ message: '처리 실패 내역을 불러오지 못했습니다', tone: 'danger', action: { label: '다시 시도', onClick: reload } });
      });
    return () => {
      live = false;
    };
  }, [attempt, reload, toast]);

  const retry = async (item: ProcessingFailureSummary) => {
    setActiveSession(item.sessionId);
    try {
      await retryProcessing(item.sessionId, item.version, newIdempotencyKey());
      navigate(`/meetings/${encodeURIComponent(item.sessionId)}/processing`);
    } catch (reason) {
      toast({
        message: reason instanceof ProcessingApiError && reason.code === 'AUDIO_NOT_AVAILABLE'
          ? '오디오 보관 기간이 지나 다시 처리할 수 없습니다'
          : '다시 처리하지 못했습니다',
        tone: 'danger',
      });
      reload();
      setActiveSession(null);
    }
  };

  if (items.length === 0) return null;
  const limit = tablet ? 3 : 1;
  const visible = expanded ? items : items.slice(0, limit);

  return (
    <section aria-labelledby="processing-failures-title" className="flex shrink-0 flex-col gap-2 rounded-xl bg-danger-soft p-3 tablet:p-4">
      <h2 id="processing-failures-title" className="flex items-center gap-2 px-1 text-title text-danger-text">
        <Icon icon={TriangleAlert} size="lg" />
        처리 실패 <span className="tabular-nums">{items.length}건</span>
      </h2>
      <ul className="flex flex-col gap-2">
        {visible.map((item) => {
          const canRetry = item.allowedActions.includes('RETRY_PROCESSING');
          const stage = STAGE_LABELS[item.stage] ?? '회의 처리';
          const expiry = item.audioExpiresAt ? formatShortDateTime(item.audioExpiresAt) : '';
          return (
            <li key={item.sessionId} className="flex min-h-18 items-center gap-3 rounded-lg bg-bg px-4 py-3 tablet:min-h-19">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-label text-text">{item.title}</span>
                  <span className="shrink-0 rounded-sm bg-danger-soft px-2 py-0.5 text-caption text-danger-text">실패</span>
                </span>
                <span className="text-caption text-text-muted">
                  <span className="tabular-nums">{formatMeetingAt(item.meetingAt)}</span> · {stage} 실패
                </span>
                {(!canRetry || expiry) && (
                  <span className="text-caption text-text-muted tabular-nums">{canRetry ? `오디오 만료 ${expiry}` : '오디오 없음'}</span>
                )}
              </div>
              {canRetry && (
                <Button
                  size="sm"
                  variant="secondary"
                  shape="pill"
                  icon={RotateCcw}
                  className="shrink-0"
                  aria-label={`${item.title} 다시 처리`}
                  loading={activeSession === item.sessionId}
                  disabled={activeSession !== null}
                  onClick={() => void retry(item)}
                >
                  다시 처리
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {items.length > limit && (
        <Button size="sm" variant="ghost" shape="pill" className="self-center" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? '접기' : `모두 보기 ${items.length}`}
        </Button>
      )}
    </section>
  );
}
