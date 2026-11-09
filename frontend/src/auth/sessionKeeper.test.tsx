import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from './authApi';
import { SESSION_CHECK_INTERVAL_MS, SessionKeeper } from './SessionKeeper';
import { useReportSessionWork } from './sessionWork';

vi.mock('./authApi', () => ({ getSession: vi.fn(), recordActivity: vi.fn() }));
const getSession = vi.mocked(authApi.getSession);
const recordActivity = vi.mocked(authApi.recordActivity);
const alive = { status: 'authenticated' as const, remainingIdleSeconds: 7200 };

function LoginProbe() {
  const state = useLocation().state as { reason?: string; from?: string } | null;
  return <h1>로그인 {state?.reason} {state?.from}</h1>;
}

function Work() {
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  useReportSessionWork(busy, recording);
  return (
    <>
      <h1>회의 화면</h1>
      <button type="button" onClick={() => setBusy((value) => !value)}>작업 {busy ? '끝' : '시작'}</button>
      <button type="button" onClick={() => setRecording((value) => !value)}>녹음</button>
    </>
  );
}

function renderKeeper() {
  return render(
    <MemoryRouter initialEntries={['/meetings']}>
      <SessionKeeper />
      <Routes>
        <Route path="/login" element={<LoginProbe />} />
        <Route path="/meetings" element={<Work />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SESSION_CHECK_INTERVAL_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  getSession.mockResolvedValue(alive);
  recordActivity.mockResolvedValue(alive);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('세션 유지 (#15)', () => {
  it('조작이 있으면 1분에 한 번만 활동을 갱신하고, 없으면 세션만 확인한다', async () => {
    renderKeeper();
    fireEvent.pointerDown(window);
    fireEvent.keyDown(window);
    await tick();
    expect(recordActivity).toHaveBeenCalledTimes(1);
    await tick();
    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('녹음 중에는 조작이 없어도 계속 갱신한다', async () => {
    renderKeeper();
    fireEvent.click(screen.getByRole('button', { name: '녹음' }));
    await tick();
    await tick();
    expect(recordActivity).toHaveBeenCalledTimes(2);
    expect(getSession).not.toHaveBeenCalled();
  });

  it('만료되면 원래 경로를 기억하고 로그인 화면으로 보낸다', async () => {
    getSession.mockResolvedValue({ status: 'unauthenticated' });
    renderKeeper();
    await tick();
    await tick();
    expect(screen.getByRole('heading').textContent).toBe('로그인 expired /meetings');
  });

  it('진행 중 작업이 있으면 끝날 때까지 기다렸다가 보낸다', async () => {
    getSession.mockResolvedValue({ status: 'unauthenticated' });
    recordActivity.mockResolvedValue({ status: 'unauthenticated' });
    renderKeeper();
    fireEvent.click(screen.getByRole('button', { name: '작업 시작' }));
    await tick();
    await tick();
    expect(screen.getByRole('heading', { name: '회의 화면' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '작업 끝' }));
    await act(async () => {});
    expect(screen.getByRole('heading').textContent).toBe('로그인 expired /meetings');
  });

  it('연결 실패는 만료로 보지 않는다', async () => {
    getSession.mockResolvedValue({ status: 'unavailable' });
    renderKeeper();
    await tick();
    await tick();
    expect(screen.getByRole('heading', { name: '회의 화면' })).toBeTruthy();
  });
});
