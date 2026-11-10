import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Participant } from '../participantsApi';
import {
  getDocumentAppConfig,
  listMeetingParticipants,
  listMeetingTemplates,
  NewMeetingApiError,
  type DocumentAppConfig,
  type MeetingDraft,
  type MeetingSessionAttempt,
  type MeetingTemplate,
} from '../newMeetingApi';

/*
 * 새 회의 입력·제출 로직 (MTG-01-F01~F08, GitHub #26).
 * 기존 NewMeetingPage의 처리 규칙을 그대로 옮겼다: 설정·템플릿·참석자를 따로 불러오고, 같은 입력의 재시도는 같은 멱등 키를 쓰며,
 * 제출 중 문서 연결이 바뀌면 설정과 참석자를 다시 불러오고 선택을 지운다.
 * 바뀐 점: 화면 문구는 notify로 바깥(토스트)에 넘기고, 로그인한 사람은 참석자에 늘 포함한다(사용자 결정 2026-11-10).
 */

export type Resource<T> = { status: 'loading'; data?: T } | { status: 'ready'; data: T } | { status: 'error'; data?: T };

export type NewMeetingNotice =
  | 'config-failed'
  | 'templates-failed'
  | 'participants-failed'
  | 'connection-changed'
  | 'connection-check-failed'
  | 'start-failed'
  | 'missing-title'
  | 'missing-date'
  | 'missing-template'
  | 'missing-participants';

function localDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function pickTemplate(items: MeetingTemplate[], current: string) {
  return items.some((item) => item.id === current) ? current : (items.find((item) => item.id === 'default.md')?.id ?? items[0]?.id ?? '');
}

export function configReady(config: DocumentAppConfig | undefined) {
  return Boolean(
    config?.company.timezone &&
      config.setup?.status === 'READY' &&
      config.setup.canCreateMeeting === true &&
      Number.isInteger(config.document?.connectionVersion) &&
      (config.document?.connectionVersion ?? 0) >= 1,
  );
}

export function useNewMeetingForm({
  initialDraft,
  accountEmail,
  onSubmit,
  notify,
}: {
  initialDraft?: MeetingDraft;
  /** 로그인한 이메일. 같은 이메일의 참석자를 늘 선택한다 */
  accountEmail: string | null;
  onSubmit: (attempt: MeetingSessionAttempt) => Promise<void>;
  notify: (notice: NewMeetingNotice) => void;
}) {
  const [config, setConfig] = useState<Resource<DocumentAppConfig>>({ status: 'loading' });
  const [templates, setTemplates] = useState<Resource<MeetingTemplate[]>>({ status: 'loading' });
  const [participants, setParticipants] = useState<Resource<Participant[]>>({ status: 'loading' });
  const [title, setTitle] = useState(initialDraft?.title ?? '');
  const [meetingDate, setMeetingDate] = useState(initialDraft?.meetingDate ?? localDateString());
  const [templateId, setTemplateId] = useState(initialDraft?.templateId ?? 'default.md');
  const [chosenIds, setChosenIds] = useState<string[]>([...(initialDraft?.participantIds ?? [])]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const attemptRef = useRef<{ signature: string; attempt: MeetingSessionAttempt; uncertain: boolean } | null>(null);
  const submittingRef = useRef(false);
  const notifyRef = useRef(notify);
  useLayoutEffect(() => {
    notifyRef.current = notify;
  });

  const roster = useMemo(() => participants.data ?? [], [participants.data]);
  /** 로그인한 사람 (참석자 목록에 같은 이메일이 있을 때만) */
  const selfId = useMemo(() => {
    const email = accountEmail?.trim().toLowerCase();
    if (!email) return null;
    return roster.find((item) => item.email.trim().toLowerCase() === email)?.id ?? null;
  }, [roster, accountEmail]);
  const participantIds = useMemo(
    () => (selfId && !chosenIds.includes(selfId) ? [selfId, ...chosenIds] : chosenIds),
    [chosenIds, selfId],
  );

  const loadConfig = useCallback(async () => {
    setConfig((current) => ({ status: 'loading', data: current.data }));
    try {
      setConfig({ status: 'ready', data: await getDocumentAppConfig() });
    } catch {
      setConfig((current) => ({ status: 'error', data: current.data }));
      notifyRef.current('config-failed');
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    setTemplates((current) => ({ status: 'loading', data: current.data }));
    try {
      const items = await listMeetingTemplates();
      setTemplates({ status: 'ready', data: items });
      setTemplateId((current) => pickTemplate(items, current));
    } catch {
      setTemplates((current) => ({ status: 'error', data: current.data }));
      notifyRef.current('templates-failed');
    }
  }, []);

  /** 실패하면 토스트(다시 시도)를 띄우고 false */
  const loadParticipants = useCallback(async (clearSelection = false) => {
    if (clearSelection) setChosenIds([]);
    setParticipants((current) => (clearSelection ? { status: 'loading' } : { status: 'loading', data: current.data }));
    try {
      const items = await listMeetingParticipants();
      setParticipants({ status: 'ready', data: items });
      setChosenIds((current) => (clearSelection ? [] : current.filter((id) => items.some((item) => item.id === id))));
      return true;
    } catch {
      setParticipants((current) => (clearSelection ? { status: 'error' } : { status: 'error', data: current.data }));
      notifyRef.current('participants-failed');
      return false;
    }
  }, []);

  // 처음 불러오기: 상태는 이미 loading이라 응답이 오면 바로 채운다
  useEffect(() => {
    let active = true;
    getDocumentAppConfig()
      .then((data) => active && setConfig({ status: 'ready', data }))
      .catch(() => {
        if (!active) return;
        setConfig({ status: 'error' });
        notifyRef.current('config-failed');
      });
    listMeetingTemplates()
      .then((items) => {
        if (!active) return;
        setTemplates({ status: 'ready', data: items });
        setTemplateId((current) => pickTemplate(items, current));
      })
      .catch(() => {
        if (!active) return;
        setTemplates({ status: 'error' });
        notifyRef.current('templates-failed');
      });
    listMeetingParticipants()
      .then((items) => active && setParticipants({ status: 'ready', data: items }))
      .catch(() => {
        if (!active) return;
        setParticipants({ status: 'error' });
        notifyRef.current('participants-failed');
      });
    return () => {
      active = false;
    };
  }, []);

  const anyLoading = config.status === 'loading' || templates.status === 'loading' || participants.status === 'loading';
  const availableTemplates = templates.data ?? [];
  const unavailable =
    config.status === 'error' ||
    templates.status === 'error' ||
    participants.status === 'error' ||
    (templates.status === 'ready' && availableTemplates.length === 0) ||
    (participants.status === 'ready' && roster.length === 0) ||
    (config.status === 'ready' && !configReady(config.data));

  function toggleParticipant(id: string) {
    if (id === selfId) return;
    setChosenIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  /** 여러 명을 한 번에 선택하거나(select=true) 해제한다. 로그인한 사람은 해제하지 않는다 */
  function setMany(ids: string[], select: boolean) {
    setChosenIds((current) => {
      if (select) return [...current, ...ids.filter((id) => !current.includes(id))];
      return current.filter((id) => !ids.includes(id) || id === selfId);
    });
  }

  async function submit() {
    if (submittingRef.current) return;
    setSubmitted(true);
    if (anyLoading || unavailable) return;
    const trimmedTitle = title.trim();
    const currentConfig = config.data;
    if (!trimmedTitle) return notifyRef.current('missing-title');
    if (!meetingDate) return notifyRef.current('missing-date');
    if (!templateId) return notifyRef.current('missing-template');
    if (participantIds.length === 0) return notifyRef.current('missing-participants');
    if (!currentConfig || !configReady(currentConfig) || !currentConfig.document) return;

    const formSnapshot = {
      title: trimmedTitle,
      meetingDate,
      templateId,
      participantIds: Object.freeze([...participantIds]),
      timezone: currentConfig.company.timezone,
      documentConnectionVersion: currentConfig.document.connectionVersion,
    };
    const signature = JSON.stringify(formSnapshot);
    submittingRef.current = true;
    setSubmitting(true);
    const finish = () => {
      submittingRef.current = false;
      setSubmitting(false);
    };
    let entry = attemptRef.current;
    if (!entry || entry.signature !== signature || !entry.uncertain) {
      const key = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      entry = { signature, attempt: Object.freeze({ ...formSnapshot, recoveryKey: key(), idempotencyKey: key() }), uncertain: false };
      attemptRef.current = entry;
    } else {
      // 응답을 못 받은 같은 입력을 다시 보내기 전에 문서 연결이 그대로인지 확인한다
      try {
        const latest = await getDocumentAppConfig();
        if (
          latest.setup?.status !== 'READY' ||
          latest.setup.canCreateMeeting !== true ||
          latest.document?.connectionVersion !== entry.attempt.documentConnectionVersion
        ) {
          setConfig({ status: 'ready', data: latest });
          attemptRef.current = null;
          // 참석자를 다시 못 불러오면 그 실패 토스트(다시 시도)를 남긴다
          if (await loadParticipants(true)) notifyRef.current('connection-changed');
          finish();
          return;
        }
      } catch {
        notifyRef.current('connection-check-failed');
        finish();
        return;
      }
    }

    try {
      await onSubmit(entry.attempt);
      attemptRef.current = null;
    } catch (error) {
      if (error instanceof NewMeetingApiError && error.code === 'DOCUMENT_CONNECTION_CHANGED') {
        attemptRef.current = null;
        const [, rosterLoaded] = await Promise.all([loadConfig(), loadParticipants(true)]);
        if (rosterLoaded) notifyRef.current('connection-changed');
      } else {
        if (attemptRef.current) attemptRef.current.uncertain = error instanceof NewMeetingApiError && error.responseUncertain;
        notifyRef.current('start-failed');
      }
    } finally {
      finish();
    }
  }

  return {
    config,
    templates,
    participants,
    roster,
    title,
    setTitle,
    meetingDate,
    setMeetingDate,
    templateId,
    setTemplateId,
    participantIds,
    selfId,
    toggleParticipant,
    setMany,
    submitting,
    anyLoading,
    unavailable,
    errors: {
      title: submitted && !title.trim(),
      meetingDate: submitted && !meetingDate,
      templateId: submitted && !templateId,
      participants: submitted && participantIds.length === 0,
    },
    submit,
    retry: { config: loadConfig, templates: loadTemplates, participants: async () => void (await loadParticipants()) },
  };
}
