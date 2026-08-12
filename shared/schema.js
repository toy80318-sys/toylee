/*
 * 항목 정의 — 이 파일 하나가 기준입니다.
 * 여기에 항목을 추가하면 서버 DB 컬럼 · 엑셀 서식 · CSV 내보내기가 함께 따라옵니다.
 * (웹 입력화면은 회사 양식 배치를 그대로 살리기 위해 public/index.html 에서 직접 그리며,
 *  입력칸 id 는 아래 k 값과 1:1 로 맞춰져 있습니다. 서버가 기동할 때 누락 여부를 검사합니다.)
 */
(function (global) {
  'use strict';

  const OX = ['O', 'X'];

  const SECTIONS = [
    {
      key: 'head', no: '', title: '방문 기본정보',
      desc: '누구를, 언제 방문하는지에 대한 기본 정보입니다.',
      fields: [
        { k: 'h_cust', label: '고객(계약자) 성명', type: 'text', required: true },
        { k: 'h_fp', label: 'FP', type: 'text' },
        { k: 'h_vdate', label: '방문예정일', type: 'date' }
      ]
    },
    {
      key: 'person', no: 1, title: '인적사항',
      desc: '계약 기본 정보입니다. 가입일은 2006년 2월 이전 여부를 판정하는 데 쓰입니다.',
      fields: [
        { k: 'i_join', label: '가입일', type: 'date' },
        { k: 'i_prod', label: '상품명', type: 'text' },
        { k: 'i_prem', label: '보험료', type: 'number', unit: '원/월' },
        { k: 'i_uw', label: '인수조건', type: 'select', options: ['부담보', '할증', '삭감'], blank: '해당없음(표준)' },
        { k: 'i_age', label: '가입연령', type: 'number', unit: '세' },
        { k: 'i_payterm', label: '납입기간', type: 'text', ph: '20년 · 120개월 · 전기납' },
        { k: 'i_payend', label: '납입 만료일', type: 'date', auto: true },
        { k: 'i_insterm', label: '보험기간', type: 'text', ph: '종신 · 80세 · 20년만기' },
        { k: 'i_insend', label: '보험 만기일', type: 'date', auto: true },
        { k: 'i_rate', label: '예정이율', type: 'number', unit: '%' }
      ]
    },
    {
      key: 'contract', no: 2, title: '계약사항',
      desc: '계약자 · 주피보험자 · 수익자 정보입니다.',
      fields: [
        { k: 'c_on', label: '계약자 성명', type: 'text' },
        { k: 'c_os', label: '계약자 성별', type: 'select', options: ['남', '여'] },
        { k: 'c_obirth', label: '계약자 생년월일', type: 'date' },
        { k: 'c_oja', label: '계약자 가입연령', type: 'number', auto: true },
        { k: 'c_ona', label: '계약자 현재연령', type: 'number', auto: true },
        { k: 'c_in', label: '주피보험자 성명', type: 'text' },
        { k: 'c_is', label: '주피보험자 성별', type: 'select', options: ['남', '여'] },
        { k: 'c_ibirth', label: '주피보험자 생년월일', type: 'date' },
        { k: 'c_ija', label: '주피보험자 가입연령', type: 'number', auto: true },
        { k: 'c_ina', label: '주피보험자 현재연령', type: 'number', auto: true },
        { k: 'c_bh', label: '수익자(입원시)', type: 'text', ph: '예: 본인' },
        { k: 'c_bd', label: '수익자(사망시)', type: 'text', ph: '예: 배우자' }
      ]
    },
    {
      key: 'front', no: 3, title: '계약 DB분석 — 앞면',
      desc: '할인 · 숨은보험금 찾아주기 · 헬스케어',
      fields: [
        { k: 'f_std', label: '주계약 표준체 / 정상인수 여부', type: 'select', options: OX, group: '건강체 할인' },
        { k: 'f_ht', label: '키', type: 'number', unit: 'cm', group: '건강체 할인' },
        { k: 'f_wt', label: '몸무게', type: 'number', unit: 'kg', group: '건강체 할인' },
        { k: 'f_bmi', label: 'BMI', type: 'number', auto: true, group: '건강체 할인' },
        { k: 'f_smoke', label: '흡연여부', type: 'select', options: ['비흡연', '흡연'], group: '건강체 할인' },
        { k: 'f_hprem', label: '건강체 변경후 보험료', type: 'number', unit: '원', group: '건강체 할인' },
        { k: 'f_href', label: '건강체 환급금액', type: 'number', unit: '원', group: '건강체 할인' },
        { k: 'f_disc', label: '직장할인 현재 적용여부', type: 'select', options: OX, group: '직장할인' },
        { k: 'f_comp', label: '직장명 / 단체명', type: 'text', group: '직장할인' },
        { k: 'f_surg', label: '수술특약 가입여부', type: 'select', options: OX, group: '수술급여금', hint: '가입일 2006.02 이전' },
        { k: 'f_impl', label: '임플란트 치조골이식수술 여부', type: 'select', options: OX, group: '수술급여금' },
        { k: 'f_acc', label: '재해치료비/골절치료특약 가입여부', type: 'select', options: OX, group: '치아파절', hint: '가입일 2006.02 이전' },
        { k: 'f_tooth', label: '치아파절 여부', type: 'select', options: OX, group: '치아파절' },
        { k: 'f_c21', label: '21C 넘버원 암치료보험 가입여부', type: 'select', options: OX, group: '대장용종' },
        { k: 'f_ben', label: '양성종양특약 가입여부', type: 'select', options: OX, group: '대장용종' },
        { k: 'f_polyp', label: '대장용종 수술여부', type: 'select', options: OX, group: '대장용종' },
        { k: 'f_hc', label: '헬스케어서비스 회원 가입여부', type: 'select', options: OX, group: '헬스케어' },
        { k: 'f_ci', label: 'CI 주계약 가입금액', type: 'number', unit: '만원', group: '헬스케어' },
        { k: 'f_life', label: '종신 주계약 가입금액', type: 'number', unit: '만원', group: '헬스케어' },
        { k: 'f_hcamt', label: '헬스케어 업셀링 필요 주계약', type: 'number', unit: '만원', group: '헬스케어' },
        { k: 'f_hcprem', label: '헬스케어 업셀링 보험료', type: 'number', unit: '원', group: '헬스케어' },
        { k: 'f_hcconv', label: '헬스케어 업셀링 총환산', type: 'number', group: '헬스케어' },
        { k: 'f_ckamt', label: '건강검진 업셀링 필요 주계약', type: 'number', unit: '만원', group: '헬스케어' },
        { k: 'f_ckprem', label: '건강검진 업셀링 보험료', type: 'number', unit: '원', group: '헬스케어' },
        { k: 'f_ckconv', label: '건강검진 업셀링 총환산', type: 'number', group: '헬스케어' }
      ]
    },
    {
      key: 'back', no: 3, title: '계약 DB분석 — 뒷면',
      desc: '납입 · 대출 · 보험금 · 계약관리 (금액은 원 단위)',
      fields: [
        { k: 'b_paid', label: '기납입보험료', type: 'number', unit: '원', group: '납입관련' },
        { k: 'b_surr', label: '해약환급금', type: 'number', unit: '원', group: '납입관련' },
        { k: 'b_ltype', label: '대출종류', type: 'select', options: ['신용', '약대'], group: '대출' },
        { k: 'b_lbal', label: '기대출금', type: 'number', unit: '원', group: '대출' },
        { k: 'b_lavl', label: '대출가능금액', type: 'number', unit: '원', group: '대출' },
        { k: 'b_lrate', label: '대출이율', type: 'number', unit: '%', group: '대출' },
        { k: 'b_lmi', label: '월 납입이자', type: 'number', unit: '원', group: '대출' },
        { k: 'b_lti', label: '총 납입이자', type: 'number', unit: '원', group: '대출' },
        { k: 'b_wd', label: '기인출금액', type: 'number', unit: '원', group: '중도인출' },
        { k: 'b_wdavl', label: '인출가능금액', type: 'number', unit: '원', group: '중도인출' },
        { k: 'b_middt', label: '중도보험금 수령예정일', type: 'date', group: '생존보험금' },
        { k: 'b_midamt', label: '중도보험금액', type: 'number', unit: '원', group: '생존보험금' },
        { k: 'b_matdt', label: '만기보험금 만기일', type: 'date', group: '생존보험금' },
        { k: 'b_matamt', label: '만기보험금액', type: 'number', unit: '원', group: '생존보험금' },
        { k: 'b_as', label: '자동송금(분할) 등록여부', type: 'select', options: ['분할 O', '분할 X'], group: '자동송금' },
        { k: 'b_am', label: '자동송금(만기) 등록여부', type: 'select', options: ['만기 O', '만기 X'], group: '자동송금' },
        { k: 'b_pch', label: '수금자 변경이력', type: 'text', group: '계약변경' },
        { k: 'b_cch', label: '계약사항 변경이력', type: 'text', group: '계약변경' },
        { k: 'b_ro', label: '실손보험 당사 가입여부', type: 'select', options: ['당사 O', '당사 X'], group: '실손보험' },
        { k: 'b_rt', label: '실손보험 타사 가입여부', type: 'select', options: ['타사 O', '타사 X'], group: '실손보험' },
        { k: 'b_fund', label: '펀드가입내역', type: 'text', group: '변액안내' },
        { k: 'b_fratio', label: '적립비율', type: 'number', unit: '%', group: '변액안내' },
        { k: 'b_cmain', label: '주계약 보장 만기시점', type: 'date', group: '보장 만기' },
        { k: 'b_crider', label: '특약 보장 만기시점', type: 'date', group: '보장 만기' }
      ]
    },
    {
      key: 'memo', no: 5, title: '상담 메모 및 후속조치',
      desc: '방문 결과와 다음에 할 일을 남깁니다.',
      fields: [
        { k: 'pr_etc', label: '기타 준비물', type: 'text' },
        { k: 'm_req', label: '고객 요청사항', type: 'textarea' },
        { k: 'm_note', label: '상담 내용', type: 'textarea' },
        { k: 'm_hidden', label: '숨은보험금 발견', type: 'textarea' },
        { k: 'm_upsell', label: '업셀링 제안', type: 'textarea' },
        { k: 'm_follow', label: '후속조치', type: 'text' },
        { k: 'm_deadline', label: '처리기한', type: 'date' },
        { k: 'm_grade', label: '방문결과 등급', type: 'select', options: ['A', 'B', 'C'] },
        { k: 'm_reason', label: '재접촉 사유', type: 'text' },
        { k: 'm_vdate', label: '방문일', type: 'date' },
        { k: 'm_next', label: '차기 방문예정일', type: 'date' },
        { k: 'e_bm', label: '고객 생일 (월)', type: 'number' },
        { k: 'e_bd', label: '고객 생일 (일)', type: 'number' }
      ]
    }
  ];

  /* 방문 전 준비물 체크리스트 */
  const PREPS = [
    { id: 'p1', t: '보장분석서' }, { id: 'p2', t: '가입설계서(업셀링)' },
    { id: 'p3', t: '보험금 청구서' }, { id: 'p4', t: '생존보험금 신청서' },
    { id: 'p5', t: '자동송금 신청서' }, { id: 'p6', t: '실손 손해율표' },
    { id: 'p7', t: '펀드수익률표' }, { id: 'p8', t: 'BMI 예시표' },
    { id: 'p9', t: '직장 계약 할인표' }, { id: 'p10', t: '헬스케어 안내전단' },
    { id: 'p11', t: '계약사항 변경신청서' }, { id: 'p12', t: '초진차트 · 진단서' }
  ];

  /* 놓치기 쉬운 추가 점검사항 */
  const EXTRAS = [
    { id: 'e1', t: '연락처 / 주소 / 이메일 최신화' },
    { id: 'e2', t: '보험료 납입방법(계좌·카드) 및 이체일 확인' },
    { id: 'e3', t: '미납 / 실효 · 부활 대상 여부' },
    { id: 'e4', t: '숨은보험금 · 휴면보험금 조회 결과' },
    { id: 'e5', t: '보장성보험료 세액공제 증명서 안내' },
    { id: 'e6', t: '수익자 지정 적정성 (상속·유족 청구 편의)' },
    { id: 'e7', t: '교보생명 앱 · 알림톡 가입 안내' },
    { id: 'e8', t: '가족 보장현황 확인 및 소개 요청' },
    { id: 'e9', t: '계약 전 알릴의무 / 고지 관련 유의사항 안내' },
    { id: 'e10', t: '개인정보 활용 동의 여부 확인' },
    { id: 'e11', t: '고객 생일 · 기념일 확인' },
    { id: 'e12', t: '직업 · 취미 변경 여부 (위험직군 통지의무)' },
    { id: 'e13', t: '연금전환 · 중도인출 등 자금활용 니즈 파악' },
    { id: 'e14', t: '만기 · 갱신 도래 계약 사전 안내' }
  ];

  /* 사고보험금 지급이력 (여러 줄) */
  const CLAIM_FIELDS = [
    { k: 'd', label: '병명', type: 'text' },
    { k: 't', label: '수령일', type: 'date' },
    { k: 'a', label: '수령액', type: 'number', unit: '원' }
  ];

  /* 고객 마스터에 올라가는 항목 (계약이 여러 건이어도 한 번만 관리) */
  const CUSTOMER_FIELDS = [
    { k: 'name', label: '고객명', type: 'text', required: true },
    { k: 'fp', label: '담당 FP', type: 'text' },
    { k: 'phone', label: '연락처', type: 'text' },
    { k: 'birth', label: '생년월일', type: 'date' },
    { k: 'memo', label: '고객 메모', type: 'textarea' }
  ];

  function allFields() {
    const out = [];
    SECTIONS.forEach(function (s) {
      s.fields.forEach(function (f) { out.push(Object.assign({ section: s.key, sectionTitle: s.title }, f)); });
    });
    return out;
  }

  function fieldMap() {
    const m = {};
    allFields().forEach(function (f) { m[f.k] = f; });
    return m;
  }

  /* 계약 테이블에 저장되는 항목 (고객명은 고객 마스터로 분리) */
  function contractFields() {
    return allFields().filter(function (f) { return f.k !== 'h_cust'; });
  }

  /* CSV / 누적대장 열 순서 */
  const LEDGER_COLS = [
    { k: '_savedAt', label: '저장일시' },
    { k: 'h_cust', label: '고객명' },
    { k: 'h_fp', label: 'FP' },
    { k: 'h_vdate', label: '방문예정일' },
    { k: 'i_join', label: '가입일' }, { k: 'i_prod', label: '상품명' },
    { k: 'i_prem', label: '보험료' }, { k: 'i_payterm', label: '납입기간' },
    { k: 'i_insterm', label: '보험기간' }, { k: 'i_rate', label: '예정이율' },
    { k: 'i_uw', label: '인수조건' },
    { k: 'c_ona', label: '계약자현재연령' }, { k: 'c_in', label: '주피보험자' },
    { k: 'c_ina', label: '피보험자현재연령' },
    { k: 'c_bh', label: '수익자(입원)' }, { k: 'c_bd', label: '수익자(사망)' },
    { k: 'f_std', label: '표준체' }, { k: 'f_bmi', label: 'BMI' }, { k: 'f_smoke', label: '흡연' },
    { k: 'f_disc', label: '직장할인' }, { k: 'f_comp', label: '직장명' },
    { k: 'f_surg', label: '수술특약' }, { k: 'f_impl', label: '임플란트' },
    { k: 'f_acc', label: '재해치료비특약' }, { k: 'f_tooth', label: '치아파절' },
    { k: 'f_c21', label: '21C넘버원' }, { k: 'f_ben', label: '양성종양특약' },
    { k: 'f_polyp', label: '대장용종' }, { k: 'f_hc', label: '헬스케어회원' },
    { k: 'b_paid', label: '기납입' }, { k: 'b_surr', label: '해약환급금' },
    { k: 'b_lbal', label: '대출잔액' }, { k: 'b_wdavl', label: '인출가능' },
    { k: 'b_middt', label: '중도보험금일' }, { k: 'b_midamt', label: '중도보험금액' },
    { k: 'b_matdt', label: '만기일' }, { k: 'b_matamt', label: '만기보험금' },
    { k: 'b_as', label: '자동송금분할' }, { k: 'b_am', label: '자동송금만기' },
    { k: 'b_ro', label: '실손당사' }, { k: 'b_rt', label: '실손타사' },
    { k: 'b_cmain', label: '주계약만기' }, { k: 'b_crider', label: '특약만기' },
    { k: 'm_grade', label: '방문등급' }, { k: 'm_reason', label: '재접촉사유' },
    { k: 'm_hidden', label: '숨은보험금발견' }, { k: 'm_upsell', label: '업셀링제안' },
    { k: 'm_follow', label: '후속조치' }, { k: 'm_deadline', label: '처리기한' },
    { k: 'm_vdate', label: '방문일' }, { k: 'm_next', label: '차기방문' },
    { k: '_money', label: '발견예상액' }, { k: '_hidCnt', label: '숨은보험금건수' }
  ];

  const Schema = {
    SECTIONS: SECTIONS, PREPS: PREPS, EXTRAS: EXTRAS,
    CLAIM_FIELDS: CLAIM_FIELDS, CUSTOMER_FIELDS: CUSTOMER_FIELDS,
    LEDGER_COLS: LEDGER_COLS,
    allFields: allFields, fieldMap: fieldMap, contractFields: contractFields
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Schema;
  else (global.KB = global.KB || {}).Schema = Schema;
})(typeof globalThis !== 'undefined' ? globalThis : this);
