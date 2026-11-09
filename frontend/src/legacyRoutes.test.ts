import { describe, expect, it } from 'vitest';
import appSource from './App.tsx?raw';
import { LEGACY_PATHS } from './legacyRoutes';

describe('기존 화면 경로 목록', () => {
  it('App.tsx의 라우트와 같다 (어긋나면 기존 화면이 페이지 없음으로 보인다)', () => {
    const appPaths = [...appSource.matchAll(/<Route path="([^"]+)"/g)].map((match) => match[1]);
    expect([...appPaths].sort()).toEqual([...LEGACY_PATHS].sort());
  });
});
