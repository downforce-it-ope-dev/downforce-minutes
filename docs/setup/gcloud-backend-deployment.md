# gcloud 백엔드 배포 안내

> 이 문서는 저장소의 `Dockerfile`, `scripts/deploy/compose.yml`, `scripts/deploy/gcloud-vm-deploy.sh`와 `frontend/vercel.json`에서 확인한 구성을 설명합니다. GCP 리소스와 실제 VM의 현재 상태는 확인하지 않았으므로 운영 사실로 간주하지 않습니다. 이 저장소에는 배포 자동화(GitHub Actions) workflow가 없고, 배포는 아래 절차를 수동으로 수행합니다.

## 구성 개요

- 백엔드는 기존 애플리케이션이 있는 `rami-api-backend` VM에서 별도 Docker Compose 서비스(`meeting-automation-backend`)로 실행합니다.
- 이미지는 Artifact Registry 저장소 `us-central1/meeting-automation`에 올리고, VM이 자신에게 연결된 서비스 계정의 토큰으로 이미지를 내려받습니다.
- 컨테이너는 `9010` 포트로 수신하고 `restart: unless-stopped`로 VM 재부팅 후에도 다시 시작합니다. 메모리는 640MB로 제한합니다.
- 문서 연결 설정과 오디오 임시 파일은 VM의 `/var/lib/meeting-automation-backend/` 아래 `settings/`, `audio/`에 둡니다.
- 프런트엔드는 Vercel에 정적으로 배포하고, `/api/backend/*` 요청을 이 백엔드로 전달합니다([프런트엔드 연결](#프런트엔드-연결)).

## 런타임 설정

배포 스크립트는 VM의 `/opt/apps/meeting-automation-backend/shared/.env`(root 소유, 권한 `0600`)를 컨테이너 환경으로 사용합니다. 다음 세 값은 필수이며 없으면 스크립트가 중단됩니다.

```dotenv
OPENAI_API_KEY=<OpenAI API key>
DOCUMENT_SETTINGS_ENCRYPTION_KEY=<Base64로 인코딩한 32바이트 키>
ALLOWED_ORIGINS=https://meeting-automation-one.vercel.app
```

- 처음부터 빈 문서 설정으로 시작할 때만 새 키를 만듭니다(`openssl rand -base64 32`). 기존 암호화 설정 파일을 이어서 쓰려면 기존 키를 그대로 사용해야 하며, 키를 바꾸면 기존 설정을 읽을 수 없습니다.
- 모델, 이메일, Slack 등 선택 설정은 같은 파일에 추가합니다. 변수 이름은 [백엔드 개발 환경 설정](./backend-setup.md#환경변수)을 따릅니다.
- `ALLOWED_ORIGINS`에는 프런트엔드 Origin을 정확히 지정합니다. 로컬 프런트엔드로 이 백엔드에 직접 연결하려면 `http://localhost:5173`도 포함해야 하며, 운영 설정 변경이므로 영향을 먼저 확인합니다.
- `compose.yml`이 `PORT`, `DOCUMENT_SETTINGS_DIR`, `TEMP_AUDIO_DIR`, `JAVA_TOOL_OPTIONS`를 직접 지정합니다. 설정 저장소는 `DOCUMENT_SETTINGS_DIR`과 `DOCUMENT_SETTINGS_ENCRYPTION_KEY`가 모두 있으면 암호화 파일 저장소를, 하나라도 없으면 프로세스 메모리를 사용합니다.
- 기존 `rami-api-backend`의 `.env`는 건드리지 않습니다.

## 수동 배포 절차

1. 저장소 루트에서 `Dockerfile`로 이미지를 빌드해 Artifact Registry에 올립니다. 이미지 이름은 `compose.yml`의 `image`와 같은 형식이며 태그(`IMAGE_TAG`)는 배포할 때마다 고유하게 정합니다.
2. VM에 두 파일을 올립니다.
   - 런타임 설정 파일: `/tmp/backend-runtime.env` (위 필수 세 값 포함)
   - Compose 파일: `/tmp/compose.yml` (`scripts/deploy/compose.yml` 내용)
3. VM에서 root 권한으로 `gcloud-vm-deploy.sh <IMAGE_TAG>`를 실행합니다. 스크립트가 `/opt`와 `/var/lib`에 쓰고 Docker를 실행하므로 root 권한이 필요합니다.

스크립트 동작:

- 업로드된 런타임 설정에 필수 세 값이 있는지 확인하고, 설치 후 업로드 임시 파일을 삭제합니다.
- 기존 `.env`가 있으면 백업합니다.
- VM 메타데이터 서버에서 받은 토큰으로 Artifact Registry에 로그인해 이미지를 내려받고 로그아웃합니다.
- `docker compose up --detach`로 컨테이너를 시작합니다.
- 최대 약 60초 동안(2초 간격 30회) `http://127.0.0.1:9010/actuator/health`를 확인합니다.
- 새 컨테이너가 정상 상태가 되지 않으면 로그를 출력하고 이전 이미지와 `.env`로 되돌립니다. 이전 이미지가 없으면 서비스를 내립니다.

배포 직후 확인 순서는 [운영 테스트 설정 기준](./production-test.md#배포-후-확인-순서)을 따릅니다.

## 이전 workflow가 사용한 GCP 리소스

과거 GitHub Actions workflow는 Workload Identity 연동, 배포용 서비스 계정, IAP(Identity-Aware Proxy) 터널 SSH를 사용했습니다. workflow는 이 저장소에서 삭제되었고, 해당 리소스가 GCP에 남아 있는지는 확인하지 않았습니다. 자동 배포를 다시 구성할 때 현재 상태를 점검한 뒤 사용합니다.

기록으로 남은 구성: Artifact Registry 저장소 `us-central1/meeting-automation`, 방화벽 규칙 `meeting-automation-backend-9010`(TCP 9010, VM 태그 `rami-api-backend` 대상).

## 프런트엔드 연결

Vercel은 same-origin reverse proxy로 사용합니다. 프런트엔드 빌드는 `VITE_API_BASE_URL`이 없으면 `/api/backend`를 API 기준 경로로 쓰고, `frontend/vercel.json`이 `/api/backend/:path*`를 gcloud 백엔드의 `9010` 포트로 전달합니다. 브라우저는 HTTPS로 Vercel에만 연결하므로 mixed-content 차단을 피합니다. Vercel에서 VM까지 구간은 HTTP이며, `9010` 포트가 Vercel에서 접근 가능해야 합니다. 백엔드 주소는 `frontend/vercel.json`에서 관리하며 이 문서에는 적지 않습니다.

백엔드가 전달된 `Origin` 헤더를 검사하므로 `ALLOWED_ORIGINS`는 프런트엔드 Origin과 정확히 일치해야 합니다.

## 용량과 재시작

- VM은 `e2-small`로 조정된 것으로 기록되어 있습니다. 컨테이너나 JVM 제한을 바꾸기 전에 기동 중 가용 메모리와 대표적인 전사·회의록 작업을 확인합니다.
- 세션과 처리 상태는 프로세스 메모리에 있고 오디오 조각은 `TEMP_AUDIO_DIR`에 있습니다. 배포나 VM 재시작은 진행 중인 세션을 중단시키며 오디오 복구를 보장하지 않습니다.
- 배포 전에 진행 중인 회의 처리가 없는지 확인합니다.
