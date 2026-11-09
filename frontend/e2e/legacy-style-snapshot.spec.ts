import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test } from '@playwright/test';
import { installSyntheticApi, longKoreanTitle, screens, sessionId } from './fixtures';

/*
 * 기존 화면 계산 스타일 수집 (docs/renewal/스타일_전환_검토.md 4.2, 5.1).
 * 기존 CSS·legacy-reset·Tailwind 진입 파일을 바꾸기 전후에 각각 수집하고
 * scripts/compare-legacy-styles.mjs로 비교한다. 사용법은 그 스크립트 머리말을 따른다.
 * LEGACY_STYLE_OUT 환경변수가 없으면 건너뛴다.
 */
const output = process.env.LEGACY_STYLE_OUT;
const sizes = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
];

test.skip(!output, 'LEGACY_STYLE_OUT이 없으면 실행하지 않습니다.');
test.describe.configure({ mode: 'serial' });

test('기존 화면 계산 스타일 수집', async ({ page }) => {
  test.setTimeout(300_000);
  const result: Record<string, Record<string, Record<string, string>>> = {};
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const screen of screens) {
    for (const size of sizes) {
      await page.setViewportSize(size);
      if (screen.id === 'SCR-003') {
        await page.addInitScript((session) => sessionStorage.setItem('meeting-automation.recording-session', JSON.stringify(session)), {
          sessionId, version: 3, status: 'CREATED', title: longKoreanTitle,
          uploadPolicy: { chunkDurationSeconds: 30, maxChunkBytes: 1_000_000, acceptedMimeTypes: ['audio/webm'] },
        });
      }
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await installSyntheticApi(page, screen);
      await page.goto(screen.route);
      await expect(page.locator('main').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1000);

      result[`${screen.id} ${size.width}x${size.height}`] = await page.evaluate(() => {
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
          if (element.closest('[data-ui="renewal"]')) continue;
          for (const pseudo of ['', '::before', '::after']) {
            const style = getComputedStyle(element, pseudo || null);
            if (pseudo && style.content === 'none') continue;
            const values: Record<string, string> = {};
            for (const property of style) values[property] = style.getPropertyValue(property);
            styles[pathOf(element) + pseudo] = values;
          }
        }
        return styles;
      });
    }
  }

  mkdirSync(dirname(output!), { recursive: true });
  writeFileSync(output!, JSON.stringify(result));
});
