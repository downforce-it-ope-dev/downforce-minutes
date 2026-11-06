# 🖥️ Frontend 개발 환경 설정

이 가이드는 Meeting Automation 모노레포의 `frontend/` React 웹을 로컬에서 실행하기 위한 절차를 설명한다. 현재 동작은 [현재 구현 기준](../product/implementation-status.md)을 참고한다.

> **기준 환경:** Node.js 24, npm, React 19, TypeScript 5.x, Vite 7.x, VS Code
> **주 개발 OS:** Windows 10/11 + PowerShell

## 환경 개요

```text
meeting-automation/
├─ frontend/       # 이 문서에서 설정하는 React 앱
├─ backend/        # Spring Boot API
└─ docs/
```

Frontend는 업무 API 서버가 아니다. OpenAI, Notion/Confluence, Email, Slack의 Secret은 Backend에서만 관리한다. 오디오 조각도 Backend API에 직접 전송한다. 브라우저에 노출되는 `VITE_` 변수에는 Backend 공개 URL 외 Secret을 넣지 않는다.

로컬 개발은 Frontend 개발 서버(`http://localhost:5173`)가 `/api` 요청을 Backend로 전달(proxy)하는 구조다. 기본 대상은 로컬 Backend(`http://127.0.0.1:8080`)이며, 환경변수 `DEV_API_PROXY_TARGET`으로 바꿀 수 있다([Backend 연결](#backend-연결) 참고).

## 사전 준비

- Git 저장소를 로컬에 clone한다.
- Node.js 24를 설치하고 프로젝트의 `.nvmrc`에 기록된 버전을 선택한다.
- IDE 설치 후 이 문서의 VS Code 설정을 적용한다.

### Node.js 설치

Windows에서는 [Node.js 공식 다운로드](https://nodejs.org/en/download)에서 24.x Windows Installer를 받아 설치한다. 설치 마법사에서 npm 설치와 PATH 등록을 유지한다. 이미 Node 버전 관리 도구를 쓰는 경우 저장소의 `.nvmrc` 버전을 선택한다.

새 PowerShell 창을 열어 PATH를 다시 읽은 다음 확인한다.

```powershell
node --version
npm --version
where.exe node
```

`node --version`이 `v24`로 시작하는지 확인한다. 다른 버전이 먼저 출력되면 `where.exe node`에 나온 경로 순서와 IDE 터미널의 PATH를 확인한다.

macOS/Linux에서는 [Node.js 공식 다운로드](https://nodejs.org/en/download/package-manager) 페이지의 OS별 설치 방법을 따른다. Node 버전 관리 도구를 쓰는 팀원은 저장소 `.nvmrc`가 제공될 경우 이를 사용한다.

## 의존성 설치와 실행

저장소 루트에서 시작한다.

```powershell
Set-Location frontend
```

`package-lock.json`에 잠긴 의존성을 설치한다. `.npmrc`의 strict engine 검사로 Node 24 범위를 벗어나면 설치가 실패한다.

```powershell
npm ci
```

개발 서버를 실행한다.

```powershell
npm run dev
```

터미널에 출력되는 Local URL을 브라우저에서 연다. Vite 기본 포트는 `5173`이다. 다른 서비스가 해당 포트를 사용 중이면 Vite가 출력한 실제 URL을 사용한다. `npm run dev`는 화면 개발 서버만 실행한다. 실제 회의 흐름은 Backend를 별도로 실행하고 아래 [Backend 연결](#backend-연결)대로 연결한다. 오디오 업로드·처리 동작은 [현재 구현 기준](../product/implementation-status.md)을 따른다.

프로젝트 스크립트와 사용 가능한 명령을 확인하려면 다음을 실행한다.

```powershell
npm run
```

`package.json`은 `dev`, `build`, `lint`, `test`, `test:viewport`, `test:a11y` 스크립트를 제공한다. `test:viewport`와 `test:a11y`는 Playwright 기반 화면·접근성 테스트다.

```powershell
npm run build
npm run lint
npm run test
npm run test:viewport
npm run test:a11y
```

## 환경변수

Vite는 `VITE_` 접두사가 붙은 값을 브라우저 bundle에 포함한다. 이 값은 비밀로 취급할 수 없다. 이 프로젝트는 `VITE_API_BASE_URL`만 공개 환경변수로 허용한다.

| 변수 | 사용 시점 | 설명 |
|---|---|---|
| `VITE_API_BASE_URL` | 프로덕션 빌드, 단위 테스트(`vitest`) | 프로덕션 빌드에서 없으면 `/api/backend`를 사용한다. 테스트 모드에서 없으면 `http://localhost:8080`을 사용한다. 개발 서버(`npm run dev`)에서는 사용하지 않는다. |
| `DEV_API_PROXY_TARGET` | 개발 서버 | `/api` 프록시 대상. 기본 `http://127.0.0.1:8080`. `VITE_` 접두사가 없어 bundle에 포함되지 않는다. |

`frontend/.env.example`의 `VITE_API_BASE_URL=http://localhost:8080`은 테스트 모드 기본값과 같은 예시다. 환경변수를 추가/변경한 뒤에는 Vite 개발 서버를 재시작한다. 실제 배포 URL을 로컬 파일에 기록하지 말고 개발/배포 환경을 분리한다. `.env.local`은 Git에 올리지 않고, Secret을 요구하는 설정을 여기에 두지 않는다. 저장소 `.gitignore`는 `.env`와 `.env.*`를 제외하고 `.env.example`류만 허용한다. 예시 파일에는 Secret을 넣지 않는다.

## Backend 연결

### 로컬 Backend (기본)

1. [Backend 개발 환경 설정](./backend-setup.md)대로 `cd backend && ./gradlew bootRun`을 실행한다(`http://localhost:8080`).
2. `cd frontend && npm run dev`를 실행한다. 프록시 대상 기본값이 로컬 Backend이므로 추가 설정이 필요 없다.
3. Backend의 `ALLOWED_ORIGINS`는 비어 있으면 `http://localhost:5173`, `http://127.0.0.1:5173`을 허용한다.

### gcloud Backend

로컬 Backend를 실행하지 않고 gcloud 백엔드에 붙여 화면을 확인할 때는 프록시 대상을 지정한다.

```powershell
$env:DEV_API_PROXY_TARGET = "http://<gcloud-backend-host>:9010"
npm run dev
```

- 운영 Backend가 연결한 Notion/Confluence, Gmail, Slack에 실제 문서 생성과 발송이 일어난다. 테스트 회의와 테스트 수신자로 제한한다.
- gcloud Backend의 `ALLOWED_ORIGINS`에 `http://localhost:5173`이 포함되어 있어야 한다. 없으면 CORS 오류가 나며, 운영 설정 변경이므로 배포 담당자와 먼저 확인한다.
- 배포용 Vercel 경로(`/api/backend`)는 개발 서버에서 사용하지 않는다.

### 문제 확인

CORS 오류나 연결 실패가 나면 프록시 대상(`DEV_API_PROXY_TARGET`), 포트, scheme(http/https), Backend `ALLOWED_ORIGINS`를 함께 확인한다. Frontend에서 Provider Secret을 사용해 우회하지 않는다.

## Vercel 배포

Vercel 프로젝트는 monorepo의 `frontend/` 디렉터리를 Root Directory로 사용한다. Framework Preset은 Vite, Node.js는 `24.x`, Install Command는 `npm ci`, Build Command는 `npm run build`, Output Directory는 `dist`로 설정한다. Production과 Preview의 `VITE_API_BASE_URL`은 `/api/backend`로 설정한다. `frontend/vercel.json`은 이 same-origin 경로를 GCE Backend의 HTTP API로 전달한다.

브라우저는 HTTPS인 Vercel same-origin API 경로로 요청하고, Vercel rewrite가 오디오를 포함한 API 요청을 GCE Backend로 전달한다. Backend의 `ALLOWED_ORIGINS`에는 Frontend Origin을 허용하고 `TEMP_AUDIO_DIR`를 쓸 수 있는 임시 디렉터리로 지정한다. 오디오 임시 파일은 영구 저장이 아니다.

저장소가 Vercel 프로젝트의 Git source에 연결되어 있지 않으면 `master` 푸시만으로 배포가 시작되지 않는다. 프로젝트가 `frontend/`를 Root Directory로 사용하는지 확인한다. 배포 뒤 홈페이지, `/api/backend/api/v1/system/health`, 오디오 업로드를 각각 확인한다. 특정 Vercel 배포가 현재 정상인지는 별도의 운영 점검이 필요하다.

## VS Code 설정

VS Code에서 모노레포 루트 `meeting-automation/`을 연다. 확장 프로그램은 다음을 권장한다.

- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier - Code formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) — 저장 시 포맷을 프로젝트가 설정한 경우 사용
- [TypeScript and JavaScript Language Features](https://code.visualstudio.com/docs/languages/typescript) — VS Code 기본 제공, 별도 설치 불필요

설정 위치 우선순위는 저장소 `.vscode/settings.json` 및 권장 확장 → 개인 VS Code 설정이다. 저장소 설정 파일이 없으면 개인 설정에서 아래 옵션을 사용할 수 있다.

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.tsdk": "frontend/node_modules/typescript/lib"
}
```

팀 저장소가 별도 포맷터나 ESLint 설정을 확정하면 개인 설정 대신 저장소 규칙을 따른다. 확장 프로그램 설치만으로 ESLint/Prettier 설정 파일을 임의 생성하지 않는다.

### 디버깅

- UI 디버깅은 브라우저 개발자 도구를 기본으로 사용한다.
- Network 탭에서 API URL, HTTP status, CORS 오류를 확인한다.
- Console이나 Network에서 Authorization header, Secret, Audio/Transcript 본문을 복사해 공유하지 않는다.
- Vite sourcemap과 브라우저 debugger를 사용할 수 있지만, 실제 Provider credential을 Frontend에서 시험하지 않는다.

## 자주 발생하는 문제

| 증상 | 확인 방법 |
|---|---|
| `node` 또는 `npm`을 찾지 못함 | 설치 후 새 PowerShell을 열고 `where.exe node` 확인 |
| Node 버전이 24가 아님 | 버전 관리 도구/Windows PATH 우선순위 확인 |
| `npm ci`가 lockfile 오류로 실패 | `package-lock.json`이 있는지 확인하고, lockfile을 임의 삭제하지 말고 `package.json`과 일치하는지 확인 |
| 개발 서버가 API에 연결되지 않음 | `DEV_API_PROXY_TARGET`(기본 `http://127.0.0.1:8080`), Backend 실행 여부, Backend `ALLOWED_ORIGINS` 확인. 개발 서버는 `VITE_API_BASE_URL`을 사용하지 않음 |
| 환경변수 변경이 반영되지 않음 | Vite 서버 재시작 및 변수명 확인 (`VITE_API_BASE_URL`은 프로덕션 빌드·테스트용, `DEV_API_PROXY_TARGET`은 개발 서버용) |
| VS Code와 터미널의 Node 버전이 다름 | VS Code 전체를 재시작한 뒤 통합 터미널에서 `node --version` 확인 |

## 준비 완료 확인

- `node --version`이 `v24`로 시작하고 `.nvmrc` 값이 `24`다.
- `npm ci`가 성공한다.
- `npm run dev`로 Frontend가 열린다.
- 프록시 대상 Backend에 연결된다(`/api/v1/system/health` 응답 확인).
- `npm run build`, `npm run lint`, `npm run test`가 성공한다.
- Frontend 환경설정과 bundle에 Provider Secret이 없다.

## 참고 문서

- [Node.js Downloads](https://nodejs.org/en/download)
- [Vite Guide](https://vite.dev/guide/)
- [React Learn](https://react.dev/learn)
- [VS Code TypeScript](https://code.visualstudio.com/docs/languages/typescript)
