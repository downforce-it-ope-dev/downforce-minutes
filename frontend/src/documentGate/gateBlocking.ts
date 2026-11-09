import { useEffect, useSyncExternalStore } from 'react';

/*
 * 문서 연결 확인(CMN-04)이 화면을 막고 있는지 (GitHub #19).
 * 확인 중·실패 화면은 메뉴를 숨기는 집중 모드라, 기존 App이 이 값을 보고 기존 헤더·하단 탭을 숨긴다.
 * App을 다시 그리지 않고 숨기기만 하므로 녹음·검토 상태가 유지된다.
 */
let blocking = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: boolean) {
  if (next === blocking) return;
  blocking = next;
  listeners.forEach((listener) => listener());
}

/** 게이트 쪽: 막고 있는 동안 true. 게이트가 사라지면 false로 돌린다 */
export function useReportGateBlocking(active: boolean) {
  useEffect(() => {
    publish(active);
  }, [active]);
  useEffect(() => () => publish(false), []);
}

/** 기존 App 쪽: 게이트가 화면을 막고 있는지 */
export function useGateBlocking(): boolean {
  return useSyncExternalStore(subscribe, () => blocking, () => false);
}
