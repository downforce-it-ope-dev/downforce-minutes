import { useCallback, useEffect, useState } from 'react';
import { FolderCog, RefreshCw } from 'lucide-react';
import { AccountButton, SidebarAccount } from '../auth/AccountMenu';
import { getAppConfig, getIntegrationHealth, selectSettingsSummary, type AppConfig, type IntegrationHealth } from '../settingsApi';
import { AppShell, Button, ButtonLink, Card, Icon, IconButton, useToast } from '../ui';
import { CardHeading } from './CardHeading';
import { EmailCard } from './EmailCard';

/*
 * SET-01 설정 (GitHub #39, docs/renewal/화면기획/SET-01_설정.md). Slack 설정은 없앴다(D-11).
 * - 카드 두 개: 문서 연결(연결 서비스·상태 → 문서 연결 관리), 이메일(Gmail 발신 설정 보기·수정·삭제·시험 메일)
 * - 모든 크기에서 위아래로 쌓고 본문 폭을 그대로 쓴다(사용자 결정 2026-11-12, 회의록 상세와 같은 배치). 섹션 목차는 두지 않는다
 * - 상단 바의 새로고침 아이콘으로 모든 연결 상태를 다시 불러온다
 * - 설명 문구 없이 제목·상태·값·버튼만(S-13). 결과·오류는 토스트
 */

type Query<T> = { status: 'loading' | 'ready' | 'error'; data: T | null };

export function SettingsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <AppShell
      title="설정"
      account={<SidebarAccount />}
      actions={
        <>
          <IconButton icon={RefreshCw} label="새로고침" variant="surface" onClick={() => setRefreshKey((value) => value + 1)} />
          <span className="tablet-lg:hidden">
            <AccountButton />
          </span>
        </>
      }
    >
      <SettingsBody refreshKey={refreshKey} />
    </AppShell>
  );
}

function SettingsBody({ refreshKey }: { refreshKey: number }) {
  const toast = useToast();
  const [config, setConfig] = useState<Query<AppConfig>>({ status: 'loading', data: null });
  const [health, setHealth] = useState<Query<IntegrationHealth>>({ status: 'loading', data: null });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let live = true;
    // 다시 불러오는 동안에는 이전 값을 그대로 보인다
    void getAppConfig()
      .then((data) => live && setConfig({ status: 'ready', data }))
      .catch(() => live && setConfig((current) => ({ status: 'error', data: current.data })));
    void getIntegrationHealth()
      .then((data) => live && setHealth({ status: 'ready', data }))
      .catch(() => live && setHealth((current) => ({ status: 'error', data: current.data })));
    return () => {
      live = false;
    };
  }, [attempt, refreshKey]);

  // 하나만 실패하면 확인 가능한 정보는 보이고 토스트로 알린다
  const partialFailure = (config.status === 'error') !== (health.status === 'error');
  useEffect(() => {
    if (partialFailure) toast({ message: '연결 상태 일부를 불러오지 못했습니다', tone: 'danger', action: { label: '다시 시도', onClick: reload } });
  }, [partialFailure, reload, toast]);

  if (config.status === 'error' && health.status === 'error' && !config.data && !health.data) {
    return (
      <Card className="flex flex-col items-start gap-4 tablet:flex-row tablet:items-center">
        <p className="flex-1 text-body text-text">설정을 불러오지 못했습니다</p>
        <Button variant="secondary" shape="pill" icon={RefreshCw} onClick={reload}>
          다시 시도
        </Button>
      </Card>
    );
  }

  const summaryConfig = config.data ?? (health.data ? healthAsConfig(health.data) : null);
  const summary = summaryConfig ? selectSettingsSummary(summaryConfig, health.data) : null;
  const provider = config.data?.document?.provider ?? health.data?.document?.provider ?? null;

  return (
    <div className="flex flex-col gap-4 tablet:gap-6">
      <Card as="section" aria-labelledby="settings-document" className="flex flex-col gap-5">
        <CardHeading id="settings-document" title="문서 연결" state={summary?.document.state} />
        {summary && (
          <div className="flex items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-bg shadow-card">
              {provider === 'NOTION' || provider === 'CONFLUENCE' ? (
                <img src={provider === 'NOTION' ? '/assets/notion.ico' : '/assets/confluence.svg'} alt="" className="size-7" />
              ) : (
                <Icon icon={FolderCog} size="lg" className="text-text-muted" />
              )}
            </span>
            <span className="text-title text-text">{summary.document.provider ?? '연결 안 됨'}</span>
          </div>
        )}
        <ButtonLink to="/settings/document" variant="secondary" shape="pill" className="self-start">
          문서 연결 관리
        </ButtonLink>
      </Card>
      <EmailCard state={summary?.email.state} refreshKey={refreshKey} onChanged={reload} />
    </div>
  );
}

function healthAsConfig(health: IntegrationHealth): Pick<AppConfig, 'document' | 'email'> {
  return {
    document: health.document ? { provider: health.document.provider, configured: health.document.configured, connectionVersion: 0, rootUrl: null } : undefined,
    email: health.email ? { enabled: health.email.configured, configured: health.email.configured } : undefined,
  };
}
