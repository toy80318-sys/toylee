/*
 * 기계약자 관리 — 알림 · 보장 계산 엔진
 *
 *  alerts(record)   : 생일 · 기념일 · 상령일 · 암 면책 · 만기 · 납입만료 … 를 날짜순으로
 *  coverage(record) : 특약별 보장영역과 지급보험금
 */
(function (global) {
  'use strict';

  const isNode = (typeof module !== 'undefined' && module.exports);
  const Calc = isNode ? require('../shared/calc.js') : global.KB.Calc;
  const Schema = isNode ? require('./schema.js') : global.NC.Schema;
  const Riders = isNode ? require('./riders.js') : global.NC.Riders;
  const Products = isNode ? require('./products.js') : global.NC.Products;

  const normDate = Calc.normDate, ymd = Calc.ymd, won = Calc.won;

  function addDays(d, n) { return Riders.addDays(d, n); }

  function addMonths(ymdStr, n) {
    const y = +ymdStr.slice(0, 4), m = +ymdStr.slice(5, 7), d = +ymdStr.slice(8, 10);
    const tot = y * 12 + (m - 1) + n;
    const ny = Math.floor(tot / 12), nm = tot % 12 + 1;
    const last = new Date(ny, nm, 0).getDate();
    return ny + '-' + String(nm).padStart(2, '0') + '-' + String(Math.min(d, last)).padStart(2, '0');
  }

  /* 올해(또는 내년)의 해당 월·일 — 매년 돌아오는 날 */
  function nextYearly(mmdd, today) {
    if (!mmdd) return '';
    const y = +today.slice(0, 4);
    const a = y + '-' + mmdd;
    return a >= today ? a : (y + 1) + '-' + mmdd;
  }

  /* '05-06' · '결혼기념일 05-06' · '2003-05-14' 어디에서든 월·일을 찾아냅니다 */
  function pickMMDD(text) {
    const s = String(text || '');
    let m = s.match(/(\d{4})[-.\/]?(\d{1,2})[-.\/](\d{1,2})/);
    if (m) return String(+m[2]).padStart(2, '0') + '-' + String(+m[3]).padStart(2, '0');
    m = s.match(/(\d{1,2})[-.\/월]\s*(\d{1,2})/);
    if (m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31) {
      return String(+m[1]).padStart(2, '0') + '-' + String(+m[2]).padStart(2, '0');
    }
    return '';
  }

  /* ---------- 보장 계산 ---------- */

  function coverage(record, opts) {
    opts = opts || {};
    const today = opts.today || Calc.todayStr();
    const dict = opts.dict || Riders.BASE;
    const prods = opts.products || Products.BASE;
    const plans = Schema.pruneRows(Schema.rowsetMap().plans, (record.rows || {}).plans);
    const riders = Schema.pruneRows(Schema.rowsetMap().riders, (record.rows || {}).riders);

    /* 특약이 어느 보험에 붙어 있는지 보고 그 보험의 계약일을 씁니다 */
    const planOf = function (planName) {
      return plans.filter(function (p) {
        const a = String(p.name || '').replace(/\s/g, '');
        const b = String(planName || '').replace(/\s/g, '');
        return a && b && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0);
      })[0] || plans[0] || null;
    };

    const list = riders.map(function (r) {
      const p = planOf(r.plan);
      const prod = Products.find(prods, (p && p.name) || r.plan);
      const c = Riders.coverage(r, p ? normDate(p.join) : '', today, dict, Products.riderSpec(prod, r.name));
      c.plan = r.plan || (p ? p.name : '');
      c.product = prod ? prod.name : '';
      return c;
    });

    /* 주계약도 같은 방식으로 한 줄씩 */
    const mains = plans.map(function (p) {
      const prod = Products.find(prods, p.name);
      const nm = p.main || (prod && prod.main ? prod.main.name : '') || p.name;
      const c = Riders.coverage({ name: nm, amt: p.amt }, normDate(p.join), today, dict,
        Products.riderSpec(prod, nm) || (prod ? prod.main : null));
      c.plan = p.name || '';
      c.product = prod ? prod.name : '';
      c.main = true;
      return c;
    });

    const unknown = list.concat(mains).filter(function (c) { return !c.found && c.name; });
    return { riders: list, mains: mains, unknown: unknown, today: today };
  }

  /* ---------- 알림 ---------- */

  function alerts(record, opts) {
    opts = opts || {};
    const today = opts.today || Calc.todayStr();
    const f = record.f || {};
    const RS = Schema.rowsetMap();
    const plans = Schema.pruneRows(RS.plans, (record.rows || {}).plans);
    const riders = Schema.pruneRows(RS.riders, (record.rows || {}).riders);
    const follows = Schema.pruneRows(RS.follows, (record.rows || {}).follows);
    const cust = String(f.h_cust || '고객').trim() || '고객';
    const out = [];

    const add = function (date, cat, title, ment, kind) {
      const d = normDate(date);
      if (!d) return;
      out.push({ date: d, dday: Calc.dday(d, today), cat: cat, title: title, ment: ment, kind: kind || '' });
    };

    /* 생일 */
    const birth = normDate(f.p_birth);
    if (birth) {
      const bd = nextYearly(birth.slice(5), today);
      const age = Calc.insAge(birth, bd);
      add(bd, '생일', cust + ' 님 생일',
        '생신 축하 연락 드릴 날입니다.' + (age ? ' (보험나이 ' + age.age + '세)' : ''), 'birth');

      /* 보험 상령일 = 생년월일 + 6개월 — 이 날부터 보험나이가 한 살 올라갑니다 */
      const half = addMonths(birth, 6);
      const sang = nextYearly(half.slice(5), today);
      const now = Calc.insAge(birth, today);
      add(sang, '상령일', '보험 상령일 — 이 날부터 보험나이 +1',
        '이 날이 지나면 보험나이가 ' + (now ? now.age + '세 → ' + (now.age + 1) + '세' : '한 살') + '로 올라가 ' +
        '새로 가입하시는 보험료가 올라갑니다. 추가 가입 계획이 있으시면 그 전에 청약하셔야 합니다.', 'age');
    }

    /* 기념일 */
    const mmdd = pickMMDD(f.p_anniv);
    if (mmdd) {
      add(nextYearly(mmdd, today), '기념일', (String(f.p_anniv).replace(/[\d\-.\/]+/g, '').trim() || '기념일'),
        cust + ' 님이 알려주신 기념일입니다. 축하 연락 드리세요.', 'anniv');
    }


    plans.forEach(function (p) {
      const j = normDate(p.join);
      const nm = p.name || '가입 보험';
      if (!j) return;

      /* 청약철회 · 품질보증 (신규계약 초기) */
      const w15 = addDays(j, 15);
      if (Calc.dday(w15, today) >= 0) {
        add(w15, '청약철회', nm + ' 청약철회 가능 기한',
          '이 날까지는 고객이 청약을 철회하실 수 있습니다. 그 전에 한 번 더 안심 연락을 드리면 유지율이 올라갑니다.', 'early');
      }
      const q3 = addMonths(j, 3);
      if (Calc.dday(q3, today) >= 0) {
        add(q3, '품질보증', nm + ' 품질보증해지 기한',
          '자필서명 · 약관 전달 · 청약서 부본 전달이 제대로 되었는지 확인해 두셔야 하는 기한입니다.', 'early');
      }

      /* 계약 해당일 (매년) */
      const anni = nextYearly(j.slice(5), today);
      add(anni, '계약 해당일', nm + ' 계약 해당일',
        '가입 1년째마다 돌아오는 날입니다. 보장 점검과 추가 니즈 확인에 좋은 시점입니다.', 'anni');

      /* 납입 만료일 · 보험 만기일 */
      const ia = birth ? Calc.insAge(birth, j) : null;
      const payend = normDate(p.payend) || (function () {
        const r = Calc.calcPayEnd(j, p.payterm, p.insend, ia ? ia.age : '');
        return r.value;
      })();
      if (payend) {
        add(payend, '납입 만료', nm + ' 보험료 납입 만료',
          '이 날 이후로는 보험료를 안 내셔도 보장은 계속됩니다. 여유가 생기시는 시점이라 추가 제안에 좋습니다.', 'payend');
      }
      const insend = normDate(p.insend);
      if (insend) {
        add(insend, '보험 만기', nm + ' 보장 만기',
          '이 날부터 보장이 끝납니다. 미리 이어갈 방법을 함께 정리해 두셔야 공백이 생기지 않습니다.', 'insend');
      }
    });

    /* 특약별 면책 종료(보장 개시)일 · 감액 종료일 — 약관에 적힌 값으로 계산합니다 */
    const cov = coverage(record, { today: today, dict: opts.dict, products: opts.products });
    const seen = {};
    cov.riders.concat(cov.mains).forEach(function (c) {
      if (!c.found || !c.name) return;
      const label = (c.plan ? c.plan + ' · ' : '') + c.name;

      if (c.waitEnd) {
        const start = addDays(c.waitEnd, 1);
        const k = 'w' + start + label;
        if (!seen[k]) {
          seen[k] = 1;
          add(start, '보장 개시', label + ' 보장 개시일',
            ymd(c.waitEnd) + ' 까지는 면책기간이라 보험금이 나오지 않고, ' + ymd(start) + ' 부터 보장이 시작됩니다. ' +
            '고객께 꼭 알려 드릴 날입니다.', 'wait');
        }
      }

      if (c.reduceEnd && c.reducing) {
        const full = addDays(c.reduceEnd, 1);
        const k = 'r' + full + label;
        if (!seen[k]) {
          seen[k] = 1;
          add(full, '감액 종료', label + ' 감액기간 종료 — 이 날부터 전액',
            ymd(c.reduceEnd) + ' 까지는 정해진 비율만 지급되고, ' + ymd(full) + ' 부터 전액 지급됩니다. ' +
            '그 전에 사고가 나면 절반만 나온다는 점을 미리 안내해 두세요.', 'cut');
        }
      }
    });

    /* 후속조치 · 차기 방문 */
    follows.forEach(function (x) {
      if (x.due) add(x.due, '후속조치', x.what || '후속조치 처리기한', '약속하신 일의 처리기한입니다.', 'follow');
    });
    if (f.m_next) add(f.m_next, '차기 방문', '차기 방문 예정일', '다음 방문 약속일입니다.', 'visit');

    out.sort(function (a, b) {
      const x = a.dday == null ? 99999 : a.dday, y = b.dday == null ? 99999 : b.dday;
      return x - y;
    });
    return out;
  }

  /* 다가오는 알림만 (기본 90일 이내, 지난 것은 30일까지) */
  function upcoming(list, ahead, back) {
    ahead = ahead == null ? 90 : ahead;
    back = back == null ? 30 : back;
    return list.filter(function (a) { return a.dday != null && a.dday <= ahead && a.dday >= -back; });
  }

  const Engine = {
    alerts: alerts, upcoming: upcoming, coverage: coverage,
    addDays: addDays, addMonths: addMonths, nextYearly: nextYearly, pickMMDD: pickMMDD
  };

  if (isNode) module.exports = Engine;
  else (global.NC = global.NC || {}).Engine = Engine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
