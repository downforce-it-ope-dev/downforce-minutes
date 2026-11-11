import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * MTG-04 회의록 검토 (GitHub #29). API는 가로채서 응답한다. 로그인은 설정의 목업 세션.
 */
const SIZES = [
  { label: '휴대폰', width: 390, height: 844 },
  { label: '태블릿 세로', width: 820, height: 1180 },
  { label: '태블릿 가로', width: 1180, height: 820 },
  { label: '낮은 화면', width: 844, height: 390 },
];
const SESSION = 'review-e2e';
const review = {
  sessionId: SESSION,
  version: 3,
  status: 'REVIEW',
  meeting: { participantIds: ['p1', 'p2', 'p3'] },
  speakers: [
    { speakerId: 'sa', label: 'Speaker A', participantId: 'p1', participantName: '홍길동' },
    { speakerId: 'sb', label: 'Speaker B', participantId: null },
    { speakerId: 'sc', label: 'Speaker C', participantId: null },
  ],
  transcript: [
    { segmentId: 't1', speakerId: 'sa', startMs: 12_000, endMs: 30_000, text: '이번 주 배포 일정부터 정리하고 넘어갈게요. 금요일 오후가 좋겠습니다.' },
    { segmentId: 't2', speakerId: 'sb', startMs: 31_000, endMs: 40_000, text: 'IAM 권한 정리는 다음 주에 다시 보겠습니다.' },
    { segmentId: 't3', speakerId: 'sa', startMs: 41_000, endMs: 52_000, text: 'QA는 목요일까지 끝내는 걸로 하고 금요일에 배포하죠.' },
    { segmentId: 't4', speakerId: 'sc', startMs: 53_000, endMs: 58_000, text: '모니터링 대시보드도 같이 확인하겠습니다.' },
    { segmentId: 't5', speakerId: 'sb', startMs: 60_000, endMs: 70_000, text: '권한 요청 양식은 제가 초안을 만들어 공유할게요.' },
  ],
  minutes: {
    templateId: 'default.md',
    templateVersion: '1',
    summary: '배포 일정과 QA 완료 시점을 정했다.',
    discussionPoints: ['배포 일정', 'IAM 권한 정리'],
    decisions: ['목요일까지 QA 완료, 금요일 배포'],
    actionItems: [{ ownerParticipantId: 'p1', task: '배포 체크리스트 준비', dueDate: '2026-11-20' }],
    followUps: ['다음 주 권한 정리 회의'],
  },
  allowedActions: ['UPDATE_SPEAKER_MAPPING', 'UPDATE_MINUTES', 'CONFIRM'],
};

async function mock(page: Page) {
  await page.route(`**/api/v1/meeting-sessions/${SESSION}`, (route) => route.fulfill({ json: { data: review } }));
  await page.route('**/api/v1/participants', (route) => route.fulfill({ json: { data: { items: [
    { id: 'p1', name: '홍길동', email: 'hong@miinit.com' },
    { id: 'p2', name: '김철수', email: 'kim@miinit.com' },
    { id: 'p3', name: '이영희', email: 'lee@miinit.com' },
  ] } } }));
  await page.route('**/api/v1/app-config', (route) => route.fulfill({ json: { data: {
    company: { id: 'c', name: 'E', timezone: 'Asia/Seoul' },
    document: { provider: 'NOTION', configured: true, connectionVersion: 2, rootUrl: 'https://notion.example' },
    notification: { provider: null, enabled: false },
  } } }));
}

for (const size of SIZES) {
  test(`MTG-04 · ${size.label}: axe 심각 위반 0건, 가로 넘침 없음, 메뉴 없음`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize(size);
    await page.goto(`/meetings/${SESSION}/review`);
    await expect(page.getByRole('article').first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']).analyze();
    const serious = results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');
    expect(serious, serious.map(({ id, help, nodes }) => `${id}: ${help} (${nodes.length})`).join('\n')).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('화자 매핑: 화자마다 왼쪽에 대화 내용, 오른쪽에 참석자 선택 (태블릿 가로·세로)', async ({ page }) => {
  await mock(page);
  for (const size of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }]) {
    await page.setViewportSize(size);
    await page.goto(`/meetings/${SESSION}/review`);
    await expect(page.getByRole('tab', { name: /화자 매핑/ })).toHaveAttribute('aria-selected', 'true');
    const card = page.getByRole('article', { name: '화자 A' });
    const utterance = (await card.getByText(/이번 주 배포 일정부터/).boundingBox())!;
    const chips = (await card.getByRole('radiogroup').boundingBox())!;
    expect(chips.x).toBeGreaterThan(utterance.x + utterance.width - 1);
  }
});

test('회의록: 구역을 골라 편집하고, 항목을 추가해도 그 구역 안에서만 늘어난다. 발송은 가운데, 저장은 상단 바', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto(`/meetings/${SESSION}/review`);
  await page.getByRole('tab', { name: '회의록' }).click();
  await page.getByRole('button', { name: /^논의 내용/ }).click();
  const panel = page.getByRole('region', { name: '논의 내용' });
  await expect(panel.getByRole('textbox')).toHaveCount(2);
  for (let index = 0; index < 6; index += 1) await panel.getByRole('button', { name: '논의 내용 추가' }).click();
  await expect(panel.getByRole('textbox')).toHaveCount(8);
  // 페이지는 늘어나지 않고 발송 버튼이 늘 보인다
  const send = page.getByRole('button', { name: '발송' });
  await expect(send).toBeInViewport();
  const box = (await send.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - 1180 / 2)).toBeLessThanOrEqual(2);
  const save = (await page.getByRole('button', { name: '저장' }).boundingBox())!;
  expect(save.y).toBeLessThan(100);
});

test('Preview 샘플(?sample): API 없이 화자 매핑과 회의록을 보인다', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('/meetings/sample-review/review?sample');
  await expect(page.getByRole('article')).toHaveCount(3);
  await page.getByRole('article', { name: '화자 B' }).getByRole('radio', { name: '이서연' }).click();
  await expect(page.getByText('3명 중 2명 지정')).toBeVisible();
});

test('휴대폰: 발송이 화면 아래에 고정되어 늘 보인다', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/meetings/${SESSION}/review`);
  await expect(page.getByRole('button', { name: '발송' })).toBeInViewport();
  await page.getByRole('main').evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect(page.getByRole('button', { name: '발송' })).toBeInViewport();
  await expect(page.getByRole('button', { name: '저장' })).toBeInViewport();
});
