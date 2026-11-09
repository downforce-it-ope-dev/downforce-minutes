import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ArrowRight,
  Bell,
  Mail,
  Mic,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { recoverBackendAvailability } from '../apiRecovery';
import {
  AppCanvas,
  AppShell,
  DocumentStatusChip,
  LeaveConfirmDialog,
  Banner,
  Button,
  Card,
  cn,
  Dialog,
  IconButton,
  Logo,
  NotFoundIllustration,
  ServerRecoveryIllustration,
  MailCodeIllustration,
  OtpInput,
  Pill,
  ProgressBar,
  RecordToMinutesIllustration,
  TextField,
  ToastProvider,
  useToast,
  Waveform,
} from '../ui';

/**
 * 부품 확인 화면 (/__ui, GitHub #9). 개발 서버와 Vercel Preview에서만 열린다(운영 빌드 제외).
 * 공통 부품을 상태별로 모아 시안과 비교하고, 접근성 검사를 돌리는 데 쓴다. API를 부르지 않는다.
 */
export default function UiPreview() {
  const [params] = useSearchParams();
  const view = params.get('view');
  return (
    <ToastProvider>
      {view === 'shell' || view === 'focus' ? (
        <ShellSample focus={view === 'focus'} />
      ) : (
        <ComponentsView />
      )}
    </ToastProvider>
  );
}

const VIEWS = [
  { key: 'components', label: '부품 전체' },
  { key: 'shell', label: '앱 틀 (CMN-01)' },
  { key: 'focus', label: '집중 모드' },
] as const;

function ViewNav({ current }: { current: (typeof VIEWS)[number]['key'] }) {
  return (
    <nav aria-label="부품 확인 화면 보기" className="flex flex-wrap gap-2">
      {VIEWS.map(({ key, label }) => (
        <Link
          key={key}
          to={key === 'components' ? '/__ui' : `/__ui?view=${key}`}
          aria-current={current === key ? 'page' : undefined}
          className={cn(
            'inline-flex h-12 items-center rounded-full border px-4 text-label',
            current === key ? 'border-selected bg-selected text-selected-text' : 'border-border bg-bg text-text',
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card as="section" aria-label={title} className="flex flex-col gap-4">
      <h2 className="text-title text-text">{title}</h2>
      {children}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption text-text-muted">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function ComponentsView() {
  return (
    <AppCanvas waves="app">
      <div className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 pt-safe pb-16 tablet:px-6 tablet-lg:px-8">
        <header className="flex flex-col gap-4 pt-6">
          <Logo size="md" withProduct className="items-start" />
          <h1 className="text-headline text-text">부품 확인 화면</h1>
          <ViewNav current="components" />
        </header>
        <ButtonsSection />
        <IconButtonsSection />
        <InputsSection />
        <OtpSection />
        <StatusSection />
        <SurfacesSection />
        <OverlaySection />
        <RecoverySection />
        <ArtSection />
      </div>
    </AppCanvas>
  );
}

function ButtonsSection() {
  const [count, setCount] = useState(0);
  return (
    <Section title="버튼">
      <Row label="변형 (md 48)">
        <Button onClick={() => setCount(count + 1)}>주 동작</Button>
        <Button variant="secondary">보조</Button>
        <Button variant="ghost">텍스트 버튼</Button>
        <Button variant="danger" icon={Trash2}>
          삭제
        </Button>
      </Row>
      <p className="text-caption text-text-muted tabular-nums" aria-live="polite">
        주 동작을 누른 횟수: {count}
      </p>
      <Row label="크기 (lg 56 · md 48 · sm 40, 누르는 영역 48)">
        <Button size="lg">큰 버튼</Button>
        <Button size="md">기본 버튼</Button>
        <Button size="sm" variant="secondary" shape="pill" icon={Pencil}>
          이메일 변경
        </Button>
      </Row>
      <Row label="상태">
        <Button disabled>비활성</Button>
        <Button loading>보내는 중…</Button>
        <Button variant="secondary" disabled icon={RefreshCw}>
          코드 다시 받기 (52초)
        </Button>
      </Row>
      <Row label="대표 동작 (hero, 휴대폰 56 · 태블릿 72)">
        <Button variant="hero" icon={Mic}>
          새 회의
        </Button>
      </Row>
    </Section>
  );
}

function IconButtonsSection() {
  return (
    <Section title="아이콘 버튼">
      <Row label="plain 48 · surface 48 · primary 64 · 비활성">
        <IconButton icon={X} label="닫기" />
        <IconButton icon={Bell} label="알림" variant="surface" />
        <IconButton icon={ArrowRight} label="인증 코드 받기" variant="primary" />
        <IconButton icon={ArrowRight} label="인증 코드 받기 (비활성)" variant="primary" disabled />
      </Row>
    </Section>
  );
}

function InputsSection() {
  return (
    <Section title="입력란">
      <div className="grid gap-6 tablet:grid-cols-2">
        <TextField label="회의 제목" placeholder="예: 주간 회의" />
        <TextField label="회사 이메일 (오류)" type="email" defaultValue="meet@gmail.com" invalid />
        <TextField label="회사 이메일 (알약형)" type="email" shape="pill" icon={Mail} placeholder="name@miinit.com" />
        <TextField label="비활성" disabled defaultValue="수정할 수 없음" />
      </div>
    </Section>
  );
}

function OtpSection() {
  const [code, setCode] = useState('');
  return (
    <Section title="인증 코드 칸">
      <Row label="기본">
        <OtpInput label="인증 코드 6자리" value={code} onChange={setCode} />
      </Row>
      <Row label="오류 상태">
        <OtpInput label="인증 코드 6자리 (오류 예시)" value="1234" onChange={() => {}} error />
      </Row>
    </Section>
  );
}

function StatusSection() {
  return (
    <Section title="상태 표시">
      <Row label="알약">
        <Pill>
          참석자 <Pill.Strong>4명</Pill.Strong>
        </Pill>
        <Pill tone="brand">녹음 중</Pill>
        <Pill tone="neutral">팀 없음</Pill>
      </Row>
      <Row label="진행 막대">
        <div className="flex w-full max-w-md flex-col gap-3">
          <ProgressBar label="남은 시간" value={45} max={60} valueText="45초 남음" />
          <ProgressBar label="처리 진행" value={30} />
        </div>
      </Row>
      <div className="flex flex-col gap-3">
        <Banner tone="info">로그인이 만료되었습니다. 다시 로그인해 주세요.</Banner>
        <Banner tone="warning" title="잠시 후 다시 시도해 주세요.">
          <span className="tabular-nums">42초 후 다시 요청할 수 있습니다.</span>
        </Banner>
        <Banner
          tone="danger"
          action={
            <Button size="sm" variant="secondary">
              다시 시도
            </Button>
          }
        >
          인증 코드를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.
        </Banner>
        <Banner tone="success">메일 연결을 확인했습니다.</Banner>
      </div>
    </Section>
  );
}

function SurfacesSection() {
  return (
    <Section title="면 (카드 · 패널)">
      <div className="grid gap-4 tablet:grid-cols-2">
        <Card className="flex flex-col gap-2 border border-border">
          <p className="text-label text-text">카드</p>
        </Card>
        <Card variant="panel" className="flex flex-col gap-2 border border-border">
          <p className="text-label text-text">패널</p>
        </Card>
      </div>
    </Section>
  );
}

function OverlaySection() {
  const [open, setOpen] = useState(false);
  const [busyOpen, setBusyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  function startBusy() {
    setBusy(true);
    window.setTimeout(() => setBusy(false), 3000);
  }

  return (
    <Section title="대화상자 · 토스트">
      <Row label="대화상자 (태블릿 가운데 · 휴대폰 하단 시트)">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          메일 설정 열기
        </Button>
        <Button variant="secondary" onClick={() => setBusyOpen(true)}>
          진행 중 닫기 막기 예시
        </Button>
      </Row>
      <Row label="토스트">
        <Button variant="secondary" onClick={() => toast({ message: '새 인증 코드를 보냈습니다.', tone: 'success' })}>
          성공
        </Button>
        <Button variant="secondary" onClick={() => toast({ message: '로그인 상태를 확인했습니다.' })}>
          안내
        </Button>
        <Button variant="secondary" onClick={() => toast({ message: '저장하지 못했습니다.', tone: 'danger' })}>
          오류
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast({ message: '화자 A를 홍길동으로 지정했습니다.', action: { label: '되돌리기', onClick: () => toast({ message: '되돌렸습니다.' }) } })
          }
        >
          되돌리기 포함
        </Button>
      </Row>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="메일 설정"
        description="인증 코드를 보낼 Gmail을 연결합니다. 4개 항목을 모두 입력해 주세요."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={() => setOpen(false)}>저장하고 연결 확인</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField label="Google 클라이언트 ID" autoComplete="off" />
          <TextField label="클라이언트 보안 키" type="password" autoComplete="off" />
          <TextField label="연결 토큰 (Refresh Token)" type="password" autoComplete="off" />
          <TextField label="발신 이메일 주소" type="email" />
        </div>
      </Dialog>

      <Dialog
        open={busyOpen}
        onOpenChange={setBusyOpen}
        title="CSV로 일괄 등록"
        description={busy ? '등록하는 동안에는 닫을 수 없습니다.' : '등록을 시작하면 끝날 때까지 닫을 수 없습니다.'}
        size="form"
        dismissible={!busy}
        footer={
          <Button loading={busy} onClick={startBusy}>
            {busy ? '등록 중…' : '등록 시작 (3초)'}
          </Button>
        }
      >
        <ProgressBar label="등록 진행" value={busy ? 50 : 0} valueText={busy ? '진행 중' : '대기'} />
      </Dialog>
    </Section>
  );
}

function ArtSection() {
  return (
    <Section title="그림">
      <Row label="로고 (sm · md · lg)">
        <Logo size="sm" />
        <Logo size="md" />
        <Logo size="lg" />
        <Logo size="md" withProduct />
      </Row>
      <Row label="파형">
        <span className="h-10 text-blue-500">
          <Waveform />
        </span>
        <span className="h-10 text-pink-500">
          <Waveform bars={6} />
        </span>
        <span className="h-10 text-lavender-500">
          <Waveform bars={8} />
        </span>
      </Row>
      <div className="grid gap-6 tablet:grid-cols-2">
        <div className="flex flex-col gap-2">
          <RecordToMinutesIllustration className="w-full max-w-sm" />
        </div>
        <div className="flex flex-col gap-2">
          <MailCodeIllustration className="w-full max-w-sm" />
        </div>
      </div>
    </Section>
  );
}

/** 앱 틀 샘플 (CMN-01, #17). 폭에 따라 탭 바 → 레일 → 사이드바로 바뀐다. 메뉴는 실제 경로로 이동한다 */
function ShellSample({ focus }: { focus: boolean }) {
  const [leaveOpen, setLeaveOpen] = useState(false);
  return (
    <AppShell
      title={focus ? '문서 연결' : '앱 틀'}
      back={focus ? { to: '/__ui?view=shell' } : undefined}
      focus={focus}
      actions={
        <>
          <DocumentStatusChip status="connected" compact onClick={() => undefined} />
          {/* 휴대폰은 새 회의를 홈 하단 고정 버튼으로 둔다 (CMN-01-F04) */}
          <span className="hidden tablet:flex">
            <Button icon={Mic}>새 회의</Button>
          </span>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <ViewNav current={focus ? 'focus' : 'shell'} />
        <Card className="flex flex-col gap-4">
          <h2 className="text-title text-text">문서 연결 상태 칩</h2>
          <div className="flex flex-wrap gap-3">
            <DocumentStatusChip status="connected" />
            <DocumentStatusChip status="attention" />
            <DocumentStatusChip status="disconnected" />
          </div>
        </Card>
        <Card className="flex flex-col items-start gap-4">
          <h2 className="text-title text-text">페이지 이탈 확인 (CMN-01-P01)</h2>
          <Button variant="secondary" onClick={() => setLeaveOpen(true)}>
            이탈 확인 열기
          </Button>
        </Card>
        {Array.from({ length: 6 }, (_, index) => (
          <Card key={index} className="flex flex-col gap-2">
            <h2 className="text-title text-text">본문 카드 {index + 1}</h2>
          </Card>
        ))}
      </div>
      <LeaveConfirmDialog open={leaveOpen} onStay={() => setLeaveOpen(false)} onLeave={() => setLeaveOpen(false)} />
    </AppShell>
  );
}

/** 응답하지 않는 서버를 흉내 낸다. upAfterMs가 있으면 그 뒤부터 정상 응답한다 */
function fakeBackend(upAfterMs?: number): typeof fetch {
  const upAt = upAfterMs === undefined ? Infinity : Date.now() + upAfterMs;
  return async () => {
    if (Date.now() < upAt) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify({ data: { status: 'UP' } }), { headers: { 'Content-Type': 'application/json' } });
  };
}

/** 서버 연결 복구 (CMN-02)·페이지 없음 (CMN-03). Preview에서는 운영 서버를 끌 수 없어 가짜 응답으로 띄운다 */
function RecoverySection() {
  return (
    <Section title="서버 연결 복구 · 페이지 없음">
      <Row label="일러스트">
        <ServerRecoveryIllustration state="waiting" className="w-30 tablet:w-40" />
        <ServerRecoveryIllustration state="ready" className="w-30 tablet:w-40" />
        <NotFoundIllustration className="w-30 tablet:w-40" />
      </Row>
      <Row label="오버레이">
        <Button variant="secondary" onClick={() => void recoverBackendAvailability(fakeBackend())}>
          연결 끊김
        </Button>
        <Button variant="secondary" onClick={() => void recoverBackendAvailability(fakeBackend(6000))}>
          6초 뒤 복구
        </Button>
        <Link to="/__ui/없는-주소" className="inline-flex h-12 items-center px-2 text-label text-link">
          페이지 없음
        </Link>
      </Row>
    </Section>
  );
}
