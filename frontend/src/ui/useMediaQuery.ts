import { useSyncExternalStore } from 'react';

/** 화면 폭 기준 (tailwind.css @theme --breakpoint-*) */
export const TABLET_QUERY = '(min-width: 37.5rem)';

/**
 * 미디어 쿼리 일치 여부. 같은 내용을 크기마다 다른 방식으로 그려야 할 때만 쓴다
 * (예: 태블릿은 화면 안 패널, 휴대폰은 대화상자). 모양만 다르면 Tailwind 조건(tablet:)을 쓴다.
 * matchMedia가 없는 환경(테스트)에서는 false(휴대폰)다.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}
