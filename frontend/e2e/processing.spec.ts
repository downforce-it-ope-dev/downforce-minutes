import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * MTG-03 회의 처리 (GitHub #28). 상태 조회(API-010)는 가로채서 응답한다(운영 데이터로 실패를 만들지 않음).
 */

const SIZES = [
  { label: '휴대폰', width: 390, height: 844 },
  { label: '태블릿 세로', width: 820, height: 1180 },
  { label: '태블릿 가로', width: 1180, height: 820 },
  { label: '낮은 화면', width: 844, height: 390 },
];
const title = '2026년 4분기 AX 플랫폼 로드맵 점검 및 다음 분기 우선순위 합의 회의';

function snapshot(status: 'PROCESSING' | 'PROCESSING_FAILED') {
  return {
    data: {
      sessionId: 's-e2e',
      version: 3,
      status,
      processing:
        status === 'PROCESSING'
          ? { stage: 'TRANSCRIPTION', progressPercent: 40 }
          : { stage: 'TRANSCRIPTION', errorCode: 'TRANSCRIPTION_PROCESSING_FAILED', retryable: true, audioAvailable: true, audioExpiresAt: new Date(Date.now() + 42 * 60_000).toISOString() },
      allowedActions: status === 'PROCESSING' ? [] : ['RETRY_PROCESSING', 'DOWNLOAD_AUDIO', 'FINALIZE_PROCESSING_FAILURE'],
    },
  };
}

async function mock(page: Page, status: 'PROCESSING' | 'PROCESSING_FAILED') {
  await page.addInitScript((value) => sessionStorage.setItem('meeting-automation.recording-session', JSON.stringify(value)), {
    sessionId: 's-e2e',
    title,
    version: 1,
    status: 'CREATED',
    uploadPolicy: { chunkDurationSeconds: 15, maxChunkBytes: 5_000_000, acceptedMimeTypes: ['audio/webm'] },
  });
  await page.route('**/api/v1/meeting-sessions/s-e2e', (route) => route.fulfill({ json: snapshot(status) }));
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']).analyze();
  const serious = results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');
  expect(serious, serious.map(({ id, help, nodes }) => `${id}: ${help} (${nodes.length})`).join('\n')).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const size of SIZES) {
  test(`MTG-03 · ${size.label}: 처리 중·처리 실패 axe 심각 위반 0건, 가로 넘침 없음`, async ({ page }) => {
    await page.setViewportSize(size);
    await mock(page, 'PROCESSING');
    await page.goto('/meetings/s-e2e/processing');
    await expect(page.getByText('전체 4단계 중 2단계 · 음성 인식 진행 중')).toBeVisible();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: '전체 처리 단계' })).toBeVisible();
    await expectAccessible(page);

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await mock(page, 'PROCESSING_FAILED');
    await page.reload();
    await expect(page.getByRole('heading', { name: '처리를 완료하지 못했습니다' })).toBeVisible();
    await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
    await expect(page.getByRole('button', { name: '다운로드 준비' })).toBeVisible();
    await expect(page.getByRole('button', { name: '실패 마무리' })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('button', { name: '실패 마무리' }).click();
    await expect(page.getByRole('dialog', { name: '오디오 없이 마무리할까요?' })).toBeVisible();
    await expect(page.getByRole('button', { name: '취소' })).toBeFocused();
    await expectAccessible(page);
  });
}
