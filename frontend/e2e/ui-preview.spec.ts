import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * 부품 확인 화면(/__ui) 검사 (GitHub #9, README P-6·R-10·R-11).
 * 개발 서버에서만 열리는 화면이라 접근성 설정(playwright.a11y.config.ts)의 개발 서버로 실행한다.
 */
const VIEWS = [
  { name: '부품 전체', path: '/__ui', heading: '부품 확인 화면' },
  { name: '앱 틀', path: '/__ui?view=shell', heading: '앱 틀' },
  { name: '집중 모드', path: '/__ui?view=focus', heading: '문서 연결' },
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

test('앱 틀 메뉴는 폭에 따라 탭 바 → 레일 → 사이드바로 바뀐다', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: '주 메뉴' });
  const box = async () => (await nav.boundingBox())!;

  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/__ui?view=shell', '앱 틀');
  expect((await box()).width).toBe(390);
  expect((await box()).y).toBeGreaterThan(700);

  await page.setViewportSize({ width: 820, height: 1180 });
  await expect.poll(async () => (await box()).width).toBe(88);
  await expect(nav.getByRole('img', { name: 'Downforce' })).toBeVisible();

  await page.setViewportSize({ width: 1180, height: 820 });
  await expect.poll(async () => (await box()).width).toBe(240);
});

test('앱 틀 메뉴를 키보드로 이동하면 해당 화면으로 가고 선택 표시가 붙는다', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await open(page, '/__ui?view=shell', '앱 틀');
  const settings = page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name: '설정' });
  await settings.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/settings$/);
});

test('집중 모드는 메뉴를 숨기고 뒤로 가기만 둔다', async ({ page }) => {
  await open(page, '/__ui?view=focus', '문서 연결');
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0);
  await page.getByRole('button', { name: '뒤로 가기' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '앱 틀' })).toBeVisible();
});

test('이탈 확인은 머무르기에 초점이 간다', async ({ page }) => {
  await open(page, '/__ui?view=shell', '앱 틀');
  await page.getByRole('button', { name: '이탈 확인 열기' }).click();
  await expect(page.getByRole('dialog', { name: '저장하지 않은 내용이 사라집니다. 나갈까요?' })).toBeVisible();
  await expect(page.getByRole('button', { name: '머무르기' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
