import { expect, test, type Page } from '@playwright/test';

/*
 * 검색창 한글 조합 입력 (2026-11-12 사용자 보고). 크롬 개발자 도구 기능(CDP)으로 한글 조합을 흉내 낸다.
 * 회의록 검색이 입력란 값을 주소(?q)에 바로 묶어 조합이 깨졌다("ㅎ호홍홍ㄱ기길길").
 */
import { installSyntheticApi, participant } from './fixtures';

async function composeKorean(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  // "홍길" 입력: ㅎ→호→홍 (확정) 길: ㄱ→기→길 (확정)
  for (const steps of [['ㅎ', '호', '홍'], ['ㄱ', '기', '길']]) {
    for (const text of steps) {
      await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
      await page.waitForTimeout(80);
    }
    await cdp.send('Input.insertText', { text: steps[steps.length - 1] });
    await page.waitForTimeout(80);
  }
}

for (const [route, label] of [['/participants', '참석자 검색'], ['/meetings/new', '참석자 검색'], ['/meetings', '회의 검색']] as const) {
  test(`${route} ${label}: 한글을 조합해 입력하면 "홍길"이 된다`, async ({ page }) => {
    await installSyntheticApi(page, {}, { participants: [participant, { id: 'h', name: '홍길동', email: 'hong@miinit.com' }] });
    await page.goto(route);
    const box = page.getByRole('searchbox', { name: label });
    await box.click();
    await composeKorean(page);
    await expect(box).toHaveValue('홍길');
  });
}
