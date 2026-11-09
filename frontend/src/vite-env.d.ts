/// <reference types="vite/client" />

/** 부품 확인 화면(/__ui) 포함 여부. vite.config.ts의 define으로 빌드 때 정해진다 (GitHub #9) */
declare const __UI_PREVIEW__: boolean;

/** 인증 목업 사용 여부 (src/auth/authMock.ts). 개발 서버·Vercel Preview 기본 true, 운영 false (GitHub #15) */
declare const __AUTH_MOCK__: boolean;
