import type { ReactNode } from 'react';
import { cn } from '../cn';
import { CanvasWaves } from '../art/CanvasWaves';
import { RENEWAL_ROOT_CLASS } from '../renewalRoot';

export interface AppCanvasProps {
  /** 바탕 물결 모양. auth: 인증 화면 / app: 앱 틀 */
  waves?: 'auth' | 'app';
  className?: string;
  children: ReactNode;
}

/**
 * 리뉴얼 화면의 가장 바깥 요소 (시안 적용 기준 4.3, S-10).
 * data-ui="renewal"로 Tailwind 초기화·기본 규칙의 범위를 정하고, 바탕 그라데이션과 물결을 그린다.
 * 바탕 그라데이션은 이 컴포넌트에서만 쓴다(CLAUDE.md).
 */
export function AppCanvas({ waves = 'app', className, children }: AppCanvasProps) {
  return (
    <div
      data-ui="renewal"
      className={cn(
        RENEWAL_ROOT_CLASS,
        'relative isolate min-h-dvh overflow-x-hidden bg-linear-to-br from-canvas-start via-canvas-mid to-canvas-end',
        className,
      )}
    >
      <CanvasWaves variant={waves} className="-z-10" />
      {children}
    </div>
  );
}
