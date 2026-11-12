import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * PTC-01 참석자 관리 (GitHub #36). API는 가로채서 응답한다(운영 참석자를 바꾸지 않는다). 로그인은 설정의 목업 세션.
 */
const SIZES = [
  { label: '휴대폰', width: 390, height: 844 },
  { label: '태블릿 세로', width: 820, height: 1180 },
  { label: '태블릿 가로', width: 1180, height: 820 },
  { label: '낮은 화면', width: 844, height: 390 },
];
const NAMES = ['홍길동', '김철수', '이영희', '박서준', '정하은', '최민수', '강지원', '윤서연', '장도윤', '임하준', '한지민', '오세훈', '서지우', '신예린'];
const ROSTER = NAMES.map((name, index) => ({ id: `p${index}`, name, email: `user${index}@miinit.com` }));
const ready = { version: 1, status: 'READY', active: { provider: 'NOTION', connectionVersion: 2, rootUrl: 'https://notion.example' }, draft: null, operation: null, canCreateMeeting: true };

async function mock(page: Page, roster: unknown[] = ROSTER) {
  const posts: unknown[] = [];
  await page.route('**/api/v1/document-setup', (route) => route.fulfill({ json: { data: ready } }));
  await page.route('**/api/v1/participants', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      posts.push(body);
      await route.fulfill({ status: 201, json: { data: { id: 'new', ...body } } });
      return;
    }
    await route.fulfill({ json: { data: { items: roster } } });
  });
  return posts;
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']).analyze();
  const serious = results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');
  expect(serious, serious.map(({ id, help, nodes }) => `${id}: ${help} (${nodes.length}) ${nodes.map((node) => node.target).join(', ')}`).join('\n')).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const size of SIZES) {
  test(`PTC-01 · ${size.label}: axe 심각 위반 0건, 가로 넘침 없음`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize(size);
    await page.goto('/participants');
    await expect(page.getByRole('list', { name: '참석자 목록' })).toBeVisible();
    await expectAccessible(page);
  });

  test(`PTC-01-P01 · ${size.label}: 추가 대화상자 axe 심각 위반 0건`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize(size);
    await page.goto('/participants');
    await page.getByRole('button', { name: '참석자 추가' }).click();
    await expect(page.getByRole('dialog', { name: '참석자 추가' })).toBeVisible();
    await expectAccessible(page);
  });
}

test('PTC-01 태블릿: 위쪽 검색창, 전체 폭 한 줄 행(이름 | 이메일 | 삭제), 하단 가운데 참석자 추가', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('/participants');
  const search = (await page.getByRole('searchbox', { name: '참석자 검색' }).boundingBox())!;
  const list = page.getByRole('list', { name: '참석자 목록' });
  const listBox = (await list.boundingBox())!;
  expect(listBox.y).toBeGreaterThan(search.y + search.height);
  expect(listBox.width).toBeGreaterThan(800);
  const row = list.getByRole('listitem').first();
  expect(Math.round((await row.getByRole('button', { name: /수정$/ }).boundingBox())!.height)).toBe(60);
  const name = (await row.getByText('강지원').boundingBox())!;
  const email = (await row.getByText('user6@miinit.com').boundingBox())!;
  expect(Math.abs(email.y - name.y)).toBeLessThanOrEqual(6);
  expect(email.x).toBeGreaterThan(name.x);
  const add = (await page.getByRole('button', { name: '참석자 추가' }).boundingBox())!;
  const main = (await page.locator('#main-content').boundingBox())!;
  expect(Math.abs(add.x + add.width / 2 - (main.x + main.width / 2))).toBeLessThanOrEqual(1);
  expect(add.y + add.height).toBeGreaterThan(820 - 40);
});

test('PTC-01 휴대폰: 2줄 행 72, 검색으로 거르기', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/participants');
  const list = page.getByRole('list', { name: '참석자 목록' });
  expect(Math.round((await list.getByRole('listitem').first().getByRole('button', { name: /수정$/ }).boundingBox())!.height)).toBe(72);
  await page.getByRole('searchbox', { name: '참석자 검색' }).fill('user13');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByText('참석자 1명')).toBeVisible();
});

test('PTC-01-P01: 회사 메일이 아니면 막고, 회사 메일이면 등록해 목록에 보인다', async ({ page }) => {
  const posts = await mock(page);
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/participants');
  await page.getByRole('button', { name: '참석자 추가' }).click();
  const dialog = page.getByRole('dialog', { name: '참석자 추가' });
  await dialog.getByRole('textbox', { name: '이름' }).fill('시험참석자');
  await dialog.getByRole('textbox', { name: '이메일' }).fill('test.ptc@gmail.com');
  await dialog.getByRole('button', { name: '저장' }).click();
  await expect(dialog.getByText('회사 메일(@miinit.com)만 등록할 수 있습니다.')).toBeVisible();
  expect(posts).toHaveLength(0);
  await dialog.getByRole('textbox', { name: '이메일' }).fill('test.ptc@miinit.com');
  await dialog.getByRole('button', { name: '저장' }).click();
  await expect(page.getByText('참석자를 추가했습니다')).toBeVisible();
  await expect(page.getByRole('button', { name: '시험참석자 수정' })).toBeVisible();
  expect(posts).toEqual([{ name: '시험참석자', email: 'test.ptc@miinit.com' }]);
});

// 한국어 Excel "CSV(쉼표로 분리)" 저장 형식(CP949): 메일계정,이름 / hong@miinit.com,홍길동
const CP949 = Buffer.from([184, 222, 192, 207, 176, 232, 193, 164, 44, 192, 204, 184, 167, 13, 10, 104, 111, 110, 103, 64, 109, 105, 105, 110, 105, 116, 46, 99, 111, 109, 44, 200, 171, 177, 230, 181, 191, 13, 10]);

for (const size of [SIZES[0], SIZES[1]]) {
  test(`PTC-01-P03 · ${size.label}: CP949 CSV를 읽어 확인 → 등록 → 결과, axe 심각 위반 0건`, async ({ page }) => {
    const posts = await mock(page);
    await page.setViewportSize(size);
    await page.goto('/participants');
    await page.getByRole('button', { name: 'CSV로 일괄 등록' }).click();
    const dialog = page.getByRole('dialog', { name: 'CSV로 일괄 등록' });
    await expect(dialog.getByRole('link', { name: '양식 내려받기' })).toBeVisible();
    await expectAccessible(page);
    await dialog.getByLabel('파일 선택').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: CP949 });
    const rows = dialog.getByRole('list', { name: 'CSV 행' });
    await expect(rows.getByRole('listitem')).toHaveCount(1);
    await expect(rows).toContainText('홍길동');
    await expect(rows).toContainText('hong@miinit.com');
    await expectAccessible(page);
    await dialog.getByRole('button', { name: '1명 등록' }).click();
    await expect(dialog.getByRole('button', { name: '완료' })).toBeVisible();
    await expect(dialog.getByRole('definition').first()).toHaveText('1명');
    await expectAccessible(page);
    await dialog.getByRole('button', { name: '완료' }).click();
    await expect(page.getByText('참석자 1명을 등록했습니다')).toBeVisible();
    // 서버 목록이 아직 새 참석자를 주지 않아도(문서 서비스 조회 지연) 등록한 사람이 바로 보인다
    await expect(page.getByRole('list', { name: '참석자 목록' }).getByText('hong@miinit.com')).toBeVisible();
    expect(posts).toEqual([{ name: '홍길동', email: 'hong@miinit.com' }]);
  });
}

test('양식 파일은 UTF-8 BOM CSV(메일계정,이름)다', async ({ request }) => {
  const response = await request.get('/participants-template.csv');
  expect(response.ok()).toBe(true);
  const body = await response.body();
  expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(body.subarray(3).toString('utf8').split(/\r?\n/)[0]).toBe('메일계정,이름');
});

test('PTC-01-P03: 파일을 끌어다 놓아도 읽는다(영역이 선택 색으로 바뀐다)', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('/participants');
  await page.getByRole('button', { name: 'CSV로 일괄 등록' }).click();
  const zone = page.getByTestId('csv-drop-zone');
  const transfer = await page.evaluateHandle((bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], 'people.csv', { type: 'text/csv' }));
    return data;
  }, [...CP949]);
  await zone.dispatchEvent('dragenter', { dataTransfer: transfer });
  await expect(zone).toHaveClass(/border-primary/);
  await zone.dispatchEvent('dragover', { dataTransfer: transfer });
  await zone.dispatchEvent('drop', { dataTransfer: transfer });
  const rows = page.getByRole('dialog', { name: 'CSV로 일괄 등록' }).getByRole('list', { name: 'CSV 행' });
  await expect(rows.getByRole('listitem')).toHaveCount(1);
  await expect(rows).toContainText('홍길동');
});
