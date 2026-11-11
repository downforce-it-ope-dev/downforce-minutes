#!/usr/bin/env node
// 스타일 규칙 검사 (docs/renewal/스타일_전환_검토.md S-06, CLAUDE.md)
// 1. 새 CSS 파일 금지: src/tailwind.css와 기존 CSS(src/styles, 목록 고정) 외의 CSS 파일은 오류
// 2. 임의값 클래스 금지: text-[13px], bg-[#0b2d5b] 같은 Tailwind 임의값은 오류
// 3. 한 파일 한 방식: 기존 CSS 클래스와 Tailwind 유틸리티를 한 파일에서 함께 쓰면 오류.
//    data-ui="renewal"이 있는 파일은 Tailwind 유틸리티가 없어도 기존 CSS 클래스를 쓰면 오류
//    (className 값과 cn·clsx·cva·twMerge·tv 인자 안의 문자열을 모두 검사)
// 4. 리뉴얼 화면의 기존 컴포넌트 사용 금지: Tailwind 파일이 기존 CSS 클래스를 쓰는 파일을 상대 경로로 불러오면 오류
// 5. 기존 CSS 변경 경고: src/styles에 커밋하지 않은 변경이나 main 이후 커밋한 변경이 있으면 경고
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const srcDir = join(root, 'src');

// 기존 CSS 파일 목록 (동결). 화면을 리뉴얼해 파일을 지우면 이 목록에서도 지운다.
const LEGACY_CSS_FILES = new Set([
  'src/styles/index.css',
  'src/styles/legacy-reset.css',
  'src/styles/base.css',
  'src/styles/layout.css',
  'src/styles/components.css',
  'src/styles/pages/home.css',
  'src/styles/pages/meetings.css',
  'src/styles/pages/participants.css',
  'src/styles/pages/settings.css',
  'src/styles/pages/share.css',
]);
const TAILWIND_ENTRY = 'src/tailwind.css';

const TAILWIND_TOKEN = new RegExp(
  '^(?:[a-z-]+:)*!?-?(?:' +
    [
      '(?:m|p)[trblxyse]?-', 'w-', 'h-', 'size-', 'min-[wh]-', 'max-[wh]-', 'flex', 'grid', 'gap-', 'text-', 'bg-',
      'border', 'rounded', 'shadow', 'font-', 'leading-', 'tracking-', 'items-', 'justify-', 'self-', 'place-',
      'content-', 'overflow', 'absolute$', 'relative$', 'fixed$', 'sticky$', 'static$', 'inset', 'top-', 'left-',
      'right-', 'bottom-', 'z-', 'opacity-', 'hidden$', 'block$', 'inline', 'sr-only$', 'truncate$', 'cursor-',
      'transition', 'duration-', 'ease-', 'animate-', 'ring', 'outline', 'space-[xy]-', 'divide', 'col-', 'row-',
      'order-', 'basis-', 'shrink', 'grow', 'aspect-', 'object-', 'tabular-nums$', 'underline$', 'select-',
      'pointer-events-', 'whitespace-', 'break-', 'line-clamp-', 'list-', 'appearance-', 'fill-', 'stroke-',
      'container$', 'mx-auto$', 'scroll-', 'snap-', 'touch-', 'will-change-',
    ].join('|') +
    ')',
);
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
const warnings = [];
const files = walk(srcDir);

// 1. CSS 파일
for (const file of files.filter((f) => f.endsWith('.css'))) {
  const r = rel(file);
  if (r !== TAILWIND_ENTRY && !LEGACY_CSS_FILES.has(r)) {
    errors.push(`${r}: 새 CSS 파일은 만들 수 없습니다. 스타일은 Tailwind 유틸리티로 작성하세요.`);
  }
}

// 기존 CSS 클래스 목록
const legacyClasses = new Set();
for (const r of LEGACY_CSS_FILES) {
  if (r.endsWith('legacy-reset.css') || r.endsWith('index.css')) continue;
  const css = readFileSync(join(root, r), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)) legacyClasses.add(m[1]);
}

// 위치 start의 여는 괄호({ 또는 ()와 짝이 맞는 닫는 괄호까지의 내용을 돌려준다. 문자열 안의 괄호는 무시한다.
function balanced(source, start) {
  const open = source[start];
  const close = open === '{' ? '}' : ')';
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(source, i);
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close && --depth === 0) return source.slice(start + 1, i);
  }
  return source.slice(start + 1);
}
function skipString(source, start) {
  const quote = source[start];
  for (let i = start + 1; i < source.length; i += 1) {
    if (source[i] === '\\') i += 1;
    else if (quote === '`' && source[i] === '$' && source[i + 1] === '{') i += balanced(source, i + 1).length + 1;
    else if (source[i] === quote) return i;
  }
  return source.length;
}
// 식 안의 문자열 리터럴 내용 (템플릿 문자열의 ${...}는 빈칸으로 바꾼다)
function stringLiterals(expression) {
  const out = [];
  for (let i = 0; i < expression.length; i += 1) {
    const ch = expression[i];
    if (ch !== '"' && ch !== "'" && ch !== '`') continue;
    const end = skipString(expression, i);
    out.push(expression.slice(i + 1, end).replace(/\$\{[\s\S]*?\}/g, ' '));
    i = end;
  }
  return out;
}

// 클래스 토큰 추출: className 속성 값과 클래스 조합 함수(cn·clsx·cva·twMerge·tv) 인자 안의 모든 문자열
const CLASS_FUNCTIONS = /\b(?:cn|clsx|classNames|cva|twMerge|tv)\(/g;
function classTokens(source) {
  const texts = [];
  for (const m of source.matchAll(/className=/g)) {
    const at = m.index + m[0].length;
    const ch = source[at];
    if (ch === '"' || ch === "'") texts.push(source.slice(at + 1, skipString(source, at)));
    else if (ch === '{') texts.push(...stringLiterals(balanced(source, at)));
  }
  for (const m of source.matchAll(CLASS_FUNCTIONS)) {
    texts.push(...stringLiterals(balanced(source, m.index + m[0].length - 1)));
  }
  return texts.flatMap((text) => text.split(/\s+/).filter(Boolean));
}

// 상대 경로 import 대상 파일
function relativeImports(file, source) {
  const out = [];
  for (const m of source.matchAll(/(?:import|export)[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const base = join(file, '..', m[1]);
    const candidates = [base, `${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')];
    const target = candidates.find((c) => fileSet.has(c));
    if (target) out.push(target);
  }
  return out;
}

const sourceFiles = files.filter((f) => /\.(tsx|ts)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes(`${sep}testUtils${sep}`));
const fileSet = new Set(sourceFiles);
const RENEWAL_ROOT = /data-ui=(?:"renewal"|'renewal'|\{['"]renewal['"]\})/;
const kinds = new Map(); // 파일 → { legacy: 기존 클래스 목록, tailwind: Tailwind 파일 여부 }

for (const file of sourceFiles) {
  const r = rel(file);
  const source = readFileSync(file, 'utf8');

  // 2. 임의값
  for (const m of source.matchAll(ARBITRARY_VALUE)) {
    errors.push(`${r}: 임의값 클래스 "${m[1]}"는 쓸 수 없습니다. 필요한 값은 src/tailwind.css의 @theme 토큰으로 추가하세요.`);
  }

  // 3. 한 파일 한 방식
  const tokens = classTokens(source);
  const legacy = [...new Set(tokens.filter((t) => legacyClasses.has(t)))];
  const tailwind = [...new Set(tokens.filter((t) => !legacyClasses.has(t) && TAILWIND_TOKEN.test(t)))];
  const renewalRoot = RENEWAL_ROOT.test(source);
  if (legacy.length > 0 && tailwind.length > 0) {
    errors.push(`${r}: 기존 CSS 클래스(${legacy.slice(0, 3).join(', ')} 등)와 Tailwind 유틸리티(${tailwind.slice(0, 3).join(', ')} 등)를 함께 쓸 수 없습니다.`);
  } else if (renewalRoot && legacy.length > 0) {
    errors.push(`${r}: 리뉴얼 영역(data-ui="renewal") 파일에서 기존 CSS 클래스(${legacy.slice(0, 3).join(', ')} 등)를 쓸 수 없습니다.`);
  }
  kinds.set(file, { legacy, tailwind: tailwind.length > 0 || renewalRoot });
}

// 4. 리뉴얼(Tailwind) 파일이 기존 CSS를 쓰는 컴포넌트를 불러오면 오류
for (const [file, kind] of kinds) {
  if (!kind.tailwind) continue;
  for (const target of relativeImports(file, readFileSync(file, 'utf8'))) {
    const targetKind = kinds.get(target);
    if (targetKind && targetKind.legacy.length > 0) {
      errors.push(`${rel(file)}: 기존 CSS를 쓰는 ${rel(target)}를 불러올 수 없습니다. Tailwind로 새 컴포넌트를 만드세요.`);
    }
  }
}

// 5. 기존 CSS 변경 경고: 커밋하지 않은 변경 + main에서 갈라진 뒤 이 브랜치에서 커밋한 변경
try {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const changed = new Set(git('status', '--porcelain', '--', 'src/styles').split('\n').filter(Boolean));
  try {
    const base = git('merge-base', 'HEAD', 'main');
    for (const line of git('diff', '--name-status', base, 'HEAD', '--', 'src/styles').split('\n').filter(Boolean)) changed.add(line);
  } catch {
    // main 브랜치가 없으면 커밋하지 않은 변경만 본다.
  }
  if (changed.size > 0) warnings.push(`기존 CSS(src/styles)가 바뀌었습니다. 기존 CSS는 버그 수정과 리뉴얼 화면 삭제만 허용됩니다.\n${[...changed].join('\n')}`);
} catch {
  // git이 없는 환경에서는 건너뛴다.
}

for (const w of warnings) console.warn(`경고: ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`오류: ${e}`);
  console.error(`\n스타일 규칙 위반 ${errors.length}건 (CLAUDE.md, docs/renewal/스타일_전환_검토.md)`);
  process.exit(1);
}
console.log('스타일 규칙 검사 통과');
