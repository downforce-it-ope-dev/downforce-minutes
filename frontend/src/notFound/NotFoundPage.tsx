import { FileText, House } from 'lucide-react';
import { AppShell, ButtonLink, Card, NotFoundIllustration } from '../ui';

/**
 * 페이지 없음 (CMN-03, GitHub #18). 정의되지 않은 모든 경로. 앱 틀 안에 두어 메뉴로도 이동할 수 있다.
 * 화면에는 제목·일러스트·이동 버튼만 둔다(S-13).
 */
export function NotFoundPage() {
  return (
    <AppShell title="페이지를 찾을 수 없습니다">
      <Card className="mx-auto mt-4 flex w-full max-w-dialog flex-col items-center gap-6 tablet:mt-12">
        <NotFoundIllustration className="w-30 short:hidden tablet:w-40" />
        <nav aria-label="다른 화면으로 이동" className="flex w-full flex-col gap-2">
          <ButtonLink to="/" size="lg" icon={House} fullWidth>
            홈으로 이동
          </ButtonLink>
          <ButtonLink to="/meetings" size="lg" variant="secondary" icon={FileText} fullWidth>
            회의록 목록
          </ButtonLink>
        </nav>
      </Card>
    </AppShell>
  );
}
