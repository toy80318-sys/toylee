/*
 * 화면 동작 — 입력 · 자동계산 · 진단 · 서버 저장 · 엑셀
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
const DRAFT_KEY = 'kyobo_draft_v2';
const FP_KEY = 'kyobo_fp_v1';
const FP_DEFAULT = '평촌지점 추진이';

let RES = null;        // 최근 분석 결과
let editId = null;     // 서버에 저장된 계약 id (수정 중일 때)
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
    '<br>입력하신 내용은 이 컴퓨터에 임시 보관되어 있으니, 서버가 살아나면 [저장]을 다시 눌러 주세요.';
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

/* 값을 다시 꾸미고, 커서는 '앞에 있던 숫자 개수' 기준으로 제자리에 둔다 */
function formatMoneyLive(el) {
  const raw = el.value;
  let caret = el.selectionEnd;
  if (caret === null || caret === undefined) caret = raw.length;
  const before = raw.slice(0, caret).replace(/[^0-9]/g, '').length;
  const out = commafy(raw);
  if (out === raw) return;
  el.value = out;
  let pos = 0, seen = 0;
  while (pos < out.length && seen < before) {
    if (out.charCodeAt(pos) >= 48 && out.charCodeAt(pos) <= 57) seen++;
    pos++;
  }
  try { el.setSelectionRange(pos, pos); } catch (e) { /* 커서를 못 옮기는 칸은 그냥 둔다 */ }
}

function enhanceMoney(root) {
  (root || document).querySelectorAll('input[data-money]').forEach(function (el) {
    if (el.dataset.enhanced) return;
    el.dataset.enhanced = '1';
    el.setAttribute('inputmode', 'numeric');
    el.style.textAlign = 'right';

    /* 쉼표 바로 뒤에서 지우기를 누르면, 쉼표가 아니라 그 앞의 숫자가 지워지게 한다 */
    el.addEventListener('beforeinput', function (e) {
      if (e.inputType !== 'deleteContentBackward') return;
      const p = el.selectionStart;
      if (p !== el.selectionEnd || p < 2 || el.value.charAt(p - 1) !== ',') return;
      e.preventDefault();
      el.value = el.value.slice(0, p - 2) + el.value.slice(p);
      try { el.setSelectionRange(p - 2, p - 2); } catch (err) { /* 무시 */ }
      formatMoneyLive(el);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    el.addEventListener('input', function () { formatMoneyLive(el); });
    el.addEventListener('blur', function () { formatMoneyLive(el); });
  });
}

function moneyRefresh() {
  document.querySelectorAll('input[data-money]').forEach(function (el) {
    if (document.activeElement === el) return;
    el.value = commafy(el.value);
  });
}

/* ===================== 자동 계산 ===================== */

function calcBMI() {
  const v = Calc.bmi(V('f_ht'), V('f_wt'));
  $('f_bmi').value = v;
}

function setAutoVal(el, v) {
  v = String(v);
  if (!el.value.trim() || el.value === el.dataset.autoval) { el.value = v; el.dataset.autoval = v; return true; }
  return false;
}

const AGE_ROWS = [['c_obirth', '계약자', 'c_oja', 'c_ona'], ['c_ibirth', '주피보험자', 'c_ija', 'c_ina']];

function calcAges() {
  const join = normDate(V('i_join'));
  AGE_ROWS.forEach(function (row) {
    const bd = normDate(V(row[0]));
    if (!bd) return;
    if (join) { const r = Calc.insAge(bd, join); if (r) setAutoVal($(row[2]), r.age); }
    const r2 = Calc.insAge(bd, todayStr);
    if (r2) setAutoVal($(row[3]), r2.age);
  });
  const ob = normDate(V('c_obirth'));
  if (ob) {
    if (!V('e_bm')) $('e_bm').value = +ob.slice(5, 7);
    if (!V('e_bd')) $('e_bd').value = +ob.slice(8, 10);
  }
  syncAge('c_ija');
  ageMsg();
}

function ageMsg() {
  const el = $('c_ageMsg');
  const join = normDate(V('i_join'));
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

function syncAge(from) {
  if (from === 'i_age') $('c_ija').value = V('i_age');
  else if (from === 'c_ija') $('i_age').value = V('c_ija');
  else if (V('i_age')) $('c_ija').value = V('i_age');
  else if (V('c_ija')) $('i_age').value = V('c_ija');
}

function applyAuto(id, v) {
  const el = $(id);
  el.value = v; el.dataset.autoval = v;
  calcTerms();
}
window.applyAuto = applyAuto;

function showTerm(msgId, elId, out) {
  const el = $(elId), msg = $(msgId);
  const say = function (t, c) { msg.innerHTML = t; msg.style.color = c || ''; };
  if (!out.value) { say(out.how || '', out.how ? 'var(--org)' : ''); return; }
  const cur = normDate(el.value);
  if (cur === out.value) { say(out.how, 'var(--grn)'); return; }
  if (!el.value.trim() || el.value === el.dataset.autoval) {
    el.value = out.value; el.dataset.autoval = out.value;
    say(out.how + ' — 자동으로 넣었습니다.', 'var(--grn)');
  } else {
    say('자동 계산은 <b>' + out.value + '</b> 입니다. 직접 넣으신 ' + esc(el.value) + ' 을(를) 유지 중 ' +
      '<button type="button" class="b b-sub sm" style="padding:1px 8px;font-size:11px" ' +
      'onclick="applyAuto(\'' + elId + '\',\'' + out.value + '\')">자동값으로 바꾸기</button>', 'var(--org)');
  }
}

function hint(id, text, color) {
  const el = $(id);
  el.innerHTML = text;
  el.style.color = color || '';
}

function calcTerms() {
  /* 보험 만기일 : 가입일 + 보험기간 */
  const join = V('i_join'), insterm = V('i_insterm');
  if (!join && !insterm) hint('i_insendMsg', '가입일과 보험기간을 넣으시면 자동으로 채워집니다.');
  else if (!join) hint('i_insendMsg', '가입일을 넣으시면 만기일이 자동으로 채워집니다.');
  else if (!insterm) hint('i_insendMsg', '보험기간을 넣으시면 만기일이 자동으로 채워집니다.');
  else {
    const out = Calc.calcInsEnd(join, insterm, V('i_age'));
    if (out.whole) hint('i_insendMsg', '종신 — 만기가 따로 없어 평생 보장됩니다. 만기일은 비워 두셔도 됩니다.', 'var(--blue)');
    else showTerm('i_insendMsg', 'i_insend', out);
  }

  /* 납입 만료일 : 가입일 + 납입기간 (전기납은 보험 만기일) */
  const payterm = V('i_payterm');
  if (!join && !payterm) hint('i_payendMsg', '가입일과 납입기간을 넣으시면 자동으로 채워집니다.');
  else if (!join) hint('i_payendMsg', '가입일을 넣으시면 만료일이 자동으로 채워집니다.');
  else if (!payterm) hint('i_payendMsg', '납입기간을 넣으시면 만료일이 자동으로 채워집니다.');
  else showTerm('i_payendMsg', 'i_payend', Calc.calcPayEnd(join, payterm, V('i_insend')));
}

function calcAll() { calcBMI(); calcAges(); calcTerms(); }

/* ===================== 사고보험금 줄 ===================== */

function addClaim(v) {
  const d = document.createElement('div');
  d.className = 'grid g3';
  d.style.gap = '4px';
  d.style.marginBottom = '4px';
  d.innerHTML =
    '<input class="cl-d" placeholder="병명">' +
    '<input class="cl-t" data-date>' +
    '<input class="cl-a" data-money placeholder="수령액">';
  $('claimBox').appendChild(d);
  if (v) {
    d.querySelector('.cl-d').value = v.d || '';
    d.querySelector('.cl-t').value = v.t || '';
    d.querySelector('.cl-a').value = commafy(v.a || '');
  }
  enhanceDates(d);
  enhanceMoney(d);
}

function getClaims() {
  const ds = [].slice.call(document.querySelectorAll('.cl-d'));
  const ts = [].slice.call(document.querySelectorAll('.cl-t'));
  const as = [].slice.call(document.querySelectorAll('.cl-a'));
  return ds.map(function (e, i) {
    return { d: e.value.trim(), t: normDate(ts[i].value) || ts[i].value.trim(), a: String(numOf(as[i].value) || '') };
  }).filter(function (x) { return x.d || x.t || x.a; });
}

/* ===================== 체크리스트 ===================== */

/* 체크 항목의 입력칸 id : 탭 화면 id(p1~p5) 와 겹치지 않도록 chk_ 를 붙인다 */
function chkEl(id) { return $('chk_' + id); }

function renderChecks() {
  const row = function (p) {
    return '<label class="chk" id="lb_' + p.id + '"><input type="checkbox" id="chk_' + p.id + '"><span>' + esc(p.t) + '</span></label>';
  };
  $('prepBox').innerHTML = PREPS.map(row).join('');
  $('extraBox').innerHTML = EXTRAS.map(row).join('');
}

/* ===================== 수집 · 적용 ===================== */

function collect() {
  const o = { id: editId, f: {}, chk: {}, claims: getClaims() };
  FIELDS.forEach(function (k) {
    const e = $(k);
    if (!e) return;
    o.f[k] = e.dataset.money !== undefined || e.hasAttribute('data-money')
      ? String(numOf(e.value) || '')
      : String(e.value || '').trim();
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
  $('claimBox').innerHTML = '';
  const cl = (o.claims && o.claims.length) ? o.claims : [null, null, null];
  cl.forEach(function (c) { addClaim(c); });
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
  $('claimBox').innerHTML = '';
  for (let i = 0; i < 3; i++) addClaim();
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
  if (!V('h_vdate')) $('h_vdate').value = todayStr;
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
  if (!V('m_vdate')) $('m_vdate').value = V('h_vdate');
  if (!silent) tab(2);
}

function renderResult(rec) {
  const R = RES;
  $('r_head').textContent = R.cust + ' 님 · ' + (V('i_prod') || '상품명 미입력') +
    ' · 가입일 ' + (ymd(normDate(V('i_join'))) || '-') +
    ' · 방문예정 ' + (ymd(normDate(V('h_vdate'))) || '-') + ' · FP ' + (V('h_fp') || '-');

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
    : '<div class="note">입력된 내용이 없습니다. ① 계약 입력 탭에서 O/X 항목을 채워 주세요.</div>';

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
  $('m_hidden').value = m.length
    ? m.map(function (f) { return '· ' + f.t; }).join('\n') +
    '\n\n[발견 예상액 합계] ' + won(RES.money) + '원' +
    (RES.moneyUnknown ? ' (금액확인 필요 ' + RES.moneyUnknown + '건 별도)' : '')
    : '해당 없음';
  $('m_hidamt').textContent = won(RES.money);
  saveDraft();
}

/* ===================== 저장 (서버) ===================== */

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
  const j = normDate(V('i_join'));
  if (j) $('i_join').value = j;
  if (!RES) analyze(true);
  const rec = collect();
  try {
    const out = await api('/api/contracts', { method: 'POST', body: rec });
    const isNew = !editId;
    editId = out.id;
    const label = name + ' 님 / ' + (rec.f.i_prod || '상품명 없음');
    setSaveState('저장 완료 · ' + label, 'var(--grn)', true);
    toast(isNew ? label + ' 계약을 서버에 저장했습니다.' : label + ' 내용을 수정 저장했습니다.');
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
    box.innerHTML = '<div class="note">' + (q ? '검색 결과가 없습니다.' : '저장된 계약이 없습니다. ③ 탭 하단의 [이 계약 저장]을 눌러 주세요.') + '</div>';
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
      '<b style="color:var(--brand);font-size:14px">' + esc(k) + ' <span class="gsub">· 계약 ' + rs.length + '건</span></b>' +
      '<span class="hint">발견 예상액 합계 <b style="color:var(--grn)">' + won(sumM) + '원</b></span></div>' +
      '<table class="dt"><tr><th>저장일</th><th>상품명</th><th>가입일</th><th>보험료</th><th>등급</th>' +
      '<th>숨은보험금</th><th>후속조치 기한</th><th>차기방문</th><th class="noprint">관리</th></tr>';
    rs.forEach(function (r) {
      const dl = r.f.m_deadline, d = Calc.dday(dl);
      h += '<tr>' +
        '<td>' + String(r.savedAt || '').slice(0, 10) + '</td>' +
        '<td class="l">' + esc(r.f.i_prod || '-') + '</td>' +
        '<td>' + (ymd(normDate(r.f.i_join)) || esc(r.f.i_join) || '-') + '</td>' +
        '<td style="text-align:right">' + (r.f.i_prem ? won(r.f.i_prem) : '-') + '</td>' +
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
    setSaveState('불러옴 · ' + (r.f.h_cust || '') + ' / ' + (r.f.i_prod || ''), 'var(--blue)', true);
    toast((r.f.h_cust || '') + ' 님 계약을 불러왔습니다. 수정 후 저장하면 같은 건에 덮어쓰기 됩니다.');
    tab(1);
  } catch (e) { toast('불러오지 못했습니다 — ' + e.message, true); }
}

async function del(id) {
  if (!confirm('이 계약 기록을 삭제할까요?')) return;
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
    '<div><div class="n">' + s.total + '</div><div class="t">누적 계약 분석 건수</div></div>' +
    '<div><div class="n">' + s.customers + '</div><div class="t">관리 고객 수</div></div>' +
    '<div><div class="n" style="color:var(--grn)">' + s.hidden + '</div><div class="t">숨은보험금 발견 건수</div></div>' +
    '<div><div class="n" style="color:var(--grn)">' + won(s.money) + '<span style="font-size:12px">원</span></div><div class="t">발견 예상액 누계</div></div>' +
    '<div><div class="n" style="color:var(--org)">' + s.upsell + '</div><div class="t">업셀링 제안 건수</div></div>';

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

/* ===================== 임시 보관 (이 컴퓨터) ===================== */

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
  const skip = ['h_vdate', 'm_vdate', 'h_fp'];
  return Object.keys(d.f || {}).some(function (k) {
    const v = d.f[k];
    return v && String(v).trim() && skip.indexOf(k) < 0 && v !== '0';
  });
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
  if (draftHasContent(collect()) && !confirm('지금 화면의 내용을 비우고 새로 시작할까요?\n\n서버에 저장해 두신 고객 자료는 그대로 남습니다.')) return;
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
  if (!confirm('서버에 저장된 모든 고객 기록을 삭제합니다. 되돌릴 수 없습니다. 계속할까요?')) return;
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
    h_cust: '김영수', i_join: '2003-05-14', i_prod: '교보 무배당 실속종신보험',
    i_prem: '128000', i_age: '32', i_payterm: '20년', i_payend: '2023-05-14', i_insterm: '종신', i_rate: '6.5',
    c_on: '김영수', c_os: '남', c_obirth: '1971-03-20', c_in: '김영수', c_is: '남', c_ibirth: '1971-03-20',
    f_std: 'O', f_ht: '174', f_wt: '70', f_smoke: '비흡연', f_hprem: '118000', f_href: '640000',
    f_disc: 'X', f_comp: '대한기계(주)', f_surg: 'O', f_impl: 'O', f_acc: 'O', f_tooth: 'O',
    f_c21: 'O', f_ben: 'X', f_polyp: 'O', f_hc: 'X', f_life: '5000', f_hcamt: '8000', f_hcprem: '42000',
    b_paid: '30720000', b_surr: '27400000', b_lbal: '5000000', b_lrate: '5.9', b_lti: '820000', b_wdavl: '3200000',
    b_matdt: '2026-05-14', b_matamt: '12000000', b_as: '분할 X', b_am: '만기 X', b_ro: '당사 O', b_rt: '타사 O',
    b_crider: '2027-05-14'
  };
  Object.keys(v).forEach(function (k) { if ($(k)) $(k).value = v[k]; });
  $('claimBox').innerHTML = '';
  addClaim({ d: '요추 염좌(교통사고)', t: '2023-08-02', a: '1200000' });
  addClaim(); addClaim();
  moneyRefresh();
  calcAll();
  saveDraft();
  toast('예시 데이터를 넣었습니다. [분석 실행]을 눌러보세요.');
}

/* ===================== 시작 ===================== */

renderChecks();
enhanceDates();
enhanceMoney();
for (let i = 0; i < 3; i++) addClaim();
initDefaults();
calcAll();

$('btnSave').addEventListener('click', saveRecord);
$('btnSave2').addEventListener('click', saveRecord);
$('btnNew').addEventListener('click', newRecord);
$('btnDemo').addEventListener('click', demo);
$('btnAnalyze').addEventListener('click', function () { analyze(); });
$('btnAddClaim').addEventListener('click', function () { addClaim(); });
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
['f_ht', 'f_wt'].forEach(function (id) { $(id).addEventListener('input', calcBMI); });
['c_obirth', 'c_ibirth', 'i_join'].forEach(function (id) {
  $(id).addEventListener('change', calcAll);
  $(id).addEventListener('blur', function () { setTimeout(calcAll, 0); });
});
['c_oja', 'c_ona', 'c_ina'].forEach(function (id) { $(id).addEventListener('input', ageMsg); });
$('i_age').addEventListener('input', function () { syncAge('i_age'); calcTerms(); ageMsg(); });
$('c_ija').addEventListener('input', function () { syncAge('c_ija'); calcTerms(); ageMsg(); });
['i_insterm', 'i_payterm'].forEach(function (id) {
  $(id).addEventListener('input', calcTerms);
  $(id).addEventListener('blur', calcTerms);
});
['i_insend', 'i_payend'].forEach(function (id) {
  $(id).addEventListener('change', calcTerms);
  $(id).addEventListener('blur', function () { setTimeout(calcTerms, 0); });
});

document.addEventListener('input', markDirty, true);
document.addEventListener('change', markDirty, true);
window.addEventListener('pagehide', function () { clearTimeout(draftTimer); saveDraft(); });
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'hidden') { clearTimeout(draftTimer); saveDraft(); }
});

if (window.__LOCAL_READY) window.__LOCAL_READY();
restoreDraft();
