import { Button } from './Button';
import { Dialog } from './Dialog';

export interface LeaveConfirmDialogProps {
  open: boolean;
  /** 머무르기(닫기 포함) */
  onStay: () => void;
  onLeave: () => void;
}

/**
 * 페이지 이탈 확인 (CMN-01-P01). 녹음·처리 중이거나 저장하지 않은 내용이 있을 때 앱 안 이동을 확인한다.
 * 기본 초점은 머무르기. 새로고침·탭 닫기는 브라우저 기본 경고만 쓸 수 있다.
 */
export function LeaveConfirmDialog({ open, onStay, onLeave }: LeaveConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onStay()}
      title="저장하지 않은 내용이 사라집니다. 나갈까요?"
      footer={
        <>
          <Button variant="secondary" onClick={onLeave}>
            나가기
          </Button>
          <Button onClick={onStay} autoFocus>
            머무르기
          </Button>
        </>
      }
    />
  );
}
