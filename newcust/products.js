/*
 * 상품(보험) 목록 — 보험명을 고르면 그 상품의 약관 지급기준으로 보험금이 계산됩니다.
 *
 *   name    : 화면 드롭다운에 뜨는 보험명
 *   main    : 주계약 { name, dict }
 *   riders  : 그 상품에 붙는 특약 목록
 *             { name, dict, areas?, pays?, wait?, reduce? }
 *             dict  = 특약 사전(riders.js)의 key — 적지 않으면 특약명으로 찾습니다
 *             areas / pays / wait / reduce 를 적으면 그 상품의 약관 값이 사전값보다 우선합니다
 *
 * ※ 지금 들어 있는 값은 흔히 쓰이는 **표준 예시**입니다.
 *   약관을 주시면 그대로 채워 넣고, 그 전에도 화면 [⚙ 보험 · 약관 고치기]에서 직접 넣으실 수 있습니다.
 */
(function (global) {
  'use strict';

  const BASE = [
    {
      key: 'kb_jongsin', name: '교보 New 든든한 종신보험',
      note: '표준 예시값입니다. 약관을 받으면 그대로 채워 넣습니다.',
      main: { name: '사망', dict: 'death_d' },
      riders: [
        { name: '질병수술특약', dict: 'surg_d' },
        { name: '재해수술특약', dict: 'surg_a' },
        { name: '재해골절치료특약', dict: 'fract' },
        { name: '재해사망특약', dict: 'death_a' },
        { name: '후유장해특약', dict: 'disab' },
        { name: '질병입원특약', dict: 'hosp_d' }
      ]
    },
    {
      key: 'kb_cancer', name: '교보 건강백세 암보험',
      note: '표준 예시값입니다. 약관을 받으면 그대로 채워 넣습니다.',
      main: { name: '암진단', dict: 'cancer' },
      riders: [
        { name: '암진단특약', dict: 'cancer' },
        { name: '유사암진단특약', dict: 'cancer', areas: ['제자리암 · 경계성종양 · 기타피부암 · 갑상선암'], pays: [{ when: '유사암 진단확정', rate: 1 }], wait: 90, reduce: { days: 365, rate: 0.5 } },
        { name: '뇌혈관질환진단특약', dict: 'brain' },
        { name: '허혈성심장질환진단특약', dict: 'heart' },
        { name: '항암방사선약물치료특약', dict: 'cancer', areas: ['암 치료를 위한 항암 방사선 · 약물치료'], pays: [{ when: '치료 1회당', rate: 1 }], wait: 90, reduce: null }
      ]
    },
    {
      key: 'kb_health', name: '교보 실손의료비보험',
      note: '실손은 실제 낸 병원비를 보상해 자동 계산에서 뺐습니다.',
      main: { name: '실손의료비', dict: 'silson' },
      riders: [{ name: '비급여 실손의료비', dict: 'silson' }]
    },
    {
      key: 'kb_care', name: '교보 간병 · 치매보험',
      note: '표준 예시값입니다. 약관을 받으면 그대로 채워 넣습니다.',
      main: { name: '장기요양 진단', dict: 'care' },
      riders: [
        { name: '중증치매진단특약', dict: 'care' },
        { name: '장기요양등급특약', dict: 'care' }
      ]
    }
  ];

  /* 이름으로 상품 찾기 — 공백을 빼고 서로 품고 있으면 같은 상품으로 봅니다 */
  function find(list, name) {
    const n = String(name || '').replace(/\s/g, '');
    if (!n) return null;
    let best = null, bestLen = 0;
    (list || BASE).forEach(function (p) {
      const a = String(p.name || '').replace(/\s/g, '');
      if (!a) return;
      if ((a.indexOf(n) >= 0 || n.indexOf(a) >= 0) && a.length > bestLen) { best = p; bestLen = a.length; }
    });
    return best;
  }

  /* 그 상품 안에서 특약 한 줄 찾기 (주계약도 포함) */
  function riderSpec(product, riderName) {
    if (!product) return null;
    const n = String(riderName || '').replace(/\s/g, '');
    if (!n) return null;
    const pool = (product.riders || []).concat(product.main ? [product.main] : []);
    /* ① 이름이 똑같은 것 */
    const exact = pool.filter(function (r) { return String(r.name || '').replace(/\s/g, '') === n; })[0];
    if (exact) return exact;
    /* ② 약관에 적힌 이름이 입력한 이름 안에 통째로 들어 있는 것 중 가장 긴 것
     *    (거꾸로는 보지 않습니다 — '암진단' 이 '유사암진단특약' 을 잡아채면 안 되니까요) */
    let best = null, bestLen = 0;
    pool.forEach(function (r) {
      const a = String(r.name || '').replace(/\s/g, '');
      if (a && n.indexOf(a) >= 0 && a.length > bestLen) { best = r; bestLen = a.length; }
    });
    return best;
  }

  /* 드롭다운에 넣을 보험명 목록 */
  function names(list) {
    return (list || BASE).map(function (p) { return p.name; }).filter(Boolean);
  }

  /* 그 보험에 붙는 특약명 목록 (드롭다운용) */
  function riderNames(product) {
    if (!product) return [];
    return (product.riders || []).map(function (r) { return r.name; }).filter(Boolean);
  }

  const Products = { BASE: BASE, find: find, riderSpec: riderSpec, names: names, riderNames: riderNames };

  if (typeof module !== 'undefined' && module.exports) module.exports = Products;
  else (global.NC = global.NC || {}).Products = Products;
})(typeof globalThis !== 'undefined' ? globalThis : this);
