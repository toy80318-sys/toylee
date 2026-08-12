/*
 * 엑셀 서식 생성 · 읽기
 * - 빈 서식(입력용) 내려받기
 * - 저장된 계약을 서식 그대로 채워서 내보내기 (+ 진단결과 시트)
 * - 채워 온 서식을 그대로 올려서 DB에 넣기
 * - 누적 관리대장(전체 계약 + 통계)
 *
 * 서식 안에는 숨김 시트 '_meta' 가 들어 있어, 어느 칸이 어느 항목인지 기록해 둡니다.
 * 덕분에 칸 위치가 바뀌어도 다시 읽어 들일 수 있습니다.
 */
'use strict';

const ExcelJS = require('exceljs');
const Schema = require('../shared/schema.js');
const Calc = require('../shared/calc.js');
const Analysis = require('../shared/analysis.js');

const NAVY = 'FF0B3A5D';
const NAVY2 = 'FF155B8A';
const GOLD = 'FFC9922E';
const SURF = 'FFEEF2F6';
const SURF2 = 'FFF7F9FB';
const LINE = 'FFD8DFE6';

const SHEET_INPUT = '계약입력';
const SHEET_CLAIM = '사고보험금';
const SHEET_CHECK = '준비물체크';
const SHEET_RESULT = '진단결과';
const SHEET_META = '_meta';

const FIELD_MAP = Schema.fieldMap();

/* ---------- 서식 도우미 ---------- */

function thin() {
  return {
    top: { style: 'thin', color: { argb: LINE } },
    left: { style: 'thin', color: { argb: LINE } },
    bottom: { style: 'thin', color: { argb: LINE } },
    right: { style: 'thin', color: { argb: LINE } }
  };
}

function fill(cell, argb) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } };
}

function titleRow(ws, row, text, sub) {
  ws.mergeCells(row, 1, row, 4);
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' }, name: '맑은 고딕' };
  fill(c, NAVY);
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(row).height = 26;
  if (sub) {
    ws.mergeCells(row + 1, 1, row + 1, 4);
    const s = ws.getCell(row + 1, 1);
    s.value = sub;
    s.font = { size: 10, color: { argb: 'FF6B7885' }, name: '맑은 고딕' };
    s.alignment = { vertical: 'middle', indent: 1 };
    return row + 2;
  }
  return row + 1;
}

function sectionRow(ws, row, text, desc) {
  ws.mergeCells(row, 1, row, 4);
  const c = ws.getCell(row, 1);
  c.value = text + (desc ? '   —   ' + desc : '');
  c.font = { bold: true, size: 11.5, color: { argb: 'FFFFFFFF' }, name: '맑은 고딕' };
  fill(c, NAVY2);
  c.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(row).height = 21;
  return row + 1;
}

function labelFor(f) {
  return f.label + (f.unit ? ' (' + f.unit + ')' : '');
}

/* ---------- 빈 서식 / 채워진 서식 ---------- */

function buildWorkbook(record, options) {
  options = options || {};
  const f = (record && record.f) || {};
  const claims = (record && record.claims) || [];
  const chk = (record && record.chk) || {};

  const wb = new ExcelJS.Workbook();
  wb.creator = '평생든든 고객 정보파악 프로그램';
  wb.created = new Date();

  const meta = [];
  const ws = wb.addWorksheet(SHEET_INPUT, {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  ws.columns = [
    { width: 14 }, { width: 34 }, { width: 28 }, { width: 34 }
  ];

  let r = titleRow(ws, 1, '교보생명 평생든든서비스 — 고객 정보파악 서식',
    '노란 칸에 입력하세요. 회색 칸은 자동 계산 항목이라 비워 두셔도 됩니다. 작성 후 프로그램의 [엑셀 서식 올리기]로 그대로 등록됩니다.');
  r += 1;

  Schema.SECTIONS.forEach(function (sec) {
    const title = (sec.no ? '' + sec.no + '. ' : '') + sec.title;
    r = sectionRow(ws, r, title, sec.desc);

    const head = ws.getRow(r);
    ['구분', '항목', '입력값', '사전 자료준비 · 참고'].forEach(function (t, i) {
      const c = head.getCell(i + 1);
      c.value = t;
      c.font = { bold: true, size: 10, color: { argb: NAVY }, name: '맑은 고딕' };
      fill(c, SURF);
      c.border = thin();
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    head.height = 18;
    r++;

    let lastGroup = null;
    sec.fields.forEach(function (fd) {
      const row = ws.getRow(r);

      const gc = row.getCell(1);
      gc.value = (fd.group && fd.group !== lastGroup) ? fd.group : '';
      lastGroup = fd.group || lastGroup;
      gc.font = { bold: true, size: 10, color: { argb: NAVY }, name: '맑은 고딕' };
      fill(gc, SURF2);
      gc.border = thin();
      gc.alignment = { horizontal: 'center', vertical: 'middle' };

      const lc = row.getCell(2);
      lc.value = labelFor(fd) + (fd.required ? ' *' : '');
      lc.font = { size: 10.5, name: '맑은 고딕' };
      lc.border = thin();
      lc.alignment = { vertical: 'middle', indent: 1 };

      const vc = row.getCell(3);
      vc.border = thin();
      vc.alignment = { vertical: 'middle', horizontal: fd.type === 'number' ? 'right' : 'left', indent: 1 };
      vc.font = { size: 10.5, name: '맑은 고딕' };
      fill(vc, fd.auto ? SURF2 : 'FFFFFDF2');

      const raw = f[fd.k];
      if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
        if (fd.type === 'number') vc.value = Calc.numOf(raw);
        else if (fd.type === 'date') vc.value = Calc.normDate(raw) || String(raw);
        else vc.value = String(raw);
      }
      if (fd.type === 'number') vc.numFmt = '#,##0.##';
      if (fd.type === 'select' && fd.options && fd.options.length) {
        const list = (fd.blank ? [''] : []).concat(fd.options);
        vc.dataValidation = {
          type: 'list', allowBlank: true, showErrorMessage: false,
          formulae: ['"' + list.join(',') + '"']
        };
      }

      const hc = row.getCell(4);
      const hints = [];
      if (fd.hint) hints.push(fd.hint);
      if (fd.ph) hints.push('예: ' + fd.ph);
      if (fd.auto) hints.push('자동 계산 항목');
      if (fd.type === 'date') hints.push('20030514 처럼 적으셔도 됩니다');
      if (fd.type === 'select' && fd.options) hints.push(fd.options.join(' / '));
      hc.value = hints.join(' · ');
      hc.font = { size: 9.5, color: { argb: 'FF6B7885' }, name: '맑은 고딕' };
      hc.border = thin();
      hc.alignment = { vertical: 'middle', indent: 1, wrapText: true };

      row.height = 19;
      meta.push(['cell', SHEET_INPUT, 'C' + r, fd.k]);
      r++;
    });
    r += 1;
  });

  /* ---------- 사고보험금 시트 ---------- */
  const cs = wb.addWorksheet(SHEET_CLAIM);
  cs.columns = [{ width: 6 }, { width: 34 }, { width: 16 }, { width: 18 }];
  let cr = titleRow(cs, 1, '사고보험금 지급 이력', '과거에 받으신 보험금을 적으시면 추가 청구 가능 여부를 함께 판정합니다.');
  cr += 1;
  const chead = cs.getRow(cr);
  ['No', '병명', '수령일', '수령액(원)'].forEach(function (t, i) {
    const c = chead.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' }, name: '맑은 고딕' };
    fill(c, NAVY);
    c.border = thin();
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  meta.push(['table', SHEET_CLAIM, String(cr), 'claims']);
  Schema.CLAIM_FIELDS.forEach(function (cf, i) {
    meta.push(['col', SHEET_CLAIM, String.fromCharCode(66 + i), cf.k]);
  });
  cr++;
  const CLAIM_ROWS = Math.max(12, claims.length + 5);
  for (let i = 0; i < CLAIM_ROWS; i++) {
    const row = cs.getRow(cr + i);
    row.getCell(1).value = i + 1;
    row.getCell(1).alignment = { horizontal: 'center' };
    const c = claims[i];
    if (c) {
      row.getCell(2).value = c.d || '';
      row.getCell(3).value = Calc.normDate(c.t) || c.t || '';
      if (c.a) row.getCell(4).value = Calc.numOf(c.a);
    }
    for (let col = 1; col <= 4; col++) {
      const cell = row.getCell(col);
      cell.border = thin();
      cell.font = { size: 10.5, name: '맑은 고딕' };
      if (col > 1) fill(cell, 'FFFFFDF2');
    }
    row.getCell(4).numFmt = '#,##0';
    row.height = 19;
  }

  /* ---------- 준비물 · 추가점검 시트 ---------- */
  const ks = wb.addWorksheet(SHEET_CHECK);
  ks.columns = [{ width: 18 }, { width: 52 }, { width: 12 }];
  let kr = titleRow(ks, 1, '방문 전 준비물 · 추가 점검사항', '챙기신 항목에 O 를 넣으세요. 프로그램에서 분석을 실행하면 필요한 항목이 자동으로 체크됩니다.');
  kr += 1;
  [['준비물', Schema.PREPS], ['추가 점검사항', Schema.EXTRAS]].forEach(function (pair) {
    kr = sectionRow(ks, kr, pair[0]);
    const h = ks.getRow(kr);
    ['구분', '항목', '체크(O/X)'].forEach(function (t, i) {
      const c = h.getCell(i + 1);
      c.value = t;
      c.font = { bold: true, size: 10, color: { argb: NAVY }, name: '맑은 고딕' };
      fill(c, SURF);
      c.border = thin();
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    kr++;
    pair[1].forEach(function (item) {
      const row = ks.getRow(kr);
      row.getCell(1).value = item.id;
      row.getCell(2).value = item.t;
      row.getCell(3).value = chk[item.id] ? 'O' : '';
      row.getCell(3).dataValidation = { type: 'list', allowBlank: true, formulae: ['"O,X"'] };
      for (let col = 1; col <= 3; col++) {
        const cell = row.getCell(col);
        cell.border = thin();
        cell.font = { size: 10.5, name: '맑은 고딕' };
        cell.alignment = { vertical: 'middle', horizontal: col === 2 ? 'left' : 'center', indent: col === 2 ? 1 : 0 };
      }
      fill(row.getCell(3), 'FFFFFDF2');
      row.height = 18;
      meta.push(['check', SHEET_CHECK, 'C' + kr, item.id]);
      kr++;
    });
    kr += 1;
  });

  /* ---------- 진단결과 시트 (채워진 서식에만) ---------- */
  if (record && options.withResult !== false) {
    addResultSheet(wb, record);
  }

  /* ---------- 숨김 meta ---------- */
  const ms = wb.addWorksheet(SHEET_META);
  ms.state = 'veryHidden';
  ms.addRow(['type', 'sheet', 'ref', 'key']);
  meta.forEach(function (m) { ms.addRow(m); });
  if (record && record.id) ms.addRow(['id', '', '', String(record.id)]);

  return wb;
}

function addResultSheet(wb, record) {
  const res = Analysis.analyze(record);
  const ws = wb.addWorksheet(SHEET_RESULT);
  ws.columns = [{ width: 5 }, { width: 22 }, { width: 46 }, { width: 60 }];
  let r = titleRow(ws, 1, '진단 결과 — ' + res.cust + ' 님',
    '판정 기준은 회사 양식을 옮긴 것입니다. 실제 지급 여부와 금액은 약관·회사 시스템에서 최종 확인하세요.');
  r += 1;

  r = sectionRow(ws, r, '요약');
  const kpi = [
    ['숨은보험금 · 환급 건', res.findings.filter(function (x) { return x.lv === 'm'; }).length + ' 건'],
    ['즉시 조치 항목', res.findings.filter(function (x) { return x.lv === 'a'; }).length + ' 건'],
    ['보완 · 제안 항목', res.findings.filter(function (x) { return x.lv === 'b'; }).length + ' 건'],
    ['발견 예상액', Calc.won(res.money) + ' 원' + (res.moneyUnknown ? ' (금액확인 필요 ' + res.moneyUnknown + '건 별도)' : '')],
    ['추천 방문결과 등급', res.grade]
  ];
  kpi.forEach(function (k) {
    const row = ws.getRow(r);
    ws.mergeCells(r, 2, r, 3);
    row.getCell(1).value = '';
    row.getCell(2).value = k[0];
    row.getCell(4).value = k[1];
    row.getCell(2).font = { bold: true, size: 10.5, color: { argb: NAVY }, name: '맑은 고딕' };
    row.getCell(4).font = { bold: true, size: 11, name: '맑은 고딕' };
    fill(row.getCell(2), SURF2);
    [2, 4].forEach(function (c) { row.getCell(c).border = thin(); row.getCell(c).alignment = { vertical: 'middle', indent: 1 }; });
    row.height = 19;
    r++;
  });
  r += 1;

  r = sectionRow(ws, r, '발견 항목 · 고객 안내 멘트 · 제안 근거', '급한 순서로 정렬했습니다.');
  const head = ws.getRow(r);
  ['순위', '구분', '항목', '고객 안내 멘트 / 제안 근거'].forEach(function (t, i) {
    const c = head.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, size: 10, color: { argb: NAVY }, name: '맑은 고딕' };
    fill(c, SURF);
    c.border = thin();
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  r++;

  const LV = Analysis.LEVELS;
  res.findings.forEach(function (fd, i) {
    const row = ws.getRow(r);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = LV[fd.lv].t + '\n' + fd.cat;
    row.getCell(3).value = fd.t;
    row.getCell(4).value = '[고객 안내]\n' + fd.ment + '\n\n[제안 근거]\n· ' + fd.basis.join('\n· ') +
      (fd.prep && fd.prep.length ? '\n\n[지참 자료] ' + fd.prep.join(' / ') : '');
    for (let c = 1; c <= 4; c++) {
      const cell = row.getCell(c);
      cell.border = thin();
      cell.font = { size: 10, name: '맑은 고딕' };
      cell.alignment = { vertical: 'top', wrapText: true, indent: 1, horizontal: c === 1 ? 'center' : 'left' };
    }
    if (fd.lv === 'm') fill(row.getCell(2), 'FFE9F5EE');
    else if (fd.lv === 'a') fill(row.getCell(2), 'FFFDECEA');
    else if (fd.lv === 'b') fill(row.getCell(2), 'FFFDF3E6');
    else fill(row.getCell(2), 'FFEEF4FA');
    row.getCell(3).font = { size: 10.5, bold: true, name: '맑은 고딕' };
    row.height = Math.min(190, 26 + fd.basis.length * 13 + Math.ceil(fd.ment.length / 42) * 13);
    r++;
  });
  r += 1;

  r = sectionRow(ws, r, '확인이 안 된 항목', '방문 전에 채워야 할 빈칸입니다.');
  if (res.blanks.length) {
    res.blanks.forEach(function (b, i) {
      const row = ws.getRow(r);
      row.getCell(1).value = i + 1;
      ws.mergeCells(r, 2, r, 4);
      row.getCell(2).value = b;
      [1, 2].forEach(function (c) {
        row.getCell(c).border = thin();
        row.getCell(c).font = { size: 10.5, name: '맑은 고딕' };
        row.getCell(c).alignment = { vertical: 'middle', indent: 1, horizontal: c === 1 ? 'center' : 'left' };
      });
      r++;
    });
  } else {
    ws.mergeCells(r, 1, r, 4);
    ws.getCell(r, 1).value = '모든 항목이 입력되었습니다.';
    r++;
  }
  r += 1;

  r = sectionRow(ws, r, '상담 스크립트');
  const script = Analysis.buildScript(record, res);
  script.split('\n').forEach(function (line) {
    ws.mergeCells(r, 1, r, 4);
    const c = ws.getCell(r, 1);
    c.value = line;
    c.font = { size: 10, name: '맑은 고딕' };
    c.alignment = { vertical: 'middle', indent: 1 };
    r++;
  });
}

/* ---------- 서식 읽기 ---------- */

function cellText(cell) {
  const v = cell ? cell.value : null;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
  }
  if (typeof v === 'object') {
    if (v.text !== undefined) return String(v.text).trim();
    if (v.result !== undefined) return String(v.result).trim();
    if (Array.isArray(v.richText)) return v.richText.map(function (t) { return t.text; }).join('').trim();
    return '';
  }
  return String(v).trim();
}

async function parseWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ms = wb.getWorksheet(SHEET_META);
  if (!ms) {
    throw new Error('이 파일은 프로그램에서 내려받은 서식이 아닙니다. [엑셀 서식 내려받기]로 받은 파일에 입력해 주세요.');
  }

  const rec = { f: {}, claims: [], chk: {} };
  const tables = [];
  const cols = {};

  ms.eachRow(function (row, idx) {
    if (idx === 1) return;
    const type = cellText(row.getCell(1));
    const sheet = cellText(row.getCell(2));
    const ref = cellText(row.getCell(3));
    const key = cellText(row.getCell(4));
    if (type === 'cell') {
      const ws = wb.getWorksheet(sheet);
      if (!ws) return;
      const v = cellText(ws.getCell(ref));
      const fd = FIELD_MAP[key];
      rec.f[key] = (fd && fd.type === 'date' && v) ? (Calc.normDate(v) || v) : v;
    } else if (type === 'table') {
      tables.push({ sheet: sheet, headerRow: parseInt(ref, 10), key: key });
    } else if (type === 'col') {
      (cols[sheet] = cols[sheet] || []).push({ col: ref, key: key });
    } else if (type === 'check') {
      const ws = wb.getWorksheet(sheet);
      if (!ws) return;
      rec.chk[key] = /^o$/i.test(cellText(ws.getCell(ref)));
    } else if (type === 'id') {
      rec.id = Number(key) || undefined;
    }
  });

  tables.forEach(function (t) {
    const ws = wb.getWorksheet(t.sheet);
    if (!ws) return;
    const map = cols[t.sheet] || [];
    for (let r = t.headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const obj = {};
      let any = false;
      map.forEach(function (m) {
        const v = cellText(row.getCell(m.col));
        obj[m.key] = (m.key === 't' && v) ? (Calc.normDate(v) || v) : v;
        if (v) any = true;
      });
      if (any) rec[t.key].push(obj);
    }
  });

  return rec;
}

/* ---------- 누적 관리대장 ---------- */

function buildLedger(records, stats) {
  const wb = new ExcelJS.Workbook();
  wb.creator = '평생든든 고객 정보파악 프로그램';

  const ws = wb.addWorksheet('데이터', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = Schema.LEDGER_COLS.map(function (c) {
    return { header: c.label, key: c.k, width: Math.max(12, Math.min(30, c.label.length * 2 + 6)) };
  });
  const h = ws.getRow(1);
  h.eachCell(function (c) {
    c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' }, name: '맑은 고딕' };
    fill(c, NAVY);
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = thin();
  });
  h.height = 20;

  records.forEach(function (rec) {
    const row = {};
    Schema.LEDGER_COLS.forEach(function (c) {
      if (c.k === '_savedAt') row[c.k] = String(rec.savedAt || '').slice(0, 19).replace('T', ' ');
      else if (c.k === '_money') row[c.k] = rec.money || 0;
      else if (c.k === '_hidCnt') row[c.k] = rec.hidCnt || 0;
      else {
        const fd = FIELD_MAP[c.k];
        const v = rec.f[c.k];
        row[c.k] = (fd && fd.type === 'number' && v) ? Calc.numOf(v) : (v || '');
      }
    });
    const added = ws.addRow(row);
    added.eachCell(function (c) {
      c.font = { size: 10, name: '맑은 고딕' };
      c.border = thin();
      c.alignment = { vertical: 'middle' };
    });
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Schema.LEDGER_COLS.length } };

  /* 통계 시트 */
  const ss = wb.addWorksheet('통계');
  ss.columns = [{ width: 28 }, { width: 22 }, { width: 40 }];
  let r = titleRow(ss, 1, '누적 활동 통계', '데이터 시트를 기준으로 집계했습니다.');
  r += 1;
  const kpis = [
    ['누적 계약 분석 건수', stats.total + ' 건'],
    ['관리 고객 수', stats.customers + ' 명'],
    ['숨은보험금 발견 건수', stats.hidden + ' 건'],
    ['발견 예상액 누계', Calc.won(stats.money) + ' 원'],
    ['업셀링 제안 건수', stats.upsell + ' 건'],
    ['A등급 비율', (stats.total ? Math.round((stats.grades.A || 0) / stats.total * 100) : 0) + ' %'],
    ['건당 평균 발견액', Calc.won(stats.total ? stats.money / stats.total : 0) + ' 원']
  ];
  kpis.forEach(function (k) {
    const row = ss.getRow(r);
    row.getCell(1).value = k[0];
    row.getCell(2).value = k[1];
    row.getCell(1).font = { bold: true, size: 10.5, color: { argb: NAVY }, name: '맑은 고딕' };
    row.getCell(2).font = { size: 11, bold: true, name: '맑은 고딕' };
    fill(row.getCell(1), SURF2);
    [1, 2].forEach(function (c) { row.getCell(c).border = thin(); row.getCell(c).alignment = { vertical: 'middle', indent: 1 }; });
    row.height = 19;
    r++;
  });
  r += 1;

  r = sectionRow(ss, r, '방문결과 등급 분포');
  const GL = { A: 'A (즉시 제안 가능)', B: 'B (추후 재접촉)', C: 'C (유지관리)', '': '등급 미입력' };
  ['A', 'B', 'C', ''].forEach(function (g) {
    const row = ss.getRow(r);
    row.getCell(1).value = GL[g];
    row.getCell(2).value = (stats.grades[g] || 0) + ' 건';
    [1, 2].forEach(function (c) { row.getCell(c).border = thin(); row.getCell(c).font = { size: 10.5, name: '맑은 고딕' }; row.getCell(c).alignment = { vertical: 'middle', indent: 1 }; });
    r++;
  });
  r += 1;

  r = sectionRow(ss, r, '월별 방문 추이');
  Object.keys(stats.months).sort().forEach(function (k) {
    const row = ss.getRow(r);
    row.getCell(1).value = k.replace('-', '년 ') + '월';
    row.getCell(2).value = stats.months[k] + ' 건';
    [1, 2].forEach(function (c) { row.getCell(c).border = thin(); row.getCell(c).font = { size: 10.5, name: '맑은 고딕' }; row.getCell(c).alignment = { vertical: 'middle', indent: 1 }; });
    r++;
  });
  r += 1;

  r = sectionRow(ss, r, '후속조치 관리', '처리기한이 지났거나 임박한 건이 위에 옵니다.');
  const fh = ss.getRow(r);
  ['고객 / 상품', '처리기한 · 차기방문', '후속조치'].forEach(function (t, i) {
    const c = fh.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, size: 10, color: { argb: NAVY }, name: '맑은 고딕' };
    fill(c, SURF);
    c.border = thin();
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  r++;
  stats.follow.forEach(function (x) {
    const row = ss.getRow(r);
    row.getCell(1).value = (x.cust || '-') + ' / ' + (x.prod || '-');
    row.getCell(2).value = (x.deadline ? Calc.ymd(x.deadline) : '-') +
      (x.d !== null && x.d !== undefined ? (x.d < 0 ? ' (' + (-x.d) + '일 경과)' : ' (D-' + x.d + ')') : '') +
      (x.next ? ' · 차기 ' + Calc.ymd(x.next) : '');
    row.getCell(3).value = x.follow || '-';
    [1, 2, 3].forEach(function (c) {
      row.getCell(c).border = thin();
      row.getCell(c).font = { size: 10, name: '맑은 고딕' };
      row.getCell(c).alignment = { vertical: 'middle', indent: 1, wrapText: true };
    });
    r++;
  });

  const note = ss.getRow(r + 1);
  ss.mergeCells(r + 1, 1, r + 1, 3);
  note.getCell(1).value = '※ 고객 개인정보가 담긴 파일입니다. 회사 보안 규정에 따라 보관하시고, 공용 PC에서는 사용 후 삭제해 주세요.';
  note.getCell(1).font = { size: 10, color: { argb: GOLD }, bold: true, name: '맑은 고딕' };

  return wb;
}

module.exports = {
  buildWorkbook: buildWorkbook,
  buildLedger: buildLedger,
  parseWorkbook: parseWorkbook,
  SHEET_INPUT: SHEET_INPUT
};
