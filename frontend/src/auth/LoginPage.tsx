import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ArrowRight, Mail } from 'lucide-react';
import { getEmailSettings } from '../emailSettingsApi';
import { AuthLayout, Banner, Button, IconButton, RecordToMinutesIllustration, TextField } from '../ui';
import { requestOtp } from './authApi';
import { checkLoginEmail, EMAIL_CHECK_MESSAGE, normalizeEmail } from './email';
import { MailSetupDialog } from './MailSetupDialog';
import { MockNotice } from './MockNotice';
import type { LoginLocationState, VerifyLocationState } from './routes';

type MailStatus = 'checking' | 'configured' | 'missing' | 'unknown';
type Notice = { tone: 'warning' | 'danger' | 'info'; text: string } | null;

/**
 * AUTH-01 로그인 — 이메일 입력 (docs/renewal/화면기획/AUTH-01, 시안 적용 기준 5.1).
 * 회사 이메일(@miinit.com)을 확인하고 인증 코드를 요청한 뒤 AUTH-02로 이동한다.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LoginLocationState;
  const [email, setEmail] = useState(state.email ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(
    state.reason === 'expired' ? { tone: 'info', text: '로그인이 만료되었습니다. 다시 로그인해 주세요.' } : null,
  );
  const [sending, setSending] = useState(false);
  // 목업은 메일을 보내지 않으므로 메일 설정을 확인하지 않는다
  const [mailStatus, setMailStatus] = useState<MailStatus>(__AUTH_MOCK__ ? 'configured' : 'checking');
  const [mailDialog, setMailDialog] = useState(false);

  // 메일 설정 여부는 configured만 본다 (R-02)
  useEffect(() => {
    if (__AUTH_MOCK__) return;
    let active = true;
    getEmailSettings()
      .then((settings) => active && setMailStatus(settings.configured ? 'configured' : 'missing'))
      .catch(() => active && setMailStatus('unknown'));
    return () => {
      active = false;
    };
  }, []);

  const blockedByMail = mailStatus === 'missing';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending || blockedByMail) return;
    const normalized = normalizeEmail(email);
    const check = checkLoginEmail(normalized);
    if (check !== 'ok') {
      setFieldError(EMAIL_CHECK_MESSAGE[check]);
      return;
    }
    setFieldError(null);
    setNotice(null);
    setSending(true);
    const result = await requestOtp(normalized);
    setSending(false);
    if (result.ok) {
      const next: VerifyLocationState = {
        email: normalized,
        expiresInSeconds: result.expiresInSeconds,
        resendAfterSeconds: result.resendAfterSeconds,
        from: state.from,
      };
      navigate('/login/verify', { state: next });
      return;
    }
    switch (result.reason) {
      case 'RATE_LIMITED':
        setNotice({ tone: 'warning', text: `잠시 후 다시 시도해 주세요. (${result.retryAfterSeconds}초 후 가능)` });
        break;
      case 'INVALID_EMAIL':
        setFieldError(EMAIL_CHECK_MESSAGE.format);
        break;
      case 'AUTH_UNAVAILABLE':
        setNotice({ tone: 'danger', text: '인증 코드를 보낼 메일이 설정되지 않았습니다. 관리자에게 문의해 주세요.' });
        break;
      default:
        setNotice({ tone: 'danger', text: '인증 코드를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    }
  }

  return (
    <AuthLayout illustration={<RecordToMinutesIllustration className="w-full" />}>
      <div className="flex flex-col gap-6">
        <MockNotice />
        {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}
        <div className="flex flex-col gap-2">
          <h1 className="text-headline text-text">회사 이메일로 로그인</h1>
          <p className="text-body text-text-muted">회사 이메일로 받은 6자리 코드로 로그인합니다.</p>
        </div>
        <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
          <TextField
            label="회사 이메일"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus
            shape="pill"
            icon={Mail}
            placeholder="name@miinit.com"
            value={email}
            disabled={sending}
            onChange={(event) => {
              setEmail(event.target.value);
              if (fieldError) setFieldError(null);
            }}
            help={fieldError ? undefined : '@miinit.com 계정만 로그인할 수 있습니다.'}
            error={fieldError ?? undefined}
            trailing={
              <IconSubmit disabled={!email.trim() || blockedByMail || mailStatus === 'checking'} loading={sending} />
            }
          />
        </form>
        {blockedByMail && (
          <div className="flex flex-col items-start gap-3">
            <Banner tone="warning">인증 코드를 보낼 메일 설정이 필요합니다.</Banner>
            <Button variant="secondary" onClick={() => setMailDialog(true)}>
              메일 설정
            </Button>
          </div>
        )}
        <p className="text-caption text-text-muted">로그인에 문제가 있으면 관리자에게 문의하세요.</p>
      </div>
      <MailSetupDialog
        open={mailDialog}
        onOpenChange={setMailDialog}
        onConfigured={() => {
          setMailDialog(false);
          setMailStatus('configured');
          setNotice({ tone: 'info', text: '메일 연결을 확인했습니다. 이제 인증 코드를 받을 수 있습니다.' });
        }}
      />
    </AuthLayout>
  );
}

function IconSubmit({ disabled, loading }: { disabled: boolean; loading: boolean }) {
  return (
    <IconButton
      type="submit"
      icon={ArrowRight}
      label={loading ? '인증 코드 보내는 중' : '인증 코드 받기'}
      variant="primary"
      disabled={disabled}
      loading={loading}
    />
  );
}
