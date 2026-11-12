import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * SET-01 설정 (GitHub #39). API는 가로채서 응답한다(운영 메일 설정을 바꾸지 않는다). 로그인은 설정의 목업 세션.
 */
const SIZES = [
  { label: '휴대폰', width: 390, height: 844 },
  { label: '태블릿 세로', width: 820, height: 1180 },
  { label: '태블릿 가로', width: 1180, height: 820 },
  { label: '낮은 화면', width: 844, height: 390 },
];
const CONFIGURED = {
  configured: true, connectionVerified: true, maskedClientId: '••••1234.apps.googleusercontent.com', maskedClientSecret: '••••••••',
  maskedRefreshToken: '••••••••', senderAddress: 'minutes@gmail.com', verifiedAt: null,
};

async function mock(page: Page) {
  await page.route('**/api/v1/app-config', (route) => route.fulfill({ json: { data: {
    company: { id: 'c', name: 'E', timezone: 'Asia/Seoul' },
    document: { provider: 'NOTION', configured: true, connectionVersion: 2, rootUrl: 'https://notion.example' },
    email: { enabled: true, configured: true },
  } } }));
  await page.route('**/api/v1/integrations/health', (route) => route.fulfill({ json: { data: {
    document: { provider: 'NOTION', configured: true, reachable: true, rootAccessible: true },
    email: { configured: true, reachable: false },
  } } }));
  await page.route('**/api/v1/integrations/email', (route) => route.fulfill({ json: { data: CONFIGURED } }));
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']).analyze();
  const serious = results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');
  expect(serious, serious.map(({ id, help, nodes }) => `${id}: ${help} (${nodes.length}) ${nodes.map((node) => node.target).join(', ')}`).join('\n')).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const size of SIZES) {
  test(`SET-01 · ${size.label}: axe 심각 위반 0건, 가로 넘침 없음, Slack 없음`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize(size);
    await page.goto('/settings');
    await expect(page.getByText('minutes@gmail.com')).toBeVisible();
    await expect(page.getByText(/Slack/)).toHaveCount(0);
    await expectAccessible(page);
  });

  test(`SET-01 수정 · ${size.label}: 입력 폼 axe 심각 위반 0건`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize(size);
    await page.goto('/settings');
    await page.getByRole('button', { name: '수정' }).click();
    await expect(page.getByRole('form', { name: '이메일 설정' })).toBeVisible();
    await expectAccessible(page);
  });
}

test('SET-01 태블릿 가로: 문서 연결 카드 아래 이메일 카드(위아래, 본문 전체 폭), 상태 배지는 글자와 함께', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('/settings');
  const documentCard = page.getByRole('region', { name: '문서 연결' });
  const emailCard = page.getByRole('region', { name: '이메일 (Gmail)' });
  await expect(documentCard.getByText('연결됨')).toBeVisible();
  await expect(emailCard.getByText('연결 불가')).toBeVisible();
  const top = (await documentCard.boundingBox())!;
  const bottom = (await emailCard.boundingBox())!;
  expect(bottom.y).toBeGreaterThan(top.y + top.height);
  expect(Math.abs(bottom.x - top.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(bottom.width - top.width)).toBeLessThanOrEqual(1);
  expect(top.width).toBeGreaterThan(800);
});

test('SET-01 삭제 확인 대화상자', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/settings');
  await page.getByRole('button', { name: '삭제' }).click();
  const dialog = page.getByRole('dialog', { name: '이메일 설정을 삭제하시겠습니까?' });
  await expect(dialog.getByRole('button', { name: '취소' })).toBeVisible();
  await expectAccessible(page);
  await dialog.getByRole('button', { name: '취소' }).click();
  await expect(dialog).toHaveCount(0);
});
