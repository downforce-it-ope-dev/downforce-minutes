import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withHealthyBackend } from '../testUtils/withHealthyBackend';
import { ReviewRoute } from './ReviewPage';

const SESSION = 'review-1';

type Review = {
  sessionId: string;
  version: number;
  status: string;
  meeting: { participantIds: string[] };
  speakers: Array<{ speakerId: string; label: string; participantId: string | null; participantName?: string | null }>;
  transcript: Array<{ segmentId: string; speakerId: string; startMs: number; endMs: number; text: string }>;
  minutes: {
    templateId: string;
    templateVersion: string;
    summary: string;
    discussionPoints: string[];
    decisions: string[];
    actionItems: Array<{ ownerParticipantId: string | null; task: string; dueDate: string | null }>;
    followUps: string[];
  } | null;
  allowedActions: string[];
};

function baseReview(): Review {
  return {
    sessionId: SESSION,
    version: 7,
    status: 'REVIEW',
    meeting: { participantIds: ['p1', 'p2'] },
    speakers: [
      { speakerId: 'sa', label: 'Speaker A', participantId: 'p1', participantName: '홍길동' },
      { speakerId: 'sb', label: 'Speaker B', participantId: null },
    ],
    transcript: [
      { segmentId: 's1', speakerId: 'sa', startMs: 12_000, endMs: 20_000, text: '이번 주 배포 일정부터 정리하고 넘어갈게요.' },
      { segmentId: 's2', speakerId: 'sb', startMs: 25_000, endMs: 28_000, text: 'IAM 권한은 다음 주에 다시 보겠습니다.' },
      { segmentId: 's3', speakerId: 'sa', startMs: 40_000, endMs: 45_000, text: 'QA는 목요일까지 끝내는 걸로 하죠.' },
    ],
    minutes: {
      templateId: 'default.md',
      templateVersion: '1',
      summary: '배포 일정을 정했다.',
      discussionPoints: ['배포 일정'],
      decisions: ['목요일 QA 완료'],
      actionItems: [{ ownerParticipantId: 'p1', task: '배포 준비', dueDate: '2026-11-20' }],
      followUps: [],
    },
    allowedActions: ['UPDATE_SPEAKER_MAPPING', 'UPDATE_MINUTES', 'CONFIRM'],
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Handlers = {
  review?: () => Response | Promise<Response>;
  minutes?: (init: RequestInit) => Response | Promise<Response>;
  mappings?: (init: RequestInit) => Response | Promise<Response>;
  confirm?: (init: RequestInit) => Response | Promise<Response>;
  publish?: (init: RequestInit) => Response | Promise<Response>;
};

function mockApi(handlers: Handlers = {}) {
  let current = baseReview();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    const method = init.method ?? 'GET';
    if (path === `/api/v1/meeting-sessions/${SESSION}` && method === 'GET') return handlers.review ? handlers.review() : json({ data: current });
    if (path.endsWith('/minutes') && method === 'PUT') {
      if (handlers.minutes) return handlers.minutes(init);
      const body = JSON.parse(String(init.body));
      current = { ...current, version: current.version + 1, minutes: { ...current.minutes!, ...body } };
      return json({ data: { version: current.version, minutes: current.minutes } });
    }
    if (path.endsWith('/speaker-mappings') && method === 'PUT') {
      if (handlers.mappings) return handlers.mappings(init);
      const { mappings } = JSON.parse(String(init.body)) as { mappings: Array<{ speakerId: string; participantId: string | null }> };
      const names: Record<string, string> = { p1: '홍길동', p2: '김철수' };
      current = {
        ...current,
        version: current.version + 1,
        speakers: current.speakers.map((speaker) => {
          const next = mappings.find((item) => item.speakerId === speaker.speakerId);
          return next ? { ...speaker, participantId: next.participantId, participantName: next.participantId ? names[next.participantId] : null } : speaker;
        }),
      };
      return json({ data: { version: current.version, mappings: current.speakers.map(({ speakerId, participantId, participantName }) => ({ speakerId, participantId, participantName: participantName ?? null })) } });
    }
    if (path.endsWith('/confirm')) return handlers.confirm ? handlers.confirm(init) : json({ data: { status: 'CONFIRMED', version: current.version + 1 } });
    if (path.endsWith('/publish')) return handlers.publish ? handlers.publish(init) : json({ data: { sessionId: SESSION, status: 'PUBLISHING' } }, 202);
    if (path.endsWith('/participants')) return json({ data: { items: [
      { id: 'p1', name: '홍길동', email: 'hong@miinit.com' },
      { id: 'p2', name: '김철수', email: 'kim@miinit.com' },
      { id: 'p3', name: '다른사람', email: 'other@miinit.com' },
    ] } });
    if (path.endsWith('/app-config')) return json({ data: {
      company: { id: 'c', name: 'E', timezone: 'Asia/Seoul' },
      document: { provider: 'NOTION', configured: true, connectionVersion: 2, rootUrl: 'https://notion.example' },
      notification: { provider: null, enabled: false },
    } });
    throw new Error(`Unexpected request: ${method} ${path}`);
  });
  vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
  return fetchMock;
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderReview() {
  render(
    <MemoryRouter initialEntries={[`/meetings/${SESSION}/review`]}>
      <Routes>
        <Route path="/meetings/:sessionId/review" element={<ReviewRoute />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** 회의록 탭을 열고 원하는 구역을 고른다 */
async function openMinutes(section = '회의 요약') {
  const nav = await screen.findByRole('navigation', { name: '검토 단계' });
  fireEvent.click(within(nav).getByRole('button', { name: new RegExp(`^${section}`) }));
}

const calls = (fetchMock: ReturnType<typeof vi.fn>, suffix: string, method: string) =>
  fetchMock.mock.calls.filter(([url, init]) => new URL(String(url), 'http://localhost').pathname.endsWith(suffix) && (init?.method ?? 'GET') === method);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('회의록 검토 (MTG-04)', () => {
  it('집중 모드로 화자 카드(말한 시간 순, 통계·대표 발화)와 회의록 편집을 보인다', async () => {
    mockApi();
    renderReview();
    expect(await screen.findByRole('heading', { level: 1, name: '회의록 검토' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    const cards = await screen.findAllByRole('article');
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual(['화자 A', '화자 B']);
    expect(within(cards[0]).getByText('발화 2회 · 13초 (81%)')).toBeTruthy();
    expect(within(cards[0]).getByText('이번 주 배포 일정부터 정리하고 넘어갈게요.')).toBeTruthy();
    expect(within(cards[1]).getByRole('radio', { name: '미지정' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('2명 중 1명 지정')).toBeTruthy();
    // 탭 없이 검토 단계 목록. 미지정 화자가 있으면 화자 매핑부터 연다
    expect(screen.queryByRole('tab')).toBeNull();
    const nav = screen.getByRole('navigation', { name: '검토 단계' });
    expect(within(nav).getAllByRole('button').map((button) => button.textContent)).toEqual(['화자 매핑1미지정 1명', '회의 요약', '논의 내용1', '결정 사항1', '후속 조치0', '실행 항목1']);
    expect(within(nav).getByRole('button', { name: /^화자 매핑/ }).getAttribute('aria-current')).toBe('true');
    expect(screen.queryByText('저장됨')).toBeNull();
    await openMinutes();
    expect((screen.getByRole('textbox', { name: '회의 요약' }) as HTMLTextAreaElement).value).toBe('배포 일정을 정했다.');
    // 담당자는 이 회의 참석자만 고른다
    await openMinutes('실행 항목');
    const owner = screen.getByRole('combobox', { name: '담당 1' });
    expect(within(owner).getAllByRole('option').map((option) => option.textContent)).toEqual(['담당자 없음', '홍길동', '김철수']);
  });

  it('참석자 칩을 누르면 모든 화자 매핑을 현재 버전으로 한 번에 저장하고 되돌리기를 준다', async () => {
    const fetchMock = mockApi();
    renderReview();
    const cards = await screen.findAllByRole('article');
    const group = within(cards[1]).getByRole('radiogroup', { name: '화자 B의 참석자' });
    // 다른 화자에 지정된 사람은 표시가 붙는다
    expect(within(group).getByRole('radio', { name: /홍길동/ }).textContent).toContain('· A');
    fireEvent.click(within(group).getByRole('radio', { name: '김철수' }));
    await waitFor(() => expect(calls(fetchMock, '/speaker-mappings', 'PUT')).toHaveLength(1));
    const put = calls(fetchMock, '/speaker-mappings', 'PUT')[0][1]!;
    expect(new Headers(put.headers).get('If-Match')).toBe('"7"');
    expect(JSON.parse(String(put.body))).toEqual({ mappings: [{ speakerId: 'sa', participantId: 'p1' }, { speakerId: 'sb', participantId: 'p2' }] });
    expect(await screen.findByText('화자 B: 김철수 지정')).toBeTruthy();
    expect(screen.getByText('2명 중 2명 지정')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    await waitFor(() => expect(calls(fetchMock, '/speaker-mappings', 'PUT')).toHaveLength(2));
    expect(JSON.parse(String(calls(fetchMock, '/speaker-mappings', 'PUT')[1][1]!.body)).mappings[1]).toEqual({ speakerId: 'sb', participantId: null });
  });

  it('매핑 저장이 버전 충돌(412)이면 최신 매핑을 다시 불러오고 같은 요청을 다시 보내지 않는다', async () => {
    const fetchMock = mockApi({ mappings: () => json({ error: { code: 'SESSION_STATE_CONFLICT' } }, 412) });
    renderReview();
    const cards = await screen.findAllByRole('article');
    fireEvent.click(within(cards[1]).getByRole('radio', { name: '김철수' }));
    expect(await screen.findByText('다른 곳에서 매핑이 바뀌어 최신 상태를 불러왔습니다.')).toBeTruthy();
    expect(calls(fetchMock, '/speaker-mappings', 'PUT')).toHaveLength(1);
    expect(within(cards[1]).getByRole('radio', { name: '미지정' }).getAttribute('aria-checked')).toBe('true');
  });

  it('빈 항목은 오류로 보이고 저장할 수 없다. 고친 뒤 저장하면 현재 버전으로 한 번 보낸다', async () => {
    const fetchMock = mockApi();
    renderReview();
    await openMinutes('결정 사항');
    expect(screen.getByRole('button', { name: '저장' }).getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: '결정 사항 추가' }));
    expect(screen.getByText('내용을 입력해 주세요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '저장' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '결정 사항 2 삭제' }));

    await openMinutes();
    fireEvent.change(screen.getByRole('textbox', { name: '회의 요약' }), { target: { value: '배포 일정과 QA 일정을 정했다.' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('회의록이 저장되었습니다.')).toBeTruthy();
    const put = calls(fetchMock, '/minutes', 'PUT');
    expect(put).toHaveLength(1);
    expect(new Headers(put[0][1]!.headers).get('If-Match')).toBe('"7"');
    expect(JSON.parse(String(put[0][1]!.body)).summary).toBe('배포 일정과 QA 일정을 정했다.');
  });

  it('회의록 저장이 버전 충돌(412)이면 고친 내용을 유지하고 자동으로 다시 보내지 않는다', async () => {
    const fetchMock = mockApi({ minutes: () => json({ error: { code: 'SESSION_STATE_CONFLICT' } }, 412) });
    renderReview();
    await openMinutes();
    fireEvent.change(screen.getByRole('textbox', { name: '회의 요약' }), { target: { value: '내가 고친 요약' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText(/수정 내용은 유지했으며 자동 저장하지 않았습니다/)).toBeTruthy();
    expect(calls(fetchMock, '/minutes', 'PUT')).toHaveLength(1);
    expect((screen.getByRole('textbox', { name: '회의 요약' }) as HTMLTextAreaElement).value).toBe('내가 고친 요약');
  });

  it('저장하지 않은 변경이 있으면 발송을 막고 이유를 대화상자로 알린다', async () => {
    const fetchMock = mockApi();
    renderReview();
    await openMinutes();
    fireEvent.change(screen.getByRole('textbox', { name: '회의 요약' }), { target: { value: '바꾼 요약' } });
    fireEvent.click(screen.getByRole('button', { name: '발송' }));
    // 미지정 화자 확인 → 발송
    fireEvent.click(within(await screen.findByRole('dialog', { name: '미지정 화자 1명' })).getByRole('button', { name: '발송' }));
    const notice = await screen.findByRole('dialog', { name: '확인 필요' });
    expect(within(notice).getByText('변경된 내용이 있으니 저장하세요.')).toBeTruthy();
    expect(calls(fetchMock, '/confirm', 'POST')).toHaveLength(0);
  });

  it('발송하면 검토를 확정하고 참석자 전원에게 전달을 시작한 뒤 결과 화면으로 간다', async () => {
    const fetchMock = mockApi();
    renderReview();
    const cards = await screen.findAllByRole('article');
    fireEvent.click(within(cards[1]).getByRole('radio', { name: '김철수' }));
    await waitFor(() => expect(calls(fetchMock, '/speaker-mappings', 'PUT')).toHaveLength(1));
    expect(await screen.findByText('저장됨')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '발송' }));
    expect(await screen.findByTestId('where')).toHaveProperty('textContent', `/meetings/${SESSION}/complete`);
    const confirm = calls(fetchMock, '/confirm', 'POST')[0][1]!;
    expect(new Headers(confirm.headers).get('If-Match')).toBe('"8"');
    const publish = JSON.parse(String(calls(fetchMock, '/publish', 'POST')[0][1]!.body));
    expect(publish).toEqual({ emailRecipientParticipantIds: ['p1', 'p2'], notificationEnabled: false });
  });

  it('원문에서 보기는 전사 원문을 열어 해당 발화를 강조한다', async () => {
    mockApi();
    renderReview();
    const cards = await screen.findAllByRole('article');
    fireEvent.click(within(cards[1]).getByRole('button', { name: '원문에서 보기' }));
    const dialog = await screen.findByRole('dialog', { name: '전사 원문' });
    const items = within(dialog).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      '홍길동00:12이번 주 배포 일정부터 정리하고 넘어갈게요.',
      '화자 B00:25IAM 권한은 다음 주에 다시 보겠습니다.',
      '홍길동00:40QA는 목요일까지 끝내는 걸로 하죠.',
    ]);
    expect(items[1].className).toContain('bg-selected');
  });

  it('회의가 없으면 새 회의 시작을, 검토 단계가 아니면 처리 상태 확인을 보인다', async () => {
    mockApi({ review: () => json({ error: { code: 'SESSION_NOT_FOUND' } }, 404) });
    renderReview();
    expect(await screen.findByRole('heading', { name: '회의를 찾을 수 없습니다' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '새 회의 시작' }).getAttribute('href')).toBe('/meetings/new');
  });

  it('조회가 실패하면 다시 불러오기로 다시 조회한다', async () => {
    let attempt = 0;
    const fetchMock = mockApi({
      review: () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('network');
        return json({ data: baseReview() });
      },
    });
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: '다시 불러오기' }));
    expect(await screen.findByRole('navigation', { name: '검토 단계' })).toBeTruthy();
    expect(calls(fetchMock, `/meeting-sessions/${SESSION}`, 'GET')).toHaveLength(2);
  });
});
