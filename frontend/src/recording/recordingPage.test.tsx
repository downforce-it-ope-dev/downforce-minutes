import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveRecordingSession, type RecordingSession } from '../meeting/recordingSessionStore';
import type { MediaRecorderAdapter, RecorderLike } from '../recordingController';
import { withHealthyBackend } from '../testUtils/withHealthyBackend';
import { RecordingRoute } from './RecordingPage';

const session: RecordingSession = {
  sessionId: 's-rec',
  title: '2026년 4분기 로드맵 점검 회의',
  version: 1,
  status: 'CREATED',
  uploadPolicy: { chunkDurationSeconds: 15, maxChunkBytes: 1_000_000, acceptedMimeTypes: ['audio/webm'] },
  draft: {
    title: '2026년 4분기 로드맵 점검 회의',
    meetingDate: '2026-11-10',
    templateId: 'default.md',
    participantIds: ['p1', 'p2'],
    templateName: '기본 회의록',
    participants: [
      { name: '홍길동', email: 'hong@miinit.com' },
      { name: '김철수', email: 'kim@miinit.com' },
    ],
  },
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function fakeAdapter(): MediaRecorderAdapter {
  return {
    isMediaRecorderSupported: () => true,
    isTypeSupported: () => true,
    getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })),
    createRecorder: vi.fn(() => {
      const fake: RecorderLike = {
        mimeType: 'audio/webm', onstart: null, onpause: null, onresume: null, onstop: null, onerror: null, ondataavailable: null,
        start: () => fake.onstart?.(), pause: () => fake.onpause?.(), resume: () => fake.onresume?.(), stop: () => fake.onstop?.(),
      };
      return fake;
    }),
    now: () => 0,
    nowEpoch: () => 1_700_000_000_000,
    setInterval: () => 1,
    clearInterval: () => undefined,
    createChunkId: () => 'chunk',
  };
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

function renderRoute(adapter = fakeAdapter(), path = '/meetings/s-rec/recording') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/meetings/:sessionId/recording" element={<RecordingRoute mediaAdapter={adapter} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  return adapter;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  saveRecordingSession(session);
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path.endsWith('/audio')) return response({ data: { receivedSequences: [], receivedChunks: 0, totalBytes: 0 } });
    if (path.endsWith('/meeting-sessions/s-rec') && init?.method === 'DELETE') return new Response(null, { status: 204 });
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('회의 녹음 (MTG-02)', () => {
  it('집중 모드로 제목·대기 배지·경과 시간·녹음 시작을 보이고, 회의 정보에 템플릿·참석자 이름을 보인다', async () => {
    renderRoute();
    expect(screen.getByRole('heading', { level: 1, name: '회의 녹음' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: session.title })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    expect(screen.getByText('녹음 대기')).toBeTruthy();
    expect(screen.getByLabelText('경과 시간').textContent).toBe('00:00:00');
    expect(await screen.findByRole('status', { name: '마이크 입력이 감지되었습니다' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '녹음 시작' }).getAttribute('aria-disabled')).toBeNull();
    const info = screen.getByRole('region', { name: '회의 정보' });
    expect(within(info).getByText('기본 회의록')).toBeTruthy();
    expect(within(info).getByText('참석자')).toBeTruthy();
    expect(within(info).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['홍길동hong@miinit.com', '김철수kim@miinit.com']);
  });

  it('녹음을 시작하면 뒤로 가기가 사라지고 일시정지·재개·회의 종료 확인이 동작한다', async () => {
    renderRoute();
    expect(screen.getByRole('button', { name: '회의 준비로 돌아가기' })).toBeTruthy();
    await screen.findByRole('status', { name: '마이크 입력이 감지되었습니다' });
    fireEvent.click(screen.getByRole('button', { name: '녹음 시작' }));
    expect(await screen.findByText('녹음 중')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '회의 준비로 돌아가기' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
    expect(screen.getByText('일시정지됨')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '녹음 재개' }));
    expect(screen.getByText('녹음 중')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '회의 종료' }));
    const dialog = await screen.findByRole('dialog', { name: '회의를 종료할까요?' });
    // 기본 초점은 계속 녹음 (실수로 종료하지 않게)
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '계속 녹음' })));
    fireEvent.click(within(dialog).getByRole('button', { name: '계속 녹음' }));
    expect(screen.getByText('녹음 중')).toBeTruthy();
  });

  it('화면이 다시 그려져도 마이크·녹음기를 다시 만들지 않는다 (녹음이 끊기지 않음)', async () => {
    const adapter = renderRoute();
    await screen.findByRole('status', { name: '마이크 입력이 감지되었습니다' });
    fireEvent.click(screen.getByRole('button', { name: '녹음 시작' }));
    await screen.findByText('녹음 중');
    // 일시정지·재개로 여러 번 다시 그린다
    fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
    fireEvent.click(screen.getByRole('button', { name: '녹음 재개' }));
    fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
    fireEvent.click(screen.getByRole('button', { name: '녹음 재개' }));
    expect(screen.getByText('녹음 중')).toBeTruthy();
    expect(adapter.createRecorder).toHaveBeenCalledTimes(1);
    // 마이크 확인 때 받은 입력을 녹음에도 쓴다
    expect(adapter.getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('img', { name: '자동 저장 중' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
    expect(screen.queryByRole('img', { name: '자동 저장 중' })).toBeNull();
  });

  it('녹음 시작 전 뒤로 가기는 세션을 취소하고 입력값을 들고 새 회의로 돌아간다', async () => {
    renderRoute();
    await screen.findByRole('status', { name: '마이크 입력이 감지되었습니다' });
    fireEvent.click(screen.getByRole('button', { name: '회의 준비로 돌아가기' }));
    expect(await screen.findByTestId('where')).toHaveProperty('textContent', '/meetings/new');
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/meeting-sessions/s-rec') && init?.method === 'DELETE')).toBe(true);
    expect(sessionStorage.getItem('meeting-automation.recording-session')).toBeNull();
  });

  it('마이크를 쓸 수 없으면 오류 표시·다시 확인 버튼을 보이고 오류는 토스트로 알린다', async () => {
    const adapter = fakeAdapter();
    adapter.getUserMedia = vi.fn(async () => {
      throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    });
    renderRoute(adapter);
    expect(await screen.findByRole('status', { name: '마이크를 사용할 수 없습니다' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '녹음 시작' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: '마이크 다시 확인' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '마이크 다시 확인' }));
    await waitFor(() => expect(adapter.getUserMedia).toHaveBeenCalledTimes(2));
  });

  it('녹음 중 화면 꺼짐 방지를 요청하고, 지원하지 않으면 한 번만 알린다', async () => {
    const release = vi.fn(async () => undefined);
    const request = vi.fn(async () => ({ released: false, release }));
    vi.stubGlobal('navigator', { ...navigator, wakeLock: { request } });
    renderRoute();
    await screen.findByRole('status', { name: '마이크 입력이 감지되었습니다' });
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '녹음 시작' }));
    await screen.findByText('녹음 중');
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    cleanup();
    await waitFor(() => expect(release).toHaveBeenCalled());
  });

  it('화면 꺼짐 방지를 지원하지 않는 기기는 토스트로 알린다', async () => {
    vi.stubGlobal('navigator', { ...navigator, wakeLock: undefined });
    renderRoute();
    await screen.findByRole('status', { name: '마이크 입력이 감지되었습니다' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '녹음 시작' }));
    });
    expect(await screen.findByText('이 기기에서는 화면 꺼짐 방지를 쓸 수 없습니다.')).toBeTruthy();
  });

  it('세션 정보가 없거나 다른 세션이면 새 회의 시작만 보인다', () => {
    renderRoute(fakeAdapter(), '/meetings/other/recording');
    expect(screen.getByRole('heading', { name: '녹음 세션을 찾을 수 없습니다' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '새 회의 시작' }).getAttribute('href')).toBe('/meetings/new');
    expect(screen.queryByRole('button', { name: '녹음 시작' })).toBeNull();
  });
});
