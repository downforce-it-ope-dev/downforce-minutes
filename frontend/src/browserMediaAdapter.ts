import type { MediaRecorderAdapter, MediaStreamLike, RecorderLike } from './recordingController';

/**
 * 진단용 상태 (녹음 화면 ?debug, #27). 소리 크기 측정이 멈췄을 때 원인을 가린다.
 * - audioContext: 측정용 오디오 처리 상태 (running이 아니면 브라우저가 처리를 멈춘 것)
 * - ticks: 측정 주기가 돈 횟수 (늘지 않으면 측정 타이머가 멈춘 것)
 * - rawLevel: 마지막 측정값 / track: 마이크 트랙 상태 (muted면 운영체제·기기가 소리를 막은 것)
 */
export const monitorDiagnostics = { audioContext: '-', ticks: 0, rawLevel: 0, track: '-' };

export const browserMediaAdapter: MediaRecorderAdapter = {
  isMediaRecorderSupported: () => typeof globalThis.MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
  isTypeSupported: (mimeType) => globalThis.MediaRecorder?.isTypeSupported(mimeType) ?? false,
  getUserMedia: async () => navigator.mediaDevices.getUserMedia({ audio: true }) as Promise<MediaStreamLike>,
  monitorInput: (stream, onLevel) => {
    const context = new AudioContext();
    if (context.state !== 'running') void context.resume().catch(() => undefined);
    const source = context.createMediaStreamSource(stream as MediaStream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const track = (stream as MediaStream).getAudioTracks?.()[0];
    const timer = globalThis.setInterval(() => {
      monitorDiagnostics.ticks += 1;
      monitorDiagnostics.audioContext = context.state;
      monitorDiagnostics.track = track ? `${track.readyState}${track.muted ? ' muted' : ''}${track.enabled ? '' : ' disabled'}` : 'none';
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }
      monitorDiagnostics.rawLevel = Math.sqrt(sum / samples.length);
      onLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
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
