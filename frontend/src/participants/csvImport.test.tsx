import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Participant } from '../participantsApi';
import { withHealthyBackend } from '../testUtils/withHealthyBackend';
import { CsvImportDialog } from './CsvImportDialog';
import { countByStatus, decodeCsv, parseCsv, planImport, readPeople } from './csvImport';

const CP949 = [184, 222, 192, 207, 176, 232, 193, 164, 44, 192, 204, 184, 167, 13, 10, 104, 111, 110, 103, 64, 109, 105, 105, 110, 105, 116, 46, 99, 111, 109, 44, 200, 171, 177, 230, 181, 191, 13, 10];
const utf8 = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

describe('CSV 읽기 (PTC-01-P03)', () => {
  it('BOM 있는 UTF-8, BOM 없는 UTF-8, 한국어 Excel CP949를 모두 읽는다', () => {
    expect(decodeCsv(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('이름')]).buffer)).toBe('이름');
    expect(decodeCsv(utf8('메일계정,이름'))).toBe('메일계정,이름');
    expect(decodeCsv(new Uint8Array(CP949).buffer)).toBe('메일계정,이름\r\nhong@miinit.com,홍길동\r\n');
  });

  it('따옴표 안 쉼표·줄바꿈·"", CRLF·LF를 처리한다', () => {
    expect(parseCsv('a,"b,c","d\n""e"""\r\nf,g\nh')).toEqual([['a', 'b,c', 'd\n"e"'], ['f', 'g'], ['h']]);
  });

  it('머리글은 별칭·순서·대소문자·BOM과 관계없이 찾고, 팀 열은 무시하며 빈 행은 건너뛴다', () => {
    expect(readPeople(parseCsv('﻿팀,Name, EMAIL \nAX팀,홍길동,Hong@Miinit.com\n,,\n,김철수,kim@miinit.com'))).toEqual({
      ok: true,
      people: [
        { line: 2, name: '홍길동', email: 'hong@miinit.com' },
        { line: 4, name: '김철수', email: 'kim@miinit.com' },
      ],
    });
    expect(readPeople(parseCsv('팀,성명\nA,B'))).toEqual({ ok: false, missing: ['메일계정'] });
  });

  it('등록 / 이름 갱신 / 이미 등록됨 / 파일 안 중복 / 오류를 판정한다', () => {
    const roster: Participant[] = [
      { id: 'a', name: '홍길동', email: 'Hong@miinit.com' },
      { id: 'b', name: '김철수', email: 'kim@miinit.com' },
    ];
    const items = planImport(
      [
        { line: 2, name: '새사람', email: 'new@miinit.com' },
        { line: 3, name: '홍길동', email: 'hong@miinit.com' },
        { line: 4, name: '김철수(개명)', email: 'kim@miinit.com' },
        { line: 5, name: '새사람2', email: 'new@miinit.com' },
        { line: 6, name: '', email: 'x@gmail.com' },
        { line: 7, name: '형식', email: 'bad' },
      ],
      roster,
    );
    expect(items.map(({ status, reason }) => (reason ? `${status}:${reason}` : status))).toEqual([
      'create', 'same', 'rename', 'duplicate', 'error:이름 없음 · 회사 메일 아님', 'error:메일계정 형식 오류',
    ]);
    expect(items[2].existing?.id).toBe('b');
    expect(countByStatus(items)).toEqual({ create: 1, rename: 1, same: 1, duplicate: 1, error: 2 });
  });
});

const ROSTER: Participant[] = [{ id: 'k', name: '김철수', email: 'kim@miinit.com' }];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function csvFile(text: string, name = 'people.csv') {
  const file = new File([text], name, { type: 'text/csv' });
  // jsdom의 File에는 arrayBuffer가 없을 수 있다
  Object.defineProperty(file, 'arrayBuffer', { value: async () => utf8(text) });
  return file;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CSV 일괄 등록 대화상자', () => {
  it('파일 → 확인 → 등록(한 건씩, 이름 갱신 포함) → 결과. 실패한 행만 같은 멱등 키로 다시 시도한다', async () => {
    const created: string[] = [];
    let failOnce = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      const method = init.method ?? 'GET';
      if (path === '/api/v1/participants' && method === 'GET') return json({ data: { items: ROSTER } });
      if (path === '/api/v1/participants' && method === 'POST') {
        const body = JSON.parse(String(init.body));
        if (body.email === 'b@miinit.com' && failOnce) {
          failOnce = false;
          return json({ error: { code: 'INTERNAL' } }, 500);
        }
        created.push(body.email);
        return json({ data: { id: body.email, ...body } }, 201);
      }
      if (path === '/api/v1/participants/k' && method === 'PATCH') return json({ data: { ...ROSTER[0], ...JSON.parse(String(init.body)) } });
      throw new Error(`Unexpected ${method} ${path}`);
    });
    vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <CsvImportDialog open onClose={onClose} />
      </MemoryRouter>,
    );
    const dialog = screen.getByRole('dialog', { name: 'CSV로 일괄 등록' });
    expect(within(dialog).getByRole('link', { name: '양식 내려받기' }).getAttribute('href')).toBe('/participants-template.csv');

    fireEvent.change(within(dialog).getByLabelText('파일 선택'), { target: { files: [csvFile('x', 'people.xlsx')] } });
    expect(await within(dialog).findByRole('alert')).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText('파일 선택'), {
      target: { files: [csvFile('이름,메일계정\n에이,a@miinit.com\n비,b@miinit.com\n김철수 개명,kim@miinit.com\n외부,x@gmail.com')] },
    });
    const list = await within(dialog).findByRole('list', { name: 'CSV 행' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    fireEvent.click(within(dialog).getByRole('button', { name: /오류 1/ }));
    expect(within(list).getAllByRole('listitem').map((row) => row.textContent)).toEqual(['5외부x@gmail.com회사 메일 아님']);

    fireEvent.click(within(dialog).getByRole('button', { name: '2명 등록 · 1명 갱신' }));
    expect(await within(dialog).findByText('일부 실패')).toBeTruthy();
    expect(within(within(dialog).getByRole('list', { name: '실패한 행' })).getAllByRole('listitem')[0].textContent).toContain('b@miinit.com');
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ name: '김철수 개명' });

    fireEvent.click(within(dialog).getByRole('button', { name: '실패 1명 다시 시도' }));
    expect(await within(dialog).findByText('완료', { selector: 'p' })).toBeTruthy();
    const keys = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'POST' && String(init.body).includes('b@miinit.com'))
      .map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'));
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(created).toEqual(['a@miinit.com', 'b@miinit.com']);

    fireEvent.click(within(dialog).getByRole('button', { name: '완료' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const result = onClose.mock.calls[0][0];
    expect(result.created.map(({ email }: Participant) => email)).toEqual(['a@miinit.com', 'b@miinit.com']);
    expect(result.renamed).toEqual([{ id: 'k', name: '김철수 개명', email: 'kim@miinit.com' }]);
  });

  it('문서 연결이 바뀌는 오류가 나면 남은 행을 멈춘다', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (method === 'GET') return json({ data: { items: [] } });
      void input;
      return json({ error: { code: 'DOCUMENT_CHANGE_BUSY' } }, 409);
    });
    vi.stubGlobal('fetch', withHealthyBackend(fetchMock));
    render(
      <MemoryRouter>
        <CsvImportDialog open onClose={() => undefined} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('파일 선택'), { target: { files: [csvFile('email,name\na@miinit.com,A\nb@miinit.com,B\nc@miinit.com,C')] } });
    fireEvent.click(await screen.findByRole('button', { name: '3명 등록' }));
    const failed = await screen.findByRole('list', { name: '실패한 행' });
    expect(within(failed).getAllByRole('listitem').map((row) => row.textContent?.slice(-6))).toEqual(['문서 연결 변경', '등록 안 함', '등록 안 함'].map((text) => text.slice(-6)));
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
});
