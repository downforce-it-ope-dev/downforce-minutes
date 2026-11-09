import type { ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './IconButton';
import { RENEWAL_ROOT_CLASS } from './renewalRoot';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** 제목 아래 설명. 화면 읽기 프로그램이 대화상자 설명으로 읽는다 */
  description?: ReactNode;
  /** 아래 버튼 줄. 머리와 함께 고정되고 가운데 내용만 스크롤된다 */
  footer?: ReactNode;
  /** dialog: 최대 폭 560 / form: 640 (넓은 폼·미리보기 목록) */
  size?: 'dialog' | 'form';
  /**
   * false면 ×·Esc·바깥 누르기로 닫히지 않는다(저장·등록 진행 중).
   * 닫기 버튼도 숨긴다. 진행이 끝나면 다시 true로 바꾼다.
   */
  dismissible?: boolean;
  /** 닫기 버튼 이름 (기본 "닫기") */
  closeLabel?: string;
  children?: ReactNode;
}

/**
 * 대화상자 / 하단 시트 (스타일 검토 8.5, 시안 적용 기준 4.1).
 * - 휴대폰(600 미만): 화면 아래에 붙는 하단 시트, 폭 가득, 위 64px을 남겨 최대 높이 약 90%
 * - 태블릿(600 이상): 가운데 대화상자, 최대 폭 560(form은 640)
 * - Radix Dialog: 초점 가두기, Esc 닫기, 닫으면 연 요소로 초점 복귀, 뒤 화면 읽기 차단
 * - Portal로 body 바로 아래에 그려지므로 가장 바깥 요소에 data-ui="renewal"과 루트 클래스를 붙인다(CLAUDE.md)
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  size = 'dialog',
  dismissible = true,
  closeLabel = '닫기',
  children,
}: DialogProps) {
  const block = (event: Event) => {
    if (!dismissible) event.preventDefault();
  };
  const handleOpenChange = (next: boolean) => {
    if (!next && !dismissible) return;
    onOpenChange(next);
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={handleOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          data-ui="renewal"
          className={cn(
            RENEWAL_ROOT_CLASS,
            'fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/40 pt-16',
            'tablet:items-center tablet:p-6',
          )}
        >
          <RadixDialog.Content
            data-ui="renewal"
            onEscapeKeyDown={block}
            onPointerDownOutside={block}
            onInteractOutside={block}
            className={cn(
              RENEWAL_ROOT_CLASS,
              'flex max-h-full w-full flex-col bg-bg shadow-overlay',
              'rounded-t-xl tablet:rounded-xl',
              size === 'form' ? 'tablet:max-w-form' : 'tablet:max-w-dialog',
            )}
            // 설명이 없으면 Radix의 설명 연결 경고를 끈다
            {...(description ? {} : { 'aria-describedby': undefined })}
          >
            <div className="flex items-start gap-3 px-6 pt-6 pb-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <RadixDialog.Title className="text-title text-text">{title}</RadixDialog.Title>
                {description && (
                  <RadixDialog.Description className="text-body text-text-muted">{description}</RadixDialog.Description>
                )}
              </div>
              {dismissible && (
                <RadixDialog.Close asChild>
                  <IconButton icon={X} label={closeLabel} className="-mt-3 -mr-3" />
                </RadixDialog.Close>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
            {footer && (
              <div className="flex flex-col-reverse gap-2 border-t border-border px-6 pt-4 pb-6 tablet:flex-row tablet:justify-end">
                {footer}
              </div>
            )}
            {/* 휴대폰 하단 시트는 홈 표시줄만큼 더 띄운다 */}
            <div className="pb-safe tablet:hidden" aria-hidden="true" />
          </RadixDialog.Content>
        </RadixDialog.Overlay>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
