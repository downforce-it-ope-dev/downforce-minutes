import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Send, Trash2 } from 'lucide-react';
import { deleteEmailSettings, EmailSettingsApiError, getEmailSettings, restoreEmailSettings, saveEmailSettings, sendTestEmail, verifyEmailConnection, type EmailSettings } from '../emailSettingsApi';
import type { StoredEmailSettings } from '../emailSettingsStorage';
import type { IntegrationState } from '../settingsApi';
import { Button, Card, Dialog, TextField, useToast } from '../ui';
import { CardHeading } from './CardHeading';

/*
 * SET-01 이메일 카드 (F02~F04, F08, F09).
 * - 설정됨: 발신 주소만 보이고 "시험 메일 · 수정 · 삭제"(클라이언트 ID·보안 키·연결 토큰은 수정할 때만, 2026-11-12)
 * - 설정 전·수정: 입력 4개(모두 필수, 앞뒤 공백 제거) + "저장"(수정이면 "취소"). 저장하면 바로 연결을 시험한다
 * - 삭제는 확인 대화상자를 거친다. 서버 설정이 비어 있으면 브라우저에 보관한 값으로 복구한다(D-09, restoreEmailSettings)
 * - 결과·오류는 토스트, 빈 입력은 테두리(S-13)
 */

type Field = keyof StoredEmailSettings;
const FIELDS: ReadonlyArray<{ key: Field; label: string; secret: boolean }> = [
  { key: 'senderAddress', label: '발신 이메일 주소', secret: false },
  { key: 'clientId', label: 'Google 클라이언트 ID', secret: true },
  { key: 'clientSecret', label: '클라이언트 보안 키', secret: true },
  { key: 'refreshToken', label: '연결 토큰', secret: true },
];
const EMPTY: StoredEmailSettings = { senderAddress: '', clientId: '', clientSecret: '', refreshToken: '' };

const message = (error: unknown, fallback: string) => (error instanceof EmailSettingsApiError || error instanceof Error ? error.message : fallback);

export function EmailCard({ state, refreshKey, onChanged }: { state?: IntegrationState; refreshKey: number; onChanged: () => void }) {
  const toast = useToast();
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<StoredEmailSettings>(EMPTY);
  const [missing, setMissing] = useState<Set<Field>>(new Set());
  const [busy, setBusy] = useState<'save' | 'test' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let live = true;
    restoreEmailSettings()
      .then((current) => {
        if (!live) return;
        setSettings(current);
        setEditing(!current.configured);
      })
      .catch((error: unknown) => {
        if (!live) return;
        toast({ message: message(error, '이메일 설정을 불러오지 못했습니다'), tone: 'danger' });
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [refreshKey, toast]);

  const startEdit = () => {
    setForm(EMPTY);
    setMissing(new Set());
    setEditing(true);
  };

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const trimmed = Object.fromEntries(FIELDS.map(({ key }) => [key, form[key].trim()])) as StoredEmailSettings;
    const empty = new Set(FIELDS.filter(({ key }) => !trimmed[key]).map(({ key }) => key));
    setMissing(empty);
    if (empty.size) {
      toast({ message: '모든 항목을 입력해 주세요', tone: 'danger' });
      return;
    }
    setBusy('save');
    try {
      setSettings(await saveEmailSettings(trimmed));
    } catch (error) {
      toast({ message: message(error, '이메일 설정을 저장하지 못했습니다'), tone: 'danger' });
      setBusy(null);
      return;
    }
    setForm(EMPTY);
    setEditing(false);
    // 저장한 값은 유지하고 연결만 시험한다(F03)
    try {
      const result = await verifyEmailConnection();
      if (!result.connected) throw new Error(result.message || 'Google 메일 연결을 확인하지 못했습니다');
      toast({ message: '저장하고 연결을 확인했습니다', tone: 'success' });
    } catch (error) {
      toast({ message: message(error, 'Google 메일 연결을 확인하지 못했습니다'), tone: 'danger' });
    }
    try {
      setSettings(await getEmailSettings());
    } catch {
      // 저장한 요약을 그대로 둔다
    }
    setBusy(null);
    onChanged();
  }

  async function test() {
    if (busy) return;
    setBusy('test');
    try {
      const result = await sendTestEmail();
      if (!result.sent) throw new Error(result.message || '시험 메일을 보내지 못했습니다');
      toast({ message: `${settings?.senderAddress ?? '발신 주소'}로 시험 메일을 보냈습니다`, tone: 'success' });
    } catch (error) {
      toast({ message: message(error, '시험 메일을 보내지 못했습니다'), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('delete');
    try {
      setSettings(await deleteEmailSettings());
      setConfirmDelete(false);
      startEdit();
      toast({ message: '이메일 설정을 삭제했습니다', tone: 'success' });
      onChanged();
    } catch (error) {
      toast({ message: message(error, '이메일 설정을 삭제하지 못했습니다'), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card as="section" aria-labelledby="settings-email" aria-busy={loading || undefined} className="flex flex-col gap-5">
      <CardHeading id="settings-email" title="이메일 (Gmail)" state={state} />
      {loading ? (
        <div className="flex flex-col gap-3" aria-hidden="true">
          {[0, 1, 2].map((row) => (
            <span key={row} className="h-4 animate-pulse rounded-full bg-bg-subtle motion-reduce:animate-none" />
          ))}
        </div>
      ) : editing ? (
        <form noValidate aria-label="이메일 설정" onSubmit={(event) => void save(event)} className="flex flex-col gap-4">
          {FIELDS.map(({ key, label, secret }) => (
            <TextField
              key={key}
              label={label}
              type={secret ? 'password' : 'email'}
              inputMode={secret ? undefined : 'email'}
              autoComplete={secret ? 'new-password' : 'email'}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={form[key]}
              invalid={missing.has(key)}
              disabled={busy === 'save'}
              onChange={(event) => {
                setForm((current) => ({ ...current, [key]: event.target.value }));
                setMissing((current) => {
                  const next = new Set(current);
                  next.delete(key);
                  return next;
                });
              }}
            />
          ))}
          <div className="flex flex-col-reverse gap-3 pt-1 tablet:flex-row tablet:justify-end">
            {settings?.configured && (
              <Button variant="secondary" shape="pill" disabled={busy === 'save'} onClick={() => setEditing(false)}>
                취소
              </Button>
            )}
            <Button type="submit" shape="pill" loading={busy === 'save'} className="tablet:min-w-32">
              {busy === 'save' ? '연결 확인 중…' : '저장'}
            </Button>
          </div>
        </form>
      ) : (
        <>
          {/* 보기에서는 발신 주소만(2026-11-12): 클라이언트 ID·보안 키·연결 토큰은 수정할 때만 입력란으로 보인다 */}
          <div className="flex flex-col gap-4 tablet:flex-row tablet:items-center">
          <dl className="flex min-w-0 flex-1 flex-col gap-0.5">
            <dt className="text-caption text-text-muted">발신 이메일 주소</dt>
            <dd className="min-w-0 text-title break-all text-text">{settings?.senderAddress || '-'}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" shape="pill" icon={Send} loading={busy === 'test'} disabled={busy !== null} onClick={() => void test()}>
              시험 메일
            </Button>
            <Button variant="secondary" shape="pill" icon={Pencil} disabled={busy !== null} onClick={startEdit}>
              수정
            </Button>
            <Button variant="danger-secondary" shape="pill" icon={Trash2} disabled={busy !== null} onClick={() => setConfirmDelete(true)}>
              삭제
            </Button>
          </div>
          </div>
        </>
      )}
      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="이메일 설정을 삭제하시겠습니까?"
        dismissible={busy !== 'delete'}
        footer={
          <>
            <Button variant="secondary" shape="pill" disabled={busy === 'delete'} onClick={() => setConfirmDelete(false)}>
              취소
            </Button>
            <Button variant="danger" shape="pill" icon={Trash2} loading={busy === 'delete'} onClick={() => void remove()}>
              삭제
            </Button>
          </>
        }
      >
        <p className="text-body text-text">{settings?.senderAddress}</p>
      </Dialog>
    </Card>
  );
}
