import type { ReactNode } from 'react';
import { cn } from '../cn';
import { Logo } from '../art/Logo';
import { AppCanvas } from './AppCanvas';

export interface AuthLayoutProps {
  /** 장식 일러스트 (RecordToMinutesIllustration, MailCodeIllustration) */
  illustration: ReactNode;
  /**
   * 입력 영역 최대 폭. auth: 480(기획 8.6) / dialog: 560
   * AUTH-02처럼 한 줄에 안내 문구와 버튼이 같이 놓이면 dialog를 쓴다(시안 일치율 검증 결과)
   */
  width?: 'auth' | 'dialog';
  children: ReactNode;
}

/**
 * 인증 화면 틀 (AUTH-01·02, 시안 적용 기준 4.3·5.1·5.2). 메뉴·상단 바 없음.
 * - tablet-lg(960 이상): 왼쪽 일러스트, 오른쪽 입력 영역 2단
 * - tablet(600~959): 1단, 일러스트를 입력 영역 위에 작게
 * - 휴대폰: 1단, 일러스트 숨김
 * - short(높이 560 이하, 화면 키보드 열림): 로고·일러스트 숨기고 여백을 줄인다
 */
export function AuthLayout({ illustration, width = 'auth', children }: AuthLayoutProps) {
  return (
    <AppCanvas waves="auth" className="flex flex-col">
      <header className="px-4 pt-safe tablet:px-8 short:hidden">
        <div className="pt-6 tablet:pt-10">
          <Logo size="lg" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-content flex-1 flex-col items-center justify-center gap-8 px-4 py-8 short:py-4 tablet:px-8 tablet-lg:flex-row tablet-lg:gap-16">
        <div className="hidden w-56 tablet:block tablet-lg:w-auto tablet-lg:max-w-md tablet-lg:flex-1 short:hidden">
          {illustration}
        </div>
        <div className={cn('w-full', width === 'dialog' ? 'max-w-dialog' : 'max-w-auth', 'tablet-lg:flex-1')}>{children}</div>
      </main>
      <div className="pb-safe" aria-hidden="true" />
    </AppCanvas>
  );
}
