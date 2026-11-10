import { useEffect, useLayoutEffect, useRef, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Mic } from 'lucide-react';
import { AccountButton, SidebarAccount } from '../auth/AccountMenu';
import { loadAccountEmail } from '../auth/accountEmail';
import { saveRecordingSession } from '../meeting/recordingSessionStore';
import { createMeetingSession, type MeetingDraft, type MeetingSessionAttempt } from '../newMeetingApi';
import { AppShell, Button, Card, SelectField, TextField, useToast, type ToastOptions } from '../ui';
import { ParticipantPicker } from './ParticipantPicker';
import { configReady, useNewMeetingForm, type NewMeetingNotice } from './useNewMeetingForm';

/*
 * MTG-01 새 회의 (GitHub #26, docs/renewal/화면기획/MTG-01_새회의.md).
 * - 휴대폰: 1단 페이지 스크롤, 회의 시작은 탭 바 위에 고정
 * - 태블릿 세로: 회의 정보 → 남은 높이 전부 참석자 선택 영역(목록만 스크롤) → 회의 시작
 * - 태블릿 가로: 왼쪽 회의 정보·회의 시작 / 오른쪽 참석자 선택 영역(높이 가득)
 * - 오류·상태 알림은 토스트, 입력 오류는 테두리로만 표시한다(S-13)
 */

/** 회의 생성 → 녹음 세션을 녹음 화면에 넘기고 이동 (기존 App NewMeetingRoute와 같은 처리) */
export function NewMeetingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialDraft = (location.state as { draft?: MeetingDraft } | null)?.draft;

  async function submit(attempt: MeetingSessionAttempt) {
    const session = await createMeetingSession(attempt);
    const draft: MeetingDraft = {
      title: attempt.title,
      meetingDate: attempt.meetingDate,
      templateId: attempt.templateId,
      participantIds: [...attempt.participantIds],
    };
    saveRecordingSession({ ...session, title: attempt.title, draft });
    navigate(`/meetings/${encodeURIComponent(session.sessionId)}/recording`);
  }

  return (
    <AppShell
      title="새 회의"
      back={{ to: '/', label: '홈' }}
      account={<SidebarAccount />}
      actions={
        <span className="tablet-lg:hidden">
          <AccountButton />
        </span>
      }
      fillHeight
    >
      <NewMeetingForm initialDraft={initialDraft} onSubmit={submit} />
    </AppShell>
  );
}

function NewMeetingForm({
  initialDraft,
  onSubmit,
}: {
  initialDraft?: MeetingDraft;
  onSubmit: (attempt: MeetingSessionAttempt) => Promise<void>;
}) {
  const toast = useToast();
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.submit();
  }

  const templates = form.templates.data ?? [];

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="flex flex-1 flex-col gap-4 tablet:min-h-0 tablet-lg:grid tablet-lg:gap-6 tablet-lg:grid-cols-5 tablet-lg:grid-rows-2"
    >
      <Card
        as="section"
        aria-labelledby="meeting-info-title"
        className="flex flex-col gap-4 tablet-lg:col-span-2 tablet-lg:col-start-1 tablet-lg:row-start-1 tablet-lg:self-start"
      >
        <h2 id="meeting-info-title" className="text-title text-text">
          회의 정보
        </h2>
        <TextField
          label="회의 제목"
          value={form.title}
          onChange={(event) => form.setTitle(event.target.value)}
          invalid={form.errors.title}
          required
        />
        <div className="grid gap-4 tablet:grid-cols-2 tablet-lg:grid-cols-1">
          <TextField
            label="회의 날짜"
            type="date"
            value={form.meetingDate}
            onChange={(event) => form.setMeetingDate(event.target.value)}
            invalid={form.errors.meetingDate}
            required
            className="tabular-nums"
          />
          <SelectField
            label="회의록 템플릿"
            value={form.templateId}
            onChange={(event) => form.setTemplateId(event.target.value)}
            disabled={form.templates.status !== 'ready' || templates.length === 0}
            invalid={form.errors.templateId}
            required
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </SelectField>
        </div>
      </Card>

      <ParticipantPicker
        participants={form.roster}
        selectedIds={form.participantIds}
        selfId={form.selfId}
        status={form.participants.status}
        invalid={form.errors.participants}
        onToggle={form.toggleParticipant}
        onSetMany={form.setMany}
        className="tablet:min-h-0 tablet:flex-1 tablet-lg:col-span-3 tablet-lg:col-start-3 tablet-lg:row-span-2 tablet-lg:row-start-1"
      />

      {/* 회의 시작: 휴대폰은 탭 바 위 고정(낮은 화면은 본문 끝), 태블릿 세로는 영역 아래, 태블릿 가로는 왼쪽 단 아래 */}
      <div className="h-20 tablet:hidden short:hidden" aria-hidden="true" />
      <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-safe tablet:static tablet:px-0 tablet:pb-0 tablet-lg:col-span-2 tablet-lg:col-start-1 tablet-lg:row-start-2 tablet-lg:self-end short:static short:px-0 short:pb-0">
        <div className="mb-20 tablet:mb-0 short:mb-0">
          <Button
            type="submit"
            size="lg"
            shape="pill"
            icon={Mic}
            fullWidth
            className="shadow-primary"
            disabled={form.anyLoading || form.unavailable}
            loading={form.submitting}
          >
            {form.submitting ? '회의 시작 중…' : '회의 시작'}
          </Button>
        </div>
      </div>
    </form>
  );
}
