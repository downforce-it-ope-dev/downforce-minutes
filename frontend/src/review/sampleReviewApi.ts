/*
 * 회의록 검토 화면 확인용 샘플 (Preview·개발 서버 전용, ReviewRoute가 __UI_PREVIEW__ && ?sample 일 때만 설치).
 * 주소: /meetings/sample-review/review?sample
 * 이 화면이 부르는 API만 브라우저 안에서 가짜로 응답한다(서버에 아무것도 보내지 않음). 저장·매핑은 메모리에만 남고,
 * 발송은 흉내만 내어 회의 결과 화면(모두 전달 완료)까지 이어진다.
 */

const SESSION = 'sample-review';

const PARTICIPANTS = [
  { id: 'sp1', name: '김민준', email: 'minjun@miinit.com' },
  { id: 'sp2', name: '이서연', email: 'seoyeon@miinit.com' },
  { id: 'sp3', name: '박도윤', email: 'doyun@miinit.com' },
  { id: 'sp4', name: '최하은', email: 'haeun@miinit.com' },
];

const LINES: Array<[string, number, number, string]> = [
  ['sa', 5, 18, '오늘은 4분기 배포 일정하고 QA 범위를 정리하려고 합니다. 먼저 일정부터 볼게요.'],
  ['sb', 19, 31, '지난주에 말씀드린 대로 결제 모듈 리팩터링이 아직 남아 있어서 일주일 정도 여유가 필요합니다.'],
  ['sa', 32, 36, '네, 알겠습니다.'],
  ['sc', 37, 52, 'QA 쪽에서는 회귀 테스트 케이스가 120개 정도인데, 자동화된 건 절반 수준이라 수동 확인 시간이 꽤 걸려요.'],
  ['sb', 53, 60, '자동화 비율을 이번 분기에 70%까지 올리는 걸 목표로 하면 어떨까요?'],
  ['sa', 61, 75, '좋습니다. 그럼 배포는 11월 넷째 주로 잡고, QA는 그 전주 목요일까지 끝내는 걸로 하죠.'],
  ['sc', 76, 80, '목요일이면 가능할 것 같습니다.'],
  ['sb', 81, 95, '모니터링 대시보드 알림 기준도 같이 손봐야 할 것 같아요. 지난번 장애 때 알림이 늦게 왔거든요.'],
  ['sa', 96, 110, '그 부분은 제가 인프라팀하고 다음 주 화요일에 따로 이야기해 보겠습니다.'],
  ['sc', 111, 118, '테스트 환경 데이터도 최신으로 맞춰 주시면 좋겠습니다.'],
  ['sa', 119, 130, '정리하면 배포는 넷째 주, QA는 목요일까지, 대시보드는 화요일 협의로 하겠습니다.'],
];

type SampleSpeaker = { speakerId: string; label: string; participantId: string | null; participantName: string | null };

function initialSession() {
  const speakers: SampleSpeaker[] = [
    { speakerId: 'sa', label: 'Speaker A', participantId: 'sp1', participantName: '김민준' },
    { speakerId: 'sb', label: 'Speaker B', participantId: null, participantName: null },
    { speakerId: 'sc', label: 'Speaker C', participantId: null, participantName: null },
  ];
  return {
    sessionId: SESSION,
    version: 1,
    status: 'REVIEW',
    meeting: { participantIds: PARTICIPANTS.map(({ id }) => id) },
    speakers,
    transcript: LINES.map(([speakerId, start, end, text], index) => ({ segmentId: `seg-${index}`, speakerId, startMs: start * 1000, endMs: end * 1000, text })),
    minutes: {
      templateId: 'default.md',
      templateVersion: '1',
      summary: '4분기 배포 일정과 QA 범위를 정리했다. 배포는 11월 넷째 주, QA는 그 전주 목요일까지 마치기로 했다.',
      discussionPoints: ['결제 모듈 리팩터링 일정', 'QA 회귀 테스트 자동화 비율', '모니터링 알림 기준'],
      decisions: ['배포는 11월 넷째 주', 'QA는 배포 전주 목요일까지 완료'],
      actionItems: [
        { ownerParticipantId: 'sp1', task: '인프라팀과 모니터링 알림 기준 협의', dueDate: '2026-11-17' },
        { ownerParticipantId: null, task: '회귀 테스트 자동화 비율 70% 계획 수립', dueDate: null },
      ],
      followUps: ['테스트 환경 데이터 최신화'],
    },
    allowedActions: ['UPDATE_SPEAKER_MAPPING', 'UPDATE_MINUTES', 'CONFIRM'],
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let installed = 0;
let original: typeof fetch | null = null;

/**
 * 샘플 응답을 켠다(여러 번 불러도 한 번만 바꾼다). 발송 뒤 회의 결과 화면도 같은 샘플로 보이도록,
 * 켜진 탭에서는 새로고침 전까지 유지한다. 돌려받은 함수는 테스트에서만 쓴다.
 */
export function installSampleReviewApi(): () => void {
  installed += 1;
  if (installed === 1) {
    let session = initialSession();
    let published = false;
    original = globalThis.fetch;
    const passThrough = original.bind(globalThis);
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, window.location.href);
      const path = url.pathname.replace(/^.*\/api\/v1/, '/api/v1');
      const method = (init?.method ?? 'GET').toUpperCase();
      if (!published && path === `/api/v1/meeting-sessions/${SESSION}` && method === 'GET') return json({ data: session });
      if (path === `/api/v1/meeting-sessions/${SESSION}/minutes` && method === 'PUT') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        session = { ...session, version: session.version + 1, minutes: { ...session.minutes, ...body } };
        return json({ data: { version: session.version, minutes: session.minutes } });
      }
      if (path === `/api/v1/meeting-sessions/${SESSION}/speaker-mappings` && method === 'PUT') {
        const { mappings } = JSON.parse(String(init?.body ?? '{}')) as { mappings: Array<{ speakerId: string; participantId: string | null }> };
        session = {
          ...session,
          version: session.version + 1,
          speakers: session.speakers.map((speaker) => {
            const next = mappings.find((item) => item.speakerId === speaker.speakerId);
            if (!next) return speaker;
            return { ...speaker, participantId: next.participantId, participantName: PARTICIPANTS.find(({ id }) => id === next.participantId)?.name ?? null };
          }),
        };
        return json({ data: { version: session.version, mappings: session.speakers.map(({ speakerId, participantId, participantName }) => ({ speakerId, participantId, participantName })) } });
      }
      // 발송 흉내: 확정 → 저장·전달 시작 → 회의 결과 화면에서 모두 완료로 보인다(실제로는 아무것도 보내지 않음)
      if (path === `/api/v1/meeting-sessions/${SESSION}/confirm` && method === 'POST') {
        session = { ...session, version: session.version + 1, status: 'CONFIRMED' };
        return json({ data: { status: 'CONFIRMED', version: session.version } });
      }
      if (path === `/api/v1/meeting-sessions/${SESSION}/publish` && method === 'POST') {
        published = true;
        return json({ data: { sessionId: SESSION, status: 'PUBLISHING' } }, 202);
      }
      if (published && path === `/api/v1/meeting-sessions/${SESSION}` && method === 'GET') {
        return json({ data: {
          sessionId: SESSION,
          version: session.version + 1,
          status: 'COMPLETED',
          allowedActions: [],
          meeting: session.meeting,
          document: { documentId: 'sample-document' },
          deliveries: session.meeting.participantIds.map((id, index) => ({ deliveryId: `sample-${index}`, channel: 'EMAIL', recipientParticipantId: id, status: 'SENT' })),
        } });
      }
      if (path === '/api/v1/participants' && method === 'GET') return json({ data: { items: PARTICIPANTS } });
      if (path === '/api/v1/app-config' && method === 'GET') {
        return json({ data: {
          company: { id: 'sample', name: 'Sample', timezone: 'Asia/Seoul' },
          document: { provider: 'NOTION', configured: true, connectionVersion: 1, rootUrl: 'https://notion.example' },
          email: { enabled: true, configured: true },
          notification: { provider: null, enabled: false },
        } });
      }
      return passThrough(input, init);
    };
  }
  return () => {
    installed = Math.max(0, installed - 1);
    if (installed === 0 && original) {
      globalThis.fetch = original;
      original = null;
    }
  };
}
