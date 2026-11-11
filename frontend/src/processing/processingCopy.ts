import type { ProcessingStage } from '../processingApi';

/* 회의 처리 화면 문구 (MTG-03, GitHub #28). 기존 ProcessingPage.tsx의 문구를 그대로 옮겼다 */

export const STAGE_NAMES = ['오디오 준비', '음성 인식', '화자 분석', '회의록 생성'] as const;

export const STAGE_LABELS: Record<ProcessingStage, string> = {
  AUDIO_ASSEMBLY: '오디오 준비',
  TRANSCRIPTION: '음성 인식',
  DIARIZATION: '화자 분석',
  MINUTES_GENERATION: '회의록 생성',
  DRAFT_READY: '회의록 생성',
  DRAFT_REGENERATION: '회의록 재생성',
};

export const STAGE_INDEX: Record<ProcessingStage, number> = {
  AUDIO_ASSEMBLY: 0,
  TRANSCRIPTION: 1,
  DIARIZATION: 2,
  MINUTES_GENERATION: 3,
  DRAFT_READY: 3,
  DRAFT_REGENERATION: 3,
};

const FAILURE_BY_STAGE: Record<ProcessingStage, string> = {
  AUDIO_ASSEMBLY: '오디오를 준비하는 중 문제가 발생했습니다.',
  TRANSCRIPTION: '음성을 변환하는 중 문제가 발생했습니다.',
  DIARIZATION: '화자를 분석하는 중 문제가 발생했습니다.',
  MINUTES_GENERATION: '회의록을 생성하는 중 문제가 발생했습니다.',
  DRAFT_READY: '회의록을 생성하는 중 문제가 발생했습니다.',
  DRAFT_REGENERATION: '회의록을 재생성하는 중 문제가 발생했습니다.',
};

const FAILURE_BY_CODE: Record<string, string> = {
  AUDIO_ASSEMBLY_FAILED: '녹음 파일 조각을 하나의 오디오로 준비하지 못했습니다. 다시 시도해 주세요.',
  AUDIO_STORAGE_FAILED: '오디오 파일을 안전하게 보관하지 못했습니다. 다시 시도해도 해결되지 않으면 새 회의를 녹음해 주세요.',
  TRANSCRIPTION_AUTHENTICATION_FAILED: '음성 인식 서비스 연결 설정을 확인해 주세요.',
  TRANSCRIPTION_CONFIGURATION_ERROR: '음성 인식 서비스 설정에 문제가 있습니다. 설정을 확인한 뒤 다시 시도해 주세요.',
  TRANSCRIPTION_INVALID_AUDIO: '녹음 파일을 음성 인식 서비스에서 읽지 못했습니다. 다시 시도해 주세요.',
  TRANSCRIPTION_INVALID_RESPONSE: '음성 인식 결과를 읽을 수 없었습니다. 다시 시도해 주세요.',
  TRANSCRIPTION_PROCESSING_FAILED: '음성 인식 서비스가 처리를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  DIARIZATION_FAILED: '화자 분석을 완료하지 못했습니다. 다시 시도해 주세요.',
  DIARIZATION_RESULT_SAVE_FAILED: '화자 분석 결과를 저장하지 못했습니다. 다시 시도해 주세요.',
  MINUTES_AUTHENTICATION_FAILED: '회의록 작성 서비스 연결 설정을 확인해 주세요.',
  MINUTES_CONFIGURATION_ERROR: '회의록 작성 서비스 설정에 문제가 있습니다. 설정을 확인한 뒤 다시 시도해 주세요.',
  MINUTES_PROCESSING_FAILED: '회의록 작성 서비스가 처리를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  MINUTES_RESULT_SAVE_FAILED: '작성한 회의록을 저장하지 못했습니다. 다시 시도해 주세요.',
  TRANSCRIPTION_RESULT_NOT_AVAILABLE: '음성 인식 결과를 찾지 못했습니다. 다시 시도해 주세요.',
  PROCESSING_RUNNER_FAILED: '회의 처리 작업이 중단되었습니다. 다시 시도해 주세요.',
  PROCESSING_FAILED: '회의 처리 중 일시적인 문제가 발생했습니다. 다시 시도해 주세요.',
};

/** 실패 원인 문구. 알 수 없는 오류 코드는 화면에 그대로 보이지 않고 단계별 문구로 바꾼다 */
export function failureMessage(errorCode: string | null | undefined, stage: ProcessingStage | undefined): string {
  return (errorCode ? FAILURE_BY_CODE[errorCode] : undefined) ?? (stage ? FAILURE_BY_STAGE[stage] : '회의를 처리하는 중 문제가 발생했습니다.');
}

export function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}
