/*
 * 계약자 관리 — 상품제안서 불러오기
 *
 * 상품제안서(가입설계서)를 읽어 만든 「설계 코드」를 붙여넣으면
 * 고객 인적사항 · 보험 · 특약 · 가입금액 · 해약환급금 예시표가 한 번에 채워집니다.
 *
 * 특약을 하나씩 고르고 금액을 두드리는 일을 없애기 위한 입구입니다.
 *
 * ── 설계 코드 생김새 (JSON) ─────────────────────────────────────
 * {
 *   "형식": "교보FP-설계v1",
 *   "고객": { "성명": "홍길동", "생년월일": "1983-03-01", "성별": "남" },
 *   "계약": [{
 *     "보험명": "교보간편평생건강보험 PLUS (무배당)",
 *     "계약일": "2026-08-20", "피보험자": "본인",
 *     "가입금액": 10000, "보험료": 261000,
 *     "납입기간": "30년납", "보험기간": "종신",
 *     "주계약": {
 *       "이름": "암 · 2대질병 진단보험금",
 *       "면책일": 90, "감액": { "기간일": 365, "비율": 0.5 },
 *       "보장": [{ "급부": "암 진단보험금", "금액": 100000000 }]
 *     },
 *     "특약": [{
 *       "특약명": "(무)소액암진단특약(간편가입/갱신형)Ⅲ",
 *       "가입금액": 5000, "보험료": 13400,
 *       "납입기간": "5년납", "보험기간": "5년만기", "갱신종료나이": 100,
 *       "면책일": 90, "감액": { "기간일": 365, "비율": 0.5 },
 *       "보장": [{ "급부": "기타피부암진단보험금", "금액": 10000000 }]
 *     }],
 *     "환급금표": [{
 *       "경과": "1년", "나이": 44, "납입보험료": 3292800,
 *       "해약환급금": 0, "환급률": 0, "사망시지급액": 2265000, "구분": ""
 *     }]
 *   }]
 * }
 * ────────────────────────────────────────────────────────────
 *
 * 「보장」에 적은 급부는 그 보험의 약관 자료로 저장되어
 * ② 보장설명 · 알림 · 엑셀에 그대로 쓰입니다.
 * 화면의 [📕 보험 · 약관 고치기]에서 나중에 고치실 수 있습니다.
 */
(function (global) {
  'use strict';

  const isNode = (typeof module !== 'undefined' && module.exports);
  const Schema = isNode ? require('./schema.js') : global.NC.Schema;

  /* 어느 이름으로 적어도 알아듣게 합니다 */
  function pick(obj, names) {
    if (!obj) return undefined;
    for (let i = 0; i < names.length; i++) {
      const k = names[i];
      if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
    }
    return undefined;
  }

  function str(v) { return v == null ? '' : String(v).trim(); }

  function num(v) {
    if (v == null || v === '') return null;
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : null;
  }

  /* 0 도 뜻이 있는 값입니다 — 1년차 해약환급금 0원이 빈칸이 되면 안 됩니다 */
  function n0(v) {
    const n = num(v);
    return n == null ? '' : n;
  }

  /* '2026.08.20' · '20260820' · '2026-8-20' → '2026-08-20' */
  function date(v) {
    const s = str(v).replace(/[^0-9]/g, '');
    if (s.length === 8) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
    const m = str(v).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (m) return m[1] + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[3]).padStart(2, '0');
    return str(v);
  }

  /* ---------- 붙여넣은 글을 JSON 으로 ---------- */

  function parse(text) {
    let t = str(text);
    if (!t) return { ok: false, error: '붙여넣은 내용이 없습니다.' };

    /* 앞뒤에 붙은 코드 울타리(```json …```)를 걷어냅니다 */
    t = t.replace(/^\s*```[a-zA-Z]*\s*/, '').replace(/\s*```\s*$/, '').trim();

    /* 설명글이 앞에 붙어 있어도 첫 { 부터 마지막 } 까지만 씁니다 */
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b < a) return { ok: false, error: '설계 코드({ 로 시작하는 부분)를 찾지 못했습니다.' };
    t = t.slice(a, b + 1);

    let data;
    try { data = JSON.parse(t); }
    catch (e) {
      /* 흔한 실수 두 가지만 손봐서 한 번 더 */
      const fixed = t.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"');
      try { data = JSON.parse(fixed); }
      catch (e2) { return { ok: false, error: '설계 코드를 읽지 못했습니다 — ' + e.message }; }
    }
    if (!data || typeof data !== 'object') return { ok: false, error: '설계 코드의 모양이 올바르지 않습니다.' };

    const plans = pick(data, ['계약', '계약목록', 'plans', 'contracts']);
    if (!Array.isArray(plans) || !plans.length) {
      return { ok: false, error: '「계약」 목록이 비어 있습니다. 보험이 한 건 이상 있어야 합니다.' };
    }
    return { ok: true, data: data };
  }

  /* ---------- 급부 → 약관 자료 ----------
   * 제안서에 적힌 금액(원)을 가입금액 대비 비율로 바꿉니다.
   * 가입금액 1,000만원 · 급부 2,000만원 → 2.0 (가입금액을 고치면 같이 따라 움직입니다)
   */
  function paysOf(list, amtManwon) {
    const base = (num(amtManwon) || 0) * 10000;
    return (list || []).map(function (b) {
      const when = str(pick(b, ['급부', '급부명', '구분', '지급사유', 'when', 'name']));
      const money = num(pick(b, ['금액', '보장금액', '지급금액', 'amount']));
      const per = str(pick(b, ['단위', 'per']));
      const o = { when: when || '지급사유', per: per };
      if (money == null) return o;
      if (base > 0) o.rate = Math.round(money / base * 100000) / 100000;
      else o.fixed = money / 10000;                  /* 가입금액을 모르면 정액(만원)으로 */
      return o;
    }).filter(function (p) { return p.when; });
  }

  function reduceOf(v) {
    if (v == null || v === false) return null;
    if (typeof v === 'object') {
      const days = num(pick(v, ['기간일', '일수', 'days']));
      const rate = num(pick(v, ['비율', 'rate']));
      if (days == null) return null;
      return { days: days, rate: rate == null ? 0.5 : (rate > 1 ? rate / 100 : rate) };
    }
    const d = num(v);
    return d == null ? null : { days: d, rate: 0.5 };
  }

  /* 제안서 한 줄(주계약 또는 특약) → 약관 자료 한 칸 */
  function specOf(src, name, amt) {
    const cover = pick(src, ['보장', '급부', '지급내역', 'benefits']);
    const areas = pick(src, ['보장영역', 'areas']);
    const spec = { name: name };
    const dict = str(pick(src, ['사전', 'dict']));
    if (dict) spec.dict = dict;

    const pays = paysOf(cover, amt);
    if (pays.length) {
      spec.pays = pays;
      spec.areas = Array.isArray(areas) && areas.length
        ? areas.map(str)
        : (cover || []).map(function (b) {
          const w = str(pick(b, ['급부', '급부명', '구분', 'when', 'name']));
          const why = str(pick(b, ['지급사유', '사유', 'why']));
          return why ? w + ' — ' + why : w;
        }).filter(Boolean);
    } else if (Array.isArray(areas) && areas.length) {
      spec.areas = areas.map(str);
    }

    const wait = num(pick(src, ['면책일', '면책기간일', '면책', 'wait']));
    if (wait != null) spec.wait = wait;

    const red = pick(src, ['감액', 'reduce']);
    if (red !== undefined) spec.reduce = reduceOf(red);

    const limit = str(pick(src, ['보장한도', '한도', 'limit']));
    if (limit) spec.limit = limit;

    const easy = str(pick(src, ['설명', '쉬운설명', 'easy']));
    if (easy) spec.easy = easy;

    const note = str(pick(src, ['참고', '비고', 'note']));
    if (note) spec.note = note;

    return spec;
  }

  /* 이름에서 보험 열쇠말을 만듭니다 (같은 보험을 두 번 넣지 않도록) */
  function keyOf(name) {
    return 'imp_' + str(name).replace(/\s/g, '').replace(/[^가-힣a-zA-Z0-9]/g, '').slice(0, 40);
  }

  /* ---------- 설계 코드 → 화면에 넣을 자료 ---------- */

  /*
   *  → {
   *      f       : 고객 인적사항으로 채울 값
   *      rows    : { plans, riders, cash }
   *      products: 보험 · 약관 목록에 더할 상품들
   *      summary : 화면에 보여 줄 요약
   *    }
   */
  function toRecord(data) {
    const f = {};
    const cust = pick(data, ['고객', '고객정보', 'customer']) || {};

    const map = [
      ['h_cust', ['성명', '고객명', '이름', 'name']],
      ['p_birth', ['생년월일', '생일', 'birth']],
      ['p_sex', ['성별', 'sex']],
      ['p_phone', ['전화번호', '연락처', 'phone']],
      ['p_email', ['이메일', 'email']],
      ['p_job', ['직업', 'job']],
      ['p_addr', ['주소', 'addr']],
      ['p_anniv', ['기념일', 'anniv']],
      ['p_family', ['가족사항', '가족', 'family']],
      ['p_route', ['가입경로', '경로', 'route']],
      ['p_pay', ['납입방법', '이체일', 'pay']]
    ];
    map.forEach(function (m) {
      const v = pick(cust, m[1]);
      if (v === undefined) return;
      f[m[0]] = (m[0] === 'p_birth') ? date(v) : str(v);
    });

    const fp = str(pick(data, ['FP', 'fp', '지점', '설계자']));
    if (fp) f.h_fp = fp;

    const plansIn = pick(data, ['계약', '계약목록', 'plans', 'contracts']) || [];
    const plans = [], riders = [], cash = [], products = [];
    const warn = [];

    plansIn.forEach(function (P, pi) {
      const name = str(pick(P, ['보험명', '상품명', 'name']));
      const amt = num(pick(P, ['가입금액', '주계약가입금액', 'amt']));
      const join = date(pick(P, ['계약일', '가입일', 'join']));
      if (!name) warn.push((pi + 1) + '번째 계약에 보험명이 없습니다.');

      /* 주계약 */
      const mainSrc = pick(P, ['주계약', 'main']);
      const mainObj = (mainSrc && typeof mainSrc === 'object') ? mainSrc : {};
      const mainName = str(pick(mainObj, ['이름', '급부명', 'name'])) ||
        (typeof mainSrc === 'string' ? str(mainSrc) : '') || '주계약';

      plans.push({
        name: name,
        insured: str(pick(P, ['피보험자', 'insured'])) || '본인',
        join: join,
        main: mainName,
        amt: amt == null ? '' : amt,
        prem: n0(pick(P, ['보험료', '월보험료', 'prem'])),
        payterm: str(pick(P, ['납입기간', 'payterm'])),
        payend: date(pick(P, ['납입만료일', 'payend'])),
        insterm: str(pick(P, ['보험기간', 'insterm'])),
        insend: date(pick(P, ['보험만기일', '만기일', 'insend']))
      });

      /* 이 보험의 약관 자료 한 벌 */
      const prod = {
        key: keyOf(name), name: name,
        note: str(pick(P, ['비고', 'note'])) || '상품제안서에서 불러온 자료입니다.',
        main: specOf(mainObj, mainName, amt),
        riders: []
      };

      /* 특약 */
      const ridersIn = pick(P, ['특약', '특약목록', 'riders']) || [];
      ridersIn.forEach(function (R) {
        const rname = str(pick(R, ['특약명', '이름', 'name']));
        if (!rname) return;
        const ramt = num(pick(R, ['가입금액', 'amt']));
        riders.push({
          plan: name,
          name: rname,
          amt: ramt == null ? '' : ramt,
          prem: n0(pick(R, ['보험료', 'prem'])),
          payterm: str(pick(R, ['납입기간', 'payterm'])) || str(pick(P, ['납입기간', 'payterm'])),
          insterm: str(pick(R, ['보험기간', 'insterm'])),
          renewend: n0(pick(R, ['갱신종료나이', '갱신만료나이', 'renewend']))
        });
        prod.riders.push(specOf(R, rname, ramt));
      });

      products.push(prod);

      /* 해약환급금 예시표 */
      const cashIn = pick(P, ['환급금표', '해약환급금표', '환급금', 'cash']) || [];
      cashIn.forEach(function (C) {
        const year = str(pick(C, ['경과', '경과기간', '경과년수', 'year']));
        if (!year) return;
        cash.push({
          plan: name,
          year: year,
          age: n0(pick(C, ['나이', 'age'])),
          paid: n0(pick(C, ['납입보험료', '납입보험료누계', '누적보험료', 'paid'])),
          cv: n0(pick(C, ['해약환급금', '환급금', 'cv'])),
          rate: n0(pick(C, ['환급률', 'rate'])),
          death: n0(pick(C, ['사망시지급액', '사망보험금', '계약자적립액', 'death'])),
          mark: str(pick(C, ['구분', '표시', 'mark']))
        });
      });
    });

    const summary = {
      cust: f.h_cust || '',
      plans: plans.length,
      riders: riders.length,
      cash: cash.length,
      prem: plans.reduce(function (s, p) { return s + (num(p.prem) || 0); }, 0) +
        riders.reduce(function (s, r) { return s + (num(r.prem) || 0); }, 0),
      names: plans.map(function (p) { return p.name; }).filter(Boolean),
      riderNames: riders.map(function (r) { return r.name; }).filter(Boolean),
      warn: warn
    };

    return { f: f, rows: { plans: plans, riders: riders, cash: cash }, products: products, summary: summary };
  }

  /* 불러온 상품을 기존 보험 · 약관 목록에 더합니다 (같은 이름이면 갈아 끼웁니다) */
  function mergeProducts(list, add) {
    const out = (list || []).slice();
    (add || []).forEach(function (p) {
      const i = out.findIndex(function (x) {
        return x.key === p.key ||
          String(x.name || '').replace(/\s/g, '') === String(p.name || '').replace(/\s/g, '');
      });
      if (i >= 0) out[i] = p; else out.push(p);
    });
    return out;
  }

  /* 화면에 보여 줄 「이렇게 들어갑니다」 미리보기 */
  function previewText(r) {
    const s = r.summary;
    const L = [];
    if (s.cust) L.push('고객 : ' + s.cust);
    L.push('보험 ' + s.plans + '건 · 특약 ' + s.riders + '건 · 환급금표 ' + s.cash + '줄');
    if (s.prem) L.push('보험료 합계 : ' + Math.round(s.prem).toLocaleString('ko-KR') + '원');
    s.names.forEach(function (n) { L.push('· ' + n); });
    return L.join('\n');
  }

  /* 화면의 [예시 코드 넣어보기] 로 들어가는 견본입니다 (실제 상품제안서를 옮긴 모습) */
  const SAMPLE = {
    "형식": "교보FP-설계v1",
    "고객": {
      "성명": "홍길동(예시)",
      "생년월일": "1984-02-04",
      "성별": "여",
      "가입경로": "화면 [예시 코드 넣어보기] 로 넣은 견본입니다"
    },
    "FP": "교보생명 평촌FP 추진이",
    "계약": [
      {
        "보험명": "교보간편평생건강보험 PLUS (무배당)(저해약환급금형(50%),중복보장형)",
        "피보험자": "본인",
        "계약일": "2026-08-20",
        "가입금액": 10000,
        "보험료": 261000,
        "납입기간": "30년납",
        "보험기간": "종신",
        "비고": "간편심사 상품. 상품제안서 37쪽 · 설계일 2026-08-20 · 합계보험료 274,400원(월납).",
        "주계약": {
          "이름": "주요질병 진단보험금 (12종 중복보장)",
          "면책일": 90,
          "감액": {
            "기간일": 365,
            "비율": 0.5
          },
          "보장한도": "12가지 각각 최초 1회에 한해 보장 (최대 12회까지 진단보험금 지급 가능)",
          "설명": "암·뇌출혈·급성심근경색증을 포함한 12가지 큰 병에 각각 1억원이 나옵니다. 하나를 받으셔도 나머지 병은 그대로 살아 있어 최대 12번까지 받으실 수 있습니다. 돌아가시면 그때까지 쌓인 계약자적립액을 가족에게 드립니다.",
          "참고": "보장개시일 — 「주요질병」은 계약일부터 90일이 되는 날의 다음날부터 보장됩니다. 다만 뇌출혈·급성심근경색증·중대한 화상 및 부식은 계약일부터 바로 보장됩니다. 감액 — 계약일부터 1년 미만에 진단확정되면 50%만 지급됩니다. 납입면제 — 보험료 납입기간 중 지급사유가 하나라도 생기면 그 뒤 보험료는 면제됩니다. 저해약환급금형(50%)이라 납입기간 중 해약환급금이 일반형의 절반입니다.",
          "보장": [
            {
              "급부": "암 진단보험금",
              "금액": 100000000,
              "지급사유": "「주요질병 보장개시일」(계약일부터 90일이 되는 날의 다음날) 이후에 암으로 진단이 확정되었을 경우 (최초 1회에 한함)"
            },
            {
              "급부": "뇌출혈 진단보험금",
              "금액": 100000000,
              "지급사유": "뇌출혈으로 진단이 확정되었을 경우 (최초 1회에 한함) — 이 두 가지는 보장개시일이 계약일이라 가입 즉시 보장됩니다"
            },
            {
              "급부": "급성심근경색증 진단보험금",
              "금액": 100000000,
              "지급사유": "급성심근경색증으로 진단이 확정되었을 경우 (최초 1회에 한함) — 이 두 가지는 보장개시일이 계약일이라 가입 즉시 보장됩니다"
            },
            {
              "급부": "말기신부전증 진단보험금",
              "금액": 100000000,
              "지급사유": "「주요질병 보장개시일」(계약일부터 90일이 되는 날의 다음날) 이후에 말기신부전증으로 진단이 확정되었을 경우 (최초 1회에 한함)"
            },
            {
              "급부": "말기간질환 진단보험금",
              "금액": 100000000,
              "지급사유": "「주요질병 보장개시일」(계약일부터 90일이 되는 날의 다음날) 이후에 말기간질환으로 진단이 확정되었을 경우 (최초 1회에 한함)"
            },
            {
              "급부": "말기폐질환 진단보험금",
              "금액": 100000000,
              "지급사유": "「주요질병 보장개시일」(계약일부터 90일이 되는 날의 다음날) 이후에 말기폐질환으로 진단이 확정되었을 경우 (최초 1회에 한함)"
            },
            {
              "급부": "원발성 폐동맥 고혈압 진단보험금",
              "금액": 100000000,
              "지급사유": "「주요질병 보장개시일」(계약일부터 90일이 되는 날의 다음날) 이후에 원발성 폐동맥 고혈압으로 진단이 확정되었을 경우 (최초 1회에 한함)"
            },
            {
              "급부": "중증 세균성수막염 진단보험금",
              "금액": 100000000,
              "지급사유": "「주요질병 보장개시일」(계약일부터 90일이 되는 날의 다음날) 이후에 중증 세균성수막염으로 진단이 확정되었을 경우 (최초 1회에 한함)"
            },
            {
              "급부": "다발경화증 진단보험금",
              "금액": 100000000,
              "지급사유": "「주요질병 보장개시일」(계약일부터 90일이 되는 날의 다음날) 이후에 다발경화증으로 진단이 확정되었을 경우 (최초 1회에 한함)"
            },
            {
              "급부": "루게릭병(근위축성측삭경화증) 진단보험금",
              "금액": 100000000,
              "지급사유": "「주요질병 보장개시일」(계약일부터 90일이 되는 날의 다음날) 이후에 루게릭병(근위축성측삭경화증)으로 진단이 확정되었을 경우 (최초 1회에 한함)"
            },
            {
              "급부": "중증재생불량성빈혈 진단보험금",
              "금액": 100000000,
              "지급사유": "「주요질병 보장개시일」(계약일부터 90일이 되는 날의 다음날) 이후에 중증재생불량성빈혈으로 진단이 확정되었을 경우 (최초 1회에 한함)"
            },
            {
              "급부": "중대한 화상 및 부식 진단보험금",
              "금액": 100000000,
              "지급사유": "중대한 화상 및 부식(화학약품 등에 의한 피부손상)으로 진단이 확정되었을 경우 (최초 1회에 한함) — 계약일부터 바로 보장됩니다"
            }
          ]
        },
        "특약": [
          {
            "특약명": "소액암진단특약(간편가입/갱신형)Ⅲ",
            "가입금액": 5000,
            "보험료": 13400,
            "납입기간": "5년납",
            "보험기간": "5년만기",
            "갱신종료나이": 100,
            "면책일": 90,
            "감액": {
              "기간일": 365,
              "비율": 0.5
            },
            "보장한도": "각 급부 최초 1회에 한해 보장 (초기유방암은 여성에 한함)",
            "설명": "주계약에서 안 나오는 작은 암 — 갑상선암·제자리암·경계성종양·초기유방암 등에 걸리셨을 때 나옵니다. 주계약의 암 진단보험금과 별개로 받으실 수 있습니다.",
            "참고": "5년마다 갱신되고 최대 100세까지 갱신됩니다. 갱신할 때마다 그때 나이와 보험요율로 보험료가 다시 정해집니다. 주계약 납입(30년, 73세)이 끝나도 갱신형 특약은 100세까지 계속 내셔야 합니다. 제안서의 경과기간별 월 합계보험료 — 43~47세 274,400원 · 48~52세 274,350원 · 53~62세 273,750원 · 63~67세 273,650원 · 68~72세 273,500원 · 73~77세 11,750원(주계약 납입이 끝나 특약료만 남습니다). 암보장개시일은 계약일부터 90일이 되는 날의 다음날입니다.",
            "보장": [
              {
                "급부": "기타피부암진단보험금",
                "금액": 10000000,
                "지급사유": "기타피부암으로 진단이 확정될 경우 (최초 1회에 한함) ※ 가입 후 1년 미만에 진단확정되면 위 금액의 50%만 지급됩니다."
              },
              {
                "급부": "대장점막내암진단보험금",
                "금액": 10000000,
                "지급사유": "대장점막내암으로 진단이 확정될 경우 (최초 1회에 한함) ※ 가입 후 1년 미만에 진단확정되면 위 금액의 50%만 지급됩니다."
              },
              {
                "급부": "특정갑상선암진단보험금",
                "금액": 10000000,
                "지급사유": "특정갑상선암으로 진단이 확정될 경우 (최초 1회에 한함) ※ 가입 후 1년 미만에 진단확정되면 위 금액의 50%만 지급됩니다."
              },
              {
                "급부": "초기유방암진단보험금",
                "금액": 20000000,
                "지급사유": "초기유방암으로 진단이 확정될 경우 (최초 1회에 한함)  ※ 초기유방암은 여성에 한합니다. ※ 가입 후 1년 미만에 진단확정되면 위 금액의 50%만 지급됩니다."
              },
              {
                "급부": "전립선암진단보험금",
                "금액": 10000000,
                "지급사유": "전립선암으로 진단이 확정될 경우 (최초 1회에 한함) ※ 가입 후 1년 미만에 진단확정되면 위 금액의 50%만 지급됩니다."
              },
              {
                "급부": "경계성종양진단보험금",
                "금액": 10000000,
                "지급사유": "경계성종양으로 진단이 확정될 경우 (최초 1회에 한함) ※ 가입 후 1년 미만에 진단확정되면 위 금액의 50%만 지급됩니다."
              },
              {
                "급부": "제자리암진단보험금",
                "금액": 10000000,
                "지급사유": "제자리암으로 진단이 확정될 경우 (최초 1회에 한함) ※ 가입 후 1년 미만에 진단확정되면 위 금액의 50%만 지급됩니다."
              },
              {
                "급부": "양성뇌종양진단보험금",
                "금액": 10000000,
                "지급사유": "양성뇌종양으로 진단이 확정될 경우 (최초 1회에 한함) ※ 가입 후 1년 미만에 진단확정되면 위 금액의 50%만 지급됩니다."
              }
            ]
          }
        ],
        "환급금표": [
          {
            "경과": "3개월",
            "나이": 43,
            "납입보험료": 823200,
            "해약환급금": 0,
            "환급률": 0.0,
            "사망시지급액": 566250
          },
          {
            "경과": "6개월",
            "나이": 43,
            "납입보험료": 1646400,
            "해약환급금": 0,
            "환급률": 0.0,
            "사망시지급액": 1132500
          },
          {
            "경과": "1년",
            "나이": 44,
            "납입보험료": 3292800,
            "해약환급금": 0,
            "환급률": 0.0,
            "사망시지급액": 2265000
          },
          {
            "경과": "2년",
            "나이": 45,
            "납입보험료": 6585600,
            "해약환급금": 695643,
            "환급률": 10.6,
            "사망시지급액": 4771000
          },
          {
            "경과": "3년",
            "나이": 46,
            "납입보험료": 9878400,
            "해약환급금": 2013714,
            "환급률": 20.4,
            "사망시지급액": 7589000
          },
          {
            "경과": "5년",
            "나이": 48,
            "납입보험료": 16464000,
            "해약환급금": 4654357,
            "환급률": 28.3,
            "사망시지급액": 12712000
          },
          {
            "경과": "7년",
            "나이": 50,
            "납입보험료": 23048400,
            "해약환급금": 7299000,
            "환급률": 31.7,
            "사망시지급액": 17457000
          },
          {
            "경과": "10년",
            "나이": 53,
            "납입보험료": 32925000,
            "해약환급금": 10385000,
            "환급률": 31.5,
            "사망시지급액": 23979000
          },
          {
            "경과": "15년",
            "나이": 58,
            "납입보험료": 49350000,
            "해약환급금": 15492000,
            "환급률": 31.4,
            "사망시지급액": 33855000
          },
          {
            "경과": "20년",
            "나이": 63,
            "납입보험료": 65775000,
            "해약환급금": 20009500,
            "환급률": 30.4,
            "사망시지급액": 42004000
          },
          {
            "경과": "25년",
            "나이": 68,
            "납입보험료": 82194000,
            "해약환급금": 24127000,
            "환급률": 29.4,
            "사망시지급액": 49276000
          },
          {
            "경과": "30년",
            "나이": 73,
            "납입보험료": 98604000,
            "해약환급금": 64344000,
            "환급률": 65.3,
            "사망시지급액": 64344000,
            "구분": "납입완료"
          },
          {
            "경과": "35년",
            "나이": 78,
            "납입보험료": 99309000,
            "해약환급금": 60001161,
            "환급률": 60.4,
            "사망시지급액": 60001161
          },
          {
            "경과": "40년",
            "나이": 83,
            "납입보험료": 99963000,
            "해약환급금": 54352442,
            "환급률": 54.4,
            "사망시지급액": 54352442
          },
          {
            "경과": "47년",
            "나이": 90,
            "납입보험료": 100756200,
            "해약환급금": 45594239,
            "환급률": 45.3,
            "사망시지급액": 45594239
          },
          {
            "경과": "57년",
            "나이": 100,
            "납입보험료": 101985600,
            "해약환급금": 32858142,
            "환급률": 32.2,
            "사망시지급액": 32858142,
            "구분": "표의 마지막 (100세)"
          }
        ]
      }
    ]
  };

  const Importer = {
    parse: parse, toRecord: toRecord, mergeProducts: mergeProducts,
    previewText: previewText, keyOf: keyOf, specOf: specOf, paysOf: paysOf,
    SAMPLE: SAMPLE
  };

  if (isNode) module.exports = Importer;
  else (global.NC = global.NC || {}).Importer = Importer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
