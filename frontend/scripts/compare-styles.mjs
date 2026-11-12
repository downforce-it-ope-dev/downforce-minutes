#!/usr/bin/env node
// 화면 계산 스타일 비교 (R9 #41에서 기존 화면용 도구를 모든 화면용으로 바꿨다)
//
// 진입 CSS(src/tailwind.css)·공통 부품처럼 여러 화면에 걸친 것을 바꿀 때 모든 화면이 그대로인지 확인한다.
// 1. 바꾸기 전 상태에서 수집:
//      STYLE_OUT=node_modules/.cache/styles/before.json npx playwright test e2e/style-snapshot.spec.ts
// 2. 바꾼 뒤 수집:
//      STYLE_OUT=node_modules/.cache/styles/after.json npx playwright test e2e/style-snapshot.spec.ts
// 3. 비교:
//      node scripts/compare-styles.mjs node_modules/.cache/styles/before.json node_modules/.cache/styles/after.json
//
// 화면 11개 × 크기 4개(390×844·820×1180·1180×820·844×390)의 모든 요소(::before·::after 포함) 계산 스타일을 비교한다.
import { readFileSync } from 'node:fs';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  console.error('사용법: node scripts/compare-styles.mjs <before.json> <after.json>');
  process.exit(2);
}
const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));

const differences = [];
let elementCount = 0;
for (const state of new Set([...Object.keys(before), ...Object.keys(after)])) {
  const a = before[state];
  const b = after[state];
  if (!a || !b) {
    differences.push(`${state}: 한쪽에만 있는 상태`);
    continue;
  }
  for (const path of new Set([...Object.keys(a), ...Object.keys(b)])) {
    elementCount += 1;
    if (!a[path] || !b[path]) {
      differences.push(`${state} ${path}: 한쪽에만 있는 요소`);
      continue;
    }
    for (const property of new Set([...Object.keys(a[path]), ...Object.keys(b[path])])) {
      if (a[path][property] !== b[path][property]) {
        differences.push(`${state} ${path} ${property}: ${a[path][property]} → ${b[path][property]}`);
      }
    }
  }
}

console.log(`상태 ${Object.keys(before).length}개, 요소 ${elementCount}개 비교`);
if (differences.length > 0) {
  for (const line of differences.slice(0, 50)) console.error(line);
  console.error(`\n차이 ${differences.length}건${differences.length > 50 ? ' (앞 50건만 표시)' : ''}`);
  process.exit(1);
}
console.log('차이 없음');
