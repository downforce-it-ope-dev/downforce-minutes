import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveRecordingSession } from '../meeting/recordingSessionStore';
import { withHealthyBackend } from '../testUtils/withHealthyBackend';
import { ProcessingRoute } from './ProcessingPage';

/*
 * MTG-03 회의 처리 (GitHub #28). 기존 ProcessingPage·App 처리 경로 테스트를 리뉴얼 화면으로 옮겼다.
 * 요소는 역할·이름으로 찾는다(클래스 이름을 쓰지 않음).
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function returnFromAudioDownload() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  fireEvent(window, new Event('focus'));
  fireEvent(document, new Event('visibilitychange'));
}

function apiSnapshot(status: string, actions: string[] = [], stage = 'TRANSCRIPTION', version = 4, sessionId = 's-1') {
  return {
    data: {
      sessionId,
      version,
      status,
      processing: { stage, retryable: true, audioAvailable: true, audioExpiresAt: new Date(Date.now() + 42 * 60_000).toISOString(), errorCode: 'PRIVATE_PROVIDER_FAILURE' } as Record<string, unknown>,
      allowedActions: actions,
    },
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderPage(sessionId = 's-1') {
  return render(
    <MemoryRouter initialEntries={[`/meetings/${sessionId}/processing`]}>
      <Routes>
        <Route path="/meetings/:sessionId/processing" element={<ProcessingRoute />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

const posts = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST');

describe('회의 처리 (MTG-03) · 처리 중', () => {
  it('집중 모드로 회의 제목·4단계·단계 기준 진행 막대를 보이고 처리 결과 내용은 보이지 않는다', async () => {
    saveRecordingSession({
      sessionId: 's-1', title: '2026년 4분기 로드맵 점검 회의', version: 1, status: 'CREATED',
      uploadPolicy: { chunkDurationSeconds: 15, maxChunkBytes: 1_000_000, acceptedMimeTypes: ['audio/webm'] },
    });
    const fetchMock = vi.fn(async () => json({ data: { ...apiSnapshot('PROCESSING', [], 'AUDIO_ASSEMBLY').data, transcript: { text: 'partial transcript must stay hidden' } } }));
    vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: '회의 처리' })).toBeTruthy();
    expect(await screen.findByText('전체 4단계 중 1단계 · 오디오 준비 진행 중')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '2026년 4분기 로드맵 점검 회의' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: '전체 처리 단계' }).getAttribute('aria-valuenow')).toBe('1');
    const steps = within(screen.getByRole('region', { name: '처리 단계' })).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual(['오디오 준비 진행 중', '음성 인식 대기', '화자 분석 대기', '회의록 생성 대기']);
    expect(steps[0].getAttribute('aria-current')).toBe('step');
    expect(screen.queryByRole('navigation', { name: '주요 메뉴' })).toBeNull();
    expect(screen.queryByText('partial transcript must stay hidden')).toBeNull();
  });

  it('음성 인식 중에만 경과 시간을 보이고 1초마다 늘린다', async () => {
    let reads = 0;
    vi.stubGlobal('fetch', withHealthyBackend(vi.fn(async () => {
      reads += 1;
      if (reads > 1) return new Promise<Response>(() => {});
      return json(apiSnapshot('PROCESSING'));
    })));
    renderPage();
    expect(await screen.findByText('경과 00:00')).toBeTruthy();
    expect(await screen.findByText('경과 00:01', {}, { timeout: 2_500 })).toBeTruthy();
  });

  it('조회가 실패하면 경과 시간을 감추고 토스트로 알린다', async () => {
    let reads = 0;
    vi.stubGlobal('fetch', withHealthyBackend(vi.fn(async () => {
      reads += 1;
      if (reads === 1) return json(apiSnapshot('PROCESSING'));
      throw new TypeError('temporary status network failure');
    })));
    renderPage();
    expect(await screen.findByRole('timer')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('timer')).toBeNull(), { timeout: 2_500 });
    // 토스트는 화면이 바뀐 뒤 조금 늦게 뜬다
    expect(await screen.findByText('처리 상태를 새로고침하지 못했습니다. 자동으로 다시 확인합니다.', undefined, { timeout: 2_000 })).toBeTruthy();
  });

  it('화자 분석 100%는 회의록 생성 단계로 본다', async () => {
    vi.stubGlobal('fetch', withHealthyBackend(vi.fn(async () => json({ data: { ...apiSnapshot('PROCESSING', [], 'DIARIZATION').data, processing: { stage: 'DIARIZATION', progressPercent: 100 } } }))));
    renderPage();
    expect(await screen.findByText('전체 4단계 중 4단계 · 회의록 생성 진행 중')).toBeTruthy();
    const steps = within(screen.getByRole('region', { name: '처리 단계' })).getAllByRole('listitem');
    expect(steps[3].getAttribute('aria-current')).toBe('step');
  });

  it('범위를 벗어나거나 없는 진행률은 단계 값만 쓴다', async () => {
    for (const progressPercent of [140, undefined]) {
      vi.stubGlobal('fetch', withHealthyBackend(vi.fn(async () => json({ data: { ...apiSnapshot('PROCESSING').data, processing: { stage: 'TRANSCRIPTION', progressPercent } } }))));
      renderPage();
      expect(await screen.findByText('전체 4단계 중 2단계 · 음성 인식 진행 중')).toBeTruthy();
      expect(screen.getByRole('progressbar', { name: '전체 처리 단계' }).getAttribute('aria-valuenow')).toBe('2');
      cleanup();
    }
  });

  it('REVIEW가 되면 검토 화면으로 교체 이동한다', async () => {
    vi.stubGlobal('fetch', withHealthyBackend(vi.fn(async () => json(apiSnapshot('REVIEW', [], 'DRAFT_READY')))));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/meetings/s-1/review'));
  });

  it('다른 세션 응답이면 이동하지 않고 확인할 수 없다고 보인다', async () => {
    vi.stubGlobal('fetch', withHealthyBackend(vi.fn(async () => json(apiSnapshot('REVIEW', [], 'DRAFT_READY', 1, 'different-session')))));
    renderPage('expected-session');
    expect(await screen.findByRole('heading', { name: '회의 처리 상태를 확인할 수 없습니다' })).toBeTruthy();
    expect(screen.queryByTestId('where')).toBeNull();
  });

  it('처리 중에는 페이지를 닫기 전에 경고하고, 화면을 떠나면 진행 중인 조회를 끊는다', async () => {
    let signal: AbortSignal | undefined;
    let reads = 0;
    vi.stubGlobal('fetch', withHealthyBackend(vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      reads += 1;
      if (reads === 1) return Promise.resolve(json(apiSnapshot('PROCESSING')));
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    })));
    const view = renderPage();
    await screen.findByText('전체 4단계 중 2단계 · 음성 인식 진행 중');
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(signal).toBeDefined(), { timeout: 3_000 });
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});

describe('회의 처리 (MTG-03) · 조회 실패', () => {
  it('첫 조회가 연결 오류면 다시 시도를 보이고 토스트로 알리며, 내부 오류 내용은 보이지 않는다', async () => {
    let available = false;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (!available) throw new TypeError('private proxy diagnostic');
      expect(!init?.method || init.method === 'GET').toBe(true);
      return json(apiSnapshot('PROCESSING'));
    });
    vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
    renderPage();
    expect(await screen.findByRole('heading', { name: '처리 상태를 불러오지 못했습니다' })).toBeTruthy();
    expect(await screen.findByText('연결을 확인해 주세요. 처리 상태는 자동으로 다시 확인합니다.', undefined, { timeout: 2_000 })).toBeTruthy();
    expect(document.body.textContent).not.toContain('private proxy diagnostic');
    available = true;
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('전체 4단계 중 2단계 · 음성 인식 진행 중')).toBeTruthy();
  });

  it('세션이 없으면 복구 동작 없이 새 회의 시작만 보인다', async () => {
    const fetchMock = vi.fn(async () => json({ error: { code: 'SESSION_NOT_FOUND' } }, 404));
    vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
    renderPage();
    expect(await screen.findByRole('heading', { name: '회의를 찾을 수 없습니다' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '새 회의 시작' }).getAttribute('href')).toBe('/meetings/new');
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
  });
});

describe('회의 처리 (MTG-03) · 처리 실패 복구', () => {
  it('실패한 단계·원인을 안전한 문구로 보이고 API가 허용한 동작만 보인다', async () => {
    const body = apiSnapshot('PROCESSING_FAILED', ['RETRY_PROCESSING', 'DOWNLOAD_AUDIO', 'FINALIZE_PROCESSING_FAILURE']);
    body.data.processing.retryable = false;
    body.data.processing.errorCode = 'TRANSCRIPTION_AUTHENTICATION_FAILED';
    vi.stubGlobal('fetch', withHealthyBackend(vi.fn(async () => json(body))));
    renderPage();
    const card = await screen.findByRole('region', { name: '처리를 완료하지 못했습니다' });
    expect(within(card).getByRole('alert').textContent).toBe('음성 인식 서비스 연결 설정을 확인해 주세요.');
    expect(within(card).getByText('실패한 단계').nextElementSibling?.textContent).toBe('음성 인식');
    expect(within(card).getByText('오디오 보관').nextElementSibling?.textContent).toBe('약 42분 남음');
    const steps = within(screen.getByRole('region', { name: '처리 단계' })).getAllByRole('listitem');
    expect(steps[1].textContent).toBe('음성 인식 실패');
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: '오디오 다운로드' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '다운로드 준비' }));
    expect((await screen.findByRole('link', { name: '오디오 다운로드' })).getAttribute('href')).toContain('/audio/download');
    expect(screen.queryByText(/TRANSCRIPTION_AUTHENTICATION_FAILED/)).toBeNull();
  });

  it('알 수 없는 오류 코드는 단계별 문구로 보인다', async () => {
    vi.stubGlobal('fetch', withHealthyBackend(vi.fn(async () => json(apiSnapshot('PROCESSING_FAILED', [], 'DIARIZATION')))));
    renderPage();
    const card = await screen.findByRole('region', { name: '처리를 완료하지 못했습니다' });
    expect(within(card).getByRole('alert').textContent).toBe('화자를 분석하는 중 문제가 발생했습니다.');
    expect(document.body.textContent).not.toContain('PRIVATE_PROVIDER_FAILURE');
  });

  it('retryable이 false여도 API가 허용하면 다시 시도를 보이고, 오디오가 없으면 다운로드를 보이지 않는다', async () => {
    const body = apiSnapshot('PROCESSING_FAILED', ['RETRY_PROCESSING', 'DOWNLOAD_AUDIO']);
    body.data.processing.retryable = false;
    body.data.processing.audioAvailable = false;
    vi.stubGlobal('fetch', withHealthyBackend(vi.fn(async () => json(body))));
    renderPage();
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '다운로드 준비' })).toBeNull();
  });

  it('화면으로 돌아오면 다시 조회하고 더는 허용되지 않는 동작을 없앤다', async () => {
    let reads = 0;
    vi.stubGlobal('fetch', withHealthyBackend(vi.fn(async () => {
      reads += 1;
      const body = apiSnapshot('PROCESSING_FAILED', reads === 1 ? ['DOWNLOAD_AUDIO', 'FINALIZE_PROCESSING_FAILURE'] : ['FINALIZE_PROCESSING_FAILURE']);
      if (reads > 1) body.data.processing.audioAvailable = false;
      return json(body);
    })));
    renderPage();
    expect(await screen.findByRole('button', { name: '다운로드 준비' })).toBeTruthy();
    returnFromAudioDownload();
    await waitFor(() => expect(screen.queryByRole('button', { name: '다운로드 준비' })).toBeNull());
  });

  it('다시 시도는 현재 버전으로 한 번만 보내고 처리 중으로 맞춘다', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (init?.method === 'POST') return json({ data: { sessionId: 's-1', status: 'PROCESSING', stage: 'TRANSCRIPTION' } }, 202);
      return json(apiSnapshot(posts(fetchMock).length ? 'PROCESSING' : 'PROCESSING_FAILED', ['RETRY_PROCESSING'], 'TRANSCRIPTION', 7));
    });
    vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    await screen.findByText('전체 4단계 중 2단계 · 음성 인식 진행 중');
    const [post] = posts(fetchMock);
    expect(String(post[0])).toContain('/processing/retry');
    expect(new Headers((post[1] as RequestInit).headers).get('If-Match')).toBe('"7"');
    expect(new Headers((post[1] as RequestInit).headers).get('Idempotency-Key')).toBeTruthy();
    expect(posts(fetchMock)).toHaveLength(1);
  });

  it('응답이 끊긴 다시 시도는 상태 조회로 맞추고 다시 시도를 더 보이지 않는다', async () => {
    // 요청은 서버에 닿았지만 응답만 끊긴 경우: 다음 조회부터 처리 중이다
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (init?.method === 'POST') throw new TypeError('connection dropped after request');
      return json(apiSnapshot(posts(fetchMock).length ? 'PROCESSING' : 'PROCESSING_FAILED', ['RETRY_PROCESSING'], 'TRANSCRIPTION', 5));
    });
    vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('전체 4단계 중 2단계 · 음성 인식 진행 중')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
    expect(screen.getByText('요청 결과를 확인하지 못했습니다. 최신 상태를 다시 확인합니다.')).toBeTruthy();
    expect(posts(fetchMock)).toHaveLength(1);
  });

  it('실패 마무리는 확인 대화상자(취소에 기본 초점)를 거쳐 DISCARDED로만 보낸다', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => init?.method === 'POST'
      ? new Response('', { status: 202 })
      : json(apiSnapshot(posts(fetchMock).length ? 'COMPLETED_WITH_WARNINGS' : 'PROCESSING_FAILED', ['FINALIZE_PROCESSING_FAILURE'], 'DIARIZATION', 3)));
    vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
    renderPage();
    const trigger = await screen.findByRole('button', { name: '실패 마무리' });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: '오디오 없이 마무리할까요?' });
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '취소' })));
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(posts(fetchMock)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '실패 마무리' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '실패 마무리' }));
    expect(await screen.findByRole('heading', { name: '실패 기록을 저장했습니다' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '홈' }).getAttribute('href')).toBe('/');
    expect(JSON.parse(String((posts(fetchMock)[0][1] as RequestInit).body))).toEqual({ audioDisposition: 'DISCARDED' });
  });

  it('원본 오디오를 받고 돌아온 뒤 저장했다고 확인해야 DOWNLOADED로 마무리한다', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => init?.method === 'POST'
      ? new Response('', { status: 202 })
      : json(apiSnapshot(posts(fetchMock).length ? 'COMPLETED_WITH_WARNINGS' : 'PROCESSING_FAILED', ['DOWNLOAD_AUDIO', 'FINALIZE_PROCESSING_FAILURE'])));
    vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '다운로드 준비' }));
    const link = await screen.findByRole('link', { name: '오디오 다운로드' });
    expect(link.hasAttribute('download')).toBe(true);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    fireEvent.click(link);
    expect(posts(fetchMock)).toHaveLength(0);
    returnFromAudioDownload();
    const dialog = await screen.findByRole('dialog', { name: '오디오를 기기에 저장했나요?' });
    const saved = within(dialog).getByRole('button', { name: '저장했어요' });
    await waitFor(() => expect(document.activeElement).toBe(saved));
    fireEvent.click(saved);
    expect(await screen.findByRole('heading', { name: '실패 기록을 저장했습니다' })).toBeTruthy();
    expect(JSON.parse(String((posts(fetchMock)[0][1] as RequestInit).body))).toEqual({ audioDisposition: 'DOWNLOADED' });
  });

  it('돌아와서 다시 조회한 상태가 다운로드를 허용하지 않으면 저장 확인을 묻지 않고 토스트로 알린다', async () => {
    let returned = false;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (init?.method === 'POST') return new Response('', { status: 202 });
      const body = apiSnapshot('PROCESSING_FAILED', returned ? ['FINALIZE_PROCESSING_FAILURE'] : ['DOWNLOAD_AUDIO', 'FINALIZE_PROCESSING_FAILURE'], 'TRANSCRIPTION', returned ? 5 : 4);
      if (returned) body.data.processing.audioAvailable = false;
      return json(body);
    });
    vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '다운로드 준비' }));
    fireEvent.click(await screen.findByRole('link', { name: '오디오 다운로드' }));
    returned = true;
    returnFromAudioDownload();
    expect(await screen.findByText('오디오를 사용할 수 없거나 보관 기한이 지났습니다. 최신 상태를 확인해 주세요.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(posts(fetchMock)).toHaveLength(0);
  });
});
