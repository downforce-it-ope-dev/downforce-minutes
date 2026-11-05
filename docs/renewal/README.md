# 리뉴얼 준비

> **상태:** 계획 수립 전. 리뉴얼 범위와 Phase는 아직 확정되지 않았으며, 이 문서는 확정된 제약과 준비 상태만 기록한다.

## 고정 제약

| 항목 | 내용 |
|---|---|
| Backend·저장 구조 | 변경하기 어렵다. 현재 Backend와 [API 명세](../product/api-spec.md)를 고정 계약으로 보고 Frontend를 개편한다. DB는 없으며 문서 Provider(Notion·Confluence)가 정본이다. |
| 배포 | Render는 사용하지 않는다. Backend는 Google Cloud(Artifact Registry + Compute Engine VM)에 올라간 인스턴스를 기준으로 하고, Vercel Frontend와의 연결(`/api/backend` 리라이트)은 그대로 유지한다. |
| 리뉴얼 범위 | 화면 UI/UX 수정과 신규 기능 추가가 예정되어 있다. 신규 기능이 Backend 변경을 요구하면 별도 판단 항목으로 분리한다. |
| 개발·테스트 | 로컬에서 Backend에 연결해 테스트할 수 있어야 한다. |

## 기준 문서

- 서비스 정의: [PRD](../product/PRD.md) (v2.2.0, 현재 구현 기준 정리본)
- 현재 동작: [현재 구현 기준](../product/implementation-status.md)
- 계약: [API 명세](../product/api-spec.md), [데이터 명세](../product/data-spec.md), [외부 연동](../product/integrations.md)
- 현행 UI: [UI 설계](../product/ui-design.md)와 PRD 화면 설계 절은 현행 기록이며 리뉴얼에서 새로 정의한다.
- 리뉴얼 화면 기획: [화면 목록](화면기획/00_화면목록.md) (화면별 기획 문서 포함, 초안)
- 현행 화면 캡처: [`현_UI`](현_UI)

## 로컬 테스트 환경

Frontend 개발 서버는 `/api` 요청을 `DEV_API_PROXY_TARGET`으로 프록시한다. 값을 지정하지 않으면 로컬 Backend(`http://127.0.0.1:8080`)로 연결한다.

```bash
# 터미널 1: Backend
cd backend && ALLOWED_ORIGINS=http://localhost:5173 ./gradlew bootRun

# 터미널 2: Frontend
cd frontend && npm ci && npm run dev
```

자세한 설정과 환경변수는 [Backend Setup](../setup/backend-setup.md), [Frontend Setup](../setup/frontend-setup.md)을 따른다. Google Cloud Backend에 직접 연결해 시험하면 실제 Notion·Confluence 문서, 이메일, Slack에 영향이 갈 수 있으므로 기본값은 로컬 Backend다.

## Phase 계획

아직 정의하지 않았다. 아래 표를 기준으로 리뉴얼 계획 확정 후 채운다.

| Phase | 목표 | 범위 | 완료 기준 |
|---|---|---|---|
| (미정) | | | |
