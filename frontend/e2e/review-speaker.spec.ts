import { expect, test } from '@playwright/test';

test('keeps edits made during a failed in-flight Minutes save and does not send a second PUT', async ({ page }) => {
  const initialMinutes = {
    templateId: 'weekly', templateVersion: '4', summary: 'Initial summary',
    discussionPoints: ['Discussion'], decisions: [], actionItems: [], followUps: [],
  };
  let releasePut!: () => void;
  let markPutStarted!: () => void;
  const putStarted = new Promise<void>((resolve) => { markPutStarted = resolve; });
  const putReleased = new Promise<void>((resolve) => { releasePut = resolve; });
  let putCount = 0;
  await page.route('**/api/v1/app-config', (route) => route.fulfill({ json: { data: {
    company: { id: 'company-1', name: 'Example', timezone: 'Asia/Seoul' },
    document: { provider: null, configured: false, connectionVersion: 1, rootUrl: null },
  } } }));
  await page.route('**/api/v1/participants', (route) => route.fulfill({ json: { data: { items: [] } } }));
  await page.route('**/api/v1/meeting-sessions/minutes-failure-e2e**', async (route) => {
    const request = route.request();
    if (request.method() === 'PUT') {
      putCount += 1;
      markPutStarted();
      await putReleased;
      await route.fulfill({ status: 422, json: { error: { code: 'INVALID_MINUTES', details: { fieldErrors: [] } } } });
      return;
    }
    await route.fulfill({ json: { data: {
      sessionId: 'minutes-failure-e2e', version: 3, status: 'REVIEW', meeting: { participantIds: [] },
      speakers: [], transcript: [], minutes: initialMinutes, allowedActions: ['UPDATE_MINUTES'],
    } } });
  });

  await page.goto('/meetings/minutes-failure-e2e/review');
  const summary = page.locator('#minutes-summary');
  await expect(summary).toHaveValue('Initial summary');
  await summary.fill('Submitted draft');
  const save = page.locator('.review-minutes-save-controls button');
  await save.click();
  await putStarted;
  await expect(save).toBeDisabled();
  await summary.fill('Newer edit stays in the draft');
  releasePut();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(summary).toHaveValue('Newer edit stays in the draft');
  await expect(save).toBeEnabled();
  expect(putCount).toBe(1);
});
