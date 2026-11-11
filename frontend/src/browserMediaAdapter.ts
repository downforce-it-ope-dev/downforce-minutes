import type { MediaRecorderAdapter, MediaStreamLike, RecorderLike } from './recordingController';

/**
 * 진단용 상태 (녹음 화면 ?debug, #27). 소리 크기 측정이 멈췄을 때 원인을 가린다.
 * - audioContext: 측정용 오디오 처리 상태 (running이 아니면 브라우저가 처리를 멈춘 것)
 * - ticks: 측정 주기가 돈 횟수 (늘지 않으면 측정 타이머가 멈춘 것)
 * - rawLevel: 마지막 측정값 / track: 마이크 트랙 상태 (muted면 운영체제·기기가 소리를 막은 것)
 * - frozen: 마지막 측정 구간의 샘플이 모두 같은 값인지 (기기·드라이버가 멈춘 신호를 보내는 것)
 */
export const monitorDiagnostics = { audioContext: '-', ticks: 0, rawLevel: 0, track: '-', frozen: false };

/**
 * 측정 구간의 샘플이 모두 같으면 멈춘 신호로 본다. 실제 마이크는 조용해도 잡음으로 값이 계속 바뀐다.
 * 실제 크롬(Intel Smart Sound 내장 마이크)에서 말하는 중에도 모든 샘플이 같은 값(직류)으로 들어온 것을 확인했다(#27).
 */
const FROZEN_RANGE = 1e-6;

export const browserMediaAdapter: MediaRecorderAdapter = {
  isMediaRecorderSupported: () => typeof globalThis.MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
  isTypeSupported: (mimeType) => globalThis.MediaRecorder?.isTypeSupported(mimeType) ?? false,
  getUserMedia: async () => navigator.mediaDevices.getUserMedia({ audio: true }) as Promise<MediaStreamLike>,
  monitorInput: (stream, onLevel) => {
    const context = new AudioContext();
    if (context.state !== 'running') void context.resume().catch(() => undefined);
    const source = context.createMediaStreamSource(stream as MediaStream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    // 8비트 값은 작은 소리를 0으로 깎으므로 부동소수 값으로 잰다
    const samples = new Float32Array(analyser.fftSize);
    const track = (stream as MediaStream).getAudioTracks?.()[0];
    const timer = globalThis.setInterval(() => {
      monitorDiagnostics.ticks += 1;
      monitorDiagnostics.audioContext = context.state;
      monitorDiagnostics.track = track ? `${track.readyState}${track.muted ? ' muted' : ''}${track.enabled ? '' : ' disabled'}` : 'none';
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      let min = Infinity;
      let max = -Infinity;
      for (const sample of samples) {
        sum += sample * sample;
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
      const rms = Math.sqrt(sum / samples.length);
      const frozen = max - min < FROZEN_RANGE;
      monitorDiagnostics.rawLevel = rms;
      monitorDiagnostics.frozen = frozen;
      // 멈춘 신호의 직류 값은 소리가 아니므로 레벨 0으로 넘긴다
      onLevel(frozen ? 0 : Math.min(1, rms * 4), { frozen });
    }, 80);
    return () => {
      globalThis.clearInterval(timer);
      source.disconnect();
      analyser.disconnect();
      void context.close();
    };
  },
  createRecorder: (stream, options) => new MediaRecorder(stream as MediaStream, options) as unknown as RecorderLike,
  now: () => performance.now(),
  nowEpoch: () => Date.now(),
  setInterval: (callback, delayMs) => globalThis.setInterval(callback, delayMs),
  clearInterval: (handle) => globalThis.clearInterval(handle as number),
  createChunkId: () => globalThis.crypto.randomUUID(),
};
