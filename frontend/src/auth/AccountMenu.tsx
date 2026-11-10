import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CircleUserRound, LogOut } from 'lucide-react';
import { Button, Dialog, Icon, IconButton } from '../ui';
import { clearAccountEmail, loadAccountEmail } from './accountEmail';
import { logout } from './authApi';

/** 로그아웃 확인 (CMN-01-P02) → 세션 삭제 → 로그인 화면. 뒤로 가기로 돌아와도 진입 보호가 로그인으로 보낸다 */
function useLogout() {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    await logout();
    clearAccountEmail();
    setBusy(false);
    setConfirming(false);
    navigate('/login', { replace: true });
  }
  const dialog = (
    <Dialog
      open={confirming}
      onOpenChange={(open) => !busy && setConfirming(open)}
      title="로그아웃할까요?"
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" size="lg" shape="pill" disabled={busy} onClick={() => setConfirming(false)}>
            취소
          </Button>
          <Button size="lg" shape="pill" icon={LogOut} loading={busy} onClick={() => void run()}>
            로그아웃
          </Button>
        </>
      }
    />
  );
  return { open: () => setConfirming(true), dialog };
}

/** 사이드바 아래 계정 (tablet-lg). 이메일 + 로그아웃을 바로 보인다(시안) */
export function SidebarAccount() {
  const email = loadAccountEmail();
  const { open, dialog } = useLogout();
  return (
    <div className="flex flex-col gap-2">
      <p className="flex min-w-0 items-center gap-2 text-label text-text">
        <Icon icon={CircleUserRound} size="lg" className="shrink-0 text-text-muted" />
        <span className="truncate">{email ?? '로그인됨'}</span>
      </p>
      <Button variant="ghost" icon={LogOut} className="justify-start px-2" onClick={open}>
        로그아웃
      </Button>
      {dialog}
    </div>
  );
}

/** 레일·휴대폰의 계정 버튼 (상단 바). 누르면 이메일과 로그아웃 */
export function AccountButton() {
  const email = loadAccountEmail();
  const [menu, setMenu] = useState(false);
  const { open, dialog } = useLogout();
  return (
    <>
      <IconButton icon={CircleUserRound} label="계정" variant="surface" aria-haspopup="dialog" onClick={() => setMenu(true)} />
      <Dialog open={menu} onOpenChange={setMenu} title="계정">
        <div className="flex flex-col gap-4">
          <p className="flex min-w-0 items-center gap-2 text-body text-text">
            <Icon icon={CircleUserRound} size="lg" className="shrink-0 text-text-muted" />
            <span className="truncate">{email ?? '로그인됨'}</span>
          </p>
          <Button
            size="lg"
            shape="pill"
            variant="secondary"
            icon={LogOut}
            fullWidth
            onClick={() => {
              setMenu(false);
              open();
            }}
          >
            로그아웃
          </Button>
        </div>
      </Dialog>
      {dialog}
    </>
  );
}
