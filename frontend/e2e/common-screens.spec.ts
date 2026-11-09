import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * CMN-02 서버 연결 복구 · CMN-03 페이지 없음 (GitHub #18).
 * 로그인 상태는 설정의 목업 세션(e2e/authSession.ts)을 쓴다.
 */
const SIZES = [
  { label: '휴대폰', width: 390, height: 844 },
  { label: '태블릿 세로', width: 820, height: 1180 },
  { label: '태블릿 가로', width: 1180, height: 820 },
  { label: '낮은 화면', width: 844, height: 390 },
];

async function expectAccessibleWithoutOverflow(page: Page, include?: string) {
  const builder = new AxeBuilder({ page });
  // 복구 오버레이는 기존 화면 위에 뜬다. 뒤의 기존 화면(이미 아는 색 대비 문제)은 빼고 오버레이만 검사한다
  if (include) builder.include(include);
  const results = await builder
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');
  expect(serious, serious.map(({ id, help, nodes }) => `${id}: ${help} (${nodes.length})`).join('\n')).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** 서버가 응답하지 않는 상태. down=false로 바꾸면 복구된다 */
async function backend(page: Page) {
  const state = { down: true };
  await page.route('**/api/v1/**', (route) => {
    if (state.down) return route.abort('connectionrefused');
    if (route.request().url().includes('/system/health')) return route.fulfill({ json: { data: { status: 'UP' } } });
    return route.fulfill({ json: { data: [] } });
  });
  return state;
}

for (const size of SIZES) {
  test(`CMN-03 · ${size.label}: axe 심각 위반 0건, 가로 넘침 없음`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/abc');
    await expect(page.getByRole('heading', { level: 1, name: '페이지를 찾을 수 없습니다' })).toBeVisible();
    await expectAccessibleWithoutOverflow(page);
  });

  test(`CMN-02 · ${size.label}: axe 심각 위반 0건, 가로 넘침 없음`, async ({ page }) => {
    await backend(page);
    await page.setViewportSize(size);
    await page.goto('/meetings');
    await expect(page.getByRole('dialog', { name: '서버 연결을 확인하고 있어요' })).toBeVisible();
    await expectAccessibleWithoutOverflow(page, '[role="dialog"]');
  });
}

test('없는 주소는 페이지 없음을 앱 틀 안에 보이고, 홈·회의록으로 이동한다', async ({ page }) => {
  await page.goto('/abc/def');
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeVisible();
  await page.getByRole('link', { name: '회의록 목록' }).click();
  await expect(page).toHaveURL(/\/meetings$/);
  await page.goto('/abc');
  await page.getByRole('link', { name: '홈으로 이동' }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
});

test('로그인하지 않았으면 없는 주소도 로그인 화면이 먼저 나온다', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto('/abc');
  await expect(page).toHaveURL(/\/login$/);
  await context.close();
});

test('서버가 돌아오면 복구 표시 후 자동으로 닫히고, 닫기는 화면을 유지한다', async ({ page }) => {
  const state = await backend(page);
  await page.goto('/meetings');
  const dialog = page.getByRole('dialog', { name: '서버 연결을 확인하고 있어요' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: '복구 대기 닫기' })).toBeFocused();

  state.down = false;
  await page.getByRole('button', { name: '다시 확인' }).click();
  await expect(page.getByRole('dialog', { name: '서버가 다시 열렸어요' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/meetings$/);
});

/** 문서 연결 상태 조회(API-023). fail이면 500, 아니면 READY */
async function documentSetup(page: Page, mode: { fail: boolean }) {
  await page.route('**/api/v1/document-setup', (route) =>
    mode.fail
      ? route.fulfill({ status: 500, json: { error: { code: 'INTERNAL', message: 'x' } } })
      : route.fulfill({ json: { data: { status: 'READY', version: 1, draft: null, operation: null, canCreateMeeting: true } } }),
  );
  await page.route('**/api/v1/meetings**', (route) => route.fulfill({ json: { data: [] } }));
}

for (const size of SIZES) {
  test(`CMN-04 실패 · ${size.label}: axe 심각 위반 0건, 가로 넘침 없음, 기존 메뉴 숨김`, async ({ page }) => {
    await documentSetup(page, { fail: true });
    await page.setViewportSize(size);
    await page.goto('/meetings/new');
    await expect(page.getByRole('heading', { level: 1, name: '문서 연결 상태를 확인할 수 없습니다' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Windsoft Minutes 홈' })).toHaveCount(0);
    await expectAccessibleWithoutOverflow(page);
  });
}

test('문서 연결 확인이 다시 확인으로 통과하면 요청한 화면과 기존 메뉴가 보인다', async ({ page }) => {
  const mode = { fail: true };
  await documentSetup(page, mode);
  await page.goto('/meetings/new');
  await expect(page.getByRole('heading', { level: 1, name: '문서 연결 상태를 확인할 수 없습니다' })).toBeVisible();
  mode.fail = false;
  await page.getByRole('button', { name: '다시 확인' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '문서 연결 상태를 확인할 수 없습니다' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Windsoft Minutes 홈' })).toBeVisible();
  await expect(page).toHaveURL(/\/meetings\/new$/);
});
