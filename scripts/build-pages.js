#!/usr/bin/env node
/*
 * 인터넷 주소(웹)용 파일 만들기
 *   npm run build:web
 *
 * 태블릿용 단일 파일을 그대로 가져와, 홈 화면에 '앱처럼' 설치되고
 * 인터넷이 끊겨도 열리도록 필요한 것들을 붙여 docs/ 에 넣습니다.
 *   docs/index.html            화면 (단일 파일)
 *   docs/manifest.webmanifest  앱 이름 · 아이콘 · 색
 *   docs/sw.js                 오프라인 보관 (서비스워커)
 *   docs/icon-192.png · icon-512.png
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const SRC = path.join(ROOT, '평생든든_태블릿용.html');

if (!fs.existsSync(SRC)) {
  console.error('먼저 npm run build:tablet 을 실행해 주세요.');
  process.exit(1);
}

fs.mkdirSync(DOCS, { recursive: true });
execFileSync(process.execPath, [path.join(__dirname, 'make-icons.js')], { stdio: 'inherit' });

let html = fs.readFileSync(SRC, 'utf8');

/* 앱 정보와 오프라인 처리를 붙인다 (태블릿용 파일 자체는 건드리지 않는다) */
const head = '<meta name="color-scheme" content="light">';
if (html.indexOf(head) < 0) throw new Error('화면 파일에서 head 부분을 찾지 못했습니다.');

html = html.replace(head, head + '\n<link rel="manifest" href="manifest.webmanifest">');

const boot = [
  '<script>',
  '/* 인터넷이 끊겨도 열리도록 화면을 기기에 보관해 둡니다 (https 로 열었을 때만) */',
  'if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {',
  '  window.addEventListener("load", function () {',
  '    navigator.serviceWorker.register("sw.js").catch(function () { /* 안 되면 그냥 넘어갑니다 */ });',
  '  });',
  '}',
  '</script>'
].join('\n');
html = html.replace('</body>', boot + '\n</body>');

fs.writeFileSync(path.join(DOCS, 'index.html'), html);

const ver = crypto.createHash('sha1').update(html).digest('hex').slice(0, 8);

const manifest = {
  name: '평생든든 방문활동 사전준비',
  short_name: '평생든든',
  description: '교보생명 평생든든서비스 방문활동 고객 정보파악 프로그램',
  lang: 'ko',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'any',
  background_color: '#fffbf2',
  theme_color: '#fffbf2',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
};
fs.writeFileSync(path.join(DOCS, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

const sw = `/*
 * 오프라인 보관 — 한 번 열어 두면 인터넷이 끊겨도 그대로 열립니다.
 * 새 판이 올라오면 조용히 받아 두었다가 다음에 열 때 반영합니다.
 */
const CACHE = 'kyobo-${ver}';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(function (hit) {
    const net = fetch(e.request).then(function (res) {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () { return hit; });
    return hit || net;
  }));
});
`;
fs.writeFileSync(path.join(DOCS, 'sw.js'), sw);
fs.writeFileSync(path.join(DOCS, '.nojekyll'), '');

const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log('웹용 파일을 만들었습니다 : docs/  (화면 ' + kb + ' KB · 판번호 ' + ver + ')');
