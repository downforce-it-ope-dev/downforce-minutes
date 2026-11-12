import { expect, test, type Page } from '@playwright/test';
import { installSyntheticApi, screens } from './fixtures';

/*
 * 기존 CSS와 리뉴얼 영역(data-ui="renewal") 격리 검사 (docs/renewal/스타일_전환_검토.md 4.1, 4.2, 5.1).
 * - 영역 밖: Tailwind 초기화(Preflight)가 되돌려지고 기존 전역 규칙이 적용된다.
 * - 영역 안: Tailwind 초기화가 적용되고 기존 전역 규칙은 적용되지 않는다.
 * - body 바로 아래에 그려지는 요소(대화상자·토스트 Portal)도 data-ui="renewal"이 있으면 영역 안으로 본다.
 *
 * 아래 클래스는 Tailwind가 이 파일을 읽어 만든다(자동 소스 감지). 클래스가 없으면 첫 검사에서 실패한다.
 */
const RENEWAL_ROOT_CLASS = 'font-sans text-body text-text bg-bg';
const PROBE_MARKUP = `
  <h2 data-probe="heading">제목</h2>
  <ul data-probe="list"><li>항목</li></ul>
  <button type="button" data-probe="plain-button">버튼</button>
  <button type="button" disabled data-probe="disabled-button">버튼</button>
  <button type="button" disabled class="disabled:opacity-40" data-probe="utility-button">버튼</button>
  <p class="text-label" data-probe="label">이름표</p>
`;

async function mountProbes(page: Page): Promise<void> {
  // 모든 화면이 리뉴얼되어(#39) 기존 화면이 없다. 설정 화면을 열고 기존 영역 probe는 리뉴얼 루트 밖(body 바로 아래)에 둔다.
  // 기존 CSS는 아직 전역으로 불러온다(삭제는 R9 #41)
  await installSyntheticApi(page, screens[0]);
  await page.goto('/settings');
  await expect(page.locator('main').first()).toBeVisible();
  // 진입 보호(#15) 확인 뒤 화면이 그려지고 데이터를 받아 다시 그려진다. 제목이 보인 뒤에 probe를 넣어야 사라지지 않는다
  await expect(page.getByRole('heading', { name: '설정', level: 1 })).toBeVisible();
  await page.evaluate(({ markup, rootClass }) => {
    const legacy = document.createElement('section');
    legacy.dataset.probeArea = 'legacy';
    legacy.innerHTML = markup;

    const renewal = document.createElement('div');
    renewal.dataset.ui = 'renewal';
    renewal.dataset.probeArea = 'renewal';
    renewal.className = rootClass;
    renewal.innerHTML = markup;

    // Radix Portal처럼 리뉴얼 루트 밖(body 바로 아래)에 그려지는 요소
    const portal = document.createElement('div');
    portal.dataset.ui = 'renewal';
    portal.dataset.probeArea = 'portal';
    portal.className = rootClass;
    portal.innerHTML = markup;

    document.body.append(legacy);
    document.querySelector('main')!.append(renewal);
    document.body.append(portal);
  }, { markup: PROBE_MARKUP, rootClass: RENEWAL_ROOT_CLASS });
}

function styleOf(page: Page, area: string, probe: string) {
  return page.locator(`[data-probe-area="${area}"] [data-probe="${probe}"]`).evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      marginTop: style.marginTop,
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
      listStyleType: style.listStyleType,
      paddingLeft: style.paddingLeft,
      opacity: style.opacity,
      cursor: style.cursor,
      boxSizing: style.boxSizing,
      scrollbarWidth: style.scrollbarWidth,
    };
  });
}

test.describe('기존 CSS와 리뉴얼 영역 격리', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mountProbes(page);
  });

  test('영역 밖 기존 요소는 브라우저 기본값과 기존 전역 규칙을 유지한다', async ({ page }) => {
    const heading = await styleOf(page, 'legacy', 'heading');
    expect(heading.marginTop).not.toBe('0px');
    expect(heading.fontFamily).not.toContain('Pretendard');

    const list = await styleOf(page, 'legacy', 'list');
    expect(list.listStyleType).toBe('disc');
    expect(list.paddingLeft).not.toBe('0px');

    expect((await styleOf(page, 'legacy', 'plain-button')).cursor).toBe('pointer');
    expect((await styleOf(page, 'legacy', 'disabled-button')).opacity).toBe('0.6');
  });

  for (const area of ['renewal', 'portal']) {
    test(`${area === 'renewal' ? '리뉴얼 루트 안' : 'body 바로 아래 Portal'} 요소에는 Tailwind 초기화와 토큰이 적용된다`, async ({ page }) => {
      const heading = await styleOf(page, area, 'heading');
      expect(heading.marginTop).toBe('0px');
      expect(heading.fontFamily).toContain('Pretendard');

      const list = await styleOf(page, area, 'list');
      expect(list.listStyleType).toBe('none');
      expect(list.paddingLeft).toBe('0px');

      // 기존 전역 규칙(button:disabled opacity .6, button cursor pointer)이 적용되지 않는다
      expect((await styleOf(page, area, 'disabled-button')).opacity).toBe('1');
      expect((await styleOf(page, area, 'plain-button')).cursor).not.toBe('pointer');
      // 유틸리티가 적용된다
      expect((await styleOf(page, area, 'utility-button')).opacity).toBe('0.4');
      expect((await styleOf(page, area, 'label')).boxSizing).toBe('border-box');
    });
  }

  test('기존 전역 포커스 표시는 리뉴얼 영역에 적용되지 않는다', async ({ page }) => {
    const outlineColor = async (area: string) => {
      const button = page.locator(`[data-probe-area="${area}"] [data-probe="plain-button"]`);
      await button.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      return button.evaluate((element) => getComputedStyle(element).outlineColor);
    };
    expect(await outlineColor('legacy')).toBe('rgb(59, 130, 246)');
    // 리뉴얼 영역은 진입 파일의 기본 규칙(focus 토큰, pink-600)을 쓴다 (#5 결정)
    expect(await outlineColor('renewal')).toBe('rgb(196, 69, 123)');
  });

  test('리뉴얼 영역도 스크롤바를 숨긴다', async ({ page }) => {
    for (const area of ['legacy', 'renewal']) {
      expect((await styleOf(page, area, 'label')).scrollbarWidth).toBe('none');
    }
  });

  test('글자 토큰은 tablet(600px) 이상에서 커진다', async ({ page }) => {
    expect((await styleOf(page, 'renewal', 'label')).fontSize).toBe('15px');
    await page.setViewportSize({ width: 820, height: 1180 });
    expect((await styleOf(page, 'renewal', 'label')).fontSize).toBe('16px');
  });
});
