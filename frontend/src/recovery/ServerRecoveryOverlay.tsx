import { useRef, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';
import * as RadixDialog from '@radix-ui/react-dialog';
import { RefreshCw, TriangleAlert, X } from 'lucide-react';
import { dismissApiRecovery, getApiRecoveryState, retryApiRecovery, subscribeApiRecovery } from '../apiRecovery';
import { Button, cn, Icon, IconButton, ROOT_TEXT_CLASS, ServerRecoveryIllustration } from '../ui';

const RECORDING_PATH = /^\/meetings\/[^/]+\/recording$/;

/**
 * 서버 연결 복구 (CMN-02, GitHub #18). 감지·재확인 로직은 기존 apiRecovery를 그대로 쓰고 표시만 바꾼다.
 * body 바로 아래 Portal이므로 가장 바깥에 글자 기본값(ROOT_TEXT_CLASS)을 붙인다.
 * - 화면 전체를 덮는다. 닫기·Esc·화면으로 돌아가기는 오버레이만 닫고 진행 중인 화면은 유지한다
 * - 녹음 중에는 녹음 화면을 가리지 않도록 위쪽 배너로 낮춰 보인다(녹음은 브라우저에 먼저 저장된다)
 * - 화면에는 제목·일러스트·버튼만 둔다(S-13)
 */
export function ServerRecoveryOverlay() {
  const state = useSyncExternalStore(subscribeApiRecovery, getApiRecoveryState, getApiRecoveryState);
  const { pathname } = useLocation();
  const visible = state.status !== 'idle' && state.visible;
  const ready = state.status === 'ready';
  if (!visible) return null;
  if (RECORDING_PATH.test(pathname)) return <RecordingBanner ready={ready} />;
  return <RecoveryDialog ready={ready} />;
}

function RecoveryDialog({ ready }: { ready: boolean }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const title = ready ? '서버가 다시 열렸어요' : '서버 연결을 확인하고 있어요';
  return (
    <RadixDialog.Root open onOpenChange={(open) => !open && dismissApiRecovery()}>
      <RadixDialog.Portal>
        {/* Overlay가 배경 스크롤을 잠근다 */}
        <RadixDialog.Overlay className={cn(ROOT_TEXT_CLASS, 'fixed inset-0 z-50 overflow-y-auto bg-bg')}>
          <RadixDialog.Content
            aria-describedby={undefined}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              closeRef.current?.focus();
            }}
            className={cn(ROOT_TEXT_CLASS, 'flex min-h-full flex-col pt-safe pb-safe outline-none')}
          >
            <div className="flex justify-end px-2 pt-2">
              <RadixDialog.Close asChild>
                <IconButton ref={closeRef} icon={X} label="복구 대기 닫기" />
              </RadixDialog.Close>
            </div>
            <div className="mx-auto flex w-full max-w-dialog flex-1 flex-col items-center justify-center gap-6 px-4 pb-6 text-center short:gap-4">
              <ServerRecoveryIllustration state={ready ? 'ready' : 'waiting'} className="w-30 short:hidden tablet:w-40" />
              <RadixDialog.Title className="text-headline text-text">{title}</RadixDialog.Title>
              {/* 제목이 바뀌면 화면 읽기 프로그램에 알린다 */}
              <span className="sr-only" aria-live="polite">
                {title}
              </span>
              {!ready && (
                <div className="mt-auto flex w-full flex-col gap-2 tablet:mt-0 tablet:flex-row-reverse tablet:justify-center short:mt-0">
                  <Button size="lg" icon={RefreshCw} onClick={retryApiRecovery} className="tablet:min-w-48">
                    다시 확인
                  </Button>
                  <RadixDialog.Close asChild>
                    <Button size="lg" variant="secondary" className="tablet:min-w-48">
                      화면으로 돌아가기
                    </Button>
                  </RadixDialog.Close>
                </div>
              )}
            </div>
          </RadixDialog.Content>
        </RadixDialog.Overlay>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** 녹음 중 연결 끊김: 녹음 화면 위쪽 배너 (CMN-02 5장) */
function RecordingBanner({ ready }: { ready: boolean }) {
  return (
    <div className={cn(ROOT_TEXT_CLASS, 'fixed inset-x-0 top-0 z-50 px-4 pt-safe')}>
      <div
        role="status"
        className={cn(
          'mx-auto mt-2 flex min-h-14 max-w-content items-center gap-3 rounded-lg py-2 pr-2 pl-4 shadow-overlay tablet:min-h-15',
          ready ? 'bg-success-soft text-success-text' : 'bg-warning-soft text-warning-text',
        )}
      >
        <Icon icon={TriangleAlert} size="lg" className="shrink-0" />
        <p className="flex-1 text-body break-keep">{ready ? '서버가 다시 열렸어요' : '서버 연결을 확인하고 있어요. 녹음은 계속됩니다.'}</p>
        {!ready && <IconButton icon={RefreshCw} label="다시 확인" onClick={retryApiRecovery} />}
        {!ready && <IconButton icon={X} label="복구 대기 닫기" onClick={dismissApiRecovery} />}
      </div>
    </div>
  );
}
