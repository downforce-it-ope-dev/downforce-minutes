import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { AuthLayout, Banner, Button, RecordToMinutesIllustration } from '../ui';
import { getSession, type SessionResult } from './authApi';
import { safeReturnPath, type LoginLocationState } from './routes';

type Status = SessionResult['status'] | 'checking';

function useSessionStatus(): [Status, () => void] {
  const [status, setStatus] = useState<Status>('checking');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    getSession().then((result) => active && setStatus(result.status));
    return () => {
      active = false;
    };
  }, [attempt]);
  return [
    status,
    () => {
      setStatus('checking');
      setAttempt((value) => value + 1);
    },
  ];
}

/**
 * 진입 보호 (AUTH-01-F06, GitHub #15). 로그인하지 않았으면 로그인 화면으로 보내고,
 * 로그인 후 원래 가려던 경로로 돌아오도록 경로를 넘긴다.
 * 확인하는 동안에는 아무것도 그리지 않는다(기존 화면이 잠깐 보였다 사라지지 않게).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [status, retry] = useSessionStatus();
  if (status === 'checking') return null;
  if (status === 'unauthenticated') {
    const state: LoginLocationState = { from: `${location.pathname}${location.search}` };
    return <Navigate to="/login" replace state={state} />;
  }
  if (status === 'unavailable') return <SessionUnavailable onRetry={retry} />;
  return children;
}

/** 로그인 화면용. 이미 로그인했으면 원래 가려던 경로(없으면 홈)로 보낸다 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [status] = useSessionStatus();
  if (status === 'checking') return null;
  if (status === 'authenticated') {
    const from = (location.state as LoginLocationState | null)?.from;
    return <Navigate to={safeReturnPath(from)} replace />;
  }
  return children;
}

function SessionUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <AuthLayout illustration={<RecordToMinutesIllustration className="w-full" />}>
      <div className="flex flex-col gap-6">
        <h1 className="text-headline text-text">로그인 상태를 확인하지 못했습니다</h1>
        <Banner tone="danger">서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.</Banner>
        <Button size="lg" fullWidth icon={RefreshCw} onClick={onRetry}>
          다시 시도
        </Button>
      </div>
    </AuthLayout>
  );
}
