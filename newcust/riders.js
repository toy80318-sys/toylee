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
      note: hit ? hit.note : '', pays: [], wait: hit ? hit.wait : 0,
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
