import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { Copy, ExternalLink, RefreshCw, ScrollText } from 'lucide-react';
import { getMeetingDetail, MeetingDetailApiError, type MeetingDetail } from '../meetingDetailApi';
import type { ReviewSpeaker } from '../reviewApi';
import { speakerColorAt } from '../review/speakerColors';
import { speakerDisplayLabel } from '../review/speakerPreview';
import { TranscriptList } from '../review/TranscriptList';
import {
  AppShell,
  Button,
  ButtonAnchor,
  ButtonLink,
  Card,
  Dialog,
  Icon,
  IconButton,
  TABLET_LG_QUERY,
  TABLET_QUERY,
  Tabs,
  useMediaQuery,
  useToast,
} from '../ui';
import { formatMeetingAtLong } from './meetingFormat';
import { minutesText, ownerName, safeDocumentUrl, sectionId, visibleSections, type SectionKey } from './meetingView';

/*
 * MIN-02 회의록 상세 (GitHub #33, docs/renewal/화면기획/MIN-02_회의록상세.md). 읽기 전용.
 * - 섹션 이름·순서는 검토 화면(MTG-04)과 같다: 회의 요약 / 논의 내용 / 결정 사항 / 후속 조치 / 실행 항목. 내용 없는 섹션은 숨긴다
 * - 큰 태블릿: 왼쪽 본문(읽기 폭 720) + 오른쪽 패널 384(목차 / 전사 원문 탭), 두 단 따로 스크롤
 * - 그보다 작으면: 본문 위 섹션 칩(목차), 전사 원문은 상단 바 버튼 → 대화상자(휴대폰 하단 시트)
 * - 상단 바: 목록으로(조건 유지), 원본 문서(URL 있을 때만, 새 탭), 복사(토스트). 휴대폰은 아이콘 버튼
 */

type Load = { status: 'loading' } | { status: 'not-found' } | { status: 'error' } | { status: 'ready'; detail: MeetingDetail };

export function MeetingDetailRoute() {
  const { documentId = '' } = useParams();
  return <MeetingDetailScreen key={documentId} documentId={documentId} />;
}

function MeetingDetailScreen({ documentId }: { documentId: string }) {
  const location = useLocation();
  const listSearch = (location.state as { listSearch?: string } | null)?.listSearch;
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const wide = useMediaQuery(TABLET_LG_QUERY);
  const tablet = useMediaQuery(TABLET_QUERY);

  useEffect(() => {
    let live = true;
    getMeetingDetail(documentId)
      .then((detail) => live && setLoad({ status: 'ready', detail }))
      .catch((reason: unknown) => {
        if (!live) return;
        setLoad({ status: reason instanceof MeetingDetailApiError && reason.code === 'MEETING_NOT_FOUND' ? 'not-found' : 'error' });
      });
    return () => {
      live = false;
    };
  }, [documentId, attempt]);

  const detail = load.status === 'ready' ? load.detail : null;
  const documentUrl = detail ? safeDocumentUrl(detail.documentUrl) : null;

  return (
    <AppShell
      title="회의록"
      hideTitle
      back={{ to: `/meetings${listSearch ? `?${listSearch}` : ''}`, label: '회의록 목록' }}
      fillHeight={wide && detail ? 'tablet-lg' : false}
      actions={
        detail && (
          <DetailActions
            detail={detail}
            documentUrl={documentUrl}
            compact={!tablet}
            showTranscript={!wide}
            onTranscript={() => setTranscriptOpen(true)}
          />
        )
      }
    >
      {load.status === 'loading' && <DetailSkeleton />}
      {load.status === 'not-found' && (
        <Card className="flex flex-col items-center gap-4 py-10">
          <p className="text-body text-text">회의록을 찾을 수 없습니다</p>
          <ButtonLink to="/meetings" variant="secondary" shape="pill">
            회의록 목록
          </ButtonLink>
        </Card>
      )}
      {load.status === 'error' && (
        <Card className="flex flex-col items-start gap-4 tablet:flex-row tablet:items-center">
          <p className="flex-1 text-body text-text">회의록을 불러오지 못했습니다</p>
          <Button
            variant="secondary"
            shape="pill"
            icon={RefreshCw}
            onClick={() => {
              setLoad({ status: 'loading' });
              setAttempt((value) => value + 1);
            }}
          >
            다시 시도
          </Button>
        </Card>
      )}
      {detail &&
        (wide ? (
          <div className="flex min-h-0 flex-1 gap-6">
            {/* 본문 단만 따로 스크롤. 키보드로도 스크롤할 수 있게 초점을 받는다 */}
            <section aria-label="회의록 본문" tabIndex={0} className="-m-1.5 min-h-0 flex-1 overflow-y-auto p-1.5">
              <MinutesArticle detail={detail} />
            </section>
            <SidePanel detail={detail} />
          </div>
        ) : (
          <>
            <MinutesArticle detail={detail} withChips />
            <Dialog open={transcriptOpen} onOpenChange={setTranscriptOpen} title="전사 원문" size="form">
              <Transcript detail={detail} />
            </Dialog>
          </>
        ))}
    </AppShell>
  );
}

function DetailActions({
  detail,
  documentUrl,
  compact,
  showTranscript,
  onTranscript,
}: {
  detail: MeetingDetail;
  documentUrl: string | null;
  compact: boolean;
  showTranscript: boolean;
  onTranscript: () => void;
}) {
  const toast = useToast();
  const copy = () => {
    const text = minutesText(detail);
    const done = navigator.clipboard?.writeText(text);
    if (!done) {
      toast({ message: '복사하지 못했습니다', tone: 'danger' });
      return;
    }
    done.then(
      () => toast({ message: '회의록을 복사했습니다', tone: 'success' }),
      () => toast({ message: '복사하지 못했습니다', tone: 'danger' }),
    );
  };

  if (compact) {
    return (
      <>
        {showTranscript && <IconButton icon={ScrollText} label="전사 원문" variant="surface" onClick={onTranscript} />}
        {documentUrl && (
          <a
            href={documentUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="원본 문서"
            className="inline-flex size-12 items-center justify-center rounded-full border border-border bg-bg text-text shadow-card active:bg-bg-subtle"
          >
            <Icon icon={ExternalLink} size="lg" />
          </a>
        )}
        <IconButton icon={Copy} label="복사" variant="surface" onClick={copy} />
      </>
    );
  }
  return (
    <>
      {showTranscript && (
        <Button variant="secondary" shape="pill" icon={ScrollText} onClick={onTranscript}>
          전사 원문
        </Button>
      )}
      {documentUrl && (
        <ButtonAnchor href={documentUrl} newTab variant="secondary" shape="pill" icon={ExternalLink}>
          원본 문서
        </ButtonAnchor>
      )}
      <Button variant="secondary" shape="pill" icon={Copy} onClick={copy}>
        복사
      </Button>
    </>
  );
}

function scrollToSection(key: SectionKey) {
  const target = document.getElementById(sectionId(key));
  if (!target) return;
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  target.focus({ preventScroll: true });
}

/** 회의 정보 + 섹션 칩(작은 화면) + 본문 */
function MinutesArticle({ detail, withChips = false }: { detail: MeetingDetail; withChips?: boolean }) {
  const sections = visibleSections(detail);
  const people = detail.participants.map(({ name }) => name).join(', ');
  return (
    <article aria-labelledby="meeting-title" className="mx-auto flex w-full max-w-reading flex-col gap-6 pb-6">
      <header className="flex flex-col gap-2">
        <h2 id="meeting-title" className="text-headline text-text">
          {detail.title}
        </h2>
        <p className="text-caption text-text-muted">
          <span className="tabular-nums">{formatMeetingAtLong(detail.meetingAt)}</span>
          {' · '}
          {people ? `참석자 ${people}` : '참석자 정보 없음'}
        </p>
      </header>
      {withChips && sections.length > 1 && (
        <nav aria-label="목차" className="-mx-4 overflow-x-auto px-4 tablet:-mx-6 tablet:px-6">
          <ul className="flex gap-2 py-1">
            {sections.map(({ key, title }) => (
              <li key={key} className="shrink-0">
                <button
                  type="button"
                  onClick={() => scrollToSection(key)}
                  className="relative inline-flex h-10 cursor-pointer items-center rounded-full border border-border bg-bg px-4 text-label text-text before:absolute before:inset-x-0 before:-inset-y-1 active:bg-selected"
                >
                  {title}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <Card className="flex flex-col gap-8">
        {sections.map(({ key, title }) => (
          <section key={key} id={sectionId(key)} tabIndex={-1} aria-labelledby={`${sectionId(key)}-title`} className="flex scroll-mt-4 flex-col gap-3 outline-none">
            <h3 id={`${sectionId(key)}-title`} className="text-title text-text">
              {title}
            </h3>
            <SectionBody detail={detail} sectionKey={key} />
          </section>
        ))}
      </Card>
    </article>
  );
}

function SectionBody({ detail, sectionKey }: { detail: MeetingDetail; sectionKey: SectionKey }) {
  if (sectionKey === 'summary') {
    return detail.minutes.summary ? (
      <p className="text-body-lg whitespace-pre-line text-text">{detail.minutes.summary}</p>
    ) : (
      <p className="text-body-lg text-text-muted">요약이 없습니다.</p>
    );
  }
  if (sectionKey === 'actionItems') {
    return (
      <ul className="flex flex-col rounded-lg border border-border">
        {detail.minutes.actionItems.map((item, index) => {
          const owner = ownerName(detail, item.ownerParticipantId);
          return (
            <li key={`${index}-${item.task}`} className="flex min-h-18 flex-col justify-center gap-1 border-b border-border px-4 py-3 last:border-b-0 tablet:min-h-19">
              <span className="text-body text-text">{item.task}</span>
              <span className="text-caption text-text-muted">
                담당 {owner ?? '미지정'} · 기한 <span className="tabular-nums">{item.dueDate ?? '없음'}</span>
              </span>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <ul className="flex list-disc flex-col gap-2 pl-6 marker:text-text-muted">
      {detail.minutes[sectionKey].map((item, index) => (
        <li key={`${index}-${item}`} className="text-body-lg text-text">
          {item}
        </li>
      ))}
    </ul>
  );
}

/** 큰 태블릿 오른쪽 패널 384: 목차 / 전사 원문 */
function SidePanel({ detail }: { detail: MeetingDetail }) {
  const [tab, setTab] = useState<'toc' | 'transcript'>('toc');
  return (
    <Card as="section" padding="none" aria-label="목차와 전사 원문" className="flex min-h-0 w-96 shrink-0 flex-col overflow-hidden">
      <Tabs
        label="보기"
        value={tab}
        onChange={setTab}
        className="min-h-0 flex-1"
        panelClassName="overflow-y-auto"
        items={[
          {
            value: 'toc',
            label: '목차',
            content: (
              <ul className="flex flex-col gap-1 p-2">
                {visibleSections(detail).map(({ key, title }) => (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => scrollToSection(key)}
                      className="flex h-15 w-full cursor-pointer items-center rounded-md px-4 text-left text-label text-text active:bg-selected"
                    >
                      {title}
                    </button>
                  </li>
                ))}
              </ul>
            ),
          },
          { value: 'transcript', label: '전사 원문', content: <Transcript detail={detail} /> },
        ]}
      />
    </Card>
  );
}

/** 전사 원문 (MIN-02-P01). 화자 이름은 참석자 이름, 없으면 "화자 A". 화자 색은 처음 말한 순서대로 검토 화면과 같은 색 목록 */
function Transcript({ detail }: { detail: MeetingDetail }) {
  const names = new Map(detail.participants.map(({ id, name }) => [id, name]));
  const ordered = [...detail.transcript].sort((left, right) => left.startMs - right.startMs);
  const order = [...new Set(ordered.map(({ speakerId }) => speakerId))];
  const speakers: ReviewSpeaker[] = order.map((speakerId) => ({ speakerId, label: speakerId, participantId: null }));
  return (
    <TranscriptList
      segments={detail.transcript}
      speakers={speakers}
      nameOf={(speaker) => names.get(speaker.speakerId) ?? speakerDisplayLabel(speaker.label)}
      colorOf={(speakerId) => speakerColorAt(order.indexOf(speakerId))}
    />
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="회의록 불러오는 중" className="mx-auto flex w-full max-w-reading flex-col gap-6">
      <div className="flex flex-col gap-3">
        <span className="h-7 w-2/3 animate-pulse rounded-full bg-bg/70 motion-reduce:animate-none" />
        <span className="h-4 w-1/2 animate-pulse rounded-full bg-bg/70 motion-reduce:animate-none" />
      </div>
      <Card className="flex flex-col gap-4">
        {[0, 1, 2, 3].map((row) => (
          <span key={row} className="h-4 animate-pulse rounded-full bg-bg-subtle motion-reduce:animate-none" />
        ))}
      </Card>
    </div>
  );
}
