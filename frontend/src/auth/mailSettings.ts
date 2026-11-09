import { getEmailSettings, saveEmailSettings, verifyEmailConnection } from '../emailSettingsApi';
import type { StoredEmailSettings } from '../emailSettingsStorage';

/*
 * 로그인 화면의 메일 설정(AUTH-01-F07) 호출.
 * __AUTH_MOCK__이면 Backend 대신 목업을 쓴다. 목업은 "미설정"으로 시작하고, 팝업에서 저장하면 "설정됨"이 된다.
 * 목업은 입력한 키 값을 어디에도 저장·전송하지 않고 설정 여부만 기억한다.
 */

export const MOCK_MAIL_KEY = 'ma-auth-mock-mail-configured';

function mockConfigured(): boolean {
  try {
    return localStorage.getItem(MOCK_MAIL_KEY) === '1';
  } catch {
    return false;
  }
}

/** 메일 설정 여부 (configured만 본다, R-02) */
export async function isMailConfigured(): Promise<boolean> {
  if (__AUTH_MOCK__) return mockConfigured();
  return (await getEmailSettings()).configured;
}

/** 저장하고 연결을 확인한다. 연결되면 true */
export async function saveAndVerifyMail(settings: StoredEmailSettings): Promise<{ connected: boolean; message: string }> {
  if (__AUTH_MOCK__) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      localStorage.setItem(MOCK_MAIL_KEY, '1');
    } catch {
      // 저장소를 못 쓰면 새로고침 때 다시 미설정이 된다. 목업이라 그대로 둔다
    }
    return { connected: true, message: '' };
  }
  await saveEmailSettings(settings);
  return verifyEmailConnection();
}
