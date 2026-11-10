import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * MTG-01 새 회의 (GitHub #26). API는 가로채서 응답한다. 로그인은 설정의 목업 세션.
 */
const SIZES = [
  { label: '휴대폰', width: 390, height: 844 },
  { label: '태블릿 세로', width: 820, height: 1180 },
  { label: '태블릿 가로', width: 1180, height: 820 },
  { label: '낮은 화면', width: 844, height: 390 },
];
const ready = { version: 1, status: 'READY', active: { provider: 'NOTION', connectionVersion: 2, rootUrl: 'https://notion.example' }, draft: null, operation: null, canCreateMeeting: true };
const config = {
  company: { id: 'c1', name: 'Example', timezone: 'Asia/Seoul' },
  document: { provider: 'NOTION', configured: true, connectionVersion: 2, rootUrl: 'https://notion.example' },
  setup: { status: 'READY', required: false, canCreateMeeting: true, operationId: null },
};
const NAMES = ['강민수', '김지현', '박서준', '이도윤', '정하은', '최유진', '한지민', '오세훈', '윤아름', '임채원', '송민재', '조수아'];
const participants = NAMES.map((name, index) => ({ id: `p${index}`, name, email: `user${index}@miinit.com` }));
const ME = 'user3@miinit.com';

async function mock(page: Page) {
  await page.route('**/api/v1/document-setup', (route) => route.fulfill({ json: { data: ready } }));
  await page.route('**/api/v1/app-config', (route) => route.fulfill({ json: { data: config } }));
  await page.route('**/api/v1/templates', (route) =>
    route.fulfill({ json: { data: { items: [{ id: 'default.md', name: '기본 회의록', version: '1' }, { id: 'project.md', name: '프로젝트 회의', version: '1' }] } } }),
  );
  await page.route('**/api/v1/participants', (route) => route.fulfill({ json: { data: { items: participants } } }));
  await page.addInitScript((email) => localStorage.setItem('ma-auth-email', email), ME);
}

for (const size of SIZES) {
  test(`MTG-01 · ${size.label}: axe 심각 위반 0건, 가로 넘침 없음`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize(size);
    await page.goto('/meetings/new');
    await expect(page.getByRole('checkbox', { name: /이도윤 \(나\)/ })).toBeChecked();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']).analyze();
    const serious = results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');
    expect(serious, serious.map(({ id, help, nodes }) => `${id}: ${help} (${nodes.length})`).join('\n')).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

for (const size of SIZES.slice(1, 3)) {
  test(`${size.label}: 참석자 8행 이상 보이고 목록만 스크롤되며 회의 시작이 늘 보인다`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize(size);
    await page.goto('/meetings/new');
    const list = page.getByRole('list', { name: '참석자 목록' });
    await expect(list.getByRole('checkbox').first()).toBeVisible();
    const scroller = list.locator('..');
    const box = (await scroller.boundingBox())!;
    expect(Math.floor(box.height / 60)).toBeGreaterThanOrEqual(8);
    // 목록 영역이 따로 스크롤된다(페이지는 스크롤하지 않음)
    expect(await scroller.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    const main = page.getByRole('main');
    expect(await main.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
    const start = page.getByRole('button', { name: '회의 시작' });
    await expect(start).toBeInViewport();
  });
}

test('휴대폰: 검색 → 체크 → 검색 지우기 후에도 선택 유지, 선택됨 보기로 확인, 회의 시작 → 녹음 화면', async ({ page }) => {
  await mock(page);
  let body: { participantIds?: string[] } = {};
  await page.route('**/api/v1/meeting-sessions', (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({
      status: 201,
      json: { data: { sessionId: 's-e2e', version: 1, status: 'CREATED', uploadPolicy: { chunkDurationSeconds: 30, maxChunkBytes: 1000000, acceptedMimeTypes: ['audio/webm'] } } },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/meetings/new');
  await expect(page.getByRole('button', { name: '회의 시작' })).toBeInViewport();
  await page.getByRole('searchbox', { name: '참석자 검색' }).fill('한지');
  await page.getByRole('checkbox', { name: /한지민/ }).check();
  await page.getByRole('button', { name: '검색어 지우기' }).first().click();
  await expect(page.getByRole('checkbox', { name: /한지민/ })).toBeChecked();
  await page.getByRole('button', { name: '선택됨 2' }).click();
  await expect(page.getByRole('list', { name: '참석자 목록' }).getByRole('checkbox')).toHaveCount(2);
  await page.getByRole('textbox', { name: '회의 제목' }).fill('[테스트] 주간 회의');
  await page.getByRole('button', { name: '회의 시작' }).click();
  await expect(page).toHaveURL(/\/meetings\/s-e2e\/recording$/);
  expect(body.participantIds?.sort()).toEqual(['p3', 'p6']);
});
