// 버킷리스트 쓰기 (2026-10-08 비트, 로드맵 3단계 "버킷리스트 메모지"). 그림·파일 접근 없음. 메인(electron/record_ipc.js)·화면(js/bucket_memo.js)·Node 시험이 같이 쓴다.
// 기존 모양 그대로: ## 버킷리스트 섹션의 "- [ ] 할 일" / "- [x] 한 일" 줄 (js/life_md.js가 읽는 모양)
//   체크하면 "- [x] 할 일 (완료 2026-10-08)" -> 완료 탭에 끝낸 날로 보임. 옛 "- [x] 줄"(날짜 없음)도 완료로 읽음
//   체크 풀기 = "- [ ] 할 일" (끝낸 날 지움). 자리는 그대로 (줄을 옮기지 않음: 되돌리기가 정확하도록)
//   더하기 = 마지막 체크 줄 바로 뒤 (체크 줄이 없으면 섹션 머리 바로 뒤, 섹션이 없으면 파일 끝에 새로)
//   "(…채우기)"처럼 괄호만 있는 자리 표시 줄은 건드리지 않음 (화면에도 안 나옴)
// 줄 고르기 = 읽은 그 줄 글(sig). 같은 글이 둘이면 마지막 줄
(function (root) {
  'use strict';
  const Md = root.PHLifeMd || (typeof require !== 'undefined' ? require('./life_md.js') : null);
  const TS = root.PHTableSection || (typeof require !== 'undefined' ? require('./table_section.js') : null);
  const SEC = '버킷리스트', TEXT_MAX = 80;
  const ITEM = /^\s*[-*]\s+\[([ xX])\]\s*(.*)$/;
  const DONE = /\s*\(완료 (\d{4}-\d{2}-\d{2})\)\s*$/;
  const len = (s) => Array.from(String(s)).length;
  const isDate = (s) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false; const [y, m, d] = s.split('-').map(Number), x = new Date(y, m - 1, d); return x.getMonth() === m - 1 && x.getDate() === d; };
  const bad = (code, msg) => TS.err(code, msg);

  // 한 줄 읽기 -> { done, text, doneDate, placeholder } 또는 null
  function item(l) {
    const m = ITEM.exec(l); if (!m) return null;
    let t = m[2].trim(), doneDate = null;
    const d = DONE.exec(t); if (d && m[1] !== ' ') { doneDate = d[1]; t = t.slice(0, d.index).trim(); }
    return { done: m[1] !== ' ', text: t, doneDate, placeholder: /^\(.*\)$/.test(t) || !t };
  }
  function checkText(s) {
    if (typeof s !== 'string') throw bad('badText', '형식 오류');
    const t = s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || len(t) > TEXT_MAX || /^\(.*\)$/.test(t) || DONE.test(t)) throw bad('badText', '내용 오류');
    return t;
  }
  const lineOf = (done, text, date) => (done ? `- [x] ${text}${date ? ` (완료 ${date})` : ''}` : `- [ ] ${text}`);

  function find(lines) {
    const all = Md.sections(lines).filter((s) => s.name === SEC);
    if (all.length > 1) throw bad('dupSection', '같은 섹션이 둘');
    return all[0] || null;
  }
  // -> { items: [{ line, sig, done, text, doneDate }], has } (자리 표시 줄 빠짐)
  function parse(src) {
    const lines = Array.isArray(src) ? src : TS.splitLines(src);
    let s; try { s = find(lines); } catch (e) { return { items: [], has: true, error: e.message }; }
    if (!s) return { items: [], has: false };
    const items = [];
    for (let i = s.start; i < s.end; i++) { const it = item(lines[i]); if (it && !it.placeholder) items.push(Object.assign({ line: i, sig: lines[i].trim() }, it)); }
    return { items, has: true };
  }
  // 버킷 탭 = 안 한 것(파일 순서), 완료 탭 = 끝낸 날 최신 먼저 (날짜 없는 옛 줄은 뒤)
  function tabs(P) {
    const todo = P.items.filter((x) => !x.done);
    const done = P.items.filter((x) => x.done).map((x, i) => Object.assign({ i }, x)).sort((a, b) => (b.doneDate || '').localeCompare(a.doneDate || '') || b.i - a.i);
    return { todo, done };
  }
  const out = (src, lines, extra) => Object.assign({ text: lines.join(TS.nlOf(src)), changed: true }, extra);
  function pick(lines, s, sig) {
    const hits = []; for (let i = s.start; i < s.end; i++) if (lines[i].trim() === String(sig).trim() && item(lines[i])) hits.push(i);
    if (!hits.length) throw bad('notFound', '줄 없음');
    return hits[hits.length - 1];
  }
  // 더하기 (opt.before = 그 줄 앞에, opt.raw = 되돌리기 원래 글자)
  function addItem(src, text, opt) {
    opt = opt || {};
    const lines = TS.splitLines(src), s = find(lines);
    const row = opt.raw != null ? String(opt.raw).trim() : lineOf(false, checkText(text));
    if (!s) {
      let at = lines.length; while (at > 0 && lines[at - 1] === '') at--;
      lines.splice(at, 0, '', '## ' + SEC, row);
      return out(src, lines, { op: 'add', line: at + 2, created: true, after: row });
    }
    let at = null;
    if (opt.before != null) { for (let i = s.start; i < s.end; i++) if (lines[i].trim() === String(opt.before).trim() && item(lines[i])) { at = i; break; } }
    if (at == null) { at = s.line + 1; for (let i = s.start; i < s.end; i++) if (item(lines[i])) at = i + 1; }
    lines.splice(at, 0, row);
    return out(src, lines, { op: 'add', line: at, after: row });
  }
  // 체크 / 체크 풀기 (date = 끝낸 날, 메인이 정함)
  function setDone(src, sig, done, date) {
    const lines = TS.splitLines(src), s = find(lines); if (!s) throw bad('noSection', '섹션 없음');
    const i = pick(lines, s, sig), it = item(lines[i]), before = lines[i].trim();
    if (done && !isDate(date)) throw bad('badDate', '날짜 오류');
    const after = lineOf(!!done, it.text, done ? (it.done && it.doneDate ? it.doneDate : date) : null);
    if (after === before) return { text: src, changed: false, op: 'update', line: i, before, after };
    lines[i] = after;
    return out(src, lines, { op: 'update', line: i, before, after, text0: it.text });
  }
  // 글 고치기 (체크·끝낸 날 그대로) / 되돌리기 (opt.raw)
  function editItem(src, sig, text, opt) {
    const lines = TS.splitLines(src), s = find(lines); if (!s) throw bad('noSection', '섹션 없음');
    const i = pick(lines, s, sig), it = item(lines[i]), before = lines[i].trim();
    const after = opt && opt.raw != null ? String(opt.raw).trim() : lineOf(it.done, checkText(text), it.doneDate);
    if (after === before) return { text: src, changed: false, op: 'update', line: i, before, after };
    lines[i] = after;
    return out(src, lines, { op: 'update', line: i, before, after });
  }
  function removeItem(src, sig) {
    const lines = TS.splitLines(src), s = find(lines); if (!s) throw bad('noSection', '섹션 없음');
    const i = pick(lines, s, sig), before = lines[i].trim();
    let next = null; for (let j = i + 1; j < s.end; j++) if (item(lines[j])) { next = lines[j].trim(); break; }
    lines.splice(i, 1);
    return out(src, lines, { op: 'remove', line: i, before, next });
  }

  // 안전 검사: 섹션 밖·섹션 안 체크 줄 아닌 줄은 그대로, 체크 줄은 op대로 (add +1 / update 같은 자리 1 / remove -1), 새 줄은 모양 검사
  function onlyBucketChanged(oldText, newText, op) {
    try {
      const a = TS.splitLines(oldText), b = TS.splitLines(newText), A = find(a), B = find(b); if (!B) return false;
      const cut = (L, s) => (s ? L.slice(0, s.line).concat(L.slice(s.end)) : L.slice());
      const trim = (x) => { const c = x.slice(); while (c.length && c[c.length - 1].trim() === '') c.pop(); return c; };
      if (cut(a, A).join('\n') !== cut(b, B).join('\n') && (A || trim(cut(a, A)).join('\n') !== trim(cut(b, B)).join('\n'))) return false;
      if (!A && B.end !== b.length && trim(b.slice(B.line)).length !== b.slice(B.line).length) return false;
      const other = (L, s) => (s ? trim(L.slice(s.line, s.end).filter((l) => !item(l))).join('\n') : '## ' + SEC);
      if (other(a, A) !== other(b, B)) return false;
      const its = (L, s) => (s ? L.slice(s.start, s.end).filter((l) => item(l)).map((l) => l.trim()) : []);
      const xa = its(a, A), xb = its(b, B);
      const diff = (xs, ys) => { const m = new Map(); xs.forEach((v) => m.set(v, (m.get(v) || 0) + 1)); const extra = []; ys.forEach((v) => { if (m.get(v)) m.set(v, m.get(v) - 1); else extra.push(v); }); return extra; };
      const gone = diff(xb, xa), added = diff(xa, xb), want = { add: [0, 1], update: [1, 1], remove: [1, 0] }[op];
      if (!want || gone.length !== want[0] || added.length !== want[1]) return false;
      if (op === 'update' && xa.indexOf(gone[0]) !== xb.indexOf(added[0])) return false;
      return added.every((l) => { const it = item(l); if (!it || it.placeholder || len(it.text) > TEXT_MAX) return false; const d = DONE.exec(ITEM.exec(l)[2]); return !d || isDate(d[1]); });
    } catch (e) { return false; }
  }

  const BKW = { SEC, TEXT_MAX, item, parse, tabs, checkText, addItem, setDone, editItem, removeItem, onlyBucketChanged };
  root.PHBucketWrite = BKW;
  if (typeof module !== 'undefined' && module.exports) module.exports = BKW;
})(typeof window !== 'undefined' ? window : globalThis);
