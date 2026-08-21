#!/usr/bin/env node
/*
 * 토끼 아이콘 만들기 — 「계약자 관리」용 (외부 라이브러리 없이 PNG 를 직접 그립니다)
 *
 *   node scripts/make-rabbit-icons.js            → docs/rabbit-192.png · 512 · 1024
 *   node scripts/make-rabbit-icons.js --base64   → 192px 을 base64 로 (화면 파일에 넣을 때)
 *
 * 바탕화면 바로가기에 쓰는 그림이라 작게 줄여도 귀·눈·입이 보이도록 그렸습니다.
 * 색은 프로그램과 같은 미색 바탕 + 민트입니다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CREAM = [255, 251, 242];   /* 바탕 미색 */
const MINT = [58, 168, 146];    /* 몸통 민트 */
const DEEP = [43, 132, 113];    /* 귀 · 그늘 */
const PALE = [227, 243, 238];   /* 귀 안쪽 · 주둥이 */
const TXT = [61, 74, 68];      /* 눈 · 코 · 입 */
const BLUSH = [246, 150, 160];   /* 볼터치 */
const CARROT = [232, 138, 74];    /* 당근 */
const LEAF = [122, 178, 96];    /* 당근 잎 */

const BASE = 192;

function draw(size) {
  const ss = size <= 256 ? 4 : 2;
  const w = size * ss;
  const k = w / BASE;
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

  /* 기울일 수 있는 타원 — 토끼 귀를 살짝 벌려 그리려고 각도를 받습니다 */
  const ellipse = function (cx, cy, rx, ry, col, a, deg) {
    cx *= k; cy *= k; rx *= k; ry *= k;
    const t = (deg || 0) * Math.PI / 180;
    const cos = Math.cos(t), sin = Math.sin(t);
    const R = Math.ceil(Math.max(rx, ry)) + 2;
    for (let y = Math.max(0, Math.floor(cy - R)); y < Math.min(w, cy + R); y++) {
      for (let x = Math.max(0, Math.floor(cx - R)); x < Math.min(w, cx + R); x++) {
        const dx = x - cx, dy = y - cy;
        const u = dx * cos + dy * sin, v = -dx * sin + dy * cos;
        if ((u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1) put(x, y, col, a);
      }
    }
  };
  const circle = function (cx, cy, r, col, a) { ellipse(cx, cy, r, r, col, a, 0); };

  const rrect = function (x0, y0, x1, y1, r, col) {
    for (let y = Math.floor(y0 * k); y < y1 * k; y++) {
      for (let x = Math.floor(x0 * k); x < x1 * k; x++) {
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
    for (let i = 0; i <= 240; i++) {
      circle(x0 + (x1 - x0) * i / 240, y0 + (y1 - y0) * i / 240, th / 2, col);
    }
  };

  /* ── 바탕 ── */
  rrect(0, 0, 192, 192, 36, PALE);

  /* ── 귀 (살짝 바깥으로 벌어지게) ── */
  ellipse(66, 48, 15, 34, DEEP, 1, -12);
  ellipse(126, 48, 15, 34, DEEP, 1, 12);
  ellipse(66, 50, 7.5, 24, [255, 235, 236], 1, -12);
  ellipse(126, 50, 7.5, 24, [255, 235, 236], 1, 12);

  /* ── 얼굴 ── */
  ellipse(96, 116, 56, 50, MINT);

  /* 볼터치 — 민트 위에서도 분홍으로 보이도록 진하게 */
  ellipse(56, 130, 13, 9, BLUSH, 0.85);
  ellipse(136, 130, 13, 9, BLUSH, 0.85);

  /* ── 눈 ── */
  circle(75, 108, 12, CREAM); circle(117, 108, 12, CREAM);
  circle(75, 109, 8.4, TXT); circle(117, 109, 8.4, TXT);
  circle(71.5, 105.5, 3.6, CREAM); circle(113.5, 105.5, 3.6, CREAM);
  circle(78, 113, 1.8, CREAM, 0.8); circle(120, 113, 1.8, CREAM, 0.8);

  /* ── 주둥이 · 코 · 입 ── */
  ellipse(96, 140, 25, 17, CREAM);
  ellipse(96, 131, 8, 6, TXT);
  line(96, 136, 96, 141, TXT, 2.6);
  arc(91, 141, 5.5, 0, 175, TXT, 2.6);
  arc(101, 141, 5.5, 5, 180, TXT, 2.6);

  /* 앞니 두 개 — 토끼답게 (테두리를 넣어야 주둥이 위에서도 보입니다) */
  rrect(90.5, 145.5, 101.5, 158.5, 3, TXT);
  rrect(92, 147, 95.4, 157, 1.6, CREAM);
  rrect(96.6, 147, 100, 157, 1.6, CREAM);

  /* ── 수염 ── */
  [[-1, 0], [1, 0]].forEach(function (s) {
    const d = s[0];
    line(96 + d * 26, 135, 96 + d * 46, 130, CREAM, 2.2);
    line(96 + d * 26, 140, 96 + d * 48, 140, CREAM, 2.2);
    line(96 + d * 26, 145, 96 + d * 46, 150, CREAM, 2.2);
  });

  /* ── 당근 (오른쪽 아래 구석에 살짝) ── */
  ellipse(158, 163, 9, 15, CARROT, 1, 32);
  ellipse(167, 150, 4, 7, LEAF, 1, 30);
  ellipse(160, 147, 3.6, 6.5, LEAF, 1, -8);

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
  [192, 512, 1024].forEach(function (n) {
    const f = path.join(out, 'rabbit-' + n + '.png');
    fs.writeFileSync(f, draw(n));
    console.log('토끼 아이콘을 만들었습니다 : ' + f);
  });
}
