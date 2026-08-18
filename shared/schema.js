/*
 * 항목 정의 — 이 파일 하나가 기준입니다.
 * 회사 양식 「평생든든 방문활동 사전준비」(개정판, 앞면/뒷면 2장)의 칸을 그대로 옮겨 놓은 것입니다.
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
        { k: 'h_fp', label: '지점 · FP', type: 'text', ph: '평촌지점 추진이' },
        { k: 'h_adate', label: '분석일', type: 'date' }
      ]
    },
    {
      key: 'person', no: 1, title: '인적사항',
      desc: '고객 연락 정보입니다. 주소는 바뀐 경우에만 변경 전/후를 함께 적으세요.',
      fields: [
        { k: 'p_phone', label: '전화번호', type: 'text', ph: '010-0000-0000' },
        { k: 'p_job', label: '직업', type: 'text' },
        { k: 'p_bday', label: '고객생일', type: 'text', ph: '03-20 또는 1971-03-20' },
        { k: 'p_anniv', label: '기념일', type: 'text', ph: '결혼기념일 05-06' },
        { k: 'p_addr0', label: '주소 (변경 전)', type: 'text' },
        { k: 'p_addr1', label: '주소 (변경 후)', type: 'text' }
      ]
    },
    {
      key: 'contract', no: 2, title: '계약사항',
      desc: '계약자 · 주피보험자 · 수익자와 인수조건입니다. 가입 계약은 아래 [가입건수] 표에 건별로 적습니다.',
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
        { k: 'c_bh', label: '수익자 (입원시)', type: 'text', ph: '본인' },
        { k: 'c_bd', label: '수익자 (사망시)', type: 'text', ph: '배우자' },
        { k: 'c_uwx', label: '인수조건 — 부담보', type: 'text', ph: '부위 · 기간' },
        { k: 'c_uwu', label: '인수조건 — 할증', type: 'text', ph: '할증률 · 사유' },
        { k: 'c_uwc', label: '인수조건 — 삭감', type: 'text', ph: '삭감 내용 · 기간' }
      ]
    },
    {
      key: 'front', no: 3, title: '계약 DB분석 — 앞면',
      desc: '할인 · 숨은보험금 · 헬스케어 · 납입/대출 · 보험금',
      fields: [
        { k: 'f_std', label: '주계약 표준체 / 정상인수 여부', type: 'select', options: OX, group: '건강체 할인' },
        { k: 'f_hprem', label: '건강체 변경시 보험료', type: 'number', unit: '원', group: '건강체 할인', hint: '총무 · FP.com 확인' },
        { k: 'f_href', label: '건강체 변경시 환급금액', type: 'number', unit: '원', group: '건강체 할인' },
        { k: 'f_disc', label: '현재 할인 적용 여부', type: 'select', options: OX, group: '건강체 할인' },
        { k: 'f_comp', label: '직장명 / 단체명 확인 (고객)', type: 'text', group: '직장할인' },
        { k: 'f_surg', label: '수술특약 가입여부', type: 'select', options: OX, group: '수술급여금 찾아주기', hint: '가입일 2006.02 이전' },
        { k: 'f_impl', label: '임플란트 치조골이식 수술여부 확인', type: 'select', options: OX, group: '수술급여금 찾아주기' },
        { k: 'f_acc', label: '재해치료비 특약 또는 골절치료 특약 가입여부', type: 'select', options: OX, group: '치아파절 보험금 찾아주기', hint: '가입일 2006.02 이전' },
        { k: 'f_tooth', label: '치아파절 여부 확인 (고객)', type: 'select', options: OX, group: '치아파절 보험금 찾아주기' },
        { k: 'f_c21', label: '21C 넘버원 암치료보험 가입여부', type: 'select', options: OX, group: '대장용종 보험금 찾아주기', hint: '가입시기 체크' },
        { k: 'f_ben', label: '양성종양 특약 가입여부', type: 'select', options: OX, group: '대장용종 보험금 찾아주기', hint: '베스트라이프 · 굿라이프 · 폰나이스 암보험' },
        { k: 'f_polyp', label: '대장용종 수술여부 확인 (고객)', type: 'select', options: OX, group: '대장용종 보험금 찾아주기' },
        { k: 'f_hc', label: '헬스케어서비스 회원가입 여부', type: 'select', options: OX, group: '헬스케어 서비스' },
        { k: 'b_paid', label: '기납입보험료', type: 'number', unit: '원', group: '납입관련' },
        { k: 'b_surr', label: '해약환급금', type: 'number', unit: '원', group: '납입관련' },
        { k: 'b_lavl', label: '대출가능금액', type: 'number', unit: '원', group: '대출' },
        { k: 'b_ltype', label: '대출 종류', type: 'select', options: ['신용', '약대'], group: '대출' },
        { k: 'b_lbal', label: '현재 대출액', type: 'number', unit: '원', group: '대출' },
        { k: 'b_lrate', label: '대출이율', type: 'number', unit: '%', group: '대출' },
        { k: 'b_lmi', label: '월 납입이자', type: 'number', unit: '원', group: '대출' },
        { k: 'b_lti', label: '총 납입이자', type: 'number', unit: '원', group: '대출' },
        { k: 'b_wd', label: '기인출금액', type: 'number', unit: '원', group: '중도인출' },
        { k: 'b_wdavl', label: '인출가능금액', type: 'number', unit: '원', group: '중도인출' },
        { k: 'b_middt', label: '중도보험금 수령예정일', type: 'date', group: '생존보험금' },
        { k: 'b_midamt', label: '중도보험금 금액', type: 'number', unit: '원', group: '생존보험금' },
        { k: 'b_matdt', label: '만기보험금 만기일', type: 'date', group: '생존보험금' },
        { k: 'b_matamt', label: '만기보험금 금액', type: 'number', unit: '원', group: '생존보험금' },
        { k: 'b_pch', label: '수금자 변경이력', type: 'text', group: '계약변경' },
        { k: 'b_cch', label: '계약사항 변경이력', type: 'text', group: '계약변경' }
      ]
    },
    {
      key: 'back', no: 3, title: '계약 DB분석 — 뒷면',
      desc: '사고보험금 · 변액 · 보장만기',
      fields: [
        { k: 'b_cmain', label: '주계약 보장 만기시점', type: 'date', group: '보장만기' },
        { k: 'b_crider', label: '특약 보장 만기시점', type: 'date', group: '보장만기' }
      ]
    },
    {
      key: 'memo', no: 5, title: '상담 메모 및 후속조치',
      desc: '방문 결과와 다음에 할 일을 남깁니다.',
      fields: [
        { k: 'pr_etc1', label: '준비물 기타 1', type: 'text' },
        { k: 'pr_etc2', label: '준비물 기타 2', type: 'text' },
        { k: 'pr_etc3', label: '준비물 기타 3', type: 'text' },
        { k: 'm_req', label: '고객 요청사항', type: 'textarea' },
        { k: 'm_grade', label: '방문결과 등급', type: 'select', options: ['A', 'B', 'C'] },
        { k: 'm_reason', label: '재접촉 사유', type: 'text' },
        { k: 'm_vdate', label: '방문일', type: 'date' },
        { k: 'm_next', label: '차기 방문예정일', type: 'date' }
      ]
    }
  ];

  /*
   * 여러 줄로 적는 표들.
   * 화면 · 엑셀 · 저장소가 모두 이 정의 하나를 보고 만들어집니다.
   */
  const ROWSETS = [
    {
      key: 'contracts', label: '가입건수', sheet: '계약사항',
      sub: '가입하신 계약을 건별로 적습니다. 가입일은 2006년 2월 이전 여부 판정에 쓰입니다.',
      rows: 3, addLabel: '＋ 계약 추가',
      cols: [
        { k: 'join', label: '가입일', type: 'date', w: 15 },
        { k: 'prod', label: '상품명', type: 'text', w: 30 },
        { k: 'prem', label: '보험료', type: 'number', unit: '원', w: 14 },
        { k: 'payterm', label: '납입기간', type: 'text', ph: '20년 · 전기납', w: 14 },
        { k: 'payend', label: '납입 만료일', type: 'date', auto: true, w: 15 },
        { k: 'insterm', label: '보험기간', type: 'text', ph: '종신 · 80세', w: 14 },
        { k: 'insend', label: '보험 만기일', type: 'date', auto: true, w: 15 }
      ]
    },
    {
      key: 'claims', label: '사고보험금', sheet: '사고보험금',
      sub: '과거에 받으신 보험금 이력입니다. 추가 청구 가능 여부를 함께 판정합니다.',
      rows: 3, addLabel: '＋ 줄 추가',
      cols: [
        { k: 'c', label: '코드번호', type: 'text', w: 14 },
        { k: 'd', label: '병명', type: 'text', w: 30 },
        { k: 't', label: '수령일', type: 'date', w: 15 },
        { k: 'a', label: '수령액', type: 'number', unit: '원', w: 16 }
      ]
    },
    {
      key: 'funds', label: '변액안내', sheet: '변액펀드',
      sub: '펀드 가입내역과 적립비율입니다. (FP.COM 출력)',
      rows: 2, addLabel: '＋ 펀드 추가',
      cols: [
        { k: 'name', label: '펀드 가입내역', type: 'text', w: 34 },
        { k: 'ratio', label: '적립비율', type: 'number', unit: '%', w: 14 }
      ]
    },
    {
      key: 'talks', label: '상담내용', sheet: '상담메모',
      sub: '상담일자별로 나눈 이야기를 적습니다.',
      rows: 2, addLabel: '＋ 상담 추가',
      cols: [
        { k: 'date', label: '상담일자', type: 'date', w: 15 },
        { k: 'note', label: '내용', type: 'text', w: 52 }
      ]
    },
    {
      key: 'hiddens', label: '숨은보험금 발견', sheet: '숨은보험금',
      sub: '이번 방문에서 찾아드린 보험금입니다. [진단 결과에서 자동으로 채우기]로 옮길 수 있습니다.',
      rows: 3, addLabel: '＋ 줄 추가',
      cols: [
        { k: 'code', label: '코드번호', type: 'text', w: 14 },
        { k: 'item', label: '보장내역', type: 'text', w: 40 },
        { k: 'amt', label: '보장금액', type: 'number', unit: '원', w: 16 }
      ]
    },
    {
      key: 'follows', label: '후속조치', sheet: '후속조치',
      sub: '처리기한이 있는 일은 여기에 적으면 ⑤ 통계 탭에서 기한 관리가 됩니다.',
      rows: 2, addLabel: '＋ 줄 추가',
      cols: [
        { k: 'what', label: '후속조치 내용', type: 'text', w: 46 },
        { k: 'due', label: '처리기한', type: 'date', w: 15 }
      ]
    }
  ];

  function rowsetMap() {
    const m = {};
    ROWSETS.forEach(function (r) { m[r.key] = r; });
    return m;
  }

  /* 빈 값만 남은 줄은 버립니다 */
  function pruneRows(set, list) {
    return (list || []).filter(function (row) {
      return row && set.cols.some(function (c) { return String(row[c.k] == null ? '' : row[c.k]).trim(); });
    });
  }

  /* 방문 전 준비물 체크리스트 (양식 4번) */
  const PREPS = [
    { id: 'p1', t: '보장분석서' },
    { id: 'p2', t: '가입설계서 (업셀링)' },
    { id: 'p3', t: '보험금 청구서' },
    { id: 'p4', t: '생존보험금 신청서' },
    { id: 'p5', t: '펀드수익률표' },
    { id: 'p6', t: '명함 · 사은품' },
    { id: 'p7', t: '직장 계약 할인표' },
    { id: 'p8', t: '헬스케어 안내전단지' },
    { id: 'p9', t: '계약사항 변경신청서' },
    { id: 'p10', t: '기타', etc: 'pr_etc1' },
    { id: 'p11', t: '기타', etc: 'pr_etc2' },
    { id: 'p12', t: '기타', etc: 'pr_etc3' }
  ];

  /* 추가 점검사항 — 고객관리 · 놓치기 쉬운 항목 (양식 6번) */
  const EXTRAS = [
    { id: 'e1', t: '연락처 · 주소 · 이메일 최신화' },
    { id: 'e2', t: '보험료 납입방법(계좌·카드) 및 이체일 확인' },
    { id: 'e3', t: '미납 · 실효 · 부활 대상 여부' },
    { id: 'e4', t: '숨은보험금 · 휴면보험금 조회 결과' },
    { id: 'e5', t: '보장성보험료 세액공제 증명서 안내' },
    { id: 'e6', t: '수익자 지정 적정성 (상속 · 유족청구 편의)' },
    { id: 'e7', t: '교보생명 앱 · 알림톡 가입 안내' },
    { id: 'e8', t: '가족 보장현황 확인 및 소개 요청' },
    { id: 'e9', t: '직업 · 취미 변경 여부 (위험직군 통지의무)' },
    { id: 'e10', t: '만기 · 갱신 도래 계약 사전 안내' },
    { id: 'e11', t: '연금전환 · 중도인출 등 자금활용 니즈 파악' },
    { id: 'e12', t: '계약 전 알릴의무 · 고지사항 안내' }
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

  /* CSV / 누적대장 열 순서 — '_' 로 시작하는 것은 계산 항목입니다 */
  const LEDGER_COLS = [
    { k: '_savedAt', label: '저장일시' },
    { k: 'h_cust', label: '고객명' },
    { k: 'h_fp', label: '지점·FP' },
    { k: 'h_adate', label: '분석일' },
    { k: 'p_phone', label: '전화번호' }, { k: 'p_job', label: '직업' },
    { k: '_cnt', label: '가입건수' },
    { k: '_join', label: '가입일(첫 계약)' }, { k: '_prod', label: '상품명(첫 계약)' },
    { k: '_prem', label: '보험료합계' },
    { k: 'c_on', label: '계약자' }, { k: 'c_ona', label: '계약자현재연령' },
    { k: 'c_in', label: '주피보험자' }, { k: 'c_ina', label: '피보험자현재연령' },
    { k: 'c_bh', label: '수익자(입원)' }, { k: 'c_bd', label: '수익자(사망)' },
    { k: 'f_std', label: '표준체' }, { k: 'f_disc', label: '할인적용' }, { k: 'f_comp', label: '직장명' },
    { k: 'f_surg', label: '수술특약' }, { k: 'f_impl', label: '임플란트' },
    { k: 'f_acc', label: '재해치료비특약' }, { k: 'f_tooth', label: '치아파절' },
    { k: 'f_c21', label: '21C넘버원' }, { k: 'f_ben', label: '양성종양특약' },
    { k: 'f_polyp', label: '대장용종' }, { k: 'f_hc', label: '헬스케어회원' },
    { k: 'b_paid', label: '기납입' }, { k: 'b_surr', label: '해약환급금' },
    { k: 'b_lbal', label: '대출잔액' }, { k: 'b_lrate', label: '대출이율' },
    { k: 'b_wdavl', label: '인출가능' },
    { k: 'b_middt', label: '중도보험금일' }, { k: 'b_midamt', label: '중도보험금액' },
    { k: 'b_matdt', label: '만기일' }, { k: 'b_matamt', label: '만기보험금' },
    { k: 'b_cmain', label: '주계약만기' }, { k: 'b_crider', label: '특약만기' },
    { k: '_claims', label: '사고보험금건수' }, { k: '_funds', label: '펀드건수' },
    { k: 'm_grade', label: '방문등급' }, { k: 'm_reason', label: '재접촉사유' },
    { k: '_hidden', label: '숨은보험금발견' }, { k: '_hiddenAmt', label: '발견보장금액' },
    { k: '_follow', label: '후속조치' }, { k: '_due', label: '처리기한' },
    { k: 'm_vdate', label: '방문일' }, { k: 'm_next', label: '차기방문' },
    { k: '_money', label: '발견예상액' }, { k: '_hidCnt', label: '숨은보험금건수' }
  ];

  /* 여러 줄 표에서 뽑아 쓰는 값 — 화면 · 엑셀 · CSV 가 같은 규칙을 씁니다 */
  function rowsOf(rec, key) {
    const r = (rec && rec.rows) || {};
    return (r[key] || []).filter(function (x) { return x; });
  }

  function sumNum(list, key) {
    return list.reduce(function (s, x) {
      const n = parseFloat(String(x[key] == null ? '' : x[key]).replace(/[^0-9.\-]/g, ''));
      return s + (isFinite(n) ? n : 0);
    }, 0);
  }

  function ledgerValue(rec, key) {
    const f = (rec && rec.f) || {};
    const ct = rowsOf(rec, 'contracts');
    switch (key) {
      case '_savedAt': return String(rec.savedAt || '').slice(0, 19).replace('T', ' ');
      case '_money': return rec.money || 0;
      case '_hidCnt': return rec.hidCnt || 0;
      case '_cnt': return ct.length;
      case '_join': return (ct[0] && ct[0].join) || '';
      case '_prod': return ct.map(function (c) { return c.prod; }).filter(Boolean).join(' / ');
      case '_prem': return sumNum(ct, 'prem');
      case '_claims': return rowsOf(rec, 'claims').length;
      case '_funds': return rowsOf(rec, 'funds').length;
      case '_hidden': return rowsOf(rec, 'hiddens').map(function (h) { return h.item; }).filter(Boolean).join(' / ');
      case '_hiddenAmt': return sumNum(rowsOf(rec, 'hiddens'), 'amt');
      case '_follow': return rowsOf(rec, 'follows').map(function (x) { return x.what; }).filter(Boolean).join(' / ');
      case '_due': {
        const d = rowsOf(rec, 'follows').map(function (x) { return x.due; }).filter(Boolean).sort();
        return d[0] || '';
      }
      default: return f[key] == null ? '' : f[key];
    }
  }

  const Schema = {
    SECTIONS: SECTIONS, ROWSETS: ROWSETS, PREPS: PREPS, EXTRAS: EXTRAS,
    CUSTOMER_FIELDS: CUSTOMER_FIELDS, LEDGER_COLS: LEDGER_COLS,
    allFields: allFields, fieldMap: fieldMap, contractFields: contractFields,
    rowsetMap: rowsetMap, pruneRows: pruneRows, rowsOf: rowsOf,
    ledgerValue: ledgerValue, sumNum: sumNum
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Schema;
  else (global.KB = global.KB || {}).Schema = Schema;
})(typeof globalThis !== 'undefined' ? globalThis : this);
