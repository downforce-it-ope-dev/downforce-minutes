import { cn } from '../cn';

/** 막대 높이(0~1) — 시안의 음성 파형 모양 */
const BARS = [0.3, 0.6, 1, 0.5, 0.85, 0.55, 0.3, 0.7, 0.4, 0.55];

export interface WaveformProps {
  /** 막대 수 (최대 10) */
  bars?: number;
  /** 막대 색. 토큰 fill 클래스 (기본: 글자색) */
  colorClassName?: string;
  className?: string;
}

/** 음성 파형 장식 (시안 적용 기준 4.2). 실제 마이크 입력 표시(MTG-02)와는 별개의 정적 그림이다 */
export function Waveform({ bars = 10, colorClassName = 'fill-current', className }: WaveformProps) {
  const heights = BARS.slice(0, Math.max(1, Math.min(BARS.length, bars)));
  const width = heights.length * 12 - 6;
  return (
    <svg aria-hidden="true" focusable="false" viewBox={`0 0 ${width} 60`} className={cn('h-full w-auto', className)}>
      {heights.map((height, index) => {
        const barHeight = Math.round(height * 56);
        return (
          <rect
            key={index}
            x={index * 12}
            y={(60 - barHeight) / 2}
            width="6"
            height={barHeight}
            rx="3"
            className={colorClassName}
          />
        );
      })}
    </svg>
  );
}
