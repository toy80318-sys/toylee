#!/usr/bin/env node
/*
 * 태블릿용 단일 파일 만들기
 *   npm run build:tablet
 *
 * 웹 화면(public) · 항목 정의(shared) · 태블릿용 저장 계층(standalone) 을
 * HTML 파일 하나로 묶습니다. 서버 없이 그 파일만 열면 바로 돌아갑니다.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = function (p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); };

const OUT = process.argv[2] || path.join(ROOT, '평생든든_태블릿용.html');

let html = read('public/index.html');
const css = read('public/style.css');

const scripts = [
  'shared/calc.js',
  'shared/schema.js',
  'shared/analysis.js',
  'standalone/xlsx-lite.js',
  'standalone/local-api.js',
  'public/app.js'
];

/* 스크립트 안에 </script> 가 들어 있으면 문서가 깨지므로 미리 확인한다 */
scripts.forEach(function (p) {
  if (/<\/script/i.test(read(p))) {
    throw new Error(p + ' 안에 </script> 문자열이 있어 단일 파일로 묶을 수 없습니다.');
  }
});

/* 1. 스타일 인라인 */
html = html.replace('<link rel="stylesheet" href="/style.css">',
  '<style>\n' + css + '\n</style>');

/* 2. 스크립트 인라인 */
const scriptTags = [
  '<script src="/shared/calc.js"></script>',
  '<script src="/shared/schema.js"></script>',
  '<script src="/shared/analysis.js"></script>',
  '<script src="/app.js"></script>'
].join('\n');
if (html.indexOf(scriptTags) < 0) {
  throw new Error('public/index.html 의 스크립트 부분을 찾지 못했습니다. 빌드 스크립트를 맞춰 주세요.');
}
html = html.replace(scriptTags, scripts.map(function (p) {
  return '<script>\n/* ===== ' + p + ' ===== */\n' + read(p) + '\n</script>';
}).join('\n'));

/* 3. 태블릿용 문구로 손질 */
html = html
  .replace('<b>서버에 고객별 누적 저장</b>까지 한 번에 처리합니다.',
    '<b>이 기기에 고객별 누적 저장</b>까지 한 번에 처리합니다. (태블릿용 · 인터넷 연결 없이도 동작)')
  .replace('입력하시는 내용은 <b>이 컴퓨터에 자동으로 임시 보관</b>되고, [저장]을 누르면 <b>서버 DB</b>에 기록됩니다.',
    '입력하시는 내용은 <b>자동으로 임시 보관</b>되고, [저장]을 누르면 이 기기에 기록됩니다. 주 1회 ④ 탭에서 <b>백업 파일</b>을 남겨 주세요.')
  .replace('💾 이 계약 저장 (서버 DB에 누적)', '💾 이 계약 저장')
  .replace('<p class="sub">저장한 계약이 고객별로 서버에 쌓입니다. 어느 PC에서 접속하셔도 같은 자료를 보실 수 있습니다.</p>',
    '<p class="sub">저장한 계약이 고객별로 이 기기에 쌓입니다.</p>')
  .replace('<p class="sub">서버에 저장된 전체 계약을 기준으로 집계합니다.</p>',
    '<p class="sub">저장된 전체 계약을 기준으로 집계합니다.</p>')
  .replace('서버 저장', '이 기기에 저장');

fs.writeFileSync(OUT, html, 'utf8');
const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log('태블릿용 단일 파일을 만들었습니다 : ' + OUT + '  (' + kb + ' KB)');
console.log('이 파일 하나만 태블릿에 넣어 브라우저로 열면 됩니다.');
