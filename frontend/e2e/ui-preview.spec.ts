import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * 부품 확인 화면(/__ui) 검사 (GitHub #9, README P-6·R-10·R-11).
 * 개발 서버에서만 열리는 화면이라 접근성 설정(playwright.a11y.config.ts)의 개발 서버로 실행한다.
 */
const VIEWS = [
  { name: '부품 전체', path: '/__ui', heading: '부품 확인 화면' },
  { name: '로그인 틀', path: '/__ui?view=login', heading: '회사 이메일로 로그인' },
  { name: '인증 코드 틀', path: '/__ui?view=verify', heading: '인증 코드 입력' },
];
const SIZES = [
  { label: '휴대폰', width: 390, height: 844 },
  { label: '태블릿 세로', width: 820, height: 1180 },
  { label: '태블릿 가로', width: 1180, height: 820 },
  { label: '낮은 화면', width: 844, height: 390 },
];

async function open(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

for (const view of VIEWS) {
  for (const size of SIZES) {
    test(`${view.name} · ${size.label}: axe 심각 위반 0건, 가로 넘침 없음`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await open(page, view.path, view.heading);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
        .analyze();
      const serious = results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');
      expect(serious, serious.map(({ id, help, nodes }) => `${id}: ${help} (${nodes.length})`).join('\n')).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}

test('키보드 포커스는 분홍 focus 색 외곽선으로 보인다', async ({ page }) => {
  await open(page, '/__ui', '부품 확인 화면');
  const button = page.getByRole('button', { name: '주 동작' });
  await button.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(button).toBeFocused();
  // 버튼의 색 전환(transition-colors)이 외곽선 색에도 걸리므로 전환이 끝날 때까지 기다린다
  await expect
    .poll(() =>
      button.evaluate((element) => {
        const style = getComputedStyle(element);
        return `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`;
      }),
    )
    .toBe('solid 2px rgb(196, 69, 123)');
});

test('대화상자는 Portal에서도 리뉴얼 글꼴을 쓰고 Esc로 닫힌다', async ({ page }) => {
  await open(page, '/__ui', '부품 확인 화면');
  await page.getByRole('button', { name: '메일 설정 열기' }).click();
  const dialog = page.getByRole('dialog', { name: '메일 설정' });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => getComputedStyle(element).fontFamily)).toContain('Pretendard');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('낮은 화면(short)에서는 인증 화면의 로고와 일러스트를 숨긴다', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await open(page, '/__ui?view=login', '회사 이메일로 로그인');
  await expect(page.getByRole('img', { name: 'Downforce' })).toBeHidden();
  await page.setViewportSize({ width: 1180, height: 820 });
  await expect(page.getByRole('img', { name: 'Downforce' })).toBeVisible();
});
