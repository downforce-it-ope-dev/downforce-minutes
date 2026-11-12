import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { installSyntheticApi, sessionId, type ApiTarget } from './fixtures';

/*
 * 화면 계산 스타일 수집 (R9 #41에서 기존 화면용 도구를 모든 화면용으로 바꿨다).
 * 진입 CSS(tailwind.css)·공통 부품처럼 여러 화면에 걸친 것을 바꿀 때, 바꾸기 전후에 각각 수집해
 * scripts/compare-styles.mjs로 비교한다. 사용법은 그 스크립트 머리말을 따른다.
 * STYLE_OUT 환경변수가 없으면 건너뛴다.
 */
const output = process.env.STYLE_OUT;
const sizes = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 844, height: 390 },
];

/** 수집할 화면. 녹음 화면은 파형·시간이 계속 움직여 뺐다 */
const ROUTES: Array<{ id: string; route: string; apiState?: ApiTarget['apiState'] }> = [
  { id: 'home', route: '/' },
  { id: 'meetings', route: '/meetings' },
  { id: 'meeting-detail', route: '/meetings/fixture-document' },
  { id: 'participants', route: '/participants' },
  { id: 'settings', route: '/settings' },
  { id: 'document-change', route: '/settings/document' },
  { id: 'new-meeting', route: '/meetings/new' },
  { id: 'processing', route: `/meetings/${sessionId}/processing`, apiState: 'processing' },
  { id: 'review', route: `/meetings/${sessionId}/review` },
  { id: 'complete', route: `/meetings/${sessionId}/complete`, apiState: 'complete' },
  { id: 'not-found', route: '/no-such-page' },
];

test.skip(!output, 'STYLE_OUT이 없으면 실행하지 않습니다.');
test.describe.configure({ mode: 'serial' });

async function collect(page: Page) {
  return page.evaluate(() => {
    const styles: Record<string, Record<string, string>> = {};
    const pathOf = (element: Element): string => {
      const parts: string[] = [];
      for (let node: Element | null = element; node && node !== document.documentElement; node = node.parentElement) {
        const index = node.parentElement ? [...node.parentElement.children].indexOf(node) : 0;
        parts.unshift(`${node.tagName.toLowerCase()}[${index}]`);
      }
      return parts.join('>');
    };
    for (const element of [document.documentElement, ...document.querySelectorAll('body *')]) {
      for (const pseudo of ['', '::before', '::after']) {
        const style = getComputedStyle(element, pseudo || null);
        if (pseudo && style.content === 'none') continue;
        const values: Record<string, string> = {};
        // 진행 중 애니메이션 값은 매번 달라 뺀다
        for (const property of style) if (!property.startsWith('animation') && !property.startsWith('transition')) values[property] = style.getPropertyValue(property);
        styles[pathOf(element) + pseudo] = values;
      }
    }
    return styles;
  });
}

test('화면 계산 스타일 수집', async ({ page }) => {
  test.setTimeout(600_000);
  const result: Record<string, Record<string, Record<string, string>>> = {};
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const target of ROUTES) {
    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await installSyntheticApi(page, { apiState: target.apiState });
      await page.goto(target.route);
      await expect(page.locator('main').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1000);
      result[`${target.id} ${size.width}x${size.height}`] = await collect(page);
    }
  }
  mkdirSync(dirname(output!), { recursive: true });
  writeFileSync(output!, JSON.stringify(result));
});
