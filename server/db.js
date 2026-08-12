/*
 * 서버 DB (SQLite)
 * - 고객(customers) : 사람 단위. 같은 고객의 계약이 여러 건이어도 한 번만 관리합니다.
 * - 계약(contracts) : 분석 단위. 항목 컬럼은 shared/schema.js 에서 자동으로 만들어집니다.
 * - 사고보험금(claims) : 계약에 딸린 여러 줄.
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
  const claims = db.prepare('SELECT d, t, a FROM claims WHERE contract_id = ? ORDER BY seq, id').all(row.id);
  return {
    id: row.id,
    customerId: row.customer_id,
    f: f,
    chk: chk,
    claims: claims,
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
    WHERE (? = '%%' OR c.name LIKE ? OR k.i_prod LIKE ?)
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

const saveContract = db.transaction(function (record) {
  const f = (record && record.f) || {};
  const name = String(f.h_cust || '').trim();
  if (!name) throw new Error('고객(계약자) 성명을 입력해 주세요.');

  /* 계약자 생년월일을 고객 식별에 함께 쓴다 (동명이인 구분) */
  const birth = f.c_obirth || '';
  const customerId = upsertCustomer(name, f.h_fp, birth);

  const res = Analysis.analyze({ f: f, claims: record.claims || [] });
  const t = now();

  const cols = [], vals = [];
  CONTRACT_KEYS.forEach(function (k) {
    cols.push(k);
    vals.push(cleanValue(FIELD_MAP[k], f[k]));
  });

  let id = record.id ? Number(record.id) : 0;
  if (id && db.prepare('SELECT 1 FROM contracts WHERE id = ?').get(id)) {
    const sets = cols.map(function (c) { return '"' + c + '" = ?'; });
    sets.push('customer_id = ?', 'checks = ?', 'money = ?', 'hid_cnt = ?', 'updated_at = ?');
    const args = vals.concat([
      customerId, JSON.stringify(record.chk || {}), res.money, res.hidCnt, t, id
    ]);
    db.prepare('UPDATE contracts SET ' + sets.join(', ') + ' WHERE id = ?').run(...args);
  } else {
    const allCols = ['customer_id', 'checks', 'money', 'hid_cnt', 'created_at', 'updated_at'].concat(cols);
    const allVals = [customerId, JSON.stringify(record.chk || {}), res.money, res.hidCnt, t, t].concat(vals);
    const ph = allCols.map(function () { return '?'; }).join(',');
    const r = db.prepare(
      'INSERT INTO contracts (' + allCols.map(function (c) { return '"' + c + '"'; }).join(',') + ') VALUES (' + ph + ')'
    ).run(...allVals);
    id = r.lastInsertRowid;
  }

  db.prepare('DELETE FROM claims WHERE contract_id = ?').run(id);
  const insClaim = db.prepare('INSERT INTO claims (contract_id, seq, d, t, a) VALUES (?,?,?,?,?)');
  (record.claims || []).forEach(function (c, i) {
    if (!c || (!c.d && !c.t && !c.a)) return;
    insClaim.run(id, i, String(c.d || ''), Calc.normDate(c.t || '') || '', String(c.a || ''));
  });

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
  const total = db.prepare('SELECT COUNT(*) n FROM contracts').get().n;
  const custs = db.prepare('SELECT COUNT(*) n FROM customers').get().n;
  const money = db.prepare('SELECT COALESCE(SUM(money),0) n FROM contracts').get().n;
  const hid = db.prepare('SELECT COUNT(*) n FROM contracts WHERE money > 0').get().n;
  const up = db.prepare("SELECT COUNT(*) n FROM contracts WHERE TRIM(COALESCE(m_upsell,'')) <> ''").get().n;

  const grades = { A: 0, B: 0, C: 0, '': 0 };
  db.prepare("SELECT COALESCE(m_grade,'') g, COUNT(*) n FROM contracts GROUP BY g").all()
    .forEach(function (r) { grades[r.g] = (grades[r.g] || 0) + r.n; });

  const follow = db.prepare(CONTRACT_SELECT + `
    WHERE TRIM(COALESCE(k.m_deadline,'')) <> '' OR TRIM(COALESCE(k.m_next,'')) <> ''
    ORDER BY COALESCE(NULLIF(k.m_deadline,''), k.m_next)
  `).all().map(function (r) {
    const key = r.m_deadline || r.m_next;
    return {
      id: r.id, cust: r.cust_name, prod: r.i_prod, follow: r.m_follow,
      deadline: r.m_deadline, next: r.m_next, d: Calc.dday(key)
    };
  });

  const months = {};
  db.prepare("SELECT COALESCE(NULLIF(m_vdate,''), NULLIF(h_vdate,''), created_at) d FROM contracts").all()
    .forEach(function (r) {
      const k = String(r.d || '').slice(0, 7);
      if (k) months[k] = (months[k] || 0) + 1;
    });

  return {
    total: total, customers: custs, money: money, hidden: hid, upsell: up,
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
