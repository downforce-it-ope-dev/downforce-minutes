import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ArrowRight, Mail, Settings } from 'lucide-react';
import { AuthLayout, IconButton, RecordToMinutesIllustration, TextField, useToast } from '../ui';
import { requestOtp } from './authApi';
import { checkLoginEmail, EMAIL_CHECK_MESSAGE, normalizeEmail } from './email';
import { MailSetupDialog } from './MailSetupDialog';
import { isMailConfigured } from './mailSettings';
import type { LoginLocationState, VerifyLocationState } from './routes';

type MailStatus = 'checking' | 'configured' | 'missing' | 'unknown';

/**
 * AUTH-01 로그인 — 이메일 입력 (docs/renewal/화면기획/AUTH-01, 시안 적용 기준 5.1).
 * 화면에는 제목·입력·버튼만 두고, 오류와 상태 알림은 토스트로 보낸다.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const state = (location.state ?? {}) as LoginLocationState;
  const [email, setEmail] = useState(state.email ?? '');
  const [invalid, setInvalid] = useState(false);
  const [sending, setSending] = useState(false);
  const [mailStatus, setMailStatus] = useState<MailStatus>('checking');
  const [mailDialog, setMailDialog] = useState(false);

  // 세션 만료로 들어왔으면 한 번 알린다
  const expiredNotified = useRef(false);
  useEffect(() => {
    if (state.reason !== 'expired' || expiredNotified.current) return;
    expiredNotified.current = true;
    toast({ message: '로그인이 만료되었습니다. 다시 로그인해 주세요.' });
  }, [state.reason, toast]);

  // 메일 설정 여부는 configured만 본다 (R-02)
  useEffect(() => {
    let active = true;
    isMailConfigured()
      .then((configured) => active && setMailStatus(configured ? 'configured' : 'missing'))
      .catch(() => active && setMailStatus('unknown'));
    return () => {
      active = false;
    };
  }, []);

  const mailMissing = mailStatus === 'missing';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending || mailStatus === 'checking') return;
    if (mailMissing) {
      toast({
        message: '인증 코드를 보낼 메일 설정이 필요합니다.',
        tone: 'danger',
        action: { label: '메일 설정', onClick: () => setMailDialog(true) },
      });
      return;
    }
    const normalized = normalizeEmail(email);
    const check = checkLoginEmail(normalized);
    if (check !== 'ok') {
      setInvalid(true);
      toast({ message: EMAIL_CHECK_MESSAGE[check], tone: 'danger' });
      return;
    }
    setInvalid(false);
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
        toast({ message: `잠시 후 다시 시도해 주세요. (${result.retryAfterSeconds}초 후 가능)` });
        break;
      case 'INVALID_EMAIL':
        setInvalid(true);
        toast({ message: EMAIL_CHECK_MESSAGE.format, tone: 'danger' });
        break;
      case 'AUTH_UNAVAILABLE':
        toast({ message: '인증 코드를 보낼 메일이 설정되지 않았습니다. 관리자에게 문의해 주세요.', tone: 'danger' });
        break;
      default:
        toast({ message: '인증 코드를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.', tone: 'danger' });
    }
  }

  return (
    <AuthLayout illustration={<RecordToMinutesIllustration className="w-full" />}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-headline text-text">회사 이메일로 로그인하세요.</h1>
          {mailMissing && <IconButton icon={Settings} label="메일 설정" variant="surface" onClick={() => setMailDialog(true)} />}
        </div>
        <form onSubmit={submit} noValidate>
          <TextField
            label="회사 이메일"
            hideLabel
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
            invalid={invalid}
            onChange={(event) => {
              setEmail(event.target.value);
              if (invalid) setInvalid(false);
            }}
            trailing={<IconSubmit disabled={!email.trim() || mailStatus === 'checking'} loading={sending} />}
          />
        </form>
      </div>
      <MailSetupDialog
        open={mailDialog}
        onOpenChange={setMailDialog}
        onConfigured={() => {
          setMailDialog(false);
          setMailStatus('configured');
          toast({ message: '메일 연결을 확인했습니다.', tone: 'success' });
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
