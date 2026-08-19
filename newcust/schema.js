/*
 * 기계약자 관리 — 항목 정의 (기준 한 곳)
 * 여기에 항목을 넣으면 화면 · 저장 · 엑셀이 함께 따라옵니다.
 */
(function (global) {
  'use strict';

  /* ---------- 한 칸짜리 항목 ---------- */
  const SECTIONS = [
    {
      key: 'head', no: '', title: '기본',
      fields: [
        { k: 'h_cust', label: '고객 성명', type: 'text', required: true },
        { k: 'h_fp', label: '지점 · FP', type: 'text' },
        { k: 'h_date', label: '작성일', type: 'date' }
      ]
    },
    {
      key: 'person', no: 1, title: '고객 정보',
      fields: [
        { k: 'p_birth', label: '생년월일', type: 'date' },
        { k: 'p_sex', label: '성별', type: 'select', options: ['남', '여'] },
        { k: 'p_age', label: '보험나이', type: 'number', auto: true, unit: '세' },
        { k: 'p_phone', label: '전화번호', type: 'text', ph: '010-0000-0000' },
        { k: 'p_email', label: '이메일', type: 'text' },
        { k: 'p_job', label: '직업', type: 'text' },
        { k: 'p_addr', label: '주소', type: 'text' },
        { k: 'p_anniv', label: '기념일', type: 'text', ph: '결혼기념일 05-06' },
        { k: 'p_family', label: '가족사항', type: 'text', ph: '배우자 · 자녀 나이 등' },
        { k: 'p_route', label: '가입 경로', type: 'text', ph: '소개 · DB · 지인' },
        { k: 'p_pay', label: '보험료 납입방법 · 이체일', type: 'text', ph: '카드 / 매월 25일' },
        { k: 'p_memo', label: '특이사항', type: 'textarea' }
      ]
    },
    {
      key: 'memo', no: 3, title: '방문준비 · 상담메모',
      fields: [
        { k: 'm_req', label: '고객 요청사항', type: 'textarea' },
        { k: 'm_note', label: '상담 메모', type: 'textarea' },
        { k: 'm_grade', label: '고객 등급', type: 'select', options: ['A', 'B', 'C'] },
        { k: 'm_next', label: '차기 방문예정일', type: 'date' },
        { k: 'pr_etc1', label: '준비물 기타 1', type: 'text' },
        { k: 'pr_etc2', label: '준비물 기타 2', type: 'text' }
      ]
    }
  ];

  /* ---------- 여러 줄로 적는 표 ---------- */
  const ROWSETS = [
    {
      key: 'plans', label: '가입설계 — 보험(주계약)', sheet: '가입설계',
      sub: '보험 한 건이 한 줄입니다. 계약일을 넣으면 만기일 · 암 면책일 · 상령일 알림이 자동으로 잡힙니다.',
      rows: 2, addLabel: '＋ 보험 추가',
      cols: [
        { k: 'name', label: '보험명', type: 'select', opt: 'products', ph: '교보 New 든든한 종신보험', w: 26 },
        { k: 'insured', label: '피보험자', type: 'text', ph: '본인', w: 12 },
        { k: 'join', label: '계약일', type: 'date', w: 15 },
        { k: 'main', label: '주계약 내용', type: 'text', ph: '사망 · 암진단', w: 20 },
        { k: 'amt', label: '주계약 가입금액', type: 'number', unit: '만원', w: 16 },
        { k: 'prem', label: '보험료', type: 'number', unit: '원', w: 14 },
        { k: 'payterm', label: '납입기간', type: 'text', ph: '20년납 · 전기납', w: 14 },
        { k: 'payend', label: '납입 만료일', type: 'date', auto: true, w: 15 },
        { k: 'insterm', label: '보험기간', type: 'text', ph: '종신 · 80세만기', w: 14 },
        { k: 'insend', label: '보험 만기일', type: 'date', auto: true, w: 15 }
      ]
    },
    {
      key: 'riders', label: '가입설계 — 특약', sheet: '특약',
      sub: '특약명과 가입금액을 넣으면 아래에 보장영역과 지급보험금이 자동으로 정리됩니다.',
      rows: 4, addLabel: '＋ 특약 추가',
      cols: [
        { k: 'plan', label: '보험명', type: 'select', opt: 'planNames', ph: '어느 보험의 특약인지', w: 22 },
        { k: 'name', label: '특약명', type: 'select', opt: 'riderNames', ph: '암진단특약', w: 26 },
        { k: 'amt', label: '가입금액', type: 'number', unit: '만원', w: 14 },
        { k: 'payterm', label: '납입기간', type: 'text', w: 13 },
        { k: 'insterm', label: '보험기간', type: 'text', w: 13 }
      ]
    },
    {
      key: 'claims', label: '사고보험금 청구내역', sheet: '사고보험금',
      sub: '청구한 건과 지급받은 내역입니다.',
      rows: 3, addLabel: '＋ 줄 추가',
      cols: [
        { k: 'accdt', label: '사고 · 진단일', type: 'date', w: 15 },
        { k: 'what', label: '병명 · 사고내용', type: 'text', w: 26 },
        { k: 'rider', label: '청구 특약', type: 'text', w: 20 },
        { k: 'claimdt', label: '청구일', type: 'date', w: 15 },
        { k: 'claimamt', label: '청구금액', type: 'number', unit: '원', w: 15 },
        { k: 'paydt', label: '지급일', type: 'date', w: 15 },
        { k: 'payamt', label: '지급액', type: 'number', unit: '원', w: 15 },
        { k: 'state', label: '상태', type: 'text', ph: '접수 · 심사 · 지급 · 부지급', w: 14 }
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
      key: 'follows', label: '후속조치', sheet: '후속조치',
      sub: '처리기한을 넣으면 ④ 고객터치와 ⑤ 누적통계에서 함께 관리됩니다.',
      rows: 2, addLabel: '＋ 줄 추가',
      cols: [
        { k: 'what', label: '후속조치 내용', type: 'text', w: 44 },
        { k: 'due', label: '처리기한', type: 'date', w: 15 }
      ]
    },
    {
      key: 'touches', label: '고객터치 기록', sheet: '고객터치',
      sub: '연락하거나 만난 기록입니다. 알림을 처리하시면 여기에 남겨 두세요.',
      rows: 3, addLabel: '＋ 터치 추가',
      cols: [
        { k: 'date', label: '일자', type: 'date', w: 15 },
        { k: 'how', label: '방법', type: 'text', ph: '전화 · 문자 · 방문 · 선물', w: 14 },
        { k: 'what', label: '내용', type: 'text', w: 40 },
        { k: 'react', label: '고객 반응', type: 'text', w: 24 }
      ]
    }
  ];

  /* 방문 전 준비물 */
  const PREPS = [
    { id: 'q1', t: '증권 · 약관' },
    { id: 'q2', t: '가입설계서' },
    { id: 'q3', t: '보장분석서' },
    { id: 'q4', t: '보험금 청구서' },
    { id: 'q5', t: '명함 · 사은품' },
    { id: 'q6', t: '계약사항 변경신청서' },
    { id: 'q7', t: '기타', etc: 'pr_etc1' },
    { id: 'q8', t: '기타', etc: 'pr_etc2' }
  ];

  /* 신규계약 후 챙길 것 */
  const EXTRAS = [
    { id: 'x1', t: '증권 전달 · 내용 설명' },
    { id: 'x2', t: '청약서 자필서명 · 알릴의무 재확인' },
    { id: 'x3', t: '보험료 자동이체 등록 확인' },
    { id: 'x4', t: '교보생명 앱 · 알림톡 가입 안내' },
    { id: 'x5', t: '보험금 청구 방법 안내' },
    { id: 'x6', t: '수익자 지정 확인' },
    { id: 'x7', t: '소개 요청' },
    { id: 'x8', t: '가족 보장현황 확인' }
  ];

  function rowsetMap() {
    const m = {};
    ROWSETS.forEach(function (r) { m[r.key] = r; });
    return m;
  }

  function pruneRows(set, list) {
    return (list || []).filter(function (row) {
      return row && set.cols.some(function (c) { return String(row[c.k] == null ? '' : row[c.k]).trim(); });
    });
  }

  function rowsOf(rec, key) {
    const r = (rec && rec.rows) || {};
    return (r[key] || []).filter(function (x) { return x; });
  }

  function sumNum(list, key) {
    return (list || []).reduce(function (s, x) {
      const n = parseFloat(String(x[key] == null ? '' : x[key]).replace(/[^0-9.\-]/g, ''));
      return s + (isFinite(n) ? n : 0);
    }, 0);
  }

  function allFields() {
    const out = [];
    SECTIONS.forEach(function (s) {
      s.fields.forEach(function (f) { out.push(Object.assign({ section: s.key }, f)); });
    });
    return out;
  }

  /* 누적대장 · CSV 열 순서 ('_' 로 시작하면 계산 항목) */
  const LEDGER_COLS = [
    { k: '_savedAt', label: '저장일시' },
    { k: 'h_cust', label: '고객명' }, { k: 'h_fp', label: '지점·FP' },
    { k: 'h_date', label: '작성일' },
    { k: 'p_birth', label: '생년월일' }, { k: 'p_sex', label: '성별' }, { k: 'p_age', label: '보험나이' },
    { k: 'p_phone', label: '전화번호' }, { k: 'p_job', label: '직업' },
    { k: 'p_anniv', label: '기념일' }, { k: 'p_route', label: '가입경로' },
    { k: '_plans', label: '보험건수' }, { k: '_planNames', label: '보험명' },
    { k: '_join', label: '계약일' }, { k: '_amt', label: '주계약합계(만원)' },
    { k: '_prem', label: '월보험료합계' },
    { k: '_riders', label: '특약건수' }, { k: '_riderNames', label: '특약명' },
    { k: '_claims', label: '청구건수' }, { k: '_payamt', label: '지급액합계' },
    { k: '_touches', label: '터치횟수' },
    { k: 'm_grade', label: '고객등급' }, { k: 'm_next', label: '차기방문' },
    { k: '_follow', label: '후속조치' }, { k: '_due', label: '처리기한' }
  ];

  function ledgerValue(rec, key) {
    const f = (rec && rec.f) || {};
    const plans = rowsOf(rec, 'plans');
    switch (key) {
      case '_savedAt': return String(rec.savedAt || '').slice(0, 19).replace('T', ' ');
      case '_plans': return plans.length;
      case '_planNames': return plans.map(function (p) { return p.name; }).filter(Boolean).join(' / ');
      case '_join': {
        const d = plans.map(function (p) { return p.join; }).filter(Boolean).sort();
        return d[0] || '';
      }
      case '_amt': return sumNum(plans, 'amt');
      case '_prem': return sumNum(plans, 'prem');
      case '_riders': return rowsOf(rec, 'riders').length;
      case '_riderNames': return rowsOf(rec, 'riders').map(function (r) { return r.name; }).filter(Boolean).join(' / ');
      case '_claims': return rowsOf(rec, 'claims').length;
      case '_payamt': return sumNum(rowsOf(rec, 'claims'), 'payamt');
      case '_touches': return rowsOf(rec, 'touches').length;
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
    LEDGER_COLS: LEDGER_COLS,
    allFields: allFields, rowsetMap: rowsetMap, pruneRows: pruneRows,
    rowsOf: rowsOf, sumNum: sumNum, ledgerValue: ledgerValue
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Schema;
  else (global.NC = global.NC || {}).Schema = Schema;
})(typeof globalThis !== 'undefined' ? globalThis : this);
