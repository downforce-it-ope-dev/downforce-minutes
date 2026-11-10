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

for (const [size, minRows] of [[SIZES[1], 8], [SIZES[2], 5]] as const) {
  test(`${size.label}: 참석자 ${minRows}행 이상 보이고 목록만 스크롤되며 회의 시작이 늘 보인다`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize(size);
    await page.goto('/meetings/new');
    const list = page.getByRole('list', { name: '참석자 목록' });
    await expect(list.getByRole('checkbox').first()).toBeVisible();
    const scroller = list.locator('..');
    const box = (await scroller.boundingBox())!;
    expect(Math.floor(box.height / 60)).toBeGreaterThanOrEqual(minRows);
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

test('태블릿 가로: 오른쪽 패널에서 새 참석자를 등록하면 목록에 선택된 상태로 들어간다', async ({ page }) => {
  await mock(page);
  await page.route('**/api/v1/participants', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 201, json: { data: { id: 'p-new', name: '가나다', email: 'new@miinit.com' } } })
      : route.fulfill({ json: { data: { items: participants } } }),
  );
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('/meetings/new');
  const panel = page.getByRole('region', { name: '새 참석자' });
  await panel.getByRole('textbox', { name: '이름' }).fill('가나다');
  await panel.getByRole('textbox', { name: '이메일' }).fill('new@miinit.com');
  await panel.getByRole('button', { name: '등록' }).click();
  await expect(page.getByRole('checkbox', { name: '가나다 new@miinit.com' })).toBeChecked();
  await expect(page.getByText('2명 선택됨')).toBeVisible();
});

test('태블릿 세로: 큰 달력에서 날짜를 고른다 (axe 심각 위반 0건, 날짜 칸 48 이상)', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/meetings/new');
  await page.getByRole('button', { name: '회의 날짜' }).click();
  const dialog = page.getByRole('dialog', { name: '회의 날짜' });
  const today = dialog.getByRole('button', { pressed: true });
  const box = (await today.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(48);
  expect(box.height).toBeGreaterThanOrEqual(48);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']).analyze();
  const serious = results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');
  expect(serious, serious.map(({ id, help, nodes }) => `${id}: ${help} (${nodes.length})`).join('\n')).toEqual([]);
  await today.press('ArrowRight');
  // 다음 날 칸으로 초점이 옮겨 간 뒤 고른다 (월말이면 다음 달로 넘어간다)
  await expect(today).not.toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '회의 날짜' })).not.toContainText('오늘');
});
