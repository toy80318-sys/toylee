#!/usr/bin/env node
/*
 * 계약자 관리 — 태블릿용 단일 파일 만들기
 *   npm run build:new
 *
 * 공통 계산(shared) · 계약자 관리 화면(newcust) · 엑셀 저장(standalone) 을
 * HTML 파일 하나로 묶습니다. 서버 없이 그 파일만 열면 바로 돌아갑니다.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = function (p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); };

const OUT = process.argv[2] || path.join(ROOT, '계약자관리.html');

let html = read('newcust/index.html');

const styles = ['public/style.css', 'newcust/theme.css'];
const scripts = [
  'shared/calc.js',
  'newcust/schema.js',
  'newcust/products-gen.js',
  'newcust/products.js',
  'newcust/riders.js',
  'newcust/engine.js',
  'standalone/anthropic-sdk.js',
  'newcust/importer.js',
  'newcust/reader.js',
  'standalone/xlsx-lite.js',
  'newcust/app.js'
];

/* 스크립트 안에 </script> 가 들어 있으면 문서가 깨지므로 미리 확인한다 */
scripts.forEach(function (p) {
  if (/<\/script/i.test(read(p))) {
    throw new Error(p + ' 안에 </script> 문자열이 있어 단일 파일로 묶을 수 없습니다.');
  }
});

/* 붙일 내용을 함수로 넘깁니다.
 * 글자로 넘기면 그 안의 `$&` · `$1` 같은 조각을 replace 가 「찾은 자리」로 바꿔치기해
 * 코드가 망가집니다 (실제로 Anthropic SDK 의 정규식 안 `$&` 때문에 깨졌습니다).
 */
/* 1. 스타일 인라인 */
const linkTags = [
  '<link rel="stylesheet" href="/style.css">',
  '<link rel="stylesheet" href="/newcust/theme.css">'
].join('\n');
if (html.indexOf(linkTags) < 0) {
  throw new Error('newcust/index.html 의 스타일 부분을 찾지 못했습니다. 빌드 스크립트를 맞춰 주세요.');
}
html = html.replace(linkTags, function () { return styles.map(function (p) {
  return '<style>\n/* ===== ' + p + ' ===== */\n' + read(p) + '\n</style>';
}).join('\n'); });

/* 2. 스크립트 인라인 */
const scriptTags = scripts.map(function (p) {
  return '<script src="/' + p + '"></script>';
}).join('\n');
if (html.indexOf(scriptTags) < 0) {
  throw new Error('newcust/index.html 의 스크립트 부분을 찾지 못했습니다. 빌드 스크립트를 맞춰 주세요.');
}
html = html.replace(scriptTags, function () { return scripts.map(function (p) {
  return '<script>\n/* ===== ' + p + ' ===== */\n' + read(p) + '\n</script>';
}).join('\n'); });

fs.writeFileSync(OUT, html, 'utf8');
const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log('계약자 관리 단일 파일을 만들었습니다 : ' + OUT + '  (' + kb + ' KB)');
console.log('이 파일 하나만 태블릿에 넣어 브라우저로 열면 됩니다.');
