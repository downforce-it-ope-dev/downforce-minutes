import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { ArrowLeft, FileText, House, Settings, Users, type LucideIcon } from 'lucide-react';
import { cn } from '../cn';
import { Icon } from '../Icon';
import { IconButton } from '../IconButton';
import { Logo } from '../art/Logo';
import { LogoSymbol } from '../art/LogoSymbol';
import { ToastProvider, type ToastPlacement } from '../Toast';
import { AppCanvas } from './AppCanvas';

interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  /** 홈처럼 정확히 같은 경로에서만 선택 */
  end?: boolean;
}

/** 주 메뉴 (CMN-01-F02). 아직 기존 화면인 메뉴로 가면 기존 레이아웃이 보인다(묶음 단위 공개, S-05) */
const MAIN_NAV: readonly NavEntry[] = [
  { to: '/', label: '홈', icon: House, end: true },
  { to: '/meetings', label: '회의록', icon: FileText },
  { to: '/participants', label: '참석자', icon: Users },
  { to: '/settings', label: '설정', icon: Settings },
];

export interface AppShellProps {
  /** 상단 바 제목(h1) */
  title: ReactNode;
  /** 제목을 화면에서 숨기고 화면 읽기 프로그램에만 남긴다 (홈처럼 메뉴가 곧 위치를 알려 줄 때) */
  hideTitle?: boolean;
  /** 상세 화면의 뒤로 가기. to가 없으면 브라우저 뒤로 가기 */
  /** 뒤로 가기. onClick이 있으면 그것만 한다(같은 경로 안에서 화면 상태를 되돌릴 때) */
  back?: { to?: string; label?: string; onClick?: () => void };
  /** 상단 바 오른쪽 (문서 연결 상태 칩, 새 회의 버튼 등). 집중 모드에서는 숨긴다 */
  actions?: ReactNode;
  /** 집중 모드 (CMN-01-F03): 메뉴를 숨기고 상단 바에는 제목과 뒤로 가기만 둔다 */
  focus?: boolean;
  /** 사이드바 아래 계정 영역 (HOME 묶음에서 채운다, CMN-01-F05) */
  account?: ReactNode;
  /** 태블릿 이상에서 본문 높이를 화면에 맞춘다. 화면 안 영역(예: 참석자 목록)이 따로 스크롤할 때 쓴다. 낮은 화면(short)은 페이지 스크롤 */
  fillHeight?: boolean;
  /** 토스트 위치. 기본: 집중 모드는 화면 아래, 그 밖은 탭 바 위. 아래쪽에 큰 동작 버튼이 있으면 top */
  toastPlacement?: ToastPlacement;
  children: ReactNode;
}

/**
 * 로그인 이후 리뉴얼 화면의 앱 틀 (CMN-01, 시안 적용 기준 3.4·4.3, S-11).
 * - 휴대폰: 상단 바 + 하단 탭 바(64 + 안전 영역)
 * - tablet(600~959): 왼쪽 레일 88(심볼 로고, 아이콘 위·이름 아래)
 * - tablet-lg(960 이상): 왼쪽 사이드바 240(글자 로고 + Minutes, 아이콘·이름 가로, 아래 계정)
 * - 메뉴와 상단 바는 고정이고 본문만 스크롤한다. short(높이 560 이하)에서는 상단 바를 줄인다
 */
export function AppShell({ title, hideTitle = false, back, actions, focus = false, account, fillHeight = false, toastPlacement, children }: AppShellProps) {
  return (
    <AppCanvas>
      <ToastProvider placement={toastPlacement ?? (focus ? 'base' : 'tabbar')}>
        <a
          href="#main-content"
          className="sr-only z-50 rounded-md bg-bg px-4 py-3 text-label shadow-overlay focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
        >
          본문으로 건너뛰기
        </a>
        {!focus && <MainNav account={account} />}
        <div className={cn('flex h-dvh flex-col', !focus && 'tablet:pl-rail tablet-lg:pl-sidebar')}>
          <TopBar title={title} hideTitle={hideTitle} back={back} actions={focus ? undefined : actions} />
          {/* 본문만 스크롤하므로, 안에 누를 요소가 없어도 키보드로 스크롤할 수 있게 초점을 받는다 */}
          <main id="main-content" tabIndex={0} aria-label="본문" className="min-h-0 flex-1 overflow-y-auto">
            <div
              className={cn(
                'mx-auto flex min-h-full w-full max-w-content flex-col px-4 pt-2 pb-8 tablet:px-6 tablet-lg:px-8 short:pb-4',
                fillHeight && 'tablet:h-full tablet:pb-4 short:h-auto',
              )}
            >
              {children}
            </div>
          </main>
          {/* 휴대폰 하단 탭 바 자리 */}
          {!focus && <div className="h-16 shrink-0 pb-safe tablet:hidden" aria-hidden="true" />}
          {focus && <div className="shrink-0 pb-safe" aria-hidden="true" />}
        </div>
      </ToastProvider>
    </AppCanvas>
  );
}

function MainNav({ account }: { account?: ReactNode }) {
  return (
    <nav
      aria-label="주 메뉴"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg pb-safe',
        'tablet:inset-y-0 tablet:right-auto tablet:flex tablet:w-rail tablet:flex-col tablet:border-t-0 tablet:border-r tablet:bg-bg/70 tablet:pt-safe tablet:pb-6',
        'tablet-lg:w-sidebar',
      )}
    >
      <Link
        to="/"
        aria-label="홈으로"
        className="hidden shrink-0 items-center justify-center rounded-lg tablet:flex tablet:py-6 short:tablet:py-3 tablet-lg:py-10"
      >
        {/* cn은 클래스 충돌을 풀지 않으므로 보이기·숨기기는 감싸는 요소에서 정한다 */}
        <span className="flex tablet-lg:hidden">
          <LogoSymbol size="lg" />
        </span>
        <span className="hidden tablet-lg:flex">
          <Logo size="md" withProduct />
        </span>
      </Link>
      <ul className="flex tablet:flex-col tablet:gap-2 tablet:px-2 tablet-lg:px-4">
        {MAIN_NAV.map((entry) => (
          <li key={entry.to} className="flex-1 tablet:flex-none">
            <NavItem {...entry} />
          </li>
        ))}
      </ul>
      {account && <div className="mt-auto hidden border-t border-border px-4 pt-4 tablet-lg:block">{account}</div>}
    </nav>
  );
}

/** 주 메뉴 항목. 선택된 메뉴는 aria-current="page"와 selected 색 (시안 적용 기준 4.3) */
function NavItem({ to, label, icon, end }: NavEntry) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex h-16 flex-col items-center justify-center gap-1 text-nav',
          'tablet:rounded-lg',
          'tablet-lg:h-14 tablet-lg:flex-row tablet-lg:justify-start tablet-lg:gap-3 tablet-lg:px-4 tablet-lg:text-label',
          isActive ? 'text-selected-text tablet:bg-selected' : 'text-text-muted active:bg-bg-subtle',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className={cn('flex h-8 w-14 items-center justify-center rounded-full tablet:w-auto', isActive && 'bg-selected tablet:bg-transparent')}>
            <Icon icon={icon} size="lg" />
          </span>
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

function TopBar({ title, hideTitle, back, actions }: Pick<AppShellProps, 'title' | 'hideTitle' | 'back' | 'actions'>) {
  const navigate = useNavigate();
  return (
    <header className="shrink-0 pt-safe">
      <div className="mx-auto flex h-14 w-full max-w-content items-center gap-2 px-4 tablet:h-20 tablet:px-6 tablet-lg:px-8 short:h-12 short:tablet:h-14">
        {back && (
          // 뒤로 가기는 흰 원형 버튼(시안의 상단 바 보조 동작과 같은 모양)
          <IconButton
            icon={ArrowLeft}
            label={back.label ?? '뒤로 가기'}
            variant="surface"
            className="mr-2"
            onClick={() => (back.onClick ? back.onClick() : back.to ? navigate(back.to) : navigate(-1))}
          />
        )}
        <h1 className={cn('min-w-0 flex-1 truncate text-headline text-text', hideTitle && 'sr-only')}>{title}</h1>
        {hideTitle && <span className="flex-1" aria-hidden="true" />}
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
