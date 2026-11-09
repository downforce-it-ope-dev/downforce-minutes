import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { getSession, recordActivity } from './authApi';
import type { LoginLocationState } from './routes';
import { useSessionWork } from './sessionWork';

/** 활동 갱신·만료 확인 간격. 활동은 이 간격으로 묶어 한 번만 보낸다 (AUTH-02 6장) */
export const SESSION_CHECK_INTERVAL_MS = 60_000;

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * 로그인 후 세션 유지 (CMN-01-F09, GitHub #15). 화면에는 아무것도 그리지 않는다.
 * - 조작·화면 이동이 있으면 다음 확인 때 활동 갱신을 보낸다. 녹음 중(keepAlive)에는 조작이 없어도 보낸다
 * - 활동이 없으면 세션만 확인한다. 화면이 다시 보일 때(태블릿 화면 켜짐)도 바로 확인한다
 * - 만료되면 로그인 화면으로 보낸다. 진행 중 작업(busy)이 있으면 끝날 때까지 기다린다 (R-05)
 * - 연결 실패는 만료로 보지 않는다. 기존 화면의 연결 복구 동작이 맡는다
 */
export function SessionKeeper() {
  const navigate = useNavigate();
  const location = useLocation();
  const work = useSessionWork();
  const active = useRef(false);
  const workRef = useRef(work);
  const [expired, setExpired] = useState(false);
  const redirected = useRef(false);

  useEffect(() => {
    workRef.current = work;
  }, [work]);

  // 화면 이동도 활동이다
  useEffect(() => {
    active.current = true;
  }, [location.pathname]);

  useEffect(() => {
    const markActive = () => {
      active.current = true;
    };
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      const send = active.current || workRef.current.keepAlive;
      active.current = false;
      const result = await (send ? recordActivity() : getSession());
      checking = false;
      if (result.status === 'unauthenticated') setExpired(true);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    ACTIVITY_EVENTS.forEach((type) => window.addEventListener(type, markActive, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => void check(), SESSION_CHECK_INTERVAL_MS);
    return () => {
      ACTIVITY_EVENTS.forEach((type) => window.removeEventListener(type, markActive, { capture: true }));
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!expired || work.busy || redirected.current) return;
    redirected.current = true;
    const state: LoginLocationState = { reason: 'expired', from: `${location.pathname}${location.search}` };
    navigate('/login', { replace: true, state });
  }, [expired, work.busy, location.pathname, location.search, navigate]);

  return null;
}
