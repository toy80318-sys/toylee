/*
 * 계약자 관리 — 상품제안서 사진 판독
 *
 * 대화창을 거치지 않고, 프로그램 안에서 제안서 사진(또는 PDF)을 바로 읽어
 * 「설계 코드」로 만들어 줍니다. Claude API 를 씁니다.
 *
 *   · 인터넷 연결과 Claude API 키가 있어야 합니다
 *   · 키는 이 기기 브라우저(localStorage)에만 저장되고,
 *     api.anthropic.com 말고는 어디에도 보내지 않습니다
 *   · 사진은 보내는 그 요청에만 쓰이고 저장되지 않습니다
 *
 * 키가 없거나 인터넷이 없으면 기존 [설계 코드 붙여넣기] 를 그대로 쓰시면 됩니다.
 */
(function (global) {
  'use strict';

  const MODEL = 'claude-opus-5';

  /* 사진 규격 — Claude Opus 5 는 고해상도 등급이라 긴 변 2576px 까지 그대로 봅니다.
     그보다 크면 어차피 줄어들고 돈만 더 드므로 보내기 전에 맞춰 줍니다.
     한 번에 20장을 넘기면 장당 크기 제한이 2000px 로 빡빡해지므로 20장으로 끊습니다. */
  const MAX_EDGE = 2576;
  const MAX_PAGES = 20;
  const JPEG_Q = 0.92;                  /* 글씨가 뭉개지지 않을 만큼만 압축합니다 */
  const MAX_PDF_MB = 20;                /* 요청 전체가 32MB 를 넘으면 안 됩니다 */
  const TOKENS_PER_PAGE = 4784;         /* 고해상도 한 장의 최대 시각 토큰 */
  const USD_IN = 5 / 1e6, USD_OUT = 25 / 1e6;

  /* ---------- 설계 코드의 모양 ----------
   * 값은 모두 글자로 받습니다. 숫자로 받으면 「모르는 값」과 「0원」을 구분할 수 없는데,
   * 1년차 해약환급금 0원은 꼭 0으로 남아야 하는 값이라 그렇습니다.
   * (importer.js 가 글자를 숫자로 바꿔 줍니다)
   */
  const S = function (props, req) {
    return { type: 'object', additionalProperties: false, properties: props, required: req || Object.keys(props) };
  };
  const T = { type: 'string' };
  const ARR = function (items) { return { type: 'array', items: items }; };

  const 보장 = ARR(S({ 급부: T, 금액: T, 지급사유: T, 단위: T }));
  const 감액 = S({ 기간일: T, 비율: T });

  const SCHEMA = S({
    형식: T,
    고객: S({ 성명: T, 생년월일: T, 성별: T, 전화번호: T }),
    FP: T,
    계약: ARR(S({
      보험명: T, 피보험자: T, 계약일: T, 가입금액: T, 보험료: T,
      납입기간: T, 보험기간: T, 비고: T,
      주계약: S({ 이름: T, 면책일: T, 감액: 감액, 보장한도: T, 설명: T, 참고: T, 보장: 보장 }),
      특약: ARR(S({
        특약명: T, 가입금액: T, 보험료: T, 납입기간: T, 보험기간: T, 갱신종료나이: T,
        면책일: T, 감액: 감액, 보장한도: T, 설명: T, 참고: T, 보장: 보장
      })),
      환급금표: ARR(S({
        경과: T, 나이: T, 납입보험료: T, 해약환급금: T, 환급률: T, 사망시지급액: T, 구분: T
      }))
    }))
  });

  /* ---------- 판독 지시문 ---------- */

  const SYSTEM = [
    '당신은 교보생명 FP를 돕는 보험 상품제안서 판독기입니다.',
    '사진에 보이는 상품제안서(가입설계서)를 읽어, 정해진 형식의 설계 코드로 옮깁니다.',
    '',
    '가장 중요한 원칙 : **보이는 대로만 옮기고, 보이지 않는 것은 지어내지 않습니다.**',
    '읽을 수 없거나 그 페이지에 없는 값은 빈 글자("")로 두세요.',
    '이 자료는 FP가 고객에게 보험금과 해약환급금을 안내하는 데 쓰이므로,',
    '추측한 숫자가 하나라도 섞이면 잘못된 안내가 되어 고객에게 손해가 갑니다.',
    '',
    '── 제안서에서 찾을 곳 ──',
    '· 표지 : 상품명 · 피보험자 · 가입금액 · 납입기간 · 합계보험료',
    '· 「기본 계약정보」 : 계약자 · 주피보험자(나이/성별) · 나이 변경일 ·',
    '  「계약사항」 표(구분 / 가입금액 / 납입·보험기간 / 보험료) — 여기가 가장 정확합니다',
    '· 「보장 내용」 : 주계약과 특약별로 (구분 / 보장금액 / 보험료 / 지급사유)',
    '· 「주계약 사망시 지급액(계약자적립액) 및 해약환급금 예시표」 : 경과기간별 표',
    '· 면책기간 · 감액은 표 아래 ※ 주석에 있습니다',
    '  (예 「보장개시일은 계약일부터 90일이 되는 날의 다음날」 → 면책일 90)',
    '  (예 「계약일부터 1년 미만에 진단확정되면 50% 감액 지급」 → 감액 기간일 365, 비율 0.5)',
    '',
    '── 값을 적는 법 ──',
    '· 가입금액 : **만원 단위 숫자만** (제안서 "10,000만원" → "10000", "5,000만원" → "5000")',
    '· 보험료 · 보장금액 · 환급금 : **원 단위 숫자만** (제안서 "100,000,000원" → "100000000")',
    '· 환급률 : 숫자만 ("31.5%" → "31.5")',
    '· 날짜 : YYYY-MM-DD',
    '· 경과 : 제안서에 적힌 글자 그대로 ("3개월", "1년", "47년")',
    '· 면책일 : 날 수 ("90"). 면책이 없으면 "0"',
    '· 감액 : 기간일은 날 수("365"), 비율은 소수("0.5"). 감액이 없으면 기간일 "0"',
    '· 갱신종료나이 : 「5년(최대100세)/5년갱신」 이면 보험기간 "5년만기", 납입기간 "5년납", 갱신종료나이 "100"',
    '',
    '── 해약환급금 예시표 (가장 조심할 곳) ──',
    '· 표에 「주계약＋특약」과 「주계약」 두 묶음이 있으면 **반드시 「주계약＋특약」** 쪽 값을 씁니다',
    '· **해약환급금이 0원인 줄도 반드시 "0" 으로 적습니다.** 비워 두면 안 됩니다 —',
    '  초기에 환급금이 없다는 것은 고객께 꼭 알려야 하는 사실입니다',
    '· 보이는 줄은 **한 줄도 빠뜨리지 말고 전부** 옮깁니다 (3개월부터 마지막 줄까지)',
    '· 표가 두 페이지에 걸쳐 있으면 이어 붙여 한 표로 만듭니다',
    '· 납입이 끝나는 줄에는 구분 "납입완료", 만기 줄에는 "만기" 를 적습니다',
    '  (환급률이 갑자기 크게 오르는 줄이 대개 납입완료 시점입니다)',
    '',
    '── 설명 · 참고 ──',
    '· 설명 : 고객께 그대로 읽어 드릴 쉬운 말 한두 문장. 전문용어를 풀어서 씁니다',
    '· 참고 : 보장개시일 · 감액 · 갱신 · 납입면제처럼 FP가 챙겨야 할 조건을 제안서 문구대로',
    '· 지급사유 : 그 급부가 언제 나오는지, 제안서에 적힌 대로',
    '',
    '사진이 뒤집혀 있거나 기울어져 있어도 글자를 읽어 내세요.',
    '여러 장이 한 제안서면 하나의 계약으로 합칩니다. 서로 다른 상품이면 계약을 나눕니다.',
    '형식 항목에는 "교보FP-설계v1" 을 넣습니다.'
  ].join('\n');

  const USER_TEXT = [
    '위 사진들은 하나의 교보생명 상품제안서입니다.',
    '읽어서 설계 코드로 옮겨 주세요.',
    '',
    '특히 해약환급금 예시표는 보이는 줄을 하나도 빠뜨리지 말고,',
    '「주계약＋특약」 쪽 금액으로, 0원인 줄도 0으로 적어 주세요.',
    '읽히지 않는 값은 지어내지 말고 비워 두세요.'
  ].join('\n');

  /* ---------- 사진 다듬기 ---------- */

  function readAsDataURL(file) {
    return new Promise(function (ok, no) {
      const r = new FileReader();
      r.onload = function () { ok(r.result); };
      r.onerror = function () { no(new Error(file.name + ' 을(를) 읽지 못했습니다.')); };
      r.readAsDataURL(file);
    });
  }

  function loadImage(url) {
    return new Promise(function (ok, no) {
      const im = new Image();
      im.onload = function () { ok(im); };
      im.onerror = function () { no(new Error('사진을 여는 데 실패했습니다. jpg · png 파일인지 확인해 주세요.')); };
      im.src = url;
    });
  }

  /*
   * 긴 변을 MAX_EDGE 에 맞추고, 필요하면 돌려서 JPEG 로 만듭니다.
   *   deg : 0 · 90 · 180 · 270 (스캔본이 뒤집혀 오는 일이 잦습니다)
   */
  function prepImage(img, deg) {
    const turned = (deg === 90 || deg === 270);
    const w0 = turned ? img.naturalHeight : img.naturalWidth;
    const h0 = turned ? img.naturalWidth : img.naturalHeight;
    const scale = Math.min(1, MAX_EDGE / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#fff';
    cx.fillRect(0, 0, w, h);
    cx.imageSmoothingQuality = 'high';
    cx.translate(w / 2, h / 2);
    cx.rotate(deg * Math.PI / 180);
    const dw = (turned ? h : w), dh = (turned ? w : h);
    cx.drawImage(img, -dw / 2, -dh / 2, dw, dh);

    const url = cv.toDataURL('image/jpeg', JPEG_Q);
    return { data: url.slice(url.indexOf(',') + 1), media: 'image/jpeg', w: w, h: h };
  }

  /* 한 장이 몇 개의 시각 토큰인지 — 28×28 조각 하나가 토큰 하나입니다 */
  function pageTokens(w, h) {
    return Math.min(TOKENS_PER_PAGE, Math.ceil(w / 28) * Math.ceil(h / 28));
  }

  /* 보내기 전에 대략 얼마가 드는지 */
  function estimate(pages) {
    const inTok = pages.reduce(function (s, p) {
      return s + (p.kind === 'pdf' ? 3000 : pageTokens(p.w, p.h));
    }, 0) + 1500;
    const outTok = 9000;                        /* 환급금표가 길면 이 정도까지 갑니다 */
    const usd = inTok * USD_IN + outTok * USD_OUT;
    return { inTok: inTok, outTok: outTok, usd: usd, krw: Math.round(usd * 1450) };
  }

  /* ---------- 부르기 ---------- */

  function client(key) {
    const A = global.AnthropicSDK && (global.AnthropicSDK.default || global.AnthropicSDK);
    if (typeof A !== 'function') throw new Error('Claude 라이브러리를 찾지 못했습니다. 프로그램 파일이 온전한지 확인해 주세요.');
    return new A({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 });
  }

  /* 키가 살아 있는지, 이 기기에서 부를 수 있는지 아주 작은 요청으로 확인합니다 */
  function testKey(key) {
    return client(key).messages.create({
      model: MODEL, max_tokens: 1,
      messages: [{ role: 'user', content: '.' }]
    }).then(function () { return { ok: true }; });
  }

  /*
   * pages : [{ kind:'image', data, media, w, h } | { kind:'pdf', data }]
   * onProgress(글자수) — 받는 동안 진행을 보여 주기 위한 것입니다
   * → 설계 코드 글자
   */
  function read(key, pages, onProgress) {
    if (!pages.length) return Promise.reject(new Error('읽을 페이지가 없습니다.'));
    if (pages.length > MAX_PAGES) {
      return Promise.reject(new Error('한 번에 ' + MAX_PAGES + '장까지만 보낼 수 있습니다. ' +
        '표지 · 기본 계약정보 · 보장 내용 · 해약환급금 예시표만 고르시면 넉넉합니다.'));
    }

    const content = [];
    pages.forEach(function (p, i) {
      content.push({ type: 'text', text: (i + 1) + '쪽:' });
      if (p.kind === 'pdf') {
        content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.data } });
      } else {
        content.push({ type: 'image', source: { type: 'base64', media_type: p.media, data: p.data } });
      }
    });
    content.push({ type: 'text', text: USER_TEXT });

    const cl = client(key);

    /* 정해진 모양(json_schema)으로 받습니다.
       혹시 그 방식이 거절되면 지시문만으로 한 번 더 해 봅니다 — 붙여넣기 쪽 해석기가
       코드 울타리나 앞뒤 설명글이 붙어 있어도 걸러내므로 결과는 같습니다. */
    const ask = function (withSchema) {
      let got = '';
      const cfg = { effort: 'high' };
      if (withSchema) cfg.format = { type: 'json_schema', schema: SCHEMA };
      const stream = cl.messages.stream({
        model: MODEL,
        max_tokens: 32000,
        system: SYSTEM + (withSchema ? '' : '\n\n답은 JSON 하나만 내보내세요. 설명을 덧붙이지 마세요.'),
        output_config: cfg,
        messages: [{ role: 'user', content: content }]
      });
      stream.on('text', function (t) {
        got += t;
        if (onProgress) onProgress(got.length);
      });
      return stream.finalMessage();
    };

    return ask(true).catch(function (e) {
      const A = global.AnthropicSDK && (global.AnthropicSDK.default || global.AnthropicSDK);
      const schemaIssue = A && (e instanceof A.BadRequestError) &&
        /schema|output_config|format/i.test(String(e.message || ''));
      if (!schemaIssue) throw e;
      return ask(false);
    }).then(function (msg) {
      if (msg.stop_reason === 'refusal') {
        throw new Error('Claude 가 이 요청을 처리하지 않았습니다' +
          (msg.stop_details && msg.stop_details.explanation ? ' — ' + msg.stop_details.explanation : '') + '.');
      }
      const text = (msg.content || []).filter(function (b) { return b.type === 'text'; })
        .map(function (b) { return b.text; }).join('');
      if (!String(text).trim()) {
        throw new Error(msg.stop_reason === 'max_tokens'
          ? '내용이 너무 길어 중간에 끊겼습니다. 페이지를 나눠서 두 번에 읽어 보세요.'
          : '읽어낸 내용이 비어 있습니다. 사진이 또렷한지 확인해 주세요.');
      }
      return { text: text, usage: msg.usage || null, stop: msg.stop_reason };
    });
  }

  /* SDK 오류를 사람 말로 옮깁니다 */
  function explain(e) {
    const A = global.AnthropicSDK && (global.AnthropicSDK.default || global.AnthropicSDK);
    const raw = (e && e.message) ? String(e.message) : String(e);
    if (A) {
      if (e instanceof A.AuthenticationError) return 'API 키가 올바르지 않습니다. 키를 다시 확인해 주세요.';
      if (e instanceof A.PermissionDeniedError) return '이 키로는 쓸 수 없습니다. Anthropic 계정의 사용 권한을 확인해 주세요.';
      if (e instanceof A.RateLimitError) return '요청이 너무 잦습니다. 잠시 뒤에 다시 눌러 주세요.';
      if (e instanceof A.BadRequestError) return '요청이 거절되었습니다 — ' + raw;
      if (e instanceof A.APIConnectionError) {
        return '인터넷으로 연결하지 못했습니다. 와이파이를 확인해 주세요. ' +
          '연결은 되는데 계속 막히면, 이 파일을 브라우저에서 직접 연 상태(file://)라 ' +
          '차단된 것일 수 있습니다 — 이 내용을 그대로 알려 주세요. (' + raw + ')';
      }
      if (e instanceof A.APIError) return 'Claude 쪽에서 오류가 왔습니다 (' + (e.status || '?') + ') — ' + raw;
    }
    return raw;
  }

  const Reader = {
    MODEL: MODEL, MAX_PAGES: MAX_PAGES, MAX_EDGE: MAX_EDGE, MAX_PDF_MB: MAX_PDF_MB,
    SCHEMA: SCHEMA, SYSTEM: SYSTEM,
    readAsDataURL: readAsDataURL, loadImage: loadImage, prepImage: prepImage,
    pageTokens: pageTokens, estimate: estimate,
    testKey: testKey, read: read, explain: explain
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Reader;
  else (global.NC = global.NC || {}).Reader = Reader;
})(typeof globalThis !== 'undefined' ? globalThis : this);
