import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { FileText, Mic, UserPlus, X } from 'lucide-react';
import { loadAccountEmail } from '../auth/accountEmail';
import { saveRecordingSession, type RecordingDraft } from '../meeting/recordingSessionStore';
import { createMeetingSession, type MeetingDraft, type MeetingSessionAttempt } from '../newMeetingApi';
import {
  AppShell,
  Button,
  Card,
  ChoiceGroup,
  cn,
  DateField,
  Dialog,
  IconButton,
  TABLET_QUERY,
  TextField,
  useMediaQuery,
  useToast,
  type ToastOptions,
} from '../ui';
import { NewParticipantForm } from './NewParticipantForm';
import { ParticipantPicker } from './ParticipantPicker';
import { configReady, useNewMeetingForm, type NewMeetingNotice } from './useNewMeetingForm';

/*
 * MTG-01 새 회의 (GitHub #26, docs/renewal/화면기획/MTG-01_새회의.md).
 * 정보 위계(사용자 결정 2026-11-10): 회의 제목(가로 가득, 큰 글자) → 날짜·템플릿(좌우) → 참석자.
 * 집중 모드(2026-11-11): 메뉴 없이 제목과 뒤로 가기(홈)만. 큰 태블릿에서는 넓어진 폭으로 참석자 목록을 두 단으로 보인다.
 * - 태블릿: 참석자 영역은 남은 높이를 가로 가득 쓰고 목록만 스크롤한다. 머리의 등록 아이콘을 누르면 오른쪽에서 새 참석자 패널이
 *   밀려 나와 참석자 영역과 같은 높이로 나란히 선다(사용자 결정 2026-11-10). 회의 시작은 맨 아래 가운데
 * - 휴대폰: 1단 페이지 스크롤, 새 참석자는 대화상자, 회의 시작은 화면 아래에 고정
 * - 날짜는 큰 달력 대화상자, 템플릿은 버튼으로 고른다
 * - 오류·상태 알림은 토스트, 입력 오류는 테두리로만 표시한다(S-13)
 */

/** 회의 생성 → 녹음 세션을 녹음 화면에 넘기고 이동 (기존 App NewMeetingRoute와 같은 처리) */
export function NewMeetingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialDraft = (location.state as { draft?: MeetingDraft } | null)?.draft;

  async function submit(attempt: MeetingSessionAttempt, labels: { templateName?: string; participants: Array<{ name: string; email: string }> }) {
    const session = await createMeetingSession(attempt);
    const draft: RecordingDraft = {
      title: attempt.title,
      meetingDate: attempt.meetingDate,
      templateId: attempt.templateId,
      participantIds: [...attempt.participantIds],
      ...labels,
    };
    saveRecordingSession({ ...session, title: attempt.title, draft });
    navigate(`/meetings/${encodeURIComponent(session.sessionId)}/recording`);
  }

  return (
    // 집중 모드 (사용자 결정 2026-11-11): 새 회의 → 녹음 → 처리 → 검토가 메뉴 없이 이어진다. 넓어진 폭은 참석자 목록이 쓴다
    <AppShell title="새 회의" focus back={{ to: '/', label: '홈' }} fillHeight toastPlacement="action">
      <NewMeetingForm initialDraft={initialDraft} onSubmit={submit} />
    </AppShell>
  );
}

function NewMeetingForm({
  initialDraft,
  onSubmit,
}: {
  initialDraft?: MeetingDraft;
  onSubmit: (attempt: MeetingSessionAttempt, labels: { templateName?: string; participants: Array<{ name: string; email: string }> }) => Promise<void>;
}) {
  const toast = useToast();
  const tablet = useMediaQuery(TABLET_QUERY);
  const [addOpen, setAddOpen] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // 태블릿 패널이 열리면 이름 칸으로 초점을 옮긴다
  useEffect(() => {
    if (tablet && addOpen) panelRef.current?.querySelector('input')?.focus({ preventScroll: true });
  }, [tablet, addOpen]);
  function closeAdd() {
    setAddOpen(false);
    addButtonRef.current?.focus();
  }
  const retryRef = useRef<Record<'config' | 'templates' | 'participants', () => Promise<void>> | null>(null);

  function notify(notice: NewMeetingNotice) {
    const retry = (key: 'config' | 'templates' | 'participants'): ToastOptions['action'] => ({
      label: '다시 시도',
      onClick: () => void retryRef.current?.[key](),
    });
    const messages: Record<NewMeetingNotice, ToastOptions> = {
      'config-failed': { message: '연결 정보를 불러오지 못했습니다.', tone: 'danger', action: retry('config') },
      'templates-failed': { message: '템플릿 목록을 불러오지 못했습니다.', tone: 'danger', action: retry('templates') },
      'participants-failed': { message: '참석자 목록을 불러오지 못했습니다.', tone: 'danger', action: retry('participants') },
      'connection-changed': { message: '문서 연결이 바뀌어 참석자 선택을 초기화했습니다. 다시 확인해 주세요.', tone: 'danger' },
      'connection-check-failed': { message: '문서 연결 상태를 확인하지 못했습니다. 다시 시도해 주세요.', tone: 'danger' },
      'start-failed': { message: '회의를 시작하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.', tone: 'danger' },
      'missing-title': { message: '회의 제목을 입력해 주세요.', tone: 'danger' },
      'missing-date': { message: '회의 날짜를 선택해 주세요.', tone: 'danger' },
      'missing-template': { message: '회의록 템플릿을 선택해 주세요.', tone: 'danger' },
      'missing-participants': { message: '참석자를 한 명 이상 선택해 주세요.', tone: 'danger' },
    };
    toast(messages[notice]);
  }

  const form = useNewMeetingForm({ initialDraft, accountEmail: loadAccountEmail(), onSubmit, notify });
  useLayoutEffect(() => {
    retryRef.current = form.retry;
  });

  // 시작할 수 없는 상태는 불러온 순간 한 번 알린다 (문서 연결 미완료·템플릿 없음)
  const configNotReady = form.config.status === 'ready' && !configReady(form.config.data);
  const noTemplates = form.templates.status === 'ready' && form.templates.data.length === 0;
  useEffect(() => {
    if (configNotReady) toast({ message: '문서 서비스 연결을 완료한 뒤 회의를 시작할 수 있습니다.', tone: 'danger' });
  }, [configNotReady, toast]);
  useEffect(() => {
    if (noTemplates) toast({ message: '사용할 수 있는 템플릿이 없습니다.', tone: 'danger' });
  }, [noTemplates, toast]);

  const templates = form.templates.data ?? [];

  const startButton = (
    <Button
      size="lg"
      shape="pill"
      icon={Mic}
      fullWidth
      className="shadow-primary"
      disabled={form.anyLoading || form.unavailable}
      loading={form.submitting}
      onClick={() => void form.submit()}
    >
      {form.submitting ? '회의 시작 중…' : '회의 시작'}
    </Button>
  );

  return (
    <div className="flex flex-1 flex-col gap-4 tablet:min-h-0">
      <Card as="section" aria-label="회의 정보" padding="none" className="flex shrink-0 flex-col gap-3 p-4 tablet:p-5">
        <TextField
          label="회의 제목"
          inputSize="lg"
          value={form.title}
          onChange={(event) => form.setTitle(event.target.value)}
          invalid={form.errors.title}
          required
        />
        <div className="grid gap-3 tablet:grid-cols-2 tablet:gap-4">
          <DateField label="회의 날짜" value={form.meetingDate} onChange={form.setMeetingDate} invalid={form.errors.meetingDate} />
          <ChoiceGroup
            label="회의록 템플릿"
            value={form.templateId}
            onChange={form.setTemplateId}
            disabled={form.templates.status !== 'ready'}
            invalid={form.errors.templateId}
            options={templates.map((template) => ({ value: template.id, label: template.name, icon: FileText }))}
          />
        </div>
      </Card>

      <div className="flex flex-col gap-4 tablet:min-h-0 tablet:flex-1 tablet:flex-row tablet:gap-0">
        <ParticipantPicker
          participants={form.roster}
          selectedIds={form.participantIds}
          selfId={form.selfId}
          status={form.participants.status}
          invalid={form.errors.participants}
          onToggle={form.toggleParticipant}
          onSetMany={form.setMany}
          className="tablet:min-h-0 tablet:flex-1"
          action={
            <IconButton
              ref={addButtonRef}
              icon={UserPlus}
              label="새 참석자"
              variant="surface"
              aria-haspopup={tablet ? undefined : 'dialog'}
              aria-expanded={tablet ? addOpen : undefined}
              onClick={() => (tablet && addOpen ? closeAdd() : setAddOpen(true))}
            />
          }
        />
        {/* 태블릿: 새 참석자 패널은 오른쪽에서 왼쪽으로 밀려 나오고, 참석자 영역은 그만큼 자연스럽게 줄어든다(닫을 때는 반대로) */}
        {tablet && (
          <div
            ref={panelRef}
            inert={!addOpen}
            aria-hidden={!addOpen || undefined}
            className={cn(
              'flex shrink-0 overflow-hidden transition-all duration-300 ease-out motion-reduce:transition-none',
              addOpen ? 'ml-4 w-72 opacity-100' : 'ml-0 w-0 opacity-0',
            )}
          >
            <Card
              as="section"
              aria-labelledby="new-participant-title"
              className={cn(
                'flex w-72 shrink-0 flex-col gap-4 overflow-y-auto transition-transform duration-300 ease-out motion-reduce:transition-none',
                addOpen ? 'translate-x-0' : 'translate-x-full',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 id="new-participant-title" className="text-title text-text">
                  새 참석자
                </h2>
                <IconButton icon={X} label="새 참석자 닫기" variant="surface" onClick={closeAdd} />
              </div>
              <NewParticipantForm onCreated={form.addParticipant} />
            </Card>
          </div>
        )}
      </div>

      {/* 태블릿: 회의 시작은 맨 아래 가운데 */}
      {tablet && (
        <div className="flex shrink-0 justify-center">
          <div className="w-full max-w-form">{startButton}</div>
        </div>
      )}

      {!tablet && (
        <>
          {/* 휴대폰: 회의 시작을 화면 아래에 고정 (집중 모드라 탭 바 없음, 낮은 화면은 본문 끝) */}
          <div className="h-20 short:hidden" aria-hidden="true" />
          <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-safe short:static short:px-0 short:pb-0">
            <div className="mb-4 short:mb-0">{startButton}</div>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen} title="새 참석자">
            <NewParticipantForm
              autoFocus
              onCreated={(participant) => {
                form.addParticipant(participant);
                setAddOpen(false);
              }}
            />
          </Dialog>
        </>
      )}
    </div>
  );
}
