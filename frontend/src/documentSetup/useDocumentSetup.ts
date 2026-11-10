import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { useLocation } from 'react-router';
import {
  actOnSetupOperation, getSetupOperation, getSetupSnapshot, initializeSetup, saveSetupDraft, switchSetup, testSetupDraft,
  DocumentSetupError, type DocumentProvider, type DraftInput, type SetupOperation, type SetupSnapshot, type SwitchMode, type TestedDraft,
} from '../documentSetupApi';
import { loadStoredDocumentConnection, savePendingDocumentConnection, saveReadyDocumentConnection } from '../documentConnectionStorage';
import { getDocumentAppConfig, listMeetingParticipants } from '../newMeetingApi';

/*
 * 문서 연결 흐름의 상태·API 처리 (SET-02~06, GitHub #20~#22).
 * 기존 DocumentSetupWizard.tsx의 로직을 동작 변경 없이 옮겼다. 화면은 DocumentSetupPage가 그린다.
 * 알림(토스트)은 notify로 부르는 쪽에 맡긴다.
 */

type Credentials = { token: string; accountEmail: string; apiToken: string };
type LocationInput = { parentPageId: string; baseUrl: string; spaceId: string };
const EMPTY_CREDENTIALS: Credentials = { token: '', accountEmail: '', apiToken: '' };
const EMPTY_LOCATION: LocationInput = { parentPageId: '', baseUrl: '', spaceId: '' };
const TERMINAL_OPERATION_STATUSES = ['SUCCEEDED', 'FAILED', 'INTERRUPTED', 'CANCELLED', 'RECONCILIATION_REQUIRED'];
export const STRUCTURE_STEPS = ['ROOT', 'MEETINGS', 'PARTICIPANTS', 'MEETING_DATA', 'TEMPLATES'];
export type { Credentials, LocationInput, SetupOperation, DocumentProvider };

export interface DocumentSetupRefs {
  formRef: RefObject<HTMLFormElement | null>;
  progressRefreshRef: RefObject<HTMLButtonElement | null>;
}

/** refs는 화면이 만들어 넘긴다(훅 결과 객체에 ref를 담으면 렌더링 중 ref 접근이 된다) */
export function useDocumentSetup(settings: boolean, notify: (message: string) => void, { formRef, progressRefreshRef }: DocumentSetupRefs) {
  const route = useLocation();
  const returnState = route.state as { returnTo?: unknown; returnState?: unknown } | null;
  const returnTo = typeof returnState?.returnTo === 'string' && returnState.returnTo.startsWith('/meetings/') && !returnState.returnTo.startsWith('//')
    ? returnState.returnTo : null;
  const [snapshot, setSnapshot] = useState<SetupSnapshot | null>(null);
  const [provider, setProvider] = useState<DocumentProvider | null>(null);
  const [credentials, setCredentials] = useState(EMPTY_CREDENTIALS);
  const [locationInput, setLocation] = useState(EMPTY_LOCATION);
  const [draft, setDraft] = useState<{ id: string; revision: number; version: number } | null>(null);
  const [tested, setTested] = useState<TestedDraft | null>(null);
  const [setupProgressStarted, setSetupProgressStarted] = useState(false);
  const [operation, setOperation] = useState<SetupOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [operationReadFailed, setOperationReadFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const [initializationUncertain, setInitializationUncertain] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const initializing = useRef(false);
  const [changing, setChanging] = useState(false);
  const [mode, setMode] = useState<SwitchMode>('COPY_ALL');
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [preparedInvalid, setPreparedInvalid] = useState(false);
  const refreshedConnection = useRef<number | null>(null);
  const [consumerRefreshAttempt, setConsumerRefreshAttempt] = useState(0);
  const [consumerRefreshFailed, setConsumerRefreshFailed] = useState(false);

  async function refresh() {
    const previousOperation = snapshot?.operation;
    const result = await getSetupSnapshot();
    setSnapshot(result.snapshot);
    if (result.snapshot.operation) {
      try {
        setOperation(await getSetupOperation(result.snapshot.operation.operationId));
        setOperationReadFailed(false);
        setError((current) => current.startsWith('진행 상세 정보를 불러오지 못했습니다.') ? '' : current);
      } catch {
        setOperationReadFailed(true);
        setError('진행 상세 정보를 불러오지 못했습니다. 백엔드 연결을 확인한 뒤 상태를 다시 불러와 주세요.');
      }
    } else {
      setOperation(null); setOperationReadFailed(false);
      if (previousOperation?.type === 'INITIALIZE') {
        setProvider(null); setCredentials(EMPTY_CREDENTIALS); setLocation(EMPTY_LOCATION);
        setDraft(null); setTested(null); setSetupProgressStarted(false); setInitializationUncertain(false);
        setError(''); setNotice(''); setFieldErrors({});
      }
    }
    return result.snapshot;
  }

  useEffect(() => { let live = true; void getSetupSnapshot().then(({ snapshot: current }) => {
    if (!live) return; setSnapshot(current);
    if (current.draft) { setProvider(current.draft.provider); setDraft({ id: current.draft.draftId, revision: current.draft.revision, version: current.version ?? 0 }); }
    if (current.operation) void getSetupOperation(current.operation.operationId).then((state) => { if (live) { setOperation(state); setOperationReadFailed(false); } }).catch(() => { if (live) { setOperationReadFailed(true); setError('진행 상세 정보를 불러오지 못했습니다. 백엔드 연결을 확인한 뒤 상태를 다시 불러와 주세요.'); } });
  }).catch(() => { if (live) setError('문서 설정 상태를 불러오지 못했습니다. 다시 시도해 주세요.'); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const operationId = snapshot?.operation?.operationId;
    const status = operation?.operationId === operationId ? operation?.status : snapshot?.operation?.status;
    if (!operationId || !status || !TERMINAL_OPERATION_STATUSES.includes(status)) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'hidden') return;
      void refresh().catch(() => setError('문서 설정 상태를 불러오지 못했습니다. 다시 시도해 주세요.'));
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [snapshot?.operation?.operationId, snapshot?.operation?.status, operation?.operationId, operation?.status]);

  useEffect(() => {
    const version = snapshot?.active?.connectionVersion;
    const rootId = snapshot?.active?.rootId;
    if (operation?.status !== 'SUCCEEDED' || snapshot?.status !== 'READY' || snapshot.draft?.state === 'PREPARED'
      || version == null || !rootId || refreshedConnection.current === version) return;
    refreshedConnection.current = version;
    let live = true;
    void (async () => {
      // 이 브라우저에서 연결을 진행한 적이 없으면 백업할 정보가 없다. 실패가 아니므로 알리지 않고 끝낸다(2026-11-10 사용자 결정)
      if (!loadStoredDocumentConnection()) return;
      try {
        saveReadyDocumentConnection(rootId, version);
      } catch {
        if (live) {
          refreshedConnection.current = null;
          setError('연결 정보가 이 브라우저에 저장되지 않았습니다. 브라우저 저장소를 확인해 주세요.');
        }
        return;
      }
      try {
        const [config] = await Promise.all([getDocumentAppConfig(), listMeetingParticipants()]);
        if (!live) return;
        if (config.document && config.document.connectionVersion !== version) throw new Error('STALE_DOCUMENT_CONFIG');
        window.dispatchEvent(new CustomEvent('document-connection-changed', { detail: { connectionVersion: version } }));
        notify('문서 서비스 연결이 준비되었습니다.'); setCredentials(EMPTY_CREDENTIALS);
      } catch {
        if (live) { refreshedConnection.current = null; setConsumerRefreshFailed(true); setError('새 연결의 설정 또는 참석자 목록을 불러오지 못했습니다. 연결 데이터를 다시 확인해 주세요.'); }
      }
    })();
    return () => { live = false; };
  }, [operation?.status, snapshot?.status, snapshot?.active?.connectionVersion, snapshot?.active?.rootId,
    snapshot?.draft?.state, consumerRefreshAttempt, notify]);

  useEffect(() => {
    const operationId = snapshot?.operation?.operationId;
    if (!operationId) return;
    const status = operation?.operationId === operationId ? operation?.status : snapshot?.operation?.status ?? '';
    if (TERMINAL_OPERATION_STATUSES.includes(status) && snapshot?.operation?.status === status) return;
    let live = true; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const current = await getSetupOperation(operationId);
        if (!live) return; setOperation(current); setOperationReadFailed(false);
        setError((message) => message.startsWith('진행 상세 정보를 불러오지 못했습니다.') ? '' : message);
        if (TERMINAL_OPERATION_STATUSES.includes(current.status)) {
          await refresh();
          return;
        }
      } catch { if (live) { setOperationReadFailed(true); setError('진행 상세 정보를 불러오지 못했습니다. 백엔드 연결을 확인한 뒤 상태를 다시 불러와 주세요.'); } }
      if (live) timer = setTimeout(poll, 1800);
    };
    timer = setTimeout(poll, TERMINAL_OPERATION_STATUSES.includes(status) ? 0 : 900);
    return () => { live = false; clearTimeout(timer); };
  }, [snapshot?.operation?.operationId, snapshot?.operation?.status, operation?.operationId, operation?.status]);

  function chooseProvider(next: DocumentProvider | null) {
    setProvider(next); setCredentials(EMPTY_CREDENTIALS); setLocation(EMPTY_LOCATION); setDraft(null); setTested(null); setOperation(null); setSetupProgressStarted(false); setError(''); setNotice(''); setFieldErrors({});
    if (next) requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>('input')?.focus());
  }
  function updateCredential(field: keyof Credentials, value: string) {
    setCredentials((current) => ({ ...current, [field]: value })); setTested(null); setError('');
    const id = field === 'token' ? 'notion-token' : field === 'accountEmail' ? 'confluence-email' : 'confluence-token';
    setFieldErrors((current) => ({ ...current, [id]: '' }));
  }
  function updateLocation(field: keyof LocationInput, value: string) {
    setLocation((current) => ({ ...current, [field]: value })); setTested(null); setError('');
    const id = field === 'parentPageId' ? 'notion-parent' : field === 'baseUrl' ? 'confluence-url' : 'confluence-space';
    setFieldErrors((current) => ({ ...current, [id]: '' }));
  }
  function credentialsValid() {
    return provider === 'NOTION' ? Boolean(credentials.token.trim() && locationInput.parentPageId.trim())
      : Boolean(credentials.accountEmail.trim() && credentials.apiToken.trim() && locationInput.baseUrl.trim() && locationInput.spaceId.trim());
  }
  function inputError(errors: Record<string, string>) {
    setFieldErrors(errors); setError('필수 입력을 확인해 주세요.');
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus());
  }

  async function handleTest(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    if (!provider) { setError('문서 서비스를 선택해 주세요.'); return; }
    if (!credentialsValid()) {
      const errors: Record<string, string> = {};
      if (provider === 'NOTION') {
        if (!credentials.token.trim()) errors['notion-token'] = 'Notion 내부 연결 토큰을 입력해 주세요.';
        if (!locationInput.parentPageId.trim()) errors['notion-parent'] = '부모 페이지 URL 또는 ID를 입력해 주세요.';
      } else {
        if (!locationInput.baseUrl.trim()) errors['confluence-url'] = 'Confluence 사이트 URL을 입력해 주세요.';
        if (!credentials.accountEmail.trim()) errors['confluence-email'] = 'Atlassian 계정 이메일을 입력해 주세요.';
        if (!credentials.apiToken.trim()) errors['confluence-token'] = 'Atlassian API token을 입력해 주세요.';
        if (!locationInput.spaceId.trim()) errors['confluence-space'] = 'Space ID를 입력해 주세요.';
      }
      inputError(errors); return;
    }
    setBusy(true); setError('');
    try {
      let current = snapshot;
      if (!current) current = await refresh();
      if (current.version == null) throw new DocumentSetupError('STORAGE_UNAVAILABLE', 503);
      const payload: DraftInput = provider === 'NOTION'
        ? { provider, location: { parentPageId: locationInput.parentPageId.trim() }, credentials: { token: credentials.token } }
        : { provider, location: { baseUrl: locationInput.baseUrl.trim(), spaceId: locationInput.spaceId.trim() }, credentials: { accountEmail: credentials.accountEmail.trim(), apiToken: credentials.apiToken } };
      const saved = await saveSetupDraft(payload, current.version);
      setDraft({ id: saved.data.draftId, revision: saved.data.revision, version: saved.data.version });
      setCredentials(EMPTY_CREDENTIALS);
      const test = await testSetupDraft(saved.data.draftId, saved.data.revision, saved.data.version);
      if (test.data.draftId !== saved.data.draftId || test.data.revision !== saved.data.revision
        || !test.data.authenticated || !test.data.parentAccessible
        || !Number.isFinite(Date.parse(test.data.expiresAt))) {
        setTested(test.data);
        setError('연결 확인 결과가 현재 설정과 일치하지 않습니다. 다시 연결 확인해 주세요.');
        return;
      }
      try { savePendingDocumentConnection(payload); }
      catch { throw new DocumentSetupError('BROWSER_STORAGE_UNAVAILABLE', 0); }
      setTested(test.data); setPreparedInvalid(false);
      const latest = await refresh();
      notify('연결을 확인했습니다. 자격 증명은 화면에서 지웠습니다.');
      if (!latest.active || (settings && changing)) {
        setSetupProgressStarted(true);
        await finish({ id: saved.data.draftId, revision: saved.data.revision, version: saved.data.version }, test.data, true);
      }
    } catch (reason) {
      if (reason instanceof DocumentSetupError && reason.status === 412) {
        const latest = await refresh(); setTested(null); setPreparedInvalid(true); setError(`설정이 다른 브라우저에서 변경되었습니다. 최신 상태를 읽었습니다. 설정 버전: ${latest.version}, draft revision: ${latest.draft?.revision ?? '없음'}. 자격 증명을 다시 입력해 연결을 확인해 주세요.`); setCredentials(EMPTY_CREDENTIALS);
      } else if (reason instanceof DocumentSetupError && reason.code === 'DOCUMENT_FAILED') setError('연결을 확인하지 못했습니다. 입력과 Provider 권한을 확인한 뒤 다시 시도해 주세요.');
      else if (reason instanceof DocumentSetupError && reason.code === 'STORAGE_UNAVAILABLE') setError('저장소 설정을 확인할 수 없습니다. 관리자에게 저장소 설정을 확인해 달라고 요청해 주세요.');
      else if (reason instanceof DocumentSetupError && reason.code === 'BROWSER_STORAGE_UNAVAILABLE') setError('연결은 확인했지만 브라우저에 연결 정보를 저장하지 못했습니다. 브라우저 저장소를 허용하고 다시 연결해 주세요.');
      else setError('연결을 확인하지 못했습니다. 입력값과 네트워크를 확인하고 다시 시도해 주세요.');
    } finally { setBusy(false); }
  }

  async function finish(draftToInitialize = draft, testedDraft = tested, allowWhileBusy = false) {
    if (busy && !allowWhileBusy || initializing.current) return;
    if (!draftToInitialize || !testedDraft || testedDraft.revision !== draftToInitialize.revision || Date.parse(testedDraft.expiresAt) <= Date.now()) { setError('완료 전에 같은 설정 버전으로 연결을 다시 확인해 주세요.'); setTested(null); setSetupProgressStarted(false); return; }
    initializing.current = true; setBusy(true); setError('');
    let initializationSent = false;
    let acceptedOperationId: string | null = null;
    try {
      const current = await refresh();
      if (current.version == null) throw new DocumentSetupError('STORAGE_UNAVAILABLE', 503);
      initializationSent = true;
      const result = await initializeSetup(draftToInitialize.id, draftToInitialize.revision, current.version);
      acceptedOperationId = result.data.operationId;
      setSnapshot(await refresh());
      const state = await getSetupOperation(result.data.operationId); setOperation(state);
      setNotice('');
    } catch (reason) {
      if (reason instanceof DocumentSetupError && reason.status === 412) {
        await refresh(); setTested(null); setError('설정 버전이 변경되었습니다. 최신 설정을 다시 읽었습니다. 연결 확인을 다시 진행해 주세요.');
      } else if (initializationSent) {
        setTested(null); setCredentials(EMPTY_CREDENTIALS);
        try {
          const latest = await refresh();
          if (latest.operation) {
            setInitializationUncertain(false);
            notify('이미 진행 중인 문서 구조 준비 작업을 다시 확인했습니다.');
            setError('');
          } else if (acceptedOperationId) {
            const accepted = await getSetupOperation(acceptedOperationId);
            setOperation(accepted);
            setSnapshot({ ...latest, operation: { operationId: accepted.operationId, type: accepted.type, status: accepted.status } });
            setInitializationUncertain(false);
            notify('응답에서 확인한 작업 ID로 진행 상태를 다시 불러왔습니다.');
          } else {
            setInitializationUncertain(true);
            setError('완료 요청 결과가 불명확합니다. 다시 확인을 눌러 서버의 공개 작업 상태를 확인해 주세요.');
          }
        } catch {
          setInitializationUncertain(true);
          setError('완료 요청 결과를 확인할 수 없습니다. 다시 확인을 눌러 서버의 공개 작업 상태를 확인해 주세요.');
        }
      } else setError('문서 구조 초기화를 시작하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.');
      if (!initializationSent) setSetupProgressStarted(false);
    } finally { setBusy(false); initializing.current = false; }
  }

  async function recheckUncertainInitialization() {
    setBusy(true); setError('');
    try {
      const latest = await refresh();
      if (latest.operation && (!changing || latest.operation.type === 'SWITCH')) {
        setInitializationUncertain(false);
        notify('공개 작업 상태를 다시 확인했습니다.');
      } else {
        setInitializationUncertain(false);
        setPreparedInvalid(true); setTested(null); setProvider(null);
        setNotice(changing ? '진행 중인 변경 작업이 없습니다. 연결 확인을 다시 진행해 주세요.' : '진행 중인 초기화 작업이 없습니다. 연결 확인을 다시 진행해 주세요.');
      }
    } catch {
      setError('공개 작업 상태를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.');
    } finally { setBusy(false); }
  }

  function beginChange() {
    setChanging(true); setProvider(null); setDraft(null); setTested(null); setCredentials(EMPTY_CREDENTIALS); setLocation(EMPTY_LOCATION); setError(''); setNotice(''); setMode('COPY_ALL'); setConfirmEmpty(false);
  }

  async function reloadConflict() {
    const latest = await refresh(); setTested(null); setPreparedInvalid(true); setCredentials(EMPTY_CREDENTIALS); setProvider(null);
    setError(`설정 버전이 변경되었습니다. 최신 설정 버전: ${latest.version}, draft revision: ${latest.draft?.revision ?? '없음'}. 연결 확인을 다시 진행해 주세요.`);
  }

  async function startSwitch() {
    if (busy || initializing.current || initializationUncertain || preparedInvalid || snapshot?.draft?.state !== 'PREPARED' || snapshot.version == null || mode === 'START_EMPTY' && !confirmEmpty) return;
    initializing.current = true; setBusy(true); setError(''); setSetupProgressStarted(false);
    let acceptedId: string | null = null;
    try {
      const accepted = await switchSetup(snapshot.draft.draftId, snapshot.draft.revision, mode, snapshot.version);
      acceptedId = accepted.data.operationId;
      const latest = await refresh();
      if (!latest.operation || latest.operation.operationId !== acceptedId) {
        const state = await getSetupOperation(acceptedId); setOperation(state); setSnapshot({ ...latest, operation: { operationId: state.operationId, type: state.type, status: state.status } });
      }
      notify('문서 서비스 변경을 시작했습니다.');
    } catch (reason) {
      if (reason instanceof DocumentSetupError && reason.status === 412) {
        try { await reloadConflict(); } catch { setError('최신 설정 상태를 불러오지 못했습니다. 진행 상태를 다시 확인해 주세요.'); }
      } else {
        setInitializationUncertain(true);
        try {
          const latest = await refresh();
          if (latest.operation?.type === 'SWITCH' && !['SUCCEEDED', 'CANCELLED'].includes(latest.operation.status)) setInitializationUncertain(false);
          else if (acceptedId) {
            const state = await getSetupOperation(acceptedId); setOperation(state); setSnapshot({ ...latest, operation: { operationId: state.operationId, type: state.type, status: state.status } }); setInitializationUncertain(false);
          }
        } catch { /* Require an explicit status read when dispatch outcome is unknown. */ }
        setError('변경 요청 결과를 확인해 주세요. 새 전환을 보내기 전에 공개 작업 상태를 다시 확인해야 합니다.');
      }
    } finally { initializing.current = false; setBusy(false); }
  }

  async function runOperationAction(action: 'RETRY' | 'CANCEL') {
    const initializationOperation = operation?.type === 'INITIALIZE';
    if (busy || initializing.current || !operation || operation.type !== 'SWITCH' && !(initializationOperation && action === 'CANCEL' || initializationOperation && action === 'RETRY') || !operation.allowedActions.includes(action) || action === 'RETRY' && operation.status === 'RECONCILIATION_REQUIRED') return;
    initializing.current = true; setBusy(true); setError(''); setChanging(operation.type === 'SWITCH');
    try {
      await actOnSetupOperation(operation.operationId, action, operation.version);
      await refresh();
      if (initializationOperation && action === 'CANCEL') {
        setProvider(null); setCredentials(EMPTY_CREDENTIALS); setLocation(EMPTY_LOCATION); setDraft(null); setTested(null); setSetupProgressStarted(false); setInitializationUncertain(false); setChanging(false);
        setNotice('중단된 연결 작업을 종료했습니다. 문서 서비스에 일부 페이지가 생성되었는지 확인한 뒤 다시 연결해 주세요.');
      } else notify(action === 'RETRY' ? '같은 작업을 재개했습니다.' : '작업 취소를 요청했습니다.');
    } catch (reason) {
      if (reason instanceof DocumentSetupError && reason.status === 412) {
        try { await reloadConflict(); } catch { setError('최신 작업 상태를 불러오지 못했습니다. 다시 확인해 주세요.'); }
      } else {
        try { await refresh(); } catch { /* Preserve the visible operation and recovery action. */ }
        setError('작업 요청 결과를 확인하지 못했습니다. 진행 상태를 새로고침해 확인해 주세요.');
      }
    } finally { setBusy(false); initializing.current = false; requestAnimationFrame(() => progressRefreshRef.current?.focus()); }
  }

  async function safeRefresh() {
    setError('');
    try { await refresh(); } catch { setError('진행 상태를 불러오지 못했습니다. 다시 확인해 주세요.'); }
  }

  async function retryOperationStatus() {
    if (busy) return;
    setBusy(true);
    try {
      const { snapshot: latest } = await getSetupSnapshot();
      setSnapshot(latest);
      if (!latest.operation) {
        setOperation(null); setOperationReadFailed(false); setError('');
        return;
      }
      const current = await getSetupOperation(latest.operation.operationId);
      setOperation(current); setOperationReadFailed(false); setError('');
    } catch (reason) {
      setOperationReadFailed(true);
      const detail = reason instanceof DocumentSetupError ? ` (${reason.code}${reason.status ? `, HTTP ${reason.status}` : ''})` : '';
      setError(`진행 상세 정보를 불러오지 못했습니다${detail}. 백엔드 연결과 문서 설정 저장소를 확인한 뒤 다시 불러와 주세요.`);
    } finally { setBusy(false); }
  }

  async function closeUnresolvedInitialization() {
    const pending = snapshot?.operation;
    if (busy || !pending || pending.type !== 'INITIALIZE' || snapshot?.version == null) return;
    setBusy(true); setError('');
    try {
      await actOnSetupOperation(pending.operationId, 'CANCEL', snapshot.version);
      const { snapshot: latest } = await getSetupSnapshot();
      setSnapshot(latest); setOperation(null); setOperationReadFailed(false);
      setProvider(null); setCredentials(EMPTY_CREDENTIALS); setLocation(EMPTY_LOCATION); setDraft(null); setTested(null);
      setSetupProgressStarted(false); setInitializationUncertain(false); setChanging(false);
      setNotice('연결 작업을 종료했습니다. 이미 생성된 페이지가 있을 수 있으니 Notion에서 확인한 뒤 새 연결을 시작해 주세요.');
    } catch (reason) {
      const detail = reason instanceof DocumentSetupError ? ` (${reason.code}${reason.status ? `, HTTP ${reason.status}` : ''})` : '';
      setError(reason instanceof DocumentSetupError && reason.status === 409
        ? '문서 페이지 생성 작업이 아직 실행 중이라 종료하지 않았습니다. 잠시 뒤 진행 상태를 다시 불러와 주세요.'
        : `연결 작업을 종료하지 못했습니다${detail}. 백엔드 연결과 문서 설정 저장소를 확인해 주세요.`);
      try {
        const latest = await getSetupSnapshot();
        setSnapshot(latest.snapshot);
        if (latest.snapshot.operation) {
          const current = await getSetupOperation(latest.snapshot.operation.operationId);
          setOperation(current); setOperationReadFailed(false);
        }
      } catch { setOperationReadFailed(true); }
    } finally { setBusy(false); }
  }

  function clearCredentials() {
    setCredentials(EMPTY_CREDENTIALS);
  }

  const operationStatus = operation?.status ?? snapshot?.operation?.status ?? '';
  const preparedTarget = Boolean(snapshot?.active && snapshot.draft?.state === 'PREPARED' && snapshot.status === 'READY' && !preparedInvalid);
  const initializationSucceeded = snapshot?.operation?.type === 'INITIALIZE' && operationStatus === 'SUCCEEDED' && snapshot.status === 'READY' && snapshot.active != null && !preparedTarget;
  const initializationFailed = snapshot?.operation?.type === 'INITIALIZE' && ['FAILED', 'INTERRUPTED', 'CANCELLED', 'RECONCILIATION_REQUIRED'].includes(operationStatus);
  const initializationInProgress = !preparedTarget && !initializationFailed && (setupProgressStarted || snapshot?.operation?.type === 'INITIALIZE' && ['PENDING', 'RUNNING', 'SUCCEEDED'].includes(operationStatus));
  const hasBlockingOperation = Boolean(snapshot?.operation && !['SUCCEEDED', 'CANCELLED'].includes(operationStatus));
  const setupProvider = snapshot?.draft?.provider ?? snapshot?.active?.provider ?? provider;
  const completedStructureSteps = operation?.completedSteps ?? [];
  const currentStructureStep = operation?.currentStep ?? (operation?.stage === 'STRUCTURE'
    ? STRUCTURE_STEPS.find((step) => !completedStructureSteps.includes(step)) ?? null : null);

  function retryConsumerRefresh() {
    setError(''); setConsumerRefreshFailed(false); setConsumerRefreshAttempt((attempt) => attempt + 1);
  }

  return {
    snapshot, provider, credentials, location: locationInput, draft, tested, setupProgressStarted, operation, busy, error, setError,
    operationReadFailed, notice, setNotice, initializationUncertain, fieldErrors, changing, setChanging, mode, setMode,
    confirmEmpty, setConfirmEmpty, preparedInvalid, consumerRefreshFailed, returnTo, returnState,
    operationStatus, preparedTarget, initializationSucceeded, initializationFailed, initializationInProgress, hasBlockingOperation,
    setupProvider, completedStructureSteps, currentStructureStep,
    chooseProvider, updateCredential, updateLocation, handleTest, recheckUncertainInitialization, beginChange, startSwitch,
    runOperationAction, safeRefresh, retryOperationStatus, closeUnresolvedInitialization, retryConsumerRefresh, clearCredentials,
  };
}
