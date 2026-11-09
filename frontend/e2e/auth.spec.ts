import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * AUTH-01·02 로그인 화면 검사 (GitHub #13·#14). API는 가로채서 응답한다(실제 메일 발송 없음).
 */
const SIZES = [
  { label: '휴대폰', width: 390, height: 844 },
  { label: '태블릿 세로', width: 820, height: 1180 },
  { label: '태블릿 가로', width: 1180, height: 820 },
  { label: '낮은 화면', width: 844, height: 390 },
];

async function mockApi(page: Page, verifyStatus = 400) {
  await page.route('**/api/v1/integrations/email', (route) =>
    route.fulfill({ json: { data: { configured: true, connectionVerified: true } } }),
  );
  await page.route('**/api/v1/auth/otp-requests', (route) =>
    route.fulfill({ status: 202, json: { data: { expiresInSeconds: 60, resendAfterSeconds: 60 } } }),
  );
  await page.route('**/api/v1/auth/otp-verifications', (route) =>
    route.fulfill({ status: verifyStatus, json: { data: { verified: verifyStatus === 200 } } }),
  );
}

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
    await mockApi(page);
    await page.setViewportSize(size);
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: '회사 이메일로 로그인' })).toBeVisible();
    await expectAccessibleWithoutOverflow(page);
  });

  test(`AUTH-02 · ${size.label}: axe 심각 위반 0건, 가로 넘침 없음`, async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize(size);
    await goToVerify(page);
    await expectAccessibleWithoutOverflow(page);
  });
}

test('회사 도메인이 아니면 코드를 요청하지 않는다', async ({ page }) => {
  await mockApi(page);
  let requested = false;
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/auth/otp-requests')) requested = true;
  });
  await page.goto('/login');
  await page.getByLabel('회사 이메일').fill('meet@gmail.com');
  await page.getByRole('button', { name: '인증 코드 받기' }).click();
  await expect(page.getByText('회사 이메일 주소(@miinit.com)로만 로그인할 수 있습니다.')).toBeVisible();
  expect(requested).toBe(false);
});

test('틀린 코드는 오류를 보이고, 맞는 코드는 홈으로 보낸다', async ({ page }) => {
  await mockApi(page);
  await goToVerify(page);
  await page.getByRole('textbox', { name: '1번째 자리' }).fill('1');
  await page.keyboard.type('11111');
  await expect(page.getByRole('alert')).toHaveText('코드가 올바르지 않습니다. 다시 확인해 주세요.');

  await page.unroute('**/api/v1/auth/otp-verifications');
  await page.route('**/api/v1/auth/otp-verifications', (route) =>
    route.fulfill({ status: 200, json: { data: { verified: true, sessionId: 'test' } } }),
  );
  await page.getByRole('textbox', { name: '1번째 자리' }).fill('1');
  await page.keyboard.type('23456');
  await expect(page).toHaveURL(/\/$/);
});
