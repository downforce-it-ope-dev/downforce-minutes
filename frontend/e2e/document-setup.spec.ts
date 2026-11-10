import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * 문서 연결 SET-02~06 (GitHub #20~#22). API는 가로채서 응답한다(운영 문서 연결을 바꾸지 않는다).
 */
const SIZES = [
  { label: '휴대폰', width: 390, height: 844 },
  { label: '태블릿 세로', width: 820, height: 1180 },
  { label: '태블릿 가로', width: 1180, height: 820 },
  { label: '낮은 화면', width: 844, height: 390 },
];
const source = { provider: 'NOTION', connectionVersion: 4, rootId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', rootUrl: 'https://notion.example/source' };
const unconfigured = { version: 0, status: 'UNCONFIGURED', active: null, draft: null, operation: null, canCreateMeeting: false };
const ready = { version: 10, status: 'READY', active: source, draft: null, operation: null, canCreateMeeting: true };
const prepared = { ...ready, version: 14, draft: { draftId: 'd', revision: 2, provider: 'CONFLUENCE', state: 'PREPARED' }, operation: { operationId: 'p1', type: 'INITIALIZE', status: 'SUCCEEDED' } };
const running = { ...unconfigured, version: 3, status: 'CONFIGURING', operation: { operationId: 'op1', type: 'INITIALIZE', status: 'RUNNING' } };
const runningOperation = {
  operationId: 'op1', type: 'INITIALIZE', status: 'RUNNING', stage: 'STRUCTURE', currentStep: 'PARTICIPANTS', completedSteps: ['ROOT', 'MEETINGS'],
  counts: { participantsTotal: 0, participantsCopied: 0, meetingsTotal: 0, meetingsCopied: 0 }, cancelRequested: false, retryable: false, allowedActions: [], version: 3,
};

async function mock(page: Page, snapshot: unknown) {
  await page.route('**/api/v1/document-setup**', (route) => {
    const url = route.request().url();
    if (url.includes('/operations/p1')) return route.fulfill({ json: { data: { ...runningOperation, operationId: 'p1', status: 'SUCCEEDED', stage: 'ACTIVATE' } } });
    if (url.includes('/operations/op1')) return route.fulfill({ json: { data: runningOperation } });
    return route.fulfill({ json: { data: snapshot } });
  });
}

async function expectAccessibleWithoutOverflow(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']).analyze();
  const serious = results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');
  expect(serious, serious.map(({ id, help, nodes }) => `${id}: ${help} (${nodes.length})`).join('\n')).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

const SCREENS = [
  { name: 'SET-03 서비스 선택', snapshot: unconfigured, path: '/setup/document', ready: (page: Page) => page.getByRole('button', { name: 'Notion 선택' }) },
  { name: 'SET-04 연결 정보', snapshot: unconfigured, path: '/setup/document', ready: async (page: Page) => {
    await page.getByRole('button', { name: 'Notion 선택' }).click();
    return page.getByLabel('Notion 내부 연결 토큰', { exact: true });
  } },
  { name: 'SET-05 진행', snapshot: running, path: '/setup/document', ready: (page: Page) => page.getByRole('list', { name: '문서 페이지 생성 진행 상황' }) },
  { name: 'SET-02 연결 관리', snapshot: ready, path: '/settings/document', ready: (page: Page) => page.getByRole('heading', { level: 1, name: '문서 연결' }) },
  { name: 'SET-06 자료 이전', snapshot: prepared, path: '/settings/document', ready: async (page: Page) => {
    await page.getByRole('button', { name: '문서 서비스 변경' }).click();
    return page.getByRole('heading', { name: '자료 이전 방식' });
  } },
];

for (const screen of SCREENS) {
  for (const size of SIZES) {
    test(`${screen.name} · ${size.label}: axe 심각 위반 0건, 가로 넘침 없음`, async ({ page }) => {
      await mock(page, screen.snapshot);
      await page.setViewportSize(size);
      await page.goto(screen.path);
      await expect(await screen.ready(page)).toBeVisible();
      await expectAccessibleWithoutOverflow(page);
    });
  }
}

test('연결 관리(SET-02)는 메뉴를 보이고, 마법사(SET-03~)는 메뉴를 숨긴다', async ({ page }) => {
  await mock(page, ready);
  await page.goto('/settings/document');
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeVisible();
  await page.getByRole('button', { name: '문서 서비스 변경' }).click();
  await expect(page.getByRole('button', { name: 'Notion 선택' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0);
  await expect(page.getByText('현재 연결: Notion')).toBeVisible();
});

test('비밀 입력은 보기 버튼으로 확인하고, 빈 칸은 오류 테두리와 토스트로 알린다', async ({ page }) => {
  await mock(page, unconfigured);
  await page.goto('/setup/document');
  await page.getByRole('button', { name: 'Notion 선택' }).click();
  const token = page.getByLabel('Notion 내부 연결 토큰', { exact: true });
  await token.fill('secret');
  await expect(token).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Notion 내부 연결 토큰 보기' }).click();
  await expect(token).toHaveAttribute('type', 'text');
  await token.fill('');
  await page.getByRole('button', { name: '연결 확인' }).click();
  await expect(token).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('필수 입력을 확인해 주세요.')).toBeVisible();
  await page.getByRole('button', { name: '연결 방법 안내' }).click();
  await expect(page.getByRole('dialog', { name: 'Notion 연결 방법' })).toBeVisible();
});
