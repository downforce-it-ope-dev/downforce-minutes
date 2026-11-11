import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withHealthyBackend } from '../testUtils/withHealthyBackend';
import { CompleteRoute } from './CompletePage';

function data(body: unknown, status = 200) {
  return new Response(JSON.stringify({ data: body }), { status, headers: { 'Content-Type': 'application/json' } });
}

const PEOPLE = [
  { id: 'p1', name: '홍길동', email: 'hong@miinit.com' },
  { id: 'p2', name: '김철수', email: 'kim@miinit.com' },
];
const CONFIG = {
  company: { id: 'c', name: 'E', timezone: 'Asia/Seoul' },
  document: { provider: 'NOTION', configured: true, connectionVersion: 2, rootUrl: 'https://notion.example' },
  email: { enabled: true, configured: true },
  notification: { provider: 'SLACK', enabled: true },
};

type Snapshot = Record<string, unknown>;

function mockApi(snapshots: Snapshot[] | (() => Snapshot), extra: (path: string, init: RequestInit) => Response | Promise<Response> | null = () => null) {
  let reads = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    const handled = await extra(path, init);
    if (handled) return handled;
    if (path === '/api/v1/meeting-sessions/s1' && (init.method ?? 'GET') === 'GET') {
      const next = typeof snapshots === 'function' ? snapshots() : snapshots[Math.min(reads, snapshots.length - 1)];
      reads += 1;
      return data(next);
    }
    if (path.endsWith('/participants')) return data({ items: PEOPLE });
    if (path.endsWith('/app-config')) return data(CONFIG);
    throw new Error(`Unexpected request: ${init.method ?? 'GET'} ${path}`);
  });
  vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
  return fetchMock;
}

function renderComplete() {
  render(
    <MemoryRouter initialEntries={['/meetings/s1/complete']}>
      <Routes>
        <Route path="/meetings/:sessionId/complete" element={<CompleteRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

const posts = (fetchMock: ReturnType<typeof vi.fn>, suffix: string) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url).includes(suffix) && init?.method === 'POST');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('회의 결과 (MTG-05)', () => {
  it('완료되면 단계(저장 → 이메일)와 수신자별 결과, 저장된 회의록 보기를 보인다. Slack 단계는 없다', async () => {
    mockApi([{
      sessionId: 's1', version: 9, status: 'COMPLETED', allowedActions: [],
      document: { documentId: 'doc-1' },
      deliveries: [
        { deliveryId: 'd1', channel: 'EMAIL', recipientParticipantId: 'p1', status: 'SENT' },
        { deliveryId: 'd2', channel: 'EMAIL', recipientParticipantId: 'p2', status: 'SENT' },
        { deliveryId: 'n1', channel: 'NOTIFICATION', status: 'FAILED', retryable: true },
      ],
    }]);
    renderComplete();
    expect(await screen.findByRole('heading', { level: 2, name: '완료' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    const steps = within(screen.getByRole('region', { name: '처리 단계' })).getAllByRole('listitem');
    // 전체 결과는 위 제목에만 보이고, 단계는 저장·이메일 두 개뿐이다(완료 단계 중복 제거)
    expect(steps.map((step) => step.textContent)).toEqual(['회의록 저장완료', '이메일 전달완료']);
    expect(screen.queryByText(/Slack/)).toBeNull();
    const rows = within(screen.getByRole('region', { name: '이메일' })).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual(['홍길동hong@miinit.com전달 완료', '김철수kim@miinit.com전달 완료']);
    expect(screen.getByRole('link', { name: '저장된 회의록 보기' }).getAttribute('href')).toBe('/meetings/doc-1');
    expect(screen.getByRole('link', { name: '새 회의' }).getAttribute('href')).toBe('/meetings/new');
  });

  it('문서 저장에 실패하면 원인과 접힌 오류 코드, 저장 재시도만 보이고 스스로 다시 보내지 않는다', async () => {
    const fetchMock = mockApi([{
      sessionId: 's1', version: 9, status: 'DOCUMENT_FAILED', allowedActions: ['PUBLISH'],
      documentFailure: { errorCode: 'DOCUMENT_STRUCTURE_NOT_FOUND', retryable: false },
    }]);
    renderComplete();
    expect(await screen.findByRole('heading', { level: 2, name: '문서 저장 실패' })).toBeTruthy();
    expect(screen.getByText('필수 문서 구조를 찾을 수 없습니다.')).toBeTruthy();
    expect(screen.getByText('오류 코드 DOCUMENT_STRUCTURE_NOT_FOUND')).toBeTruthy();
    expect(screen.getByRole('button', { name: '저장 재시도' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: '저장된 회의록 보기' })).toBeNull();
    expect(posts(fetchMock, '/publish')).toHaveLength(0);
  });

  it('확정만 된 회의는 들어오자마자 참석자 전원에게 저장·전달을 시작하고 Slack 알림은 켜지 않는다', async () => {
    let published = false;
    const fetchMock = mockApi(
      () => (published
        ? { sessionId: 's1', version: 11, status: 'PUBLISHING', allowedActions: [] }
        : { sessionId: 's1', version: 10, status: 'CONFIRMED', allowedActions: ['PUBLISH'], meeting: { participantIds: ['p1', 'p2'] } }),
      (path, init) => {
        if (!path.endsWith('/publish')) return null;
        published = true;
        expect(new Headers(init.headers).get('If-Match')).toBe('"10"');
        return data({ sessionId: 's1', status: 'PUBLISHING' }, 202);
      },
    );
    renderComplete();
    await waitFor(() => expect(posts(fetchMock, '/publish')).toHaveLength(1));
    expect(JSON.parse(String(posts(fetchMock, '/publish')[0][1]!.body))).toEqual({ emailRecipientParticipantIds: ['p1', 'p2'], notificationEnabled: false });
    expect(await screen.findByRole('heading', { level: 2, name: '회의록 저장 중' })).toBeTruthy();
  });

  it('실패한 수신자를 먼저 보이고, 재전송 결과가 불명확하면 같은 키로 한 번 더 보낸다', async () => {
    let retries = 0;
    const fetchMock = mockApi(
      [{
        sessionId: 's1', version: 9, status: 'COMPLETED_WITH_WARNINGS', allowedActions: [], document: { documentId: 'doc-1' },
        deliveries: [
          { deliveryId: 'd1', channel: 'EMAIL', recipientParticipantId: 'p1', status: 'SENT' },
          { deliveryId: 'd2', channel: 'EMAIL', recipientParticipantId: 'p2', status: 'FAILED', retryable: true },
        ],
      }],
      (path) => {
        if (!path.endsWith('/retry')) return null;
        retries += 1;
        if (retries === 1) throw new TypeError('connection lost');
        return data({ deliveryId: 'd2', status: 'PENDING' }, 202);
      },
    );
    renderComplete();
    expect(await screen.findByRole('heading', { level: 2, name: '일부 전달 실패' })).toBeTruthy();
    const rows = within(screen.getByRole('region', { name: '이메일' })).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('김철수');
    fireEvent.click(within(rows[0]).getByRole('button', { name: '김철수 재전송' }));
    await waitFor(() => expect(posts(fetchMock, '/retry')).toHaveLength(2));
    const keys = posts(fetchMock, '/retry').map(([, init]) => new Headers(init!.headers).get('Idempotency-Key'));
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it('진행 중이면 1.5초마다 다시 조회한다', async () => {
    const fetchMock = mockApi([
      { sessionId: 's1', version: 3, status: 'PUBLISHING', allowedActions: [] },
      { sessionId: 's1', version: 4, status: 'DOCUMENT_FAILED', allowedActions: ['PUBLISH'], documentFailure: { errorCode: 'DOCUMENT_FAILED', retryable: true } },
    ]);
    renderComplete();
    expect(await screen.findByRole('heading', { level: 2, name: '회의록 저장 중' })).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 2, name: '문서 저장 실패' }, { timeout: 3_000 })).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/meeting-sessions/s1')).length).toBeGreaterThanOrEqual(2);
  });

  it('회의가 없으면 새 회의 시작을 보인다', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      if (path.endsWith('/meeting-sessions/s1')) return new Response(JSON.stringify({ error: { code: 'SESSION_NOT_FOUND' } }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      if (path.endsWith('/participants')) return data({ items: [] });
      return data(CONFIG);
    });
    vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
    renderComplete();
    expect(await screen.findByRole('heading', { name: '회의를 찾을 수 없습니다' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '새 회의 시작' }).getAttribute('href')).toBe('/meetings/new');
  });
});
