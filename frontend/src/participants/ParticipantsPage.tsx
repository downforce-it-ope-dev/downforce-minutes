import { useCallback, useEffect, useState } from 'react';
import { FileUp, RefreshCw, Search, Trash2, UserPlus, X } from 'lucide-react';
import { AccountButton, SidebarAccount } from '../auth/AccountMenu';
import { listParticipants, peekParticipants, rememberParticipants, type Participant } from '../participantsApi';
import { AppShell, BottomDock, Button, Card, IconButton, SelectField, TextField, useToast } from '../ui';
import { CsvImportDialog } from './CsvImportDialog';
import { DeleteParticipantDialog, ParticipantFormDialog, type ParticipantFormTarget } from './ParticipantDialogs';
import { filterParticipants, hasTeamField, NO_TEAM, sortParticipants, teamNames } from './participantRules';

/*
 * PTC-01 참석자 관리 (GitHub #36, docs/renewal/화면기획/PTC-01_참석자관리.md). 경로 /participants, /settings/participants.
 * - 회의록 목록과 같은 틀: 위쪽 넓은 검색창(이름·이메일·팀) + 팀 거르기, 그 아래 전체 폭 목록, 하단 가운데 "참석자 추가"
 * - 목록 행: 아바타(이름 첫 글자) + 이름(+ 팀 배지) / 이메일. 태블릿 이상은 한 줄 가로 배치. 행을 누르면 수정, 행 끝 삭제
 * - 추가·수정(P01)과 삭제 확인(P02)은 대화상자(휴대폰 하단 시트). 편집 패널(2단)은 두지 않는다
 * - 팀(배지·거르기·입력)은 응답에 team이 있을 때만(Backend 팀 확장 #35 뒤) 보인다
 * - CSV 일괄 등록(P03, #37)은 검색창 옆 원형 버튼 → 대화상자
 * - 결과·오류는 토스트(S-13)
 */

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: Participant[] };

export function ParticipantsPage() {
  const [target, setTarget] = useState<ParticipantFormTarget | null>(null);
  return (
    <AppShell
      title="참석자"
      account={<SidebarAccount />}
      toastPlacement="top"
      actions={
        <span className="tablet-lg:hidden">
          <AccountButton />
        </span>
      }
    >
      <ParticipantsBody target={target} setTarget={setTarget} />
      <BottomDock>
        <Button variant="hero" icon={UserPlus} className="w-full" onClick={() => setTarget({ mode: 'create' })}>
          참석자 추가
        </Button>
      </BottomDock>
    </AppShell>
  );
}

function ParticipantsBody({ target, setTarget }: { target: ParticipantFormTarget | null; setTarget: (target: ParticipantFormTarget | null) => void }) {
  const toast = useToast();
  // 이미 받아 둔 목록이 있으면 바로 보이고 뒤에서 새로 받는다(로딩 개선 2026-11-12)
  const [load, setLoad] = useState<Load>(() => {
    const cached = peekParticipants();
    return cached ? { status: 'ready', data: cached } : { status: 'loading' };
  });
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [team, setTeam] = useState('');
  const [toDelete, setToDelete] = useState<Participant | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let live = true;
    listParticipants()
      .then((items) => live && setLoad({ status: 'ready', data: items }))
      .catch(() => {
        if (!live) return;
        setLoad((current) => (current.status === 'ready' ? current : { status: 'error' }));
        if (attempt > 0) toast({ message: '참석자 목록을 불러오지 못했습니다', tone: 'danger' });
      });
    return () => {
      live = false;
    };
  }, [attempt, toast]);

  const roster = load.status === 'ready' ? load.data : [];
  const teamEnabled = hasTeamField(roster);
  const teams = teamEnabled ? teamNames(roster) : [];
  const visible = sortParticipants(filterParticipants(roster, query, teamEnabled ? team : ''));

  const replace = (next: Participant[]) => {
    rememberParticipants(next);
    setLoad({ status: 'ready', data: next });
  };

  return (
    <div className="flex flex-col gap-4 tablet:gap-6">
      <div role="search" aria-label="참석자 검색 조건" className="flex flex-col gap-2 tablet:flex-row tablet:items-center tablet:gap-3">
        <TextField
          label="참석자 검색"
          hideLabel
          type="search"
          shape="pill"
          icon={Search}
          placeholder={teamEnabled ? '이름·이메일·팀' : '이름·이메일'}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1"
          inside={query && <IconButton icon={X} label="검색어 지우기" onClick={() => setQuery('')} />}
        />
        {teamEnabled && (
          <SelectField label="팀" hideLabel value={team} onChange={(event) => setTeam(event.target.value)} className="tablet:w-56">
            <option value="">모든 팀</option>
            {teams.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
            <option value={NO_TEAM}>팀 없음</option>
          </SelectField>
        )}
        {/* CSV 일괄 등록 (P03, #37) */}
        <IconButton icon={FileUp} label="CSV로 일괄 등록" variant="surface" className="self-end tablet:self-auto" aria-haspopup="dialog" onClick={() => setCsvOpen(true)} />
      </div>

      <section aria-label="참석자" className="flex flex-col gap-3">
        {load.status === 'loading' && <ListSkeleton />}
        {load.status === 'error' && (
          <Card className="flex flex-col items-start gap-4 tablet:flex-row tablet:items-center">
            <p className="flex-1 text-body text-text">참석자 목록을 불러오지 못했습니다</p>
            <Button variant="secondary" shape="pill" icon={RefreshCw} onClick={reload}>
              다시 시도
            </Button>
          </Card>
        )}
        {load.status === 'ready' && roster.length === 0 && (
          <Card className="py-10 text-center text-body text-text-muted">등록된 참석자가 없습니다</Card>
        )}
        {load.status === 'ready' && roster.length > 0 && (
          <>
            <p aria-live="polite" className="px-1 text-caption text-text-muted tabular-nums">
              참석자 {visible.length}명
            </p>
            {visible.length === 0 ? (
              <Card className="flex flex-col items-center gap-4 py-10">
                <p className="text-body text-text-muted">검색 결과 없음</p>
                <Button
                  size="sm"
                  variant="secondary"
                  shape="pill"
                  onClick={() => {
                    setQuery('');
                    setTeam('');
                  }}
                >
                  검색어 지우기
                </Button>
              </Card>
            ) : (
              <Rows people={visible} teamEnabled={teamEnabled} onEdit={(participant) => setTarget({ mode: 'edit', participant })} onDelete={setToDelete} />
            )}
          </>
        )}
      </section>

      <ParticipantFormDialog
        target={target}
        teamEnabled={teamEnabled}
        teams={teams}
        onClose={() => setTarget(null)}
        onReload={reload}
        onDelete={(participant) => {
          setTarget(null);
          setToDelete(participant);
        }}
        onSaved={(saved, mode) => {
          replace(mode === 'create' ? [...roster, saved] : roster.map((person) => (person.id === saved.id ? saved : person)));
          setTarget(null);
          toast({ message: mode === 'create' ? '참석자를 추가했습니다' : '참석자를 수정했습니다', tone: 'success' });
        }}
      />
      <CsvImportDialog
        open={csvOpen}
        onClose={({ created, renamed }) => {
          setCsvOpen(false);
          if (created.length + renamed.length === 0) return;
          // 다시 불러오지 않고 서버 응답을 목록에 바로 반영한다. 문서 서비스 조회는 방금 등록한 참석자를 늦게 보여 줄 수 있다
          const changed = new Map([...created, ...renamed].map((person) => [person.id, person]));
          replace([...roster.map((person) => changed.get(person.id) ?? person), ...created.filter((person) => !roster.some(({ id }) => id === person.id))]);
          toast({
            message: renamed.length ? `참석자 ${created.length}명을 등록하고 ${renamed.length}명의 이름을 갱신했습니다` : `참석자 ${created.length}명을 등록했습니다`,
            tone: 'success',
          });
        }}
      />
      <DeleteParticipantDialog
        participant={toDelete}
        onClose={() => setToDelete(null)}
        onReload={() => {
          setToDelete(null);
          reload();
        }}
        onDeleted={(removed) => {
          replace(roster.filter((person) => person.id !== removed.id));
          setToDelete(null);
          toast({ message: '참석자를 삭제했습니다', tone: 'success' });
        }}
      />
    </div>
  );
}

/**
 * 참석자 행. 휴대폰: 2줄 72(이름 + 팀 / 이메일). 태블릿 이상: 한 줄 60(이름 + 팀 | 이메일).
 * 행(이름 부분)을 누르면 수정, 끝의 휴지통은 삭제 확인. 두 동작 모두 항상 보인다(hover 없음)
 */
function Rows({
  people,
  teamEnabled,
  onEdit,
  onDelete,
}: {
  people: readonly Participant[];
  teamEnabled: boolean;
  onEdit: (participant: Participant) => void;
  onDelete: (participant: Participant) => void;
}) {
  return (
    <Card as="div" padding="none" className="overflow-hidden">
      <ul aria-label="참석자 목록">
        {people.map((person) => (
          <li key={person.id} className="flex items-center gap-2 border-b border-border pr-2 last:border-b-0 tablet:pr-3">
            <button
              type="button"
              aria-label={`${person.name} 수정`}
              onClick={() => onEdit(person)}
              className="flex min-h-18 min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-3 text-left active:bg-selected tablet:min-h-15 tablet:gap-4 tablet:px-5 tablet:py-2"
            >
              <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-label text-accent-soft-text">
                {person.name.trim().charAt(0)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1 tablet:flex-row tablet:items-center tablet:gap-4">
                <span className="flex min-w-0 items-center gap-2 tablet:flex-1">
                  <span className="truncate text-label text-text">{person.name}</span>
                  {teamEnabled && person.team?.trim() && (
                    <span className="shrink-0 rounded-sm bg-accent-soft px-2 py-0.5 text-caption text-accent-soft-text">{person.team.trim()}</span>
                  )}
                </span>
                <span className="truncate text-caption text-text-muted tablet:w-72 tablet:shrink-0 tablet:text-body">{person.email}</span>
              </span>
            </button>
            <IconButton icon={Trash2} label={`${person.name} 삭제`} variant="danger" onClick={() => onDelete(person)} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <Card as="div" padding="none" aria-busy="true" aria-label="참석자 목록 불러오는 중">
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="flex h-18 items-center gap-3 border-b border-border px-4 last:border-b-0 tablet:h-15 tablet:px-5">
          <span className="size-10 shrink-0 animate-pulse rounded-full bg-bg-subtle motion-reduce:animate-none" />
          <span className="h-3 w-1/3 animate-pulse rounded-full bg-bg-subtle motion-reduce:animate-none" />
        </div>
      ))}
    </Card>
  );
}
