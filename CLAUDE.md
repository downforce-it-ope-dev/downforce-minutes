# 프로젝트 지침

## 응답 언어: 반드시 한국어 (필수)

- 사용자에게 보이는 모든 글은 **반드시 한국어 경어체**로 쓴다. 결과 보고뿐 아니라 작업 중 진행 안내, 질문, 오류 설명, 요약까지 예외 없이 한국어다.
- 영어로 답하지 않는다. 사용자가 영어로 쓰거나 영어 자료를 다루더라도 답은 한국어로 한다.
- 코드, 명령어, 파일 경로, 커밋 메시지, 고유 이름(API·라이브러리 이름 등)은 원래 표기를 그대로 둔다.
- 긴 작업 뒤 보고나 대화 요약 직후처럼 언어가 바뀌기 쉬운 순간에도 첫 문장부터 한국어로 쓴다.

## 스타일 방식: 모든 화면은 Tailwind CSS로만 작성 (필수)

모든 화면을 Tailwind CSS로 리뉴얼했고 기존 CSS(`frontend/src/styles/`)와 `legacy` layer는 R9(#41)에서 지웠다. 근거와 세부 원칙은 [스타일 방식 검토](docs/renewal/스타일_전환_검토.md)를 따른다.

### 화면 작성 규칙

- **도구 (결정, 검토 문서 6장)**
  - Tailwind CSS v4와 Vite 플러그인을 쓴다.
  - 대화상자·메뉴·팝오버 등 접근성 부품은 Radix UI를 쓴다.

- **새 CSS 금지**
  - 화면이나 컴포넌트 전용 CSS 클래스·파일을 새로 만들지 않는다.
  - Tailwind 진입 CSS 파일에는 `@theme` 디자인 토큰, 토큰 수준 `@utility`(글자 토큰), `@custom-variant`(화면 조건), `@keyframes`, Tailwind로 표현할 수 없는 브라우저 전용 표기만 둔다.
  - 안전 영역 여백은 진입 파일의 `pt-safe`·`pb-safe` 유틸리티를 쓴다(`env(safe-area-inset-*)`, 브라우저 전용 표기).
  - 예외(#5 결정, R9에서 화면 전체로): 진입 파일 `@layer base`에 기본 규칙을 둔다. 키보드 포커스 표시(`focus` 색 2px 외곽선), 스크롤바 숨김, `html` 글자 렌더링·바탕색과 `body` 최소 크기(기존 CSS에서 옮긴 값)다. 이 밖의 기본 규칙은 추가하지 않는다.
- **아이콘**
  - `lucide-react`를 쓰되 화면에서 직접 불러오지 않고 공통 `Icon` 컴포넌트로만 쓴다.
  - 장식 아이콘은 `aria-hidden`, 의미가 있는 아이콘은 레이블을 둔다. 크기는 24 기준.
- **토큰만 사용**
  - 색 토큰은 다운포스 CI를 기준으로 한다: Main `#FDB0CA`, Sub `#8BB0F4`, Sub `#CCBDF6`.
  - CI 원색은 흰 배경 대비가 낮다. 글자·흰 글자 버튼·테두리에는 파생 진한 색 토큰을 쓴다(검토 문서 7장).
  - 화면의 톤은 시안(`docs/renewal/뉴_UI`)을 따른다. 기준은 [시안 적용 기준](docs/renewal/시안_적용_기준.md)이며, 화면 기획 문서와 색·면·배치가 다르면 이 문서가 우선한다.
  - 색 역할은 다음과 같다(시안 적용 기준 S-09).
    - 분홍: 주 동작 (버튼·포커스), 선택된 메뉴, 브랜드 강조
    - 보라: 링크·텍스트 버튼, 보조 정보 알약, AI 표시
    - 파랑: 로고·일러스트 장식. 동작 색으로 쓰지 않는다
  - 바탕은 파스텔 그라데이션이고 카드·패널은 흰 면 + `shadow-card`다(S-10). 그라데이션 바탕은 레이아웃(`AppCanvas`) 한 곳에만 두고, 화면 컴포넌트에 직접 넣지 않는다.
  - CI 원색 면 위의 글자는 neutral-900만, 흰 배경 위 색 글자는 700 이상 단계만 쓴다.
  - 색·글자 크기·간격·둥글기·그림자·화면 폭 기준은 `@theme` 토큰만 쓴다.
  - 임의값(`text-[13px]`, `bg-[#0b2d5b]`)은 쓰지 않고, 필요하면 토큰을 추가한다.
- **설명 문구 금지 (S-13)**
  - 화면에는 제목·입력·버튼과 꼭 필요한 값만 둔다. 부제·도움말·안내 배너·테스트 안내를 넣지 않는다.
  - 오류·상태 알림은 토스트(`useToast`)로 보내고, 입력 오류는 테두리(`TextField invalid`)로만 표시한다. 대화상자 안의 오류만 예외다.
- **공통 컴포넌트 사용**
  - 버튼·카드·입력·대화상자·토스트 등은 Tailwind로 만든 공통 React 컴포넌트를 쓴다.
  - 클래스 문자열을 화면마다 복사하지 않는다.
- **지원 기기와 크기 (검토 문서 8장)**
  - 기준은 마이크가 있는 태블릿이고, 휴대폰까지 지원한다. PC 전용 배치는 만들지 않는다.
  - 기본값은 휴대폰이다. 화면 폭 기준은 두 가지만 쓴다.
    - `tablet`: 600px 이상
    - `tablet-lg`: 960px 이상
  - Tailwind 기본 기준(`sm`·`md`·`lg`·`xl`·`2xl`)은 쓰지 않는다.
  - 높이 560px 이하는 `short` 조건으로 줄인다.
  - 글자는 토큰만 쓴다: `display`·`headline`·`title`·`body-lg`·`body`·`label`·`caption`·`nav`.
  - 입력란 글자는 16px 이상, 일반 글자는 13px 이상으로 쓴다.
  - 글꼴은 Pretendard Variable 하나만 쓴다.
    - 굵기는 400·600·700만 쓴다.
    - 시간·진행률·날짜 숫자는 `tabular-nums`로 표시한다.
  - 터치 대상은 48×48px 이상(절대 최소 44px), 대상끼리는 8px 이상 띄운다.
  - hover에만 의존하는 동작을 만들지 않는다.
  - 상단 바·하단 탭 바·하단 고정 버튼은 안전 영역(`env(safe-area-inset-*)`)을 반영한다.
- **색 대비**
  - 토큰과 화면은 WCAG 2.2 AA 색 대비를 충족한다.
  - 일반 글자는 4.5:1, 큰 글자·아이콘·입력 테두리는 3:1 이상이어야 한다.
- **테스트 기준**
  - 테스트는 클래스 이름이 아니라 역할(role)·레이블·`data-testid`로 요소를 찾는다.
  - 리뉴얼 화면은 브라우저 접근성 검사(axe)에서 심각(serious·critical) 위반이 0건이어야 완료로 본다. 보통(moderate)·경미(minor)는 기록만 한다.
- **Backend 범위 (R-18)**
  - Backend는 `donghyunlee-dev/meeting-automation` 저장소에서 개발·배포한다. 이 저장소에서는 Frontend만 개발하고 `backend/`를 고치거나 배포하지 않는다.
  - 화면에 필요한데 구현되지 않은 Backend 기능은 이슈 댓글로 정리해 사용자에게 요청한다.
- **반영 단위**
  - 브랜치는 `main`(운영)과 `develop`(작업)만 둔다. 작업은 `develop`에서 하고, 커밋 메시지에 GitHub 이슈 번호(`Refs #n`)를 적는다.
  - 작업 순서와 완료 기준은 GitHub 로드맵 이슈 #3과 각 이슈 본문을 따른다.
  - 화면 묶음이 완성되면 `develop` → `main` PR로 합친다.

### 구현 기준

- **진입 파일**
  - Tailwind 진입 CSS는 `frontend/src/tailwind.css` 하나다. `RootRoutes.tsx`가 이 파일을 불러온다(기존 레이아웃 `App.tsx`는 R8 #39에서 지웠다).
  - layer 순서: `theme → base → components → utilities`. Tailwind 초기화(Preflight)는 화면 전체에 적용된다.
- **공통 부품과 라우트 (R1 결과)**
  - 공통 부품은 `frontend/src/ui/`에 있고 `../ui`(index)에서 불러온다. 같은 부품을 화면에 새로 만들지 않는다.
  - 화면 라우트는 `frontend/src/RootRoutes.tsx`에 추가한다. 모든 화면이 리뉴얼 화면이다(R8에서 기존 화면을 모두 옮겼다).
  - 부품 확인 화면 `/__ui`는 개발 서버와 Vercel Preview에서만 열린다(운영 빌드 제외). 새 부품을 만들면 여기에도 추가한다.
  - R5에서 추가한 부품: `SelectField`(선택 상자), `Checkbox`, `FilterChips`(보기 칩), `ChoiceGroup`(버튼으로 하나 고르기), `DateField`(큰 달력 대화상자), `RoundActionButton`(원형 녹음 버튼), `useMediaQuery`·`TABLET_QUERY`(크기마다 다른 방식으로 그릴 때만). `TextField`의 `inputSize="lg"`는 글자만 키우고 높이는 같다.
  - MTG-03에서 추가한 부품: `ButtonAnchor`(버튼 모양 앱 밖 링크, 파일 다운로드). 앱 안 이동은 `ButtonLink`.
  - `AppShell`: `fillHeight`(태블릿에서 본문 높이를 화면에 맞추고 영역 안만 스크롤, `"tablet-lg"`면 큰 태블릿만), `toastPlacement="top"`(아래쪽에 큰 동작 버튼이 있는 화면), `focusActions`(집중 모드 상단 바 오른쪽).
  - MTG-04에서 추가한 부품: `TextArea`(내용만큼 늘어나는 여러 줄 입력), `ChipRadioGroup`(칩 하나 고르기), `Tabs`, `TABLET_LG_QUERY`.
  - R6·R7에서 추가한 부품: `BottomDock`(하단 가운데 고정 큰 주 동작, `toastPlacement="top"`과 함께), `TextField`의 `inside`(입력란 안 오른쪽, 예: 검색어 지우기), `SelectField`의 `hideLabel`, `IconButton variant="danger"`(목록 행 삭제), `Button variant="danger-secondary"`(위험 동작의 보조 버튼).
- **참석자 (R7)**
  - 참석자 관리(`/participants`, `/settings/participants`)는 리뉴얼 라우트다(`src/participants/`). 입력 규칙(회사 메일 @miinit.com만, 수정은 이메일을 바꿀 때만)은 `participantRules.ts`이고 새 회의의 새 참석자 폼도 같이 쓴다.
  - 팀은 응답에 `team`이 있을 때만(Backend #35 뒤) 보인다(`hasTeamField`).
  - CSV 일괄 등록(`CsvImportDialog.tsx`, 읽기·판정은 `csvImport.ts`)은 지금 메일계정·이름만 받는다. 팀은 #35 뒤에 넣는다. 양식은 `frontend/public/participants-template.csv`.
- **설정 (R8)**
  - 설정(`/settings`)은 `src/settings/`. 카드 두 개(문서 연결, 이메일)이고 Slack 설정·코드는 없다(D-11).
  - 메일 설정 브라우저 복구(D-09)는 설정 화면을 열 때와 홈에 처음 들어올 때 한 번(`restoreEmailSettingsOnce`) 한다.
- **회의록 (R6)**
  - 회의록 목록(`/meetings`)·상세(`/meetings/:documentId`)는 리뉴얼 라우트다(`src/meetings/`). 목록의 검색·기간·정렬 조건은 주소(`?q·from·to·sort`)에 두고, 상세의 "회의록 목록"은 그 조건으로 돌아간다(목록 행 링크의 `state.listSearch`).
  - 회의록 목록과 홈 최근 회의록은 내가 참석자인 회의만 보인다(`src/meetings/myMeetings.ts`의 `listMyMeetings`, 로그인 이메일과 같은 참석자). 회의 목록 API를 직접 쓰지 않는다.
  - 전사 원문 목록과 화자 색은 검토 화면과 같은 `review/TranscriptList.tsx`·`review/speakerColors.ts`를 쓴다.
- **회의 진행 흐름 (R5)**
  - 새 회의(`/meetings/new`)·회의 녹음·회의 처리·회의록 검토·회의 결과(`/meetings/:sessionId/complete`)는 모두 리뉴얼 라우트이고 집중 모드다(뒤로 가기 → 홈 또는 회의록 목록).
  - 결과 로직은 `src/complete/useCompleteSession.ts`(기존 처리 그대로, Slack 알림 채널은 보이지 않음). 화면 상태를 `AppShell` 바깥에 둘 때 토스트는 `ToastBridge`로 넘긴다.
  - 검토 로직은 `src/review/useReviewSession.ts`(기존 처리 그대로, 화자 매핑은 칩을 누르면 0.3초 뒤 묶어 저장). 집중 모드에서 상단 바에 둘 것은 `AppShell`의 `focusActions`로 넘긴다.
  - 처리 로직은 `src/processing/useProcessingSession.ts`(기존 처리 그대로). 처리 화면은 녹음 화면이 남긴 같은 탭 저장소에서 회의 제목을 읽는다.
  - 새 회의가 만든 녹음 세션은 `src/meeting/recordingSessionStore.ts`(브라우저 탭 저장소 + 메모리)로 녹음 화면에 넘긴다.
  - 녹음 로직은 `src/recording/useRecordingSession.ts`(기존 처리 그대로). 녹음 화면 진단 패널은 Preview·개발 서버에서 `?debug`로 연다.
- **로그인과 인증 목업 (#15)**
  - `/login`·`/__ui`를 뺀 모든 경로는 `RequireAuth`(`src/auth/AuthGate.tsx`)를 거친다. 로그인하지 않았으면 로그인 화면으로 보낸다.
  - 개발 서버와 Vercel Preview는 인증 목업(`src/auth/authMock.ts`)을 쓴다. 메일을 보내지 않고, 인증 코드는 `123456`이다. Backend가 Preview 출처를 허용하면 Vercel Preview 환경 변수 `AUTH_MOCK=0`으로 끈다. Vercel Production에서는 값과 관계없이 꺼진다.
  - 기존 화면 e2e는 목업 세션(`e2e/authSession.ts`)을 넣어 진입 보호를 통과한다. 로그인 화면 e2e는 세션 없이 실행한다.
- **화면 루트와 Portal**
  - 화면의 가장 바깥 요소는 `AppCanvas`(또는 이를 쓰는 `AppShell`·`AuthLayout`)다. 바탕 그라데이션과 글자 기본값을 정한다.
  - `html`·`body`에는 글꼴·색을 두지 않았다. 대화상자·토스트·메뉴처럼 `body` 바로 아래에 Portal로 그리는 가장 바깥 요소에는 글자 기본값 `ROOT_TEXT_CLASS`(`font-sans text-body text-text`)를 붙인다. 빠뜨리면 브라우저 기본 글꼴·색이 된다.
  - 포커스 표시와 스크롤바 숨김은 진입 파일 기본 규칙이 맡는다. 다른 포커스 모양이 필요할 때만 컴포넌트에서 유틸리티로 덮어쓴다. 비활성 표시(커서·색·`aria-disabled`)는 컴포넌트에서 직접 지정한다.
- **색 클래스:** 용도별 토큰 이름을 우선 쓴다.
  - 배경: `bg-bg`·`bg-bg-subtle`·`bg-primary`·`bg-primary-hover`(눌림)·`bg-primary-soft`·`bg-brand`·`bg-brand-soft`·`bg-selected`·`bg-accent`·`bg-accent-soft`·`bg-danger`·`bg-danger-soft`·`bg-success-soft`·`bg-warning-soft`
  - 바탕 그라데이션(레이아웃 전용): `bg-linear-to-br from-canvas-start via-canvas-mid to-canvas-end`
  - 글자: `text-text`·`text-text-muted`·`text-link`(링크)·`text-primary-soft-text`·`text-brand-text`·`text-brand-soft-text`·`text-selected-text`·`text-accent-soft-text`·`text-danger-text`·`text-success-text`·`text-warning-text`
  - 테두리: `border-border`·`border-border-input`
  - 포커스: `outline-focus`
  - 단계 색(`blue-600` 등)은 용도별 토큰으로 표현할 수 없을 때만 쓴다.
- **글자 클래스:** `text-display`·`text-headline`·`text-title`·`text-body-lg`·`text-body`·`text-label`·`text-caption`·`text-nav`.
  - 크기·줄 높이·굵기·자간이 함께 정해지고, `tablet` 이상에서 자동으로 커진다.
  - Tailwind 기본 글자 크기(`text-sm` 등)는 지워져 있다.
- **그 밖의 토큰**
  - 모서리: `rounded-sm`(8)·`rounded-md`(12)·`rounded-lg`(16)·`rounded-xl`(20)·`rounded-2xl`(24)·`rounded-full`
  - 그림자: `shadow-card`(카드·패널·입력란)·`shadow-primary`(화면의 대표 주 동작 1개)·`shadow-overlay`(대화상자·시트·토스트·메뉴)
  - 최대 폭: `max-w-auth`(480)·`max-w-dialog`(560)·`max-w-form`(640)·`max-w-reading`(720)·`max-w-content`(1040)
  - 메뉴 폭: `w-rail`(88, `tablet`)·`w-sidebar`(240, `tablet-lg`)
  - 화면 조건: `tablet:`·`tablet-lg:`·`short:`
  - 간격·크기: Tailwind 기본 단위(4px)를 쓴다 (예: `h-12` = 48px, `w-22` = 88px)
- **검사:** `npm run lint`가 스타일 규칙(`frontend/scripts/check-styles.mjs`)을 함께 검사한다. 새 CSS 파일(`src/tailwind.css` 외)과 임의값 클래스는 오류다.
- **기본 규칙 검사:** `npm run test:styles`(`frontend/e2e/base-rules.spec.ts`)가 Tailwind 초기화·기본 규칙·글자 토큰·상단 바 고정을 검사한다.
- **화면 스타일 비교:** 진입 파일(`tailwind.css`)·공통 부품처럼 여러 화면에 걸친 것을 바꿀 때는 바꾸기 전후 모든 화면의 계산 스타일을 비교해 의도하지 않은 차이가 없음을 확인한다. 방법은 `frontend/scripts/compare-styles.mjs` 머리말을 따른다(`e2e/style-snapshot.spec.ts`).
- **화면 e2e:** 화면마다 `e2e/<화면>.spec.ts`에 axe 심각 위반 0건·가로 넘침 없음을 4가지 크기(휴대폰 390×844, 태블릿 세로 820×1180, 태블릿 가로 1180×820, 낮은 화면 844×390)로 검사한다(`npm run test:a11y`). 새 화면 e2e는 `playwright.a11y.config.ts`의 목록에도 넣는다.
