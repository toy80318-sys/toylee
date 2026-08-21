#!/usr/bin/env node
/*
 * 곰돌이 아이콘 만들기 (외부 라이브러리 없이 PNG 를 직접 그립니다)
 *   node scripts/make-icons.js          → docs/icon-192.png · docs/icon-512.png
 *   node scripts/make-icons.js --base64 → 192px 아이콘을 base64 로 출력 (화면 파일에 넣을 때)
 *
 * 바탕화면 바로가기 · 브라우저 탭에 쓰는 그림이라 작게 줄여도 눈·입이 보이도록 그렸습니다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CREAM = [255, 251, 242];
const ROSE = [216, 91, 126];
const DEEP = [184, 92, 120];
const LIGHT = [251, 226, 231];
const TXT = [61, 79, 72];
const BLUSH = [240, 155, 178];

/* 192 기준으로 그린 뒤 원하는 크기로 키웁니다 */
const BASE = 192;

function draw(size) {
  const ss = size <= 256 ? 4 : 2;          /* 계단현상을 없애려고 크게 그린 뒤 줄입니다 */
  const w = size * ss;
  const k = (size * ss) / BASE;            /* 192 좌표 → 실제 화소 */
  const buf = new Uint8Array(w * w * 3);
  for (let i = 0; i < buf.length; i += 3) {
    buf[i] = CREAM[0]; buf[i + 1] = CREAM[1]; buf[i + 2] = CREAM[2];
  }

  const put = function (x, y, col, a) {
    if (x < 0 || y < 0 || x >= w || y >= w) return;
    const i = (y * w + x) * 3;
    if (a === undefined || a >= 1) {
      buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2];
    } else {
      for (let c = 0; c < 3; c++) buf[i + c] = Math.round(buf[i + c] * (1 - a) + col[c] * a);
    }
  };

  const ellipse = function (cx, cy, rx, ry, col, a) {
    cx *= k; cy *= k; rx *= k; ry *= k;
    for (let y = Math.max(0, Math.floor(cy - ry) - 1); y < Math.min(w, cy + ry + 2); y++) {
      const t = 1 - Math.pow((y - cy) / ry, 2);
      if (t < 0) continue;
      const dx = rx * Math.sqrt(t);
      for (let x = Math.max(0, Math.floor(cx - dx)); x <= Math.min(w - 1, cx + dx); x++) put(x, y, col, a);
    }
  };
  const circle = function (cx, cy, r, col, a) { ellipse(cx, cy, r, r, col, a); };

  const rrect = function (x0, y0, x1, y1, r, col) {
    for (let y = y0 * k; y < y1 * k; y++) {
      for (let x = x0 * k; x < x1 * k; x++) {
        const fx = x / k, fy = y / k;
        const cx = Math.min(Math.max(fx, x0 + r), x1 - r);
        const cy = Math.min(Math.max(fy, y0 + r), y1 - r);
        if (Math.pow(fx - cx, 2) + Math.pow(fy - cy, 2) <= r * r) put(x, y, col);
      }
    }
  };

  const arc = function (cx, cy, r, a0, a1, col, th) {
    for (let i = 0; i <= 360; i++) {
      const a = (a0 + (a1 - a0) * i / 360) * Math.PI / 180;
      circle(cx + r * Math.cos(a), cy + r * Math.sin(a), th / 2, col);
    }
  };
  const line = function (x0, y0, x1, y1, col, th) {
    for (let i = 0; i <= 200; i++) {
      circle(x0 + (x1 - x0) * i / 200, y0 + (y1 - y0) * i / 200, th / 2, col);
    }
  };

  rrect(0, 0, 192, 192, 36, LIGHT);                                  /* 연분홍 둥근 바탕 */
  circle(58, 63, 26, DEEP); circle(134, 63, 26, DEEP);               /* 귀 */
  circle(58, 63, 14, LIGHT); circle(134, 63, 14, LIGHT);
  circle(96, 110, 54, ROSE);                                         /* 얼굴 */
  circle(54, 127, 12, BLUSH, 0.5); circle(138, 127, 12, BLUSH, 0.5); /* 볼터치 */
  circle(75, 101, 11.5, CREAM); circle(117, 101, 11.5, CREAM);       /* 눈 흰자 */
  circle(75, 102, 8, TXT); circle(117, 102, 8, TXT);                 /* 눈동자 */
  circle(72, 99, 3.3, CREAM); circle(114, 99, 3.3, CREAM);           /* 반짝임 */
  ellipse(96, 133, 24, 18, CREAM);                                   /* 주둥이 */
  ellipse(96, 124, 8, 6, TXT);                                       /* 코 */
  line(96, 129, 96, 134, TXT, 2.6);
  arc(91, 134, 5.5, 0, 175, TXT, 2.6);                               /* 웃는 입 */
  arc(101, 134, 5.5, 5, 180, TXT, 2.6);

  /* 크게 그린 그림을 실제 크기로 줄이면서 평균을 냅니다 */
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < ss; dy++) {
        for (let dx = 0; dx < ss; dx++) {
          const i = ((y * ss + dy) * w + (x * ss + dx)) * 3;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2];
        }
      }
      const n = ss * ss;
      raw[p++] = Math.round(r / n); raw[p++] = Math.round(g / n); raw[p++] = Math.round(b / n);
    }
  }
  return png(size, raw);
}

function png(size, raw) {
  const chunk = function (type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) : crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* 예전 Node 에는 zlib.crc32 가 없어 직접 계산합니다 */
let TABLE = null;
function crc32(buf) {
  if (!TABLE) {
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

if (process.argv.indexOf('--base64') >= 0) {
  process.stdout.write(draw(192).toString('base64'));
} else {
  const out = path.join(__dirname, '..', 'docs');
  fs.mkdirSync(out, { recursive: true });
  [192, 512].forEach(function (n) {
    const f = path.join(out, 'icon-' + n + '.png');
    fs.writeFileSync(f, draw(n));
    console.log('아이콘을 만들었습니다 : ' + f);
  });
}
