/** 화자 점 색 (MTG-04 검토 화면과 MIN-02 회의록 상세가 같은 순서로 쓴다) */
export const SPEAKER_COLORS = ['bg-pink-500', 'bg-lavender-500', 'bg-blue-500', 'bg-pink-700', 'bg-lavender-700', 'bg-blue-700', 'bg-neutral-500'];

export function speakerColorAt(index: number): string {
  return SPEAKER_COLORS[Math.max(0, index) % SPEAKER_COLORS.length];
}
