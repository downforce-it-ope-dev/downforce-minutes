import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Clock, Info, Pencil, RefreshCw, ShieldCheck } from 'lucide-react';
import { AuthLayout, Banner, Button, cn, Icon, MailCodeIllustration, OtpInput, ProgressBar, useToast } from '../ui';
import { requestOtp, verifyOtp } from './authApi';
import { MockNotice } from './MockNotice';
import { safeReturnPath, type LoginLocationState, type VerifyLocationState } from './routes';

const CODE_LENGTH = 6;
/** 남은 시간이 이보다 적으면 강조한다 (유효 60초 기준, R-19) */
const URGENT_SECONDS = 15;

type Notice = { tone: 'danger' | 'warning'; text: string } | null;

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 화면 읽기 프로그램에는 매초가 아니라 구간별로만 알린다 */
function spokenRemaining(seconds: number): string {
  if (seconds <= 0) return '인증 코드가 만료되었습니다.';
  if (seconds <= URGENT_SECONDS) return `남은 시간 ${URGENT_SECONDS}초 미만`;
  if (seconds <= 30) return '남은 시간 30초 미만';
  return '';
}

/**
 * AUTH-02 로그인 — 인증 코드 입력 (docs/renewal/화면기획/AUTH-02, 시안 적용 기준 5.2).
 * 정책은 구현된 Backend를 따른다(R-19): 코드 유효 60초, 재발송 60초, 5회 실패 시 5분 잠금, 남은 시도 비표시.
 */
export function VerifyPage() {
  const location = useLocation();
  const state = location.state as VerifyLocationState | null;
  if (!state?.email) return <Navigate to="/login" replace />;
  return <VerifyForm initial={state} />;
}

function VerifyForm({ initial }: { initial: VerifyLocationState }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { email, from } = initial;
  const [now, setNow] = useState(() => Date.now());
  const [expiresAt, setExpiresAt] = useState(() => Date.now() + initial.expiresInSeconds * 1000);
  const [totalSeconds, setTotalSeconds] = useState(initial.expiresInSeconds);
  const [resendAt, setResendAt] = useState(() => Date.now() + initial.resendAfterSeconds * 1000);
  const [code, setCode] = useState('');
  const [otpKey, setOtpKey] = useState(0);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [serverExpired, setServerExpired] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const resendWait = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const lockWait = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;
  const locked = lockWait > 0;
  const expired = serverExpired || remaining === 0;
  const urgent = !expired && remaining <= URGENT_SECONDS;
  const canVerify = code.length === CODE_LENGTH && !expired && !locked && !verifying;

  function backToLogin() {
    const next: LoginLocationState = { email, from };
    navigate('/login', { state: next });
  }

  function clearCode() {
    setCode('');
    setOtpKey((key) => key + 1); // 다시 그려 첫 칸에 초점
  }

  async function verify(value: string) {
    if (value.length !== CODE_LENGTH || expired || locked || verifying) return;
    setVerifying(true);
    setNotice(null);
    setCodeError(null);
    const result = await verifyOtp(email, value);
    setVerifying(false);
    if (result.ok) {
      navigate(safeReturnPath(from), { replace: true });
      return;
    }
    switch (result.reason) {
      case 'INVALID':
        setCodeError('코드가 올바르지 않습니다. 다시 확인해 주세요.');
        clearCode();
        break;
      case 'EXPIRED':
        setServerExpired(true);
        setCodeError('코드가 만료되었습니다. 새 코드를 받아 주세요.');
        break;
      case 'LOCKED':
        setLockedUntil(Date.now() + result.retryAfterSeconds * 1000);
        clearCode();
        break;
      default:
        setNotice({ tone: 'danger', text: '인증 코드를 확인하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.' });
    }
  }

  async function resend() {
    if (resendWait > 0 || resending || locked) return;
    setResending(true);
    setNotice(null);
    const result = await requestOtp(email);
    setResending(false);
    if (result.ok) {
      const at = Date.now();
      setExpiresAt(at + result.expiresInSeconds * 1000);
      setTotalSeconds(result.expiresInSeconds);
      setResendAt(at + result.resendAfterSeconds * 1000);
      setNow(at);
      setServerExpired(false);
      setCodeError(null);
      clearCode();
      toast({ message: '새 인증 코드를 보냈습니다.', tone: 'success' });
      return;
    }
    if (result.reason === 'RATE_LIMITED') {
      setResendAt(Date.now() + result.retryAfterSeconds * 1000);
      setNotice({ tone: 'warning', text: `잠시 후 다시 시도해 주세요. (${result.retryAfterSeconds}초 후 가능)` });
    } else {
      setNotice({ tone: 'danger', text: '인증 코드를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void verify(code);
  }

  const errorId = 'otp-error';

  return (
    <AuthLayout width="dialog" illustration={<MailCodeIllustration className="w-full" />}>
      <form className="flex flex-col gap-6" onSubmit={submit} noValidate>
        <MockNotice />
        {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}
        {locked && (
          <Banner
            tone="danger"
            title="시도 횟수를 초과했습니다."
            action={
              <Button size="sm" variant="secondary" onClick={backToLogin}>
                처음으로
              </Button>
            }
          >
            <span className="tabular-nums">{formatClock(lockWait)} 뒤에 처음부터 다시 시도해 주세요.</span>
          </Banner>
        )}
        <div className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
            <Icon icon={ShieldCheck} size="xl" />
          </span>
          <h1 className="text-headline text-text">인증 코드 입력</h1>
        </div>
        <div className="flex flex-col gap-3 tablet:flex-row tablet:items-center tablet:justify-between">
          <p className="text-body text-text-muted">
            <strong className="font-semibold text-text">{email}</strong> 으로 보낸 6자리 코드를 입력해 주세요.
          </p>
          <Button size="sm" variant="secondary" shape="pill" icon={Pencil} className="self-start tablet:self-auto" onClick={backToLogin}>
            이메일 변경
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <OtpInput
            key={otpKey}
            label="인증 코드 6자리"
            value={code}
            onChange={(value) => {
              setCode(value);
              if (codeError && !serverExpired) setCodeError(null);
            }}
            onComplete={(value) => void verify(value)}
            error={Boolean(codeError)}
            describedBy={codeError ? errorId : undefined}
            disabled={expired || locked || verifying}
            autoFocus
          />
          {codeError && (
            <p id={errorId} role="alert" className="text-caption text-danger-text">
              {codeError}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className={cn('flex items-center gap-2 text-body', urgent || expired ? 'text-danger-text' : 'text-text')}>
            <Icon icon={Clock} size="md" />
            남은 시간{' '}
            <strong className={cn('font-bold tabular-nums', urgent || expired ? 'text-danger-text' : 'text-brand-text')}>
              {formatClock(remaining)}
            </strong>
          </p>
          <ProgressBar
            label="인증 코드 남은 시간"
            value={remaining}
            max={totalSeconds}
            valueText={`${remaining}초 남음`}
            className="max-w-sm"
          />
          <span className="sr-only" aria-live="polite">
            {spokenRemaining(remaining)}
          </span>
        </div>

        <Button type="submit" size="lg" fullWidth disabled={!canVerify} loading={verifying}>
          {verifying ? '확인 중…' : '확인'}
        </Button>
        <Button
          size="lg"
          // 코드가 만료되고 다시 받을 수 있으면 다시 받기가 화면의 주 동작이 된다
          variant={expired && resendWait === 0 && !locked ? 'primary' : 'secondary'}
          fullWidth
          icon={RefreshCw}
          disabled={resendWait > 0 || locked}
          loading={resending}
          onClick={() => void resend()}
        >
          코드 다시 받기{resendWait > 0 && <span className="tabular-nums"> ({resendWait}초)</span>}
        </Button>
        <p className="flex items-center justify-center gap-2 text-caption text-text-muted">
          <Icon icon={Info} size="sm" />
          코드를 받지 못하셨나요? 스팸함도 확인해 주세요.
        </p>
      </form>
    </AuthLayout>
  );
}
