import type { ReactNode } from 'react';

/**
 * 화면 아래 가운데에 고정하는 큰 주 동작 (회의록 목록 "새 회의", 참석자 "참석자 추가").
 * - 메뉴(레일·사이드바) 폭만큼 비켜 본문 영역의 가운데에 둔다. 태블릿 최대 폭 640
 * - 휴대폰은 하단 탭 바 위, 낮은 화면(short)은 고정하지 않고 본문 끝에 둔다
 * - 목록 끝이 가리지 않게 앞에 빈 자리를 함께 그린다. AppShell 본문 끝에 둔다(토스트는 toastPlacement="top")
 */
export function BottomDock({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="h-20 shrink-0 tablet:h-28 low:h-20 short:hidden" aria-hidden="true" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 pb-safe tablet:pl-rail tablet-lg:pl-sidebar short:pointer-events-auto short:static short:mt-4 short:pb-0 short:pl-0">
        <div className="flex justify-center px-4 tablet:px-6 short:px-0">
          <div className="pointer-events-auto mb-20 w-full tablet:mb-6 low:mb-4 tablet:max-w-form short:mb-0">{children}</div>
        </div>
      </div>
    </>
  );
}
