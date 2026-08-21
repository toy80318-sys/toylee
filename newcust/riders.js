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
      easy: '암에 걸린 것만으로는 나오지 않고, 실제로 항암 방사선치료나 항암 약물치료를 받으셔야 나옵니다. 치료를 받으신 그 달에 바로 청구하시면 됩니다.',
      match: ['항암방사선', '항암약물', '항암방사선약물', '표적항암', '항암치료'],
      areas: ['암 치료를 위한 항암 방사선치료', '암 치료를 위한 항암 약물치료'],
      pays: [{ when: '해당 치료를 받았을 때', rate: 1 }],
      wait: 90, reduce: null,
      note: '진단만으로는 나오지 않고 실제 치료를 받아야 지급됩니다. 청구 누락이 많은 항목입니다.'
    },
    {
      key: 'thrombo', label: '혈전용해치료',
      easy: '뇌경색이나 심근경색으로 응급실에 실려가 막힌 혈관을 뚫는 주사(혈전용해제)를 맞으셨을 때 나옵니다. 응급처치라 보험금인 줄 모르고 지나치기 쉬운 항목입니다.',
      match: ['혈전용해'],
      areas: ['급성뇌경색증으로 혈전용해치료를 받았을 때', '특정 급성심근경색증으로 혈전용해치료를 받았을 때'],
      pays: [{ when: '혈전용해치료', rate: 1 }],
      wait: 0, reduce: { days: 365, rate: 0.5 },
      note: '응급실에서 받는 치료라 고객이 보험금인 줄 모르고 지나치는 경우가 많습니다.'
    },
    {
      key: 'specialcase', label: '산정특례 대상 보장',
      easy: '건강보험공단에 중증질환·희귀질환 산정특례 대상자로 등록만 되면 나옵니다. 등록증(산정특례 등록확인서)만 떼어 오시면 됩니다.',
      match: ['산정특례'],
      areas: ['중증질환자 산정특례 등록 (뇌혈관질환 · 심장질환)', '희귀질환자 산정특례 등록'],
      pays: [{ when: '산정특례 대상자로 등록되었을 때', rate: 1 }],
      wait: 0, reduce: { days: 365, rate: 0.5 },
      note: '건강보험 산정특례 등록만으로 지급됩니다. 등록증을 챙기시라고 안내해 주세요.'
    },
    {
      key: 'dementia', label: '치매 진단',
      easy: '치매 검사에서 CDR 점수가 나오면 그 점수에 따라 나옵니다. 점수가 높을수록(중증일수록) 금액이 큽니다. 진단서와 검사 결과지가 필요합니다.',
      match: ['치매', 'CDR'],
      areas: ['경도이상치매 (CDR 1점 이상)', '중등도이상치매 (CDR 2점 이상)', '중증치매 (CDR 3점 이상)'],
      pays: [{ when: '해당 치매 진단확정', rate: 1 }],
      wait: 365, reduce: null,
      note: '가입 후 1년간 면책이 일반적입니다 (재해가 직접 원인이면 보장).'
    },
    {
      key: 'ltc', label: '장기요양 등급',
      easy: '건강보험공단에서 노인장기요양 등급을 받으시면 나옵니다. 등급 판정 통지서 한 장이면 청구됩니다.',
      match: ['장기요양', '요양등급', '시설급여', '재가급여', '방문요양', '주야간보호'],
      areas: ['노인장기요양보험 등급 판정 (1 ~ 5등급 · 인지지원등급)'],
      pays: [{ when: '해당 등급 판정', rate: 1 }],
      wait: 90, reduce: null,
      note: '가입 후 90일 면책이 일반적입니다 (재해가 직접 원인이면 보장). 등급 판정은 건강보험공단에서 받습니다.'
    },
    {
      key: 'caregiver', label: '간병인 사용',
      easy: '입원해서 간병인을 쓰셨거나, 간호·간병 통합서비스 병동(보호자 없는 병동)에 입원하셨을 때 하루 단위로 나옵니다. 간병인 영수증을 꼭 챙기세요.',
      match: ['간병인', '간호간병', '간호·간병'],
      areas: ['입원해서 간병인을 썼을 때', '간호 · 간병 통합서비스 병동에 입원했을 때'],
      pays: [{ when: '사용 1일당', rate: 1, per: '1일당' }],
      wait: 0, reduce: { days: 365, rate: 0.5 },
      note: '1회 입원당 사용일수 180일 한도가 일반적입니다. 재해가 원인이면 감액 없이 100% 지급됩니다.'
    },
    {
      key: 'waiver', label: '보험료 납입면제',
      easy: '보험금이 나오는 특약이 아니라, 정해진 병에 걸리시면 그 뒤로 보험료를 안 내셔도 보장은 그대로 가는 특약입니다. 형편이 어려워지는 시점에 가장 크게 쓰입니다.',
      match: ['납입면제', '납입 면제', '보험료납입면제'],
      areas: ['암 · 뇌 · 심장 등 정해진 질병에 걸리면 남은 보험료를 안 내도 됩니다'],
      pays: [],
      wait: 90, reduce: null,
      note: '보험금이 나오는 특약이 아니라 보험료를 면제해 주는 특약입니다. 암은 가입 후 90일 면책입니다.'
    },
    {
      key: 'icu', label: '중환자실 입원',
      easy: '일반 병실이 아니라 중환자실에 입원하셨을 때 하루 단위로 따로 더 나옵니다. 일반 입원비와 같이 받으실 수 있습니다.',
      match: ['중환자실'],
      areas: ['중환자실에 입원했을 때'],
      pays: [{ when: '입원 1일당', rate: 1, per: '1일당' }],
      wait: 0, reduce: null,
      note: '1회 입원당 60일 한도가 일반적입니다.'
    },
    {
      key: 'er', label: '응급실 내원',
      easy: '응급실에 가서 진료를 받으시면 나옵니다. 금액은 작지만 자주 생기는 일이라 모아 두면 꽤 됩니다. 응급실 진료비 영수증을 버리지 마세요.',
      match: ['응급실'],
      areas: ['응급실에 내원해 진료받았을 때'],
      pays: [{ when: '내원 1회당', rate: 1 }],
      wait: 0, reduce: null,
      note: '1일 1회에 한합니다. 소액이라 청구를 잊기 쉬우니 챙겨 주세요.'
    },
    {
      key: 'cast', label: '깁스 치료',
      easy: '다치셔서 깁스를 하셨을 때 나옵니다. 다만 부목(반깁스)은 빠지는 상품이 많으니 진단서에 적힌 치료 방법을 확인하셔야 합니다.',
      match: ['깁스'],
      areas: ['재해로 깁스(부목 제외) 치료를 받았을 때'],
      pays: [{ when: '깁스치료 1회당', rate: 1 }],
      wait: 0, reduce: null,
      note: '부목은 빠지는 상품이 많습니다. 진단명과 치료방법을 확인하세요.'
    },
    {
      key: 'lifestyle', label: '생활습관병 · 특정질병 입원',
      easy: '당뇨·고혈압 같은 생활습관병이나 약관에 정해진 병으로 입원하셨을 때 하루 단위로 나옵니다.',
      match: ['생활습관병', '특정질병입원', '감염병'],
      areas: ['약관에서 정한 생활습관병 · 특정질병으로 입원했을 때'],
      pays: [{ when: '입원 1일당', rate: 1, per: '1일당' }],
      wait: 0, reduce: null,
      note: '1회 입원당 120일 한도가 일반적입니다.'
    },
    {
      key: 'annuity', label: '연금 · 변액',
      easy: '노후에 연금으로 받으시는 부분입니다. 펀드 운용 성과에 따라 연금액과 해약환급금이 달라져서 미리 정해진 금액을 말씀드릴 수 없습니다.',
      match: ['연금', '변액', '펀드'],
      areas: ['연금개시 후 생존하시는 동안 연금 지급', '연금개시 전 사망 시 사망보험금'],
      pays: [],
      wait: 0, reduce: null,
      note: '펀드 운용성과에 따라 연금액 · 해약환급금이 달라집니다. 자동 계산에서 뺐습니다.'
    },
    {
      key: 'cancer', label: '암 진단',
      easy: '암 진단을 받으시면 나옵니다. 같은 암이라도 종류에 따라 금액이 다릅니다 — 위암·폐암 같은 일반암은 전액, 갑상선암·제자리암 같은 유사암은 그보다 적게 나옵니다. 조직검사 결과지가 있어야 합니다.',
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
      easy: '뇌출혈·뇌경색 같은 뇌혈관질환 진단을 받으시면 나옵니다. 진단서에 적힌 질병분류코드(I60~I69)로 판단합니다.',
      match: ['뇌혈관', '뇌졸중', '뇌출혈', '뇌경색'],
      areas: ['뇌출혈', '뇌경색증', '기타 뇌혈관질환'],
      pays: [{ when: '뇌혈관질환 진단확정', rate: 1 }],
      wait: 0, reduce: null,
      note: '상품에 따라 보장범위(뇌출혈만 / 뇌졸중 / 뇌혈관질환 전체)가 다릅니다.'
    },
    {
      key: 'heart', label: '허혈성심장질환 진단',
      easy: '심근경색·협심증 같은 심장 혈관 질환 진단을 받으시면 나옵니다. 진단서의 질병분류코드(I20~I25)로 판단합니다.',
      match: ['허혈성', '심장질환', '급성심근경색', '심근경색'],
      areas: ['급성심근경색증', '협심증', '기타 허혈성심장질환'],
      pays: [{ when: '허혈성심장질환 진단확정', rate: 1 }],
      wait: 0, reduce: null,
      note: '급성심근경색만 보장하는 특약과 협심증까지 보장하는 특약이 나뉩니다.'
    },
    {
      key: 'surg_d', label: '질병수술',
      easy: '병으로 수술을 받으시면 나옵니다. 수술의 크기에 따라 1종부터 5종까지 나뉘고 종이 높을수록 많이 나옵니다. 수술확인서에 적힌 수술명으로 종을 정합니다.',
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
      easy: '다치셔서(재해) 수술을 받으시면 나옵니다. 병으로 인한 수술과는 별개로 나옵니다.',
      match: ['재해수술'],
      areas: ['재해(사고)로 인한 수술'],
      pays: [{ when: '재해수술 1회당', rate: 1 }],
      wait: 0, reduce: null,
      note: '재해는 면책기간이 없는 것이 일반적입니다.'
    },
    {
      key: 'hosp_d', label: '질병입원',
      easy: '병으로 입원하시면 하루 단위로 나옵니다. 며칠부터 나오는지(면책일수)와 최대 며칠까지 나오는지(한도)를 꼭 같이 봐 주세요.',
      match: ['질병입원', '입원특약', '입원일당'],
      areas: ['질병으로 입원 (통상 4일째부터, 1회 입원 180일 한도)'],
      pays: [{ when: '입원 1일당', rate: 1, per: '1일당' }],
      wait: 0, reduce: null,
      note: '면책일수(3일)와 지급한도(120일 · 180일)는 약관에서 확인하세요.'
    },
    {
      key: 'hosp_a', label: '재해입원',
      easy: '다치셔서(재해) 입원하시면 하루 단위로 나옵니다.',
      match: ['재해입원', '상해입원'],
      areas: ['재해(사고)로 입원'],
      pays: [{ when: '입원 1일당', rate: 1, per: '1일당' }],
      wait: 0, reduce: null, note: ''
    },
    {
      key: 'fract', label: '골절 · 재해치료비',
      easy: '다치셔서 뼈가 부러지셨을 때 나옵니다. 금이 간 것(골절)도 포함되니 엑스레이 판독 결과를 확인해 보세요.',
      match: ['골절', '재해치료비', '깁스'],
      areas: ['재해로 인한 골절 (치아파절 포함하는 상품 있음)', '깁스 치료'],
      pays: [{ when: '골절 진단 1회당', rate: 1 }],
      wait: 0, reduce: null,
      note: '치아파절을 골절로 인정하는 상품이 있습니다. 청구 누락이 많은 항목입니다.'
    },
    {
      key: 'death_a', label: '재해사망',
      easy: '교통사고처럼 뜻밖의 사고(재해)로 돌아가셨을 때 나옵니다. 일반 사망보험금에 더해서 나옵니다.',
      match: ['재해사망', '상해사망'],
      areas: ['재해(사고)로 사망'],
      pays: [{ when: '재해사망', rate: 1 }],
      wait: 0, reduce: null, note: ''
    },
    {
      key: 'death_d', label: '질병사망 · 주계약 사망',
      easy: '돌아가셨을 때 남은 가족에게 나오는 돈입니다. 이 보험의 가장 큰 목적이고, 상속세 재원이나 남은 가족의 생활비로 쓰입니다.',
      match: ['사망', '질병사망', '사망보험금', '종신'],
      areas: ['질병 또는 일반 사망'],
      pays: [{ when: '사망', rate: 1 }],
      wait: 0, reduce: { days: 730, rate: 0.5 },
      note: '자살 등 일부 사유는 2년 면책입니다.'
    },
    {
      key: 'disab', label: '후유장해',
      easy: '치료가 끝난 뒤에도 몸에 장해가 남았을 때, 장해 정도(지급률 %)만큼 곱해서 나옵니다. 장해가 심할수록 많이 나옵니다.',
      match: ['후유장해', '장해'],
      areas: ['재해 · 질병으로 남은 장해 (지급률 3% ~ 100%)'],
      pays: [{ when: '장해지급률 × 가입금액', rate: 1 }],
      wait: 0, reduce: null,
      note: '장해지급률만큼 비례해서 지급합니다. 치료 종결 후 판정합니다.'
    },
    {
      key: 'silson', label: '실손의료비',
      easy: '병원에서 실제로 내신 치료비를 돌려받는 부분입니다. 자기부담금을 빼고 나오며 금액이 사람마다 달라 여기서는 자동 계산하지 않습니다.',
      match: ['실손', '실비', '의료비'],
      areas: ['입원 · 통원 의료비 (급여 · 비급여)'],
      pays: [],
      wait: 0, reduce: null,
      note: '실제 낸 병원비를 보상합니다(비례보상). 세대(1~4세대)별 자기부담금이 달라 자동 계산에서 뺐습니다.'
    },
    {
      key: 'care', label: '간병 · 장기요양',
      easy: '나이가 드셔서 혼자 생활하기 어려워졌을 때, 장기요양 등급이나 일상생활장해 진단을 받으시면 나옵니다.',
      match: ['간병', '요양', '치매', 'LTC'],
      areas: ['장기요양등급 판정', '중증치매 진단'],
      pays: [{ when: '해당 등급 · 진단 확정', rate: 1 }],
      wait: 0, reduce: null,
      note: '면책 · 감액기간이 긴 상품이 많습니다(예: 2년).'
    },
    {
      key: 'survival', label: '생존 · 만기급부',
      easy: '살아 계시는 동안 또는 만기까지 계약을 지키셨을 때 돌려받는 돈입니다.',
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
    const b = base ? JSON.parse(JSON.stringify(base)) : { label: '', match: [], areas: [], pays: [], wait: 0, reduce: null, note: '', easy: '' };
    if (spec.label) b.label = spec.label;
    if (spec.areas) b.areas = spec.areas;
    if (spec.pays) b.pays = spec.pays;
    if (spec.wait != null) b.wait = spec.wait;
    if (spec.reduce !== undefined) b.reduce = spec.reduce;
    if (spec.note) b.note = spec.note;
    if (spec.limit) b.limit = spec.limit;
    if (spec.easy) b.easy = spec.easy;
    return b;
  }

  /*
   * 특약 한 줄에 대한 보장 계산
   *   rider : { name, amt }   amt = 가입금액(만원)
   *   join  : 계약일 (면책 · 감액 판정에 씀)
   *   spec  : 그 상품 약관에 적힌 값 (있으면 사전값보다 우선)
   */
  function coverage(rider, join, today, list, spec, ageAtJoin) {
    const byKey = (spec && spec.dict) ? (list || BASE).filter(function (r) { return r.key === spec.dict; })[0] : null;
    const hit = overlayOrNull(byKey || find(rider.name, list), spec);
    const amt = parseFloat(String(rider.amt || '').replace(/[^0-9.]/g, '')) || 0;
    const out = {
      name: rider.name || '', amt: amt, found: !!hit,
      label: hit ? hit.label : '', areas: hit ? hit.areas : [],
      easy: hit ? (hit.easy || '') : '',
      note: hit ? hit.note : '', limit: hit ? (hit.limit || '') : '', pays: [], wait: hit ? hit.wait : 0,
      waitEnd: '', reduceEnd: '', reducing: false,
      reduceRate: hit && hit.reduce ? hit.reduce.rate : 0,
      insterm: rider.insterm || '', payterm: rider.payterm || '', prem: rider.prem || '',
      renew: { on: false, cycle: 0, endAge: 0, next: '', dates: [], last: '' }
    };
    out.renew = renewal(rider, join, ageAtJoin, today);
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


  /* ---------- 갱신 ----------
   * 갱신형 특약은 보험기간이 곧 갱신주기입니다 (10년만기 갱신형 → 10년마다 갱신).
   * 갱신 종료나이는 상품마다 달라 자동으로 알 수 없으므로,
   * 상품제안서에서 옮겨 넣은 값(renewend)이 있을 때만 씁니다.
   */
  function isRenewable(name) {
    return /갱신형|갱신형\)|\(갱신/.test(String(name || ''));
  }

  /* '10년만기' → 10 · '80세만기' → null (나이만기는 갱신주기가 아닙니다) */
  function cycleOf(insterm) {
    const m = String(insterm || '').match(/(\d+)\s*년\s*만기/);
    return m ? +m[1] : 0;
  }

  function addYears(ymdStr, n) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymdStr || ''))) return '';
    const y = +ymdStr.slice(0, 4) + n, mo = +ymdStr.slice(5, 7), d = +ymdStr.slice(8, 10);
    const last = new Date(y, mo, 0).getDate();
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(Math.min(d, last)).padStart(2, '0');
  }

  /*
   * 갱신 안내를 만듭니다.
   *   rider : { name, insterm, renewend }   join : 계약일   ageAtJoin : 가입 당시 보험나이
   *   → { on, cycle, endAge, next, dates[], last }
   */
  function renewal(rider, join, ageAtJoin, today) {
    const out = { on: false, cycle: 0, endAge: 0, next: '', dates: [], last: '' };
    if (!isRenewable(rider.name)) return out;
    out.on = true;
    out.cycle = cycleOf(rider.insterm);
    out.endAge = parseInt(String(rider.renewend || '').replace(/[^0-9]/g, ''), 10) || 0;
    if (!out.cycle || !/^\d{4}-\d{2}-\d{2}$/.test(String(join || ''))) return out;

    const start = parseInt(ageAtJoin, 10);
    for (let i = 1; i <= 12; i++) {
      const age = isFinite(start) ? start + out.cycle * i : null;
      if (out.endAge && age != null && age > out.endAge) break;
      const d = addYears(join, out.cycle * i);
      if (!d) break;
      out.dates.push({ date: d, age: age, no: i });
      if (out.endAge && age != null && age === out.endAge) break;
    }
    out.last = out.dates.length ? out.dates[out.dates.length - 1].date : '';
    if (today) {
      const up = out.dates.filter(function (x) { return x.date >= today; })[0];
      out.next = up ? up.date : '';
    }
    return out;
  }

  function addDays(ymd, n) {
    const d = new Date(ymd + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  const Riders = { BASE: BASE, find: find, coverage: coverage, addDays: addDays, overlay: overlay,
    renewal: renewal, isRenewable: isRenewable, cycleOf: cycleOf, addYears: addYears };

  if (typeof module !== 'undefined' && module.exports) module.exports = Riders;
  else (global.NC = global.NC || {}).Riders = Riders;
})(typeof globalThis !== 'undefined' ? globalThis : this);
