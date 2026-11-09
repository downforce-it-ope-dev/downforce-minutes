import { useEffect, useSyncExternalStore } from 'react';

/*
 * 화면이 세션 관리(SessionKeeper)에 알리는 진행 중 작업 상태 (GitHub #15, README R-05).
 * - busy: 녹음·처리 대기·저장하지 않은 검토처럼 화면을 떠나면 안 되는 작업. 세션이 만료돼도 끝날 때까지 로그인 화면으로 보내지 않는다
 * - keepAlive: 녹음처럼 조작이 없어도 세션을 계속 갱신해야 하는 작업
 */
export interface SessionWork {
  busy: boolean;
  keepAlive: boolean;
}

const IDLE: SessionWork = { busy: false, keepAlive: false };
let current: SessionWork = IDLE;
const listeners = new Set<() => void>();

function publish(next: SessionWork) {
  if (next.busy === current.busy && next.keepAlive === current.keepAlive) return;
  current = next.busy || next.keepAlive ? next : IDLE;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 화면 쪽: 진행 중 작업 상태를 알린다. 화면이 사라지면 작업 없음으로 돌린다 */
export function useReportSessionWork(busy: boolean, keepAlive: boolean) {
  useEffect(() => {
    publish({ busy, keepAlive });
  }, [busy, keepAlive]);
  useEffect(() => () => publish(IDLE), []);
}

/** 세션 관리 쪽: 현재 진행 중 작업 상태 */
export function useSessionWork(): SessionWork {
  return useSyncExternalStore(subscribe, () => current, () => IDLE);
}
