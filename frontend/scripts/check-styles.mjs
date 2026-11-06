#!/usr/bin/env node
// 스타일 규칙 검사 (docs/renewal/스타일_전환_검토.md S-06, CLAUDE.md)
// 1. 새 CSS 파일 금지: src/tailwind.css와 기존 CSS(src/styles, 목록 고정) 외의 CSS 파일은 오류
// 2. 임의값 클래스 금지: text-[13px], bg-[#0b2d5b] 같은 Tailwind 임의값은 오류
// 3. 한 파일 한 방식: 기존 CSS 클래스와 Tailwind 유틸리티를 한 파일에서 함께 쓰면 오류
// 4. 기존 CSS 변경 경고: src/styles에 커밋되지 않은 변경이 있으면 경고 (버그 수정만 허용)
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
  'src/styles/pages/new-meeting.css',
  'src/styles/pages/participants.css',
  'src/styles/pages/processing.css',
  'src/styles/pages/recording.css',
  'src/styles/pages/recovery.css',
  'src/styles/pages/review.css',
  'src/styles/pages/settings.css',
  'src/styles/pages/setup.css',
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

// className 문자열에서 클래스 토큰 추출
function classTokens(source) {
  const tokens = [];
  const patterns = [/className="([^"]*)"/g, /className=\{'([^']*)'\}/g, /className=\{`([^`]*)`\}/g, /className=\{[^}]*?'([^']*)'/g];
  for (const pattern of patterns) {
    for (const m of source.matchAll(pattern)) {
      const text = m[1].replace(/\$\{[^}]*\}/g, ' ');
      tokens.push(...text.split(/\s+/).filter(Boolean));
    }
  }
  return tokens;
}

for (const file of files.filter((f) => /\.(tsx|ts)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes(`${sep}testUtils${sep}`))) {
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
  if (legacy.length > 0 && tailwind.length > 0) {
    errors.push(`${r}: 기존 CSS 클래스(${legacy.slice(0, 3).join(', ')} 등)와 Tailwind 유틸리티(${tailwind.slice(0, 3).join(', ')} 등)를 함께 쓸 수 없습니다.`);
  }
}

// 4. 기존 CSS 변경 경고
try {
  const changed = execFileSync('git', ['status', '--porcelain', '--', 'src/styles'], { cwd: root, encoding: 'utf8' }).trim();
  if (changed) warnings.push(`기존 CSS(src/styles)에 커밋되지 않은 변경이 있습니다. 기존 CSS는 버그 수정만 허용됩니다.\n${changed}`);
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
