/*
 * 진단 엔진 — 입력값을 받아 숨은보험금 · 즉시조치 · 제안 항목을 판정합니다.
 * 서버와 브라우저가 같은 코드를 쓰므로 화면과 엑셀 결과가 항상 일치합니다.
 *
 * 판정 기준은 회사 양식 「평생든든 방문활동 사전준비」(개정판)에 적힌 내용을 옮긴 것이며,
 * 실제 지급 여부와 금액은 약관과 회사 시스템에서 최종 확인해야 합니다.
 *
 * lv : 'm' 숨은보험금·환급(돈) / 'a' 즉시조치 / 'b' 보완·제안 / 'i' 참고
 */
(function (global) {
  'use strict';

  const isNode = (typeof module !== 'undefined' && module.exports);
  const Calc = isNode ? require('./calc.js') : global.KB.Calc;
  const Schema = isNode ? require('./schema.js') : global.KB.Schema;

  const numOf = Calc.numOf, won = Calc.won, normDate = Calc.normDate, ymd = Calc.ymd;

  const CUT_2006 = '2006-02-01';

  function analyze(record, opts) {
    opts = opts || {};
    const today = opts.today || Calc.todayStr();
    const f = (record && record.f) || {};
    const rows = (record && record.rows) || {};
    const RS = Schema.rowsetMap();

    const list = function (key) { return Schema.pruneRows(RS[key], rows[key]); };
    const contracts = list('contracts');
    const claims = list('claims');
    const funds = list('funds');
    const hiddens = list('hiddens');
    const follows = list('follows');

    const V = function (k) { return String(f[k] == null ? '' : f[k]).trim(); };
    const N = function (k) { return numOf(V(k)); };
    const dd = function (v) { return Calc.dday(v, today); };

    const cust = V('h_cust') || '고객';

    /* 계약 표에서 뽑아 쓰는 값 */
    const joins = contracts.map(function (c) { return normDate(c.join); }).filter(Boolean).sort();
    const firstJoin = joins[0] || '';
    const oldRows = contracts.filter(function (c) {
      const j = normDate(c.join);
      return j && j < CUT_2006;
    });
    const old2006 = joins.length ? oldRows.length > 0 : null;
    const oldNames = oldRows.map(function (c) { return c.prod || ymd(normDate(c.join)); }).filter(Boolean);
    const oldLabel = oldNames.length ? '(' + oldNames.join(', ') + ')' : '';
    const premSum = Schema.sumNum(contracts, 'prem');

    const F2 = [];
    const prep = [];
    const blanks = [];
    let money = 0, moneyUnknown = 0;

    const add = function (o) { F2.push(o); };
    const bl = function (t) { blanks.push(t); };
    const need = function (id) { if (prep.indexOf(id) < 0) prep.push(id); };

    /* ---------- 0. 계약 표 ---------- */
    if (!contracts.length) bl('계약사항 표 (가입일 · 상품명 · 보험료 · 납입기간 · 보험기간)');
    contracts.forEach(function (c, i) {
      if (!normDate(c.join)) bl('가입건수 ' + (i + 1) + ' 의 가입일' + (c.join ? ' (형식을 알아볼 수 없음 — 20030514 처럼 입력)' : ''));
      if (!String(c.prod || '').trim()) bl('가입건수 ' + (i + 1) + ' 의 상품명');
    });
    if (!V('p_phone')) bl('전화번호');

    /* ---------- 1. 건강체 할인 ---------- */
    if (V('f_std') === '') bl('주계약 표준체 / 정상인수 여부 (O/X)');
    if (V('f_disc') === '') bl('현재 할인 적용 여부 (O/X)');

    if (V('f_std') === 'O' && V('f_disc') === 'X') {
      const ref = N('f_href'), hp = N('f_hprem');
      if (ref > 0) money += ref; else moneyUnknown++;
      add({
        lv: 'm', pri: 95, cat: '건강체 할인', t: '건강체 할인 미적용 — 지금 신청하면 보험료가 줄고 차액을 돌려받습니다',
        ment: cust + ' 님, 이 계약은 건강상 별도 조건 없이 정상으로 가입되신 건데, 지금 \'건강체 할인\'(건강 상태가 좋은 분께 보험료를 깎아드리는 제도)이 들어가 있지 않습니다. ' +
          '제가 신청해 드리면 앞으로 낼 보험료가 줄어들고, 그동안 더 내신 부분은 돌려받으실 수 있습니다.' +
          (hp > 0 && premSum > 0 ? ' 지금 ' + won(premSum) + '원에서 ' + won(hp) + '원으로 매달 ' + won(premSum - hp) + '원이 줄어듭니다.' : '') +
          (ref > 0 ? ' 그리고 지금까지 더 내신 ' + won(ref) + '원이 환급됩니다.' : ' 환급금은 총무 · FP.COM 에서 확인해서 알려드리겠습니다.'),
        basis: [
          '건강체 할인은 신청하지 않으면 자동으로 적용되지 않습니다. 조건이 되어도 모르고 계신 고객이 많습니다.',
          '판정 기준 : 주계약 표준체(건강상 별도 조건 없이 정상 가입) + 현재 할인 미적용.',
          '소급 적용되어 이미 납입한 보험료 중 차액을 환급받을 수 있습니다.',
          '신청 전 지원담당 문의 또는 FP.COM 에서 변경 후 보험료 · 환급금을 먼저 확인하세요.'
        ],
        prep: ['변경후 보험료 · 환급금 조회분'], est: ref
      });
    } else if (V('f_std') === 'O' && V('f_disc') === 'O') {
      add({
        lv: 'i', pri: 26, cat: '건강체 할인', t: '건강체 할인 적용 중 — 유지 안내',
        ment: cust + ' 님은 건강체 할인을 이미 받고 계십니다. 같은 조건이 계속 유지되는지 오늘 함께 확인해 드리겠습니다.',
        basis: [
          '할인 적용 사실을 고객이 모르고 계신 경우가 많아, 알려드리는 것만으로 만족도가 올라갑니다.',
          '건강 상태나 직업이 바뀌면 조건이 달라질 수 있어 정기 확인이 필요합니다.'
        ],
        prep: []
      });
    } else if (V('f_std') === 'X') {
      add({
        lv: 'b', pri: 71, cat: '건강체 할인', t: '표준체가 아닌 계약 — 재심사로 조건 완화 가능 여부 검토',
        ment: cust + ' 님, 이 계약은 가입하실 때 건강상 이유로 조건이 붙어 있습니다. ' +
          '조건이 붙은 계약도 시간이 지나 건강이 좋아지면 다시 심사받아 조건을 풀거나 낮출 수 있는 경우가 있습니다. 제가 확인해 보겠습니다.',
        basis: [
          '할증(보험료를 더 내는 조건)은 건강 상태가 좋아지면 재심사로 낮출 수 있는 경우가 있습니다.',
          '부담보(특정 부위나 질병을 일정 기간 보장하지 않는 조건)는 기간이 지나면 자동 해제되는 경우가 많습니다.',
          '조건 해제 사실을 모르면 보장이 되는데도 청구하지 않고 넘어가게 됩니다.'
        ],
        prep: []
      });
    }

    /* ---------- 2. 인수조건 ---------- */
    const uw = [
      V('c_uwx') ? '부담보(' + V('c_uwx') + ')' : '',
      V('c_uwu') ? '할증(' + V('c_uwu') + ')' : '',
      V('c_uwc') ? '삭감(' + V('c_uwc') + ')' : ''
    ].filter(Boolean);
    if (uw.length) {
      need('p9');
      add({
        lv: 'b', pri: 70, cat: '인수조건', t: '인수조건 ' + uw.join(' · ') + ' — 해제 가능 여부 확인 대상',
        ment: cust + ' 님, 이 계약에는 ' + uw.join(', ') + ' 조건이 붙어 있습니다. ' +
          '이런 조건은 정해진 기간이 지나면 풀리는 경우가 있어, 지금 상태가 어떤지 확인해 보겠습니다. 조건이 풀렸다면 보장 범위가 그만큼 넓어집니다.',
        basis: [
          '부담보는 통상 정해진 기간(예: 1~5년)이 지나면 자동으로 해제되어 보장이 시작됩니다.',
          '할증은 건강 상태 개선 시 재심사로 낮출 수 있습니다.',
          '삭감 기간이 끝났는지 확인해야 보험금 지급액이 달라집니다.',
          '필요 서류 : 계약사항 변경신청서.'
        ],
        prep: ['계약사항 변경신청서']
      });
    }

    /* ---------- 3. 직장 할인 ---------- */
    if (!V('f_comp')) bl('직장명 / 단체명 (고객 확인)');
    else {
      need('p7'); moneyUnknown++;
      add({
        lv: 'm', pri: 88, cat: '직장 할인', t: '직장(단체) 할인 대상 여부 확인 — ' + V('f_comp'),
        ment: cust + ' 님, 다니시는 ' + V('f_comp') + ' 가 저희와 단체 할인 협약이 되어 있으면 보험료를 깎아드릴 수 있습니다. ' +
          '직장 계약 할인표에서 확인해 보고 해당되면 바로 신청해 드리겠습니다.',
        basis: [
          '직장(단체)할인은 협약된 직장에 근무 중이면 적용되지만, 신청해야만 반영됩니다.',
          '이직하신 경우에도 새 직장이 협약 대상이면 다시 신청할 수 있습니다.',
          '방문 전 직장 계약 할인표에서 해당 여부를 미리 확인하세요.'
        ],
        prep: ['직장 계약 할인표']
      });
    }

    /* ---------- 4. 수술급여금 찾아주기 ---------- */
    if (old2006 === null) bl('가입일 (2006.02 이전 여부 판정에 필요)');
    if (V('f_surg') === '') bl('수술특약 가입여부 (O/X)');
    if (V('f_impl') === '') bl('임플란트 치조골이식 수술여부 (고객 확인)');

    if (old2006 && V('f_surg') === 'O' && V('f_impl') === 'O') {
      need('p3'); money += 500000;
      add({
        lv: 'm', pri: 100, cat: '수술급여금', t: '임플란트 치조골이식수술 — 수술급여금 청구 가능 (50만원)',
        ment: cust + ' 님, 임플란트 하실 때 잇몸뼈를 채워 넣는 수술(치조골이식술)을 받으셨다고 하셨죠. ' +
          '이 계약은 2006년 2월 이전에 가입하신 것' + (oldLabel ? ' ' + oldLabel : '') + '이라 그 수술도 보험금이 나옵니다. 수술특약 2종으로 50만원이 지급됩니다. ' +
          '치과에서 처음 진료받은 기록(초진차트)과 진단서만 떼어 주시면 제가 청구까지 다 해드리겠습니다.',
        basis: [
          '가입일 2006년 2월 이전 계약의 수술특약은 치조골이식술을 수술 2종으로 인정하여 50만원을 지급합니다.',
          '대부분의 고객이 "치과 치료는 보험이 안 된다"고 알고 계셔서 청구하지 않고 넘어갑니다.',
          '보험금 청구권의 소멸시효(청구할 수 있는 기한)는 3년입니다. 3년이 지난 건은 청구할 수 없습니다.',
          '필요 서류 : 초진차트, 진단서, 보험금 청구서.'
        ],
        prep: ['보험금 청구서', '초진차트 · 진단서'], est: 500000
      });
    } else if (old2006 && V('f_surg') === 'O' && V('f_impl') === '') {
      need('p3');
      add({
        lv: 'a', pri: 80, cat: '수술급여금', t: '임플란트 수술 여부를 고객께 꼭 여쭤보세요',
        ment: cust + ' 님, 혹시 임플란트 하신 적 있으신가요? 잇몸뼈가 부족해서 뼈를 채우는 수술을 함께 받으셨다면 보험금이 나올 수 있습니다. 오래된 계약이라 이런 부분이 보장되거든요.',
        basis: [
          '이 계약은 2006년 2월 이전 가입 + 수술특약 가입 상태라, 치조골이식술 시 50만원 지급 대상입니다.',
          '고객이 먼저 말씀하시는 경우가 거의 없으므로 FP가 직접 질문해야 발견됩니다.'
        ],
        prep: ['보험금 청구서']
      });
    }

    /* ---------- 5. 치아파절 ---------- */
    if (V('f_acc') === '') bl('재해치료비 특약 또는 골절치료 특약 가입여부 (O/X)');
    if (V('f_tooth') === '') bl('치아파절 여부 (고객 확인)');

    if (old2006 && V('f_acc') === 'O' && V('f_tooth') === 'O') {
      need('p3'); moneyUnknown++;
      add({
        lv: 'm', pri: 98, cat: '치아파절 보험금', t: '치아파절 — 골절 보험금 청구 가능',
        ment: cust + ' 님, 넘어지시거나 부딪혀서 이가 부러진 적이 있으시죠. 이가 부러진 것도 \'골절\'(뼈가 부러진 것)로 봅니다. ' +
          '이 계약에 재해치료비특약이 들어 있어서 보험금이 나옵니다. 치과 초진차트와 진단서만 준비해 주시면 제가 청구해 드리겠습니다.',
        basis: [
          '치아파절은 재해치료비특약 · 골절치료특약에서 골절로 인정되어 보험금이 지급됩니다.',
          '가입일 2006년 2월 이전 계약이 대상입니다.',
          '"치과는 보험이 안 된다"는 오해 때문에 가장 많이 놓치는 항목 중 하나입니다.',
          '청구 기한(소멸시효)은 3년이므로 지난 사고부터 빠르게 확인해야 합니다.'
        ],
        prep: ['보험금 청구서', '초진차트 · 진단서']
      });
    } else if (old2006 && V('f_acc') === 'O' && V('f_tooth') === '') {
      need('p3');
      add({
        lv: 'a', pri: 78, cat: '치아파절 보험금', t: '치아가 부러진 적 있는지 꼭 여쭤보세요',
        ment: cust + ' 님, 혹시 넘어지시거나 무엇을 씹다가 이가 부러진 적 있으신가요? 이가 부러진 것도 골절로 보고 보험금이 나옵니다.',
        basis: [
          '이 계약은 2006년 2월 이전 가입 + 재해치료비/골절치료특약 가입 상태입니다.',
          '치아파절은 고객이 보험 대상이라고 전혀 생각하지 못하는 항목입니다.'
        ],
        prep: ['보험금 청구서']
      });
    }

    /* ---------- 6. 대장용종 ---------- */
    if (V('f_polyp') === '') bl('대장용종 수술여부 (고객 확인)');
    if (V('f_polyp') === 'O') {
      let sum = 0; const lines = [];
      if (V('f_c21') === 'O') { sum += 2000000; lines.push('21C 넘버원 암치료보험 주계약에서 200만원'); }
      if (V('f_ben') === 'O') { sum += 1000000; lines.push('양성종양특약에서 100만원'); }
      if (V('f_surg') === 'O') { lines.push('수술특약에서 수술급여금'); moneyUnknown++; }
      if (lines.length) {
        need('p3'); money += sum;
        add({
          lv: 'm', pri: 99, cat: '대장용종 보험금',
          t: '대장용종 절제 — 보험금 청구 가능' + (sum ? ' (약 ' + won(sum) + '원)' : ''),
          ment: cust + ' 님, 대장 내시경 하시면서 용종(대장 안쪽에 생긴 작은 혹)을 떼어내셨죠. ' +
            '그것도 보험금이 나오는 수술입니다. ' + lines.join(', ') + '이 나옵니다. ' +
            '건강검진이라 안 될 거라고 생각하셨을 텐데, 떼어냈다면 청구 대상입니다. 서류만 주시면 제가 다 처리해 드리겠습니다.',
          basis: [
            '대장용종 절제술은 양성종양 또는 수술급여금 대상으로 보험금이 지급됩니다.',
            '21C 넘버원 암치료보험 : 주계약에서 200만원 지급.',
            '베스트라이프암보험 · 굿라이프암치료보험 · 폰나이스암보험의 양성종양특약 : 100만원 지급.',
            '수술특약이 함께 있으면 수술급여금도 별도로 지급됩니다.',
            '신청서 스캔 누락이 있으면 특약 가입 사실이 확인되지 않으니 함께 점검하세요.',
            '"건강검진 중에 뗀 것이라 안 된다"고 오해하여 청구하지 않는 대표적인 항목입니다.'
          ],
          prep: ['보험금 청구서', '초진차트 · 진단서'], est: sum
        });
      }
    } else if (V('f_polyp') === '' && (V('f_c21') === 'O' || V('f_ben') === 'O')) {
      need('p3');
      add({
        lv: 'a', pri: 85, cat: '대장용종 보험금', t: '대장 내시경에서 용종 떼신 적 있는지 꼭 여쭤보세요',
        ment: cust + ' 님, 대장 내시경 받으시면서 용종(대장에 생긴 작은 혹) 떼어내신 적 있으신가요? 있으시면 보험금이 나옵니다. 검진 중에 뗀 것도 해당됩니다.',
        basis: [
          '이 계약은 대장용종 보험금 지급 대상 상품에 해당합니다.',
          '용종 절제는 매우 흔하지만 청구율이 낮아, 질문만 해도 발견되는 경우가 많습니다.',
          '청구 기한(소멸시효) 3년 이내 건을 우선 확인하세요.'
        ],
        prep: ['보험금 청구서']
      });
    }

    /* ---------- 7. 헬스케어 ---------- */
    if (V('f_hc') === '') bl('헬스케어서비스 회원가입 여부 (O/X)');
    if (V('f_hc') === 'X') {
      need('p8'); need('p2');
      add({
        lv: 'b', pri: 72, cat: '헬스케어 서비스', t: '헬스케어서비스 미가입 — 안내 및 업셀링 대상',
        ment: cust + ' 님, 저희 헬스케어서비스는 아직 가입이 안 되어 있으십니다. ' +
          '이건 아프신 다음에 보험금만 드리는 게 아니라, 아프기 전에 건강검진이나 병원 연계 같은 도움을 받으실 수 있는 서비스입니다. ' +
          '어떤 혜택이 있는지 전단지로 먼저 보여드리고, 대상이 되시는지 확인해 드리겠습니다.',
        basis: [
          '헬스케어서비스는 주계약 가입금액이 기준 이상일 때 제공됩니다.',
          '기준에 조금 못 미치는 고객은 소액 증액만으로 대상이 되므로 제안 성공률이 높습니다.',
          '보험금 지급이 아닌 "건강관리 혜택"으로 접근하면 고객 거부감이 낮습니다.',
          '방문 전 확인 : 헬스케어 바인딩 · 안내전단지, 가입설계서 출력.'
        ],
        prep: ['헬스케어 안내전단지', '가입설계서(업셀링)']
      });
    }
    if (V('f_hc') === 'O') {
      need('p8');
      add({
        lv: 'i', pri: 25, cat: '헬스케어 서비스', t: '헬스케어서비스 가입 상태 — 활용 안내 대상',
        ment: cust + ' 님은 헬스케어서비스에 이미 가입되어 계십니다. 그런데 실제로 써보신 적은 없으시죠? 건강검진 예약이나 상담을 무료로 받으실 수 있으니, 오늘 이용 방법을 알려드리겠습니다.',
        basis: [
          '가입만 되어 있고 이용하지 않는 고객이 많아, 활용 안내만으로도 만족도가 크게 올라갑니다.',
          '이용 경험이 있는 고객은 계약 유지율이 높습니다.'
        ],
        prep: ['헬스케어 안내전단지']
      });
    }

    /* ---------- 8. 납입관련 ---------- */
    const paid = N('b_paid'), surr = N('b_surr');
    if (paid > 0 && surr > 0) {
      const r = surr / paid * 100;
      add({
        lv: 'i', pri: 20, cat: '납입관련',
        t: '기납입 ' + won(paid) + '원 / 해약환급금 ' + won(surr) + '원 (환급률 ' + r.toFixed(0) + '%)',
        ment: cust + ' 님이 지금까지 내신 보험료는 ' + won(paid) + '원이고, 지금 해지하시면 ' + won(surr) + '원을 받으십니다. ' +
          (r < 100
            ? '아직 내신 돈보다 적습니다. 계약은 오래 유지하실수록 유리해지니 조금만 더 지켜보시는 게 좋겠습니다.'
            : '내신 돈보다 많아진 상태입니다. 잘 유지해 오셨습니다.'),
        basis: [
          '해약환급금이 기납입보험료보다 적은 시기에 해지하면 손실이 확정됩니다.',
          '환급률 수치를 직접 보여드리면 충동적인 해지를 막는 데 효과적입니다.'
        ],
        prep: []
      });
    }
    if (!V('b_paid') || !V('b_surr')) bl('기납입보험료 / 해약환급금');

    /* ---------- 9. 대출 · 중도인출 ---------- */
    const lbal = N('b_lbal'), lrate = N('b_lrate'), lti = N('b_lti'), lmi = N('b_lmi');
    if (lbal > 0) {
      add({
        lv: 'a', pri: 76, cat: '대출',
        t: '보험계약대출 ' + won(lbal) + '원 이용 중' + (lrate ? ' (이율 ' + lrate + '%)' : ''),
        ment: cust + ' 님, 지금 보험에서 ' + won(lbal) + '원을 대출받아 쓰고 계십니다. ' +
          (lrate ? '이율은 ' + lrate + '% 이고, ' : '') +
          (lmi ? '매달 이자가 ' + won(lmi) + '원, ' : '') +
          (lti ? '지금까지 낸 이자가 ' + won(lti) + '원입니다. ' : '') +
          '이자가 계속 쌓이면 나중에 받으실 보험금이나 환급금에서 그만큼 빠집니다. 여유가 생기실 때 조금씩이라도 갚아나가시는 게 좋고, 필요하시면 중도인출 같은 다른 방법도 비교해 드리겠습니다.',
        basis: [
          '보험계약대출 이자는 자동으로 원금에 더해져 복리로 늘어납니다.',
          '대출 원리금은 보험금 · 해약환급금 지급 시 먼저 차감되므로, 정작 필요할 때 받는 금액이 줄어듭니다.',
          '중도인출은 이자가 붙지 않는 대신 적립금이 줄어드는 방식이라, 어느 쪽이 유리한지 비교해 드려야 합니다.'
        ],
        prep: []
      });
    }
    const wdavl = N('b_wdavl');
    if (wdavl > 0 && lbal === 0) {
      add({
        lv: 'i', pri: 35, cat: '중도인출', t: '중도인출 가능금액 ' + won(wdavl) + '원',
        ment: cust + ' 님, 급하게 돈이 필요하실 때 이 계약에서 ' + won(wdavl) + '원까지는 이자 없이 꺼내 쓰실 수 있습니다. 은행 대출 알아보시기 전에 저에게 먼저 물어보세요.',
        basis: [
          '중도인출은 이자 부담이 없어 급전이 필요한 고객에게 유용합니다.',
          '다만 인출한 만큼 적립금과 향후 환급금이 줄어들므로 금액과 시점 안내가 필요합니다.',
          '자금 니즈를 파악하는 자연스러운 대화 소재가 됩니다.'
        ],
        prep: []
      });
    }

    /* ---------- 10. 생존보험금 ---------- */
    const midD = dd(V('b_middt')), matD = dd(V('b_matdt'));
    const midA = N('b_midamt'), matA = N('b_matamt');
    if (V('b_middt') && midD !== null && midD <= 180) {
      need('p4');
      if (midD < 0) money += midA;
      add({
        lv: 'm', pri: midD < 0 ? 97 : 74, cat: '생존보험금',
        t: midD < 0
          ? '중도보험금 미수령 의심 (' + ymd(normDate(V('b_middt'))) + ' · ' + won(midA) + '원)'
          : '중도보험금 수령 예정 (D-' + midD + ')',
        ment: midD < 0
          ? cust + ' 님, ' + ymd(normDate(V('b_middt'))) + '에 받으실 수 있는 중도보험금 ' + won(midA) + '원이 있는데 아직 찾아가지 않으신 것 같습니다. 이건 이미 ' + cust + ' 님 돈입니다. 신청만 하시면 바로 나가니까 오늘 같이 처리해 드리겠습니다.'
          : cust + ' 님, ' + ymd(normDate(V('b_middt'))) + '에 중도보험금 ' + won(midA) + '원이 나옵니다. 잊지 않으시도록 미리 말씀드립니다. 오늘 신청서를 미리 써 두시면 그날 바로 받으실 수 있습니다.',
        basis: [
          '중도보험금은 신청하지 않으면 지급되지 않고 그대로 남아 있게 됩니다 (숨은보험금의 대표 유형).',
          '수령 예정일을 미리 알려드리는 것만으로도 신뢰가 크게 올라갑니다.',
          '필요 서류 : 생존보험금 신청서.'
        ],
        prep: ['생존보험금 신청서'], est: midD < 0 ? midA : 0
      });
    }
    if (V('b_matdt') && matD !== null && matD <= 365) {
      need('p4'); need('p1');
      if (matD < 0) money += matA;
      add({
        lv: 'm', pri: matD < 0 ? 96 : 75, cat: '생존보험금',
        t: matD < 0
          ? '만기보험금 미수령 의심 (' + ymd(normDate(V('b_matdt'))) + ' · ' + won(matA) + '원)'
          : '만기보험금 수령 예정 (D-' + matD + ')',
        ment: matD < 0
          ? cust + ' 님, ' + ymd(normDate(V('b_matdt'))) + '에 만기가 되어 ' + won(matA) + '원을 받으실 수 있는데 아직 신청이 안 되어 있습니다. 오늘 신청서 써 드리겠습니다.'
          : cust + ' 님, ' + ymd(normDate(V('b_matdt'))) + '에 이 계약이 만기가 되어 ' + won(matA) + '원을 받으십니다. 다만 그날부터는 이 계약의 보장이 끝나니, 그 전에 보장을 어떻게 이어갈지 함께 정리해 두시면 좋겠습니다.',
        basis: [
          '만기보험금 역시 청구해야 지급되며, 미청구 상태로 남는 경우가 많습니다.',
          '만기일 이후에는 보장이 즉시 종료되어 무보험 기간이 생깁니다. 만기 전 보장 연결 설계가 필요합니다.',
          '만기 시점은 재설계 · 업셀링을 자연스럽게 제안할 수 있는 최적 시점입니다.'
        ],
        prep: ['생존보험금 신청서', '보장분석서'], est: matD < 0 ? matA : 0
      });
    }

    /* ---------- 11. 계약변경 이력 ---------- */
    if (V('b_pch') || V('b_cch')) {
      need('p9');
      add({
        lv: 'i', pri: 30, cat: '계약변경',
        t: '계약 변경이력 확인 (' + [V('b_pch'), V('b_cch')].filter(Boolean).join(' / ') + ')',
        ment: cust + ' 님, 그동안 바뀐 내용이 있어서 지금 상태가 맞는지 함께 확인해 보겠습니다. ' +
          '수금하는 계좌나 계약 내용이 예전 그대로면 다시 맞춰 드리겠습니다.',
        basis: [
          '수금자 · 계좌 정보가 옛날 것으로 남아 있으면 보험료 미납으로 실효될 수 있습니다.',
          '변경이력이 있는 계약은 서류 누락 여부를 함께 점검해야 합니다.',
          '필요 서류 : 계약사항 변경신청서.'
        ],
        prep: ['계약사항 변경신청서']
      });
    }

    /* ---------- 12. 사고보험금 ---------- */
    if (claims.length) {
      need('p3');
      const names = claims.map(function (c) { return c.d; }).filter(Boolean).join(', ');
      add({
        lv: 'a', pri: 82, cat: '사고보험금', t: '과거 지급 이력 ' + claims.length + '건 — 추가 청구 가능 여부 확인',
        ment: cust + ' 님, 예전에 ' + (names || '보험금을 받으신 기록') + ' (으)로 보험금을 받으신 기록이 있습니다. ' +
          '같은 병으로 그 뒤에도 병원에 다니셨다면 추가로 청구할 수 있는 부분이 있는지 확인해 보겠습니다. ' +
          '그리고 치료가 끝난 뒤 몸에 불편함이 남으셨다면 후유장해(치료 후에도 계속 남는 몸의 손상)로 따로 청구되는 경우도 있습니다.',
        basis: [
          '진단비는 한 번 받았어도, 입원 · 수술 · 통원은 건별로 반복 청구가 가능합니다.',
          '치료 종결 후 남은 장해는 후유장해로 별도 청구 대상이 될 수 있습니다.',
          '기존 지급 이력은 고객이 청구에 익숙하다는 뜻이므로, 미청구 건 발굴 성공률이 높습니다.'
        ],
        prep: ['보험금 청구서']
      });
    } else {
      need('p3');
      add({
        lv: 'a', pri: 86, cat: '사고보험금', t: '최근 3년 내 병원 이력 — 반드시 질문하세요',
        ment: cust + ' 님, 최근 3년 안에 입원하시거나 수술받으신 적, 아니면 다치셔서 병원에 다니신 적 있으신가요? ' +
          '작은 것이라도 말씀해 주세요. 청구가 되는지 안 되는지는 제가 판단해 드리겠습니다. 안 되는 건 어쩔 수 없지만, 되는 걸 모르고 넘어가면 그건 너무 아깝습니다.',
        basis: [
          '보험금 청구권의 소멸시효는 3년입니다. 그 기간이 지나면 권리가 사라집니다.',
          '미청구 보험금 확인 · 청구 대행은 평생든든서비스의 핵심 기능입니다.',
          '통원 · 골절 · 치과 · 안과처럼 고객이 "안 될 것 같다"고 넘긴 건에서 실제 지급 사례가 많습니다.'
        ],
        prep: ['보험금 청구서']
      });
    }

    /* ---------- 13. 변액안내 ---------- */
    if (funds.length) {
      need('p5');
      const names = funds.map(function (x) {
        return String(x.name || '').trim() + (x.ratio ? ' ' + numOf(x.ratio) + '%' : '');
      }).filter(function (s) { return s.trim(); }).join(', ');
      const lowRatio = funds.some(function (x) { return x.ratio && numOf(x.ratio) < 80; });
      add({
        lv: lowRatio ? 'b' : 'i', pri: lowRatio ? 62 : 40, cat: '변액안내',
        t: '펀드 점검 대상 (' + (names || funds.length + '건') + ')',
        ment: cust + ' 님, 이 계약은 펀드로 운용되는 상품이라 어디에 투자되고 있는지 가끔 확인해 보셔야 합니다. ' +
          '지금은 ' + (names || '가입하신 펀드') + '에 들어가 있는데, 수익률을 함께 보시고 필요하면 다른 펀드로 옮기는 것(펀드 변경)도 무료로 해드릴 수 있습니다.' +
          (lowRatio ? ' 적립비율이 낮은 펀드가 있어 오늘 함께 조정해 보시는 걸 권합니다.' : ''),
        basis: [
          '변액상품은 펀드 변경이 연 일정 횟수까지 무료이나, 활용하지 않는 고객이 대부분입니다.',
          '정기적인 펀드 점검은 계약 유지율을 높이고 민원을 예방합니다.',
          '방문 전 FP.COM 에서 펀드 가입내역 · 적립비율과 펀드수익률표를 출력해 지참하세요.'
        ],
        prep: ['펀드수익률표']
      });
    }

    /* ---------- 14. 보장 만기 ---------- */
    [['b_cmain', '주계약'], ['b_crider', '특약']].forEach(function (pair) {
      const k = pair[0], nm = pair[1];
      const d = dd(V(k));
      if (V(k) && d !== null && d <= 730) {
        need('p1');
        add({
          lv: d < 0 ? 'a' : 'b', pri: d < 0 ? 92 : 66, cat: '보장 만기',
          t: d < 0
            ? nm + ' 보장 이미 종료됨 (' + ymd(normDate(V(k))) + ')'
            : nm + ' 보장 만기 임박 (' + ymd(normDate(V(k))) + ' · D-' + d + ')',
          ment: d < 0
            ? cust + ' 님, ' + nm + ' 보장이 ' + ymd(normDate(V(k))) + '로 이미 끝났습니다. 지금은 그 부분이 비어 있는 상태입니다. 어떤 보장이 없어졌는지 정리해서 보여드리고, 어떻게 채울지 함께 보시겠습니다.'
            : cust + ' 님, ' + nm + ' 보장이 ' + ymd(normDate(V(k))) + '에 끝납니다. 만기가 되면 그날부터 보장이 없어집니다. 미리 알고 계셔야 공백 없이 이어갈 수 있어서 오늘 말씀드립니다.',
          basis: [
            '만기 이후에는 보장이 즉시 종료되어 무보험 상태가 됩니다.',
            '만기 도래 안내는 평생든든서비스의 정규 안내 항목입니다.',
            '나이가 오른 뒤 새로 가입하면 보험료가 크게 오르므로, 만기 전 대비가 유리합니다.',
            '주요보장 급부 만기시점은 보장분석서로 대체해 설명할 수 있습니다.'
          ],
          prep: ['보장분석서']
        });
      }
    });

    /* ---------- 15. 납입 만료 (계약 표에서 자동 계산) ---------- */
    contracts.forEach(function (c, i) {
      const j = normDate(c.join);
      if (!j || !String(c.payterm || '').trim()) return;
      const out = Calc.calcPayEnd(j, c.payterm, '');
      const d = dd(out.value);
      if (!out.value || d === null || d > 365 || d < 0) return;
      add({
        lv: 'i', pri: 45, cat: '납입만료',
        t: (c.prod || '가입건수 ' + (i + 1)) + ' 보험료 납입 만료 임박 (' + ymd(out.value) + ' · D-' + d + ')',
        ment: cust + ' 님, ' + ymd(out.value) + '이면 ' + (c.prod || '이 계약') + '의 보험료 납입이 끝납니다. 그 뒤로는 돈은 안 내시는데 보장은 계속됩니다. ' +
          '그때 여유가 생기시니, 지금 비어 있는 보장을 그 시점에 맞춰 채우시는 것도 좋은 방법입니다.',
        basis: [
          '납입 만료 시점은 고객의 가처분 소득이 늘어나는 시점으로, 추가 제안 성공률이 높습니다.',
          '납입이 끝나도 보장은 유지된다는 점을 명확히 안내해야 불필요한 해지를 막을 수 있습니다.',
          '계산 근거 : ' + out.how
        ],
        prep: []
      });
    });

    /* ---------- 16. 수익자 ---------- */
    if (!V('c_bh') || !V('c_bd')) {
      need('p9');
      add({
        lv: 'a', pri: 64, cat: '수익자', t: '수익자 지정 확인 필요',
        ment: cust + ' 님, 보험금을 받으실 분(수익자)이 누구로 되어 있는지 함께 확인해 보시겠습니다. ' +
          '결혼이나 출산처럼 가족관계에 변화가 있으셨다면 지금 바로잡아 두시는 게 좋습니다. 나중에 가족끼리 곤란해지는 일을 미리 막을 수 있습니다.',
        basis: [
          '수익자가 실제 의도와 다르게 지정되어 있으면 지급 지연이나 가족 간 분쟁이 발생합니다.',
          '수익자 변경은 계약자가 생존해 계실 때만 자유롭게 가능합니다.',
          '상속 · 증여세 문제와도 직접 연결되는 항목입니다.',
          '필요 서류 : 계약사항 변경신청서.'
        ],
        prep: ['계약사항 변경신청서']
      });
    }
    if (!V('c_bh')) bl('수익자 (입원시)');
    if (!V('c_bd')) bl('수익자 (사망시)');

    /* ---------- 17. 고객 관리 ---------- */
    if (V('p_bday') || V('p_anniv')) {
      need('p6');
      add({
        lv: 'i', pri: 15, cat: '고객관리',
        t: '기념일 관리 대상 (' + [V('p_bday') ? '생일 ' + V('p_bday') : '', V('p_anniv') ? '기념일 ' + V('p_anniv') : ''].filter(Boolean).join(' · ') + ')',
        ment: cust + ' 님, 생일이나 기념일에 제가 잊지 않고 연락드리겠습니다. 오늘 알려주신 날짜로 기록해 두겠습니다.',
        basis: [
          '기념일 연락은 재접촉의 가장 자연스러운 명분이 됩니다.',
          '명함 · 사은품을 함께 준비하면 소개 요청으로 이어지기 쉽습니다.'
        ],
        prep: ['명함 · 사은품']
      });
    }
    if (V('p_addr0') && !V('p_addr1')) bl('주소 (변경 후) — 변경 전만 적혀 있습니다');

    /* ---------- 정렬 · 등급 ---------- */
    F2.sort(function (a, b) { return b.pri - a.pri; });
    const grade =
      F2.some(function (x) { return x.lv === 'm'; }) ? 'A'
        : F2.some(function (x) { return x.lv === 'b' && x.pri >= 70; }) ? 'A'
          : F2.some(function (x) { return x.lv === 'a'; }) ? 'B' : 'C';

    return {
      cust: cust, findings: F2, prep: prep, blanks: blanks,
      money: money, moneyUnknown: moneyUnknown, grade: grade,
      hidCnt: F2.filter(function (x) { return x.lv === 'm'; }).length,
      contracts: contracts, firstJoin: firstJoin, premSum: premSum,
      hiddens: hiddens, follows: follows,
      today: today
    };
  }

  /* 상담 스크립트 생성 */
  function buildScript(record, res) {
    const f = (record && record.f) || {};
    const V = function (k) { return String(f[k] == null ? '' : f[k]).trim(); };
    const strip = function (s) { return String(s).replace(/<[^>]+>/g, ''); };
    const cust = res.cust;
    const prods = res.contracts.map(function (c) { return c.prod; }).filter(Boolean).join(' / ');
    let s = '';
    s += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    s += ' 평생든든 방문 상담 스크립트\n';
    s += ' ' + cust + ' 님 · ' + (prods || '계약 ' + res.contracts.length + '건') + '\n';
    s += ' ' + (V('h_fp') || '') + ' · 분석일 ' + (ymd(normDate(V('h_adate'))) || '') + '\n';
    s += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

    s += '【1. 인사 · 방문 목적】\n';
    s += cust + ' 님, 안녕하세요. 오늘은 새 보험을 권해드리려고 온 게 아니라,\n';
    s += '이미 가입해 두신 계약을 하나하나 확인해 드리려고 찾아뵈었습니다.\n';
    s += '저희가 하는 평생든든서비스인데, 보장 내용을 다시 짚어드리고,\n';
    s += '혹시 못 받으신 보험금이 있으면 제가 대신 청구해 드리고,\n';
    s += '만기나 갱신처럼 놓치기 쉬운 시점을 미리 알려드리는 것까지가 제 일입니다.\n\n';

    if (res.money > 0) {
      s += '【2. 첫 마디 — 찾아드릴 돈 이야기】\n';
      s += cust + ' 님, 오시기 전에 계약을 미리 다 살펴봤는데요.\n';
      s += '지금 바로 찾아드릴 수 있는 보험금이 약 ' + won(res.money) + '원 있습니다.\n';
      if (res.moneyUnknown) s += '여기에 금액을 더 확인해봐야 하는 것도 ' + res.moneyUnknown + '건 있습니다.\n';
      s += '오늘 그것부터 처리해 드리겠습니다.\n\n';
    }

    const sec = function (k, title) {
      const arr = res.findings.filter(function (x) { return x.lv === k; });
      if (!arr.length) return;
      s += '【' + title + '】\n\n';
      arr.forEach(function (x, i) {
        s += '▶ ' + (i + 1) + '. ' + x.t + '  [' + x.cat + ']\n';
        s += '[고객 안내]\n' + strip(x.ment) + '\n';
        s += '[제안 근거]\n';
        x.basis.forEach(function (b) { s += '  · ' + strip(b) + '\n'; });
        if (x.prep && x.prep.length) s += '  ※ 지참 : ' + x.prep.join(' / ') + '\n';
        s += '\n';
      });
    };
    sec('m', '3. 숨은보험금 · 환급 — 오늘 바로 처리');
    sec('a', '4. 즉시 조치가 필요한 항목');
    sec('b', '5. 보완 · 제안 항목');
    sec('i', '6. 참고로 함께 안내할 내용');

    if (res.blanks.length) {
      s += '【7. 고객께 직접 여쭤볼 것 (미확인 항목)】\n';
      res.blanks.forEach(function (b) { s += '  □ ' + b + '\n'; });
      s += '\n';
    }

    s += '【마무리 인사】\n';
    s += cust + ' 님, 오늘 확인해 드린 내용은 정리해서 따로 남겨드리겠습니다.\n';
    s += '오늘 바로 결정하지 않으셔도 괜찮습니다.\n';
    s += '다만 병원에 다녀오신 일이 생기면, 이게 보험금이 되는지 안 되는지 고민하지 마시고\n';
    s += '저에게 먼저 연락 주세요. 판단은 제가 해드리겠습니다.\n';
    s += '그게 제가 해드리는 평생든든서비스입니다. 오늘 시간 내주셔서 감사합니다.\n\n';
    s += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    s += '※ 지급 여부와 금액은 반드시 약관과 회사 시스템에서 최종 확인 후 안내하세요.\n';
    s += '※ 보험금 청구권 소멸시효는 3년입니다. 오래된 건부터 우선 확인하세요.\n';
    return s;
  }

  const LEVELS = {
    m: { t: '숨은보험금 · 환급', c: 't-m' },
    a: { t: '즉시 조치', c: 't-a' },
    b: { t: '보완 · 제안', c: 't-b' },
    i: { t: '참고 안내', c: 't-i' }
  };

  const Analysis = { analyze: analyze, buildScript: buildScript, LEVELS: LEVELS };

  if (isNode) module.exports = Analysis;
  else (global.KB = global.KB || {}).Analysis = Analysis;
})(typeof globalThis !== 'undefined' ? globalThis : this);
