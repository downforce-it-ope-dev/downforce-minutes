import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissApiRecovery, getApiRecoveryState, recoverBackendAvailability } from '../apiRecovery';
import { ServerRecoveryOverlay } from './ServerRecoveryOverlay';

const down = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ServerRecoveryOverlay />
    </MemoryRouter>,
  );
}

// 닫은 뒤 15초 동안은 다시 띄우지 않으므로(apiRecovery) 테스트마다 시계를 넘긴다
let clock = Date.now();
beforeEach(() => {
  down.mockClear();
  clock += 60_000;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(clock);
});

afterEach(() => {
  dismissApiRecovery();
  cleanup();
  vi.useRealTimers();
});

describe('서버 연결 복구 (CMN-02, #18)', () => {
  it('연결이 끊기면 화면 전체를 덮고 닫기에 초점을 둔다. 화면으로 돌아가기는 오버레이만 닫는다', async () => {
    renderAt('/meetings');
    void recoverBackendAvailability(down);
    const dialog = await screen.findByRole('dialog', { name: '서버 연결을 확인하고 있어요' });
    expect(dialog.closest('[data-ui="renewal"]')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '복구 대기 닫기' }));
    expect(screen.getByRole('button', { name: '다시 확인' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '화면으로 돌아가기' }));
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(getApiRecoveryState()).toEqual({ status: 'idle' });
  });

  it('녹음 중에는 녹음 화면을 가리지 않는 위쪽 배너로 보인다', async () => {
    renderAt('/meetings/session-1/recording');
    void recoverBackendAvailability(down);
    expect(await screen.findByText('서버 연결을 확인하고 있어요. 녹음은 계속됩니다.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '복구 대기 닫기' }));
    await act(async () => {});
    expect(screen.queryByText('서버 연결을 확인하고 있어요. 녹음은 계속됩니다.')).toBeNull();
  });
});
