import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as documentSetupApi from '../documentSetupApi';
import type { SetupSnapshot } from '../documentSetupApi';
import { DocumentGate } from './DocumentGate';
import { useGateBlocking } from './gateBlocking';

vi.mock('../documentSetupApi', () => ({ getSetupSnapshot: vi.fn() }));
const getSetupSnapshot = vi.mocked(documentSetupApi.getSetupSnapshot);

function snapshot(status: string, canCreateMeeting: boolean) {
  return { snapshot: { status, canCreateMeeting } as unknown as SetupSnapshot, etag: null };
}

function Destination() {
  const state = useLocation().state as { from?: string } | null;
  return <h1>{`${useLocation().pathname} from ${state?.from}`}</h1>;
}

function Blocking() {
  return <span data-testid="blocking">{String(useGateBlocking())}</span>;
}

function renderGate(path = '/meetings/new') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Blocking />
      <Routes>
        <Route path="/meetings/new" element={<DocumentGate><h1>새 회의</h1></DocumentGate>} />
        <Route path="/setup/document" element={<Destination />} />
        <Route path="/settings/document" element={<Destination />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('문서 연결 확인 (CMN-04, #19)', () => {
  it('확인하는 동안 화면을 막고, 준비됐으면 요청한 화면을 보인다', async () => {
    getSetupSnapshot.mockResolvedValue(snapshot('READY', true));
    renderGate();
    expect(screen.getByRole('status').textContent).toBe('문서 연결 상태를 확인하는 중');
    expect(screen.getByTestId('blocking').textContent).toBe('true');
    expect(await screen.findByRole('heading', { name: '새 회의' })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('blocking').textContent).toBe('false'));
  });

  it('연결이 없으면 원래 경로를 넘겨 연결 흐름으로 보낸다', async () => {
    getSetupSnapshot.mockResolvedValue(snapshot('NOT_CONFIGURED', false));
    renderGate();
    expect(await screen.findByRole('heading', { name: '/setup/document from /meetings/new' })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('blocking').textContent).toBe('false'));
  });

  it('저장소 문제면 문서 연결 관리로 보낸다', async () => {
    getSetupSnapshot.mockResolvedValue(snapshot('STORAGE_UNAVAILABLE', false));
    renderGate();
    expect(await screen.findByRole('heading', { name: '/settings/document from /meetings/new' })).toBeTruthy();
  });

  it('조회에 실패하면 오류 화면을 보이고, 다시 확인으로 통과할 수 있다', async () => {
    getSetupSnapshot.mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(snapshot('READY', true));
    renderGate();
    expect(await screen.findByRole('heading', { name: '문서 연결 상태를 확인할 수 없습니다' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '문서 연결 설정' }).getAttribute('href')).toBe('/settings/document');
    fireEvent.click(screen.getByRole('button', { name: '다시 확인' }));
    expect(await screen.findByRole('heading', { name: '새 회의' })).toBeTruthy();
  });
});
