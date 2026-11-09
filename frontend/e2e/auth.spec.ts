import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * AUTH-01·02 로그인 화면 검사 (GitHub #13·#14·#15).
 * 개발 서버는 인증 목업(src/auth/authMock.ts)을 쓴다: 메일을 보내지 않고 인증 코드는 123456이다.
 * 실제 API 응답 해석은 단위 테스트(authApi.test.ts)가 검사한다.
 */
test.use({ storageState: { cookies: [], origins: [] } });

// 목업은 메일 미설정으로 시작한다. 메일 설정 흐름 테스트를 뺀 나머지는 설정된 상태에서 시작한다
const MOCK_MAIL_KEY = 'ma-auth-mock-mail-configured';
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.includes('메일 설정')) return;
  await page.addInitScript((key) => localStorage.setItem(key, '1'), MOCK_MAIL_KEY);
});

const SIZES = [
  { label: '휴대폰', width: 390, height: 844 },
  { label: '태블릿 세로', width: 820, height: 1180 },
  { label: '태블릿 가로', width: 1180, height: 820 },
  { label: '낮은 화면', width: 844, height: 390 },
];

async function expectAccessibleWithoutOverflow(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');
  expect(serious, serious.map(({ id, help, nodes }) => `${id}: ${help} (${nodes.length})`).join('\n')).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function goToVerify(page: Page) {
  await page.goto('/login');
  await page.getByLabel('회사 이메일').fill('meet@miinit.com');
  await page.getByRole('button', { name: '인증 코드 받기' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '인증 코드 입력' })).toBeVisible();
}

for (const size of SIZES) {
  test(`AUTH-01 · ${size.label}: axe 심각 위반 0건, 가로 넘침 없음`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: '회사 이메일로 로그인' })).toBeVisible();
    await expectAccessibleWithoutOverflow(page);
  });

  test(`AUTH-02 · ${size.label}: axe 심각 위반 0건, 가로 넘침 없음`, async ({ page }) => {
    await page.setViewportSize(size);
    await goToVerify(page);
    await expectAccessibleWithoutOverflow(page);
  });
}

test('회사 도메인이 아니면 코드를 요청하지 않는다', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('회사 이메일').fill('meet@gmail.com');
  await page.getByRole('button', { name: '인증 코드 받기' }).click();
  await expect(page.getByText('회사 이메일 주소(@miinit.com)로만 로그인할 수 있습니다.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: '회사 이메일로 로그인' })).toBeVisible();
});

test('메인 화면에 들어가면 로그인이 먼저 나오고, 로그인하면 메인 화면으로 돌아간다', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('회사 이메일').fill('meet@miinit.com');
  await page.getByRole('button', { name: '인증 코드 받기' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '인증 코드 입력' })).toBeVisible();

  await page.getByRole('textbox', { name: '1번째 자리' }).fill('1');
  await page.keyboard.type('11111');
  await expect(page.getByText('코드가 올바르지 않습니다. 다시 확인해 주세요.')).toBeVisible();

  await page.getByRole('textbox', { name: '1번째 자리' }).fill('1');
  await page.keyboard.type('23456');
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await expect(page.getByRole('heading', { level: 1, name: '회사 이메일로 로그인' })).toHaveCount(0);

  // 로그인 상태는 새로고침 뒤에도 남고, 로그인 화면에 다시 오면 메인으로 보낸다
  await page.reload();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await page.goto('/login');
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
});

test('다른 화면 주소로 들어오면 로그인 후 그 화면으로 돌아간다', async ({ page }) => {
  await page.goto('/meetings');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('회사 이메일').fill('meet@miinit.com');
  await page.getByRole('button', { name: '인증 코드 받기' }).click();
  await page.getByRole('textbox', { name: '1번째 자리' }).fill('1');
  await page.keyboard.type('23456');
  await expect(page).toHaveURL(/\/meetings$/);
});

for (const size of [SIZES[0], SIZES[2]]) {
  test(`메일 설정 · ${size.label}: 미설정이면 설정 아이콘으로 팝업을 열고, 저장하면 코드를 받을 수 있다`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/login');
    await page.getByLabel('회사 이메일').fill('meet@miinit.com');
    await page.getByRole('button', { name: '인증 코드 받기' }).click();
    await expect(page.getByText('인증 코드를 보낼 메일 설정이 필요합니다.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: '회사 이메일로 로그인' })).toBeVisible();
    await expectAccessibleWithoutOverflow(page);

    await page.getByRole('button', { name: '메일 설정', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: '메일 설정' });
    await expect(dialog).toBeVisible();
    await expectAccessibleWithoutOverflow(page);
    await dialog.getByLabel('Google 클라이언트 ID').fill('id');
    await dialog.getByLabel('클라이언트 보안 키').fill('secret');
    await dialog.getByLabel('연결 토큰 (Refresh Token)').fill('token');
    await dialog.getByLabel('발신 이메일 주소').fill('mail@miinit.com');
    await dialog.getByRole('button', { name: '저장하고 연결 확인' }).click();
    await expect(dialog).toHaveCount(0);

    await expect(page.getByRole('button', { name: '메일 설정', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '인증 코드 받기' }).click();
    await expect(page.getByRole('heading', { level: 1, name: '인증 코드 입력' })).toBeVisible();
  });
}
