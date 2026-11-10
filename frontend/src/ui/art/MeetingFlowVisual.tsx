import { ArrowRight, Check, Mic, Sparkles } from 'lucide-react';
import { cn } from '../cn';
import { Icon } from '../Icon';
import { Waveform } from './Waveform';

/**
 * 홈 안내 패널 그림 (HOME-01, 시안 "DOWNFORCE 회의록 대시보드" 위쪽).
 * 양옆 파형이 있는 분홍 마이크 원 → 화살표 → 체크 줄이 있는 회의록 카드 + AI 배지. 장식이라 화면 읽기에서 숨긴다.
 */
export function MeetingFlowVisual({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('flex items-center justify-center gap-3 tablet-lg:gap-6', className)}>
      <span className="h-12 text-lavender-400 tablet-lg:h-14">
        <Waveform bars={5} />
      </span>
      {/* 마이크: 연분홍 빛 번짐 + 분홍 원 */}
      <span className="flex size-32 shrink-0 items-center justify-center rounded-full bg-pink-100 tablet-lg:size-40">
        <span className="flex size-24 items-center justify-center rounded-full bg-pink-200 tablet-lg:size-30">
          <span className="flex size-18 items-center justify-center rounded-full bg-linear-to-br from-pink-400 to-pink-600 text-white shadow-primary tablet-lg:size-22">
            <Icon icon={Mic} size="xl" />
          </span>
        </span>
      </span>
      <span className="h-12 text-lavender-400 tablet-lg:h-14">
        <Waveform bars={5} />
      </span>
      <Icon icon={ArrowRight} size="xl" className="mx-2 shrink-0 text-lavender-500" />
      {/* 회의록 카드 + AI 배지 */}
      <span className="relative mt-6 shrink-0">
        <span className="flex w-40 -rotate-3 flex-col gap-3 rounded-xl bg-bg p-5 shadow-card tablet-lg:w-48">
          <span className="h-2.5 w-3/4 rounded-full bg-lavender-200" />
          {[0, 1, 2].map((row) => (
            <span key={row} className="flex items-center gap-2">
              <Icon icon={Check} size="md" className="shrink-0 text-lavender-500" />
              <span className={cn('h-2 rounded-full bg-lavender-100', row === 2 ? 'w-2/3' : 'w-full')} />
            </span>
          ))}
        </span>
        <span className="absolute -top-6 -right-6 flex rotate-6 items-center gap-1 rounded-lg bg-linear-to-br from-lavender-400 to-lavender-600 px-3 py-1.5 text-title text-white italic shadow-card">
          <Icon icon={Sparkles} size="sm" />
          AI
        </span>
      </span>
    </div>
  );
}
