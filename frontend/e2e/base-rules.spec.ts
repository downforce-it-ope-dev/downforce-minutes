import { expect, test, type Page } from '@playwright/test';
import { installSyntheticApi } from './fixtures';

/*
 * 진입 CSS 기본 규칙 검사 (src/tailwind.css, R9 #41에서 기존 격리 검사를 바꿨다).
 * - Tailwind 초기화(Preflight)와 기본 규칙(포커스 표시·스크롤바 숨김)은 화면 안과 body 바로 아래(Portal) 모두에 적용된다
 * - 글자 토큰은 tablet(600px) 이상에서 커진다
 * - 상단 바는 고정이고 본문(#main-content)만 스크롤한다(문서 전체는 스크롤하지 않는다)
 */
const PROBE_MARKUP = `
  <h2 data-probe="heading">제목</h2>
  <ul data-probe="list"><li>항목</li></ul>
  <button type="button" data-probe="plain-button">버튼</button>
  <button type="button" disabled class="disabled:opacity-40" data-probe="utility-button">버튼</button>
  <p class="text-label" data-probe="label">이름표</p>
`;

async function mountProbes(page: Page) {
  await installSyntheticApi(page, {});
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '설정', level: 1 })).toBeVisible();
  await page.evaluate((markup) => {
    const inside = document.createElement('section');
    inside.dataset.probeArea = 'inside';
    inside.innerHTML = markup;
    document.querySelector('main')!.append(inside);
    // 대화상자·토스트처럼 body 바로 아래에 그려지는 요소
    const portal = document.createElement('div');
    portal.dataset.probeArea = 'portal';
    portal.innerHTML = markup;
    document.body.append(portal);
  }, PROBE_MARKUP);
}

function styleOf(page: Page, area: string, probe: string) {
  return page.locator(`[data-probe-area="${area}"] [data-probe="${probe}"]`).evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      marginTop: style.marginTop,
      listStyleType: style.listStyleType,
      paddingLeft: style.paddingLeft,
      opacity: style.opacity,
      boxSizing: style.boxSizing,
      scrollbarWidth: style.scrollbarWidth,
      fontSize: style.fontSize,
    };
  });
}

test.describe('진입 CSS 기본 규칙', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mountProbes(page);
  });

  for (const area of ['inside', 'portal']) {
    test(`${area === 'inside' ? '화면 안' : 'body 바로 아래 Portal'} 요소에도 Tailwind 초기화·유틸리티·스크롤바 숨김이 적용된다`, async ({ page }) => {
      expect((await styleOf(page, area, 'heading')).marginTop).toBe('0px');
      const list = await styleOf(page, area, 'list');
      expect(list.listStyleType).toBe('none');
      expect(list.paddingLeft).toBe('0px');
      expect((await styleOf(page, area, 'utility-button')).opacity).toBe('0.4');
      const label = await styleOf(page, area, 'label');
      expect(label.boxSizing).toBe('border-box');
      expect(label.scrollbarWidth).toBe('none');
    });
  }

  test('키보드 포커스는 focus 토큰 색 외곽선이다(#5 결정)', async ({ page }) => {
    const button = page.locator('[data-probe-area="inside"] [data-probe="plain-button"]');
    await button.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    expect(await button.evaluate((element) => getComputedStyle(element).outlineColor)).toBe('rgb(196, 69, 123)');
  });

  test('글자 토큰은 tablet(600px) 이상에서 커진다', async ({ page }) => {
    expect((await styleOf(page, 'inside', 'label')).fontSize).toBe('15px');
    await page.setViewportSize({ width: 820, height: 1180 });
    expect((await styleOf(page, 'inside', 'label')).fontSize).toBe('16px');
  });
});

test('상단 바는 고정이고 본문만 스크롤한다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 480 });
  await installSyntheticApi(page, {});
  for (const route of ['/', '/meetings', '/participants', '/settings', '/settings/document']) {
    await page.goto(route);
    // 불러오는 중 화면이 아니라 내용이 다 그려진 뒤에 잰다
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    const heading = page.getByRole('heading', { level: 1 }).first();
    await expect(heading).toBeAttached();
    const top = await heading.evaluate((element) => element.getBoundingClientRect().top);
    await page.locator('#main-content').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    expect(await heading.evaluate((element) => element.getBoundingClientRect().top), `${route} 제목이 움직였다`).toBe(top);
    expect(await page.evaluate(() => document.documentElement.scrollTop), `${route} 문서 전체가 스크롤됐다`).toBe(0);
  }
});
