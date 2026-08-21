/*
 * 태블릿용(단일 파일) 저장 계층
 *
 * 서버 없이 혼자 도는 판이라, 서버가 하던 일을 이 브라우저 안에서 대신합니다.
 * - 고객 자료는 이 기기 브라우저 저장소(localStorage)에 쌓입니다
 * - 엑셀(.xlsx) 파일은 브라우저에서 직접 만들어 내려받습니다
 * 화면 코드(app.js)는 서버판과 똑같은 것을 그대로 씁니다. 이 파일이 서버 자리를 대신할 뿐입니다.
 */
(function (global) {
  'use strict';

  const Calc = global.KB.Calc, Schema = global.KB.Schema;
  const Analysis = global.KB.Analysis, Xlsx = global.KB.Xlsx;
  const FIELD_MAP = Schema.fieldMap();
  const KEY = 'kyobo_records_v2';

  /* ---------- 저장소 ---------- */

  const STORE = (function () {
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return localStorage; }
    catch (e) { return null; }
  })();

  let MEMORY = [];   // 저장소가 막혀 있을 때 임시로 쓰는 자리

  function loadAll() {
    if (!STORE) return MEMORY;
    try { return JSON.parse(STORE.getItem(KEY) || '[]'); } catch (e) { return []; }
  }

  function saveAll(list) {
    MEMORY = list;
    if (!STORE) return;
    try { STORE.setItem(KEY, JSON.stringify(list)); }
    catch (e) { throw new Error('저장 공간이 가득 찼습니다. 오래된 기록을 지우거나 백업 파일로 옮겨 주세요.'); }
  }

  function cleanValue(field, v) {
    const s = v == null ? '' : String(v).trim();
    if (!s) return '';
    if (field && field.type === 'date') return Calc.normDate(s) || s;
    if (field && field.type === 'number') return String(Calc.numOf(s));
    return s;
  }

  function cleanRows(rowsIn) {
    const src = rowsIn || {};
    const out = {};
    Schema.ROWSETS.forEach(function (set) {
      out[set.key] = Schema.pruneRows(set, src[set.key]).map(function (row) {
        const o = {};
        set.cols.forEach(function (c) { o[c.k] = cleanValue(c, row[c.k]); });
        return o;
      });
    });
    return out;
  }

  function saveRecord(rec) {
    const list = loadAll();
    const f = {};
    Schema.allFields().forEach(function (fd) { f[fd.k] = cleanValue(fd, (rec.f || {})[fd.k]); });
    if (!f.h_cust) throw new Error('고객(계약자) 성명을 입력해 주세요.');

    const rows = cleanRows(rec.rows || (rec.claims ? { claims: rec.claims } : {}));
    const res = Analysis.analyze({ f: f, rows: rows });
    const now = new Date().toISOString();

    let saved;
    const idx = rec.id ? list.findIndex(function (x) { return x.id === rec.id; }) : -1;
    if (idx >= 0) {
      saved = list[idx];
      saved.f = f; saved.chk = rec.chk || {}; saved.rows = rows;
      saved.money = res.money; saved.hidCnt = res.hidCnt; saved.savedAt = now;
    } else {
      const maxId = list.reduce(function (m, x) { return Math.max(m, Number(x.id) || 0); }, 0);
      saved = {
        id: maxId + 1, f: f, chk: rec.chk || {}, rows: rows,
        money: res.money, hidCnt: res.hidCnt, savedAt: now, createdAt: now
      };
      list.push(saved);
    }
    saveAll(list);
    return { id: saved.id, record: saved, analysis: res };
  }

  function listRecords(q) {
    q = String(q || '').trim();
    return loadAll()
      .filter(function (r) {
        return !q || String(r.f.h_cust || '').indexOf(q) >= 0 ||
          String(Schema.ledgerValue(r, '_prod') || '').indexOf(q) >= 0;
      })
      .sort(function (a, b) { return String(b.savedAt || '').localeCompare(String(a.savedAt || '')); });
  }

  function stats() {
    const list = loadAll();
    const custs = {};
    list.forEach(function (r) { custs[r.f.h_cust || '-'] = 1; });
    const grades = { A: 0, B: 0, C: 0, '': 0 };
    list.forEach(function (r) { const g = r.f.m_grade || ''; grades[g] = (grades[g] || 0) + 1; });

    const follow = [];
    list.forEach(function (r) {
      const due = Schema.ledgerValue(r, '_due');
      const what = Schema.ledgerValue(r, '_follow');
      if (!due && !what && !r.f.m_next) return;
      follow.push({
        id: r.id, cust: r.f.h_cust, prod: Schema.ledgerValue(r, '_prod'), follow: what,
        deadline: due, next: r.f.m_next, d: Calc.dday(due || r.f.m_next)
      });
    });
    follow.sort(function (a, b) { return (a.d == null ? 9999 : a.d) - (b.d == null ? 9999 : b.d); });

    const months = {};
    list.forEach(function (r) {
      const d = r.f.m_vdate || r.f.h_adate || r.savedAt || '';
      const k = String(d).slice(0, 7);
      if (k) months[k] = (months[k] || 0) + 1;
    });

    return {
      total: list.length,
      customers: Object.keys(custs).length,
      money: list.reduce(function (s, r) { return s + (r.money || 0); }, 0),
      hidden: list.filter(function (r) { return (r.money || 0) > 0; }).length,
      contracts: list.reduce(function (s, r) { return s + Schema.rowsOf(r, 'contracts').length; }, 0),
      grades: grades, follow: follow, months: months
    };
  }

  /* ---------- 서버 대신 응답하기 ---------- */

  global.__LOCAL_API = function (url, opts) {
    opts = opts || {};
    const method = (opts.method || 'GET').toUpperCase();
    const qs = url.indexOf('?') >= 0 ? url.slice(url.indexOf('?') + 1) : '';
    const path = url.split('?')[0];
    const param = function (k) {
      const m = new RegExp('(^|&)' + k + '=([^&]*)').exec(qs);
      return m ? decodeURIComponent(m[2].replace(/\+/g, ' ')) : '';
    };
    const idOf = function (prefix) { return Number(path.slice(prefix.length)); };

    return new Promise(function (resolve, reject) {
      try {
        if (path === '/api/contracts' && method === 'GET') return resolve(listRecords(param('q')));
        if (path === '/api/contracts' && method === 'POST') {
          const out = saveRecord(opts.body || {});
          return resolve({ id: out.id, record: out.record, analysis: out.analysis });
        }
        if (path.indexOf('/api/contracts/') === 0 && method === 'GET') {
          const r = loadAll().find(function (x) { return x.id === idOf('/api/contracts/'); });
          if (!r) throw new Error('계약을 찾을 수 없습니다.');
          return resolve(r);
        }
        if (path.indexOf('/api/contracts/') === 0 && method === 'DELETE') {
          const id = idOf('/api/contracts/');
          const list = loadAll().filter(function (x) { return x.id !== id; });
          saveAll(list);
          return resolve({ deleted: 1 });
        }
        if (path === '/api/stats') return resolve(stats());
        if (path === '/api/wipe') { saveAll([]); return resolve({ ok: true }); }
        if (path === '/api/restore') {
          const body = opts.body || {};
          const recs = body.records || body;
          if (!Array.isArray(recs)) throw new Error('백업 파일 형식이 아닙니다.');
          let added = 0, failed = 0;
          recs.forEach(function (r) {
            try {
              if (!r || !r.f || !String(r.f.h_cust || '').trim()) { failed++; return; }
              saveRecord({ f: r.f, rows: r.rows || (r.claims ? { claims: r.claims } : {}), chk: r.chk || {} });
              added++;
            } catch (e) { failed++; }
          });
          return resolve({ added: added, failed: failed, total: loadAll().length });
        }
        throw new Error('이 기능은 태블릿용에서는 쓸 수 없습니다.');
      } catch (e) { reject(e); }
    });
  };

  /* ---------- 엑셀 만들기 ---------- */

  const S = { title: 1, sec: 2, head: 3, label: 4, val: 5, valNum: 6, hint: 7, group: 8, wrap: 9, bold: 10, auto: 11, num: 12 };
  const LV_STYLE = { m: 13, a: 14, b: 15, i: 16 };

  const COL = 'ABCDEFGHIJKLMN';

  function titleRows(rows, merges, text, sub, width) {
    const r = rows.length;
    const w = Math.max(2, width || 4);
    const last = COL[w - 1];
    const line = [];
    for (let i = 0; i < w; i++) line.push({ v: i === 0 ? text : '', s: S.title });
    rows.push(line);
    merges.push('A' + (r + 1) + ':' + last + (r + 1));
    if (sub) {
      rows.push([{ v: sub, s: 0 }]);
      merges.push('A' + (r + 2) + ':' + last + (r + 2));
    }
  }

  function sectionRow(rows, merges, text) {
    const r = rows.length;
    rows.push([{ v: text, s: S.sec }, { v: '', s: S.sec }, { v: '', s: S.sec }, { v: '', s: S.sec }]);
    merges.push('A' + (r + 1) + ':D' + (r + 1));
  }

  function inputSheets(rec) {
    const f = (rec && rec.f) || {}, rowsIn = (rec && rec.rows) || {}, chk = (rec && rec.chk) || {};
    const sheets = [];

    /* 계약입력 */
    const rows = [], merges = [], heights = [];
    titleRows(rows, merges, '교보생명 평생든든서비스 — 고객 정보파악 서식',
      '노란 칸이 입력값입니다. 회색 칸은 자동 계산 항목입니다.');
    heights[0] = 26;
    rows.push([]);

    Schema.SECTIONS.forEach(function (sec) {
      sectionRow(rows, merges, (sec.no ? sec.no + '. ' : '') + sec.title + (sec.desc ? '   —   ' + sec.desc : ''));
      rows.push([{ v: '구분', s: S.head }, { v: '항목', s: S.head }, { v: '입력값', s: S.head }, { v: '사전 자료준비 · 참고', s: S.head }]);
      let lastGroup = null;
      sec.fields.forEach(function (fd) {
        const g = (fd.group && fd.group !== lastGroup) ? fd.group : '';
        lastGroup = fd.group || lastGroup;
        const raw = f[fd.k];
        const has = raw !== undefined && raw !== null && String(raw).trim() !== '';
        let cell;
        if (fd.type === 'number') cell = { v: has ? Calc.numOf(raw) : '', s: fd.auto ? S.auto : S.valNum, n: true };
        else cell = { v: has ? (fd.type === 'date' ? (Calc.normDate(raw) || String(raw)) : String(raw)) : '', s: fd.auto ? S.auto : S.val, n: false };

        const hints = [];
        if (fd.hint) hints.push(fd.hint);
        if (fd.ph) hints.push('예: ' + fd.ph);
        if (fd.auto) hints.push('자동 계산 항목');
        if (fd.type === 'select' && fd.options) hints.push(fd.options.join(' / '));

        rows.push([
          { v: g, s: S.group },
          { v: fd.label + (fd.unit ? ' (' + fd.unit + ')' : '') + (fd.required ? ' *' : ''), s: S.label },
          cell,
          { v: hints.join(' · '), s: S.hint }
        ]);
      });
      rows.push([]);
    });
    sheets.push({ name: '계약입력', cols: [{ w: 14 }, { w: 34 }, { w: 28 }, { w: 34 }], rows: rows, merges: merges, heights: heights });

    /* 여러 줄 표 (가입건수 · 사고보험금 · 상담내용 …) */
    Schema.ROWSETS.forEach(function (set) {
      const list = Schema.pruneRows(set, rowsIn[set.key]);
      const trows = [], tmerges = [];
      titleRows(trows, tmerges, set.label, set.sub || '', set.cols.length + 1);
      trows.push([]);
      trows.push([{ v: 'No', s: S.head }].concat(set.cols.map(function (c) {
        return { v: c.label + (c.unit ? '(' + c.unit + ')' : ''), s: S.head };
      })));
      const n = Math.max((set.rows || 3) + 4, list.length + 3);
      for (let i = 0; i < n; i++) {
        const v = list[i];
        trows.push([{ v: i + 1, s: S.label, n: true }].concat(set.cols.map(function (c) {
          const raw = v ? v[c.k] : '';
          const has = raw !== undefined && raw !== null && String(raw).trim() !== '';
          if (c.type === 'number') return { v: has ? Calc.numOf(raw) : '', s: S.valNum, n: true };
          if (c.type === 'date') return { v: has ? (Calc.normDate(raw) || String(raw)) : '', s: S.val };
          return { v: has ? String(raw) : '', s: S.val };
        })));
      }
      sheets.push({
        name: set.sheet,
        cols: [{ w: 6 }].concat(set.cols.map(function (c) { return { w: c.w || 18 }; })),
        rows: trows, merges: tmerges
      });
    });

    /* 준비물 · 추가점검 */
    const krows = [], kmerges = [];
    titleRows(krows, kmerges, '방문 전 준비물 · 추가 점검사항', '분석을 실행하면 필요한 항목이 자동으로 체크됩니다.');
    krows.push([]);
    [['준비물', Schema.PREPS], ['추가 점검사항', Schema.EXTRAS]].forEach(function (pair) {
      sectionRow(krows, kmerges, pair[0]);
      krows.push([{ v: '구분', s: S.head }, { v: '항목', s: S.head }, { v: '체크', s: S.head }]);
      pair[1].forEach(function (item) {
        krows.push([
          { v: item.id, s: S.label },
          { v: item.t, s: S.label },
          { v: chk[item.id] ? 'O' : '', s: S.val }
        ]);
      });
      krows.push([]);
    });
    sheets.push({ name: '준비물체크', cols: [{ w: 12 }, { w: 52 }, { w: 12 }], rows: krows, merges: kmerges });

    return sheets;
  }

  function resultSheet(rec) {
    const res = Analysis.analyze(rec);
    const rows = [], merges = [], heights = [];
    titleRows(rows, merges, '진단 결과 — ' + res.cust + ' 님',
      '판정 기준은 회사 양식을 옮긴 것입니다. 실제 지급 여부와 금액은 약관·회사 시스템에서 최종 확인하세요.');
    heights[0] = 26;
    rows.push([]);

    sectionRow(rows, merges, '요약');
    const cnt = function (k) { return res.findings.filter(function (x) { return x.lv === k; }).length; };
    [
      ['숨은보험금 · 환급 건', cnt('m') + ' 건'],
      ['즉시 조치 항목', cnt('a') + ' 건'],
      ['보완 · 제안 항목', cnt('b') + ' 건'],
      ['발견 예상액', Calc.won(res.money) + ' 원' + (res.moneyUnknown ? ' (금액확인 필요 ' + res.moneyUnknown + '건 별도)' : '')],
      ['추천 방문결과 등급', res.grade]
    ].forEach(function (k) {
      const r = rows.length;
      rows.push([{ v: '', s: 0 }, { v: k[0], s: S.group }, { v: '', s: S.group }, { v: k[1], s: S.label }]);
      merges.push('B' + (r + 1) + ':C' + (r + 1));
    });
    rows.push([]);

    sectionRow(rows, merges, '발견 항목 · 고객 안내 멘트 · 제안 근거   —   급한 순서');
    rows.push([{ v: '순위', s: S.head }, { v: '구분', s: S.head }, { v: '항목', s: S.head }, { v: '고객 안내 멘트 / 제안 근거', s: S.head }]);
    res.findings.forEach(function (fd, i) {
      heights[rows.length] = Math.min(190, 26 + fd.basis.length * 13 + Math.ceil(fd.ment.length / 42) * 13);
      rows.push([
        { v: i + 1, s: S.label, n: true },
        { v: Analysis.LEVELS[fd.lv].t + '\n' + fd.cat, s: LV_STYLE[fd.lv] },
        { v: fd.t, s: S.wrap },
        {
          v: '[고객 안내]\n' + fd.ment + '\n\n[제안 근거]\n· ' + fd.basis.join('\n· ') +
            (fd.prep && fd.prep.length ? '\n\n[지참 자료] ' + fd.prep.join(' / ') : ''),
          s: S.wrap
        }
      ]);
    });
    rows.push([]);

    sectionRow(rows, merges, '확인이 안 된 항목   —   방문 전에 채워야 할 빈칸');
    if (res.blanks.length) {
      res.blanks.forEach(function (b, i) {
        const r = rows.length;
        rows.push([{ v: i + 1, s: S.label, n: true }, { v: b, s: S.label }, { v: '', s: S.label }, { v: '', s: S.label }]);
        merges.push('B' + (r + 1) + ':D' + (r + 1));
      });
    } else {
      rows.push([{ v: '모든 항목이 입력되었습니다.', s: S.label }]);
    }
    rows.push([]);

    sectionRow(rows, merges, '상담 스크립트');
    Analysis.buildScript(rec, res).split('\n').forEach(function (line) {
      const r = rows.length;
      rows.push([{ v: line, s: 0 }]);
      merges.push('A' + (r + 1) + ':D' + (r + 1));
    });

    return { name: '진단결과', cols: [{ w: 6 }, { w: 22 }, { w: 46 }, { w: 62 }], rows: rows, merges: merges, heights: heights };
  }

  function ledgerSheets() {
    const list = listRecords('');
    const st = stats();

    const rows = [];
    rows.push(Schema.LEDGER_COLS.map(function (c) { return { v: c.label, s: S.head }; }));
    list.forEach(function (rec) {
      rows.push(Schema.LEDGER_COLS.map(function (c) {
        const v = Schema.ledgerValue(rec, c.k);
        const fd = FIELD_MAP[c.k];
        if (typeof v === 'number') return { v: v, s: S.num, n: true };
        if (fd && fd.type === 'number' && v) return { v: Calc.numOf(v), s: S.num, n: true };
        return { v: v || '', s: S.label };
      }));
    });
    const data = {
      name: '데이터',
      cols: Schema.LEDGER_COLS.map(function (c) { return { w: Math.max(12, Math.min(30, c.label.length * 2 + 6)) }; }),
      rows: rows,
      autoFilter: 'A1:' + Xlsx.colName(Schema.LEDGER_COLS.length) + '1'
    };

    const srows = [], smerges = [];
    titleRows(srows, smerges, '누적 활동 통계', '데이터 시트를 기준으로 집계했습니다.');
    srows.push([]);
    [
      ['누적 방문기록 수', st.total + ' 건'],
      ['관리 고객 수', st.customers + ' 명'],
      ['숨은보험금 발견 건수', st.hidden + ' 건'],
      ['발견 예상액 누계', Calc.won(st.money) + ' 원'],
      ['관리 계약 건수', st.contracts + ' 건'],
      ['A등급 비율', (st.total ? Math.round((st.grades.A || 0) / st.total * 100) : 0) + ' %'],
      ['건당 평균 발견액', Calc.won(st.total ? st.money / st.total : 0) + ' 원']
    ].forEach(function (k) { srows.push([{ v: k[0], s: S.group }, { v: k[1], s: S.label }]); });
    srows.push([]);

    sectionRow(srows, smerges, '방문결과 등급 분포');
    const GL = { A: 'A (즉시 제안 가능)', B: 'B (추후 재접촉)', C: 'C (유지관리)', '': '등급 미입력' };
    ['A', 'B', 'C', ''].forEach(function (g) {
      srows.push([{ v: GL[g], s: S.label }, { v: (st.grades[g] || 0) + ' 건', s: S.label }]);
    });
    srows.push([]);

    sectionRow(srows, smerges, '월별 방문 추이');
    Object.keys(st.months).sort().forEach(function (k) {
      srows.push([{ v: k.replace('-', '년 ') + '월', s: S.label }, { v: st.months[k] + ' 건', s: S.label }]);
    });
    srows.push([]);

    sectionRow(srows, smerges, '후속조치 관리');
    srows.push([{ v: '고객 / 상품', s: S.head }, { v: '처리기한 · 차기방문', s: S.head }, { v: '후속조치', s: S.head }]);
    st.follow.forEach(function (x) {
      srows.push([
        { v: (x.cust || '-') + ' / ' + (x.prod || '-'), s: S.label },
        {
          v: (x.deadline ? Calc.ymd(x.deadline) : '-') +
            (x.d != null ? (x.d < 0 ? ' (' + (-x.d) + '일 경과)' : ' (D-' + x.d + ')') : '') +
            (x.next ? ' · 차기 ' + Calc.ymd(x.next) : ''), s: S.label
        },
        { v: x.follow || '-', s: S.wrap }
      ]);
    });
    srows.push([]);
    srows.push([{ v: '※ 고객 개인정보가 담긴 파일입니다. 회사 보안 규정에 따라 보관해 주세요.', s: S.bold }]);

    return [data, { name: '통계', cols: [{ w: 30 }, { w: 26 }, { w: 40 }], rows: srows, merges: smerges }];
  }

  /* ---------- 내려받기 ---------- */

  function stamp() {
    const d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }

  /*
   * 내려받을 파일 이름은 영문·숫자로 만듭니다.
   * 일부 브라우저(특히 파일을 직접 열었을 때)는 이름에 한글이 있으면
   * 이름 전체를 버려서 확장자까지 사라지고, 그러면 엑셀이 열리지 않습니다.
   */
  function saveBlob(blob, filename, 안내) {
    if (global.claude && global.claude.downloads && global.claude.downloads.save) {
      global.claude.downloads.save({ filename: filename, data: blob })
        .catch(function (e) { alert('파일을 저장하지 못했습니다 : ' + (e && e.message ? e.message : e)); });
      return;
    }
    const a = document.createElement('a');
    const u = URL.createObjectURL(blob);
    a.href = u; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
    if (안내 && typeof global.toast === 'function') global.toast(안내 + ' — ' + filename);
  }

  function csvText() {
    const esc = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"'; };
    let csv = '﻿' + Schema.LEDGER_COLS.map(function (c) { return c.label; }).join(',') + '\n';
    listRecords('').forEach(function (rec) {
      csv += Schema.LEDGER_COLS.map(function (c) {
        const v = Schema.ledgerValue(rec, c.k);
        const fd = FIELD_MAP[c.k];
        if (typeof v === 'number') return v;
        if (fd && fd.type === 'number' && v) return Calc.numOf(v);
        return esc(v);
      }).join(',') + '\n';
    });
    return csv;
  }

  global.__LOCAL_DOWNLOAD = function (path) {
    try {
      if (path === '/api/backup') {
        const body = JSON.stringify({ ver: 2, exportedAt: new Date().toISOString(), records: loadAll() }, null, 2);
        return saveBlob(new Blob([body], { type: 'application/json' }),
          'Kyobo-Backup-' + stamp() + '.json', '백업 파일을 저장했습니다');
      }
      if (path === '/api/csv') {
        return saveBlob(new Blob([csvText()], { type: 'text/csv;charset=utf-8' }),
          'Kyobo-Ledger-' + stamp() + '.csv', 'CSV 파일을 저장했습니다');
      }
      if (path === '/api/excel/template') {
        return saveBlob(Xlsx.build(inputSheets(null)),
          'Kyobo-Form-Blank.xlsx', '빈 서식을 저장했습니다');
      }
      if (path === '/api/excel/ledger') {
        if (!loadAll().length) { alert('저장된 자료가 없습니다.'); return; }
        return saveBlob(Xlsx.build(ledgerSheets()),
          'Kyobo-Ledger-' + stamp() + '.xlsx', '누적 관리대장을 저장했습니다');
      }
      if (path.indexOf('/api/excel/contract/') === 0) {
        const id = Number(path.slice('/api/excel/contract/'.length));
        const rec = loadAll().find(function (x) { return x.id === id; });
        if (!rec) { alert('계약을 찾을 수 없습니다.'); return; }
        return saveBlob(Xlsx.build(inputSheets(rec).concat([resultSheet(rec)])),
          'Kyobo-Contract-' + id + '-' + stamp() + '.xlsx',
          (rec.f.h_cust || '') + ' 님 계약 파일을 저장했습니다');
      }
      alert('이 기능은 태블릿용에서는 쓸 수 없습니다.');
    } catch (e) {
      alert('파일을 만들지 못했습니다 : ' + (e && e.message ? e.message : e));
    }
  };

  /* ---------- 태블릿용 화면 손질 ---------- */

  /* 저장이 막힌 상태인지 화면 코드에서도 알 수 있게 알려둔다 */
  global.__LOCAL_STORAGE_OK = !!STORE;

  global.__LOCAL_READY = function () {
    const hide = document.getElementById('btnImportPick');
    if (hide) hide.style.display = 'none';
    const xf = document.getElementById('xf');
    if (xf) xf.style.display = 'none';

    const hint = document.querySelector('#p4 .card .hint');
    if (hint) {
      hint.innerHTML = '컴퓨터가 없는 자리에서도 태블릿에서 바로 입력하시고, ' +
        '<b>[누적 관리대장 내려받기]</b>로 엑셀 파일을 만들어 매니저님께 제출하시면 됩니다. ' +
        '각 계약의 <b>[엑셀]</b> 단추를 누르면 그 고객의 진단 결과와 상담 스크립트까지 담긴 파일이 만들어집니다.';
    }

    const warn = document.querySelector('#p4 .warn');
    if (warn) {
      warn.innerHTML = '<b>보관 안내</b> · 이 판(태블릿용)은 고객 자료가 <b>이 기기의 브라우저 안에</b> 쌓입니다. ' +
        '인터넷으로 나가지 않아 안전하지만, <b>브라우저 기록·저장 공간을 지우면 함께 사라집니다.</b> ' +
        '반드시 <b>주 1회 [전체 백업 파일 저장]</b>을 눌러 파일로 남겨 두세요. ' +
        '그 파일만 있으면 [백업 파일 복원]으로 언제든 되살릴 수 있습니다.';
    }

    const sub = document.querySelector('#p4 h2 .gsub');
    if (sub) sub.textContent = '— 이 기기에 저장';

    if (!STORE) {
      const el = document.getElementById('netWarn');
      if (el) {
        el.style.display = 'block';
        el.innerHTML = '<b>주의 — 지금은 자동 저장이 되지 않는 상태입니다. 입력하신 내용이 남지 않습니다.</b><br>' +
          '메신저·메일·다운로드 알림에서 <b>바로 열면</b> 브라우저가 "임시 미리보기"로 보고 저장을 막습니다. ' +
          '아래처럼 다시 열어 주세요.<br>' +
          '<b>① 파일을 태블릿에 저장</b> → <b>② [내 파일] 앱에서 그 파일을 누르기</b> → ' +
          '<b>③ Chrome 또는 삼성 인터넷으로 열기</b><br>' +
          '그렇게 여시면 이 문구가 사라지고 자동 저장이 됩니다. ' +
          '그래도 이 문구가 계속 보이면 알려주세요 — 인터넷 주소로 여는 방식으로 바꿔 드리겠습니다.';
      }
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
