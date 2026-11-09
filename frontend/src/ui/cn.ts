/**
 * 클래스 이름 합치기. 거짓 값은 건너뛴다.
 * Tailwind 클래스 충돌을 해결하지 않으므로(tailwind-merge 없음) 컴포넌트는
 * 바깥에서 받은 className을 배치용(폭·여백·위치)으로만 쓰게 한다.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
