import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CanvasWaves, Logo, MailCodeIllustration, RecordToMinutesIllustration, Waveform } from '../index';

afterEach(cleanup);

describe('그림 부품', () => {
  it('로고는 이름 있는 그림으로 읽히고 제품 이름을 붙일 수 있다', () => {
    render(<Logo withProduct />);
    expect(screen.getByRole('img', { name: 'Downforce' })).toBeTruthy();
    expect(screen.getByText('Minutes')).toBeTruthy();
  });

  it('같은 화면에 로고가 둘이어도 그라데이션 id가 겹치지 않는다', () => {
    const { container } = render(
      <>
        <Logo />
        <Logo />
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('장식 그림은 화면 읽기에서 숨긴다', () => {
    const { container } = render(
      <>
        <CanvasWaves />
        <Waveform />
        <RecordToMinutesIllustration />
        <MailCodeIllustration />
      </>,
    );
    const svgs = [...container.querySelectorAll('svg')];
    expect(svgs).toHaveLength(4);
    for (const svg of svgs) expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('색은 hex 값이 아니라 토큰 클래스로 칠한다', () => {
    const { container } = render(
      <>
        <Logo />
        <CanvasWaves />
        <RecordToMinutesIllustration />
        <MailCodeIllustration />
      </>,
    );
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{6}/i);
  });
});
