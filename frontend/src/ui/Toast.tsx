import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, CircleCheck, Info, type LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';
import { RENEWAL_ROOT_CLASS } from './renewalRoot';
import { ToastContext, type ToastOptions, type ToastTone } from './toastContext';

/**
 * 토스트 위치 (CMN-01 4장, 스타일 검토 8.5)
 * - base: 화면 아래 16 + 안전 영역 (탭 바·고정 버튼이 없는 화면, 인증 화면)
 * - tabbar: 하단 탭 바(64) 위 16
 * - action: 하단 고정 버튼 줄(56 + 위아래 12) 위 16
 */
export type ToastPlacement = 'base' | 'tabbar' | 'action';

interface ToastState extends ToastOptions {
  id: number;
}

const TONE_ICON: Record<ToastTone, { icon: LucideIcon; color: string }> = {
  info: { icon: Info, color: 'text-primary-soft-text' },
  success: { icon: CircleCheck, color: 'text-success-text' },
  danger: { icon: CircleAlert, color: 'text-danger-text' },
};

const PLACEMENT: Record<ToastPlacement, string> = {
  base: 'bottom-4',
  tabbar: 'bottom-20',
  action: 'bottom-24',
};

/**
 * 토스트 (CMN-01-F08). 한 번에 하나만 보이고 새 토스트가 이전 것을 바꾼다.
 * 알림 영역(aria-live)은 항상 그려 두어 화면 읽기 프로그램이 바뀐 문구를 읽게 한다.
 * body 바로 아래 Portal이므로 data-ui="renewal"과 루트 클래스를 붙인다(CLAUDE.md).
 */
export function ToastProvider({ placement = 'base', children }: { placement?: ToastPlacement; children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const nextId = useRef(0);

  const show = useCallback((options: ToastOptions) => {
    nextId.current += 1;
    setToast({ ...options, id: nextId.current });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.duration ?? (toast.action ? 8000 : 5000));
    return () => window.clearTimeout(timer);
  }, [toast]);

  const tone = toast?.tone ?? 'info';
  const { icon, color } = TONE_ICON[tone];

  return (
    <ToastContext.Provider value={show}>
      {children}
      {createPortal(
        <div
          data-ui="renewal"
          className={cn(
            RENEWAL_ROOT_CLASS,
            'pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 pb-safe',
            PLACEMENT[placement],
          )}
        >
          <div role="status" aria-live="polite" aria-atomic="true" className="flex w-full max-w-auth justify-center">
            {toast && (
              <div
                key={toast.id}
                className="pointer-events-auto flex min-h-12 items-center gap-3 rounded-full bg-bg py-2 pr-2 pl-5 shadow-overlay"
              >
                <Icon icon={icon} size="md" className={cn('shrink-0', color)} />
                <p className="text-body break-keep text-text">
                  {tone === 'danger' && <span className="sr-only">오류: </span>}
                  {toast.message}
                </p>
                {toast.action ? (
                  <button
                    type="button"
                    onClick={() => {
                      toast.action?.onClick();
                      setToast(null);
                    }}
                    className="h-10 shrink-0 cursor-pointer rounded-full px-3 text-label text-link active:bg-accent-soft"
                  >
                    {toast.action.label}
                  </button>
                ) : (
                  <span className="w-3" aria-hidden="true" />
                )}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
