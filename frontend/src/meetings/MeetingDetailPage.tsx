import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Copy, RefreshCw, ScrollText, Trash2 } from 'lucide-react';
import { deleteMeeting, getMeetingDetail, MeetingDetailApiError, type MeetingDetail } from '../meetingDetailApi';
import { forgetMeeting } from '../meetingListApi';
import type { ReviewSpeaker } from '../reviewApi';
import { speakerColorAt } from '../review/speakerColors';
import { speakerDisplayLabel } from '../review/speakerPreview';
import { TranscriptList } from '../review/TranscriptList';
import {
  AppShell,
  Button,
  ButtonLink,
  Card,
  Dialog,
  IconButton,
  TABLET_QUERY,
  useMediaQuery,
  useToast,
} from '../ui';
import { formatMeetingAtLong } from './meetingFormat';
import { minutesText, ownerName, visibleSections, type SectionKey } from './meetingView';

/*
 * MIN-02 회의록 상세 (GitHub #33, docs/renewal/화면기획/MIN-02_회의록상세.md). 읽기 전용.
 * - 섹션 이름·순서는 검토 화면(MTG-04)과 같다: 회의 요약 / 논의 내용 / 결정 사항 / 후속 조치 / 실행 항목. 내용 없는 섹션은 숨긴다
 * - 사용자 결정(2026-11-11, 재구성): 좌우 2단 없이 위아래 한 단. 머리 아래에 섹션마다 카드를 쌓고 본문 폭을 그대로 쓴다.
 *   목차(섹션 칩·목차 탭)와 화면 안 전사 원문 패널은 두지 않는다. 전사 원문은 상단 바 버튼 → 대화상자(휴대폰 하단 시트)
 * - 상단 바: 목록으로(조건 유지), 전사 원문, 복사(토스트). 휴대폰은 아이콘 버튼.
 *   원본 문서(노션 등) 열기는 두지 않는다: 문서 서비스는 연결한 사람 계정이라 다른 사람은 열 수 없다(사용자 결정 2026-11-12)
 * - 삭제(Backend 9611cbc): 상단 바 맨 끝 → 확인 대화상자(취소 / 삭제). 지우면 목록으로 돌아가 토스트로 알린다(목록 화면의 state.deletedTitle)
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const tablet = useMediaQuery(TABLET_QUERY);
  const navigate = useNavigate();
  const listPath = `/meetings${listSearch ? `?${listSearch}` : ''}`;

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

  return (
    <AppShell
      title="회의록"
      hideTitle
      back={{ to: listPath, label: '회의록 목록' }}
      actions={
        detail && (
          <DetailActions
            detail={detail}
            compact={!tablet}
            onTranscript={() => setTranscriptOpen(true)}
            onDelete={() => setDeleteOpen(true)}
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
      {detail && (
        <>
          <MinutesArticle detail={detail} />
          <Dialog open={transcriptOpen} onOpenChange={setTranscriptOpen} title="전사 원문" size="form">
            <Transcript detail={detail} />
          </Dialog>
          <DeleteMeetingDialog
            detail={detail}
            open={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            onDeleted={() => navigate(listPath, { replace: true, state: { deletedTitle: detail.title } })}
          />
        </>
      )}
    </AppShell>
  );
}

function DetailActions({
  detail,
  compact,
  onTranscript,
  onDelete,
}: {
  detail: MeetingDetail;
  compact: boolean;
  onTranscript: () => void;
  onDelete: () => void;
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
        <IconButton icon={ScrollText} label="전사 원문" variant="surface" onClick={onTranscript} />
        <IconButton icon={Copy} label="복사" variant="surface" onClick={copy} />
        <IconButton icon={Trash2} label="삭제" variant="danger" aria-haspopup="dialog" onClick={onDelete} />
      </>
    );
  }
  return (
    <>
      <Button variant="secondary" shape="pill" icon={ScrollText} onClick={onTranscript}>
        전사 원문
      </Button>
      <Button variant="secondary" shape="pill" icon={Copy} onClick={copy}>
        복사
      </Button>
      <Button variant="danger-secondary" shape="pill" icon={Trash2} aria-haspopup="dialog" onClick={onDelete}>
        삭제
      </Button>
    </>
  );
}

/** 삭제 확인. 버튼은 "취소 / 삭제". 삭제 중에는 닫을 수 없다. 실패는 토스트, 이미 지워진 회의면 지운 것으로 보고 목록으로 */
function DeleteMeetingDialog({
  detail,
  open,
  onClose,
  onDeleted,
}: {
  detail: MeetingDetail;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await deleteMeeting(detail.documentId);
    } catch (error) {
      if (!(error instanceof MeetingDetailApiError && error.code === 'MEETING_NOT_FOUND')) {
        setBusy(false);
        toast({ message: '회의록을 삭제하지 못했습니다', tone: 'danger' });
        return;
      }
    }
    forgetMeeting(detail.documentId);
    onDeleted();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && !busy && onClose()}
      title="삭제하시겠습니까?"
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" shape="pill" disabled={busy} onClick={onClose}>
            취소
          </Button>
          <Button variant="danger" shape="pill" icon={Trash2} loading={busy} onClick={() => void remove()}>
            삭제
          </Button>
        </>
      }
    >
      <p className="flex flex-col gap-1">
        <span className="text-body-lg text-text">{detail.title}</span>
        <span className="text-body text-text-muted tabular-nums">{formatMeetingAtLong(detail.meetingAt)}</span>
      </p>
    </Dialog>
  );
}

/** 회의 정보 + 섹션 카드를 위에서 아래로 쌓는다(본문 폭 그대로) */
function MinutesArticle({ detail }: { detail: MeetingDetail }) {
  const people = detail.participants.map(({ name }) => name).join(', ');
  return (
    <article aria-labelledby="meeting-title" className="flex flex-col gap-4 tablet:gap-6">
      <header className="flex flex-col gap-2 px-1">
        <h2 id="meeting-title" className="text-headline text-text">
          {detail.title}
        </h2>
        <p className="text-caption text-text-muted">
          <span className="tabular-nums">{formatMeetingAtLong(detail.meetingAt)}</span>
          {' · '}
          {people ? `참석자 ${people}` : '참석자 정보 없음'}
        </p>
      </header>
      {visibleSections(detail).map(({ key, title }) => (
        <Card as="section" key={key} aria-labelledby={`minutes-section-${key}`} className="flex flex-col gap-3">
          <h3 id={`minutes-section-${key}`} className="text-title text-text">
            {title}
          </h3>
          <SectionBody detail={detail} sectionKey={key} />
        </Card>
      ))}
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
            <li
              key={`${index}-${item.task}`}
              className="flex min-h-18 flex-col justify-center gap-1 border-b border-border px-4 py-3 last:border-b-0 tablet:min-h-15 tablet:flex-row tablet:items-center tablet:gap-4"
            >
              {/* 휴대폰: 할 일 / "담당 · 기한" 2줄. 태블릿 이상: 할 일 | 담당 | 기한 한 줄(할 일이 길면 줄바꿈) */}
              <span className="text-body text-text tablet:min-w-0 tablet:flex-1">{item.task}</span>
              <span className="text-caption text-text-muted tablet:w-36 tablet:shrink-0 tablet:text-body">담당 {owner ?? '미지정'}</span>
              <span className="text-caption text-text-muted tablet:w-36 tablet:shrink-0 tablet:text-body">
                기한 <span className="tabular-nums">{item.dueDate ?? '없음'}</span>
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
    <div aria-busy="true" aria-label="회의록 불러오는 중" className="flex w-full flex-col gap-6">
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
