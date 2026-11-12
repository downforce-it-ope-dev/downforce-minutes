import { useEffect } from 'react';
import './tailwind.css';
import { Link, NavLink, Route, Routes } from 'react-router';
import { restoreEmailSettings } from './emailSettingsApi';
import { SettingsPage } from './SettingsPage';
import { useGateBlocking } from './documentGate/gateBlocking';

function BottomNavigation() {
  return (
    <nav className="bottom-navigation" aria-label="주요 메뉴">
      <NavLink to="/" end aria-label="홈"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>홈</NavLink>
      <NavLink to="/meetings" aria-label="회의록"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7" /></svg>회의록</NavLink>
      <NavLink to="/participants" aria-label="참석자"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2a4.5 4.5 0 0 1 4.5 4.5V20zM16 5.5a3 3 0 0 1 0 5.8M17 14h.5a3.5 3.5 0 0 1 3.5 3.5V20h-4" /></svg>참석자</NavLink>
      <NavLink to="/settings" aria-label="설정"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></svg>설정</NavLink>
    </nav>
  );
}

export function App() {
  useEffect(() => {
    void restoreEmailSettings().catch(() => undefined);
  }, []);
  // 참석자(PTC-01, #36)·회의록(#32·#33)도 리뉴얼 라우트로 옮겨 이 앱은 설정 화면만 그린다.
  // 녹음(MTG-02, #27)·처리(MTG-03, #28)·검토(MTG-04, #29)·결과(MTG-05, #30) 화면은 리뉴얼 라우트로 옮겼다. 앱 시작 시 Slack 설정 복구는 없앴다(D-11). 이탈 경고·세션 유지는 그 화면이 맡는다
  // 문서 연결 확인(CMN-04, #19) 중·실패 화면은 메뉴를 숨기는 새 화면이라, 그동안 기존 헤더·하단 탭을 숨긴다
  const gateBlocking = useGateBlocking();

  return (
    <div className="app-shell">
      {!gateBlocking && <header className="product-header">
        <Link className="product-header-brand" to="/" aria-label="Windsoft Minutes 홈">
          <img src="/assets/windsoft-favicon-mark.png" alt="" />
          <span className="product-header-company"><span>Wind</span><span>soft</span></span>
          <span className="product-header-divider" aria-hidden="true" />
          <span className="product-header-product">Minutes</span>
        </Link>
      </header>}
      <div className="app-route-viewport">
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
      {!gateBlocking && <BottomNavigation />}
    </div>
  );
}
