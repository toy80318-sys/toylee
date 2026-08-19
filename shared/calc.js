/*
 * 공통 계산 모듈 — 서버(Node)와 브라우저에서 같은 코드를 씁니다.
 * 날짜 정규화 · 보험나이 · 납입/보험기간 해석 · 금액 표기
 */
(function (global) {
  'use strict';

  /* 숫자만 뽑아낸다. "50,000원" → 50000 */
  function numOf(v) {
    const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  /* 원 단위 한국식 표기 */
  function won(n) {
    return Math.round(numOf(n)).toLocaleString('ko-KR');
  }

  /* 20030514 · 2003.5.14 · 2003-05-14 → 2003-05-14 */
  function normDate(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return '';
    let y, m, dd;
    const parts = s.split(/[^0-9]+/).filter(Boolean);
    if (parts.length >= 2 && parts[0].length === 4) {
      y = parts[0];
      m = parts[1].padStart(2, '0');
      dd = (parts[2] || '1').padStart(2, '0');
    } else {
      const d = s.replace(/[^0-9]/g, '');
      if (d.length === 8) { y = d.slice(0, 4); m = d.slice(4, 6); dd = d.slice(6, 8); }
      else if (d.length === 6) { y = d.slice(0, 4); m = d.slice(4, 6); dd = '01'; }
      else return '';
    }
    const ny = +y, nm = +m, nd = +dd;
    if (ny < 1900 || ny > 2100 || nm < 1 || nm > 12 || nd < 1 || nd > 31) return '';
    const t = new Date(ny, nm - 1, nd);
    if (t.getFullYear() !== ny || t.getMonth() !== nm - 1 || t.getDate() !== nd) return '';
    return y + '-' + m + '-' + dd;
  }

  function ymd(s) { return s ? String(s).replace(/-/g, '.') : ''; }

  function todayStr(now) {
    const d = now ? new Date(now) : new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* 기준일(today) 대비 남은 일수. 지난 날짜는 음수 */
  function dday(s, baseStr) {
    if (!s) return null;
    const v = normDate(s) || s;
    const d = new Date(v);
    if (isNaN(d)) return null;
    const base = new Date(baseStr || todayStr());
    d.setHours(0, 0, 0, 0);
    base.setHours(0, 0, 0, 0);
    return Math.round((d - base) / 86400000);
  }

  /* 납입기간 해석 : "20년" "20년납" "120개월" "전기납" "일시납" */
  function parseTerm(s) {
    const t = String(s || '').replace(/\s/g, '');
    if (!t) return null;
    if (/일시/.test(t)) return { type: 'once', label: '일시납' };
    if (/전기|종신/.test(t)) return { type: 'whole', label: '전기납' };
    /* 60세납 · 65세납 처럼 나이로 끊는 납입 */
    let a = t.match(/(\d+)세/);
    if (a) return { type: 'age', n: +a[1], label: a[1] + '세납' };
    let m = t.match(/(\d+)(년|개월|월)납/);
    if (!m) m = t.match(/(\d+)(개월|월|년)?/);
    if (!m) return null;
    const n = +m[1];
    if (!n) return null;
    const u = m[2] || '년';
    return (u === '개월' || u === '월')
      ? { type: 'm', n: n, label: n + '개월' }
      : { type: 'y', n: n, label: n + '년' };
  }

  /* 보험기간 해석 : "종신" "80세" "20년만기" "240개월" */
  function parseInsTerm(s) {
    const t = String(s || '').replace(/\s/g, '');
    if (!t) return null;
    if (/종신|평생/.test(t)) return { type: 'whole', label: '종신' };
    let m = t.match(/(\d+)세/);
    if (m) return { type: 'age', n: +m[1], label: m[1] + '세 만기' };
    m = t.match(/(\d+)(년|개월|월)?만기/) || t.match(/(\d+)(개월|월|년)?/);
    if (!m) return null;
    const n = +m[1];
    if (!n) return null;
    const u = m[2] || '년';
    return (u === '개월' || u === '월')
      ? { type: 'm', n: n, label: n + '개월 만기' }
      : { type: 'y', n: n, label: n + '년 만기' };
  }

  /* 기준일 + 기간 (말일 넘침은 그 달 마지막 날로) */
  function addTerm(base, term) {
    if (!base || !term) return '';
    const y = +base.slice(0, 4), m = +base.slice(5, 7), d = +base.slice(8, 10);
    let ny, nm;
    if (term.type === 'y') { ny = y + term.n; nm = m; }
    else if (term.type === 'm') { const tot = y * 12 + (m - 1) + term.n; ny = Math.floor(tot / 12); nm = tot % 12 + 1; }
    else return '';
    const last = new Date(ny, nm, 0).getDate();
    return ny + '-' + String(nm).padStart(2, '0') + '-' + String(Math.min(d, last)).padStart(2, '0');
  }

  /*
   * 보험나이 (회사 기준)
   * 기준일 − 생년월일 → 남은 개월이 6개월 미만이면 버리고, 6개월 이상이면 한 살 올림
   */
  function insAge(birth, base) {
    const b = normDate(birth), t = normDate(base);
    if (!b || !t) return null;
    let y = +t.slice(0, 4) - +b.slice(0, 4);
    let m = +t.slice(5, 7) - +b.slice(5, 7);
    const d = +t.slice(8, 10) - +b.slice(8, 10);
    if (d < 0) m--;
    if (m < 0) { y--; m += 12; }
    if (y < 0) return null;
    return { age: m >= 6 ? y + 1 : y, y: y, m: m, up: m >= 6 };
  }

  /* 납입 만료일 자동 계산 (전기납은 보험 만기일과 동일) */
  function calcPayEnd(join, payterm, insEnd, joinAge) {
    const j = normDate(join), term = parseTerm(payterm);
    if (!j || !term) return { value: '', how: '' };
    if (term.type === 'once') return { value: j, how: '일시납 — 가입일에 납입이 끝납니다' };
    if (term.type === 'whole') {
      const ins = normDate(insEnd);
      return ins
        ? { value: ins, how: '전기납 — 보험 만기일과 같습니다' }
        : { value: '', how: '전기납입니다. 보험 만기일을 넣으시면 만료일이 같이 채워집니다.' };
    }
    if (term.type === 'age') {
      const age = numOf(joinAge);
      if (!age) return { value: '', how: term.label + ' 입니다. 가입연령을 넣으시면 만료일이 계산됩니다.' };
      const yrs = term.n - age;
      if (yrs <= 0) return { value: '', how: '가입연령(' + age + '세)이 납입 만료나이(' + term.n + '세)보다 크거나 같습니다.' };
      const v = addTerm(j, { type: 'y', n: yrs });
      return { value: v, how: '가입일 + (' + term.n + '세 − 가입연령 ' + age + '세 = ' + yrs + '년) = ' + v };
    }
    const v = addTerm(j, term);
    return { value: v, how: '가입일 + ' + term.label + ' = ' + v };
  }

  /* 보험 만기일 자동 계산 */
  function calcInsEnd(join, insterm, joinAge) {
    const j = normDate(join), term = parseInsTerm(insterm);
    if (!j || !term) return { value: '', how: '' };
    if (term.type === 'whole') return { value: '', how: '종신 — 만기가 따로 없어 평생 보장됩니다.', whole: true };
    if (term.type === 'age') {
      const age = numOf(joinAge);
      if (!age) return { value: '', how: term.label + ' 입니다. 가입연령을 넣으시면 만기일이 계산됩니다.' };
      const yrs = term.n - age;
      if (yrs <= 0) return { value: '', how: '가입연령(' + age + '세)이 만기나이(' + term.n + '세)보다 크거나 같습니다.' };
      const v = addTerm(j, { type: 'y', n: yrs });
      return { value: v, how: '가입일 + (' + term.n + '세 − 가입연령 ' + age + '세 = ' + yrs + '년) = ' + v };
    }
    const v = addTerm(j, term);
    return { value: v, how: '가입일 + ' + term.label + ' = ' + v };
  }

  /* BMI = 몸무게(kg) / 키(m)² */
  function bmi(ht, wt) {
    const h = numOf(ht) / 100, w = numOf(wt);
    if (!h || !w) return '';
    return (w / (h * h)).toFixed(1);
  }

  const Calc = {
    numOf: numOf, won: won, normDate: normDate, ymd: ymd, todayStr: todayStr, dday: dday,
    parseTerm: parseTerm, parseInsTerm: parseInsTerm, addTerm: addTerm, insAge: insAge,
    calcPayEnd: calcPayEnd, calcInsEnd: calcInsEnd, bmi: bmi
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  else (global.KB = global.KB || {}).Calc = Calc;
})(typeof globalThis !== 'undefined' ? globalThis : this);
