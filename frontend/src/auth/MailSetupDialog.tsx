import { useState, type FormEvent } from 'react';
import { EmailSettingsApiError } from '../emailSettingsApi';
import { saveAndVerifyMail } from './mailSettings';
import { Banner, Button, Dialog, TextField } from '../ui';

interface MailSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 저장과 연결 확인이 모두 성공했을 때 */
  onConfigured: () => void;
}

const FIELDS = [
  { key: 'clientId', label: 'Google 클라이언트 ID', type: 'text' },
  { key: 'clientSecret', label: '클라이언트 보안 키', type: 'password' },
  { key: 'refreshToken', label: '연결 토큰 (Refresh Token)', type: 'password' },
  { key: 'senderAddress', label: '발신 이메일 주소', type: 'email' },
] as const;

type Values = Record<(typeof FIELDS)[number]['key'], string>;
const EMPTY: Values = { clientId: '', clientSecret: '', refreshToken: '', senderAddress: '' };

/**
 * 메일 설정 팝업 (AUTH-01-F07, D-03). 처음 설치해 메일이 설정되지 않았을 때만 로그인 화면에서 연다.
 * API-035 PUT으로 저장한 뒤 API-036으로 연결을 시험한다. 4개 항목 모두 필수.
 */
export function MailSetupDialog({ open, onOpenChange, onConfigured }: MailSetupDialogProps) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = Object.fromEntries(FIELDS.map(({ key }) => [key, values[key].trim()])) as Values;
    const empty = new Set(FIELDS.filter(({ key }) => !trimmed[key]).map(({ key }) => key));
    setMissing(empty);
    if (empty.size > 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await saveAndVerifyMail(trimmed);
      if (!result.connected) {
        setError(result.message || '메일 연결을 확인하지 못했습니다. 입력값을 확인해 주세요.');
        return;
      }
      setValues(EMPTY);
      onConfigured();
    } catch (cause) {
      setError(cause instanceof EmailSettingsApiError ? cause.message : '메일 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="메일 설정"
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="submit" form="mail-setup-form" loading={busy}>
            {busy ? '연결 확인 중…' : '저장하고 연결 확인'}
          </Button>
        </>
      }
    >
      <form id="mail-setup-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
        {error && <Banner tone="danger">{error}</Banner>}
        {FIELDS.map(({ key, label, type }) => (
          <TextField
            key={key}
            label={label}
            type={type}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={values[key]}
            disabled={busy}
            error={missing.has(key) ? `${label}을(를) 입력해 주세요.` : undefined}
            onChange={(event) => setValues({ ...values, [key]: event.target.value })}
          />
        ))}
      </form>
    </Dialog>
  );
}
