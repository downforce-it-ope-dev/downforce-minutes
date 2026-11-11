import { useRef, useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import { createParticipant, ParticipantApiError, type Participant, type ParticipantField } from '../participantsApi';
import { Button, TextField, useToast } from '../ui';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 새 참석자 등록 (MTG-01-F09, PTC-01-P01과 같은 API-004). 등록한 사람은 바로 이 회의 참석자로 선택된다.
 * 입력 오류는 테두리, 알림은 토스트로만 보인다(S-13). 같은 입력의 재시도는 같은 멱등 키를 쓴다.
 * 태블릿은 참석자 영역 오른쪽 패널, 휴대폰은 대화상자 안에 그린다.
 */
export function NewParticipantForm({ onCreated, autoFocus = false }: { onCreated: (participant: Participant) => void; autoFocus?: boolean }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [invalid, setInvalid] = useState<Partial<Record<ParticipantField, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    // 새 회의 폼 안에 있으므로 바깥 폼으로 제출이 번지지 않게 한다
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    const payload = { name: name.trim(), email: email.trim() };
    const errors = { name: !payload.name, email: !EMAIL.test(payload.email) };
    setInvalid(errors);
    if (errors.name || errors.email) {
      toast({ message: errors.name ? '이름을 입력해 주세요.' : '올바른 이메일 주소를 입력해 주세요.', tone: 'danger' });
      return;
    }
    const signature = JSON.stringify(payload);
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: createKey() };
    setBusy(true);
    try {
      const created = await createParticipant(payload, attempt.current.key);
      attempt.current = null;
      setName('');
      setEmail('');
      onCreated(created);
      toast({ message: `${created.name}님을 등록하고 참석자로 선택했습니다.`, tone: 'success' });
      nameRef.current?.focus();
    } catch (error) {
      if (error instanceof ParticipantApiError) {
        setInvalid({ name: Boolean(error.fieldErrors.name), email: Boolean(error.fieldErrors.email) });
        toast({ message: error.message, tone: 'danger' });
      } else {
        toast({ message: '참석자를 등록하지 못했습니다. 다시 시도해 주세요.', tone: 'danger' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} aria-label="새 참석자" className="flex flex-col gap-4">
      <TextField
        ref={nameRef}
        label="이름"
        autoComplete="off"
        autoFocus={autoFocus}
        value={name}
        onChange={(event) => setName(event.target.value)}
        invalid={invalid.name}
      />
      <TextField
        label="이메일"
        type="email"
        autoComplete="off"
        inputMode="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        invalid={invalid.email}
      />
      <Button type="submit" variant="secondary" size="lg" shape="pill" icon={UserPlus} fullWidth loading={busy}>
        등록
      </Button>
    </form>
  );
}
