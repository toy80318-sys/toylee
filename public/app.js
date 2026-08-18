/*
 * 화면 동작 — 입력 · 자동계산 · 진단 · 저장 · 엑셀
 * 진단 로직은 서버와 같은 파일(/shared/analysis.js)을 씁니다.
 */
'use strict';

const Calc = KB.Calc, Schema = KB.Schema, Analysis = KB.Analysis;
const $ = function (id) { return document.getElementById(id); };
const V = function (id) { const e = $(id); return e ? String(e.value || '').trim() : ''; };
const N = function (id) { return Calc.numOf(V(id)); };
const won = Calc.won, normDate = Calc.normDate, ymd = Calc.ymd, numOf = Calc.numOf;
const todayStr = Calc.todayStr();

const FIELDS = Schema.allFields().map(function (f) { return f.k; });
const PREPS = Schema.PREPS, EXTRAS = Schema.EXTRAS;
const RSETS = Schema.ROWSETS, RSMAP = Schema.rowsetMap();
const DRAFT_KEY = 'kyobo_draft_v3';
const FP_KEY = 'kyobo_fp_v1';
const FP_DEFAULT = '교보생명 평촌지점 추진이 FP';

let RES = null;        // 최근 분석 결과
let editId = null;     // 저장된 기록 id (수정 중일 때)
let DBCACHE = [];      // ④ 탭 목록

/* ===================== 공통 ===================== */

const STORE = (function () {
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return localStorage; }
  catch (e) { return null; }
})();

let toastTimer = null;
function toast(msg, bad) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast on' + (bad ? ' bad' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.className = 'toast'; }, bad ? 4200 : 2400);
}

function netError(msg) {
  const el = $('netWarn');
  el.style.display = 'block';
  el.innerHTML = '<b>서버와 연결하지 못했습니다.</b> ' + msg +
    '<br>입력하신 내용은 이 기기에 임시 보관되어 있으니, 서버가 살아나면 [저장]을 다시 눌러 주세요.';
}

async function api(url, opts) {
  opts = opts || {};
  /* 태블릿용(단일 파일)에서는 서버 대신 브라우저 안에서 처리합니다 */
  if (window.__LOCAL_API) return window.__LOCAL_API(url, opts);
  const init = { method: opts.method || 'GET', headers: {} };
  if (opts.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  if (opts.form) init.body = opts.form;
  const r = await fetch(url, init);
  const ct = r.headers.get('content-type') || '';
  const data = ct.indexOf('application/json') >= 0 ? await r.json() : await r.text();
  if (!r.ok) throw new Error((data && data.error) || ('서버 오류 (' + r.status + ')'));
  $('netWarn').style.display = 'none';
  return data;
}

/* 내려받기 — 서버판은 주소로 이동, 태블릿용은 브라우저에서 직접 파일을 만듭니다 */
function download(path) {
  if (window.__LOCAL_DOWNLOAD) return window.__LOCAL_DOWNLOAD(path);
  window.location = path;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ===================== 탭 ===================== */

function tab(n) {
  for (let i = 1; i <= 5; i++) {
    $('p' + i).classList.toggle('on', i === n);
    $('tb' + i).classList.toggle('on', i === n);
  }
  if (n === 4) drawDB();
  if (n === 5) drawStat();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.addEventListener('click', function (e) {
  const t = e.target.closest('[data-tab]');
  if (t) { e.preventDefault(); tab(+t.dataset.tab); }
});

/* ===================== 날짜 · 금액 입력 도우미 ===================== */

/* 날짜 : 숫자만 쳐도 되고, 📅 단추로 달력에서 고를 수도 있습니다. */
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
    btn.type = 'button';
    btn.className = 'dtbtn';
    btn.textContent = '📅';
    btn.title = '달력에서 고르기';
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
      if (v) el.value = v;
      else if (el.value.trim()) el.style.borderColor = 'var(--red)';
      if (v) el.style.borderColor = '';
    });
  });
}

/* 금액 : 치시는 동안 바로바로 자리 쉼표가 붙습니다 */
function commafy(digits) {
  digits = String(digits).replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
    el.classList.add('num');

    /* 쉼표 바로 뒤에서 지우면 쉼표가 아니라 그 앞 숫자가 지워지도록 */
    el.addEventListener('beforeinput', function (ev) {
      if (ev.inputType !== 'deleteContentBackward') return;
      const s = el.selectionStart, e2 = el.selectionEnd;
      if (s !== e2 || s === 0) return;
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
  (root || document).querySelectorAll('input[data-money]').forEach(function (el) {
    el.value = commafy(el.value);
  });
}

/* ===================== 여러 줄 표 (계약사항 · 사고보험금 …) ===================== */

function rsInput(set, col) {
  const attr = [];
  let cls = 'rsi';
  if (col.type === 'date') attr.push('data-date');
  if (col.type === 'number') {
    if (col.unit === '%') attr.push('type="number"', 'step="0.1"');
    else attr.push('data-money');
  }
  if (col.auto) cls += ' autoval';
  if (col.ph) attr.push('placeholder="' + esc(col.ph) + '"');
  return '<input class="' + cls + '" data-rs="' + set.key + '" data-col="' + col.k + '" ' + attr.join(' ') + '>';
}

function renderRowsets() {
  RSETS.forEach(function (set) {
    const box = $('rs_' + set.key);
    if (!box) return;
    box.innerHTML =
      '<div class="tscroll"><table class="form rs" id="rst_' + set.key + '">' +
      '<thead><tr><th class="rsno">No</th>' +
      set.cols.map(function (c) {
        return '<th' + (c.w ? ' style="width:' + (c.w * 9) + 'px"' : '') + '>' + esc(c.label) +
          (c.unit ? ' <span class="gsub">(' + esc(c.unit) + ')</span>' : '') +
          (c.auto ? ' <span class="gsub">자동</span>' : '') + '</th>';
      }).join('') +
      '<th class="rsx noprint"></th></tr></thead>' +
      '<tbody id="rsb_' + set.key + '"></tbody></table></div>' +
      (set.sub ? '<div class="hint">' + esc(set.sub) + '</div>' : '') +
      '<div class="btns noprint" style="margin-top:6px">' +
      '<button type="button" class="b b-sub sm" data-rsadd="' + set.key + '">' + esc(set.addLabel || '＋ 줄 추가') + '</button></div>';
  });
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
  const set = RSMAP[key];
  const tb = $('rsb_' + key);
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
      el.value = (c.type === 'number' && c.unit === '원') ? commafy(raw) : raw;
    });
  }
  enhanceDates(tr);
  enhanceMoney(tr);
  rsRenumber(key);
  return tr;
}

function getRows(key) {
  const set = RSMAP[key];
  const tb = $('rsb_' + key);
  if (!set || !tb) return [];
  const out = [];
  [].slice.call(tb.children).forEach(function (tr) {
    const o = {};
    set.cols.forEach(function (c) {
      const el = tr.querySelector('[data-col="' + c.k + '"]');
      let v = el ? String(el.value || '').trim() : '';
      if (c.type === 'date') v = normDate(v) || v;
      if (c.type === 'number') v = String(numOf(v) || '');
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

function setRows(key, listIn) {
  const set = RSMAP[key];
  const tb = $('rsb_' + key);
  if (!set || !tb) return;
  tb.innerHTML = '';
  const list = (listIn || []).slice();
  const n = Math.max(set.rows || 1, list.length);
  for (let i = 0; i < n; i++) addRow(key, list[i]);
}

function resetRows() {
  RSETS.forEach(function (s) { setRows(s.key, []); });
}

document.addEventListener('click', function (e) {
  const a = e.target.closest('[data-rsadd]');
  if (a) { e.preventDefault(); addRow(a.dataset.rsadd); markDirty(); return; }
  const d = e.target.closest('.rsdel');
  if (d) {
    e.preventDefault();
    const tr = d.closest('tr'), tb = tr.parentNode;
    const key = tb.id.replace('rsb_', '');
    tr.remove();
    if (!tb.children.length) addRow(key);
    rsRenumber(key);
    calcAll();
    markDirty();
  }
});

/* ===================== 자동 계산 ===================== */

function setAutoVal(el, v) {
  v = String(v);
  if (!el || !el.value.trim() || el.value === el.dataset.autoval) {
    if (el) { el.value = v; el.dataset.autoval = v; }
    return true;
  }
  return false;
}

const AGE_ROWS = [['c_obirth', '계약자', 'c_oja', 'c_ona'], ['c_ibirth', '주피보험자', 'c_ija', 'c_ina']];

/* 계약 표에서 가장 이른 가입일 — 가입연령 계산 기준 */
function firstJoin() {
  const js = getRows('contracts').map(function (c) { return normDate(c.join); }).filter(Boolean).sort();
  return js[0] || '';
}

function calcAges() {
  const join = firstJoin();
  AGE_ROWS.forEach(function (row) {
    const bd = normDate(V(row[0]));
    if (!bd) return;
    if (join) { const r = Calc.insAge(bd, join); if (r) setAutoVal($(row[2]), r.age); }
    const r2 = Calc.insAge(bd, todayStr);
    if (r2) setAutoVal($(row[3]), r2.age);
  });
  const ob = normDate(V('c_obirth'));
  if (ob && !V('p_bday')) $('p_bday').value = ob.slice(5);
  ageMsg();
}

function ageMsg() {
  const el = $('c_ageMsg');
  const join = firstJoin();
  const out = [];
  AGE_ROWS.forEach(function (row) {
    const bd = normDate(V(row[0]));
    if (!bd) return;
    const p = [];
    if (join) {
      const r = Calc.insAge(bd, join);
      if (r) p.push('계약일 기준 <b>' + r.age + '세</b> <span style="color:var(--sub)">(' + r.y + '년 ' + r.m + '개월 → ' +
        (r.up ? '6개월 이상이라 한 살 올림' : '6개월 미만이라 버림') + ')</span>' +
        (V(row[2]) && V(row[2]) !== String(r.age) ? ' <span style="color:var(--org)">— 직접 넣으신 ' + V(row[2]) + '세 유지 중</span>' : ''));
    }
    const r2 = Calc.insAge(bd, todayStr);
    if (r2) p.push('현재 <b>' + r2.age + '세</b>' +
      (V(row[3]) && V(row[3]) !== String(r2.age) ? ' <span style="color:var(--org)">— 직접 넣으신 ' + V(row[3]) + '세 유지 중</span>' : ''));
    if (p.length) out.push('<b>' + row[1] + '</b> ' + bd + ' · ' + p.join(' / '));
  });
  if (out.length) { el.innerHTML = out.join('<br>'); el.style.color = 'var(--grn)'; }
  else {
    el.innerHTML = '생년월일을 넣으시면 회사 기준(계약일 − 생년월일 → 6개월 미만은 버리고, 6개월 이상이면 한 살 올림)으로 가입연령·현재연령이 자동 계산됩니다.';
    el.style.color = '';
  }
}

/* 계약 표의 납입 만료일 · 보험 만기일을 줄마다 자동으로 채웁니다 */
function calcTerms() {
  const tb = $('rsb_contracts');
  if (!tb) return;
  const msgs = [];
  const age = V('c_ija') || V('c_oja');
  [].slice.call(tb.children).forEach(function (tr, i) {
    const get = function (k) {
      const el = tr.querySelector('[data-col="' + k + '"]');
      return el ? String(el.value || '').trim() : '';
    };
    const join = normDate(get('join'));
    if (!join) return;
    const label = get('prod') || (i + 1) + '번 계약';

    const ins = Calc.calcInsEnd(join, get('insterm'), age);
    const insEl = tr.querySelector('[data-col="insend"]');
    if (ins.whole) {
      if (insEl && (!insEl.value.trim() || insEl.value === insEl.dataset.autoval)) { insEl.value = ''; insEl.dataset.autoval = ''; }
      msgs.push('<b>' + esc(label) + '</b> 종신 — 만기가 따로 없어 평생 보장됩니다.');
    } else if (ins.value) {
      const done = setAutoVal(insEl, ins.value);
      msgs.push('<b>' + esc(label) + '</b> 보험 만기일 ' + ins.how + (done ? '' : ' <span style="color:var(--org)">— 직접 넣으신 값 유지 중</span>'));
    } else if (ins.how) {
      msgs.push('<b>' + esc(label) + '</b> ' + esc(ins.how));
    }

    const pay = Calc.calcPayEnd(join, get('payterm'), get('insend'));
    if (pay.value) {
      const done = setAutoVal(tr.querySelector('[data-col="payend"]'), pay.value);
      msgs.push('<b>' + esc(label) + '</b> 납입 만료일 ' + pay.how + (done ? '' : ' <span style="color:var(--org)">— 직접 넣으신 값 유지 중</span>'));
    }
  });
  const el = $('rs_contractsMsg');
  if (!el) return;
  if (msgs.length) { el.innerHTML = msgs.join('<br>'); el.style.color = 'var(--grn)'; }
  else {
    el.innerHTML = '가입일과 납입기간 · 보험기간을 넣으시면 <b>납입 만료일 · 보험 만기일</b>이 자동으로 채워집니다. ' +
      '날짜는 <b>20030514</b> 처럼 숫자만 넣으셔도 되고, 📅 로 달력에서 고르셔도 됩니다.';
    el.style.color = '';
  }
}

function calcAll() { calcAges(); calcTerms(); }

/* ===================== 체크리스트 ===================== */

/* 체크 항목의 입력칸 id : 탭 화면 id(p1~p5) 와 겹치지 않도록 chk_ 를 붙인다 */
function chkEl(id) { return $('chk_' + id); }

function renderChecks() {
  const row = function (p) {
    return '<label class="chk" id="lb_' + p.id + '"><input type="checkbox" id="chk_' + p.id + '">' +
      '<span>' + esc(p.t) + '</span>' +
      (p.etc ? '<input class="etc" id="' + p.etc + '" placeholder="직접 적기">' : '') + '</label>';
  };
  $('prepBox').innerHTML = PREPS.map(row).join('');
  $('extraBox').innerHTML = EXTRAS.map(row).join('');
}

/* ===================== 수집 · 적용 ===================== */

function collect() {
  const o = { id: editId, f: {}, chk: {}, rows: allRows() };
  FIELDS.forEach(function (k) {
    const e = $(k);
    if (!e) return;
    o.f[k] = e.hasAttribute('data-money') ? String(numOf(e.value) || '') : String(e.value || '').trim();
  });
  PREPS.concat(EXTRAS).forEach(function (p) { const e = chkEl(p.id); o.chk[p.id] = !!(e && e.checked); });
  o.money = RES ? RES.money : 0;
  o.hidCnt = RES ? RES.hidCnt : 0;
  return o;
}

function apply(o) {
  FIELDS.forEach(function (k) {
    const e = $(k);
    if (e) e.value = (o.f && o.f[k] !== undefined && o.f[k] !== null) ? o.f[k] : '';
  });
  PREPS.concat(EXTRAS).forEach(function (p) {
    const e = chkEl(p.id);
    if (e) e.checked = !!(o.chk && o.chk[p.id]);
  });
  const rows = o.rows || {};
  RSETS.forEach(function (s) { setRows(s.key, rows[s.key]); });
  moneyRefresh();
  calcAll();
  saveDraft();
}

function resetAll() {
  FIELDS.forEach(function (k) { const e = $(k); if (e) { e.value = ''; e.dataset.autoval = ''; } });
  PREPS.concat(EXTRAS).forEach(function (p) {
    const e = chkEl(p.id);
    if (e) e.checked = false;
    const lb = $('lb_' + p.id);
    if (lb) lb.classList.remove('auto');
  });
  resetRows();
  RES = null; editId = null;
  $('script').value = '';
  $('r_items').innerHTML = ''; $('r_kpi').innerHTML = ''; $('r_sum').innerHTML = ''; $('r_blank').innerHTML = '';
  setSaveState('');
  initDefaults();
  calcAll();
}

function initDefaults() {
  let fp = FP_DEFAULT;
  try { if (STORE && STORE.getItem(FP_KEY)) fp = STORE.getItem(FP_KEY); } catch (e) { /* 무시 */ }
  if (!V('h_fp')) $('h_fp').value = fp;
  if (!V('h_adate')) $('h_adate').value = todayStr;
}

/* ===================== 진단 ===================== */

function analyze(silent) {
  const rec = collect();
  RES = Analysis.analyze(rec);
  renderResult(rec);
  autoPrep();
  $('script').value = Analysis.buildScript(rec, RES);
  if (!V('m_grade')) $('m_grade').value = RES.grade;
  $('m_gradeHint').textContent = '자동 추천 : ' + RES.grade + '등급';
  $('m_hidamt').textContent = won(RES.money);
  if (!V('m_vdate')) $('m_vdate').value = V('h_adate');
  if (!silent) tab(2);
}

function renderResult(rec) {
  const R = RES;
  const prods = R.contracts.map(function (c) { return c.prod; }).filter(Boolean).join(' / ');
  $('r_head').textContent = R.cust + ' 님 · 계약 ' + R.contracts.length + '건' +
    (prods ? ' (' + prods + ')' : '') +
    ' · 첫 가입일 ' + (ymd(R.firstJoin) || '-') +
    ' · 분석일 ' + (ymd(normDate(V('h_adate'))) || '-') + ' · ' + (V('h_fp') || '-');

  const c = function (k) { return R.findings.filter(function (f) { return f.lv === k; }).length; };
  $('r_kpi').innerHTML =
    '<div><div class="n" style="color:var(--grn)">' + c('m') + '</div><div class="t">숨은보험금 · 환급 건</div></div>' +
    '<div><div class="n" style="color:var(--red)">' + c('a') + '</div><div class="t">즉시 조치 항목</div></div>' +
    '<div><div class="n" style="color:var(--org)">' + c('b') + '</div><div class="t">보완 · 제안 항목</div></div>' +
    '<div><div class="n">' + won(R.money) + '<span style="font-size:12px">원</span></div>' +
    '<div class="t">발견 예상액' + (R.moneyUnknown ? ' (+' + R.moneyUnknown + '건 금액확인)' : '') + '</div></div>' +
    '<div><div class="n" style="color:var(--brand)">' + R.grade + '</div><div class="t">추천 방문결과 등급</div></div>';

  const top = R.findings.slice(0, 3).map(function (f) { return f.t; }).join(' / ');
  $('r_sum').innerHTML = '<div class="' + (R.money > 0 ? 'warn' : 'note') + '">' +
    (R.money > 0
      ? '<b>' + esc(R.cust) + ' 님께는 지금 바로 찾아드릴 수 있는 보험금·환급금이 약 ' + won(R.money) + '원 있습니다.</b>' +
      (R.moneyUnknown ? ' 여기에 금액 확인이 필요한 항목이 ' + R.moneyUnknown + '건 더 있습니다.' : '') +
      '<br>오늘 방문의 첫 마디는 이 이야기로 시작하세요. 가장 확실하게 신뢰를 얻는 방법입니다.'
      : '현재 입력값 기준으로 즉시 청구 가능한 숨은보험금은 확인되지 않았습니다. 아래 <b>확인이 안 된 항목</b>을 고객께 여쭤보면 추가로 발견될 수 있습니다.') +
    '<br><br><b>오늘 다룰 핵심</b> · ' + (esc(top) || '-') + '</div>';

  const LV = Analysis.LEVELS;
  $('r_items').innerHTML = R.findings.length
    ? R.findings.map(function (f, i) {
      return '<div class="item ' + f.lv + '">' +
        '<div class="hd"><div class="ttl"><span class="rk">' + (i + 1) + '</span>' + esc(f.t) + '</div>' +
        '<div><span class="tag ' + LV[f.lv].c + '">' + LV[f.lv].t + '</span>' +
        '<span class="hint" style="margin-left:7px">' + esc(f.cat) + '</span></div></div>' +
        '<div class="blk b-ment"><span class="bt">📢 고객님께 이렇게 안내하세요</span><p>' + esc(f.ment) + '</p></div>' +
        '<div class="blk b-basis"><span class="bt">📊 제안 근거 · 확인 사항</span><ul>' +
        f.basis.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
        (f.prep && f.prep.length
          ? '<div style="margin-top:6px;font-size:11.5px;color:var(--red)"><b>지참 자료</b> · ' + esc(f.prep.join(' / ')) + '</div>'
          : '') +
        '</div></div>';
    }).join('')
    : '<div class="note">입력된 내용이 없습니다. ① 고객 입력 탭에서 계약과 O/X 항목을 채워 주세요.</div>';

  $('r_blank').innerHTML = R.blanks.length
    ? '<div class="warn"><b>비어 있는 항목 ' + R.blanks.length + '개</b> — 방문 전 회사 시스템 조회 또는 고객 통화로 확인하세요.' +
    '<ul style="margin:7px 0 0;padding-left:18px">' + R.blanks.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul></div>'
    : '<div class="note" style="color:var(--grn)">✅ 모든 항목이 입력되었습니다.</div>';
}

function autoPrep() {
  PREPS.forEach(function (p) { const lb = $('lb_' + p.id); if (lb) lb.classList.remove('auto'); });
  RES.prep.forEach(function (id) {
    const e = chkEl(id), lb = $('lb_' + id);
    if (e) e.checked = true;
    if (lb) lb.classList.add('auto');
  });
}

function fillHidden() {
  if (!RES) { toast('먼저 분석을 실행해 주세요.', true); return; }
  const m = RES.findings.filter(function (f) { return f.lv === 'm'; });
  if (!m.length) { toast('진단 결과에 숨은보험금 항목이 없습니다.'); return; }
  const keep = getRows('hiddens');
  const seen = {};
  keep.forEach(function (h) { seen[String(h.item || '').trim()] = 1; });
  const fresh = m.filter(function (f) { return !seen[f.t]; })
    .map(function (f) { return { code: f.cat, item: f.t, amt: String(f.est || '') }; });
  setRows('hiddens', keep.concat(fresh));
  $('m_hidamt').textContent = won(RES.money);
  saveDraft();
  toast('숨은보험금 ' + m.length + '건을 표에 옮겼습니다.');
}

/* ===================== 저장 ===================== */

/* 저장·불러오기 같은 중요한 안내는 잠시 그대로 두고, 자동보관 문구가 덮지 않게 한다 */
let noticeUntil = 0;
function setSaveState(t, c, sticky) {
  const e = $('saveState');
  e.textContent = t;
  e.style.color = c || '';
  if (sticky) noticeUntil = Date.now() + 8000;
  else if (!t) noticeUntil = 0;
}

async function saveRecord() {
  const name = V('h_cust');
  if (!name) { toast('고객(계약자) 성명을 입력해 주세요.', true); tab(1); $('h_cust').focus(); return; }
  /* 태블릿용에서 저장이 막혀 있으면, 저장한 줄 알고 넘어가지 않도록 먼저 알려드린다 */
  if (window.__LOCAL_STORAGE_OK === false) {
    tab(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast('지금은 저장이 되지 않는 상태입니다. 화면 위 빨간 안내를 봐 주세요.', true);
    return;
  }
  if (!RES) analyze(true);
  const rec = collect();
  const prods = (rec.rows.contracts || []).map(function (c) { return c.prod; }).filter(Boolean).join(' / ');
  try {
    const out = await api('/api/contracts', { method: 'POST', body: rec });
    const isNew = !editId;
    editId = out.id;
    const label = name + ' 님' + (prods ? ' / ' + prods : '');
    setSaveState('저장 완료 · ' + label, 'var(--grn)', true);
    toast(isNew ? label + ' 기록을 저장했습니다.' : label + ' 내용을 수정 저장했습니다.');
    saveDraft();
    DBCACHE = [];
  } catch (e) {
    netError(esc(e.message));
    toast('저장하지 못했습니다 — ' + e.message, true);
  }
}

/* ===================== ④ 고객 누적 DB ===================== */

async function drawDB() {
  const box = $('dbBox');
  const q = V('q');
  box.innerHTML = '<div class="note">불러오는 중…</div>';
  let list;
  try {
    list = await api('/api/contracts?q=' + encodeURIComponent(q));
  } catch (e) {
    box.innerHTML = '<div class="err">목록을 불러오지 못했습니다 — ' + esc(e.message) + '</div>';
    return;
  }
  DBCACHE = list;
  if (!list.length) {
    box.innerHTML = '<div class="note">' + (q ? '검색 결과가 없습니다.' : '저장된 기록이 없습니다. ③ 탭 하단의 [이 고객 저장]을 눌러 주세요.') + '</div>';
    return;
  }
  const byCust = {};
  list.forEach(function (r) {
    const k = r.f.h_cust || '(무명)';
    (byCust[k] = byCust[k] || []).push(r);
  });
  let h = '';
  Object.keys(byCust).sort().forEach(function (k) {
    const rs = byCust[k];
    const sumM = rs.reduce(function (s, r) { return s + (r.money || 0); }, 0);
    h += '<div style="margin-bottom:16px"><div class="custhd">' +
      '<b style="color:var(--brand);font-size:14px">' + esc(k) + ' <span class="gsub">· 방문기록 ' + rs.length + '건</span></b>' +
      '<span class="hint">발견 예상액 합계 <b style="color:var(--grn)">' + won(sumM) + '원</b></span></div>' +
      '<table class="dt"><tr><th>저장일</th><th>상품명</th><th>계약</th><th>보험료 합계</th><th>등급</th>' +
      '<th>숨은보험금</th><th>후속조치 기한</th><th>차기방문</th><th class="noprint">관리</th></tr>';
    rs.forEach(function (r) {
      const dl = Schema.ledgerValue(r, '_due'), d = Calc.dday(dl);
      h += '<tr>' +
        '<td>' + String(r.savedAt || '').slice(0, 10) + '</td>' +
        '<td class="l">' + esc(Schema.ledgerValue(r, '_prod') || '-') + '</td>' +
        '<td>' + Schema.ledgerValue(r, '_cnt') + '건</td>' +
        '<td style="text-align:right">' + won(Schema.ledgerValue(r, '_prem')) + '</td>' +
        '<td>' + (r.f.m_grade
          ? '<span class="tag ' + (r.f.m_grade === 'A' ? 't-a' : r.f.m_grade === 'B' ? 't-b' : 't-i') + '">' + esc(r.f.m_grade) + '</span>'
          : '-') + '</td>' +
        '<td style="color:' + (r.money > 0 ? 'var(--grn)' : 'var(--sub)') + ';font-weight:' + (r.money > 0 ? 700 : 400) + '">' +
        (r.money ? won(r.money) + '원' : '-') + '</td>' +
        '<td style="color:' + (d !== null && d < 0 ? 'var(--red)' : d !== null && d <= 7 ? 'var(--org)' : 'inherit') + '">' +
        (dl ? ymd(dl) + (d !== null ? ' (D' + (d < 0 ? '+' + (-d) : '-' + d) + ')' : '') : '-') + '</td>' +
        '<td>' + (ymd(r.f.m_next) || '-') + '</td>' +
        '<td class="noprint">' +
        '<button class="b b-sub sm" data-pick="' + r.id + '">불러오기</button> ' +
        '<button class="b b-sub sm" data-xls="' + r.id + '">엑셀</button> ' +
        '<button class="b b-red sm" data-del="' + r.id + '">삭제</button></td></tr>';
    });
    h += '</table></div>';
  });
  box.innerHTML = h;
}

async function pick(id) {
  try {
    const r = await api('/api/contracts/' + id);
    apply(r);
    editId = r.id;
    analyze(true);
    $('restoreBar').style.display = 'none';
    setSaveState('불러옴 · ' + (r.f.h_cust || ''), 'var(--blue)', true);
    toast((r.f.h_cust || '') + ' 님 기록을 불러왔습니다. 수정 후 저장하면 같은 건에 덮어쓰기 됩니다.');
    tab(1);
  } catch (e) { toast('불러오지 못했습니다 — ' + e.message, true); }
}

async function del(id) {
  if (!confirm('이 방문 기록을 삭제할까요?')) return;
  try {
    await api('/api/contracts/' + id, { method: 'DELETE' });
    if (editId === id) editId = null;
    drawDB();
    toast('삭제했습니다.');
  } catch (e) { toast('삭제하지 못했습니다 — ' + e.message, true); }
}

document.addEventListener('click', function (e) {
  const p = e.target.closest('[data-pick]');
  if (p) { pick(+p.dataset.pick); return; }
  const d = e.target.closest('[data-del]');
  if (d) { del(+d.dataset.del); return; }
  const x = e.target.closest('[data-xls]');
  if (x) { download('/api/excel/contract/' + x.dataset.xls); }
});

/* ===================== ⑤ 통계 ===================== */

async function drawStat() {
  let s;
  try { s = await api('/api/stats'); }
  catch (e) {
    $('s_dist').innerHTML = '<div class="err">통계를 불러오지 못했습니다 — ' + esc(e.message) + '</div>';
    return;
  }
  if (!s.total) {
    $('s_kpi').innerHTML = '';
    $('s_dist').innerHTML = '<div class="note">저장된 자료가 없습니다.</div>';
    $('s_follow').innerHTML = ''; $('s_month').innerHTML = '';
    return;
  }
  $('s_kpi').innerHTML =
    '<div><div class="n">' + s.total + '</div><div class="t">누적 방문기록 수</div></div>' +
    '<div><div class="n">' + s.customers + '</div><div class="t">관리 고객 수</div></div>' +
    '<div><div class="n" style="color:var(--grn)">' + s.hidden + '</div><div class="t">숨은보험금 발견 건수</div></div>' +
    '<div><div class="n" style="color:var(--grn)">' + won(s.money) + '<span style="font-size:12px">원</span></div><div class="t">발견 예상액 누계</div></div>' +
    '<div><div class="n" style="color:var(--org)">' + s.contracts + '</div><div class="t">관리 계약 건수</div></div>';

  const G = s.grades || {};
  const mx = Math.max(1, G.A || 0, G.B || 0, G.C || 0, G[''] || 0);
  const gl = { A: 'A (즉시 제안 가능)', B: 'B (추후 재접촉)', C: 'C (유지관리)', '': '등급 미입력' };
  const gc = { A: 'var(--red)', B: 'var(--org)', C: 'var(--blue)', '': '#aaa' };
  $('s_dist').innerHTML =
    '<table class="dt"><tr><th style="width:34%">방문결과 등급</th><th>건수</th><th style="width:46%">비율</th></tr>' +
    ['A', 'B', 'C', ''].map(function (k) {
      return '<tr><td class="l">' + gl[k] + '</td><td>' + (G[k] || 0) + '건</td>' +
        '<td><div class="bar"><i style="width:' + ((G[k] || 0) / mx * 100) + '%;background:' + gc[k] + '"></i></div></td></tr>';
    }).join('') + '</table>' +
    '<div class="note" style="margin-top:11px">A등급 비율 <b>' + Math.round((G.A || 0) / s.total * 100) + '%</b> · ' +
    '숨은보험금 발견율 <b>' + Math.round(s.hidden / s.total * 100) + '%</b> · ' +
    '건당 평균 발견액 <b>' + won(s.money / s.total) + '원</b></div>';

  $('s_follow').innerHTML = s.follow.length
    ? '<table class="dt"><tr><th>고객</th><th>상품</th><th class="l">후속조치</th><th>처리기한</th><th>차기방문</th><th>상태</th></tr>' +
    s.follow.map(function (x) {
      const d = x.d;
      const st = (d === null || d === undefined) ? '-'
        : d < 0 ? '<span class="tag t-a">' + (-d) + '일 경과</span>'
          : d <= 7 ? '<span class="tag t-b">D-' + d + '</span>'
            : '<span class="tag t-i">D-' + d + '</span>';
      return '<tr><td>' + esc(x.cust || '-') + '</td><td>' + esc(x.prod || '-') + '</td>' +
        '<td class="l">' + esc(x.follow || '-') + '</td><td>' + (ymd(x.deadline) || '-') + '</td>' +
        '<td>' + (ymd(x.next) || '-') + '</td><td>' + st + '</td></tr>';
    }).join('') + '</table>'
    : '<div class="note">등록된 후속조치가 없습니다.</div>';

  const ks = Object.keys(s.months).sort();
  const mm = Math.max.apply(null, [1].concat(ks.map(function (k) { return s.months[k]; })));
  $('s_month').innerHTML = ks.length
    ? '<table class="dt"><tr><th style="width:22%">월</th><th style="width:14%">방문 건수</th><th>추이</th></tr>' +
    ks.map(function (k) {
      return '<tr><td>' + k.replace('-', '년 ') + '월</td><td>' + s.months[k] + '건</td>' +
        '<td><div class="bar"><i style="width:' + (s.months[k] / mm * 100) + '%;background:var(--navy2)"></i></div></td></tr>';
    }).join('') + '</table>'
    : '<div class="note">방문일 정보가 없습니다.</div>';
}

/* ===================== 임시 보관 (이 기기) ===================== */

let draftTimer = null;
function markDirty() { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 500); }

function saveDraft() {
  if (!STORE) return;
  try {
    const d = collect();
    d.draftAt = new Date().toISOString();
    STORE.setItem(DRAFT_KEY, JSON.stringify(d));
    if (Date.now() >= noticeUntil) {
      const n = new Date();
      setSaveState('자동 보관됨 · ' + String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0'), 'var(--sub)');
    }
  } catch (e) { /* 무시 */ }
}

function draftHasContent(d) {
  const skip = ['h_adate', 'm_vdate', 'h_fp'];
  const hasField = Object.keys(d.f || {}).some(function (k) {
    const v = d.f[k];
    return v && String(v).trim() && skip.indexOf(k) < 0 && v !== '0';
  });
  if (hasField) return true;
  return RSETS.some(function (s) { return ((d.rows || {})[s.key] || []).length > 0; });
}

function restoreDraft() {
  if (!STORE) return;
  let d;
  try { d = JSON.parse(STORE.getItem(DRAFT_KEY) || 'null'); } catch (e) { return; }
  if (!d || !draftHasContent(d)) return;
  apply(d);
  editId = d.id || null;
  const t = d.draftAt ? new Date(d.draftAt) : null;
  const bar = $('restoreBar');
  bar.style.display = 'block';
  bar.innerHTML = '<b>이어서 작업하실 수 있도록 이전 내용을 그대로 불러왔습니다.</b>' +
    (t ? ' <span style="color:var(--sub)">(' + (t.getMonth() + 1) + '월 ' + t.getDate() + '일 ' +
      String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') + ' 기준)</span>' : '') +
    (d.f && d.f.h_cust ? ' — ' + esc(d.f.h_cust) + ' 님' : '') +
    ' <button type="button" class="b b-sub sm" style="margin-left:6px" id="btnNew2">새 고객으로 시작</button>';
  $('btnNew2').addEventListener('click', newRecord);
  setSaveState('이전 내용 복원됨', 'var(--grn)', true);
}

function newRecord() {
  if (draftHasContent(collect()) && !confirm('지금 화면의 내용을 비우고 새로 시작할까요?\n\n저장해 두신 고객 자료는 그대로 남습니다.')) return;
  resetAll();
  if (STORE) { try { STORE.removeItem(DRAFT_KEY); } catch (e) { /* 무시 */ } }
  $('restoreBar').style.display = 'none';
  setSaveState('');
}

/* ===================== 백업 · 복원 · 엑셀 ===================== */

async function restoreBackup(input) {
  const file = input.files[0];
  if (!file) return;
  const text = await file.text();
  input.value = '';
  let json;
  try { json = JSON.parse(text); } catch (e) { toast('백업 파일을 읽을 수 없습니다.', true); return; }
  try {
    const out = await api('/api/restore', { method: 'POST', body: json });
    toast('복원 완료 — 새로 등록 ' + out.added + '건' + (out.failed ? ' / 실패 ' + out.failed + '건' : '') + ' (전체 ' + out.total + '건)');
    drawDB();
  } catch (e) { toast('복원하지 못했습니다 — ' + e.message, true); }
}

async function importExcel(input) {
  const file = input.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  input.value = '';
  try {
    const out = await api('/api/excel/import', { method: 'POST', form: fd });
    toast('엑셀 서식을 등록했습니다 — ' + (out.record.f.h_cust || '') + ' 님');
    apply(out.record);
    editId = out.record.id;
    analyze(true);
    drawDB();
  } catch (e) { toast('엑셀을 등록하지 못했습니다 — ' + e.message, true); }
}

async function wipe() {
  if (!confirm('저장된 모든 고객 기록을 삭제합니다. 되돌릴 수 없습니다. 계속할까요?')) return;
  if (!confirm('정말 삭제할까요? 먼저 [전체 백업 파일 저장]을 하시길 권합니다.')) return;
  try {
    await api('/api/wipe', { method: 'POST' });
    editId = null;
    drawDB(); drawStat();
    toast('전체 삭제했습니다.');
  } catch (e) { toast('삭제하지 못했습니다 — ' + e.message, true); }
}

function copyScript() {
  const t = $('script');
  t.select();
  t.setSelectionRange(0, 999999);
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t.value);
    } else {
      document.execCommand('copy');
    }
    toast('스크립트를 복사했습니다.');
  } catch (e) { toast('복사에 실패했습니다. 직접 선택해 복사해 주세요.', true); }
}

/* ===================== 예시 ===================== */

function demo() {
  resetAll();
  const v = {
    h_cust: '김영수', h_adate: todayStr,
    p_phone: '010-2345-6789', p_job: '기계설비 기술직', p_bday: '03-20', p_anniv: '결혼기념일 05-06',
    p_addr0: '안양시 동안구 관양동 1234', p_addr1: '안양시 동안구 평촌대로 100, 101동 1502호',
    c_on: '김영수', c_os: '남', c_obirth: '1971-03-20',
    c_in: '김영수', c_is: '남', c_ibirth: '1971-03-20',
    c_bh: '본인', c_uwx: '요추 5년 부담보',
    f_std: 'O', f_hprem: '118000', f_href: '640000', f_disc: 'X',
    f_comp: '대한기계(주)', f_surg: 'O', f_impl: 'O', f_acc: 'O', f_tooth: 'O',
    f_c21: 'O', f_ben: 'X', f_polyp: 'O', f_hc: 'X',
    b_paid: '30720000', b_surr: '27400000',
    b_lavl: '9000000', b_ltype: '약대', b_lbal: '5000000', b_lrate: '5.9', b_lmi: '24500', b_lti: '820000',
    b_wdavl: '3200000',
    b_matdt: '2026-05-14', b_matamt: '12000000',
    b_cch: '2019.03 수익자 변경',
    b_crider: '2027-05-14'
  };
  Object.keys(v).forEach(function (k) { if ($(k)) $(k).value = v[k]; });
  setRows('contracts', [
    { join: '2003-05-14', prod: '교보 무배당 실속종신보험', prem: '128000', payterm: '20년', insterm: '종신' },
    { join: '2005-11-02', prod: '21C 넘버원 암치료보험', prem: '46000', payterm: '20년', insterm: '80세' },
    { join: '2016-08-20', prod: '교보 변액유니버셜통합종신보험', prem: '190000', payterm: '전기납', insterm: '종신' }
  ]);
  setRows('claims', [{ c: 'A1023', d: '요추 염좌(교통사고)', t: '2023-08-02', a: '1200000' }]);
  setRows('funds', [{ name: '가치주식형', ratio: '60' }, { name: '채권안정형', ratio: '40' }]);
  setRows('talks', [{ date: todayStr, note: '만기보험금 안내 · 대출 상환 계획 상담' }]);
  setRows('hiddens', []);
  setRows('follows', [{ what: '치과 초진차트 · 진단서 수령 후 보험금 청구', due: todayStr }]);
  moneyRefresh();
  calcAll();
  saveDraft();
  toast('예시 데이터를 넣었습니다. [분석 실행]을 눌러보세요.');
}

/* ===================== 시작 ===================== */

renderChecks();
renderRowsets();
resetRows();
enhanceDates();
enhanceMoney();
initDefaults();
calcAll();

$('btnSave').addEventListener('click', saveRecord);
$('btnSave2').addEventListener('click', saveRecord);
$('btnNew').addEventListener('click', newRecord);
$('btnDemo').addEventListener('click', demo);
$('btnAnalyze').addEventListener('click', function () { analyze(); });
$('btnFillHidden').addEventListener('click', fillHidden);
$('btnCopy').addEventListener('click', copyScript);
$('btnRebuild').addEventListener('click', function () { analyze(true); toast('스크립트를 다시 만들었습니다.'); });
$('btnPrint2').addEventListener('click', function () { window.print(); });
$('btnPrint3').addEventListener('click', function () { window.print(); });
$('btnReload').addEventListener('click', drawDB);
$('q').addEventListener('input', function () { clearTimeout(window.__qt); window.__qt = setTimeout(drawDB, 250); });
$('btnBackup').addEventListener('click', function () { download('/api/backup'); });
$('btnCsv').addEventListener('click', function () { download('/api/csv'); });
$('btnTemplate').addEventListener('click', function () { download('/api/excel/template'); });
$('btnLedger').addEventListener('click', function () { download('/api/excel/ledger'); });
$('btnRestorePick').addEventListener('click', function () { $('rf').click(); });
$('rf').addEventListener('change', function () { restoreBackup(this); });
$('btnImportPick').addEventListener('click', function () { $('xf').click(); });
$('xf').addEventListener('change', function () { importExcel(this); });
$('btnWipe').addEventListener('click', wipe);

$('h_fp').addEventListener('change', function () {
  if (STORE && V('h_fp')) { try { STORE.setItem(FP_KEY, V('h_fp')); } catch (e) { /* 무시 */ } }
});
['c_obirth', 'c_ibirth'].forEach(function (id) {
  $(id).addEventListener('change', calcAll);
  $(id).addEventListener('blur', function () { setTimeout(calcAll, 0); });
});
['c_oja', 'c_ona', 'c_ija', 'c_ina'].forEach(function (id) { $(id).addEventListener('input', ageMsg); });

/* 계약 표의 값이 바뀌면 연령 · 만기일을 다시 계산합니다 */
document.addEventListener('input', function (e) {
  if (e.target.closest && e.target.closest('#rsb_contracts')) calcAll();
}, true);
document.addEventListener('change', function (e) {
  if (e.target.closest && e.target.closest('#rsb_contracts')) calcAll();
}, true);

document.addEventListener('input', markDirty, true);
document.addEventListener('change', markDirty, true);
window.addEventListener('pagehide', function () { clearTimeout(draftTimer); saveDraft(); });
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'hidden') { clearTimeout(draftTimer); saveDraft(); }
});

if (window.__LOCAL_READY) window.__LOCAL_READY();
restoreDraft();
