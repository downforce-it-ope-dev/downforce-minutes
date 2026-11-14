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
const DEPARTMENTS = ['AX팀', '운영팀', '', '경영지원팀'];
const participants = NAMES.map((name, index) => ({ id: `p${index}`, name, email: `user${index}@miinit.com`, department: DEPARTMENTS[index % DEPARTMENTS.length] }));
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

for (const [size, minRows] of [[SIZES[1], 8], [SIZES[2], 4]] as const) {
  test(`${size.label}: 참석자 ${minRows}행 이상 보이고 목록만 스크롤되며 회의 시작이 늘 보인다`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize(size);
    await page.goto('/meetings/new');
    const list = page.getByRole('list', { name: '참석자 목록' });
    await expect(list.getByRole('checkbox').first()).toBeVisible();
    const scroller = list.locator('..');
    const box = (await scroller.boundingBox())!;
    expect(Math.floor(box.height / 60)).toBeGreaterThanOrEqual(minRows);
    // 목록이 넘치면 목록 영역만 스크롤한다(페이지는 스크롤하지 않음). 태블릿 가로는 입력란이 한 줄이라 목록이 다 들어갈 수 있다
    if (minRows > 4) expect(await scroller.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
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

test('태블릿 가로: 등록 아이콘으로 오른쪽에서 밀려 나오는 새 참석자 패널을 열어 등록하면 선택된 상태로 들어가고, 닫으면 참석자가 다시 가로 가득', async ({ page }) => {
  await mock(page);
  await page.route('**/api/v1/participants', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 201, json: { data: { id: 'p-new', name: '가나다', email: 'new@miinit.com' } } })
      : route.fulfill({ json: { data: { items: participants } } }),
  );
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('/meetings/new');
  const picker = page.getByRole('region', { name: '참석자', exact: true });
  const fullWidth = (await picker.boundingBox())!.width;
  await expect(page.getByRole('region', { name: '새 참석자' })).toHaveCount(0);
  await page.getByRole('button', { name: '새 참석자' }).click();
  const panel = page.getByRole('region', { name: '새 참석자' });
  await expect(panel.getByRole('textbox', { name: '이름' })).toBeFocused();
  // 밀려 나오기가 끝나면 패널은 참석자 영역 오른쪽에 같은 높이로 선다
  await expect.poll(async () => Math.round((await panel.boundingBox())!.width)).toBe(288);
  const [a, b] = [(await panel.boundingBox())!, (await picker.boundingBox())!];
  expect(a.x).toBeGreaterThan(b.x + b.width);
  expect(Math.round(a.height)).toBe(Math.round(b.height));
  await panel.getByRole('textbox', { name: '이름' }).fill('가나다');
  await panel.getByRole('textbox', { name: '이메일' }).fill('new@miinit.com');
  await panel.getByRole('button', { name: '등록' }).click();
  await expect(page.getByRole('checkbox', { name: '가나다 new@miinit.com' })).toBeChecked();
  await expect(page.getByText('2명 선택됨')).toBeVisible();
  await panel.getByRole('button', { name: '새 참석자 닫기' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button', { name: '새 참석자' })).toBeFocused();
  await expect.poll(async () => Math.round((await picker.boundingBox())!.width)).toBe(Math.round(fullWidth));
});

test('태블릿 가로: 왼쪽 회의 정보(제목·템플릿·날짜 위아래), 오른쪽 참석자, 회의 시작은 맨 아래 가운데', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('/meetings/new');
  const info = (await page.getByRole('region', { name: '회의 정보' }).boundingBox())!;
  const picker = (await page.getByRole('region', { name: '참석자', exact: true }).boundingBox())!;
  expect(picker.x).toBeGreaterThan(info.x + info.width);
  const title = (await page.getByRole('textbox', { name: '회의 제목' }).boundingBox())!;
  const date = (await page.getByRole('button', { name: '회의 날짜' }).boundingBox())!;
  expect(date.y).toBeGreaterThan(title.y + title.height);
  const start = (await page.getByRole('button', { name: '회의 시작' }).boundingBox())!;
  const main = (await page.locator('#main-content').boundingBox())!;
  expect(Math.abs(start.x + start.width / 2 - (main.x + main.width / 2))).toBeLessThanOrEqual(1);
  expect(start.y).toBeGreaterThan(picker.y + picker.height);
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

for (const size of SIZES.slice(0, 3)) {
  test(`${size.label}: 회의 제목·날짜·템플릿·참석자 검색의 높이가 같다`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize(size);
    await page.goto('/meetings/new');
    await expect(page.getByRole('checkbox').first()).toBeVisible();
    const heights = await Promise.all(
      [
        page.getByRole('textbox', { name: '회의 제목' }),
        page.getByRole('button', { name: '회의 날짜' }),
        page.getByRole('radio', { name: '기본 회의록' }),
        page.getByRole('searchbox', { name: '참석자 검색' }),
      ].map(async (locator) => Math.round((await locator.boundingBox())!.height)),
    );
    expect(new Set(heights).size, heights.join(', ')).toBe(1);
  });
}

test('집중 모드: 메뉴가 없고, 태블릿 가로는 참석자를 두 단으로 보여 한 번에 8명 이상 보인다', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('/meetings/new');
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0);
  const list = page.getByRole('list', { name: '참석자 목록' });
  const boxes = list.getByRole('checkbox');
  await expect(boxes.first()).toBeVisible();
  // 두 단: 첫 사람과 다른 단의 사람이 같은 높이에서 시작한다
  const xs = new Set<number>();
  for (const box of await boxes.all()) xs.add(Math.round((await box.boundingBox())!.x));
  expect(xs.size).toBe(2);
  let visible = 0;
  for (const box of await boxes.all()) if (await box.isVisible() && (await box.boundingBox())!.y + 24 < (await list.locator('..').boundingBox())!.y + (await list.locator('..').boundingBox())!.height) visible += 1;
  expect(visible).toBeGreaterThanOrEqual(8);
});

test('휴대폰: 집중 모드라 탭 바 없이 회의 시작이 화면 아래에 있다', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/meetings/new');
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0);
  const start = (await page.getByRole('button', { name: '회의 시작' }).boundingBox())!;
  expect(start.y + start.height).toBeGreaterThan(844 - 120);
});

test('높이가 낮은 큰 태블릿 가로(Galaxy Tab S9, 1280×650): 참석자 목록이 보이고 새 참석자 등록 버튼까지 화면 안에 있다', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1280, height: 650 });
  await page.goto('/meetings/new');
  const list = page.getByRole('list', { name: '참석자 목록' });
  await expect(list.getByRole('checkbox').first()).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: '새 참석자' }).click();
  const panel = page.getByRole('region', { name: '새 참석자' });
  await expect(panel.getByRole('button', { name: '등록' })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: '회의 시작' })).toBeInViewport({ ratio: 1 });
});
