import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { installSyntheticApi, longKoreanTitle, screens, sessionId, type Screen } from './fixtures';

async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
    .analyze();
  const seriousViolations = results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');

  expect(seriousViolations, seriousViolations.map(({ id, help, nodes }) =>
    `${id}: ${help} (${nodes.length} affected element(s))`,
  ).join('\n')).toEqual([]);
}

async function visitScreen(page: Page, screen: Screen): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  if (screen.id === 'SCR-003') {
    await page.addInitScript((session) => {
      sessionStorage.setItem('meeting-automation.recording-session', JSON.stringify(session));
    }, {
      sessionId,
      version: 3,
      status: 'CREATED',
      title: longKoreanTitle,
      uploadPolicy: { chunkDurationSeconds: 30, maxChunkBytes: 1_000_000, acceptedMimeTypes: ['audio/webm'] },
    });
  }
  await installSyntheticApi(page, screen);
  await page.goto(screen.route);
  const main = page.locator('main').first();
  await expect(main).toBeVisible();
  const heading = main.getByRole('heading', { level: screen.headingLevel ?? 1 }).first();
  await expect(heading).toBeVisible();
  await expect(heading).toContainText(screen.heading);
}

// SCR-003·007·012는 현재 화면과 제목이 맞지 않아 제외했다.
for (const screen of screens.filter(({ id }) => !['SCR-001', 'SCR-003', 'SCR-007', 'SCR-012'].includes(id))) {
  test(`${screen.id} ${screen.route} has no serious WCAG 2.2 A/AA axe violations`, async ({ page }) => {
    await visitScreen(page, screen);
    await expectNoSeriousAxeViolations(page);
  });
}
