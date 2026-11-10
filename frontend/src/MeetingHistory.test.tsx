import { withHealthyBackend } from './testUtils/withHealthyBackend';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { MeetingsPage } from './MeetingHistory';
import { HomePage } from './home/HomePage';
import type { MeetingSummary } from './meetingListApi';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const meetings: MeetingSummary[] = Array.from({ length: 7 }, (_, index) => ({
  documentId: `doc-${index + 1}`,
  title: `Meeting ${index + 1}`,
  meetingAt: `2026-10-${String(14 - index).padStart(2, '0')}T09:00:00+09:00`,
  participants: [{ id: `p-${index}`, name: `Person ${index + 1}`, email: `private-${index}@example.com` }],
  documentUrl: `https://private.example/${index}`,
  status: 'COMPLETED', providerPayload: 'private provider details',
} as unknown as MeetingSummary));

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function installListFetch(items: MeetingSummary[]) {
  const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async (input) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/document-setup')) return response({ data: {
      version: 1, status: 'READY', active: { provider: 'NOTION', connectionVersion: 1, rootUrl: 'https://notion.example' },
      draft: null, operation: null, canCreateMeeting: true,
    } });
    if (path.endsWith('/processing-failures')) return response({ data: { items: [] } });
    return response({ data: { items } });
  });
  vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
  return fetchMock;
}

describe('Meetings page', () => {
  it('shows failed recordings in the current meeting list and retries them into processing', async () => {
    const failure = { sessionId: 'session-failed', version: 7, title: 'Long planning', meetingAt: '2026-10-14T09:00:00+09:00', stage: 'TRANSCRIPTION', errorCode: 'TRANSCRIPTION_PROCESSING_FAILED', audioExpiresAt: '2026-10-15T09:00:00Z', allowedActions: ['RETRY_PROCESSING'] };
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>((input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/processing-failures')) return Promise.resolve(response({ data: { items: [failure] } }));
      if (url.pathname.endsWith('/processing/retry')) return Promise.resolve(response({ data: { sessionId: failure.sessionId, status: 'PROCESSING', stage: failure.stage } }, 202));
      return Promise.resolve(response({ data: { items: meetings.slice(0, 2) } }));
    });
    vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
    render(<MemoryRouter initialEntries={['/meetings']}><Routes>
      <Route path="/meetings" element={<MeetingsPage />} />
      <Route path="/meetings/:sessionId/processing" element={<h1>처리 화면으로 이동</h1>} />
    </Routes></MemoryRouter>);

    expect(await screen.findByText('Long planning')).toBeTruthy();
    expect(screen.getByText('음성 인식 실패')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '회의 다시 처리' }));

    expect(await screen.findByRole('heading', { name: '처리 화면으로 이동' })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/session-failed/processing/retry'))).toBe(true);
  });

  it('offers a retry after the initial meeting list request fails', async () => {
    let meetingReads = 0;
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>((input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/processing-failures')) return Promise.resolve(response({ data: { items: [] } }));
      meetingReads += 1;
      return Promise.resolve(meetingReads === 1
        ? response({ error: { code: 'PROVIDER_FAILURE', message: 'token=private-provider-secret' } }, 502)
        : response({ data: { items: meetings.slice(0, 3) } }));
    });
    vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
    render(<MemoryRouter initialEntries={['/meetings']}><Routes><Route path="/meetings" element={<MeetingsPage />} /></Routes></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('button', { name: /Meeting 1 상세 보기/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Meeting 2 상세 보기/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Meeting 3 상세 보기/ })).toBeTruthy();
    expect(document.body.textContent).not.toContain('private-provider-secret');
    expect(meetingReads).toBe(2);
  });

  it('deduplicates StrictMode effect replay by query key while keeping Home and Meetings requests independent', async () => {
    const pendingResponses: Array<{ url: string; resolve: (value: Response) => void }> = [];
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>((input) => new Promise((resolve) => {
      pendingResponses.push({ url: String(input), resolve });
    }));
    vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
    render(<StrictMode><MemoryRouter><HomePage /><MeetingsPage /></MemoryRouter></StrictMode>);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(requestedUrls).toHaveLength(5);
    expect(requestedUrls.filter((url) => url.endsWith('/meetings?limit=3'))).toHaveLength(1);
    expect(requestedUrls.filter((url) => url.endsWith('/meetings'))).toHaveLength(1);
    expect(requestedUrls.filter((url) => url.endsWith('/document-setup'))).toHaveLength(2);
    expect(requestedUrls.filter((url) => url.endsWith('/processing-failures'))).toHaveLength(1);

    await act(async () => {
      pendingResponses.forEach(({ resolve }) => resolve(response({ data: { items: [] } })));
    });
    // 홈(새 화면)과 회의록 목록(기존 화면) 모두 빈 상태를 보인다
    expect((await screen.findAllByText(/회의 기록이 없습니다/)).length).toBeGreaterThanOrEqual(2);
  });

  it('requests the API default of 100 and renders summaries in the API-provided order', async () => {
    const orderedMeetings = [meetings[1]!, meetings[0]!, meetings[2]!];
    const fetchMock = installListFetch(orderedMeetings);
    render(<MemoryRouter initialEntries={['/meetings']}><Routes><Route path="/meetings" element={<MeetingsPage />} /></Routes></MemoryRouter>);

    const first = await screen.findByText('Meeting 2');
    expect(first.compareDocumentPosition(screen.getByText('Meeting 1')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fetchMock.mock.calls.map(([input]) => String(input)).find((url) => url.endsWith('/api/v1/meetings'))).toBe('http://localhost:8080/api/v1/meetings');
    expect(screen.getByText('Person 2')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '회의 기록' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '새 회의 시작' }).parentElement?.className).toContain('meetings-create-dock');
  });

  it('shows empty, loading, and retryable safe error states', async () => {
    let meetingReads = 0;
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>((input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/processing-failures')) return Promise.resolve(response({ data: { items: [] } }));
      meetingReads += 1;
      if (meetingReads === 1) return Promise.resolve(response({ data: { items: [] } }));
      if (meetingReads === 2) return Promise.resolve(response({ error: { code: 'PROVIDER_FAILURE', message: 'private detail' } }, 502));
      return Promise.resolve(response({ data: { items: meetings.slice(0, 1) } }));
    });
    vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
    const view = render(<MemoryRouter initialEntries={['/meetings']}><Routes><Route path="/meetings" element={<MeetingsPage />} /></Routes></MemoryRouter>);

    expect(await screen.findByText(/회의 기록이 없습니다/)).toBeTruthy();
    view.unmount();
    render(<MemoryRouter initialEntries={['/meetings']}><Routes><Route path="/meetings" element={<MeetingsPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/private detail/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('Meeting 1')).toBeTruthy();
    await waitFor(() => expect(meetingReads).toBe(3));
  });
});
