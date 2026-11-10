import { expect, test } from '@playwright/test';
import { graceParticipant, installSyntheticApi, meetingFixtures, participant, screens, widths } from './fixtures';

// SCR-007·012는 현재 화면과 제목이 맞지 않아 제외했다.
for (const screen of screens.filter(({ id }) => !['SCR-001', 'SCR-007', 'SCR-012'].includes(id))) {
  test.describe(`${screen.id} ${screen.route}`, () => {
    for (const width of widths) {
      test(`${width}px renders core content without page overflow or clipped bounds`, async ({ page }) => {
        const runtimeErrors: string[] = [];
        page.on('pageerror', (error) => runtimeErrors.push(error.message));
        await page.setViewportSize({ width, height: width <= 430 ? 800 : 900 });
        await installSyntheticApi(page, screen);
        await page.goto(screen.route);

        const main = page.locator('main').first();
        await expect(main).toBeVisible();
        const heading = main.getByRole('heading', { level: screen.headingLevel ?? 1 }).first();
        await expect(heading).toBeVisible();
        await expect(heading).toContainText(screen.heading);

        const geometry = await page.evaluate((selectors) => {
          const headingElement = document.querySelector(`main h${selectors.headingLevel}`);
          const content = document.querySelector(selectors.contentSelector);
          const padding = document.querySelector(selectors.paddingSelector);
          if (!headingElement || !content || !padding) throw new Error('Expected screen heading, content and padding elements');
          const headingRect = headingElement.getBoundingClientRect();
          const contentRect = content.getBoundingClientRect();
          const paddingStyle = getComputedStyle(padding);
          return {
            viewport: document.documentElement.clientWidth,
            rootScroll: document.documentElement.scrollWidth,
            bodyScroll: document.body.scrollWidth,
            heading: { left: headingRect.left, right: headingRect.right, width: headingRect.width, height: headingRect.height },
            content: { left: contentRect.left, right: contentRect.right, width: contentRect.width },
            padding: { left: Number.parseFloat(paddingStyle.paddingLeft), right: Number.parseFloat(paddingStyle.paddingRight) },
          };
        }, { headingLevel: screen.headingLevel ?? 1, contentSelector: screen.contentSelector, paddingSelector: screen.paddingSelector });

        expect(geometry.rootScroll, `${screen.id} root overflow at ${width}px: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.viewport);
        expect(geometry.bodyScroll, `${screen.id} body overflow at ${width}px: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.viewport);
        expect(geometry.heading.width, `${screen.id} heading should have a measurable box`).toBeGreaterThan(0);
        expect(geometry.heading.height, `${screen.id} heading should have a measurable box`).toBeGreaterThan(0);
        expect(geometry.heading.left, `${screen.id} heading begins outside the viewport`).toBeGreaterThanOrEqual(0);
        expect(geometry.heading.right, `${screen.id} heading ends outside the viewport`).toBeLessThanOrEqual(width);
        expect(geometry.content.left, `${screen.id} main content begins outside the viewport`).toBeGreaterThanOrEqual(0);
        expect(geometry.content.right, `${screen.id} main content ends outside the viewport`).toBeLessThanOrEqual(width);
        if (width <= 430) {
          expect(geometry.padding.left, `${screen.id} mobile left padding is below 16px`).toBeGreaterThanOrEqual(16);
          expect(geometry.padding.right, `${screen.id} mobile right padding is below 16px`).toBeGreaterThanOrEqual(16);
        }
        const coreControl = main.locator('a[href], button:not([disabled]), input:not([type="hidden"])').first();
        if (await coreControl.count()) {
          await expect(coreControl).toBeVisible();
          const controlBounds = await coreControl.boundingBox();
          expect(controlBounds).not.toBeNull();
          expect(controlBounds!.x, `${screen.id} core control begins outside the viewport`).toBeGreaterThanOrEqual(0);
          expect(controlBounds!.x + controlBounds!.width, `${screen.id} core control ends outside the viewport`).toBeLessThanOrEqual(width);
        }
        if (width >= 768) {
          expect(geometry.content.width, `${screen.id} desktop content exceeds the shared 868px width`).toBeLessThanOrEqual(868);
          expect(Math.abs((geometry.content.left + geometry.content.right) / 2 - width / 2), `${screen.id} desktop content is not centered`).toBeLessThanOrEqual(2);
        }
        expect(runtimeErrors, `${screen.id} raised browser runtime errors`).toEqual([]);
      });
    }
  });
}

test('SCR-009 filters synthetic meetings by title and date and reports an invalid date range', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await installSyntheticApi(page, screens.find((screen) => screen.id === 'SCR-009')!, { meetings: meetingFixtures });
  await page.goto('/meetings');

  const productMeeting = page.locator('.meeting-summary-row').filter({ hasText: '제품 전략 회의' });
  const supportMeeting = page.locator('.meeting-summary-row').filter({ hasText: '고객 지원 주간 회의' });
  await expect(productMeeting).toBeVisible();
  await expect(supportMeeting).toBeVisible();

  const search = page.getByRole('searchbox', { name: '회의 검색' });
  await search.fill('제품 전략');
  await search.press('Enter');
  await expect(productMeeting).toBeVisible();
  await expect(supportMeeting).toHaveCount(0);
  await search.fill('');
  await search.press('Enter');
  await expect(supportMeeting).toBeVisible();
  await page.getByRole('button', { name: '상세 조건' }).click();

  await page.getByLabel('시작일').fill('2026-10-13');
  await page.getByLabel('종료일').fill('2026-10-15');
  await expect(productMeeting).toBeVisible();
  await expect(supportMeeting).toHaveCount(0);

  await page.getByLabel('시작일').fill('2026-10-20');
  await page.getByLabel('종료일').fill('2026-10-19');
  await expect(page.getByRole('alert')).toHaveText('시작일은 종료일보다 늦을 수 없습니다. 날짜 범위는 적용하지 않았습니다.');
  await expect(page.getByLabel('시작일')).toHaveAttribute('aria-invalid', 'true');
  await expect(productMeeting).toBeVisible();
  await expect(supportMeeting).toBeVisible();

  await page.getByLabel('시작일').fill('');
  await page.getByLabel('종료일').fill('');
  await expect(search).toHaveValue('');
  await expect(page.getByLabel('시작일')).toHaveValue('');
  await expect(page.getByLabel('종료일')).toHaveValue('');
  await expect(productMeeting).toBeVisible();
  await expect(supportMeeting).toBeVisible();
});

test('all app routes keep the brand and page heading visible during scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 480 });
  const routes = screens.filter((screen) => !['SCR-001', 'SCR-007'].includes(screen.id));
  for (const screen of routes) {
    await installSyntheticApi(page, screen);
    await page.goto(screen.route);
    const heading = page.getByRole('heading', { name: screen.heading }).first();
    await expect(heading).toBeVisible();
    const fixedHeading = page.locator('main .page-fixed-heading, main > header, main > .settings-heading, main > .meetings-heading, main > .new-meeting-heading, main .page-heading, main > .home-content').first();
    await expect(fixedHeading).toBeVisible();
    const initial = await page.evaluate(() => ({
      shellPosition: getComputedStyle(document.querySelector('.app-shell')!).position,
      brandTop: document.querySelector('.product-header')!.getBoundingClientRect().top,
    }));
    const initialHeadingTop = (await fixedHeading.boundingBox())!.y;
    expect(initial.shellPosition, `${screen.id} shell should stay attached to the viewport`).toBe('fixed');

    await page.locator('.page-scroll-content, .meetings-list-viewport, .home-recent .meeting-summary-list').first().evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    }).catch(() => undefined);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const afterScroll = await page.evaluate(() => ({
      documentScrollTop: document.documentElement.scrollTop,
      brandTop: document.querySelector('.product-header')!.getBoundingClientRect().top,
    }));
    expect(afterScroll.documentScrollTop, `${screen.id} should not scroll the document`).toBe(0);
    expect(afterScroll.brandTop, `${screen.id} brand header moved`).toBe(initial.brandTop);
    expect((await fixedHeading.boundingBox())!.y, `${screen.id} page heading moved`).toBe(initialHeadingTop);
  }

  for (const route of ['/setup/document', '/settings/document']) {
    await installSyntheticApi(page, screens.find((screen) => screen.id === 'SCR-011')!);
    await page.goto(route);
    // 문서 연결은 리뉴얼 앱 틀(#20~#22): 제목은 상단 바(h1), 스크롤은 본문(#main-content)만
    const heading = page.getByRole('heading', { level: 1 }).first();
    await expect(heading).toBeVisible();
    const initialTop = await heading.evaluate((element) => element.getBoundingClientRect().top);
    await page.locator('#main-content').evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    expect(await heading.evaluate((element) => element.getBoundingClientRect().top), `${route} page heading moved`).toBe(initialTop);
    expect(await page.evaluate(() => document.documentElement.scrollTop), `${route} should not scroll the document`).toBe(0);
  }
});

test('SCR-012 searches the roster and clears the query to restore both fixture participants', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await installSyntheticApi(page, screens[10], { participants: [participant, graceParticipant] });
  await page.goto('/settings/participants');

  const ada = page.locator('.participant-card').filter({ hasText: participant.email });
  const grace = page.locator('.participant-card').filter({ hasText: graceParticipant.email });
  await expect(ada).toBeVisible();
  await expect(grace).toBeVisible();
  await page.getByRole('searchbox', { name: '참석자 검색' }).fill('Grace');
  await expect(grace).toBeVisible();
  await expect(ada).toHaveCount(0);
  await page.getByRole('button', { name: '검색 입력 지우기' }).click();
  await expect(page.getByRole('searchbox', { name: '참석자 검색' })).toHaveValue('');
  await expect(ada).toBeVisible();
  await expect(grace).toBeVisible();
});
