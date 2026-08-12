/*
 * 브라우저에서 엑셀(.xlsx) 파일을 직접 만드는 작은 모듈입니다.
 * 인터넷 연결이나 외부 라이브러리 없이 동작하도록 직접 만들었습니다.
 * (xlsx 파일은 XML 몇 장을 ZIP 으로 묶은 것이라, 압축 없이 그대로 담아 만듭니다)
 *
 *   KBXlsx.build([{ name:'시트이름', cols:[{w:14}], rows:[[셀,...]], merges:['A1:D1'] }])  → Blob
 *   셀 : 문자열 · 숫자 · {v:값, s:서식번호, n:true(숫자)}
 */
(function (global) {
  'use strict';

  /* ---------- CRC32 ---------- */
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  const enc = new TextEncoder();

  /* ---------- ZIP (압축 없이 담기) ---------- */
  function zip(files) {
    const now = new Date();
    const dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | ((now.getSeconds() / 2) & 31);
    const dosDate = (((now.getFullYear() - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);

    const chunks = [];
    const central = [];
    let offset = 0;

    files.forEach(function (f) {
      const name = enc.encode(f.name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(data);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);              // 필요 버전
      local.setUint16(6, 0x0800, true);          // UTF-8 이름
      local.setUint16(8, 0, true);               // 압축 안 함
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);

      chunks.push(new Uint8Array(local.buffer), name, data);

      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, dosTime, true);
      cen.setUint16(14, dosDate, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, data.length, true);
      cen.setUint32(24, data.length, true);
      cen.setUint16(28, name.length, true);
      cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), name);

      offset += 30 + name.length + data.length;
    });

    let centralSize = 0;
    central.forEach(function (c) { centralSize += c.length; });

    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    return new Blob(chunks.concat(central, [new Uint8Array(end.buffer)]),
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ---------- XML 도우미 ---------- */
  function xmlEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/\x00-\x08|\x0B|\x0C|\x0E-\x1F/g, '');
  }

  function colName(n) {
    let s = '';
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
    return s;
  }

  /*
   * 서식 번호 (셀의 s 값)
   *  0 기본        1 큰제목      2 중제목      3 표머리      4 항목이름
   *  5 입력칸      6 입력칸(숫자) 7 도움말      8 구분칸      9 줄바꿈본문
   * 10 굵게       11 자동칸     12 숫자       13 초록칸     14 빨강칸
   * 15 주황칸     16 파랑칸
   */
  const STYLES_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##"/></numFmts>' +
    '<fonts count="8">' +
    '<font><sz val="11"/><name val="맑은 고딕"/></font>' +
    '<font><b/><sz val="15"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font>' +
    '<font><b/><sz val="11.5"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font>' +
    '<font><b/><sz val="10"/><color rgb="FF0B3A5D"/><name val="맑은 고딕"/></font>' +
    '<font><sz val="10.5"/><name val="맑은 고딕"/></font>' +
    '<font><sz val="9.5"/><color rgb="FF6B7885"/><name val="맑은 고딕"/></font>' +
    '<font><b/><sz val="10.5"/><color rgb="FF0B3A5D"/><name val="맑은 고딕"/></font>' +
    '<font><b/><sz val="11"/><name val="맑은 고딕"/></font>' +
    '</fonts>' +
    '<fills count="11">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF0B3A5D"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF155B8A"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF2F6"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFDF2"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF7F9FB"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE9F5EE"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFDECEA"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFDF3E6"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF4FA"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border>' +
    '<left style="thin"><color rgb="FFD8DFE6"/></left><right style="thin"><color rgb="FFD8DFE6"/></right>' +
    '<top style="thin"><color rgb="FFD8DFE6"/></top><bottom style="thin"><color rgb="FFD8DFE6"/></bottom>' +
    '<diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="17">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>' +
    '<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>' +
    '<xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>' +
    '<xf numFmtId="164" fontId="4" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" indent="1"/></xf>' +
    '<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" indent="1" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="6" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" indent="1" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="7" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="4" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>' +
    '<xf numFmtId="164" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" indent="1"/></xf>' +
    '<xf numFmtId="0" fontId="4" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="4" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="4" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="4" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function sheetXml(sheet) {
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';

    if (sheet.cols && sheet.cols.length) {
      x += '<cols>';
      sheet.cols.forEach(function (c, i) {
        x += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.w || 12) + '" customWidth="1"/>';
      });
      x += '</cols>';
    }

    x += '<sheetData>';
    (sheet.rows || []).forEach(function (row, ri) {
      if (!row) return;
      const r = ri + 1;
      const h = sheet.heights && sheet.heights[ri];
      x += '<row r="' + r + '"' + (h ? ' ht="' + h + '" customHeight="1"' : '') + '>';
      row.forEach(function (cell, ci) {
        if (cell === null || cell === undefined || cell === '') return;
        const ref = colName(ci + 1) + r;
        let v = cell, s = 0, isNum = false;
        if (typeof cell === 'object') {
          v = cell.v; s = cell.s || 0;
          isNum = cell.n === true || (cell.n !== false && typeof v === 'number');
        } else {
          isNum = typeof cell === 'number';
        }
        if (v === null || v === undefined || v === '') {
          if (s) x += '<c r="' + ref + '" s="' + s + '"/>';
          return;
        }
        if (isNum && isFinite(Number(v))) {
          x += '<c r="' + ref + '" s="' + s + '"><v>' + Number(v) + '</v></c>';
        } else {
          x += '<c r="' + ref + '" s="' + s + '" t="inlineStr"><is><t xml:space="preserve">' +
            xmlEsc(v) + '</t></is></c>';
        }
      });
      x += '</row>';
    });
    x += '</sheetData>';

    if (sheet.merges && sheet.merges.length) {
      x += '<mergeCells count="' + sheet.merges.length + '">';
      sheet.merges.forEach(function (m) { x += '<mergeCell ref="' + m + '"/>'; });
      x += '</mergeCells>';
    }
    if (sheet.autoFilter) x += '<autoFilter ref="' + sheet.autoFilter + '"/>';

    x += '</worksheet>';
    return x;
  }

  function build(sheets) {
    const files = [];

    let types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
    sheets.forEach(function (s, i) {
      types += '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
        '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    });
    types += '</Types>';
    files.push({ name: '[Content_Types].xml', data: types });

    files.push({
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>'
    });

    let wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
    let rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    sheets.forEach(function (s, i) {
      wb += '<sheet name="' + xmlEsc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
      rels += '<Relationship Id="rId' + (i + 1) +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(s) });
    });
    wb += '</sheets></workbook>';
    rels += '<Relationship Id="rId' + (sheets.length + 1) +
      '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
    rels += '</Relationships>';

    files.push({ name: 'xl/workbook.xml', data: wb });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: rels });
    files.push({ name: 'xl/styles.xml', data: STYLES_XML });

    return zip(files);
  }

  const KBXlsx = { build: build, colName: colName, zip: zip, crc32: crc32 };

  if (typeof module !== 'undefined' && module.exports) module.exports = KBXlsx;
  else (global.KB = global.KB || {}).Xlsx = KBXlsx;
})(typeof globalThis !== 'undefined' ? globalThis : this);
