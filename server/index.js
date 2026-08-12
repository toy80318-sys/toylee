/*
 * 평생든든 고객 정보파악 프로그램 — 서버
 * 웹 화면(public) + REST API + 엑셀 서식 입출력
 */
'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');

const Schema = require('../shared/schema.js');
const Calc = require('../shared/calc.js');
const Analysis = require('../shared/analysis.js');
const store = require('./db.js');
const excel = require('./excel.js');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json({ limit: '5mb' }));
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));
app.use(express.static(path.join(__dirname, '..', 'public')));

/*
 * 파일 첨부 — 한글 이름(filename*)을 기본으로 보내되,
 * 한글 이름을 못 다루는 브라우저를 위해 뜻이 통하는 영문 이름을 함께 보냅니다.
 * (영문 대체 이름에도 확장자가 들어 있어야 엑셀이 열립니다)
 */
function attach(res, filename, ascii, type) {
  res.setHeader('Content-Type', type);
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="' + ascii + "\"; filename*=UTF-8''" + encodeURIComponent(filename)
  );
}

function stamp() {
  const d = new Date();
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
}

const wrap = function (fn) {
  return function (req, res, next) { Promise.resolve(fn(req, res, next)).catch(next); };
};

/* ---------- 항목 정의 ---------- */
app.get('/api/schema', function (req, res) {
  res.json({
    sections: Schema.SECTIONS,
    preps: Schema.PREPS,
    extras: Schema.EXTRAS,
    claimFields: Schema.CLAIM_FIELDS,
    customerFields: Schema.CUSTOMER_FIELDS
  });
});

/* ---------- 고객 ---------- */
app.get('/api/customers', function (req, res) {
  res.json(store.listCustomers(req.query.q));
});

app.get('/api/customers/:id', function (req, res) {
  const c = store.getCustomer(Number(req.params.id));
  if (!c) return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
  res.json({ customer: c, contracts: store.listContracts({ customerId: c.id }) });
});

app.patch('/api/customers/:id', function (req, res) {
  const c = store.updateCustomer(Number(req.params.id), req.body || {});
  if (!c) return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
  res.json(c);
});

app.delete('/api/customers/:id', function (req, res) {
  const n = store.deleteCustomer(Number(req.params.id));
  res.json({ deleted: n });
});

/* ---------- 계약 ---------- */
app.get('/api/contracts', function (req, res) {
  res.json(store.listContracts({
    q: req.query.q,
    customerId: req.query.customerId ? Number(req.query.customerId) : 0
  }));
});

app.get('/api/contracts/:id', function (req, res) {
  const rec = store.getContract(Number(req.params.id));
  if (!rec) return res.status(404).json({ error: '계약을 찾을 수 없습니다.' });
  res.json(rec);
});

app.post('/api/contracts', function (req, res) {
  const rec = req.body || {};
  const out = store.saveContract(rec);
  res.json({
    id: out.id,
    customerId: out.customerId,
    record: store.getContract(out.id),
    analysis: out.analysis
  });
});

app.delete('/api/contracts/:id', function (req, res) {
  res.json({ deleted: store.deleteContract(Number(req.params.id)) });
});

/* ---------- 분석 (저장하지 않고 판정만) ---------- */
app.post('/api/analyze', function (req, res) {
  const rec = req.body || {};
  const result = Analysis.analyze(rec);
  res.json({ analysis: result, script: Analysis.buildScript(rec, result) });
});

/* ---------- 통계 ---------- */
app.get('/api/stats', function (req, res) {
  res.json(store.stats());
});

/* ---------- 백업 · 복원 ---------- */
app.get('/api/backup', function (req, res) {
  const records = store.listContracts({});
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="Kyobo-Backup-' + stamp() + ".json\"; filename*=UTF-8''" +
    encodeURIComponent('평생든든_고객DB_백업_' + stamp() + '.json')
  );
  res.send(JSON.stringify({ ver: 2, exportedAt: new Date().toISOString(), records: records }, null, 2));
});

app.post('/api/restore', function (req, res) {
  const body = req.body || {};
  const recs = body.records || body;
  if (!Array.isArray(recs)) return res.status(400).json({ error: '백업 파일 형식이 아닙니다.' });
  let added = 0, failed = 0;
  recs.forEach(function (r) {
    try {
      if (!r || !r.f || !String(r.f.h_cust || '').trim()) { failed++; return; }
      store.saveContract({ f: r.f, claims: r.claims || [], chk: r.chk || {} });
      added++;
    } catch (e) { failed++; }
  });
  res.json({ added: added, failed: failed, total: store.stats().total });
});

app.post('/api/wipe', function (req, res) {
  store.wipeAll();
  res.json({ ok: true });
});

/* ---------- 엑셀 ---------- */
app.get('/api/excel/template', wrap(async function (req, res) {
  const wb = excel.buildWorkbook(null, { withResult: false });
  attach(res, '평생든든_고객정보파악_서식.xlsx', 'Kyobo-Form-Blank.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await wb.xlsx.write(res);
  res.end();
}));

app.get('/api/excel/contract/:id', wrap(async function (req, res) {
  const rec = store.getContract(Number(req.params.id));
  if (!rec) return res.status(404).json({ error: '계약을 찾을 수 없습니다.' });
  const wb = excel.buildWorkbook(rec, { withResult: true });
  const name = (rec.f.h_cust || '고객') + '_' + (rec.f.i_prod || '계약') + '_평생든든.xlsx';
  attach(res, name.replace(/[\\/:*?"<>|]/g, '_'), 'Kyobo-Contract-' + rec.id + '-' + stamp() + '.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await wb.xlsx.write(res);
  res.end();
}));

app.get('/api/excel/ledger', wrap(async function (req, res) {
  const wb = excel.buildLedger(store.listContracts({}), store.stats());
  attach(res, '평생든든_고객누적관리대장_' + stamp() + '.xlsx', 'Kyobo-Ledger-' + stamp() + '.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await wb.xlsx.write(res);
  res.end();
}));

app.post('/api/excel/import', upload.single('file'), wrap(async function (req, res) {
  if (!req.file) return res.status(400).json({ error: '엑셀 파일을 선택해 주세요.' });
  const rec = await excel.parseWorkbook(req.file.buffer);
  if (!String(rec.f.h_cust || '').trim()) {
    return res.status(400).json({ error: '서식의 [고객(계약자) 성명] 칸이 비어 있습니다.' });
  }
  const save = req.query.save !== '0';
  if (!save) {
    const result = Analysis.analyze(rec);
    return res.json({ saved: false, record: rec, analysis: result });
  }
  const out = store.saveContract(rec);
  res.json({ saved: true, id: out.id, record: store.getContract(out.id), analysis: out.analysis });
}));

/* ---------- CSV (엑셀에서 바로 열기) ---------- */
app.get('/api/csv', function (req, res) {
  const records = store.listContracts({});
  const FIELD_MAP = Schema.fieldMap();
  const esc = function (v) {
    let t = String(v == null ? '' : v);
    return '"' + t.replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
  };
  let csv = '﻿' + Schema.LEDGER_COLS.map(function (c) { return c.label; }).join(',') + '\n';
  records.forEach(function (rec) {
    csv += Schema.LEDGER_COLS.map(function (c) {
      if (c.k === '_savedAt') return esc(String(rec.savedAt || '').slice(0, 19).replace('T', ' '));
      if (c.k === '_money') return rec.money || 0;
      if (c.k === '_hidCnt') return rec.hidCnt || 0;
      const fd = FIELD_MAP[c.k];
      const v = rec.f[c.k];
      if (fd && fd.type === 'number' && v) return Calc.numOf(v);
      return esc(v);
    }).join(',') + '\n';
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="Kyobo-Ledger-' + stamp() + ".csv\"; filename*=UTF-8''" +
    encodeURIComponent('평생든든_고객누적_' + stamp() + '.csv')
  );
  res.send(csv);
});

/* ---------- 오류 처리 ---------- */
app.use(function (err, req, res, next) {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || '처리 중 문제가 생겼습니다.' });
});

/*
 * 화면(index.html)이 항목 정의를 모두 담고 있는지 확인한다.
 * shared/schema.js 에 항목을 추가하고 화면에 칸을 안 만든 경우를 바로 알려준다.
 */
function checkForm() {
  try {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const missing = Schema.allFields()
      .map(function (f) { return f.k; })
      .filter(function (k) { return html.indexOf('id="' + k + '"') < 0; });
    if (missing.length) {
      console.warn('[확인] 화면에 입력칸이 없는 항목 : ' + missing.join(', '));
    }
  } catch (e) { /* 화면 파일이 없으면 넘어간다 */ }
}

if (require.main === module) {
  checkForm();
  app.listen(PORT, function () {
    console.log('평생든든 고객 정보파악 프로그램');
    console.log('  주소 : http://localhost:' + PORT);
    console.log('  DB   : ' + store.DB_PATH);
  });
}

module.exports = app;
