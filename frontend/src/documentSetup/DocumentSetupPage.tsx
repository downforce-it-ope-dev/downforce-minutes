import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, CircleCheck, Eye, EyeOff, Info, LoaderCircle, RefreshCw, Repeat, TriangleAlert } from 'lucide-react';
import {
  AppShell,
  Button,
  ButtonLink,
  Card,
  cn,
  Dialog,
  Icon,
  IconButton,
  Pill,
  ProgressBar,
  StepIndicator,
  TextField,
  ToastProvider,
  useToast,
} from '../ui';
import type { SwitchMode } from '../documentSetupApi';
import { STRUCTURE_STEPS, useDocumentSetup, type DocumentProvider, type SetupOperation } from './useDocumentSetup';

/*
 * 문서 연결 (SET-02 관리 · SET-03 서비스 선택 · SET-04 연결 정보 · SET-05 진행·결과 · SET-06 전환, GitHub #20~#22).
 * 동작은 useDocumentSetup(기존 마법사 로직)이 맡고, 이 파일은 화면만 그린다.
 * - SET-02는 메뉴가 보이는 일반 화면, SET-03~06은 메뉴를 숨기는 집중 모드(결정 2026-11-09)
 * - 설명 문구 없이 제목·입력·버튼·상태만 두고, 오류·안내는 토스트로 보낸다(S-13)
 */

const FIRST_RUN_STEPS = ['서비스 선택', '연결 정보', '문서 생성'] as const;
const CHANGE_STEPS = ['서비스 선택', '연결 정보', '자료 이전', '전환'] as const;

function providerLabel(provider: DocumentProvider | null | undefined) {
  return provider === 'NOTION' ? 'Notion' : provider === 'CONFLUENCE' ? 'Confluence' : '문서 서비스';
}

function ProviderIcon({ provider, size = 'md' }: { provider: DocumentProvider; size?: 'md' | 'lg' }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-md bg-bg shadow-card', size === 'lg' ? 'size-12' : 'size-10')}>
      <img src={provider === 'NOTION' ? '/assets/notion.ico' : '/assets/confluence.svg'} alt="" className={size === 'lg' ? 'size-7' : 'size-6'} />
    </span>
  );
}

function operationTitle(status: string) {
  switch (status) {
    case 'SUCCEEDED': return '문서 구조 준비 완료';
    case 'FAILED': return '문서 구조 준비 실패';
    case 'INTERRUPTED': return '문서 구조 준비 중단';
    case 'CANCELLED': return '문서 구조 준비 취소';
    case 'RECONCILIATION_REQUIRED': return '문서 서비스 상태 확인 필요';
    default: return '문서 구조 준비 상태';
  }
}

function operationStageLabel(stage: string | undefined) {
  switch (stage) {
    case 'PREFLIGHT': return '연결 확인';
    case 'STRUCTURE': return '문서 생성';
    case 'VERIFY': return '생성 문서 확인';
    case 'ACTIVATE': return '연결 완료';
    default: return '작업 상태';
  }
}

function operationStatusLabel(status: string | undefined) {
  switch (status) {
    case 'PENDING': return '대기 중';
    case 'RUNNING': return '진행 중';
    case 'SUCCEEDED': return '완료';
    case 'FAILED': return '실패';
    case 'INTERRUPTED': return '중단됨';
    case 'CANCELLED': return '종료됨';
    case 'RECONCILIATION_REQUIRED': return '확인 필요';
    default: return '상태 확인 중';
  }
}

function structureStepLabel(step: string | null | undefined) {
  switch (step) {
    case 'ROOT': return 'Meeting Automation';
    case 'MEETINGS': return 'Meetings';
    case 'PARTICIPANTS': return 'Participants';
    case 'MEETING_DATA': return 'Meeting Data';
    case 'TEMPLATES': return 'Templates';
    default: return '문서 구조';
  }
}

function progressMessage(operation: SetupOperation | null, provider: DocumentProvider | null) {
  const service = providerLabel(provider);
  if (!operation) return `${service} 연결 작업 상태를 확인하고 있습니다.`;
  if (operation.status === 'PENDING') return `${service} 연결 작업을 시작하고 있습니다.`;
  if (operation.stage === 'PREFLIGHT') return `${service} 연결 상태를 다시 확인하고 있습니다.`;
  if (operation.stage === 'STRUCTURE') return `${service}에 ${structureStepLabel(operation.currentStep)} 페이지를 생성하고 있습니다.`;
  if (operation.stage === 'VERIFY') return `${service}에 생성된 페이지 구조를 확인하고 있습니다.`;
  if (operation.stage === 'ACTIVATE') return `${service} 연결을 완료하고 있습니다.`;
  return `${service} 연결 작업을 진행하고 있습니다.`;
}

export function DocumentSetupPage({ settings = false }: { settings?: boolean }) {
  return (
    <ToastProvider>
      <DocumentSetupScreens settings={settings} />
    </ToastProvider>
  );
}

function DocumentSetupScreens({ settings }: { settings: boolean }) {
  const toast = useToast();
  const navigate = useNavigate();
  // 알림 함수가 렌더링마다 바뀌면 훅의 연결 후 재조회 처리가 취소되므로 고정한다
  const notify = useCallback((message: string) => toast({ message, tone: 'success' }), [toast]);
  const formRef = useRef<HTMLFormElement | null>(null);
  const progressRefreshRef = useRef<HTMLButtonElement | null>(null);
  const setup = useDocumentSetup(settings, notify, { formRef, progressRefreshRef });
  const { snapshot, error, notice } = setup;

  // 오류·안내는 화면 대신 토스트로 알린다(S-13)
  useEffect(() => {
    if (error) toast({ message: error, tone: 'danger' });
  }, [error, toast]);
  useEffect(() => {
    if (notice) toast({ message: notice });
  }, [notice, toast]);

  if (!snapshot) {
    return (
      <AppShell title="문서 서비스 연결" focus>
        <Column>
          {error ? (
            <StatusCard tone="danger" title="문서 연결 상태를 확인할 수 없습니다">
              <Button size="lg" shape="pill" icon={RefreshCw} fullWidth onClick={() => void setup.safeRefresh()}>
                다시 불러오기
              </Button>
            </StatusCard>
          ) : (
            <Loading label="문서 설정을 불러오는 중" />
          )}
        </Column>
      </AppShell>
    );
  }

  if (snapshot.status === 'STORAGE_UNAVAILABLE') {
    return (
      <AppShell title="문서 서비스 연결" focus>
        <Column>
          <StatusCard tone="danger" title="저장소 설정을 확인할 수 없습니다">
            <Button size="lg" shape="pill" icon={RefreshCw} fullWidth onClick={() => void setup.safeRefresh()}>
              다시 확인
            </Button>
          </StatusCard>
        </Column>
      </AppShell>
    );
  }

  // SET-02 문서 연결 관리 (메뉴 보임)
  if (snapshot.status === 'READY' && settings && !setup.changing) {
    const active = snapshot.active;
    return (
      <AppShell title="문서 연결" back={{ to: '/settings', label: '설정으로 돌아가기' }}>
        <div className="mx-auto flex w-full max-w-content flex-col gap-4">
          {active && (
            <Card as="section" aria-label="현재 문서 연결" className="flex flex-col gap-6 tablet:flex-row tablet:items-center">
              <div className="flex flex-1 flex-wrap items-center gap-4">
                <ProviderIcon provider={active.provider} size="lg" />
                <h2 className="text-title text-text">{providerLabel(active.provider)}</h2>
                <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-success-soft px-3 text-label text-success-text">
                  <Icon icon={CircleCheck} size="sm" />
                  연결됨
                </span>
              </div>
              <Button size="lg" shape="pill" variant="secondary" icon={Repeat} onClick={setup.beginChange}>
                문서 서비스 변경
              </Button>
            </Card>
          )}
          {setup.consumerRefreshFailed && (
            <Button size="lg" shape="pill" variant="secondary" icon={RefreshCw} onClick={setup.retryConsumerRefresh} className="self-start">
              연결 데이터 다시 확인
            </Button>
          )}
          {setup.returnTo && (
            <ButtonLink to={setup.returnTo} size="lg" shape="pill" variant="secondary" icon={ArrowLeft} className="self-start">
              이전 화면으로
            </ButtonLink>
          )}
        </div>
      </AppShell>
    );
  }

  return <Wizard setup={setup} navigate={navigate} formRef={formRef} progressRefreshRef={progressRefreshRef} />;
}

type Setup = ReturnType<typeof useDocumentSetup>;

function Wizard({
  setup,
  navigate,
  formRef,
  progressRefreshRef,
}: {
  setup: Setup;
  navigate: ReturnType<typeof useNavigate>;
  formRef: RefObject<HTMLFormElement | null>;
  progressRefreshRef: RefObject<HTMLButtonElement | null>;
}) {
  const snapshot = setup.snapshot!;
  const { provider, operation } = setup;
  const changing = setup.changing || Boolean(snapshot.active);
  const steps = changing ? CHANGE_STEPS : FIRST_RUN_STEPS;
  const showChooser = !setup.hasBlockingOperation && !setup.preparedTarget && !setup.initializationUncertain && !setup.setupProgressStarted;
  // 끝난 전환(완료·취소)은 진행 중이 아니다. 서비스를 고르는 중이면 단계는 선택·입력이다
  const switchRunning =
    (operation?.type === 'SWITCH' || snapshot.operation?.type === 'SWITCH') && !['SUCCEEDED', 'CANCELLED'].includes(setup.operationStatus);
  const stepIndex = showChooser
    ? provider ? 1 : 0
    : switchRunning ? 3 : setup.preparedTarget || setup.initializationInProgress || snapshot.operation ? 2 : provider ? 1 : 0;
  const title = setup.preparedTarget || switchRunning ? '문서 서비스 변경' : changing && !provider ? '문서 서비스 선택' : '문서 서비스 연결';
  // 끝난 작업(완료)은 오른쪽에 따로 카드로 두지 않고 왼쪽 현재 연결에 함께 보인다
  const lastDone =
    setup.operationStatus === 'SUCCEEDED' && snapshot.operation
      ? snapshot.operation.type === 'SWITCH' ? '문서 서비스 변경 완료' : '문서 구조 준비 완료'
      : null;
  const goHome = () =>
    navigate('/', { state: { documentSetupCompleted: { provider: snapshot.active!.provider, rootUrl: snapshot.active!.rootUrl } } });

  return (
    <AppShell title={title} focus>
      {/* 휴대폰·태블릿 세로: 한 열 / 태블릿 가로: 왼쪽 진행 상황(1) + 오른쪽 본문(2) */}
      <div className="mx-auto flex w-full max-w-content flex-col gap-4 tablet-lg:grid tablet-lg:grid-cols-3 tablet-lg:items-start tablet-lg:gap-8">
        <aside aria-label="진행 상황" className="flex flex-col gap-4 tablet-lg:sticky tablet-lg:top-0 tablet-lg:rounded-xl tablet-lg:bg-bg tablet-lg:p-6 tablet-lg:shadow-card">
          <StepIndicator steps={steps} current={Math.min(stepIndex, steps.length - 1)} />

          {/* 변경·전환 중에도 어느 연결이 살아 있는지 보인다(원본 연결은 전환 완료 전까지 유지) */}
          {snapshot.active && !setup.initializationSucceeded && (
            <div aria-label="현재 활성 문서 연결" className="flex items-center gap-3 rounded-lg bg-primary-soft p-4">
              <ProviderIcon provider={snapshot.active.provider} size="lg" />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-label text-primary-soft-text">
                  현재 연결: {snapshot.active.provider === 'CONFLUENCE' ? 'Confluence Cloud' : 'Notion'}
                </span>
                <span className="text-caption text-primary-soft-text tabular-nums">연결 버전: {snapshot.active.connectionVersion}</span>
                {lastDone && (
                  <span className="inline-flex items-center gap-1 text-caption text-success-text">
                    <Icon icon={CircleCheck} size="sm" />
                    {lastDone}
                  </span>
                )}
              </div>
            </div>
          )}

          {snapshot.status === 'READY' && (
            <span className="hidden tablet-lg:block">
              <BackToSettings setup={setup} />
            </span>
          )}
        </aside>

        <div className="flex flex-col gap-4 tablet-lg:col-span-2">
        {provider && showChooser && (
          <Button
            aria-label="서비스 선택으로 돌아가기"
            size="lg"
            shape="pill"
            variant="secondary"
            icon={ArrowLeft}
            className="self-start"
            onClick={() => setup.chooseProvider(null)}
          >
            서비스 선택
          </Button>
        )}

        {setup.consumerRefreshFailed && (
          <Button size="lg" shape="pill" variant="secondary" icon={RefreshCw} className="self-start" onClick={setup.retryConsumerRefresh}>
            연결 데이터 다시 확인
          </Button>
        )}

        {setup.initializationInProgress && <ProgressCard setup={setup} onDone={goHome} />}

        {snapshot.operation &&
          !setup.initializationInProgress &&
          !(operation?.type === 'INITIALIZE' && operation.status === 'CANCELLED') &&
          // 전환 준비(자료 이전 선택) 단계에서는 끝난 준비 작업 카드를 숨긴다
          !(setup.preparedTarget && snapshot.operation.type === 'INITIALIZE' && setup.operationStatus === 'SUCCEEDED') &&
          // 서비스를 고르는 중이면 끝난 작업은 왼쪽 현재 연결에만 보인다
          !(showChooser && setup.operationStatus === 'SUCCEEDED') && (
          <OperationCard setup={setup} onDone={goHome} refreshRef={progressRefreshRef} />
        )}

        {setup.preparedTarget && !setup.initializationUncertain && <SwitchCard setup={setup} />}

        {showChooser && (provider ? <ConnectionForm setup={setup} provider={provider} formRef={formRef} /> : <ServiceChooser setup={setup} />)}

        {setup.initializationUncertain && (
          <StatusCard tone="warning" title="요청 상태 확인">
            <Button size="lg" shape="pill" icon={RefreshCw} fullWidth loading={setup.busy} onClick={() => void setup.recheckUncertainInitialization()}>
              {setup.busy ? '확인 중…' : '다시 확인'}
            </Button>
          </StatusCard>
        )}

        {snapshot.status === 'READY' && (
          <span className="tablet-lg:hidden">
            <BackToSettings setup={setup} />
          </span>
        )}
        </div>
      </div>
    </AppShell>
  );
}

/** 문서 서비스 설정(SET-02)으로 돌아가기. 변경을 그만두고 입력한 자격 증명을 지운다 */
function BackToSettings({ setup }: { setup: Setup }) {
  return (
    <ButtonLink
      to="/settings/document"
      size="lg"
      shape="pill"
      variant="secondary"
      icon={ArrowLeft}
      fullWidth
      onClick={() => {
        setup.setChanging(false);
        setup.clearCredentials();
      }}
    >
      문서 서비스 설정으로
    </ButtonLink>
  );
}

/** SET-03 서비스 선택 */
function ServiceChooser({ setup }: { setup: Setup }) {
  const current = setup.snapshot?.active?.provider;
  return (
    <ul aria-label="연결할 문서 서비스" className="flex flex-col gap-3">
      {(['NOTION', 'CONFLUENCE'] as const).map((item) => (
        <li key={item}>
          <button
            type="button"
            aria-label={`${item === 'CONFLUENCE' ? 'Confluence Cloud' : 'Notion'} 선택`}
            onClick={() => setup.chooseProvider(item)}
            className="flex min-h-20 w-full cursor-pointer items-center gap-4 rounded-xl border border-border bg-bg px-4 text-left shadow-card active:bg-bg-subtle tablet:min-h-24 tablet:gap-6 tablet:px-6"
          >
            <ProviderIcon provider={item} size="lg" />
            {/* 카드 폭이 좁아도 겹치지 않게 배지는 이름 아래에 둔다 */}
            <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <span className="text-title text-text">{providerLabel(item)}</span>
              {current === item && <Pill tone="accent">현재 사용 중</Pill>}
            </span>
            <Icon icon={ArrowRight} size="lg" className="shrink-0 text-text-muted" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** SET-04 연결 정보 입력 */
function ConnectionForm({ setup, provider, formRef }: { setup: Setup; provider: DocumentProvider; formRef: RefObject<HTMLFormElement | null> }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const { credentials, location, fieldErrors, busy, tested } = setup;
  const common = { autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false, disabled: busy } as const;
  return (
    <section aria-label={`${providerLabel(provider)} 연결 정보`} className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <ProviderIcon provider={provider} />
        <h2 className="flex-1 text-title text-text">{providerLabel(provider)}에 연결</h2>
        <IconButton icon={Info} label="연결 방법 안내" variant="surface" aria-haspopup="dialog" onClick={() => setGuideOpen(true)} />
      </div>
      <Card>
        <form ref={formRef} className="grid gap-4 tablet:grid-cols-2" onSubmit={(event) => void setup.handleTest(event)} noValidate>
          {provider === 'NOTION' ? (
            <>
              <SecretField
                id="notion-token"
                label="Notion 내부 연결 토큰"
                value={credentials.token}
                invalid={Boolean(fieldErrors['notion-token'])}
                disabled={busy}
                onChange={(value) => setup.updateCredential('token', value)}
              />
              <TextField
                id="notion-parent"
                label="부모 페이지 URL 또는 ID"
                inputMode="url"
                placeholder="https://www.notion.so/…"
                value={location.parentPageId}
                invalid={Boolean(fieldErrors['notion-parent'])}
                onChange={(event) => setup.updateLocation('parentPageId', event.target.value)}
                {...common}
              />
            </>
          ) : (
            <>
              <TextField
                id="confluence-url"
                label="Confluence 사이트 URL"
                type="url"
                placeholder="https://example.atlassian.net"
                value={location.baseUrl}
                invalid={Boolean(fieldErrors['confluence-url'])}
                onChange={(event) => setup.updateLocation('baseUrl', event.target.value)}
                {...common}
              />
              <TextField
                id="confluence-email"
                label="Atlassian 계정 이메일"
                type="email"
                autoComplete="off"
                value={credentials.accountEmail}
                invalid={Boolean(fieldErrors['confluence-email'])}
                onChange={(event) => setup.updateCredential('accountEmail', event.target.value)}
                {...common}
              />
              <SecretField
                id="confluence-token"
                label="Atlassian API token"
                value={credentials.apiToken}
                invalid={Boolean(fieldErrors['confluence-token'])}
                disabled={busy}
                onChange={(value) => setup.updateCredential('apiToken', value)}
              />
              <TextField
                id="confluence-space"
                label="Space ID"
                value={location.spaceId}
                invalid={Boolean(fieldErrors['confluence-space'])}
                onChange={(event) => setup.updateLocation('spaceId', event.target.value)}
                {...common}
              />
            </>
          )}
          <Button
            type="submit"
            size="lg"
            loading={busy}
            disabled={Boolean(tested)}
            shape="pill"
            className="mt-2 w-full tablet:col-span-2 tablet:w-auto tablet:min-w-60 tablet:justify-self-end"
          >
            {busy ? '연결 확인 중…' : tested ? '연결 확인 완료' : '연결 확인'}
          </Button>
        </form>
      </Card>
      <Dialog open={guideOpen} onOpenChange={setGuideOpen} title={`${providerLabel(provider)} 연결 방법`} closeLabel="안내 닫기">
        <ConnectionGuide provider={provider} />
      </Dialog>
    </section>
  );
}

/** 비밀 입력 + 보기 토글 (SET-04 3.1) */
function SecretField({
  id,
  label,
  value,
  invalid,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  invalid: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [shown, setShown] = useState(false);
  return (
    <TextField
      id={id}
      label={label}
      type={shown ? 'text' : 'password'}
      autoComplete="new-password"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      value={value}
      invalid={invalid}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      trailing={
        <IconButton
          icon={shown ? EyeOff : Eye}
          label={shown ? `${label} 가리기` : `${label} 보기`}
          aria-pressed={shown}
          onClick={() => setShown((value) => !value)}
        />
      }
    />
  );
}

/** SET-04-P01 연결 방법 안내. 사용자가 열 때만 보이는 도움말이다 */
function ConnectionGuide({ provider }: { provider: DocumentProvider }) {
  const link = 'inline-flex min-h-12 items-center gap-1 text-label text-link underline';
  const steps: ReactNode[] =
    provider === 'NOTION'
      ? [
          <>
            <a className={link} href="https://www.notion.com/help/create-integrations-with-the-notion-api" target="_blank" rel="noreferrer">
              Notion 내부 연결 안내<span className="sr-only">(새 탭)</span>
            </a>
            에서 토큰을 준비합니다.
          </>,
          '부모 페이지에 연결을 추가하고 읽기·콘텐츠 추가·수정 권한을 허용합니다.',
          '부모 페이지 URL 또는 ID를 확인합니다.',
        ]
      : [
          '사이트 URL은 https://회사이름.atlassian.net 형식입니다.',
          <>
            <a className={link} href="https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account" target="_blank" rel="noreferrer">
              Atlassian API token 안내<span className="sr-only">(새 탭)</span>
            </a>
            와 운영 계정 이메일을 준비합니다.
          </>,
          'Space ID와 페이지 생성 권한을 확인합니다. 페이지는 Space 최상위에 만들어집니다.',
        ];
  return (
    <ol className="flex flex-col gap-4">
      {[...steps, '연결 정보는 이 브라우저에 저장됩니다.'].map((step, index) => (
        <li key={index} className="flex gap-3 text-body text-text">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-caption text-primary-soft-text tabular-nums">
            {index + 1}
          </span>
          <span className="break-keep">{step}</span>
        </li>
      ))}
    </ol>
  );
}

/** SET-05 문서 생성 진행 */
function ProgressCard({ setup, onDone }: { setup: Setup; onDone: () => void }) {
  const { operation, setupProvider, initializationSucceeded: done, completedStructureSteps, currentStructureStep } = setup;
  const steps = ['연결 확인', '문서 생성', '생성 완료'];
  const currentIndex = done ? 3 : 1;
  return (
    <Card as="section" aria-labelledby="setup-progress-title" className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <ProviderIcon provider={setupProvider ?? 'NOTION'} />
        <h2 id="setup-progress-title" className="flex-1 text-title text-text break-keep">
          {done ? '문서 연결 완료' : setupProvider ? `${providerLabel(setupProvider)} 문서를 생성하고 있습니다` : '문서를 생성하고 있습니다'}
        </h2>
        {!done && <Icon icon={LoaderCircle} size="lg" className="animate-spin text-primary motion-reduce:animate-none" />}
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((step, index) => {
          const complete = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li key={step} className="flex flex-col gap-2" aria-current={active ? 'step' : undefined}>
              <div className="flex min-h-12 items-center gap-3">
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full text-caption tabular-nums',
                    complete ? 'bg-primary-soft text-primary-soft-text' : active ? 'bg-primary text-white' : 'border border-border-input text-text-muted',
                  )}
                >
                  {complete ? <Icon icon={CircleCheck} size="sm" /> : index + 1}
                </span>
                <span className={cn('text-body', active ? 'text-text' : 'text-text-muted')}>
                  {step}
                  {complete && <span className="sr-only"> 완료</span>}
                </span>
              </div>
              {index === 1 && operation?.stage === 'STRUCTURE' && (
                <ul aria-label="문서 페이지 생성 진행 상황" className="ml-9 flex flex-col">
                  {STRUCTURE_STEPS.map((page) => {
                    const pageDone = completedStructureSteps.includes(page);
                    const pageActive = currentStructureStep === page && !pageDone;
                    return (
                      <li key={page} className="flex min-h-14 items-center gap-3 border-b border-border last:border-b-0 tablet:min-h-15">
                        <span className="flex-1 text-body text-text">{structureStepLabel(page)}</span>
                        <span className={cn('inline-flex items-center gap-1.5 text-caption', pageDone ? 'text-success-text' : 'text-text-muted')}>
                          {pageDone ? (
                            <Icon icon={CircleCheck} size="sm" />
                          ) : pageActive ? (
                            <Icon icon={LoaderCircle} size="sm" className="animate-spin text-primary motion-reduce:animate-none" />
                          ) : null}
                          {pageDone ? '생성 완료' : pageActive ? '생성 중' : '대기 중'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      {done ? (
        <Button size="lg" shape="pill" fullWidth onClick={onDone}>
          확인
        </Button>
      ) : (
        <>
          <p role="status" className="text-body text-text-muted break-keep">
            {progressMessage(operation, setupProvider)}
          </p>
          {setup.operationReadFailed && <ReadRecovery setup={setup} />}
        </>
      )}
    </Card>
  );
}

/** 진행 상세 조회 실패 시 복구 (SET-05-F09). 서버 작업이 계속될 수 있어 새 작업은 보내지 않는다 */
function ReadRecovery({ setup }: { setup: Setup }) {
  return (
    <div role="group" aria-label="진행 상태 복구" className="flex flex-col gap-2 tablet:flex-row">
      <Button size="lg" shape="pill" variant="secondary" icon={RefreshCw} loading={setup.busy} onClick={() => void setup.retryOperationStatus()} className="tablet:flex-1">
        {setup.busy ? '상태 확인 중…' : '진행 상태 다시 불러오기'}
      </Button>
      {setup.snapshot?.operation?.type === 'INITIALIZE' && (
        <Button
          size="lg"
          shape="pill"
          variant="secondary"
          disabled={setup.busy || setup.snapshot.version == null}
          onClick={() => void setup.closeUnresolvedInitialization()}
          className="tablet:flex-1"
        >
          연결 작업 종료 후 다시 연결
        </Button>
      )}
    </div>
  );
}

/** SET-05 작업 상태 (실패·중단·확인 필요·전환 진행) */
function OperationCard({ setup, onDone, refreshRef }: { setup: Setup; onDone: () => void; refreshRef: RefObject<HTMLButtonElement | null> }) {
  const { operation, operationStatus, snapshot, busy } = setup;
  const isSwitch = operation?.type === 'SWITCH';
  const failed = ['FAILED'].includes(operationStatus);
  const warning = ['INTERRUPTED', 'RECONCILIATION_REQUIRED'].includes(operationStatus);
  const title = isSwitch ? `문서 서비스 변경 · ${operationStatusLabel(operationStatus)}` : operationTitle(operationStatus);
  return (
    <Card as="section" aria-labelledby="operation-title" className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        {(failed || warning) && (
          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', failed ? 'bg-danger-soft text-danger-text' : 'bg-warning-soft text-warning-text')}>
            <Icon icon={TriangleAlert} size="lg" />
          </span>
        )}
        <div className="flex flex-1 flex-col gap-1">
          <h2 id="operation-title" className="text-title text-text break-keep">
            {title}
          </h2>
          <p role="status" className="text-body text-text-muted">
            {operationStageLabel(operation?.stage)} · {operationStatusLabel(operation?.status)}
          </p>
        </div>
      </div>
      {isSwitch && operation && (
        <div className="flex flex-col gap-2">
          <p className="text-body text-text tabular-nums">
            참석자 {operation.counts.participantsCopied}/{operation.counts.participantsTotal}명 · 회의 {operation.counts.meetingsCopied}/
            {operation.counts.meetingsTotal}건
          </p>
          <ProgressBar
            label="자료 복사"
            value={operation.counts.participantsCopied + operation.counts.meetingsCopied}
            max={Math.max(1, operation.counts.participantsTotal + operation.counts.meetingsTotal)}
          />
        </div>
      )}
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-muted">
        <div className="flex gap-1">
          <dt>작업 ID</dt>
          <dd className="break-all tabular-nums">{snapshot?.operation?.operationId}</dd>
        </div>
        {operation?.errorCode && (
          <div className="flex gap-1">
            <dt>오류 코드</dt>
            <dd className="tabular-nums">{operation.errorCode}</dd>
          </div>
        )}
      </dl>
      {setup.operationReadFailed && <ReadRecovery setup={setup} />}
      <div className="flex flex-col gap-2 tablet:flex-row-reverse tablet:flex-wrap">
        {isSwitch && operation?.status === 'SUCCEEDED' && snapshot?.status === 'READY' && snapshot.active && (
          <Button size="lg" shape="pill" onClick={onDone}>
            확인
          </Button>
        )}
        {operation?.allowedActions.includes('RETRY') && operation.status !== 'RECONCILIATION_REQUIRED' && (
          <Button size="lg" shape="pill" icon={RefreshCw} disabled={busy} onClick={() => void setup.runOperationAction('RETRY')}>
            작업 재개
          </Button>
        )}
        {operation?.allowedActions.includes('CANCEL') && (
          <Button size="lg" shape="pill" variant="secondary" disabled={busy} onClick={() => void setup.runOperationAction('CANCEL')}>
            {isSwitch ? '작업 취소' : '중단된 연결 작업 종료'}
          </Button>
        )}
        <Button ref={refreshRef} size="lg" shape="pill" variant="secondary" icon={RefreshCw} disabled={busy} onClick={() => void setup.safeRefresh()}>
          진행 상태 새로고침
        </Button>
      </div>
    </Card>
  );
}

/** SET-06 자료 이전 방식 선택 */
function SwitchCard({ setup }: { setup: Setup }) {
  const { snapshot, mode, confirmEmpty, busy } = setup;
  const from = snapshot?.active?.provider;
  const to = snapshot?.draft?.provider;
  const options: { value: SwitchMode; label: string; detail: string }[] = [
    { value: 'COPY_ALL', label: '전체 복사', detail: '참석자·회의록 복사 (첨부·댓글·버전 이력 제외, 알림 재발송 없음)' },
    { value: 'START_EMPTY', label: '빈 구조로 새 시작', detail: '기존 자료는 원본 서비스에만 남습니다' },
  ];
  return (
    <Card as="section" aria-labelledby="switch-title" className="flex flex-col gap-6">
      <h2 id="switch-title" className="text-title text-text">
        자료 이전 방식
      </h2>
      <div className="flex flex-col items-stretch gap-2 tablet:flex-row tablet:items-center">
        {from && (
          <div className="flex flex-1 items-center gap-3 rounded-lg border border-border p-4">
            <ProviderIcon provider={from} />
            <span className="flex flex-col">
              <span className="text-label text-text">{providerLabel(from)}</span>
              <span className="text-caption text-text-muted">현재</span>
            </span>
          </div>
        )}
        <Icon icon={ArrowRight} size="lg" className="rotate-90 self-center text-text-muted tablet:rotate-0" />
        {to && (
          <div className="flex flex-1 items-center gap-3 rounded-lg bg-selected p-4">
            <ProviderIcon provider={to} />
            <span className="flex flex-col">
              <span className="text-label text-selected-text">{providerLabel(to)}</span>
              <span className="text-caption text-selected-text">새 연결</span>
            </span>
          </div>
        )}
      </div>
      <fieldset className="grid gap-2 tablet-lg:grid-cols-2">
        <legend className="sr-only">이전 방식 선택</legend>
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border p-4',
              mode === option.value ? 'border-primary bg-selected' : 'border-border bg-bg',
            )}
          >
            <input
              type="radio"
              name="switch-mode"
              aria-labelledby={`switch-${option.value}-label`}
              aria-describedby={`switch-${option.value}-detail`}
              className="mt-0.5 size-5 shrink-0 accent-primary"
              checked={mode === option.value}
              onChange={() => {
                setup.setMode(option.value);
                setup.setConfirmEmpty(false);
              }}
            />
            <span className="flex flex-col gap-1">
              <span id={`switch-${option.value}-label`} className="text-label text-text">
                {option.label}
              </span>
              <span id={`switch-${option.value}-detail`} className="text-caption text-text-muted break-keep">
                {option.detail}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {mode === 'START_EMPTY' && (
        <label className="flex min-h-12 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="size-5 shrink-0 accent-primary"
            checked={confirmEmpty}
            onChange={(event) => setup.setConfirmEmpty(event.target.checked)}
          />
          <span className="text-body text-text break-keep">기존 자료가 새 서비스 목록에 나타나지 않음을 확인했습니다.</span>
        </label>
      )}
      <Button
        size="lg"
        shape="pill"
        fullWidth
        loading={busy}
        disabled={mode === 'START_EMPTY' && !confirmEmpty}
        onClick={() => void setup.startSwitch()}
      >
        {busy ? '전환 시작 중…' : '문서 서비스 전환'}
      </Button>
    </Card>
  );
}

function Column({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-form flex-col gap-4">{children}</div>;
}

function Loading({ label }: { label: string }) {
  return (
    <div role="status" className="flex justify-center py-16">
      <Icon icon={LoaderCircle} size="lg" className="animate-spin text-primary motion-reduce:animate-none" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

function StatusCard({ tone, title, children }: { tone: 'danger' | 'warning'; title: string; children: ReactNode }) {
  return (
    <Card role="alert" className="flex flex-col items-center gap-6 text-center">
      <span
        className={cn(
          'flex size-14 items-center justify-center rounded-full',
          tone === 'danger' ? 'bg-danger-soft text-danger-text' : 'bg-warning-soft text-warning-text',
        )}
      >
        <Icon icon={TriangleAlert} size="xl" />
      </span>
      <h2 className="text-title text-text break-keep">{title}</h2>
      {children}
    </Card>
  );
}
