import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * HOME-01 메인 (GitHub #24). API는 가로채서 응답한다. 로그인은 설정의 목업 세션.
 */
const SIZES = [
  { label: '휴대폰', width: 390, height: 844 },
  { label: '태블릿 세로', width: 820, height: 1180 },
  { label: '태블릿 가로', width: 1180, height: 820 },
  { label: '낮은 화면', width: 844, height: 390 },
];
const ready = { version: 1, status: 'READY', active: { provider: 'NOTION', connectionVersion: 2, rootUrl: 'https://notion.example' }, draft: null, operation: null, canCreateMeeting: true };
const meetings = [
  { documentId: 'd1', title: 'AX 개발 미팅', meetingAt: '2026-11-05T10:00:00+09:00', participants: [{ id: 'p1', name: 'Ada' }, { id: 'p2', name: 'Grace' }], documentUrl: null },
  { documentId: 'd2', title: 'IAM 설계 리뷰', meetingAt: '2026-11-04T14:00:00+09:00', participants: [{ id: 'p3', name: 'Linus' }], documentUrl: null },
  { documentId: 'd3', title: 'GCP 인프라 논의', meetingAt: '2026-11-03T09:30:00+09:00', participants: [], documentUrl: null },
];

async function mock(page: Page) {
  await page.route('**/api/v1/document-setup', (route) => route.fulfill({ json: { data: ready } }));
  await page.route('**/api/v1/meeting-sessions/processing-failures', (route) => route.fulfill({ json: { data: { items: [] } } }));
  await page.route('**/api/v1/meetings?limit=3', (route) => route.fulfill({ json: { data: { items: meetings } } }));
  await page.addInitScript(() => localStorage.setItem('ma-auth-email', 'meet@miinit.com'));
}

for (const size of SIZES) {
  test(`HOME-01 · ${size.label}: axe 심각 위반 0건, 가로 넘침 없음`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize(size);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'AX 개발 미팅 상세 보기' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']).analyze();
    const serious = results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');
    expect(serious, serious.map(({ id, help, nodes }) => `${id}: ${help} (${nodes.length})`).join('\n')).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('태블릿 가로: 사이드바에 계정(이메일·로그아웃), 안내 패널, 새 회의, 최근 회의 카드 3개', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: '주 메뉴' });
  await expect(nav.getByText('meet@miinit.com')).toBeVisible();
  await expect(nav.getByRole('button', { name: '로그아웃' })).toBeVisible();
  await expect(page.getByRole('list', { name: '회의록 만드는 순서' })).toBeVisible();
  await expect(page.getByRole('button', { name: '새 회의' }).first()).toBeVisible();
  const cards = page.getByRole('link', { name: /상세 보기/ });
  await expect(cards).toHaveCount(3);
  const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
  expect(Math.round(a!.y)).toBe(Math.round(b!.y));
});

test('휴대폰: 계정 버튼으로 로그아웃하면 로그인 화면으로 가고, 다시 들어가도 홈에 들어가지 못한다', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '계정' }).click();
  await page.getByRole('dialog', { name: '계정' }).getByRole('button', { name: '로그아웃' }).click();
  await page.getByRole('dialog', { name: '로그아웃할까요?' }).getByRole('button', { name: '로그아웃' }).click();
  await expect(page).toHaveURL(/\/login$/);
  // 로그아웃 기록은 바꿔치기라 뒤로 가기는 앱 밖으로 간다. 홈 주소로 다시 들어가도 로그인 화면이어야 한다
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});
