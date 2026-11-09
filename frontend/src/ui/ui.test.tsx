import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArrowRight, Mail } from 'lucide-react';
import { Banner, Button, Card, Icon, IconButton, OtpInput, Pill, ProgressBar, TextField } from './index';

afterEach(cleanup);

describe('Icon', () => {
  it('레이블이 없으면 장식으로 보고 화면 읽기에서 숨긴다', () => {
    const { container } = render(<Icon icon={Mail} />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('레이블이 있으면 이름 있는 그림으로 읽힌다', () => {
    render(<Icon icon={Mail} label="메일" />);
    expect(screen.getByRole('img', { name: '메일' })).toBeTruthy();
  });
});

describe('Button', () => {
  it('누르면 onClick을 부른다', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>인증 코드 받기</Button>);
    fireEvent.click(screen.getByRole('button', { name: '인증 코드 받기' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('비활성이면 초점은 받되 aria-disabled로 알리고 동작하지 않는다', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>확인</Button>);
    const button = screen.getByRole('button', { name: '확인' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('비활성 submit 버튼은 폼을 제출하지 않는다', () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" disabled>
          확인
        </Button>
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('처리 중이면 aria-busy를 켜고 누를 수 없다', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        보내는 중…
      </Button>,
    );
    const button = screen.getByRole('button', { name: '보내는 중…' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('IconButton', () => {
  it('아이콘만 있어도 레이블로 이름이 붙는다', () => {
    render(<IconButton icon={ArrowRight} label="인증 코드 받기" variant="primary" />);
    expect(screen.getByRole('button', { name: '인증 코드 받기' })).toBeTruthy();
  });
});

describe('TextField', () => {
  it('이름표와 입력란이 연결되고 도움말·오류가 설명으로 연결된다', () => {
    render(<TextField label="회사 이메일" help="회사 메일(@miinit.com)만 쓸 수 있습니다." error="올바른 이메일 주소를 입력해 주세요." icon={Mail} />);
    const input = screen.getByLabelText('회사 이메일');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = (input.getAttribute('aria-describedby') ?? '').split(' ');
    const texts = described.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toContain('회사 메일(@miinit.com)만 쓸 수 있습니다.');
    expect(texts).toContain('올바른 이메일 주소를 입력해 주세요.');
  });

  it('오류가 없으면 aria-invalid를 두지 않는다', () => {
    render(<TextField label="이름" />);
    expect(screen.getByLabelText('이름').hasAttribute('aria-invalid')).toBe(false);
  });
});

function OtpHarness({ onComplete }: { onComplete?: (value: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <>
      <OtpInput label="인증 코드 6자리" value={value} onChange={setValue} onComplete={onComplete} />
      <output data-testid="otp-value">{value}</output>
    </>
  );
}

describe('OtpInput', () => {
  const cell = (n: number) => screen.getByRole('textbox', { name: `${n}번째 자리` }) as HTMLInputElement;
  const current = () => screen.getByTestId('otp-value').textContent;

  it('그룹 이름과 6칸이 있고 첫 칸은 자동 채우기를 받는다', () => {
    render(<OtpHarness />);
    expect(screen.getByRole('group', { name: '인증 코드 6자리' })).toBeTruthy();
    expect(screen.getAllByRole('textbox')).toHaveLength(6);
    expect(cell(1).getAttribute('autocomplete')).toBe('one-time-code');
    expect(cell(1).getAttribute('inputmode')).toBe('numeric');
  });

  it('숫자를 입력하면 다음 칸으로 넘어가고 숫자가 아닌 글자는 무시한다', () => {
    render(<OtpHarness />);
    fireEvent.change(cell(1), { target: { value: '4' } });
    expect(current()).toBe('4');
    expect(document.activeElement).toBe(cell(2));
    fireEvent.change(cell(2), { target: { value: 'a' } });
    expect(current()).toBe('4');
  });

  it('붙여넣은 코드를 칸에 나눠 넣고 다 채우면 onComplete를 부른다', () => {
    const onComplete = vi.fn();
    render(<OtpHarness onComplete={onComplete} />);
    fireEvent.paste(cell(1), { clipboardData: { getData: () => '12 34-56' } });
    expect(current()).toBe('123456');
    expect(cell(6).value).toBe('6');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('빈 칸에서 지우기를 누르면 앞 칸 숫자를 지우고 앞 칸으로 간다', () => {
    render(<OtpHarness />);
    fireEvent.paste(cell(1), { clipboardData: { getData: () => '12' } });
    expect(document.activeElement).toBe(cell(3));
    fireEvent.keyDown(cell(3), { key: 'Backspace' });
    expect(current()).toBe('1');
    expect(document.activeElement).toBe(cell(2));
  });

  it('가운데 칸을 고쳐도 뒤 칸 숫자는 그대로 둔다', () => {
    render(<OtpHarness />);
    fireEvent.paste(cell(1), { clipboardData: { getData: () => '123' } });
    fireEvent.change(cell(2), { target: { value: '29' } });
    expect(current()).toBe('193');
  });
});

describe('ProgressBar', () => {
  it('값을 progressbar 속성으로 알린다', () => {
    render(<ProgressBar label="남은 시간" value={272} max={300} valueText="4분 32초 남음" />);
    const bar = screen.getByRole('progressbar', { name: '남은 시간' });
    expect(bar.getAttribute('aria-valuenow')).toBe('272');
    expect(bar.getAttribute('aria-valuemax')).toBe('300');
    expect(bar.getAttribute('aria-valuetext')).toBe('4분 32초 남음');
  });
});

describe('Banner', () => {
  it('오류는 alert, 그 밖은 status로 알린다', () => {
    render(
      <>
        <Banner tone="danger">인증 코드를 보내지 못했습니다.</Banner>
        <Banner tone="info">로그인이 만료되었습니다.</Banner>
      </>,
    );
    expect(screen.getByRole('alert').textContent).toContain('인증 코드를 보내지 못했습니다.');
    expect(screen.getByRole('status').textContent).toContain('로그인이 만료되었습니다.');
  });
});

describe('Card · Pill', () => {
  it('지정한 태그로 그리고 내용을 보인다', () => {
    render(
      <Card as="section" aria-label="최근 회의">
        <Pill>
          남은 시도 <Pill.Strong>5회</Pill.Strong>
        </Pill>
      </Card>,
    );
    expect(screen.getByRole('region', { name: '최근 회의' }).textContent).toContain('남은 시도 5회');
  });
});
