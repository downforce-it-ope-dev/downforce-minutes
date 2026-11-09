import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { getSetupSnapshot } from '../documentSetupApi';
import { DocumentGateScreen } from './DocumentGateScreen';
import { useReportGateBlocking } from './gateBlocking';

type GateState = 'checking' | 'failed' | 'allowed';

/**
 * 문서 연결 확인 (CMN-04, GitHub #19). 문서 서비스가 필요한 화면(홈·새 회의·참석자)에 들어가기 전에 확인한다.
 * - READY이고 회의를 만들 수 있으면 통과
 * - 저장소 문제(STORAGE_UNAVAILABLE)면 문서 연결 관리, 그 밖의 미연결이면 연결 흐름(SET-03)으로 원래 경로를 넘겨 이동
 * - 조회 실패면 오류 화면 + 다시 확인 / 문서 연결 설정
 * 로그인 확인(RequireAuth) 다음에 동작한다. 확인 중·실패 화면은 메뉴를 숨기는 집중 모드(결정 2026-11-09)이고,
 * 설명 문구 없이 표시한다(S-13).
 */
export function DocumentGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<GateState>('checking');
  const [attempt, setAttempt] = useState(0);
  useReportGateBlocking(state !== 'allowed');

  useEffect(() => {
    let live = true;
    getSetupSnapshot()
      .then(({ snapshot }) => {
        if (!live) return;
        if (snapshot.status === 'READY' && snapshot.canCreateMeeting) {
          setState('allowed');
          return;
        }
        const to = snapshot.status === 'STORAGE_UNAVAILABLE' ? '/settings/document' : '/setup/document';
        navigate(to, { replace: true, state: { from: location.pathname } });
      })
      .catch(() => live && setState('failed'));
    return () => {
      live = false;
    };
  }, [attempt, location.pathname, navigate]);

  if (state === 'allowed') return children;
  return (
    <DocumentGateScreen
      state={state}
      onRetry={() => {
        setState('checking');
        setAttempt((value) => value + 1);
      }}
    />
  );
}
