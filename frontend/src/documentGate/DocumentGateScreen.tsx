import { LoaderCircle, RefreshCw, Settings, TriangleAlert } from 'lucide-react';
import { AppCanvas, Button, ButtonLink, Card, Icon, LogoSymbol } from '../ui';

export interface DocumentGateScreenProps {
  state: 'checking' | 'failed';
  onRetry: () => void;
}

/**
 * 문서 연결 확인(CMN-04) 화면. 메뉴 없는 집중 모드이고 설명 문구를 두지 않는다(S-13).
 * 기존 App 안에서도 그려지므로 화면 전체를 덮어 기존 레이아웃에서 벗어난다.
 */
export function DocumentGateScreen({ state, onRetry }: DocumentGateScreenProps) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto">
      <AppCanvas className="flex flex-col items-center justify-center px-4 pt-safe pb-safe">
        {state === 'checking' ? (
          <div role="status" className="flex flex-col items-center gap-6">
            <LogoSymbol size="lg" />
            <Icon icon={LoaderCircle} size="lg" className="animate-spin text-primary motion-reduce:animate-none" />
            <span className="sr-only">문서 연결 상태를 확인하는 중</span>
          </div>
        ) : (
          <Card role="alert" className="flex w-full max-w-dialog flex-col items-center gap-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-warning-soft text-warning-text">
              <Icon icon={TriangleAlert} size="xl" />
            </span>
            <h1 className="text-title text-text break-keep">문서 연결 상태를 확인할 수 없습니다</h1>
            <div className="flex w-full flex-col gap-2 tablet:flex-row-reverse">
              <Button size="lg" icon={RefreshCw} className="tablet:flex-1" onClick={onRetry}>
                다시 확인
              </Button>
              <ButtonLink to="/settings/document" size="lg" variant="secondary" icon={Settings} className="tablet:flex-1">
                문서 연결 설정
              </ButtonLink>
            </div>
          </Card>
        )}
      </AppCanvas>
    </div>
  );
}
