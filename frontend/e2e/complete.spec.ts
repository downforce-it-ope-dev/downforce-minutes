import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * MTG-05 회의 결과 (GitHub #30). API는 가로채서 응답한다. 로그인은 설정의 목업 세션.
 */
const SIZES = [
  { label: '휴대폰', width: 390, height: 844 },
  { label: '태블릿 세로', width: 820, height: 1180 },
  { label: '태블릿 가로', width: 1180, height: 820 },
  { label: '낮은 화면', width: 844, height: 390 },
];
const SESSION = 'complete-e2e';
const PEOPLE = ['홍길동', '김철수', '이영희', '박서준', '정하은'].map((name, index) => ({ id: `p${index}`, name, email: `user${index}@miinit.com` }));

async function mock(page: Page, status: 'COMPLETED' | 'COMPLETED_WITH_WARNINGS' = 'COMPLETED_WITH_WARNINGS') {
  await page.route(`**/api/v1/meeting-sessions/${SESSION}`, (route) => route.fulfill({ json: { data: {
    sessionId: SESSION, version: 9, status, allowedActions: [], document: { documentId: 'doc-1' },
    deliveries: PEOPLE.map((person, index) => ({
      deliveryId: `d${index}`, channel: 'EMAIL', recipientParticipantId: person.id,
      status: status === 'COMPLETED_WITH_WARNINGS' && index === 2 ? 'FAILED' : 'SENT', retryable: true,
    })),
  } } }));
  await page.route('**/api/v1/participants', (route) => route.fulfill({ json: { data: { items: PEOPLE } } }));
  await page.route('**/api/v1/app-config', (route) => route.fulfill({ json: { data: {
    company: { id: 'c', name: 'E', timezone: 'Asia/Seoul' },
    document: { provider: 'NOTION', configured: true, connectionVersion: 2, rootUrl: 'https://notion.example' },
    email: { enabled: true, configured: true },
  } } }));
}

for (const size of SIZES) {
  test(`MTG-05 · ${size.label}: axe 심각 위반 0건, 가로 넘침 없음, 메뉴 없음`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize(size);
    await page.goto(`/meetings/${SESSION}/complete`);
    await expect(page.getByRole('heading', { level: 2, name: '일부 전달 실패' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']).analyze();
    const serious = results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');
    expect(serious, serious.map(({ id, help, nodes }) => `${id}: ${help} (${nodes.length})`).join('\n')).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('태블릿 가로: 왼쪽 요약·단계, 오른쪽 이메일 수신자(실패 먼저)', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto(`/meetings/${SESSION}/complete`);
  const steps = (await page.getByRole('region', { name: '처리 단계' }).boundingBox())!;
  const email = page.getByRole('region', { name: '이메일' });
  expect((await email.boundingBox())!.x).toBeGreaterThan(steps.x + steps.width);
  await expect(email.getByRole('listitem').first()).toContainText('이영희');
  await expect(email.getByRole('button', { name: '이영희 재전송' })).toBeVisible();
});

test('모두 완료되면 저장된 회의록 보기로 회의록 상세에 간다', async ({ page }) => {
  await mock(page, 'COMPLETED');
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto(`/meetings/${SESSION}/complete`);
  await expect(page.getByRole('heading', { level: 2, name: '완료' })).toBeVisible();
  await expect(page.getByRole('link', { name: '저장된 회의록 보기' })).toHaveAttribute('href', '/meetings/doc-1');
});
