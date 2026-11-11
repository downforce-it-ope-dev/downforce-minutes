import type { InputHTMLAttributes, Ref } from 'react';
import { Check } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  ref?: Ref<HTMLInputElement>;
}

/**
 * 체크 상자 표시 24 (MTG-01 참석자 행). 이름표는 바깥 <label>이 맡고, 누르는 영역은 행 전체다.
 * 선택: 주 색 면 + 흰 체크 / 해제: 입력 테두리. 비활성이어도 선택 상태는 같은 모양으로 보인다(고정 선택).
 */
export function Checkbox({ className, ...rest }: CheckboxProps) {
  return (
    <span className={cn('relative inline-flex size-6 shrink-0', className)}>
      <input
        type="checkbox"
        {...rest}
        className="peer size-6 cursor-pointer appearance-none rounded-sm border-2 border-border-input bg-bg checked:border-primary checked:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
      />
      <span className="pointer-events-none absolute inset-0 hidden items-center justify-center text-white peer-checked:flex">
        <Icon icon={Check} size="md" />
      </span>
    </span>
  );
}
