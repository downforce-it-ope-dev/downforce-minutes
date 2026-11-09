import { Banner } from '../ui';
import { MOCK_OTP_CODE } from './authMock';

/** 인증 목업이 켜진 빌드(개발 서버·Vercel Preview)에서만 보이는 안내. 운영 빌드에서는 그리지 않는다 */
export function MockNotice() {
  if (!__AUTH_MOCK__) return null;
  return (
    <Banner tone="info" title="테스트 모드">
      메일을 보내지 않습니다. 인증 코드는 <strong className="font-bold tabular-nums">{MOCK_OTP_CODE}</strong> 입니다.
    </Banner>
  );
}
