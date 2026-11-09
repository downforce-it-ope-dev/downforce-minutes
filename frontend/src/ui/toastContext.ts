import { createContext, useContext, type ReactNode } from 'react';

export type ToastTone = 'info' | 'success' | 'danger';

export interface ToastOptions {
  message: ReactNode;
  tone?: ToastTone;
  /** 텍스트 버튼 1개 (예: 되돌리기) */
  action?: { label: string; onClick: () => void };
  /** 사라지기까지 ms. 기본 5000, 동작이 있으면 8000 */
  duration?: number;
}

export const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

/** 토스트를 띄우는 함수. ToastProvider 안에서만 쓴다 */
export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast는 ToastProvider 안에서 써야 합니다.');
  return show;
}
