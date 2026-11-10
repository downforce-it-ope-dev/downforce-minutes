import { useEffect, useRef } from 'react';

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

/**
 * 화면 꺼짐 방지 (MTG-02 3.4, 사용자 결정 2026-11-10).
 * active인 동안(녹음 중·일시정지) Screen Wake Lock을 요청하고, 다른 앱에 갔다 돌아오면 다시 요청한다.
 * 브라우저가 지원하지 않거나 거절하면 onUnavailable을 한 번만 부른다(우회 처리 없음).
 */
export function useWakeLock(active: boolean, onUnavailable: () => void) {
  const reported = useRef(false);
  const onUnavailableRef = useRef(onUnavailable);
  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  });

  useEffect(() => {
    if (!active) return undefined;
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    const report = () => {
      if (reported.current) return;
      reported.current = true;
      onUnavailableRef.current();
    };
    if (!wakeLock) {
      report();
      return undefined;
    }
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const request = () => {
      if (document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      wakeLock
        .request('screen')
        .then((next) => {
          if (cancelled) void next.release().catch(() => undefined);
          else sentinel = next;
        })
        .catch(report);
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', request);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
