#!/usr/bin/env node
// 스타일 규칙 검사 (docs/renewal/스타일_전환_검토.md S-06, CLAUDE.md)
// 1. 새 CSS 파일 금지: src/tailwind.css 외의 CSS 파일은 오류
// 2. 임의값 클래스 금지: text-[13px], bg-[#0b2d5b] 같은 Tailwind 임의값은 오류
// 기존 CSS와 공존할 때 쓰던 검사(한 파일 한 방식, 기존 컴포넌트 사용, 기존 CSS 변경 경고)는
// 기존 CSS를 모두 지운 R9(#41)에서 없앴다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const srcDir = join(root, 'src');

const TAILWIND_ENTRY = 'src/tailwind.css';

const ARBITRARY_VALUE = /(?:^|[\s"'`{])(!?-?(?:[a-z-]+:)*[a-z][a-z0-9-]*-\[[^\]\s]+\]|\[[a-z-]+:[^\]\s]+\])/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}
const rel = (p) => relative(root, p).split(sep).join('/');

const errors = [];
const files = walk(srcDir);

// 1. CSS 파일
for (const file of files.filter((f) => f.endsWith('.css'))) {
  const r = rel(file);
  if (r !== TAILWIND_ENTRY) {
    errors.push(`${r}: 새 CSS 파일은 만들 수 없습니다. 스타일은 Tailwind 유틸리티로 작성하세요.`);
  }
}

const sourceFiles = files.filter((f) => /\.(tsx|ts)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes(`${sep}testUtils${sep}`));
for (const file of sourceFiles) {
  const r = rel(file);
  const source = readFileSync(file, 'utf8');

  // 2. 임의값
  for (const m of source.matchAll(ARBITRARY_VALUE)) {
    errors.push(`${r}: 임의값 클래스 "${m[1]}"는 쓸 수 없습니다. 필요한 값은 src/tailwind.css의 @theme 토큰으로 추가하세요.`);
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`오류: ${e}`);
  console.error(`\n스타일 규칙 위반 ${errors.length}건 (CLAUDE.md, docs/renewal/스타일_전환_검토.md)`);
  process.exit(1);
}
console.log('스타일 규칙 검사 통과');
