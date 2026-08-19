/*
 * 특약 사전 — 특약명을 보고 「보장받을 수 있는 영역」과 「지급보험금」을 계산합니다.
 *
 *   rate  : 가입금액 대비 비율 (1 = 100%)
 *   fixed : 가입금액과 상관없는 정액 (만원)
 *   per   : '1일당' 처럼 단위가 붙는 경우
 *   wait  : 면책기간(일) — 이 기간이 지나야 보장이 시작됩니다
 *   reduce: { days, rate } 가입 후 일정 기간 안에는 감액 지급
 *
 * ※ 아래 숫자는 흔히 쓰이는 **표준 예시**입니다. 상품마다 다르므로
 *   실제 약관 값으로 바꿔 쓰셔야 하고, 화면에서 직접 고치실 수 있습니다.
 *   (고치신 내용은 이 기기에 저장되어 다음에도 그대로 쓰입니다)
 */
(function (global) {
  'use strict';

  const BASE = [
    {
      key: 'chemo', label: '항암 방사선 · 약물치료',
      match: ['항암방사선', '항암약물', '항암방사선약물', '표적항암', '항암치료'],
      areas: ['암 치료를 위한 항암 방사선치료', '암 치료를 위한 항암 약물치료'],
      pays: [{ when: '해당 치료를 받았을 때', rate: 1 }],
      wait: 90, reduce: null,
      note: '진단만으로는 나오지 않고 실제 치료를 받아야 지급됩니다. 청구 누락이 많은 항목입니다.'
    },
    {
      key: 'thrombo', label: '혈전용해치료',
      match: ['혈전용해'],
      areas: ['급성뇌경색증으로 혈전용해치료를 받았을 때', '특정 급성심근경색증으로 혈전용해치료를 받았을 때'],
      pays: [{ when: '혈전용해치료', rate: 1 }],
      wait: 0, reduce: { days: 365, rate: 0.5 },
      note: '응급실에서 받는 치료라 고객이 보험금인 줄 모르고 지나치는 경우가 많습니다.'
    },
    {
      key: 'specialcase', label: '산정특례 대상 보장',
      match: ['산정특례'],
      areas: ['중증질환자 산정특례 등록 (뇌혈관질환 · 심장질환)', '희귀질환자 산정특례 등록'],
      pays: [{ when: '산정특례 대상자로 등록되었을 때', rate: 1 }],
      wait: 0, reduce: { days: 365, rate: 0.5 },
      note: '건강보험 산정특례 등록만으로 지급됩니다. 등록증을 챙기시라고 안내해 주세요.'
    },
    {
      key: 'dementia', label: '치매 진단',
      match: ['치매', 'CDR'],
      areas: ['경도이상치매 (CDR 1점 이상)', '중등도이상치매 (CDR 2점 이상)', '중증치매 (CDR 3점 이상)'],
      pays: [{ when: '해당 치매 진단확정', rate: 1 }],
      wait: 365, reduce: null,
      note: '가입 후 1년간 면책이 일반적입니다 (재해가 직접 원인이면 보장).'
    },
    {
      key: 'ltc', label: '장기요양 등급',
      match: ['장기요양', '요양등급', '시설급여', '재가급여', '방문요양', '주야간보호'],
      areas: ['노인장기요양보험 등급 판정 (1 ~ 5등급 · 인지지원등급)'],
      pays: [{ when: '해당 등급 판정', rate: 1 }],
      wait: 90, reduce: null,
      note: '가입 후 90일 면책이 일반적입니다 (재해가 직접 원인이면 보장). 등급 판정은 건강보험공단에서 받습니다.'
    },
    {
      key: 'caregiver', label: '간병인 사용',
      match: ['간병인', '간호간병', '간호·간병'],
      areas: ['입원해서 간병인을 썼을 때', '간호 · 간병 통합서비스 병동에 입원했을 때'],
      pays: [{ when: '사용 1일당', rate: 1, per: '1일당' }],
      wait: 0, reduce: { days: 365, rate: 0.5 },
      note: '1회 입원당 사용일수 180일 한도가 일반적입니다. 재해가 원인이면 감액 없이 100% 지급됩니다.'
    },
    {
      key: 'waiver', label: '보험료 납입면제',
      match: ['납입면제', '납입 면제', '보험료납입면제'],
      areas: ['암 · 뇌 · 심장 등 정해진 질병에 걸리면 남은 보험료를 안 내도 됩니다'],
      pays: [],
      wait: 90, reduce: null,
      note: '보험금이 나오는 특약이 아니라 보험료를 면제해 주는 특약입니다. 암은 가입 후 90일 면책입니다.'
    },
    {
      key: 'icu', label: '중환자실 입원',
      match: ['중환자실'],
      areas: ['중환자실에 입원했을 때'],
      pays: [{ when: '입원 1일당', rate: 1, per: '1일당' }],
      wait: 0, reduce: null,
      note: '1회 입원당 60일 한도가 일반적입니다.'
    },
    {
      key: 'er', label: '응급실 내원',
      match: ['응급실'],
      areas: ['응급실에 내원해 진료받았을 때'],
      pays: [{ when: '내원 1회당', rate: 1 }],
      wait: 0, reduce: null,
      note: '1일 1회에 한합니다. 소액이라 청구를 잊기 쉬우니 챙겨 주세요.'
    },
    {
      key: 'cast', label: '깁스 치료',
      match: ['깁스'],
      areas: ['재해로 깁스(부목 제외) 치료를 받았을 때'],
      pays: [{ when: '깁스치료 1회당', rate: 1 }],
      wait: 0, reduce: null,
      note: '부목은 빠지는 상품이 많습니다. 진단명과 치료방법을 확인하세요.'
    },
    {
      key: 'lifestyle', label: '생활습관병 · 특정질병 입원',
      match: ['생활습관병', '특정질병입원', '감염병'],
      areas: ['약관에서 정한 생활습관병 · 특정질병으로 입원했을 때'],
      pays: [{ when: '입원 1일당', rate: 1, per: '1일당' }],
      wait: 0, reduce: null,
      note: '1회 입원당 120일 한도가 일반적입니다.'
    },
    {
      key: 'annuity', label: '연금 · 변액',
      match: ['연금', '변액', '펀드'],
      areas: ['연금개시 후 생존하시는 동안 연금 지급', '연금개시 전 사망 시 사망보험금'],
      pays: [],
      wait: 0, reduce: null,
      note: '펀드 운용성과에 따라 연금액 · 해약환급금이 달라집니다. 자동 계산에서 뺐습니다.'
    },
    {
      key: 'cancer', label: '암 진단',
      match: ['암진단', '암보장', '고액암', '일반암', '암치료', '암특약'],
      areas: ['일반암 (위암 · 폐암 · 대장암 등)', '고액암 (백혈병 · 뇌암 · 골수암 등)',
        '유사암 (제자리암 · 경계성종양 · 기타피부암 · 갑상선암)'],
      pays: [
        { when: '일반암 진단확정', rate: 1 },
        { when: '유사암 진단확정', rate: 0.2 }
      ],
      wait: 90, reduce: { days: 365, rate: 0.5 },
      note: '가입 후 90일 면책, 1년 미만 진단 시 50% 감액이 일반적입니다.'
    },
    {
      key: 'brain', label: '뇌혈관질환 진단',
      match: ['뇌혈관', '뇌졸중', '뇌출혈', '뇌경색'],
      areas: ['뇌출혈', '뇌경색증', '기타 뇌혈관질환'],
      pays: [{ when: '뇌혈관질환 진단확정', rate: 1 }],
      wait: 0, reduce: null,
      note: '상품에 따라 보장범위(뇌출혈만 / 뇌졸중 / 뇌혈관질환 전체)가 다릅니다.'
    },
    {
      key: 'heart', label: '허혈성심장질환 진단',
      match: ['허혈성', '심장질환', '급성심근경색', '심근경색'],
      areas: ['급성심근경색증', '협심증', '기타 허혈성심장질환'],
      pays: [{ when: '허혈성심장질환 진단확정', rate: 1 }],
      wait: 0, reduce: null,
      note: '급성심근경색만 보장하는 특약과 협심증까지 보장하는 특약이 나뉩니다.'
    },
    {
      key: 'surg_d', label: '질병수술',
      match: ['질병수술', '수술특약', '수술급여'],
      areas: ['약관에서 정한 질병 수술 (1종 ~ 5종)'],
      pays: [
        { when: '수술 1종', rate: 0.1 },
        { when: '수술 2종', rate: 0.2 },
        { when: '수술 3종', rate: 0.4 },
        { when: '수술 4종', rate: 0.7 },
        { when: '수술 5종', rate: 1 }
      ],
      wait: 0, reduce: null,
      note: '수술 종별 분류와 지급률은 상품마다 다릅니다. 약관의 수술분류표를 확인하세요.'
    },
    {
      key: 'surg_a', label: '재해수술',
      match: ['재해수술'],
      areas: ['재해(사고)로 인한 수술'],
      pays: [{ when: '재해수술 1회당', rate: 1 }],
      wait: 0, reduce: null,
      note: '재해는 면책기간이 없는 것이 일반적입니다.'
    },
    {
      key: 'hosp_d', label: '질병입원',
      match: ['질병입원', '입원특약', '입원일당'],
      areas: ['질병으로 입원 (통상 4일째부터, 1회 입원 180일 한도)'],
      pays: [{ when: '입원 1일당', rate: 1, per: '1일당' }],
      wait: 0, reduce: null,
      note: '면책일수(3일)와 지급한도(120일 · 180일)는 약관에서 확인하세요.'
    },
    {
      key: 'hosp_a', label: '재해입원',
      match: ['재해입원', '상해입원'],
      areas: ['재해(사고)로 입원'],
      pays: [{ when: '입원 1일당', rate: 1, per: '1일당' }],
      wait: 0, reduce: null, note: ''
    },
    {
      key: 'fract', label: '골절 · 재해치료비',
      match: ['골절', '재해치료비', '깁스'],
      areas: ['재해로 인한 골절 (치아파절 포함하는 상품 있음)', '깁스 치료'],
      pays: [{ when: '골절 진단 1회당', rate: 1 }],
      wait: 0, reduce: null,
      note: '치아파절을 골절로 인정하는 상품이 있습니다. 청구 누락이 많은 항목입니다.'
    },
    {
      key: 'death_a', label: '재해사망',
      match: ['재해사망', '상해사망'],
      areas: ['재해(사고)로 사망'],
      pays: [{ when: '재해사망', rate: 1 }],
      wait: 0, reduce: null, note: ''
    },
    {
      key: 'death_d', label: '질병사망 · 주계약 사망',
      match: ['사망', '질병사망', '사망보험금', '종신'],
      areas: ['질병 또는 일반 사망'],
      pays: [{ when: '사망', rate: 1 }],
      wait: 0, reduce: { days: 730, rate: 0.5 },
      note: '자살 등 일부 사유는 2년 면책입니다.'
    },
    {
      key: 'disab', label: '후유장해',
      match: ['후유장해', '장해'],
      areas: ['재해 · 질병으로 남은 장해 (지급률 3% ~ 100%)'],
      pays: [{ when: '장해지급률 × 가입금액', rate: 1 }],
      wait: 0, reduce: null,
      note: '장해지급률만큼 비례해서 지급합니다. 치료 종결 후 판정합니다.'
    },
    {
      key: 'silson', label: '실손의료비',
      match: ['실손', '실비', '의료비'],
      areas: ['입원 · 통원 의료비 (급여 · 비급여)'],
      pays: [],
      wait: 0, reduce: null,
      note: '실제 낸 병원비를 보상합니다(비례보상). 세대(1~4세대)별 자기부담금이 달라 자동 계산에서 뺐습니다.'
    },
    {
      key: 'care', label: '간병 · 장기요양',
      match: ['간병', '요양', '치매', 'LTC'],
      areas: ['장기요양등급 판정', '중증치매 진단'],
      pays: [{ when: '해당 등급 · 진단 확정', rate: 1 }],
      wait: 0, reduce: null,
      note: '면책 · 감액기간이 긴 상품이 많습니다(예: 2년).'
    },
    {
      key: 'survival', label: '생존 · 만기급부',
      match: ['생존', '만기', '축하금', '건강관리자금'],
      areas: ['정해진 시점 생존 시 지급'],
      pays: [{ when: '해당 시점 생존', rate: 1 }],
      wait: 0, reduce: null,
      note: '신청하지 않으면 지급되지 않는 대표적인 숨은보험금입니다.'
    }
  ];

  /* 특약명으로 사전 항목 찾기 — 가장 길게 맞는 것을 고릅니다 */
  function find(name, list) {
    const n = String(name || '').replace(/\s/g, '');
    if (!n) return null;
    let best = null, bestLen = 0;
    (list || BASE).forEach(function (r) {
      r.match.forEach(function (m) {
        if (n.indexOf(m) >= 0 && m.length > bestLen) { best = r; bestLen = m.length; }
      });
    });
    return best;
  }

  /* 사전 항목 위에 상품(약관) 값을 덧씌웁니다 — 약관에 적힌 값이 언제나 우선입니다 */
  function overlay(base, spec) {
    if (!spec) return base;
    const b = base ? JSON.parse(JSON.stringify(base)) : { label: '', match: [], areas: [], pays: [], wait: 0, reduce: null, note: '' };
    if (spec.label) b.label = spec.label;
    if (spec.areas) b.areas = spec.areas;
    if (spec.pays) b.pays = spec.pays;
    if (spec.wait != null) b.wait = spec.wait;
    if (spec.reduce !== undefined) b.reduce = spec.reduce;
    if (spec.note) b.note = spec.note;
    if (spec.limit) b.limit = spec.limit;
    return b;
  }

  /*
   * 특약 한 줄에 대한 보장 계산
   *   rider : { name, amt }   amt = 가입금액(만원)
   *   join  : 계약일 (면책 · 감액 판정에 씀)
   *   spec  : 그 상품 약관에 적힌 값 (있으면 사전값보다 우선)
   */
  function coverage(rider, join, today, list, spec) {
    const byKey = (spec && spec.dict) ? (list || BASE).filter(function (r) { return r.key === spec.dict; })[0] : null;
    const hit = overlayOrNull(byKey || find(rider.name, list), spec);
    const amt = parseFloat(String(rider.amt || '').replace(/[^0-9.]/g, '')) || 0;
    const out = {
      name: rider.name || '', amt: amt, found: !!hit,
      label: hit ? hit.label : '', areas: hit ? hit.areas : [],
      note: hit ? hit.note : '', limit: hit ? (hit.limit || '') : '', pays: [], wait: hit ? hit.wait : 0,
      waitEnd: '', reduceEnd: '', reducing: false
    };
    if (!hit) return out;

    const j = /^\d{4}-\d{2}-\d{2}$/.test(String(join || '')) ? String(join) : '';
    if (j && hit.wait) out.waitEnd = addDays(j, hit.wait);
    if (j && hit.reduce) {
      out.reduceEnd = addDays(j, hit.reduce.days);
      if (today && out.reduceEnd >= today) out.reducing = true;
    }

    hit.pays.forEach(function (p) {
      const base = p.fixed ? p.fixed : amt * (p.rate || 0);
      const cut = (out.reducing && hit.reduce) ? base * hit.reduce.rate : base;
      out.pays.push({
        when: p.when, per: p.per || '',
        amount: cut, full: base,
        cut: out.reducing && cut !== base
      });
    });
    return out;
  }

  /* 사전에도 없고 약관에도 없으면 null — 화면에서 '사전에 없는 특약'으로 안내합니다 */
  function overlayOrNull(base, spec) {
    if (!base && !(spec && (spec.areas || spec.pays))) return null;
    return overlay(base, spec);
  }

  function addDays(ymd, n) {
    const d = new Date(ymd + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  const Riders = { BASE: BASE, find: find, coverage: coverage, addDays: addDays, overlay: overlay };

  if (typeof module !== 'undefined' && module.exports) module.exports = Riders;
  else (global.NC = global.NC || {}).Riders = Riders;
})(typeof globalThis !== 'undefined' ? globalThis : this);
