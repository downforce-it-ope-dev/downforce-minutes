import { useRef, useState, type ChangeEvent } from 'react';
import { CircleAlert, CircleCheck, Download, FileUp, RotateCcw, Square, Upload } from 'lucide-react';
import { NavigationLeaveGuard } from '../components/NavigationLeaveGuard';
import { createParticipant, listParticipants, ParticipantApiError, updateParticipant } from '../participantsApi';
import { Button, ButtonAnchor, cn, Dialog, FilterChips, Icon, ProgressBar } from '../ui';
import { countByStatus, decodeCsv, parseCsv, planImport, readPeople, STATUS_LABEL, type ImportItem, type ImportStatus } from './csvImport';

/*
 * PTC-01-P03 CSV 일괄 등록 (GitHub #37, PTC-01 3.6). 한 대화상자 안에서 파일 선택 → 확인 → 등록 → 결과.
 * - 팀 없이 메일계정·이름만(사용자 결정 2026-11-12). 행 수·파일 크기 제한 없음. 같은 메일계정은 이름을 갱신
 * - 등록(API-004)·이름 갱신(API-005)을 한 건씩 차례로 부른다. 등록은 행마다 멱등 키(작업 + 메일계정)를 다시 시도에도 그대로 쓴다
 * - 이후 행도 모두 실패할 오류(문서 변경 중·연결 버전 충돌)는 바로 멈춘다. 등록 중에는 닫을 수 없고 화면 이탈을 경고한다
 * - 설명 문구 없이 버튼·값만 둔다(S-13). 파일 오류는 대화상자 안에 보인다
 */

type Outcome = 'done' | 'failed' | 'stopped';
type RunItem = ImportItem & { outcome?: Outcome; failure?: string };
type Step = { name: 'pick'; error?: string } | { name: 'review' } | { name: 'run' } | { name: 'result' };
type View = 'all' | ImportStatus;

const FATAL = new Set(['DOCUMENT_CHANGE_BUSY', 'DOCUMENT_SETTINGS_VERSION_CONFLICT', 'DOCUMENT_STRUCTURE_NOT_FOUND']);
const ACTIONABLE: ReadonlySet<ImportStatus> = new Set(['create', 'rename']);

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function failureText(error: unknown): string {
  if (error instanceof ParticipantApiError) {
    if (error.code === 'NETWORK_ERROR') return '연결 오류';
    if (error.code === 'VALIDATION_FAILED') return '입력 오류';
    if (error.code === 'PARTICIPANT_NOT_FOUND') return '참석자 없음';
    if (FATAL.has(error.code)) return '문서 연결 변경';
  }
  return '저장 실패';
}

export function CsvImportDialog({ open, onClose }: { open: boolean; onClose: (changed: { created: number; renamed: number }) => void }) {
  const [step, setStep] = useState<Step>({ name: 'pick' });
  const [items, setItems] = useState<RunItem[]>([]);
  const [view, setView] = useState<View>('all');
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
  const job = useRef(createId());
  const stopRequested = useRef(false);
  const running = step.name === 'run';

  const reset = () => {
    setStep({ name: 'pick' });
    setItems([]);
    setView('all');
    setProgress({ done: 0, total: 0, current: '' });
  };
  const close = () => {
    if (running) return;
    const created = items.filter((item) => item.status === 'create' && item.outcome === 'done').length;
    const renamed = items.filter((item) => item.status === 'rename' && item.outcome === 'done').length;
    reset();
    onClose({ created, renamed });
  };

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setStep({ name: 'pick', error: 'CSV 파일만 올릴 수 있습니다. 엑셀 파일은 CSV로 저장해 주세요.' });
      return;
    }
    setReading(true);
    try {
      let text: string;
      try {
        text = decodeCsv(await file.arrayBuffer());
      } catch {
        setStep({ name: 'pick', error: '파일을 읽지 못했습니다. 글자 인코딩(UTF-8 또는 CP949)을 확인해 주세요.' });
        return;
      }
      const read = readPeople(parseCsv(text));
      if (!read.ok) {
        setStep({ name: 'pick', error: `첫 행에서 ${read.missing.map((name) => `"${name}"`).join(', ')} 머리글을 찾지 못했습니다.` });
        return;
      }
      if (read.people.length === 0) {
        setStep({ name: 'pick', error: '등록할 행이 없습니다.' });
        return;
      }
      // 그사이 다른 사람이 등록했을 수 있으므로 이 단계에서 목록을 다시 불러와 판단한다
      const roster = await listParticipants();
      job.current = createId();
      setItems(planImport(read.people, roster));
      setView('all');
      setStep({ name: 'review' });
    } catch {
      setStep({ name: 'pick', error: '참석자 목록을 불러오지 못했습니다. 다시 시도해 주세요.' });
    } finally {
      setReading(false);
    }
  }

  async function run(onlyFailed: boolean) {
    const targets = items.filter((item) => ACTIONABLE.has(item.status) && (onlyFailed ? item.outcome === 'failed' || item.outcome === 'stopped' : !item.outcome));
    if (targets.length === 0) return;
    stopRequested.current = false;
    setStep({ name: 'run' });
    setProgress({ done: 0, total: targets.length, current: '' });
    const update = (line: number, patch: Partial<RunItem>) =>
      setItems((current) => current.map((item) => (item.line === line ? { ...item, ...patch } : item)));

    let fatal = false;
    for (const [index, item] of targets.entries()) {
      if (stopRequested.current || fatal) {
        update(item.line, { outcome: 'stopped', failure: '등록 안 함' });
        continue;
      }
      setProgress({ done: index, total: targets.length, current: item.name });
      try {
        if (item.status === 'create') await createParticipant({ name: item.name, email: item.email }, `${job.current}:${item.email}`);
        else if (item.existing) await updateParticipant(item.existing.id, { name: item.name });
        update(item.line, { outcome: 'done', failure: undefined });
      } catch (error) {
        update(item.line, { outcome: 'failed', failure: failureText(error) });
        if (error instanceof ParticipantApiError && FATAL.has(error.code)) fatal = true;
      }
    }
    setProgress((current) => ({ ...current, done: current.total }));
    setStep({ name: 'result' });
  }

  const counts = countByStatus(items);
  const actionable = counts.create + counts.rename;
  const visible = view === 'all' ? items : items.filter((item) => item.status === view);
  const failed = items.filter((item) => item.outcome === 'failed' || item.outcome === 'stopped');

  const footer =
    step.name === 'review' ? (
      <>
        <Button variant="secondary" shape="pill" icon={RotateCcw} onClick={reset}>
          다른 파일
        </Button>
        <Button size="lg" shape="pill" icon={Upload} disabled={actionable === 0} onClick={() => void run(false)}>
          {counts.rename ? `${counts.create}명 등록 · ${counts.rename}명 갱신` : `${counts.create}명 등록`}
        </Button>
      </>
    ) : step.name === 'run' ? (
      <Button
        variant="secondary"
        shape="pill"
        icon={Square}
        onClick={() => {
          stopRequested.current = true;
        }}
      >
        중단
      </Button>
    ) : step.name === 'result' ? (
      <>
        {failed.length > 0 && (
          <Button variant="secondary" shape="pill" icon={RotateCcw} onClick={() => void run(true)}>
            실패 {failed.length}명 다시 시도
          </Button>
        )}
        <Button size="lg" shape="pill" onClick={close}>
          완료
        </Button>
      </>
    ) : undefined;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()} title="CSV로 일괄 등록" size="form" dismissible={!running} footer={footer}>
      <NavigationLeaveGuard active={running} />
      {step.name === 'pick' && (
        <div className="flex flex-col gap-4">
          <label
            className={cn(
              'flex h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border-input bg-bg-subtle text-label text-text',
              'focus-within:outline-2 focus-within:outline-focus active:bg-selected',
              reading && 'cursor-wait',
            )}
          >
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void pickFile(event)} disabled={reading} />
            <Icon icon={FileUp} size="xl" className="text-brand-text" />
            <span>{reading ? '읽는 중…' : '파일 선택'}</span>
          </label>
          {step.error && (
            <p role="alert" className="flex items-start gap-2 text-body text-danger-text">
              <Icon icon={CircleAlert} size="md" className="mt-0.5 shrink-0" />
              {step.error}
            </p>
          )}
          <ButtonAnchor href="/participants-template.csv" download variant="secondary" shape="pill" icon={Download} className="self-start">
            양식 내려받기
          </ButtonAnchor>
        </div>
      )}

      {step.name === 'review' && (
        <div className="flex flex-col gap-4">
          <FilterChips
            label="보기"
            value={view}
            onChange={setView}
            options={[
              { value: 'all', label: '전체', count: items.length },
              ...(Object.keys(STATUS_LABEL) as ImportStatus[]).filter((status) => counts[status] > 0).map((status) => ({ value: status, label: STATUS_LABEL[status], count: counts[status] })),
            ]}
          />
          <PreviewList items={visible} />
        </div>
      )}

      {step.name === 'run' && (
        <div className="flex flex-col gap-3 py-4">
          <p className="text-label text-text tabular-nums">
            {progress.done} / {progress.total}명
          </p>
          <ProgressBar value={progress.done} max={progress.total} label="등록 진행" valueText={`${progress.total}명 중 ${progress.done}명`} />
          <p className="truncate text-body text-text-muted">{progress.current}</p>
        </div>
      )}

      {step.name === 'result' && <ResultSummary items={items} failed={failed} />}
    </Dialog>
  );
}

const BADGE: Record<ImportStatus, string> = {
  create: 'bg-accent-soft text-accent-soft-text',
  rename: 'bg-primary-soft text-primary-soft-text',
  same: 'bg-bg-subtle text-text-muted',
  duplicate: 'bg-bg-subtle text-text-muted',
  error: 'bg-danger-soft text-danger-text',
};

function StatusBadge({ item }: { item: ImportItem }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-sm px-2 py-0.5 text-caption', BADGE[item.status])}>
      {item.status === 'error' && <Icon icon={CircleAlert} size="sm" />}
      {item.status === 'error' ? item.reason : STATUS_LABEL[item.status]}
    </span>
  );
}

/** 확인 목록. 태블릿: 행 | 이름 | 메일계정 | 상태 한 줄, 휴대폰: 2줄 */
function PreviewList({ items }: { items: readonly ImportItem[] }) {
  return (
    <ul aria-label="CSV 행" className="flex flex-col rounded-lg border border-border">
      {items.map((item) => (
        <li key={item.line} className="flex min-h-15 flex-col justify-center gap-1 border-b border-border px-3 py-2 last:border-b-0 tablet:flex-row tablet:items-center tablet:gap-3">
          <span className="flex min-w-0 items-center gap-2 tablet:w-48 tablet:shrink-0">
            <span className="w-8 shrink-0 text-caption text-text-muted tabular-nums">{item.line}</span>
            <span className="truncate text-label text-text">{item.name || '(이름 없음)'}</span>
          </span>
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2 pl-10 tablet:pl-0">
            <span className="truncate text-caption text-text-muted tablet:text-body">{item.email || '(메일계정 없음)'}</span>
            <StatusBadge item={item} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function ResultSummary({ items, failed }: { items: readonly RunItem[]; failed: readonly RunItem[] }) {
  const created = items.filter((item) => item.status === 'create' && item.outcome === 'done').length;
  const renamed = items.filter((item) => item.status === 'rename' && item.outcome === 'done').length;
  const skipped = items.filter((item) => !ACTIONABLE.has(item.status)).length;
  return (
    <div className="flex flex-col gap-4">
      <p className={cn('flex items-center gap-2 text-title', failed.length ? 'text-danger-text' : 'text-success-text')}>
        <Icon icon={failed.length ? CircleAlert : CircleCheck} size="lg" />
        {failed.length ? '일부 실패' : '완료'}
      </p>
      <dl className="grid grid-cols-2 gap-3 tablet:grid-cols-4">
        {[
          ['등록', created],
          ['이름 갱신', renamed],
          ['건너뜀', skipped],
          ['실패', failed.length],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1 rounded-md bg-bg-subtle px-4 py-3">
            <dt className="text-caption text-text-muted">{label}</dt>
            <dd className="text-title text-text tabular-nums">{value}명</dd>
          </div>
        ))}
      </dl>
      {failed.length > 0 && (
        <ul aria-label="실패한 행" className="flex flex-col rounded-lg border border-border">
          {failed.map((item) => (
            <li key={item.line} className="flex min-h-15 items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
              <span className="w-8 shrink-0 text-caption text-text-muted tabular-nums">{item.line}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-label text-text">{item.name}</span>
                <span className="truncate text-caption text-text-muted">{item.email}</span>
              </span>
              <span className="shrink-0 text-caption text-danger-text">{item.failure}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
