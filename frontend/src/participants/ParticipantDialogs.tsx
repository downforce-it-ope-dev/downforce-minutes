import { useId, useRef, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import {
  createParticipant,
  deleteParticipant,
  ParticipantApiError,
  updateParticipant,
  type Participant,
  type ParticipantInput,
  type ParticipantPatch,
} from '../participantsApi';
import { Button, Dialog, TextField, useToast } from '../ui';
import { serverFieldMessage, validateParticipant, type ParticipantErrors } from './participantRules';

/** 목록을 다시 불러와야 맞출 수 있는 오류 (PTC-01-F07) */
const STALE_CODES = new Set(['PARTICIPANT_NOT_FOUND', 'DOCUMENT_CHANGE_BUSY', 'DOCUMENT_SETTINGS_VERSION_CONFLICT']);

function createKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type ParticipantFormTarget = { mode: 'create' } | { mode: 'edit'; participant: Participant };

/**
 * PTC-01-P01 참석자 추가·수정 (태블릿 가운데 대화상자, 휴대폰 하단 시트).
 * - 이름 · (팀: Backend 팀 확장 뒤) · 이메일. 입력 오류는 입력란 아래 문구(대화상자 안 예외, S-13)
 * - 추가: 같은 입력의 재시도는 같은 멱등 키. 수정: 바뀐 값만 보내고, 바뀐 것이 없으면 그냥 닫는다. 이메일을 바꿀 때만 도메인을 본다
 * - 저장 중에는 닫을 수 없다. 결과·서버 오류는 토스트(목록이 어긋난 오류는 "새로고침")
 */
export function ParticipantFormDialog({
  target,
  teamEnabled,
  teams,
  onClose,
  onSaved,
  onDelete,
  onReload,
}: {
  target: ParticipantFormTarget | null;
  teamEnabled: boolean;
  teams: readonly string[];
  onClose: () => void;
  onSaved: (participant: Participant, mode: 'create' | 'edit') => void;
  onDelete: (participant: Participant) => void;
  onReload: () => void;
}) {
  // 저장 중에는 닫을 수 없다
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => !open && onClose()}
      title={target?.mode === 'edit' ? '참석자 수정' : '참석자 추가'}
      dismissible={!busy}
    >
      {target && (
        <ParticipantForm
          key={target.mode === 'edit' ? target.participant.id : 'create'}
          target={target}
          teamEnabled={teamEnabled}
          teams={teams}
          onClose={onClose}
          onSaved={onSaved}
          onDelete={onDelete}
          onReload={onReload}
          onBusy={setBusy}
        />
      )}
    </Dialog>
  );
}

function ParticipantForm({
  target,
  teamEnabled,
  teams,
  onClose,
  onSaved,
  onDelete,
  onReload,
  onBusy,
}: {
  target: ParticipantFormTarget;
  teamEnabled: boolean;
  teams: readonly string[];
  onClose: () => void;
  onSaved: (participant: Participant, mode: 'create' | 'edit') => void;
  onDelete: (participant: Participant) => void;
  onReload: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const toast = useToast();
  const listId = useId();
  const original = target.mode === 'edit' ? target.participant : null;
  const [name, setName] = useState(original?.name ?? '');
  const [email, setEmail] = useState(original?.email ?? '');
  const [team, setTeam] = useState(original?.team ?? '');
  const [errors, setErrors] = useState<ParticipantErrors>({});
  const [busy, setBusyState] = useState(false);
  const setBusy = (value: boolean) => {
    setBusyState(value);
    onBusy(value);
  };
  const attempt = useRef<{ signature: string; key: string } | null>(null);

  const edit = (field: 'name' | 'email' | 'team', value: string) => {
    if (field === 'name') setName(value);
    else if (field === 'email') setEmail(value);
    else setTeam(value);
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const payload: ParticipantInput = { name: name.trim(), email: email.trim() };
    if (teamEnabled) payload.team = team.trim() || null;
    const emailChanged = !original || payload.email.toLowerCase() !== original.email.trim().toLowerCase();
    const found = validateParticipant(payload, { checkDomain: emailChanged });
    setErrors(found);
    if (found.name || found.email) return;

    let patch: ParticipantPatch | null = null;
    if (original) {
      patch = {};
      if (payload.name !== original.name) patch.name = payload.name;
      if (payload.email !== original.email) patch.email = payload.email;
      if (teamEnabled && (payload.team ?? null) !== (original.team?.trim() || null)) patch.team = payload.team ?? null;
      if (Object.keys(patch).length === 0) {
        onClose();
        return;
      }
    }

    setBusy(true);
    try {
      let saved: Participant;
      if (patch && original) {
        saved = await updateParticipant(original.id, patch);
      } else {
        const signature = JSON.stringify(payload);
        if (attempt.current?.signature !== signature) attempt.current = { signature, key: createKey() };
        saved = await createParticipant(payload, attempt.current.key);
        attempt.current = null;
      }
      onSaved(saved, original ? 'edit' : 'create');
    } catch (error) {
      if (error instanceof ParticipantApiError) {
        const fromServer: ParticipantErrors = {};
        for (const [field, code] of Object.entries(error.fieldErrors) as Array<['name' | 'email' | 'team', string]>) fromServer[field] = serverFieldMessage(field, code);
        setErrors(fromServer);
        toast({
          message: error.message,
          tone: 'danger',
          action: STALE_CODES.has(error.code) ? { label: '새로고침', onClick: onReload } : undefined,
        });
      } else {
        toast({ message: '저장하지 못했습니다. 다시 시도해 주세요.', tone: 'danger' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate aria-label={original ? '참석자 수정' : '참석자 추가'} onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      <TextField label="이름" autoComplete="off" autoFocus value={name} onChange={(event) => edit('name', event.target.value)} error={errors.name} disabled={busy} />
      {teamEnabled && (
        <>
          <TextField
            label="팀"
            autoComplete="off"
            list={listId}
            maxLength={50}
            value={team}
            onChange={(event) => edit('team', event.target.value)}
            error={errors.team}
            disabled={busy}
          />
          {/* 기존 팀 이름을 제안해 같은 팀을 다른 표기로 만들지 않게 한다 */}
          <datalist id={listId}>
            {teams.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </>
      )}
      <TextField
        label="이메일"
        type="email"
        inputMode="email"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="name@miinit.com"
        value={email}
        onChange={(event) => edit('email', event.target.value)}
        error={errors.email}
        disabled={busy}
      />
      <div className="flex flex-col-reverse gap-3 pt-2 tablet:flex-row tablet:items-center">
        {original && (
          <Button variant="danger-secondary" shape="pill" icon={Trash2} disabled={busy} onClick={() => onDelete(original)}>
            삭제
          </Button>
        )}
        <span className="hidden flex-1 tablet:block" />
        <Button type="submit" size="lg" shape="pill" loading={busy} className="tablet:min-w-40">
          저장
        </Button>
      </div>
    </form>
  );
}

/**
 * PTC-01-P02 참석자 삭제 확인. 버튼은 "취소 / 삭제". 삭제 중에는 닫을 수 없다. 결과·오류는 토스트
 */
export function DeleteParticipantDialog({
  participant,
  onClose,
  onDeleted,
  onReload,
}: {
  participant: Participant | null;
  onClose: () => void;
  onDeleted: (participant: Participant) => void;
  onReload: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!participant || busy) return;
    setBusy(true);
    try {
      await deleteParticipant(participant.id);
      onDeleted(participant);
    } catch (error) {
      const notFound = error instanceof ParticipantApiError && error.code === 'PARTICIPANT_NOT_FOUND';
      toast({
        message: notFound ? '이미 삭제된 참석자입니다.' : error instanceof ParticipantApiError ? error.message : '삭제하지 못했습니다. 다시 시도해 주세요.',
        tone: 'danger',
        action: notFound || (error instanceof ParticipantApiError && STALE_CODES.has(error.code)) ? { label: '새로고침', onClick: onReload } : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={participant !== null}
      onOpenChange={(open) => !open && onClose()}
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
      {participant && (
        <p className="flex flex-col gap-1">
          <span className="text-body-lg text-text">{participant.name}</span>
          <span className="text-body text-text-muted">{participant.email}</span>
        </p>
      )}
    </Dialog>
  );
}
