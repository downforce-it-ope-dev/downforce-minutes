import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, Dialog, ToastProvider, useToast } from './index';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function DialogHarness({ dismissible = true }: { dismissible?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>메일 설정</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="메일 설정"
        description="인증 코드를 보낼 Gmail을 연결합니다."
        dismissible={dismissible}
        footer={<Button onClick={() => setOpen(false)}>저장</Button>}
      >
        <label>
          발신 주소 <input />
        </label>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('열면 제목·설명이 이름과 설명으로 연결된 대화상자가 된다', () => {
    render(<DialogHarness />);
    fireEvent.click(screen.getByRole('button', { name: '메일 설정' }));
    const dialog = screen.getByRole('dialog', { name: '메일 설정' });
    const describedBy = dialog.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.textContent).toBe('인증 코드를 보낼 Gmail을 연결합니다.');
  });

  it('Portal 바깥 요소에 리뉴얼 영역 표시를 붙인다', () => {
    render(<DialogHarness />);
    fireEvent.click(screen.getByRole('button', { name: '메일 설정' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('data-ui')).toBe('renewal');
    expect(dialog.parentElement?.getAttribute('data-ui')).toBe('renewal');
  });

  it('Esc와 닫기 버튼으로 닫힌다', () => {
    render(<DialogHarness />);
    fireEvent.click(screen.getByRole('button', { name: '메일 설정' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '메일 설정' }));
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('닫을 수 없게 하면 닫기 버튼이 없고 Esc로도 닫히지 않는다', () => {
    render(<DialogHarness dismissible={false} />);
    fireEvent.click(screen.getByRole('button', { name: '메일 설정' }));
    expect(screen.queryByRole('button', { name: '닫기' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

function ToastHarness({ onUndo }: { onUndo?: () => void }) {
  const show = useToast();
  return (
    <>
      <Button onClick={() => show({ message: '새 인증 코드를 보냈습니다.', tone: 'success' })}>재발송</Button>
      <Button onClick={() => show({ message: '화자 A를 홍길동으로 지정했습니다.', action: onUndo && { label: '되돌리기', onClick: onUndo } })}>
        지정
      </Button>
    </>
  );
}

describe('Toast', () => {
  it('알림 영역에 문구를 보이고 시간이 지나면 사라진다', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '재발송' }));
    const region = screen.getByRole('status');
    expect(region.textContent).toContain('새 인증 코드를 보냈습니다.');
    expect(region.closest('[data-ui="renewal"]')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(region.textContent).toBe('');
  });

  it('동작 버튼을 누르면 동작을 부르고 닫힌다', () => {
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <ToastHarness onUndo={onUndo} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '지정' }));
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('Provider 밖에서 쓰면 알 수 있는 오류를 낸다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ToastHarness />)).toThrow('ToastProvider');
    spy.mockRestore();
  });
});
