# 프로젝트 지침

## 스타일 방식: 신규·리뉴얼 화면은 Tailwind CSS로만 작성 (필수)

화면 전체를 한 번에 바꾸지 않는다. 신규 화면을 만들거나 기존 화면을 리뉴얼할 때 그 화면을 Tailwind CSS로 작성한다. 근거와 세부 원칙은 [스타일 방식 검토](docs/renewal/스타일_전환_검토.md)를 따른다.

### 공존 원칙: 한 화면에는 한 가지 방식만

- 한 화면(라우트)과 그 화면이 쓰는 컴포넌트는 Tailwind 아니면 기존 CSS, 둘 중 하나로만 스타일을 입힌다.
- 같은 화면이나 같은 컴포넌트 안에서 Tailwind 클래스와 기존 CSS 클래스(`frontend/src/styles/`에 정의된 클래스)를 섞지 않는다.
- 리뉴얼 화면에서 기존 컴포넌트가 필요하면 기존 컴포넌트를 고치지 않고 Tailwind로 새 컴포넌트를 만든다.

### 신규·리뉴얼 화면 작성 규칙

- **도구 (1차 결정, 검토 문서 6장)**
  - Tailwind CSS v4와 Vite 플러그인을 쓴다.
  - 대화상자·메뉴·팝오버 등 접근성 부품은 Radix UI를 쓴다.

- **새 CSS 금지**
  - 화면이나 컴포넌트 전용 CSS 클래스·파일을 새로 만들지 않는다.
  - Tailwind 진입 CSS 파일에는 `@theme` 디자인 토큰, `@keyframes`, Tailwind로 표현할 수 없는 브라우저 전용 표기만 둔다.
- **토큰만 사용**
  - 색 토큰은 다운포스 CI를 기준으로 한다: Main `#FDB0CA`, Sub `#8BB0F4`, Sub `#CCBDF6`.
  - CI 원색은 흰 배경 대비가 낮다. 글자·흰 글자 버튼·테두리에는 파생 진한 색 토큰을 쓴다(검토 문서 7장).
  - 기본 배경은 흰색이다. 역할은 다음과 같다(검토 문서 7.4).
    - 파랑: 주 동작 (버튼·링크·포커스)
    - 분홍: 브랜드 강조
    - 보라: 선택·보조
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
  - 리뉴얼 화면은 브라우저 접근성 검사(axe)를 통과해야 완료로 본다.
- **반영 단위**
  - 리뉴얼은 화면 묶음 단위로 작업 브랜치에서 진행한다.
  - 묶음이 완성되면 `main`에 합친다.

### 구현 기준 (0단계 기반 작업 결과)

- **진입 파일**
  - Tailwind 진입 CSS는 `frontend/src/tailwind.css` 하나다. `App.tsx`는 이 파일만 불러온다.
  - layer 순서: `theme → base → legacy → components → utilities`.
- **리뉴얼 화면 루트**
  - 리뉴얼 화면(또는 새 레이아웃)의 가장 바깥 요소에 `data-ui="renewal"`을 붙인다.
  - 이 영역 안에서만 Tailwind 초기화(Preflight)가 적용된다. 밖의 기존 화면은 `src/styles/legacy-reset.css`가 브라우저 기본값을 유지한다.
  - 루트 요소에는 `font-sans text-body text-text bg-bg`를 지정한다. `html`·`body`의 글꼴과 색은 기존 CSS가 정한다.
- **색 클래스:** 용도별 토큰 이름을 우선 쓴다.
  - 배경: `bg-bg`·`bg-bg-subtle`·`bg-primary`·`bg-primary-soft`·`bg-brand`·`bg-selected`·`bg-danger`·`bg-danger-soft`·`bg-success-soft`·`bg-warning-soft`
  - 글자: `text-text`·`text-text-muted`·`text-primary-hover`(링크)·`text-primary-soft-text`·`text-brand-text`·`text-selected-text`·`text-danger-text`·`text-success-text`·`text-warning-text`
  - 테두리: `border-border`·`border-border-input`
  - 포커스: `outline-focus`
  - 단계 색(`blue-600` 등)은 용도별 토큰으로 표현할 수 없을 때만 쓴다.
- **글자 클래스:** `text-display`·`text-headline`·`text-title`·`text-body-lg`·`text-body`·`text-label`·`text-caption`·`text-nav`.
  - 크기·줄 높이·굵기·자간이 함께 정해지고, `tablet` 이상에서 자동으로 커진다.
  - Tailwind 기본 글자 크기(`text-sm` 등)는 지워져 있다.
- **그 밖의 토큰**
  - 모서리: `rounded-sm`(8)·`rounded-md`(12)·`rounded-lg`(16)·`rounded-xl`(20)·`rounded-full`
  - 그림자: `shadow-overlay`
  - 최대 폭: `max-w-auth`(480)·`max-w-dialog`(560)·`max-w-form`(640)·`max-w-reading`(720)·`max-w-content`(1040)
  - 화면 조건: `tablet:`·`tablet-lg:`·`short:`
  - 간격·크기: Tailwind 기본 단위(4px)를 쓴다 (예: `h-12` = 48px, `w-22` = 88px)
- **검사:** `npm run lint`가 스타일 규칙(`frontend/scripts/check-styles.mjs`)을 함께 검사한다.
  - 새 CSS 파일, 임의값 클래스, 한 파일에 두 방식을 섞으면 오류로 처리한다.
  - 기존 CSS를 지우면 이 스크립트의 파일 목록에서도 지운다.

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
