import type { ReactNode } from 'react';
import { cn } from '../cn';
import { CanvasWaves } from '../art/CanvasWaves';
import { ROOT_TEXT_CLASS } from '../rootText';

export interface AppCanvasProps {
  /** 바탕 물결 모양. auth: 인증 화면 / app: 앱 틀 */
  waves?: 'auth' | 'app';
  className?: string;
  children: ReactNode;
}

/**
 * 화면의 가장 바깥 요소 (시안 적용 기준 4.3, S-10).
 * 바탕 그라데이션과 물결을 그리고, 화면 글자 기본값(ROOT_TEXT_CLASS)을 정한다.
 * 바탕 그라데이션은 이 컴포넌트에서만 쓴다(CLAUDE.md).
 */
export function AppCanvas({ waves = 'app', className, children }: AppCanvasProps) {
  return (
    <div
      className={cn(
        ROOT_TEXT_CLASS,
        'relative isolate min-h-dvh overflow-x-hidden bg-linear-to-br from-canvas-start via-canvas-mid to-canvas-end',
        className,
      )}
    >
      <CanvasWaves variant={waves} className="-z-10" />
      {children}
    </div>
  );
}
