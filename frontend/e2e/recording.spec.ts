import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * MTG-02 회의 녹음 (GitHub #27). 크롬 가짜 마이크로 녹음한다. API는 가로채서 응답한다.
 */
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['microphone'],
});

const SIZES = [
  { label: '휴대폰', width: 390, height: 844 },
  { label: '태블릿 세로', width: 820, height: 1180 },
  { label: '태블릿 가로', width: 1180, height: 820 },
  { label: '낮은 화면', width: 844, height: 390 },
];
const session = {
  sessionId: 's-e2e',
  title: '2026년 4분기 AX 플랫폼 로드맵 점검 및 다음 분기 우선순위 합의 회의',
  version: 1,
  status: 'CREATED',
  uploadPolicy: { chunkDurationSeconds: 1, maxChunkBytes: 5_000_000, acceptedMimeTypes: ['audio/webm', 'audio/webm;codecs=opus', 'audio/mp4'] },
  draft: {
    title: '2026년 4분기 AX 플랫폼 로드맵 점검 및 다음 분기 우선순위 합의 회의',
    meetingDate: '2026-11-10',
    templateId: 'default.md',
    participantIds: ['p1', 'p2', 'p3'],
    templateName: '기본 회의록',
    participants: [
      { name: '홍길동', email: 'hong@miinit.com' },
      { name: '김철수', email: 'kim@miinit.com' },
      { name: '이영희', email: 'lee@miinit.com' },
    ],
  },
};

async function mock(page: Page) {
  await page.addInitScript((value) => sessionStorage.setItem('meeting-automation.recording-session', JSON.stringify(value)), session);
  await page.route('**/api/v1/meeting-sessions/s-e2e/audio', (route) => route.fulfill({ json: { data: { receivedSequences: [], receivedChunks: 0, totalBytes: 0 } } }));
  await page.route('**/api/v1/meeting-sessions/s-e2e/audio/chunks/*', (route) => {
    const sequence = Number(route.request().url().split('/').pop());
    return route.fulfill({ json: { data: { sequence, received: true } } });
  });
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']).analyze();
  const serious = results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');
  expect(serious, serious.map(({ id, help, nodes }) => `${id}: ${help} (${nodes.length})`).join('\n')).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const size of SIZES) {
  test(`MTG-02 · ${size.label}: 대기·녹음 중 axe 심각 위반 0건, 가로 넘침 없음, 녹음 버튼이 보인다`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize(size);
    await page.goto('/meetings/s-e2e/recording');
    await expect(page.getByRole('status', { name: '마이크 입력이 감지되었습니다' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0);
    await expectAccessible(page);
    await page.getByRole('button', { name: '녹음 시작' }).click();
    await expect(page.getByText('녹음 중')).toBeVisible();
    await expect(page.getByRole('button', { name: '일시정지' })).toBeInViewport();
    await expect(page.getByRole('button', { name: '회의 종료' })).toBeInViewport();
    await expectAccessible(page);
  });
}

test('태블릿: 녹음 버튼 둘 다 지름 96, 사이 24 이상, 경과 시간은 화면 위쪽 절반', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/meetings/s-e2e/recording');
  await page.getByRole('button', { name: '녹음 시작' }).click();
  await expect(page.getByText('녹음 중')).toBeVisible();
  const circle = (name: string) => page.getByRole('button', { name }).locator('span').first().boundingBox();
  const [primary, end] = [(await circle('일시정지'))!, (await circle('회의 종료'))!];
  expect(Math.round(primary.width)).toBe(96);
  expect(Math.round(end.width)).toBe(96);
  expect(end.x - (primary.x + primary.width)).toBeGreaterThanOrEqual(24);
  const timer = (await page.getByLabel('경과 시간').boundingBox())!;
  expect(timer.y + timer.height).toBeLessThan(1180 / 2);
});

test('태블릿 가로: 오른쪽 회의 정보에 날짜·템플릿·참석자(이름·이메일)', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('/meetings/s-e2e/recording');
  const info = page.getByRole('region', { name: '회의 정보' });
  await expect(info).toBeVisible();
  await expect(info.getByText('기본 회의록')).toBeVisible();
  await expect(info.getByRole('listitem')).toHaveText(['홍길동hong@miinit.com', '김철수kim@miinit.com', '이영희lee@miinit.com']);
  const panel = (await page.getByRole('region', { name: '녹음' }).boundingBox())!;
  expect((await info.boundingBox())!.x).toBeGreaterThan(panel.x + panel.width);
});

test('녹음 → 일시정지 → 재개 → 종료 확인(계속 녹음이 기본) → 종료하면 업로드 후 처리 화면으로 간다', async ({ page }) => {
  await mock(page);
  let processBody: unknown = null;
  await page.route('**/api/v1/meeting-sessions/s-e2e/process', (route) => {
    processBody = route.request().postDataJSON();
    return route.fulfill({ status: 202, json: { data: { sessionId: 's-e2e', status: 'PROCESSING', stage: 'AUDIO_ASSEMBLY' } } });
  });
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/meetings/s-e2e/recording');
  await page.getByRole('button', { name: '녹음 시작' }).click();
  await expect(page.getByRole('button', { name: '회의 준비로 돌아가기' })).toHaveCount(0);
  await expect(page.getByRole('img', { name: '자동 저장 중' })).toBeVisible();
  await page.getByRole('button', { name: '일시정지' }).click();
  await expect(page.getByText('일시정지됨')).toBeVisible();
  await page.getByRole('button', { name: '녹음 재개' }).click();
  await page.getByRole('button', { name: '회의 종료' }).click();
  const dialog = page.getByRole('dialog', { name: '회의를 종료할까요?' });
  await expect(dialog.getByRole('button', { name: '계속 녹음' })).toBeFocused();
  await dialog.getByRole('button', { name: '회의 종료' }).click();
  await expect(page).toHaveURL(/\/meetings\/s-e2e\/processing$/, { timeout: 15_000 });
  expect(processBody).toMatchObject({ mimeType: expect.stringContaining('audio/') });
});

test('높이가 낮은 큰 태블릿 가로(Galaxy Tab S9, 1280×650): 녹음 버튼과 이름이 화면 안에 있다', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1280, height: 650 });
  await page.goto('/meetings/s-e2e/recording');
  await expect(page.getByRole('button', { name: '녹음 시작' })).toBeInViewport({ ratio: 1 });
  expect(await page.locator('#main-content').evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(0);
});
