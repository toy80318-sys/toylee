/*
 * 계약자 관리 — 화면 동작
 * 자료는 이 기기의 브라우저 안(localStorage)에 쌓입니다. 서버가 필요 없습니다.
 */
'use strict';

const Calc = KB.Calc, Xlsx = KB.Xlsx, Schema = NC.Schema, Riders = NC.Riders, Engine = NC.Engine,
  Products = NC.Products, Importer = NC.Importer;
const $ = function (id) { return document.getElementById(id); };
const V = function (id) { const e = $(id); return e ? String(e.value || '').trim() : ''; };
const won = Calc.won, normDate = Calc.normDate, ymd = Calc.ymd, numOf = Calc.numOf;
const todayStr = Calc.todayStr();

const FIELDS = Schema.allFields().map(function (f) { return f.k; });
const RSETS = Schema.ROWSETS, RSMAP = Schema.rowsetMap();
const PREPS = Schema.PREPS, EXTRAS = Schema.EXTRAS;

const KEY = 'kyobo_newcust_v1';
const DRAFT = 'kyobo_newcust_draft_v1';
const DICT = 'kyobo_newcust_dict_v1';
const PROD = 'kyobo_newcust_prod_v1';
const FP_KEY = 'kyobo_fp_v1';

let editId = null;

const STORE = (function () {
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return localStorage; }
  catch (e) { return null; }
})();

/* ===================== 공통 ===================== */

let toastTimer = null;
function toast(msg, bad) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast on' + (bad ? ' bad' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.className = 'toast'; }, bad ? 4200 : 2400);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const TABS = 7;

function tab(n) {
  for (let i = 1; i <= TABS; i++) {
    const p = $('p' + i), b = $('tb' + i);
    if (p) p.classList.toggle('on', i === n);
    if (b) b.classList.toggle('on', i === n);
  }
  if (n === 2) drawCoverage();
  if (n === 3) drawCash();
  if (n === 4) drawClaimSum();
  if (n === 6) drawAlerts();
  if (n === 7) { drawDB(); drawStat(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.addEventListener('click', function (e) {
  const t = e.target.closest('[data-tab]');
  if (t) { e.preventDefault(); tab(+t.dataset.tab); }
});

/* ===================== 날짜 · 금액 입력 ===================== */

function enhanceDates(root) {
  (root || document).querySelectorAll('input[data-date]').forEach(function (el) {
    if (el.dataset.enhanced) return;
    el.dataset.enhanced = '1';
    el.setAttribute('placeholder', el.getAttribute('placeholder') || 'YYYY-MM-DD');
    el.setAttribute('inputmode', 'numeric');
    const wrap = document.createElement('div');
    wrap.className = 'dtwrap';
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'dtbtn'; btn.textContent = '📅'; btn.title = '달력에서 고르기';
    wrap.appendChild(btn);
    btn.addEventListener('click', function () {
      const h = $('pickHelper');
      h.value = normDate(el.value) || '';
      h.onchange = function () {
        if (h.value) { el.value = h.value; el.dispatchEvent(new Event('change', { bubbles: true })); }
        h.onchange = null;
      };
      if (h.showPicker) { try { h.showPicker(); return; } catch (err) { /* 아래로 */ } }
      const v = prompt('날짜를 넣어 주세요 (예: 2003-05-14 또는 20030514)', el.value || '');
      if (v !== null) { el.value = normDate(v) || v; el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    el.addEventListener('blur', function () {
      const v = normDate(el.value);
      if (v) { el.value = v; el.style.borderColor = ''; }
      else if (el.value.trim()) el.style.borderColor = 'var(--red)';
    });
  });
}

function commafy(d) {
  return String(d).replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatMoneyLive(el) {
  const before = el.value.slice(0, el.selectionStart == null ? el.value.length : el.selectionStart);
  const digitsBefore = before.replace(/[^0-9]/g, '').length;
  const out = commafy(el.value);
  if (out === el.value) return;
  el.value = out;
  let pos = out.length, seen = 0;
  for (let i = 0; i < out.length; i++) {
    if (/[0-9]/.test(out[i])) seen++;
    if (seen === digitsBefore) { pos = i + 1; break; }
    if (digitsBefore === 0) { pos = 0; break; }
  }
  try { el.setSelectionRange(pos, pos); } catch (e) { /* 무시 */ }
}

function enhanceMoney(root) {
  (root || document).querySelectorAll('input[data-money]').forEach(function (el) {
    if (el.dataset.moneyOn) return;
    el.dataset.moneyOn = '1';
    el.setAttribute('inputmode', 'numeric');
    el.addEventListener('beforeinput', function (ev) {
      if (ev.inputType !== 'deleteContentBackward') return;
      const s = el.selectionStart;
      if (s !== el.selectionEnd || s === 0) return;
      if (el.value[s - 1] === ',') {
        ev.preventDefault();
        el.value = el.value.slice(0, s - 2) + el.value.slice(s);
        try { el.setSelectionRange(s - 2, s - 2); } catch (err) { /* 무시 */ }
        formatMoneyLive(el);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    el.addEventListener('input', function () { formatMoneyLive(el); });
    el.addEventListener('blur', function () { el.value = commafy(el.value); });
  });
}

function moneyRefresh(root) {
  (root || document).querySelectorAll('input[data-money]').forEach(function (el) { el.value = commafy(el.value); });
}

/* ===================== 여러 줄 표 ===================== */

function rsInput(set, col) {
  const attr = [];
  let cls = 'rsi';
  if (col.type === 'select') {
    return '<select class="rsi" data-col="' + col.k + '" data-opt="' + esc(col.opt || '') + '"></select>';
  }
  if (col.type === 'date') attr.push('data-date');
  if (col.type === 'number') { if (col.unit === '%') attr.push('type="number"', 'step="0.1"'); else attr.push('data-money'); }
  if (col.auto) cls += ' autoval';
  if (col.ph) attr.push('placeholder="' + esc(col.ph) + '"');
  return '<input class="' + cls + '" data-col="' + col.k + '" ' + attr.join(' ') + '>';
}

/* ---------- 보험명 · 특약명 드롭다운 ---------- */

const CUSTOM = '\u0001직접입력';

/* 이 줄에서 고른 보험의 상품(약관) */
function productOfRow(tr) {
  const planEl = tr.querySelector('[data-col="plan"]') || tr.querySelector('[data-col="name"]');
  return Products.find(loadProducts(), planEl ? planEl.value : '');
}

function optionsFor(opt, tr) {
  if (opt === 'products') return Products.names(loadProducts());
  if (opt === 'planNames') {
    const tb = $('rsb_plans');
    const list = tb ? [].slice.call(tb.querySelectorAll('[data-col="name"]')).map(function (e) { return String(e.value || '').trim(); }) : [];
    return list.filter(Boolean).length ? list.filter(Boolean) : Products.names(loadProducts());
  }
  if (opt === 'riderNames') return Products.riderNames(productOfRow(tr));
  if (opt === 'payterms') return Schema.PAYTERMS;
  if (opt === 'insterms') return Schema.INSTERMS;
  return [];
}

/* 목록을 채워 넣습니다. 목록에 없는 값이면 그 값도 한 줄 넣어 그대로 보이게 합니다 */
function fillSelect(el, tr) {
  const cur = String(el.value || el.dataset.val || '').trim();
  const list = optionsFor(el.dataset.opt, tr);
  const seen = [];
  let h = '<option value=""></option>';
  list.concat(cur ? [cur] : []).forEach(function (n) {
    if (!n || seen.indexOf(n) >= 0) return;
    seen.push(n);
    h += '<option>' + esc(n) + '</option>';
  });
  h += '<option value="' + CUSTOM + '">＋ 목록에 없어요 (직접 입력)</option>';
  el.innerHTML = h;
  el.value = cur;
  el.dataset.val = cur;
}

function fillSelects(scope) {
  (scope || document).querySelectorAll('select.rsi[data-opt]').forEach(function (el) {
    fillSelect(el, el.closest('tr'));
  });
}

/* 목록에 없는 이름은 글자로 직접 넣게 바꿔 줍니다 (비우고 나가면 다시 목록으로) */
function toTextInput(sel) {
  const td = sel.parentNode;
  const col = sel.dataset.col, opt = sel.dataset.opt;
  const inp = document.createElement('input');
  inp.className = 'rsi'; inp.dataset.col = col; inp.dataset.opt = opt; inp.dataset.free = '1';
  inp.placeholder = '직접 입력';
  td.replaceChild(inp, sel);
  inp.focus();
  inp.addEventListener('blur', function () {
    if (String(inp.value || '').trim()) return;
    const back = document.createElement('select');
    back.className = 'rsi'; back.dataset.col = col; back.dataset.opt = opt;
    td.replaceChild(back, inp);
    fillSelect(back, back.closest('tr'));
  });
}

function renderRowsets() {
  RSETS.forEach(function (set) {
    const box = $('rs_' + set.key);
    if (!box) return;
    box.innerHTML =
      '<div class="rstop noprint"><button type="button" class="b b-gold sm" data-rsadd="' + set.key + '">' +
      esc(set.addLabel || '＋ 줄 추가') + '</button></div>' +
      '<div class="tscroll"><table class="form rs" style="min-width:' + rsWidth(set) + 'px"><thead><tr><th class="rsno">No</th>' +
      set.cols.map(function (c) {
        return '<th' + (c.w ? ' style="width:' + (c.w * 9) + 'px"' : '') + '>' + esc(c.label) +
          (c.unit ? ' <span class="gsub">(' + esc(c.unit) + ')</span>' : '') +
          (c.auto ? ' <span class="gsub">자동</span>' : '') + '</th>';
      }).join('') +
      '<th class="rsx noprint"></th></tr></thead><tbody id="rsb_' + set.key + '"></tbody></table></div>' +
      (set.sub ? '<div class="hint">' + esc(set.sub) + '</div>' : '');
  });
}

/* 칸이 눌려 글자가 잘리지 않도록, 칸 너비를 다 더한 값을 표의 최소 폭으로 잡습니다 */
function rsWidth(set) {
  let w = 46 + 44; /* No 칸 + 지우기 칸 */
  set.cols.forEach(function (c) { w += (c.w || 16) * 9; });
  return w;
}

function rsRenumber(key) {
  const tb = $('rsb_' + key);
  if (!tb) return;
  [].slice.call(tb.children).forEach(function (tr, i) {
    const c = tr.querySelector('.rsno');
    if (c) c.textContent = i + 1;
  });
}

function addRow(key, v) {
  const set = RSMAP[key], tb = $('rsb_' + key);
  if (!set || !tb) return null;
  const tr = document.createElement('tr');
  tr.innerHTML = '<td class="rsno"></td>' +
    set.cols.map(function (c) { return '<td>' + rsInput(set, c) + '</td>'; }).join('') +
    '<td class="rsx noprint"><button type="button" class="rsdel" title="이 줄 지우기">✕</button></td>';
  tb.appendChild(tr);
  if (v) {
    set.cols.forEach(function (c) {
      const el = tr.querySelector('[data-col="' + c.k + '"]');
      if (!el) return;
      const raw = v[c.k] == null ? '' : String(v[c.k]);
      if (c.type === 'select' && c.opt) { el.dataset.val = raw; return; }   /* 목록은 아래 fillSelects 에서 채웁니다 */
      el.value = (c.type === 'number' && c.unit !== '%') ? commafy(raw) : raw;
    });
  }
  enhanceDates(tr); enhanceMoney(tr); fillSelects(tr); rsRenumber(key);
  return tr;
}

function getRows(key) {
  const set = RSMAP[key], tb = $('rsb_' + key);
  if (!set || !tb) return [];
  const out = [];
  [].slice.call(tb.children).forEach(function (tr) {
    const o = {};
    set.cols.forEach(function (c) {
      const el = tr.querySelector('[data-col="' + c.k + '"]');
      let v = el ? String(el.value || '').trim() : '';
      if (c.type === 'date') v = normDate(v) || v;
      if (c.type === 'number') v = (v === '' ? '' : String(numOf(v)));   /* 0 원도 뜻이 있는 값입니다 */
      o[c.k] = v;
    });
    out.push(o);
  });
  return Schema.pruneRows(set, out);
}

function allRows() {
  const o = {};
  RSETS.forEach(function (s) { o[s.key] = getRows(s.key); });
  return o;
}

function setRows(key, list) {
  const set = RSMAP[key], tb = $('rsb_' + key);
  if (!set || !tb) return;
  tb.innerHTML = '';
  const base = (list && list.length) ? list : (set.defaults || []);
  const n = Math.max(set.rows || 1, base.length);
  for (let i = 0; i < n; i++) addRow(key, base[i]);
}

document.addEventListener('click', function (e) {
  const a = e.target.closest('[data-rsadd]');
  if (a) {
    e.preventDefault();
    const tr = addRow(a.dataset.rsadd);
    if (tr) { const f = tr.querySelector('input'); if (f) { f.focus(); tr.scrollIntoView({ block: 'nearest' }); } }
    markDirty();
    return;
  }
  const d = e.target.closest('.rsdel');
  if (d) {
    e.preventDefault();
    const tr = d.closest('tr'), tb = tr.parentNode, key = tb.id.replace('rsb_', '');
    tr.remove();
    if (!tb.children.length) addRow(key);
    rsRenumber(key); calcAll(); markDirty();
  }
});

/* ===================== 자동 계산 ===================== */

function setAuto(el, v) {
  if (!el) return false;
  if (!el.value.trim() || el.value === el.dataset.autoval) { el.value = v; el.dataset.autoval = v; return true; }
  return false;
}

function calcAge() {
  const b = normDate(V('p_birth'));
  const el = $('ageMsg');
  if (!b) { el.innerHTML = '생년월일을 넣으시면 보험나이와 상령일이 자동으로 계산됩니다.'; el.style.color = ''; return; }
  const r = Calc.insAge(b, todayStr);
  if (r) setAuto($('p_age'), r.age);
  const half = Engine.addMonths(b, 6);
  const next = Engine.nextYearly(half.slice(5), todayStr);
  const d = Calc.dday(next, todayStr);
  el.innerHTML = '보험나이 <b>' + (r ? r.age : '-') + '세</b> ' +
    '<span style="color:var(--sub)">(' + (r ? r.y + '년 ' + r.m + '개월 → ' + (r.up ? '6개월 이상이라 한 살 올림' : '6개월 미만이라 버림') : '') + ')</span>' +
    ' · 다음 <b>상령일 ' + ymd(next) + '</b> (D-' + d + ') — 이 날부터 보험나이가 한 살 올라갑니다.';
  el.style.color = 'var(--rose)';
}

function calcPlans() {
  const tb = $('rsb_plans');
  if (!tb) return;
  const msgs = [];
  const birth = normDate(V('p_birth'));
  [].slice.call(tb.children).forEach(function (tr, i) {
    const get = function (k) { const e = tr.querySelector('[data-col="' + k + '"]'); return e ? e.value.trim() : ''; };
    const j = normDate(get('join'));
    if (!j) return;
    /* 만기 · 납입만료는 그 계약을 맺을 때의 나이(가입연령)로 셉니다 */
    const ia = birth ? Calc.insAge(birth, j) : null;
    const age = ia ? ia.age : V('p_age');
    const nm = get('name') || (i + 1) + '번 보험';
    const ins = Calc.calcInsEnd(j, get('insterm'), age);
    if (ins.whole) msgs.push('<b>' + esc(nm) + '</b> 종신 — 만기가 따로 없습니다.');
    else if (ins.value) { setAuto(tr.querySelector('[data-col="insend"]'), ins.value); msgs.push('<b>' + esc(nm) + '</b> 보험 만기일 ' + ins.how); }
    const pay = Calc.calcPayEnd(j, get('payterm'), get('insend'), age);
    if (pay.value) { setAuto(tr.querySelector('[data-col="payend"]'), pay.value); msgs.push('<b>' + esc(nm) + '</b> 납입 만료일 ' + pay.how); }
  });
  const el = $('planMsg');
  if (msgs.length) { el.innerHTML = msgs.join('<br>'); el.style.color = 'var(--rose)'; }
  else { el.innerHTML = '계약일과 납입기간 · 보험기간을 넣으시면 <b>납입 만료일 · 보험 만기일</b>이 자동으로 채워집니다.'; el.style.color = ''; }
}

function calcAll() { calcAge(); calcPlans(); fillCashPlan(); }

/* 바탕화면 아이콘 — 파비콘과 같은 그림을 크게 보여 주고 꾹 눌러 저장하게 합니다 */
(function () {
  const img = $('iconImg');
  const link = document.querySelector('link[rel="icon"]');
  if (img && link) img.src = link.href;
})();

/* ===================== 보험 · 약관 (상품 목록) ===================== */

let PRODCACHE = null;

function loadProducts() {
  if (PRODCACHE) return PRODCACHE;
  try {
    const raw = STORE && STORE.getItem(PROD);
    PRODCACHE = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(Products.BASE));
  } catch (e) { PRODCACHE = JSON.parse(JSON.stringify(Products.BASE)); }
  if (!PRODCACHE.length) PRODCACHE = JSON.parse(JSON.stringify(Products.BASE));
  return PRODCACHE;
}

function storeProducts(list) {
  PRODCACHE = list;
  try { STORE.setItem(PROD, JSON.stringify(list)); } catch (e) { /* 무시 */ }
  fillSelects(document);
  drawCoverage();
}

/* 「어떤 일 = 몇 %」 여러 줄 → 지급기준 배열 */
function parsePays(text) {
  return String(text || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean).map(function (line) {
    const m = line.match(/^(.*?)=\s*([0-9.]+)\s*(%|만원)?/);
    if (!m) return { when: line, rate: 0 };
    const when = m[1].trim(), n = +m[2];
    return (m[3] === '만원') ? { when: when, fixed: n } : { when: when, rate: n / 100 };
  });
}

function paysText(pays) {
  return (pays || []).map(function (p) {
    return p.when + ' = ' + (p.rate != null ? (p.rate * 100) + '%' : p.fixed + '만원');
  }).join('\n');
}

let PRODIDX = 0;

/* 편집기에는 「실제로 쓰이는 값」을 보여 줍니다 —
   약관에 적어 둔 값이 있으면 그 값, 없으면 특약 사전의 표준값 */
function effSpec(r) {
  const dict = loadDict();
  const base = (r.dict ? dict.filter(function (d) { return d.key === r.dict; })[0] : null) || Riders.find(r.name, dict);
  return Riders.overlay(base, r);
}

function drawProd() {
  const list = loadProducts();
  if (PRODIDX >= list.length) PRODIDX = 0;
  const p = list[PRODIDX] || { name: '', riders: [] };
  const rows = (p.main ? [p.main] : []).concat(p.riders || []);
  $('prodPick').innerHTML = list.map(function (x, i) {
    return '<option value="' + i + '"' + (i === PRODIDX ? ' selected' : '') + '>' + esc(x.name) + '</option>';
  }).join('');
  $('prodBox').innerHTML =
    '<div class="grid g2" style="margin-bottom:10px">' +
    '<div><label>보험명</label><input id="pd_name" value="' + esc(p.name || '') + '"></div>' +
    '<div><label>메모 (약관 판·개정일 등)</label><input id="pd_note" value="' + esc(p.note || '') + '"></div></div>' +
    '<div class="tscroll"><table class="form"><tr>' +
    '<th style="width:60px">구분</th><th style="width:190px">특약명</th><th>보장영역 <span class="gsub">(한 줄에 하나)</span></th>' +
    '<th style="width:230px">지급 기준 <span class="gsub">(어떤 일 = 몇 %)</span></th>' +
    '<th style="width:80px">면책(일)</th><th style="width:130px">감액</th>' +
    '<th style="width:170px">보장한도</th><th class="rsx noprint"></th></tr>' +
    rows.map(function (r, i) {
      const isMain = p.main && i === 0;
      const e = effSpec(r);
      return '<tr><td class="gk" style="width:60px">' + (isMain ? '주계약' : '특약') + '</td>' +
        '<td><input data-p="' + i + '" data-pf="name" value="' + esc(r.name || '') + '"></td>' +
        '<td><textarea data-p="' + i + '" data-pf="areas" rows="3">' + esc((e.areas || []).join('\n')) + '</textarea></td>' +
        '<td><textarea data-p="' + i + '" data-pf="pays" rows="3">' + esc(paysText(e.pays)) + '</textarea></td>' +
        '<td><input data-p="' + i + '" data-pf="wait" type="number" value="' + (e.wait || 0) + '" placeholder="0"></td>' +
        '<td><input data-p="' + i + '" data-pf="reduce" value="' + (e.reduce ? e.reduce.days + '일 ' + (e.reduce.rate * 100) + '%' : '') + '" placeholder="비우면 감액 없음"></td>' +
        '<td><input data-p="' + i + '" data-pf="limit" value="' + esc(e.limit || '') + '" placeholder="한도 없으면 비워 두세요"></td>' +
        '<td class="rsx noprint">' + (isMain ? '' : '<button type="button" class="rsdel" data-pdel="' + i + '" title="이 특약 지우기">✕</button>') + '</td></tr>';
    }).join('') + '</table></div>' +
    '<div class="hint" style="margin-top:6px">여기 보이는 값이 <b>실제로 계산에 쓰이는 값</b>입니다. ' +
    '약관에 적힌 값이 없으면 특약 사전의 표준값을 채워 두었습니다. 고쳐서 [저장]하면 그대로 쓰입니다.<br>' +
    '지급기준은 <b>한 줄에 하나씩</b>, <b>「어떤 일 = 몇 %」</b> — 가입금액 대비 비율입니다. 정액은 <b>「= 300만원」</b> 처럼 적으세요. ' +
    '감액 칸을 비우면 <b>감액 없음</b>이 됩니다.</div>';
}

function collectProd() {
  const list = JSON.parse(JSON.stringify(loadProducts()));
  const p = list[PRODIDX];
  if (!p) return list;
  p.name = V('pd_name') || p.name;
  p.note = V('pd_note');
  const rows = (p.main ? [p.main] : []).concat(p.riders || []);
  document.querySelectorAll('[data-p]').forEach(function (el) {
    const r = rows[+el.dataset.p], f = el.dataset.pf;
    if (!r) return;
    /* 화면에 보이는 값을 그대로 저장합니다 — 보이는 것과 쓰이는 것이 어긋나지 않게 */
    if (f === 'name') r.name = el.value.trim();
    else if (f === 'areas') r.areas = el.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    else if (f === 'pays') r.pays = parsePays(el.value);
    else if (f === 'wait') r.wait = numOf(el.value) || 0;
    else if (f === 'limit') { const v = el.value.trim(); if (v) r.limit = v; else delete r.limit; }
    else if (f === 'reduce') {
      const m = el.value.match(/(\d+)\s*일\s*([0-9.]+)\s*%/);
      r.reduce = m ? { days: +m[1], rate: +m[2] / 100 } : null;
    }
  });
  if (p.main) { p.main = rows[0]; p.riders = rows.slice(1); }
  else p.riders = rows;
  return list;
}

/* ===================== 특약 사전 ===================== */

function loadDict() {
  try {
    const raw = STORE && STORE.getItem(DICT);
    if (!raw) return JSON.parse(JSON.stringify(Riders.BASE));
    const saved = JSON.parse(raw);
    return Riders.BASE.map(function (b) {
      const s = saved.filter(function (x) { return x.key === b.key; })[0];
      return s ? Object.assign(JSON.parse(JSON.stringify(b)), s) : JSON.parse(JSON.stringify(b));
    });
  } catch (e) { return JSON.parse(JSON.stringify(Riders.BASE)); }
}
let DICTLIST = [];

function drawDict() {
  DICTLIST = loadDict();
  $('dictBox').innerHTML = '<div class="tscroll"><table class="form"><tr>' +
    '<th style="width:150px">특약 유형</th><th>보장영역</th><th style="width:230px">지급 기준</th>' +
    '<th style="width:90px">면책(일)</th><th style="width:150px">감액</th></tr>' +
    DICTLIST.map(function (r, i) {
      return '<tr><td class="gk" style="width:150px">' + esc(r.label) + '</td>' +
        '<td><textarea data-d="' + i + '" data-df="areas" rows="3">' + esc(r.areas.join('\n')) + '</textarea></td>' +
        '<td><textarea data-d="' + i + '" data-df="pays" rows="3">' +
        esc(r.pays.map(function (p) { return p.when + ' = ' + (p.rate != null ? (p.rate * 100) + '%' : p.fixed + '만원'); }).join('\n')) +
        '</textarea></td>' +
        '<td><input data-d="' + i + '" data-df="wait" type="number" value="' + (r.wait || 0) + '"></td>' +
        '<td><input data-d="' + i + '" data-df="reduce" value="' +
        (r.reduce ? r.reduce.days + '일 ' + (r.reduce.rate * 100) + '%' : '') + '" placeholder="365일 50%"></td></tr>';
    }).join('') + '</table></div>' +
    '<div class="hint" style="margin-top:6px">지급 기준은 <b>한 줄에 하나씩</b>, <b>「어떤 일 = 몇 %」</b> 로 적으세요. ' +
    '가입금액 대비 비율입니다 (100% = 가입금액 전액). 정액은 <b>「= 300만원」</b> 처럼 적으시면 됩니다.</div>';
}

function saveDict() {
  const list = JSON.parse(JSON.stringify(DICTLIST));
  document.querySelectorAll('[data-d]').forEach(function (el) {
    const r = list[+el.dataset.d], f = el.dataset.df;
    if (!r) return;
    if (f === 'areas') r.areas = el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    else if (f === 'wait') r.wait = numOf(el.value) || 0;
    else if (f === 'limit') { const v = el.value.trim(); if (v) r.limit = v; else delete r.limit; }
    else if (f === 'reduce') {
      const m = el.value.match(/(\d+)\s*일\s*(\d+(?:\.\d+)?)\s*%/);
      r.reduce = m ? { days: +m[1], rate: +m[2] / 100 } : null;
    } else if (f === 'pays') {
      r.pays = el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).map(function (line) {
        const m = line.match(/^(.*?)=\s*(\d+(?:\.\d+)?)\s*(%|만원)?/);
        if (!m) return { when: line, rate: 0 };
        const when = m[1].trim(), n = +m[2];
        return (m[3] === '만원') ? { when: when, fixed: n } : { when: when, rate: n / 100 };
      });
    }
  });
  try { STORE.setItem(DICT, JSON.stringify(list)); } catch (e) { /* 무시 */ }
  DICTLIST = list;
  toast('특약 사전을 저장했습니다.');
  drawCoverage();
}

/* 만원 단위가 1보다 작으면 원으로 적어 줍니다 (입원 1일당 3,000원 같은 경우) */
function manwon(v) {
  const n = Number(v) || 0;
  if (!n) return '-';
  if (n >= 1) return won(n) + '만원';
  return won(n * 10000) + '원';
}

/* ===================== 보장 요약 ===================== */

let covMode = 'card';           /* 'card' = 고객께 보여드리는 모습 · 'table' = 한눈에 보는 표 */

/* 특약 · 주계약을 보험별로 묶어 보기 좋은 차례로 세웁니다 */
function covRows(cov) {
  const rows = [], used = [];
  cov.mains.filter(function (c) { return c.name; }).forEach(function (m) {
    rows.push(m);
    cov.riders.forEach(function (r) {
      if (r.name && r.plan === m.plan && used.indexOf(r) < 0) { rows.push(r); used.push(r); }
    });
  });
  cov.riders.forEach(function (r) { if (r.name && used.indexOf(r) < 0) rows.push(r); });
  return rows;
}

/* 언제부터 · 언제까지 — 면책 · 감액 · 갱신을 한 덩어리로 */
function covWhen(c) {
  const out = [];
  if (c.waitEnd) {
    const start = Engine.addDays(c.waitEnd, 1);
    const on = start <= todayStr;
    out.push({
      k: '보장 시작', v: ymd(start) + ' 부터',
      sub: '계약일부터 ' + c.wait + '일은 면책기간이라 보험금이 나오지 않습니다 (' + ymd(c.waitEnd) + ' 까지).',
      tone: on ? 'ok' : 'red'
    });
  } else if (c.found) {
    out.push({ k: '보장 시작', v: '계약일부터 바로', sub: '면책기간이 없습니다.', tone: 'ok' });
  }
  if (c.reduceEnd) {
    const full = Engine.addDays(c.reduceEnd, 1);
    const pct = Math.round((c.reduceRate || 0.5) * 100);
    out.push({
      k: '감액기간', v: ymd(c.reduceEnd) + ' 까지 ' + pct + '%',
      sub: '이 기간에 사고가 나면 ' + pct + '%만 나오고, ' + ymd(full) + ' 부터 전액 나옵니다.',
      tone: c.reducing ? 'org' : 'ok'
    });
  }
  if (c.renew && c.renew.on) {
    const nx = (c.renew.dates || []).filter(function (x) { return x.date === c.renew.next; })[0];
    out.push({
      k: '갱신', v: c.renew.cycle ? c.renew.cycle + '년마다' : '갱신형',
      sub: (c.renew.next ? '다음 갱신 ' + ymd(c.renew.next) +
            (nx && nx.age != null ? ' (' + nx.age + '세)' : '') + ' — 그때 나이로 보험료가 다시 정해져 오릅니다. ' : '') +
        (c.renew.endAge ? c.renew.endAge + '세까지 갱신됩니다.'
          : '갱신 종료나이는 상품제안서를 보고 ① 특약표의 [갱신 종료나이] 칸에 넣어 주세요.'),
      tone: 'org'
    });
  } else if (c.found) {
    out.push({ k: '갱신', v: '갱신 없음', sub: '보험료가 오르지 않고 만기까지 그대로 갑니다.', tone: 'ok' });
  }
  if (c.limit) out.push({ k: '보장한도', v: c.limit, sub: '', tone: 'org' });
  return out;
}

const TONE = { ok: 'var(--brand)', red: 'var(--red)', org: 'var(--org)' };

/* 「급부명 — 지급사유」 꼴로 적힌 보장영역에서 그 급부의 지급사유만 골라냅니다 */
function whyOf(c, when) {
  const head = String(when || '') + ' — ';
  const hit = (c.areas || []).filter(function (a) { return String(a).indexOf(head) === 0; })[0];
  return hit ? String(hit).slice(head.length) : '';
}

/* 지급사유가 금액표 안으로 들어갔다면 위에 또 늘어놓지 않습니다 */
function areasSeparate(c) {
  if (!c.found || !c.areas.length) return [];
  return c.areas.filter(function (a) {
    return !(c.pays || []).some(function (p) { return String(a).indexOf(String(p.when) + ' — ') === 0; });
  });
}

function covCard(c) {
  const when = covWhen(c);
  const pays = (c.found && c.pays.length)
    ? '<table class="dt" style="margin:0"><tr><th class="l">이런 일이 생기면</th><th style="width:160px">이만큼 나옵니다</th></tr>' +
      c.pays.map(function (p) {
        const why = whyOf(c, p.when);
        return '<tr><td class="l">' + esc(p.when) +
          (why ? '<div class="gsub" style="margin-top:2px">' + esc(why) + '</div>' : '') + '</td>' +
          '<td style="text-align:right;white-space:nowrap"><b style="color:var(--rose)">' + manwon(p.amount) +
          '</b>' + (p.per ? ' <span class="gsub">' + esc(p.per) + '</span>' : '') +
          (p.cut ? '<div class="gsub" style="color:var(--org)">지금은 감액기간 (전액 ' + manwon(p.full) + ')</div>' : '') +
          '</td></tr>';
      }).join('') + '</table>'
    : (c.found
      ? '<div class="hint">약관에 금액이 정해져 있지 않은 급부입니다 — 상품제안서나 회사 시스템에서 확인해 주세요.</div>'
      : '<div class="warn">이 특약의 지급기준을 아직 모릅니다. 상품제안서를 불러오시거나 [📕 보험 · 약관 고치기]에서 넣어 주세요.</div>');

  return '<div class="card" style="margin:12px 0">' +
    '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline">' +
      '<div><b style="font-size:18px">' + esc(c.name) + '</b>' +
        ' <span class="gsub">' + (c.main ? '주계약' : '특약') + (c.plan ? ' · ' + esc(c.plan) : '') + '</span></div>' +
      '<div style="white-space:nowrap">' + (c.amt ? '가입금액 <b>' + won(c.amt) + '만원</b>' : '') +
        (c.prem ? ' <span class="gsub">· 보험료 ' + won(numOf(c.prem)) + '원</span>' : '') + '</div>' +
    '</div>' +
    (c.easy ? '<p class="sub" style="margin:9px 0 12px 0;color:var(--ink)">' + esc(c.easy) + '</p>' : '') +
    (function () {
      const rest = areasSeparate(c);
      return rest.length
        ? '<div class="hint" style="margin-bottom:10px"><b>보장받는 영역</b><br>' +
          rest.map(function (x) { return '· ' + esc(x); }).join('<br>') + '</div>' : '';
    })() +
    pays +
    (when.length
      ? '<div class="grid g3" style="margin-top:12px">' + when.map(function (w) {
        return '<div class="hint" style="margin:0"><b style="color:' + TONE[w.tone] + '">' + esc(w.k) + '</b><br>' +
          '<b>' + esc(w.v) + '</b>' + (w.sub ? '<br><span class="gsub">' + esc(w.sub) + '</span>' : '') + '</div>';
      }).join('') + '</div>' : '') +
    (c.note ? '<div class="hint" style="margin-top:10px"><b>청구할 때</b> · ' + esc(c.note) + '</div>' : '') +
    '</div>';
}

function covTable(rows) {
  let h = '<div class="tscroll"><table class="form"><tr>' +
    '<th style="width:140px">구분</th><th style="width:200px">특약 · 주계약</th>' +
    '<th style="width:100px">가입금액</th><th>보장받는 영역 · 쉬운 설명</th>' +
    '<th style="width:230px">증상별 보장금액</th><th style="width:190px">보장시작 · 감액 · 갱신</th></tr>';
  rows.forEach(function (c) {
    const pays = (c.found && c.pays.length)
      ? c.pays.map(function (p) {
        const why = whyOf(c, p.when);
        return '<div style="margin-bottom:4px">' + esc(p.when) + ' → <b style="color:var(--rose)">' + manwon(p.amount) +
          (p.per ? ' (' + esc(p.per) + ')' : '') + '</b>' +
          (p.cut ? ' <span style="color:var(--org)">감액</span>' : '') +
          (why ? '<div class="gsub">' + esc(why) + '</div>' : '') + '</div>';
      }).join('')
      : (c.found ? '<span class="gsub">약관에 금액이 정해져 있지 않습니다</span>'
        : '<span style="color:var(--org)">지급기준을 모릅니다</span>');
    h += '<tr><td class="gk">' + esc(c.plan || '-') +
      '<div class="gsub">' + (c.main ? '주계약' : '특약') + '</div></td>' +
      '<td>' + esc(c.name) + (c.found && c.label ? '<div class="gsub">' + esc(c.label) + '</div>' : '') + '</td>' +
      '<td style="text-align:right;white-space:nowrap">' + (c.amt ? won(c.amt) + '만원' : '-') + '</td>' +
      '<td>' + (c.easy ? esc(c.easy) : '') +
        (function () {
          const rest = areasSeparate(c);
          return rest.length ? '<div class="gsub" style="margin-top:5px">' +
            rest.map(function (a) { return '· ' + esc(a); }).join('<br>') + '</div>' : '';
        })() + '</td>' +
      '<td>' + pays + '</td>' +
      '<td>' + covWhen(c).map(function (w) {
        return '<div style="color:' + TONE[w.tone] + '"><b>' + esc(w.k) + '</b> ' + esc(w.v) + '</div>';
      }).join('') + '</td></tr>';
  });
  return h + '</table></div>';
}

function drawCoverage() {
  const box = $('covBox');
  if (!box) return;
  const rec = collect();
  const cov = Engine.coverage(rec, { today: todayStr, dict: loadDict(), products: loadProducts() });
  const rows = covRows(cov);
  if (!rows.length) {
    box.innerHTML = '<div class="note">① 고객정보에서 <b>상품제안서를 불러오시거나</b> 보험 · 특약을 넣으시면 ' +
      '여기에 특약별 설명과 증상별 보장금액이 자동으로 정리됩니다.</div>';
    return;
  }

  const totAmt = rows.reduce(function (t, c) { return t + (c.amt || 0); }, 0);
  const totPrem = rows.reduce(function (t, c) { return t + (numOf(c.prem) || 0); }, 0);
  let h = '<div class="kpi" style="margin-bottom:6px">' +
    '<div><div class="n">' + rows.filter(function (c) { return c.main; }).length + '</div><div class="t">보험</div></div>' +
    '<div><div class="n">' + rows.filter(function (c) { return !c.main; }).length + '</div><div class="t">특약</div></div>' +
    '<div><div class="n">' + won(totAmt) + '</div><div class="t">가입금액 합계 (만원)</div></div>' +
    (totPrem ? '<div><div class="n">' + won(totPrem) + '</div><div class="t">보험료 합계 (원)</div></div>' : '') +
    '</div>';

  h += (covMode === 'card') ? rows.map(covCard).join('') : covTable(rows);

  if (cov.unknown.length) {
    h += '<div class="warn" style="margin-top:10px"><b>지급기준을 모르는 특약 ' + cov.unknown.length + '건</b> — ' +
      esc(cov.unknown.map(function (c) { return c.name; }).join(', ')) +
      '<br>상품제안서를 불러오시면 그 제안서에 적힌 금액으로 정확히 정리됩니다.</div>';
  }
  h += '<div class="hint" style="margin-top:12px">위 금액은 <b>참고용</b>입니다. ' +
    '실제 지급 여부와 금액은 약관과 회사 시스템에서 최종 확인하신 뒤 안내해 주세요.</div>';
  box.innerHTML = h;
}


/* ===================== ③ 해약환급금 · 사망보험금 ===================== */

function planNames() {
  return getRows('plans').map(function (p) { return p.name; }).filter(Boolean);
}

function cashPlanName() {
  const el = $('cashPlan');
  return el ? String(el.value || '') : '';
}

function fillCashPlan() {
  const el = $('cashPlan');
  if (!el) return;
  const cur = el.value;
  const list = planNames();
  el.innerHTML = (list.length ? list : ['']).map(function (n) {
    return '<option>' + esc(n) + '</option>';
  }).join('');
  if (list.indexOf(cur) >= 0) el.value = cur;
}

function wonOrDash(v) { return v == null ? '-' : won(Math.round(v)) + '원'; }

/* 지금 고른 보험의 계약일 · 가입 당시 나이 */
function cashPlanInfo(name) {
  const p = getRows('plans').filter(function (x) {
    const a = String(x.name || '').replace(/\s/g, ''), b = String(name || '').replace(/\s/g, '');
    return a && b && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0);
  })[0] || null;
  const birth = normDate(V('p_birth'));
  const join = p ? normDate(p.join) : '';
  const ia = (birth && join) ? Calc.insAge(birth, join) : null;
  return { plan: p, join: join, ageAtJoin: ia ? ia.age : null };
}

/* 표의 나이 칸으로도 가입 당시 나이를 짐작합니다 (생년월일을 안 넣으셨을 때) */
function baseAge(table, info) {
  if (info.ageAtJoin != null) return info.ageAtJoin;
  const first = table.filter(function (r) { return r.age != null; })[0];
  return first ? first.age - Math.floor(first.m / 12) : null;
}

function drawCash() {
  const box = $('cashOut');
  if (!box) return;
  fillCashPlan();
  const name = cashPlanName();
  const rec = collect();
  const table = Engine.cashTable(rec, name);

  if (!table.length) {
    box.innerHTML = '<div class="warn">이 보험의 <b>해약환급금 예시표가 아직 없습니다.</b><br>' +
      '① 고객정보의 <b>[📄 제안서 불러오기]</b>로 상품제안서를 넣으시거나, 아래 표에 직접 넣어 주세요.<br>' +
      '<span class="gsub">프로그램이 임의로 계산하지 않습니다 — 회사가 제시한 금액만 보여드립니다.</span></div>';
    return;
  }

  const info = cashPlanInfo(name);
  const b0 = baseAge(table, info);

  /* 경과년수 · 나이 중 넣으신 쪽을 씁니다 */
  let m = null;
  const yv = V('cashYear'), av = V('cashAge');
  if (yv !== '') m = Math.round(parseFloat(yv) * 12);
  else if (av !== '' && b0 != null) m = Math.round((parseFloat(av) - b0) * 12);
  if (m == null || !isFinite(m) || m < 0) m = table[0].m;

  const hit = Engine.cashAt(table, m);
  const r = hit.row;
  const rate = r.rate != null ? r.rate : (r.paid ? (r.cv || 0) / r.paid * 100 : null);
  const diff = (r.cv != null && r.paid != null) ? r.cv - r.paid : null;

  /* 넣지 않은 쪽 칸을 채워 드립니다 */
  if ($('cashYear') && yv === '') $('cashYear').value = Math.floor(m / 12);
  if ($('cashAge') && av === '' && r.age != null) $('cashAge').value = r.age;

  const when = info.join ? ymd(Engine.addMonths(info.join, m)) : '';
  const tag = hit.exact ? '<span class="gsub">제안서 표에 있는 금액</span>'
    : hit.before ? '<span style="color:var(--org)">표의 첫 줄보다 이른 시점이라 첫 줄을 보여드립니다</span>'
      : hit.after ? '<span style="color:var(--org)">표의 마지막 줄보다 늦은 시점이라 마지막 줄을 보여드립니다</span>'
        : '<span style="color:var(--org)">표에 없는 시점이라 앞뒤 줄 사이를 이어 셈한 <b>참고값</b>입니다</span>';

  let h = '<div class="kpi">' +
    '<div><div class="n">' + Engine.monthText(m) + '</div>' +
      '<div class="t">경과' + (r.age != null ? ' · ' + r.age + '세' : '') + '</div></div>' +
    '<div><div class="n" style="font-size:20px">' + wonOrDash(r.paid) + '</div><div class="t">그때까지 낸 보험료</div></div>' +
    '<div><div class="n" style="font-size:20px;color:var(--rose)">' + wonOrDash(r.cv) + '</div><div class="t">해약환급금</div></div>' +
    '<div><div class="n" style="color:' + (rate != null && rate >= 100 ? 'var(--brand)' : 'var(--org)') + '">' +
      (rate == null ? '-' : rate.toFixed(1) + '%') + '</div><div class="t">환급률</div></div>' +
    '<div><div class="n" style="font-size:20px">' + wonOrDash(r.death) + '</div><div class="t">사망시 지급액</div></div>' +
    '</div>';

  h += '<div class="hint" style="margin-top:10px">' + tag +
    (when ? ' · 달력으로는 <b>' + when + '</b> 무렵입니다.' : '') +
    (diff != null ? '<br>낸 보험료보다 <b style="color:' + (diff >= 0 ? 'var(--brand)' : 'var(--red)') + '">' +
      won(Math.abs(Math.round(diff))) + '원 ' + (diff >= 0 ? '많습니다' : '적습니다') + '</b>.' : '') +
    (hit.between ? '<br><span class="gsub">사이에 둔 두 줄 : ' + esc(hit.between[0].year) + ' · ' +
      esc(hit.between[1].year) + '</span>' : '') +
    '</div>';

  /* 짚어 드릴 만한 시점 */
  const even = Engine.breakEven(table);
  const payend = Engine.marked(table, '납입완료');
  const mat = Engine.marked(table, '만기');
  const last = table[table.length - 1];
  const notes = [];
  if (payend) notes.push('<b>납입이 끝나는 ' + esc(payend.year) + '</b>에 해약환급금은 ' +
    wonOrDash(payend.cv) + ' (환급률 ' + (payend.rate == null ? '-' : payend.rate.toFixed(1) + '%') + ') 입니다.');
  if (mat) notes.push('<b>만기 ' + esc(mat.year) + '</b>의 만기환급금은 ' + wonOrDash(mat.cv) + ' 입니다.');
  if (even) notes.push('낸 보험료만큼 돌려받게 되는 때는 <b>' + esc(even.year) + '</b> 입니다 (환급률 ' +
    (even.rate == null ? '-' : even.rate.toFixed(1) + '%') + ').');
  else notes.push('<b style="color:var(--red)">이 표에서는 환급률이 끝까지 100%에 이르지 않습니다.</b> ' +
    '저축이 아니라 <b>보장</b>을 위한 보험이라는 점을 꼭 함께 말씀해 주세요 — ' +
    '중도에 해지하시면 낸 보험료보다 적게 돌려받으십니다.');
  notes.push('표의 마지막은 <b>' + esc(last.year) + '</b>' + (last.age != null ? ' (' + last.age + '세)' : '') + ' 입니다.');
  h += '<div class="note" style="margin-top:12px">' + notes.join('<br>') + '</div>';

  /* 표 전체 — 지금 고른 줄을 짚어 줍니다 */
  h += '<div class="tscroll" style="margin-top:14px;max-height:460px;overflow:auto">' +
    '<table class="dt"><tr><th style="width:90px">경과</th><th style="width:70px">나이</th>' +
    '<th>낸 보험료</th><th>해약환급금</th><th style="width:80px">환급률</th><th>사망시 지급액</th><th style="width:90px">구분</th></tr>' +
    table.map(function (x) {
      const on = hit.exact ? x.m === m : (hit.between && (x === hit.between[0] || x === hit.between[1]));
      const rt = x.rate != null ? x.rate : (x.paid ? (x.cv || 0) / x.paid * 100 : null);
      return '<tr' + (on ? ' style="background:var(--rosebg);font-weight:700"' : '') + '>' +
        '<td>' + esc(x.year) + '</td><td>' + (x.age == null ? '-' : x.age + '세') + '</td>' +
        '<td style="text-align:right">' + wonOrDash(x.paid) + '</td>' +
        '<td style="text-align:right">' + wonOrDash(x.cv) + '</td>' +
        '<td style="text-align:right">' + (rt == null ? '-' : rt.toFixed(1) + '%') + '</td>' +
        '<td style="text-align:right">' + wonOrDash(x.death) + '</td>' +
        '<td>' + esc(x.mark) + '</td></tr>';
    }).join('') + '</table></div>';

  box.innerHTML = h;
}

/* 자주 보는 시점으로 바로 옮기기 */
function cashJump(kind) {
  const rec = collect();
  const table = Engine.cashTable(rec, cashPlanName());
  if (!table.length) { toast('먼저 해약환급금 예시표를 넣어 주세요.', true); return; }
  const info = cashPlanInfo(cashPlanName());
  let target = null;
  if (kind === 'now') {
    if (!info.join) { toast('계약일을 넣으시면 지금 시점을 셀 수 있습니다.', true); return; }
    const d = new Date(todayStr + 'T00:00:00'), j = new Date(info.join + 'T00:00:00');
    target = Math.max(0, (d.getFullYear() - j.getFullYear()) * 12 + (d.getMonth() - j.getMonth()));
  } else if (kind === 'payend') {
    const r = Engine.marked(table, '납입완료');
    if (!r) { toast('표에 «납입완료» 로 표시된 줄이 없습니다.', true); return; }
    target = r.m;
  } else if (kind === 'even') {
    const r = Engine.breakEven(table);
    if (!r) { toast('이 표에서는 환급률이 100%에 이르지 않습니다.', true); return; }
    target = r.m;
  } else if (kind === 'last') {
    target = table[table.length - 1].m;
  }
  if (target == null) return;
  $('cashYear').value = Math.floor(target / 12);
  $('cashAge').value = '';
  drawCash();
}

/* ===================== 📄 상품제안서 불러오기 ===================== */

let impReady = null;

function impShow(on) {
  const c = $('impCard');
  if (c) c.style.display = on ? '' : 'none';
  if (!on) { impReady = null; $('impMsg').innerHTML = ''; $('btnImpApply').style.display = 'none'; }
}

function impRead() {
  const r = Importer.parse(V('impText') || $('impText').value);
  const msg = $('impMsg');
  if (!r.ok) {
    impReady = null;
    $('btnImpApply').style.display = 'none';
    msg.innerHTML = '<div class="warn"><b>읽지 못했습니다.</b><br>' + esc(r.error) +
      '<br><span class="gsub">설계 코드 전체({ 부터 } 까지)를 그대로 붙여넣으셨는지 확인해 주세요.</span></div>';
    return;
  }
  const rec = Importer.toRecord(r.data);
  impReady = rec;
  const sm = rec.summary;
  let h = '<div class="note"><b>이렇게 들어갑니다</b><br>' +
    (sm.cust ? '고객 : <b>' + esc(sm.cust) + '</b><br>' : '') +
    '보험 <b>' + sm.plans + '건</b> · 특약 <b>' + sm.riders + '건</b> · 해약환급금 예시표 <b>' + sm.cash + '줄</b>' +
    (sm.prem ? '<br>보험료 합계 <b>' + won(Math.round(sm.prem)) + '원</b>' : '') + '</div>';
  h += '<div class="tscroll" style="margin-top:10px;max-height:300px;overflow:auto"><table class="dt">' +
    '<tr><th style="width:70px">구분</th><th class="l">이름</th><th style="width:110px">가입금액</th><th style="width:110px">보험료</th></tr>' +
    rec.rows.plans.map(function (x) {
      return '<tr><td>주계약</td><td class="l">' + esc(x.name) + '</td>' +
        '<td style="text-align:right">' + (x.amt === '' ? '-' : won(x.amt) + '만원') + '</td>' +
        '<td style="text-align:right">' + (x.prem === '' ? '-' : won(x.prem) + '원') + '</td></tr>';
    }).join('') +
    rec.rows.riders.map(function (x) {
      return '<tr><td>특약</td><td class="l">' + esc(x.name) + '</td>' +
        '<td style="text-align:right">' + (x.amt === '' ? '-' : won(x.amt) + '만원') + '</td>' +
        '<td style="text-align:right">' + (x.prem === '' ? '-' : won(x.prem) + '원') + '</td></tr>';
    }).join('') + '</table></div>';
  if (sm.warn.length) h += '<div class="warn" style="margin-top:10px">' + sm.warn.map(esc).join('<br>') + '</div>';
  h += '<div class="hint" style="margin-top:10px">[✔ 이대로 넣기]를 누르시면 ' +
    '<b>가입설계 · 특약 · 환급금표</b>가 채워지고, 이 제안서의 지급기준이 <b>보험 · 약관</b> 목록에 저장됩니다. ' +
    '지금 화면에 있던 같은 항목은 덮어씁니다.</div>';
  msg.innerHTML = h;
  $('btnImpApply').style.display = '';
}

function impApply() {
  if (!impReady) return;
  const r = impReady;

  /* 1. 이 제안서의 지급기준을 보험 · 약관 목록에 넣습니다 */
  if (r.products && r.products.length) storeProducts(Importer.mergeProducts(loadProducts(), r.products));

  /* 2. 고객 인적사항 — 값이 있는 것만 채웁니다 (이미 적어 두신 것은 지우지 않습니다) */
  Object.keys(r.f).forEach(function (k) {
    const e = $(k);
    if (e && String(r.f[k]).trim()) e.value = r.f[k];
  });

  /* 3. 가입설계 · 특약 · 환급금표 */
  ['plans', 'riders', 'cash'].forEach(function (k) {
    if (r.rows[k] && r.rows[k].length) setRows(k, r.rows[k]);
  });

  moneyRefresh(); fillSelects(document); calcAll(); drawCoverage(); fillCashPlan(); markDirty();
  impShow(false);
  toast('제안서를 불러왔습니다 — 보험 ' + r.summary.plans + '건 · 특약 ' + r.summary.riders + '건');
  tab(2);
}


/* ===================== 알림 ===================== */

function alertHtml(list) {
  if (!list.length) return '<div class="note">알림이 없습니다. 생년월일과 계약일을 넣으시면 자동으로 잡힙니다.</div>';
  return '<table class="dt"><tr><th style="width:110px">날짜</th><th style="width:80px">남은 날</th>' +
    '<th style="width:110px">구분</th><th class="l">내용</th></tr>' +
    list.map(function (a) {
      const col = a.dday < 0 ? 'var(--red)' : a.dday <= 30 ? 'var(--rose)' : 'inherit';
      const dd = a.dday < 0 ? (-a.dday) + '일 지남' : a.dday === 0 ? '오늘' : 'D-' + a.dday;
      return '<tr><td>' + ymd(a.date) + '</td>' +
        '<td style="color:' + col + ';font-weight:700">' + dd + '</td>' +
        '<td>' + esc(a.cat) + '</td>' +
        '<td class="l"><b>' + esc(a.title) + '</b><div class="gsub">' + esc(a.ment) + '</div></td></tr>';
    }).join('') + '</table>';
}

function drawAlerts() {
  const rec = collect();
  const list = Engine.upcoming(Engine.alerts(rec, { today: todayStr }), 400, 60);
  $('alertBox').innerHTML = alertHtml(list);
}

/* ===================== 체크리스트 ===================== */

function chkEl(id) { return $('chk_' + id); }

function renderChecks() {
  const row = function (p) {
    return '<label class="chk" id="lb_' + p.id + '"><input type="checkbox" id="chk_' + p.id + '">' +
      '<span>' + esc(p.t) + '</span>' + (p.etc ? '<input class="etc" id="' + p.etc + '" placeholder="직접 적기">' : '') + '</label>';
  };
  $('prepBox').innerHTML = PREPS.map(row).join('');
  $('extraBox').innerHTML = EXTRAS.map(row).join('');
}

/* ===================== 수집 · 적용 · 저장 ===================== */

function collect() {
  const o = { id: editId, f: {}, chk: {}, rows: allRows() };
  FIELDS.forEach(function (k) {
    const e = $(k);
    if (!e) return;
    o.f[k] = e.hasAttribute('data-money') ? String(numOf(e.value) || '') : String(e.value || '').trim();
  });
  PREPS.concat(EXTRAS).forEach(function (p) { const e = chkEl(p.id); o.chk[p.id] = !!(e && e.checked); });
  return o;
}

function apply(o) {
  FIELDS.forEach(function (k) { const e = $(k); if (e) e.value = (o.f && o.f[k] != null) ? o.f[k] : ''; });
  PREPS.concat(EXTRAS).forEach(function (p) { const e = chkEl(p.id); if (e) e.checked = !!(o.chk && o.chk[p.id]); });
  const rows = o.rows || {};
  RSETS.forEach(function (s) { setRows(s.key, rows[s.key]); });
  moneyRefresh(); calcAll(); drawCoverage(); fillCashPlan(); drawCash(); saveDraft();
}

function resetAll() {
  FIELDS.forEach(function (k) { const e = $(k); if (e) { e.value = ''; e.dataset.autoval = ''; } });
  PREPS.concat(EXTRAS).forEach(function (p) { const e = chkEl(p.id); if (e) e.checked = false; });
  RSETS.forEach(function (s) { setRows(s.key, []); });
  editId = null;
  $('saveState').textContent = '';
  initDefaults(); calcAll(); drawCoverage(); fillCashPlan(); drawCash();
}

function initDefaults() {
  let fp = '교보생명 평촌지점 추진이 FP';
  try { if (STORE && STORE.getItem(FP_KEY)) fp = STORE.getItem(FP_KEY); } catch (e) { /* 무시 */ }
  if (!V('h_fp')) $('h_fp').value = fp;
  if (!V('h_date')) $('h_date').value = todayStr;
}

function loadAll() {
  try { return JSON.parse((STORE && STORE.getItem(KEY)) || '[]') || []; } catch (e) { return []; }
}
function saveAll(list) {
  if (!STORE) { toast('이 화면에서는 저장이 막혀 있습니다. 파일을 직접 열어 주세요.', true); return false; }
  try { STORE.setItem(KEY, JSON.stringify(list)); return true; }
  catch (e) { toast('저장 공간이 부족합니다. 오래된 고객을 정리해 주세요.', true); return false; }
}

function saveRecord() {
  const rec = collect();
  if (!rec.f.h_cust) { toast('고객 성명을 넣어 주세요.', true); tab(1); $('h_cust').focus(); return; }
  const list = loadAll();
  const now = new Date().toISOString();
  const idx = editId ? list.findIndex(function (x) { return x.id === editId; }) : -1;
  let saved;
  if (idx >= 0) {
    saved = list[idx];
    saved.f = rec.f; saved.chk = rec.chk; saved.rows = rec.rows; saved.savedAt = now;
  } else {
    const maxId = list.reduce(function (m, x) { return Math.max(m, +x.id || 0); }, 0);
    saved = { id: maxId + 1, f: rec.f, chk: rec.chk, rows: rec.rows, savedAt: now, createdAt: now };
    list.push(saved);
  }
  if (!saveAll(list)) return;
  editId = saved.id;
  $('saveState').textContent = '저장 완료 · ' + rec.f.h_cust + ' 님';
  $('saveState').style.color = 'var(--rose)';
  toast(rec.f.h_cust + ' 님을 저장했습니다.');
  saveDraft();
}

/* ===================== 임시 보관 ===================== */

let draftTimer = null;
function markDirty() { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 500); }
function saveDraft() {
  if (!STORE) return;
  try {
    const d = collect();
    d.draftAt = new Date().toISOString();
    STORE.setItem(DRAFT, JSON.stringify(d));
  } catch (e) { /* 무시 */ }
}
function restoreDraft() {
  if (!STORE) return;
  let d;
  try { d = JSON.parse(STORE.getItem(DRAFT) || 'null'); } catch (e) { return; }
  if (!d || !d.f || !String(d.f.h_cust || '').trim()) return;
  apply(d); editId = d.id || null;
  const bar = $('restoreBar');
  bar.style.display = 'block';
  bar.innerHTML = '<b>이전에 쓰시던 내용을 그대로 불러왔습니다.</b> — ' + esc(d.f.h_cust) + ' 님 ' +
    '<button type="button" class="b b-sub sm" style="margin-left:6px" id="btnNew2">새 고객으로 시작</button>';
  $('btnNew2').addEventListener('click', newRecord);
}
function newRecord() {
  if (!confirm('지금 화면 내용을 비우고 새로 시작할까요?\n\n저장해 두신 고객은 그대로 남습니다.')) return;
  resetAll();
  try { STORE.removeItem(DRAFT); } catch (e) { /* 무시 */ }
  $('restoreBar').style.display = 'none';
}

/* ===================== ② 청구내역 요약 ===================== */

function drawClaimSum() {
  const rows = getRows('claims');
  if (!rows.length) { $('claimSum').innerHTML = ''; return; }
  const c = Schema.sumNum(rows, 'claimamt'), p = Schema.sumNum(rows, 'payamt');
  const wait = rows.filter(function (r) { return !r.paydt; }).length;
  $('claimSum').innerHTML = '<div class="warn"><b>청구 ' + rows.length + '건</b> · 청구금액 ' + won(c) + '원 · ' +
    '지급 ' + won(p) + '원' + (wait ? ' · <b style="color:var(--red)">아직 지급 안 된 건 ' + wait + '건</b>' : '') + '</div>';
}

/* ===================== ⑤ 저장 목록 · 통계 ===================== */

function drawDB() {
  const q = V('q').trim();
  const list = loadAll().filter(function (r) {
    if (!q) return true;
    return String(r.f.h_cust || '').indexOf(q) >= 0 ||
      String(Schema.ledgerValue(r, '_planNames') || '').indexOf(q) >= 0;
  }).sort(function (a, b) { return String(b.savedAt || '').localeCompare(String(a.savedAt || '')); });

  if (!list.length) { $('dbBox').innerHTML = '<div class="note">저장된 고객이 없습니다.</div>'; return; }
  $('dbBox').innerHTML = '<table class="dt"><tr><th>저장일</th><th>고객</th><th>보험</th><th>월보험료</th>' +
    '<th>특약</th><th>등급</th><th>차기방문</th><th class="noprint">관리</th></tr>' +
    list.map(function (r) {
      return '<tr><td>' + String(r.savedAt || '').slice(0, 10) + '</td>' +
        '<td><b>' + esc(r.f.h_cust || '-') + '</b></td>' +
        '<td class="l">' + esc(Schema.ledgerValue(r, '_planNames') || '-') + '</td>' +
        '<td style="text-align:right">' + won(Schema.ledgerValue(r, '_prem')) + '</td>' +
        '<td>' + Schema.ledgerValue(r, '_riders') + '건</td>' +
        '<td>' + esc(r.f.m_grade || '-') + '</td>' +
        '<td>' + (ymd(r.f.m_next) || '-') + '</td>' +
        '<td class="noprint"><button class="b b-sub sm" data-pick="' + r.id + '">불러오기</button> ' +
        '<button class="b b-sub sm" data-xls="' + r.id + '">엑셀</button> ' +
        '<button class="b b-red sm" data-del="' + r.id + '">삭제</button></td></tr>';
    }).join('') + '</table>';
}

function drawStat() {
  const list = loadAll();
  const plans = list.reduce(function (s, r) { return s + Schema.rowsOf(r, 'plans').length; }, 0);
  const prem = list.reduce(function (s, r) { return s + Schema.ledgerValue(r, '_prem'); }, 0);
  const riders = list.reduce(function (s, r) { return s + Schema.rowsOf(r, 'riders').length; }, 0);
  const pay = list.reduce(function (s, r) { return s + Schema.ledgerValue(r, '_payamt'); }, 0);
  $('s_kpi').innerHTML =
    '<div><div class="n">' + list.length + '</div><div class="t">관리 고객 수</div></div>' +
    '<div><div class="n">' + plans + '</div><div class="t">보험 건수</div></div>' +
    '<div><div class="n">' + riders + '</div><div class="t">특약 건수</div></div>' +
    '<div><div class="n" style="color:var(--rose)">' + won(prem) + '<span style="font-size:13px">원</span></div><div class="t">월보험료 합계</div></div>' +
    '<div><div class="n" style="color:var(--grn)">' + won(pay) + '<span style="font-size:13px">원</span></div><div class="t">보험금 지급 누계</div></div>';

  /* 전체 고객의 30일 안쪽 알림 */
  const all = [];
  list.forEach(function (r) {
    Engine.upcoming(Engine.alerts(r, { today: todayStr }), 30, 7).forEach(function (a) {
      all.push({ cust: r.f.h_cust || '-', a: a });
    });
  });
  all.sort(function (x, y) { return x.a.dday - y.a.dday; });
  $('s_alert').innerHTML = all.length
    ? '<table class="dt"><tr><th style="width:110px">날짜</th><th style="width:80px">남은 날</th><th style="width:110px">고객</th>' +
      '<th style="width:110px">구분</th><th class="l">내용</th></tr>' +
      all.map(function (x) {
        const col = x.a.dday < 0 ? 'var(--red)' : x.a.dday <= 30 ? 'var(--rose)' : 'inherit';
        const dd = x.a.dday < 0 ? (-x.a.dday) + '일 지남' : x.a.dday === 0 ? '오늘' : 'D-' + x.a.dday;
        return '<tr><td>' + ymd(x.a.date) + '</td><td style="color:' + col + ';font-weight:700">' + dd + '</td>' +
          '<td><b>' + esc(x.cust) + '</b></td><td>' + esc(x.a.cat) + '</td><td class="l">' + esc(x.a.title) + '</td></tr>';
      }).join('') + '</table>'
    : '<div class="note">30일 안쪽에 챙길 알림이 없습니다.</div>';

  const months = {};
  list.forEach(function (r) {
    const k = String(Schema.ledgerValue(r, '_join') || r.f.h_date || r.createdAt || '').slice(0, 7);
    if (k) months[k] = (months[k] || 0) + 1;
  });
  const ks = Object.keys(months).sort();
  const mx = Math.max.apply(null, [1].concat(ks.map(function (k) { return months[k]; })));
  $('s_month').innerHTML = ks.length
    ? '<table class="dt"><tr><th style="width:22%">월</th><th style="width:14%">신규</th><th>추이</th></tr>' +
      ks.map(function (k) {
        return '<tr><td>' + k.replace('-', '년 ') + '월</td><td>' + months[k] + '명</td>' +
          '<td><div class="bar"><i style="width:' + (months[k] / mx * 100) + '%;background:var(--rose)"></i></div></td></tr>';
      }).join('') + '</table>'
    : '<div class="note">계약일 정보가 없습니다.</div>';
}

document.addEventListener('click', function (e) {
  const p = e.target.closest('[data-pick]');
  if (p) {
    const r = loadAll().filter(function (x) { return x.id === +p.dataset.pick; })[0];
    if (r) { apply(r); editId = r.id; toast((r.f.h_cust || '') + ' 님을 불러왔습니다.'); tab(1); }
    return;
  }
  const d = e.target.closest('[data-del]');
  if (d) {
    if (!confirm('이 고객 기록을 삭제할까요?')) return;
    const id = +d.dataset.del;
    saveAll(loadAll().filter(function (x) { return x.id !== id; }));
    if (editId === id) editId = null;
    drawDB(); drawStat(); toast('삭제했습니다.');
    return;
  }
  const x = e.target.closest('[data-xls]');
  if (x) {
    const r = loadAll().filter(function (y) { return y.id === +x.dataset.xls; })[0];
    if (r) downloadXlsx(r);
  }
});

/* ===================== 엑셀 · 백업 ===================== */

const S = { title: 1, sec: 2, head: 3, label: 4, val: 5, valNum: 6, hint: 7, group: 8, wrap: 9, num: 12 };

function saveBlob(blob, filename, msg) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
  if (msg) toast(msg + ' — ' + filename);
}

function stamp() {
  const d = new Date();
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
}

function sheetOf(set, rows) {
  const out = [];
  out.push([{ v: set.label, s: S.title }]);
  out.push([]);
  out.push([{ v: 'No', s: S.head }].concat(set.cols.map(function (c) {
    return { v: c.label + (c.unit ? '(' + c.unit + ')' : ''), s: S.head };
  })));
  const n = Math.max(set.rows + 2, rows.length + 2);
  for (let i = 0; i < n; i++) {
    const v = rows[i];
    out.push([{ v: i + 1, s: S.label, n: true }].concat(set.cols.map(function (c) {
      const raw = v ? v[c.k] : '';
      const has = raw !== undefined && raw !== null && String(raw).trim() !== '';
      if (c.type === 'number') return { v: has ? numOf(raw) : '', s: S.valNum, n: true };
      return { v: has ? String(raw) : '', s: S.val };
    })));
  }
  return { name: set.sheet, cols: [{ w: 6 }].concat(set.cols.map(function (c) { return { w: c.w || 18 }; })), rows: out };
}

function downloadXlsx(rec) {
  const sheets = [];
  const info = [[{ v: '계약자 관리 — ' + (rec.f.h_cust || '') + ' 님', s: S.title }], []];
  Schema.SECTIONS.forEach(function (sec) {
    info.push([{ v: (sec.no ? sec.no + '. ' : '') + sec.title, s: S.sec }]);
    sec.fields.forEach(function (fd) {
      info.push([{ v: fd.label, s: S.label }, { v: String(rec.f[fd.k] || ''), s: S.val }]);
    });
    info.push([]);
  });
  sheets.push({ name: '고객정보', cols: [{ w: 26 }, { w: 40 }], rows: info });
  RSETS.forEach(function (set) { sheets.push(sheetOf(set, Schema.pruneRows(set, (rec.rows || {})[set.key]))); });

  /* 보장 요약 */
  const cov = Engine.coverage(rec, { today: todayStr, dict: loadDict(), products: loadProducts() });
  const cr = [[{ v: '보장 설명 (참고용 — 약관 확인 필요)', s: S.title }], [],
    [{ v: '구분', s: S.head }, { v: '특약 · 주계약', s: S.head }, { v: '가입금액(만원)', s: S.head },
      { v: '보험료(원)', s: S.head }, { v: '쉬운 설명', s: S.head }, { v: '보장영역', s: S.head },
      { v: '증상별 보장금액', s: S.head }, { v: '보장시작 · 감액 · 갱신 · 한도', s: S.head }]];
  covRows(cov).forEach(function (c) {
    cr.push([
      { v: c.main ? '주계약' : (c.plan || '특약'), s: S.label },
      { v: c.name, s: S.val },
      { v: c.amt || '', s: S.valNum, n: true },
      { v: numOf(c.prem) || '', s: S.valNum, n: true },
      { v: c.easy || '', s: S.wrap },
      { v: c.areas.join('\n'), s: S.wrap },
      { v: c.pays.map(function (p) { return p.when + ' → ' + manwon(p.amount) + (p.per ? '(' + p.per + ')' : ''); }).join('\n'), s: S.wrap },
      { v: covWhen(c).map(function (w) { return w.k + ' : ' + w.v + (w.sub ? ' — ' + w.sub : ''); }).join('\n'), s: S.wrap }
    ]);
  });
  sheets.push({ name: '보장설명',
    cols: [{ w: 14 }, { w: 26 }, { w: 13 }, { w: 12 }, { w: 44 }, { w: 40 }, { w: 34 }, { w: 44 }], rows: cr });

  /* 환급금 요약 — 짚어 드릴 만한 시점만 따로 */
  const cashSheet = [[{ v: '해약환급금 — 상품제안서 예시표에서 찾은 금액', s: S.title }], [],
    [{ v: '보험', s: S.head }, { v: '시점', s: S.head }, { v: '경과', s: S.head }, { v: '나이', s: S.head },
      { v: '낸 보험료', s: S.head }, { v: '해약환급금', s: S.head }, { v: '환급률(%)', s: S.head },
      { v: '사망시 지급액', s: S.head }]];
  Schema.pruneRows(RSMAP.plans, (rec.rows || {}).plans).forEach(function (p) {
    const tb = Engine.cashTable(rec, p.name);
    if (!tb.length) return;
    const marks = [['납입 완료', Engine.marked(tb, '납입완료')], ['만기', Engine.marked(tb, '만기')],
      ['낸 돈만큼 되는 때', Engine.breakEven(tb)], ['표의 마지막', tb[tb.length - 1]]];
    marks.forEach(function (m) {
      if (!m[1]) return;
      const x = m[1];
      cashSheet.push([{ v: p.name, s: S.val }, { v: m[0], s: S.label }, { v: x.year, s: S.val },
        { v: x.age == null ? '' : x.age, s: S.valNum, n: true },
        { v: x.paid == null ? '' : x.paid, s: S.valNum, n: true },
        { v: x.cv == null ? '' : x.cv, s: S.valNum, n: true },
        { v: x.rate == null ? '' : x.rate, s: S.valNum, n: true },
        { v: x.death == null ? '' : x.death, s: S.valNum, n: true }]);
    });
  });
  if (cashSheet.length > 3) {
    sheets.push({ name: '환급금요약',
      cols: [{ w: 32 }, { w: 18 }, { w: 11 }, { w: 8 }, { w: 16 }, { w: 16 }, { w: 11 }, { w: 16 }], rows: cashSheet });
  }

  /* 알림 */
  const al = Engine.alerts(rec, { today: todayStr });
  const ar = [[{ v: '알림 — 챙겨야 할 날', s: S.title }], [],
    [{ v: '날짜', s: S.head }, { v: '남은 날', s: S.head }, { v: '구분', s: S.head }, { v: '내용', s: S.head }]];
  al.forEach(function (a) {
    ar.push([{ v: a.date, s: S.val }, { v: a.dday < 0 ? (-a.dday) + '일 지남' : 'D-' + a.dday, s: S.val },
      { v: a.cat, s: S.val }, { v: a.title, s: S.wrap }]);
  });
  sheets.push({ name: '알림', cols: [{ w: 14 }, { w: 12 }, { w: 14 }, { w: 50 }], rows: ar });

  saveBlob(Xlsx.build(sheets), 'Policyholder-' + rec.id + '-' + stamp() + '.xlsx', '엑셀 파일을 저장했습니다');
}

function ledgerXlsx() {
  const list = loadAll();
  const rows = [Schema.LEDGER_COLS.map(function (c) { return { v: c.label, s: S.head }; })];
  list.forEach(function (r) {
    rows.push(Schema.LEDGER_COLS.map(function (c) {
      const v = Schema.ledgerValue(r, c.k);
      return typeof v === 'number' ? { v: v, s: S.num, n: true } : { v: v || '', s: S.label };
    }));
  });
  saveBlob(Xlsx.build([{ name: '데이터', cols: Schema.LEDGER_COLS.map(function () { return { w: 18 }; }), rows: rows }]),
    'Policyholder-Ledger-' + stamp() + '.xlsx', '누적 관리대장을 저장했습니다');
}

function csvText() {
  const e = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"'; };
  let csv = '﻿' + Schema.LEDGER_COLS.map(function (c) { return c.label; }).join(',') + '\n';
  loadAll().forEach(function (r) {
    csv += Schema.LEDGER_COLS.map(function (c) {
      const v = Schema.ledgerValue(r, c.k);
      return typeof v === 'number' ? v : e(v);
    }).join(',') + '\n';
  });
  return csv;
}

function restoreBackup(input) {
  const file = input.files[0];
  if (!file) return;
  file.text().then(function (text) {
    input.value = '';
    let json;
    try { json = JSON.parse(text); } catch (e) { toast('백업 파일을 읽을 수 없습니다.', true); return; }
    const recs = json.records || json;
    if (!Array.isArray(recs)) { toast('백업 파일 형식이 아닙니다.', true); return; }
    const list = loadAll();
    let maxId = list.reduce(function (m, x) { return Math.max(m, +x.id || 0); }, 0);
    let added = 0;
    recs.forEach(function (r) {
      if (!r || !r.f || !String(r.f.h_cust || '').trim()) return;
      maxId++; added++;
      list.push({ id: maxId, f: r.f, chk: r.chk || {}, rows: r.rows || {}, savedAt: r.savedAt || new Date().toISOString(), createdAt: r.createdAt || r.savedAt });
    });
    saveAll(list); drawDB(); drawStat();
    toast('복원 완료 — ' + added + '명 추가');
  });
}

/* ===================== 시작 ===================== */

renderChecks();
renderRowsets();
RSETS.forEach(function (s) { setRows(s.key, []); });
enhanceDates(); enhanceMoney();
initDefaults(); calcAll(); drawCoverage();

$('btnSave').addEventListener('click', saveRecord);
$('btnNew').addEventListener('click', newRecord);
$('btnCalc').addEventListener('click', function () { calcAll(); drawCoverage(); toast('보장 설명을 다시 정리했습니다.'); });
$('btnCovMode').addEventListener('click', function () {
  covMode = (covMode === 'card') ? 'table' : 'card';
  this.textContent = (covMode === 'card') ? '표로 보기' : '카드로 보기';
  drawCoverage();
});
$('btnPrintCov').addEventListener('click', function () { window.print(); });

/* ---------- 📄 상품제안서 불러오기 ---------- */
$('btnImpOpen').addEventListener('click', function () {
  const on = $('impCard').style.display === 'none';
  impShow(on);
  if (on) $('impText').focus();
});
$('btnImpClose').addEventListener('click', function () { impShow(false); });
$('btnImpRead').addEventListener('click', impRead);
$('btnImpApply').addEventListener('click', impApply);
$('btnImpSample').addEventListener('click', function () {
  impShow(true);
  $('impText').value = JSON.stringify(Importer.SAMPLE, null, 2);
  impRead();
  $('impCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

/* ---------- ③ 환급금 ---------- */
$('cashPlan').addEventListener('change', function () { $('cashYear').value = ''; $('cashAge').value = ''; drawCash(); });
$('cashYear').addEventListener('input', function () { $('cashAge').value = ''; drawCash(); });
$('cashAge').addEventListener('input', function () { $('cashYear').value = ''; drawCash(); });
document.addEventListener('click', function (e) {
  const b = e.target.closest && e.target.closest('[data-cashjump]');
  if (b) { e.preventDefault(); cashJump(b.dataset.cashjump); }
});
$('btnAlert').addEventListener('click', function () { drawAlerts(); toast('알림을 다시 계산했습니다.'); });
/* ---------- 보험 · 약관 편집기 단추 ---------- */
$('btnProd').addEventListener('click', function () {
  drawProd(); $('prodCard').style.display = 'block'; $('prodCard').scrollIntoView({ behavior: 'smooth' });
});
$('btnProdClose').addEventListener('click', function () { $('prodCard').style.display = 'none'; });
$('prodPick').addEventListener('change', function () { PRODIDX = +this.value || 0; drawProd(); });
$('btnProdSave').addEventListener('click', function () {
  storeProducts(collectProd()); drawProd(); toast('보험 · 약관을 저장했습니다.');
});
$('btnProdAdd').addEventListener('click', function () {
  const list = collectProd();
  list.push({ key: 'user' + list.length, name: '새 보험 ' + (list.length + 1), note: '', main: { name: '주계약' }, riders: [] });
  PRODIDX = list.length - 1;
  storeProducts(list); drawProd();
});
$('btnProdRider').addEventListener('click', function () {
  const list = collectProd();
  const p = list[PRODIDX];
  if (!p) return;
  p.riders = (p.riders || []).concat([{ name: '' }]);
  storeProducts(list); drawProd();
});
$('btnProdDel').addEventListener('click', function () {
  const list = collectProd();
  if (list.length <= 1) { toast('보험이 하나뿐이라 지울 수 없습니다.'); return; }
  if (!confirm('「' + (list[PRODIDX] || {}).name + '」 을(를) 목록에서 지울까요?')) return;
  list.splice(PRODIDX, 1); PRODIDX = 0;
  storeProducts(list); drawProd();
});
$('btnProdReset').addEventListener('click', function () {
  if (!confirm('보험 · 약관을 처음 상태로 되돌릴까요? 직접 넣으신 값은 사라집니다.')) return;
  try { STORE.removeItem(PROD); } catch (e) { /* 무시 */ }
  PRODCACHE = null; PRODIDX = 0;
  fillSelects(document); drawProd(); drawCoverage();
  toast('기본값으로 되돌렸습니다.');
});
document.addEventListener('click', function (e) {
  const b = e.target.closest && e.target.closest('[data-pdel]');
  if (!b) return;
  const list = collectProd(), p = list[PRODIDX];
  if (!p) return;
  const i = +b.dataset.pdel - (p.main ? 1 : 0);
  (p.riders || []).splice(i, 1);
  storeProducts(list); drawProd();
});

$('btnDict').addEventListener('click', function () { drawDict(); $('dictCard').style.display = 'block'; $('dictCard').scrollIntoView({ behavior: 'smooth' }); });
$('btnDictClose').addEventListener('click', function () { $('dictCard').style.display = 'none'; });
$('btnDictSave').addEventListener('click', saveDict);
$('btnDictReset').addEventListener('click', function () {
  if (!confirm('특약 사전을 기본값으로 되돌릴까요?')) return;
  try { STORE.removeItem(DICT); } catch (e) { /* 무시 */ }
  drawDict(); drawCoverage(); toast('기본값으로 되돌렸습니다.');
});
$('btnReload').addEventListener('click', function () { drawDB(); drawStat(); });
$('q').addEventListener('input', function () { clearTimeout(window.__qt); window.__qt = setTimeout(drawDB, 250); });
$('btnBackup').addEventListener('click', function () {
  saveBlob(new Blob([JSON.stringify({ ver: 1, app: 'newcust', exportedAt: new Date().toISOString(), records: loadAll() }, null, 2)],
    { type: 'application/json' }), 'Policyholder-Backup-' + stamp() + '.json', '백업 파일을 저장했습니다');
});
$('btnRestorePick').addEventListener('click', function () { $('rf').click(); });
$('rf').addEventListener('change', function () { restoreBackup(this); });
$('btnCsv').addEventListener('click', function () {
  saveBlob(new Blob([csvText()], { type: 'text/csv;charset=utf-8' }), 'Policyholder-' + stamp() + '.csv', 'CSV 파일을 저장했습니다');
});
$('btnLedger').addEventListener('click', ledgerXlsx);
$('btnWipe').addEventListener('click', function () {
  if (!confirm('저장된 모든 고객을 삭제합니다. 되돌릴 수 없습니다. 계속할까요?')) return;
  if (!confirm('정말 삭제할까요? 먼저 [전체 백업 파일 저장]을 하시길 권합니다.')) return;
  saveAll([]); editId = null; drawDB(); drawStat(); toast('전체 삭제했습니다.');
});
$('h_fp').addEventListener('change', function () {
  try { if (V('h_fp')) STORE.setItem(FP_KEY, V('h_fp')); } catch (e) { /* 무시 */ }
});
$('p_birth').addEventListener('change', calcAll);
$('p_birth').addEventListener('blur', function () { setTimeout(calcAll, 0); });

document.addEventListener('input', function (e) {
  if (e.target.closest && e.target.closest('#rsb_plans')) calcPlans();
}, true);
/* 드롭다운 — '직접 입력' 을 고르면 글자칸으로 바꾸고, 보험명을 바꾸면 특약 목록을 다시 채웁니다 */
document.addEventListener('change', function (e) {
  const el = e.target;
  if (!el || el.tagName !== 'SELECT' || !el.dataset || !el.dataset.opt) return;
  if (el.value === CUSTOM) { toTextInput(el); return; }
  el.dataset.val = el.value;
  const tr = el.closest('tr');
  if (el.dataset.col === 'plan' && tr) {                 /* 특약 줄에서 보험을 바꿨을 때 */
    const nm = tr.querySelector('select[data-col="name"], input[data-col="name"]');
    if (nm && nm.tagName === 'SELECT') { nm.dataset.val = ''; fillSelect(nm, tr); }
  }
  if (el.dataset.col === 'name' && el.closest('#rsb_plans')) {   /* 보험 줄에서 보험을 바꿨을 때 */
    const prod = Products.find(loadProducts(), el.value);
    const main = tr && tr.querySelector('[data-col="main"]');
    if (prod && prod.main && main && !String(main.value || '').trim()) main.value = prod.main.name;
    fillSelects($('rsb_riders'));
  }
}, true);

document.addEventListener('change', function (e) {
  const t = e.target.closest && e.target.closest('#rsb_plans, #rsb_riders, #rsb_cash');
  if (!t) return;
  if (t.id !== 'rsb_cash') { calcPlans(); drawCoverage(); }
  fillCashPlan();
  if ($('p3') && $('p3').classList.contains('on')) drawCash();
}, true);
document.addEventListener('input', markDirty, true);
document.addEventListener('change', markDirty, true);
window.addEventListener('pagehide', function () { clearTimeout(draftTimer); saveDraft(); });

/* 예시 */
$('btnDemo').addEventListener('click', function () {
  resetAll();
  const v = {
    h_cust: '이서연', h_date: todayStr,
    p_birth: '1988-04-12', p_sex: '여', p_phone: '010-1234-5678', p_email: 'seoyeon@example.com',
    p_job: '초등교사', p_addr: '안양시 동안구 평촌대로 100', p_anniv: '결혼기념일 09-18',
    p_family: '배우자 · 자녀 2명(7세 · 4세)', p_route: '지인 소개', p_pay: '카드 / 매월 25일',
    m_grade: 'A', m_next: Engine.addDays(todayStr, 30), m_req: '자녀 보장도 함께 봐 주세요'
  };
  Object.keys(v).forEach(function (k) { if ($(k)) $(k).value = v[k]; });
  setRows('plans', [
    { name: '교보 K-실속종신보험 (무배당)', insured: '본인', join: todayStr, main: '사망보험금', amt: '10000', prem: '187000', payterm: '20년납', insterm: '종신' },
    { name: '교보 K-밸류업종신보험 (무배당)', insured: '본인', join: todayStr, main: '사망보험금', amt: '3000', prem: '52000', payterm: '20년납', insterm: '종신' }
  ]);
  setRows('riders', [
    { plan: '교보 K-실속종신보험 (무배당)', name: 'New(무)암진단특약(갱신형)Ⅱ', amt: '3000', payterm: '20년납', insterm: '80세만기' },
    { plan: '교보 K-실속종신보험 (무배당)', name: '(무)교보뇌혈관질환진단특약(갱신형)Ⅱ', amt: '2000', payterm: '20년납', insterm: '80세만기' },
    { plan: '교보 K-실속종신보험 (무배당)', name: '(무)입원특약Ⅲ', amt: '1000', payterm: '20년납', insterm: '80세만기' },
    { plan: '교보 K-밸류업종신보험 (무배당)', name: '(무)교보재해골절특약', amt: '100', payterm: '20년납', insterm: '80세만기' }
  ]);
  setRows('talks', [{ date: todayStr, note: '신규 가입 · 증권 전달 예정' }]);
  setRows('follows', [{ what: '증권 전달 및 보장내용 설명', due: Engine.addDays(todayStr, 14) }]);
  setRows('touches', [{ date: todayStr, how: '방문', what: '청약 · 자필서명', react: '만족' }]);
  moneyRefresh(); calcAll(); drawCoverage(); saveDraft();
  toast('예시를 넣었습니다. ③ 보장 요약과 ④ 고객터치를 보세요.');
});

restoreDraft();
