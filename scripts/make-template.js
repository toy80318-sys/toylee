#!/usr/bin/env node
/*
 * 엑셀 빈 서식을 파일로 만들어 둡니다. (서버를 켜지 않고도 쓸 수 있습니다)
 *   npm run template
 *   node scripts/make-template.js "D:/AI/교보평생든든/서식.xlsx"
 */
'use strict';

const path = require('path');
const excel = require('../server/excel.js');

const out = process.argv[2] || path.join(process.cwd(), '평생든든_고객정보파악_서식.xlsx');

excel.buildWorkbook(null, { withResult: false }).xlsx.writeFile(out)
  .then(function () {
    console.log('엑셀 서식을 만들었습니다 : ' + out);
    console.log('작성하신 뒤 프로그램 ④ 탭의 [작성한 서식 올리기]로 등록하세요.');
  })
  .catch(function (e) {
    console.error('서식을 만들지 못했습니다 : ' + e.message);
    process.exit(1);
  });
