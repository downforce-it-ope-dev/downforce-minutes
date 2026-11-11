import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * MIN-01 회의록 목록 (GitHub #32)·MIN-02 회의록 상세 (GitHub #33). API는 가로채서 응답한다. 로그인은 설정의 목업 세션.
 */
const SIZES = [
  { label: '휴대폰', width: 390, height: 844 },
  { label: '태블릿 세로', width: 820, height: 1180 },
  { label: '태블릿 가로', width: 1180, height: 820 },
  { label: '낮은 화면', width: 844, height: 390 },
];
const PEOPLE = ['홍길동', '김철수', '이영희', '박서준', '정하은'].map((name, index) => ({ id: `p${index}`, name }));
const LONG_TITLE = '분기별 제품 전략과 고객 지원 운영 현황을 함께 검토하는 장시간 회의 제목 예시';
const MEETINGS = Array.from({ length: 14 }, (_, index) => ({
  documentId: `doc-${index}`,
  title: index === 0 ? LONG_TITLE : `주간 회의 ${index}`,
  meetingAt: `2026-10-${String(28 - index).padStart(2, '0')}T10:00:00+09:00`,
  participants: PEOPLE.slice(0, (index % 5) + 1),
  documentUrl: null,
}));
const FAILURES = [1, 2, 3, 4].map((index) => ({
  sessionId: `s-${index}`, version: 2, title: `실패 회의 ${index}`, meetingAt: '2026-11-05T10:00:00+09:00', stage: 'TRANSCRIPTION',
  errorCode: 'X', audioExpiresAt: '2026-11-06T10:00:00+09:00', allowedActions: index === 4 ? [] : ['RETRY_PROCESSING'],
}));
const DETAIL = {
  documentId: 'doc-0', title: LONG_TITLE, meetingAt: '2026-10-28T10:00:00+09:00', participants: PEOPLE,
  minutes: {
    summary: '분기별 운영 계획을 요약합니다. '.repeat(12),
    discussionPoints: Array.from({ length: 8 }, (_, index) => `논의 항목 ${index + 1}: 고객 지원 운영 현황과 다음 분기 개선 방향을 검토했습니다.`),
    decisions: ['다음 회의 전까지 실행 계획을 정리합니다.'],
    actionItems: [{ ownerParticipantId: 'p0', task: '이번 분기 고객 의견과 운영 지표를 다시 검토하고 팀별 실행 계획과 담당 일정을 정리합니다.', dueDate: '2026-11-12' }],
    followUps: ['담당별 진행 상황을 확인합니다.'],
  },
  transcript: Array.from({ length: 20 }, (_, index) => ({
    segmentId: `seg-${index}`, speakerId: `p${index % 3}`, startMs: index * 15_000, endMs: index * 15_000 + 9_000, text: '회의에서 논의한 주요 내용을 확인합니다. '.repeat(3),
  })),
  documentUrl: 'https://notion.example/page',
};

// 회의록은 로그인한 사람(홍길동, e2e@miinit.com — 설정의 목업 세션)이 참석한 회의만 보인다. 모든 회의의 첫 참석자가 홍길동이다
const ROSTER = PEOPLE.map((person, index) => ({ ...person, email: index === 0 ? 'e2e@miinit.com' : `user${index}@miinit.com` }));

async function mock(page: Page, { failures = FAILURES }: { failures?: unknown[] } = {}) {
  await page.route('**/api/v1/participants', (route) => route.fulfill({ json: { data: { items: ROSTER } } }));
  await page.route('**/api/v1/meetings', (route) => route.fulfill({ json: { data: { items: MEETINGS } } }));
  await page.route('**/api/v1/meetings/doc-0', (route) => route.fulfill({ json: { data: DETAIL } }));
  await page.route('**/api/v1/meeting-sessions/processing-failures', (route) => route.fulfill({ json: { data: { items: failures } } }));
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']).analyze();
  const serious = results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');
  expect(serious, serious.map(({ id, help, nodes }) => `${id}: ${help} (${nodes.length}) ${nodes.map((node) => node.target).join(', ')}`).join('\n')).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const size of SIZES) {
  test(`MIN-01 · ${size.label}: axe 심각 위반 0건, 가로 넘침 없음`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize(size);
    await page.goto('/meetings');
    await expect(page.getByRole('list', { name: '회의록' })).toBeVisible();
    await expect(page.getByRole('region', { name: /처리 실패 4건/ })).toBeVisible();
    await expectAccessible(page);
  });

  test(`MIN-02 · ${size.label}: axe 심각 위반 0건, 가로 넘침 없음`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize(size);
    await page.goto('/meetings/doc-0');
    await expect(page.getByRole('heading', { level: 2, name: LONG_TITLE })).toBeVisible();
    await expectAccessible(page);
  });
}

test('MIN-01: 위쪽 넓은 검색창 + 원형 버튼, 그 아래 전체 폭 목록(태블릿은 한 줄 가로 배치)', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('/meetings');
  const search = page.getByRole('searchbox', { name: '회의 검색' });
  const period = page.getByRole('button', { name: '기간' });
  const sort = page.getByRole('button', { name: '정렬: 최신순' });
  const searchBox = (await search.boundingBox())!;
  const periodBox = (await period.boundingBox())!;
  expect(periodBox.width).toBe(52);
  expect(periodBox.height).toBe(52);
  expect(Math.abs(periodBox.y + 26 - (searchBox.y + searchBox.height / 2))).toBeLessThanOrEqual(2);
  expect(periodBox.x).toBeGreaterThan(searchBox.x + searchBox.width);
  expect(((await sort.boundingBox())!).x).toBeGreaterThan(periodBox.x);
  await expect(page.getByRole('button', { name: '조건 초기화' })).toHaveCount(0);
  const list = page.getByRole('list', { name: '회의록' });
  const listBox = (await list.boundingBox())!;
  expect(listBox.y).toBeGreaterThan(searchBox.y + searchBox.height);
  expect(listBox.width).toBeGreaterThan(800);
  // 한 줄 행: 일시가 회의명과 같은 줄, 오른쪽에 있다
  const row = list.getByRole('link').first();
  expect(Math.round((await row.boundingBox())!.height)).toBe(60);
  const title = row.getByText(LONG_TITLE);
  const date = row.getByText('2026.10.28 10:00', { exact: true }).last();
  expect(Math.abs((await date.boundingBox())!.y - (await title.boundingBox())!.y)).toBeLessThanOrEqual(4);
  expect((await date.boundingBox())!.x).toBeGreaterThan((await title.boundingBox())!.x);

  // 새 회의: 화면 아래 가운데 고정(상단 바에는 없다)
  const create = (await page.getByRole('button', { name: '새 회의' }).boundingBox())!;
  const main = (await page.locator('#main-content').boundingBox())!;
  expect(Math.abs(create.x + create.width / 2 - (main.x + main.width / 2))).toBeLessThanOrEqual(1);
  expect(create.y + create.height).toBeGreaterThan(820 - 40);
  await expect(page.getByRole('banner').getByRole('button', { name: '새 회의' })).toHaveCount(0);

  await period.click();
  const dialog = page.getByRole('dialog', { name: '기간' });
  await expect(dialog.getByRole('button', { name: '시작일' })).toBeVisible();
  await dialog.getByRole('button', { name: '확인' }).click();
  await sort.click();
  await expect(page.getByRole('button', { name: '정렬: 오래된순' })).toBeVisible();
  await expect(list.getByRole('link').first()).toContainText('주간 회의 13');
});

test('MIN-01 행 높이: 태블릿 60(한 줄), 휴대폰 72(2줄). 처리 실패는 태블릿 3건·휴대폰 1건 + 모두 보기', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/meetings');
  const row = page.getByRole('list', { name: '회의록' }).getByRole('link').first();
  expect(Math.round((await row.boundingBox())!.height)).toBe(60);
  const failures = page.getByRole('region', { name: /처리 실패/ });
  await expect(failures.getByRole('listitem')).toHaveCount(3);
  await failures.getByRole('button', { name: '모두 보기 4' }).click();
  await expect(failures.getByRole('listitem')).toHaveCount(4);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole('list', { name: '회의록' })).toBeVisible();
  expect(Math.round((await page.getByRole('list', { name: '회의록' }).getByRole('link').first().boundingBox())!.height)).toBe(72);
  await expect(page.getByRole('region', { name: /처리 실패/ }).getByRole('listitem')).toHaveCount(1);
});

test('MIN-01 → MIN-02 → 목록으로: 검색 조건 유지', async ({ page }) => {
  await mock(page, { failures: [] });
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/meetings');
  await page.getByRole('searchbox', { name: '회의 검색' }).fill('분기별');
  await expect(page.getByRole('list', { name: '회의록' }).getByRole('link')).toHaveCount(1);
  await page.getByRole('list', { name: '회의록' }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 2, name: LONG_TITLE })).toBeVisible();
  await page.getByRole('button', { name: '회의록 목록' }).click();
  await expect(page.getByRole('searchbox', { name: '회의 검색' })).toHaveValue('분기별');
  await expect(page.getByRole('list', { name: '회의록' }).getByRole('link')).toHaveCount(1);
});

test('MIN-02 태블릿 가로: 위아래 한 단(섹션 카드를 쌓음), 목차·전사 원문 패널 없음, 전사 원문은 대화상자', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('/meetings/doc-0');
  const summary = page.getByRole('region', { name: '회의 요약' });
  const discussion = page.getByRole('region', { name: '논의 내용' });
  const a = (await summary.boundingBox())!;
  const b = (await discussion.boundingBox())!;
  expect(b.y).toBeGreaterThan(a.y + a.height);
  expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(1);
  expect(a.width).toBeGreaterThan(800);
  await expect(page.getByRole('navigation', { name: '목차' })).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await page.getByRole('button', { name: '전사 원문' }).click();
  await expect(page.getByRole('dialog', { name: '전사 원문' }).getByRole('listitem')).toHaveCount(20);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('link', { name: '원본 문서' })).toHaveAttribute('target', '_blank');
});

test('MIN-02 휴대폰: 전사 원문은 하단 시트', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/meetings/doc-0');
  await page.getByRole('button', { name: '전사 원문' }).click();
  await expect(page.getByRole('dialog', { name: '전사 원문' })).toBeVisible();
});
