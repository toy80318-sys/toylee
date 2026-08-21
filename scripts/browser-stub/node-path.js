/*
 * 브라우저 번들용 node:path 대체품 — 글자만 다루는 부분이라 그대로 흉내냅니다.
 */
function normalize(p) {
  const abs = String(p).charAt(0) === '/';
  const out = [];
  String(p).split('/').forEach(function (part) {
    if (!part || part === '.') return;
    if (part === '..') { if (out.length && out[out.length - 1] !== '..') out.pop(); else if (!abs) out.push('..'); return; }
    out.push(part);
  });
  return (abs ? '/' : '') + out.join('/') || (abs ? '/' : '.');
}
function join() {
  return normalize([].slice.call(arguments).filter(Boolean).join('/'));
}
function resolve() {
  const parts = [].slice.call(arguments).filter(Boolean);
  let out = '';
  for (let i = parts.length - 1; i >= 0; i--) {
    out = out ? parts[i] + '/' + out : parts[i];
    if (String(parts[i]).charAt(0) === '/') break;
  }
  return normalize(String(out).charAt(0) === '/' ? out : '/' + out);
}
function dirname(p) {
  const s = normalize(p), i = s.lastIndexOf('/');
  return i <= 0 ? (i === 0 ? '/' : '.') : s.slice(0, i);
}
function basename(p, ext) {
  const s = normalize(p).split('/').pop() || '';
  return (ext && s.slice(-ext.length) === ext) ? s.slice(0, -ext.length) : s;
}
function extname(p) {
  const s = basename(p), i = s.lastIndexOf('.');
  return i > 0 ? s.slice(i) : '';
}
const sep = '/';
const path = { normalize, join, resolve, dirname, basename, extname, sep, posix: null };
path.posix = path;
export default path;
export { normalize, join, resolve, dirname, basename, extname, sep };
