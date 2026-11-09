# 프로젝트 지침

## 스타일 방식: 신규·리뉴얼 화면은 Tailwind CSS로만 작성 (필수)

화면 전체를 한 번에 바꾸지 않는다. 신규 화면을 만들거나 기존 화면을 리뉴얼할 때 그 화면을 Tailwind CSS로 작성한다. 근거와 세부 원칙은 [스타일 방식 검토](docs/renewal/스타일_전환_검토.md)를 따른다.

### 공존 원칙: 한 화면에는 한 가지 방식만

- 한 화면(라우트)과 그 화면이 쓰는 컴포넌트는 Tailwind 아니면 기존 CSS, 둘 중 하나로만 스타일을 입힌다.
- 같은 화면이나 같은 컴포넌트 안에서 Tailwind 클래스와 기존 CSS 클래스(`frontend/src/styles/`에 정의된 클래스)를 섞지 않는다.
- 리뉴얼 화면에서 기존 컴포넌트가 필요하면 기존 컴포넌트를 고치지 않고 Tailwind로 새 컴포넌트를 만든다.

### 신규·리뉴얼 화면 작성 규칙

- **도구 (결정, 검토 문서 6장)**
  - Tailwind CSS v4와 Vite 플러그인을 쓴다.
  - 대화상자·메뉴·팝오버 등 접근성 부품은 Radix UI를 쓴다.

- **새 CSS 금지**
  - 화면이나 컴포넌트 전용 CSS 클래스·파일을 새로 만들지 않는다.
  - Tailwind 진입 CSS 파일에는 `@theme` 디자인 토큰, 토큰 수준 `@utility`(글자 토큰), `@custom-variant`(화면 조건), `@keyframes`, Tailwind로 표현할 수 없는 브라우저 전용 표기만 둔다.
  - 안전 영역 여백은 진입 파일의 `pt-safe`·`pb-safe` 유틸리티를 쓴다(`env(safe-area-inset-*)`, 브라우저 전용 표기).
  - 예외(#5 결정): 리뉴얼 영역 기본 규칙 2개를 진입 파일 `@layer base`에 둔다. 키보드 포커스 표시(`focus` 색 2px 외곽선)와 스크롤바 숨김이다. 이 밖의 기본 규칙은 추가하지 않는다.
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

### 구현 기준 (0단계 기반 작업 결과)

- **진입 파일**
  - Tailwind 진입 CSS는 `frontend/src/tailwind.css` 하나다. `App.tsx`는 이 파일만 불러온다.
  - layer 순서: `theme → base → legacy → components → utilities`.
- **공통 부품과 라우트 (R1 결과)**
  - 공통 부품은 `frontend/src/ui/`에 있고 `../ui`(index)에서 불러온다. 같은 부품을 화면에 새로 만들지 않는다.
  - 리뉴얼 화면 라우트는 `frontend/src/RootRoutes.tsx`에 추가한다. 여기 라우트는 기존 `App` 레이아웃(헤더·하단 탭 바·기존 CSS) 밖에서 그려진다.
  - 부품 확인 화면 `/__ui`는 개발 서버와 Vercel Preview에서만 열린다(운영 빌드 제외). 새 부품을 만들면 여기에도 추가한다.
- **리뉴얼 화면 루트**
  - 리뉴얼 화면(또는 새 레이아웃)의 가장 바깥 요소에 `data-ui="renewal"`을 붙인다.
  - 이 영역 안에서만 Tailwind 초기화(Preflight)가 적용된다. 밖의 기존 화면은 `src/styles/legacy-reset.css`가 브라우저 기본값을 유지한다.
  - 루트 요소에는 `font-sans text-body text-text bg-bg`를 지정한다(바탕 그라데이션을 쓰는 레이아웃 루트는 `bg-bg` 대신 바탕 그라데이션). `html`·`body`의 글꼴과 색은 기존 CSS가 정한다.
  - **Portal:** 대화상자·토스트·메뉴처럼 `body` 바로 아래에 그려지는 요소는 리뉴얼 루트 밖에 놓인다. Portal로 그리는 가장 바깥 요소(Radix `Dialog.Overlay`·`Dialog.Content` 등)에도 `data-ui="renewal"`과 루트 클래스를 붙인다. 빠뜨리면 그 요소는 기존 화면으로 취급된다.
  - 기존 `base.css`의 요소 전체 규칙(스크롤바 숨김, 버튼 커서·비활성 투명도, 포커스 외곽선)은 리뉴얼 영역에 적용되지 않는다.
  - 리뉴얼 영역의 포커스 표시와 스크롤바 숨김은 진입 파일 기본 규칙이 맡는다. 다른 포커스 모양이 필요할 때만 컴포넌트에서 유틸리티로 덮어쓴다. 비활성 표시(커서·색·`aria-disabled`)는 컴포넌트에서 직접 지정한다.
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
- **검사:** `npm run lint`가 스타일 규칙(`frontend/scripts/check-styles.mjs`)을 함께 검사한다.
  - 다음은 오류로 처리한다.
    - 새 CSS 파일, 임의값 클래스
    - 한 파일에 두 방식을 섞음 (`className` 식과 `cn`·`clsx`·`cva`·`twMerge`·`tv` 인자 안의 문자열을 모두 본다)
    - `data-ui="renewal"` 파일의 기존 클래스 사용
    - Tailwind 파일이 기존 CSS를 쓰는 컴포넌트를 불러옴
  - `src/styles` 변경(커밋하지 않은 변경과 `main` 이후 커밋)은 경고한다.
  - 기존 CSS를 지우면 이 스크립트의 파일 목록에서도 지운다.
- **격리 검사:** `npm run test:styles`(`frontend/e2e/style-isolation.spec.ts`)가 리뉴얼 영역과 기존 화면의 격리를 검사한다.
- **기존 화면 비교:** `legacy-reset.css`·`tailwind.css`·기존 CSS를 고칠 때는 고치기 전후 계산 스타일을 비교해 기존 화면에 차이가 없음을 확인한다. 방법은 `frontend/scripts/compare-legacy-styles.mjs` 머리말을 따른다.

### 기존 CSS(`frontend/src/styles/`) 규칙

- **동결**
  - 기존 CSS는 리뉴얼 전 화면을 유지하는 용도로만 남긴다.
  - 새 기능·새 화면을 위한 스타일을 추가하지 않는다. 버그 수정만 허용한다.
- **우선순위 고정**
  - 기존 CSS는 Tailwind 유틸리티보다 우선순위가 낮은 cascade layer(`@layer legacy`) 안에 둔다.
  - 기존 CSS가 리뉴얼 화면의 Tailwind 스타일을 덮어쓰면 안 된다.
- **리뉴얼 완료 시 삭제**
  - 화면을 리뉴얼하면 그 화면 전용 파일(`frontend/src/styles/pages/*.css`)을 같은 작업에서 삭제한다.
  - 공통 파일(`base`·`layout`·`components.css`)의 규칙은 그 클래스를 쓰는 기존 화면이 하나도 없을 때 삭제한다.
