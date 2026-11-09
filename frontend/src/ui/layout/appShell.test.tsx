import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';
import { DocumentStatusChip } from '../DocumentStatusChip';

afterEach(cleanup);

function renderAt(path: string, focus = false) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <AppShell title="화면" focus={focus} back={focus ? { to: '/settings' } : undefined} actions={<DocumentStatusChip status="attention" />}>
              <p>본문</p>
            </AppShell>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const current = () =>
  screen
    .getByRole('navigation', { name: '주 메뉴' })
    .querySelectorAll('[aria-current="page"]');

describe('앱 틀 (CMN-01, #17)', () => {
  it('현재 경로의 메뉴만 선택 표시한다. 홈은 정확히 / 일 때만', () => {
    renderAt('/meetings/abc');
    expect([...current()].map((link) => link.textContent)).toEqual(['회의록']);
    cleanup();
    renderAt('/');
    expect([...current()].map((link) => link.textContent)).toEqual(['홈']);
  });

  it('메뉴 4개와 홈 로고 링크, 본문 건너뛰기, 제목(h1)을 둔다', () => {
    renderAt('/settings');
    const links = screen.getByRole('navigation', { name: '주 메뉴' }).querySelectorAll('li a');
    expect([...links].map((link) => link.textContent)).toEqual(['홈', '회의록', '참석자', '설정']);
    expect(screen.getByRole('link', { name: '홈으로' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '본문으로 건너뛰기' }).getAttribute('href')).toBe('#main-content');
    expect(screen.getByRole('heading', { level: 1, name: '화면' })).toBeTruthy();
    expect(screen.getByText('점검 필요')).toBeTruthy();
  });

  it('집중 모드는 메뉴와 상단 바 동작을 숨기고 뒤로 가기만 둔다', () => {
    renderAt('/settings/document', true);
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    expect(screen.queryByText('점검 필요')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '뒤로 가기' }));
    expect(screen.getByRole('heading', { level: 1, name: '화면' })).toBeTruthy();
  });
});
