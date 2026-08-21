/*
 * 브라우저 번들용 node:fs 대체품.
 *
 * SDK 의 자격증명 체인(디스크에 저장된 OAuth 프로필 읽기)과 파일 도구가
 * node:fs 를 불러오지만, 이 프로그램은 API 키를 직접 넘기므로 그 길로 가지 않습니다.
 * 혹시라도 불리면 조용히 실패하지 않고 무슨 일인지 알 수 있게 던집니다.
 */
function nope(name) {
  return function () {
    throw new Error('브라우저에서는 파일 시스템(fs.' + name + ')을 쓸 수 없습니다. API 키를 직접 넣어 주세요.');
  };
}
const names = ['readFileSync', 'writeFileSync', 'existsSync', 'mkdirSync', 'readdirSync',
  'statSync', 'createReadStream', 'createWriteStream', 'appendFileSync', 'unlinkSync',
  'rmSync', 'realpathSync', 'openSync', 'readSync', 'closeSync', 'lstatSync'];
const fs = {};
names.forEach(function (n) { fs[n] = nope(n); });
fs.promises = {};
names.forEach(function (n) { fs.promises[n] = nope(n); });
export default fs;
export const promises = fs.promises;
export const readFileSync = fs.readFileSync;
export const writeFileSync = fs.writeFileSync;
export const existsSync = fs.existsSync;
export const mkdirSync = fs.mkdirSync;
export const readdirSync = fs.readdirSync;
export const statSync = fs.statSync;
export const createReadStream = fs.createReadStream;
