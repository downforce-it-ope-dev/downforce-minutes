import { useLayoutEffect } from 'react';
import { useToast } from './toastContext';

export type ToastFunction = ReturnType<typeof useToast>;

/**
 * 토스트는 AppShell(ToastProvider) 안에서만 쓸 수 있다. 화면 상태를 AppShell 바깥(상단 바 내용을 정하는 쪽)에 둘 때,
 * 이 부품을 AppShell 안에 두어 토스트 함수를 바깥으로 넘긴다. onReady는 useCallback으로 고정해 넘긴다.
 */
export function ToastBridge({ onReady }: { onReady: (toast: ToastFunction) => void }) {
  const toast = useToast();
  useLayoutEffect(() => {
    onReady(toast);
  }, [onReady, toast]);
  return null;
}
