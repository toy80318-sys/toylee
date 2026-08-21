/*
 * 서버 DB (SQLite)
 * - 고객(customers) : 사람 단위. 같은 고객을 여러 번 방문해도 한 번만 관리합니다.
 * - 방문기록(contracts) : 분석 단위(양식 한 장). 항목 컬럼은 shared/schema.js 에서 자동으로 만들어집니다.
 * - 여러 줄 표(가입건수 · 사고보험금 · 상담내용 …)는 rows 칸에 JSON 으로 함께 담습니다.
 *
 * shared/schema.js 에 항목을 추가하면 서버가 뜰 때 컬럼이 자동으로 추가됩니다(기존 자료 유지).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const Schema = require('../shared/schema.js');
const Calc = require('../shared/calc.js');
const Analysis = require('../shared/analysis.js');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'kyobo.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ---------- 스키마 생성 · 자동 이관 ---------- */

const CONTRACT_KEYS = Schema.contractFields().map(function (f) { return f.k; });

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      fp         TEXT DEFAULT '',
      phone      TEXT DEFAULT '',
      birth      TEXT DEFAULT '',
      memo       TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(name, birth)
    );
    CREATE TABLE IF NOT EXISTS contracts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      checks      TEXT DEFAULT '{}',
      rows        TEXT DEFAULT '{}',
      money       INTEGER DEFAULT 0,
      hid_cnt     INTEGER DEFAULT 0,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS claims (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      seq         INTEGER NOT NULL DEFAULT 0,
      d           TEXT DEFAULT '',
      t           TEXT DEFAULT '',
      a           TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_contracts_customer ON contracts(customer_id);
    CREATE INDEX IF NOT EXISTS idx_claims_contract ON claims(contract_id);
  `);

  /* 항목 컬럼을 스키마에 맞춰 채워 넣는다 */
  const have = new Set(db.prepare('PRAGMA table_info(contracts)').all().map(function (c) { return c.name; }));
  if (!have.has('rows')) db.exec('ALTER TABLE contracts ADD COLUMN "rows" TEXT DEFAULT \'{}\'');
  CONTRACT_KEYS.forEach(function (k) {
    if (!have.has(k)) db.exec('ALTER TABLE contracts ADD COLUMN "' + k + '" TEXT DEFAULT \'\'');
  });
}
init();

const now = function () { return new Date().toISOString(); };

/* ---------- 고객 ---------- */

function upsertCustomer(name, fp, birth) {
  name = String(name || '').trim();
  birth = Calc.normDate(birth || '') || '';
  if (!name) throw new Error('고객명이 필요합니다.');
  const found = db.prepare('SELECT * FROM customers WHERE name = ? AND birth = ?').get(name, birth);
  if (found) {
    if (fp && fp !== found.fp) {
      db.prepare('UPDATE customers SET fp = ?, updated_at = ? WHERE id = ?').run(fp, now(), found.id);
    }
    return found.id;
  }
  const t = now();
  const r = db.prepare(
    'INSERT INTO customers (name, fp, birth, created_at, updated_at) VALUES (?,?,?,?,?)'
  ).run(name, fp || '', birth, t, t);
  return r.lastInsertRowid;
}

function listCustomers(q) {
  const like = '%' + String(q || '').trim() + '%';
  return db.prepare(`
    SELECT c.*,
           (SELECT COUNT(*) FROM contracts k WHERE k.customer_id = c.id)               AS contract_cnt,
           (SELECT COALESCE(SUM(k.money),0) FROM contracts k WHERE k.customer_id = c.id) AS money_sum,
           (SELECT MAX(k.updated_at) FROM contracts k WHERE k.customer_id = c.id)      AS last_saved
    FROM customers c
    WHERE (? = '%%' OR c.name LIKE ? OR c.phone LIKE ?)
    ORDER BY COALESCE(last_saved, c.updated_at) DESC
  `).all(like, like, like);
}

function getCustomer(id) {
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(id) || null;
}

function updateCustomer(id, patch) {
  const cur = getCustomer(id);
  if (!cur) return null;
  const cols = ['name', 'fp', 'phone', 'birth', 'memo'];
  const set = [], vals = [];
  cols.forEach(function (c) {
    if (Object.prototype.hasOwnProperty.call(patch, c)) {
      set.push('"' + c + '" = ?');
      vals.push(c === 'birth' ? (Calc.normDate(patch[c]) || '') : String(patch[c] == null ? '' : patch[c]));
    }
  });
  if (!set.length) return cur;
  set.push('updated_at = ?'); vals.push(now(), id);
  db.prepare('UPDATE customers SET ' + set.join(', ') + ' WHERE id = ?').run(...vals);
  return getCustomer(id);
}

function deleteCustomer(id) {
  return db.prepare('DELETE FROM customers WHERE id = ?').run(id).changes;
}

/* ---------- 계약 ---------- */

function rowToRecord(row) {
  if (!row) return null;
  const f = {};
  CONTRACT_KEYS.forEach(function (k) { f[k] = row[k] == null ? '' : String(row[k]); });
  f.h_cust = row.cust_name || '';
  let chk = {};
  try { chk = JSON.parse(row.checks || '{}'); } catch (e) { chk = {}; }
  let rows = {};
  try { rows = JSON.parse(row.rows || '{}') || {}; } catch (e) { rows = {}; }
  /* 예전 서식으로 저장된 자료(사고보험금 별도 표)도 그대로 읽어 옵니다 */
  if (!rows.claims || !rows.claims.length) {
    try {
      const legacy = db.prepare('SELECT d, t, a FROM claims WHERE contract_id = ? ORDER BY seq, id').all(row.id);
      if (legacy.length) rows.claims = legacy;
    } catch (e) { /* 표가 없으면 무시 */ }
  }
  return {
    id: row.id,
    customerId: row.customer_id,
    f: f,
    chk: chk,
    rows: rows,
    money: row.money || 0,
    hidCnt: row.hid_cnt || 0,
    savedAt: row.updated_at,
    createdAt: row.created_at
  };
}

const CONTRACT_SELECT = `
  SELECT k.*, c.name AS cust_name
  FROM contracts k JOIN customers c ON c.id = k.customer_id
`;

function getContract(id) {
  return rowToRecord(db.prepare(CONTRACT_SELECT + ' WHERE k.id = ?').get(id));
}

function listContracts(opts) {
  opts = opts || {};
  const like = '%' + String(opts.q || '').trim() + '%';
  const rows = db.prepare(CONTRACT_SELECT + `
    WHERE (? = '%%' OR c.name LIKE ? OR k.rows LIKE ?)
      AND (? = 0 OR k.customer_id = ?)
    ORDER BY k.updated_at DESC
  `).all(like, like, like, opts.customerId ? 1 : 0, opts.customerId || 0);
  return rows.map(rowToRecord);
}

/* 값 정리 : 날짜는 표준형으로, 나머지는 문자열로 */
function cleanValue(field, v) {
  const s = v == null ? '' : String(v).trim();
  if (!s) return '';
  if (field && field.type === 'date') return Calc.normDate(s) || s;
  if (field && field.type === 'number') return String(Calc.numOf(s));
  return s;
}

const FIELD_MAP = Schema.fieldMap();

const RSMAP = Schema.rowsetMap();

/* 여러 줄 표 : 빈 줄을 버리고 날짜·금액을 표준형으로 맞춥니다 */
function cleanRows(rowsIn) {
  const src = rowsIn || {};
  const out = {};
  Schema.ROWSETS.forEach(function (set) {
    out[set.key] = Schema.pruneRows(set, src[set.key]).map(function (row) {
      const o = {};
      set.cols.forEach(function (c) { o[c.k] = cleanValue(c, row[c.k]); });
      return o;
    });
  });
  return out;
}

const saveContract = db.transaction(function (record) {
  const f = (record && record.f) || {};
  const name = String(f.h_cust || '').trim();
  if (!name) throw new Error('고객(계약자) 성명을 입력해 주세요.');

  /* 계약자 생년월일을 고객 식별에 함께 쓴다 (동명이인 구분) */
  const birth = f.c_obirth || '';
  const customerId = upsertCustomer(name, f.h_fp, birth);

  const rows = cleanRows(record.rows);
  const res = Analysis.analyze({ f: f, rows: rows });
  const t = now();

  const cols = [], vals = [];
  CONTRACT_KEYS.forEach(function (k) {
    cols.push(k);
    vals.push(cleanValue(FIELD_MAP[k], f[k]));
  });

  let id = record.id ? Number(record.id) : 0;
  if (id && db.prepare('SELECT 1 FROM contracts WHERE id = ?').get(id)) {
    const sets = cols.map(function (c) { return '"' + c + '" = ?'; });
    sets.push('customer_id = ?', 'checks = ?', 'rows = ?', 'money = ?', 'hid_cnt = ?', 'updated_at = ?');
    const args = vals.concat([
      customerId, JSON.stringify(record.chk || {}), JSON.stringify(rows), res.money, res.hidCnt, t, id
    ]);
    db.prepare('UPDATE contracts SET ' + sets.join(', ') + ' WHERE id = ?').run(...args);
  } else {
    const allCols = ['customer_id', 'checks', 'rows', 'money', 'hid_cnt', 'created_at', 'updated_at'].concat(cols);
    const allVals = [customerId, JSON.stringify(record.chk || {}), JSON.stringify(rows), res.money, res.hidCnt, t, t].concat(vals);
    const ph = allCols.map(function () { return '?'; }).join(',');
    const r = db.prepare(
      'INSERT INTO contracts (' + allCols.map(function (c) { return '"' + c + '"'; }).join(',') + ') VALUES (' + ph + ')'
    ).run(...allVals);
    id = r.lastInsertRowid;
  }

  /* 예전 서식으로 남아 있던 사고보험금 줄은 rows 로 옮겨졌으므로 지웁니다 */
  db.prepare('DELETE FROM claims WHERE contract_id = ?').run(id);

  return { id: id, customerId: customerId, analysis: res };
});

function deleteContract(id) {
  return db.prepare('DELETE FROM contracts WHERE id = ?').run(id).changes;
}

function wipeAll() {
  db.exec('DELETE FROM claims; DELETE FROM contracts; DELETE FROM customers;');
}

/* ---------- 통계 ---------- */

function stats() {
  const recs = listContracts({});
  const total = recs.length;
  const custs = db.prepare('SELECT COUNT(*) n FROM customers').get().n;
  const money = recs.reduce(function (a, r) { return a + (r.money || 0); }, 0);
  const hid = recs.filter(function (r) { return (r.money || 0) > 0; }).length;
  const contractCnt = recs.reduce(function (a, r) { return a + Schema.rowsOf(r, 'contracts').length; }, 0);

  const grades = { A: 0, B: 0, C: 0, '': 0 };
  recs.forEach(function (r) {
    const g = r.f.m_grade || '';
    grades[g] = (grades[g] || 0) + 1;
  });

  const follow = [];
  recs.forEach(function (r) {
    const due = Schema.ledgerValue(r, '_due');
    const what = Schema.ledgerValue(r, '_follow');
    if (!due && !what && !r.f.m_next) return;
    const key = due || r.f.m_next;
    follow.push({
      id: r.id, cust: r.f.h_cust, prod: Schema.ledgerValue(r, '_prod'), follow: what,
      deadline: due, next: r.f.m_next, d: Calc.dday(key)
    });
  });
  follow.sort(function (a, b) { return (a.d == null ? 9999 : a.d) - (b.d == null ? 9999 : b.d); });

  const months = {};
  recs.forEach(function (r) {
    const k = String(r.f.m_vdate || r.f.h_adate || r.createdAt || '').slice(0, 7);
    if (k) months[k] = (months[k] || 0) + 1;
  });

  return {
    total: total, customers: custs, money: money, hidden: hid, contracts: contractCnt,
    grades: grades, follow: follow, months: months
  };
}

module.exports = {
  db: db, DB_PATH: DB_PATH,
  listCustomers: listCustomers, getCustomer: getCustomer,
  updateCustomer: updateCustomer, deleteCustomer: deleteCustomer,
  listContracts: listContracts, getContract: getContract,
  saveContract: saveContract, deleteContract: deleteContract,
  wipeAll: wipeAll, stats: stats
};
