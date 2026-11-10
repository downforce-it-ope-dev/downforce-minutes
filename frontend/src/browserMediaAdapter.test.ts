import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserMediaAdapter } from './browserMediaAdapter';

function stubAudio(fill: (samples: Float32Array) => void) {
  const analyser = { fftSize: 0, getFloatTimeDomainData: vi.fn(fill), disconnect: vi.fn() };
  const context = {
    state: 'running',
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
    createAnalyser: vi.fn(() => analyser),
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  class MockAudioContext {
    constructor() { return context as unknown as AudioContext; }
  }
  vi.stubGlobal('AudioContext', MockAudioContext);
}

describe('browserMediaAdapter microphone monitoring', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reports a frozen signal (every sample equal, as seen from a stuck driver) as level 0 and frozen', () => {
    vi.useFakeTimers();
    stubAudio((samples) => samples.fill(0.00595));
    const onLevel = vi.fn();
    const cleanup = browserMediaAdapter.monitorInput?.({} as MediaStream, onLevel);
    vi.advanceTimersByTime(80);
    expect(onLevel).toHaveBeenLastCalledWith(0, { frozen: true });
    cleanup?.();
  });

  it('reports a varying signal with its level and not frozen', () => {
    vi.useFakeTimers();
    stubAudio((samples) => samples.forEach((_, index) => { samples[index] = index % 2 ? 0.05 : -0.05; }));
    const onLevel = vi.fn();
    const cleanup = browserMediaAdapter.monitorInput?.({} as MediaStream, onLevel);
    vi.advanceTimersByTime(80);
    expect(onLevel).toHaveBeenLastCalledWith(expect.closeTo(0.2, 5), { frozen: false });
    cleanup?.();
  });

  it('resumes a suspended AudioContext so live microphone input can be detected', () => {
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const analyser = { fftSize: 0, getFloatTimeDomainData: vi.fn(), disconnect: vi.fn() };
    const context = {
      state: 'suspended',
      createMediaStreamSource: vi.fn(() => source),
      createAnalyser: vi.fn(() => analyser),
      resume: vi.fn(async () => { context.state = 'running'; }),
      close: vi.fn(async () => undefined),
    };
    class MockAudioContext {
      constructor() { return context as unknown as AudioContext; }
    }
    vi.stubGlobal('AudioContext', MockAudioContext);

    const cleanup = browserMediaAdapter.monitorInput?.({} as MediaStream, vi.fn());

    expect(context.resume).toHaveBeenCalledTimes(1);
    cleanup?.();
  });
});
