# Vercel·gcloud 운영 설정 및 확인

> 이 문서는 저장소에 구현된 배포 구성을 설명합니다. 현재 배포의 설정값·상태·로그를 확인하지 않은 항목은 검증된 운영 사실로 간주하지 않습니다. 백엔드 배포 절차는 [gcloud 백엔드 배포 안내](./gcloud-backend-deployment.md)를 참고합니다.

## 서비스 구성

| 서비스 | 역할 | 저장·실행 특성 |
|---|---|---|
| Vercel | React/Vite 프런트엔드 정적 파일 배포 | `/api/backend/*` 요청을 gcloud 백엔드로 전달(rewrite) |
| gcloud(GCE VM) | Spring Boot 백엔드를 Docker Compose로 실행 | 세션·작업 상태는 메모리, 오디오는 임시 파일, 연결 설정은 암호화 파일 |
| Notion 또는 Confluence | 참석자·템플릿·완료 회의 문서 저장 | 연결된 Provider가 업무 문서의 영속 저장소 |

오디오 조각은 브라우저에서 같은 출처의 `/api/backend/...`로 보내고 Vercel이 백엔드로 전달합니다. 별도 객체 저장소나 Vercel Function은 오디오 경로에 사용하지 않습니다.

## Vercel 프런트엔드 설정

| 항목 | 값 |
|---|---|
| Root Directory | `frontend` |
| Framework / Node.js | Vite / 24.x |
| Install / Build / Output | `npm ci` / `npm run build` / `dist` |
| `VITE_API_BASE_URL` | `/api/backend` (설정하지 않아도 같은 값을 기본으로 사용) |

`frontend/vercel.json`은 `/api/backend/:path*`를 gcloud 백엔드로 전달하고, 나머지 경로는 `index.html`로 보내 SPA(Single Page Application) 새로고침을 지원합니다. 브라우저 Network에서 API 요청이 같은 Vercel 출처의 `/api/backend/...`로 향하는지 확인합니다. Vercel Preview를 사용할 경우 해당 Origin을 백엔드 `ALLOWED_ORIGINS`에 포함해야 합니다. `VITE_` 변수는 브라우저에 전달되므로 비밀값을 두지 않으며, OpenAI·Gmail 자격 증명과 저장소 암호화 키는 Vercel 환경 변수에 넣지 않습니다.

## gcloud 백엔드 설정

백엔드는 `Dockerfile` 이미지로 실행하고 컨테이너는 `9010` 포트를 사용합니다. 프로세스 상태 확인은 `/actuator/health`(배포 스크립트가 사용)와 `/api/v1/system/health`(프런트엔드 상태 확인용)로 할 수 있습니다. 두 응답 모두 프로세스 상태만 알려 주며 OpenAI, Notion/Confluence, 이메일, Slack 기능까지 정상이라는 뜻은 아닙니다.

필요한 설정 이름은 다음과 같습니다.

| 설정 | 용도 |
|---|---|
| `ALLOWED_ORIGINS` | 운영 프런트엔드 Origin 허용 (필수) |
| `OPENAI_API_KEY` | OpenAI 음성 인식·회의록 생성 (필수) |
| `DOCUMENT_SETTINGS_ENCRYPTION_KEY` | 연결 설정 암호화 파일 키 (필수) |
| `TRANSCRIPTION_MODEL`, `MINUTES_MODEL` | 필요 시 기본 AI 모델 변경 |
| `EMAIL_PROVIDER`, `EMAIL_OAUTH_CLIENT_ID`, `EMAIL_OAUTH_CLIENT_SECRET`, `EMAIL_OAUTH_REFRESH_TOKEN`, `EMAIL_SENDER_ADDRESS` | Gmail API 발송 기본 설정 및 fallback |
| `NOTIFICATION_PROVIDER`, `SLACK_MEETING_WEBHOOK_URL`, `SLACK_ADMIN_WEBHOOK_URL` | Slack 알림 fallback과 관리자 오류 알림(선택) |
| `APP_COMPANY_ID`, `APP_COMPANY_NAME`, `APP_TIMEZONE` | 공개 앱 설정 |

`DOCUMENT_SETTINGS_DIR`, `TEMP_AUDIO_DIR`, `PORT`는 `scripts/deploy/compose.yml`이 지정합니다. 문서 연결·Gmail·Slack은 설정 화면에서 입력한 값이 백엔드의 암호화 전역 설정에 저장되고, 환경변수는 설정 화면 값이 없을 때의 fallback입니다. 브라우저 `localStorage`에는 같은 브라우저에서 설정을 다시 등록하기 위한 복구본이 남으며 브라우저 프로필과 기기에 한정됩니다.

## 운영상 데이터 한계

- 회의 세션과 처리·전달 상태는 백엔드 메모리에 있어 컨테이너·VM 재시작 시 복구되지 않습니다.
- 오디오는 백엔드의 임시 파일(`TEMP_AUDIO_DIR`)에 보관합니다. 영구 저장이나 재시작 뒤 복원을 보장하지 않습니다.
- 회의록 초안 생성 성공 뒤 오디오를 정리합니다. 처리 실패 시 재시도에 필요한 임시 파일은 제한된 기간(24시간) 보존합니다.
- 연결 설정은 VM의 `settings/` 디렉터리 암호화 파일에 있으므로 컨테이너 재시작 뒤에도 유지됩니다. 같은 암호화 키가 없으면 읽을 수 없습니다.
- 저장이 완료된 회의와 참석자·템플릿은 연결된 Notion 또는 Confluence에서 다시 읽을 수 있습니다.

## 배포 후 확인 순서

1. Vercel 사이트가 열리고 SPA 경로를 직접 새로고침해도 로드되는지 확인합니다.
2. 브라우저 Network에서 API 요청이 같은 출처의 `/api/backend/...`로 가는지 확인합니다.
3. 백엔드의 `GET /api/v1/system/health`와 컨테이너 로그를 확인합니다. 프로세스 상태와 기능 연동 상태는 별도로 판단합니다.
4. 설정 화면을 열어 문서·이메일·Slack 상태를 각각 확인합니다.
5. 비운영 테스트 회의로 오디오 업로드, 음성 처리, 검토, 문서 저장, 연결된 이메일·Slack 전달을 각각 확인합니다.
6. 저장된 회의가 Notion/Confluence 목록·상세에서 다시 조회되는지 확인합니다.

오류 분석 시 trace ID, 백엔드 오류 코드와 실패 단계를 함께 확인하되 Secret, 전체 이메일, 오디오, Transcript, 회의록 본문을 로그나 캡처에 복사하지 않습니다.
