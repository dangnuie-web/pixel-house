// 생활 기록 파일의 "표 하나짜리 섹션" 쓰기 공용 도구 (2026-10-08 비트, 기록 기능 넓히기). 그림·파일 접근 없음: 글을 받아 새 글을 돌려준다.
// 쓰는 곳: js/record_write.js (## 기록, ## 기록 항목), js/study_parts.js (## 공부 단원). 메인(electron/record_ipc.js)·화면·Node 시험이 같이 쓴다.
// 원칙은 독서·약속 쓰기와 같다: 한 줄 더하기 / 그 줄만 바꾸기 / 한 줄 빼기. 다른 줄은 한 글자도 안 바뀐다. 메인은 쓰기 직전에 onlyRowsChanged로 다시 확인한다.
//   spec = { name: '기록', head: ['항목', '날짜', '제목', '요약'], before: ['버킷리스트'] (섹션이 없을 때 만들 자리: 이 섹션들 중 처음 것 바로 앞, 없으면 파일 끝) }
//   줄 고르기 = 읽은 그 줄 글(sig, 앞뒤 공백 뺀 것). 같은 글이 둘이면 마지막 줄 (어느 쪽이든 파일 글은 같음. 약속 쓰기와 같은 규칙)
// 칸 글 안전 표시 (독서 book_write.js와 같음): 쓸 때 \ -> \\, | -> \|, < -> \<, 줄바꿈 -> <br>. 읽을 때 되돌림
(function (root) {
  'use strict';
  const Md = root.PHLifeMd || (typeof require !== 'undefined' ? require('./life_md.js') : null);

  function encode(s) { return String(s).replace(/\r\n?/g, '\n').replace(/[\\|<]/g, (c) => '\\' + c).replace(/\n/g, '<br>'); }
  function decode(s) {
    let out = ''; const t = String(s);
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '\\' && i + 1 < t.length) { out += t[i + 1]; i++; continue; }
      if (c === '<' && t.slice(i, i + 4).toLowerCase() === '<br>') { out += '\n'; i += 3; continue; }
      out += c;
    }
    return out;
  }
  function splitRow(l) {
    let t = String(l).trim();
    if (t.startsWith('|')) t = t.slice(1);
    const out = []; let cur = '';
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '\\' && i + 1 < t.length) { cur += c + t[i + 1]; i++; continue; }
      if (c === '|') { out.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    if (cur.trim() !== '') out.push(cur.trim());
    return out;
  }
  const rowText = (cells) => '| ' + cells.join(' | ') + ' |';
  const sepText = (n) => '|' + Array(n).fill('---').join('|') + '|';
  const isRow = (l) => /^\s*\|/.test(l);
  const isSep = (l) => /^\s*\|?\s*:?-{3,}/.test(l);
  const splitLines = (src) => String(src).split(/\r?\n/);
  const nlOf = (src) => (/\r\n/.test(src) ? '\r\n' : '\n');
  const err = (code, msg) => { const e = new Error(msg || code); e.code = code; return e; };

  function findSection(lines, name) {
    const all = Md.sections(lines).filter((s) => s.name === name);
    if (all.length > 1) throw err('dupSection', '같은 섹션이 둘: ## ' + name);
    return all[0] || null;
  }
  function tableOf(lines, sec) {
    if (!sec) return null;
    let i = sec.start; while (i < sec.end && !isRow(lines[i])) i++;
    if (i >= sec.end) return null;
    const head = splitRow(lines[i]);
    let sep = i + 1; if (!(sep < sec.end && isSep(lines[sep]))) sep = null;
    let end = (sep == null ? i : sep) + 1;
    const rows = [];
    while (end < sec.end && isRow(lines[end])) { if (!isSep(lines[end])) rows.push({ line: end, raw: lines[end], cells: splitRow(lines[end]) }); end++; }
    return { headLine: i, head, sepLine: sep, rows, endLine: end };
  }
  function locate(lines, spec) {
    const sec = findSection(lines, spec.name); if (!sec) return { sec: null, t: null };
    const t = tableOf(lines, sec);
    if (t && t.head.join('|') !== spec.head.join('|')) throw err('badHead', '## ' + spec.name + ' 표 머리가 달라서 멈춤');
    return { sec, t };
  }
  // 읽기: [{ line, raw(앞뒤 공백 뺀 줄 글 = sig), cells: { 머리: 풀어 쓴 값 } }] 파일 순서
  function read(src, spec) {
    const lines = Array.isArray(src) ? src : splitLines(src);
    let loc; try { loc = locate(lines, spec); } catch (e) { return { rows: [], error: e.message, has: true }; }
    if (!loc.t) return { rows: [], has: !!loc.sec };
    return { has: true, rows: loc.t.rows.map((r) => { const c = {}; spec.head.forEach((h, k) => { c[h] = decode(r.cells[k] == null ? '' : r.cells[k]); }); return { line: r.line, raw: r.raw.trim(), cells: c }; }) };
  }
  const out = (src, lines, extra) => Object.assign({ text: lines.join(nlOf(src)), changed: true }, extra);
  function findRow(t, sig) {
    const hits = t ? t.rows.filter((r) => r.raw.trim() === String(sig).trim()) : [];
    if (!hits.length) throw err('notFound', '줄 없음');
    return hits[hits.length - 1];
  }
  // 더하기: 표 끝 (opt.before = 그 줄 글 앞에 끼움, 지우기 되돌리기용. 못 찾으면 표 끝). opt.raw = 되돌리기 때 원래 줄 글자 그대로
  function addRow(src, spec, cells, opt) {
    opt = opt || {};
    const lines = splitLines(src), { sec, t } = locate(lines, spec);
    const row = opt.raw != null ? String(opt.raw).trim() : rowText(cells);
    if (!sec) {
      const block = ['## ' + spec.name, rowText(spec.head), sepText(spec.head.length), row, ''];
      const bs = (spec.before || []).map((n) => findSection(lines, n)).filter(Boolean).sort((a, b) => a.line - b.line)[0];
      let at;
      if (bs) at = bs.line;
      else { at = lines.length; while (at > 0 && lines[at - 1] === '') at--; block.unshift(''); block.pop(); }
      lines.splice(at, 0, ...block);
      return out(src, lines, { op: 'add', line: at + block.indexOf(row), created: true, after: row });
    }
    if (!t) {
      let at = sec.end; while (at > sec.start && lines[at - 1].trim() === '') at--;
      lines.splice(at, 0, rowText(spec.head), sepText(spec.head.length), row);
      return out(src, lines, { op: 'add', line: at + 2, created: false, after: row });
    }
    let at = t.endLine;
    if (opt.before != null) { const b = t.rows.filter((r) => r.raw.trim() === String(opt.before).trim()); if (b.length) at = b[0].line; }
    lines.splice(at, 0, row);
    return out(src, lines, { op: 'add', line: at, created: false, after: row });
  }
  // 고치기: 같은 자리 그 줄만. cells(encode된 칸) 또는 opt.raw(되돌리기: 이전 줄 글자 그대로)
  function updateRow(src, spec, sig, cells, opt) {
    opt = opt || {};
    const lines = splitLines(src), { t } = locate(lines, spec), r = findRow(t, sig);
    const after = opt.raw != null ? String(opt.raw).trim() : rowText(cells), before = lines[r.line].trim();
    if (after === before) return { text: src, changed: false, op: 'update', line: r.line, before, after };
    lines[r.line] = after;
    return out(src, lines, { op: 'update', line: r.line, before, after });
  }
  // 빼기: 그 줄만. next = 뒤 줄 글 (되돌리기 때 그 앞에 다시 끼움, 마지막 줄이면 null)
  function removeRow(src, spec, sig) {
    const lines = splitLines(src), { t } = locate(lines, spec), r = findRow(t, sig);
    const i = t.rows.indexOf(r), next = t.rows[i + 1] ? t.rows[i + 1].raw.trim() : null, before = lines[r.line].trim();
    lines.splice(r.line, 1);
    return out(src, lines, { op: 'remove', line: r.line, before, next });
  }

  // ---- 안전 검사 (메인이 쓰기 직전에) ----
  //   섹션 밖은 한 글자도 같음 (새 섹션을 만들 때만 끝 빈 줄 차이 허용), 섹션 안 표 아닌 줄·머리도 같음
  //   줄 수 변화가 op와 맞음: add = 한 줄 생김 / update = 같은 자리 한 줄 / remove = 한 줄 빠짐. 생기거나 바뀐 줄은 okCells(풀어 쓴 칸 배열)를 통과
  function onlyRowsChanged(oldText, newText, spec, op, okCells) {
    try {
      const a = splitLines(oldText), b = splitLines(newText);
      const A = findSection(a, spec.name), B = findSection(b, spec.name);
      if (!B) return false;
      const cut = (L, s) => (s ? L.slice(0, s.line).concat(L.slice(s.end)) : L.slice());
      const ra = cut(a, A), rb = cut(b, B), trim = (x) => { const c = x.slice(); while (c.length && c[c.length - 1].trim() === '') c.pop(); return c; };
      if (ra.join('\n') !== rb.join('\n')) { if (A || trim(ra).join('\n') !== trim(rb).join('\n')) return false; }
      if (!A) { // 새로 만든 섹션: before 섹션 바로 앞이거나 파일 끝
        const secs = Md.sections(b), next = secs.find((z) => z.line === B.end), want = (spec.before || []).filter((n) => secs.some((z) => z.name === n));
        if (want.length ? !(next && want.includes(next.name)) : B.end !== b.length) return false;
      }
      const ta = A ? tableOf(a, A) : null, tb = tableOf(b, B); if (!tb || tb.head.join('|') !== spec.head.join('|') || tb.sepLine == null) return false;
      const prose = (L, s, t) => (s ? trim(L.slice(s.line, s.end).filter((l, i) => !(t && s.line + i >= t.headLine && s.line + i < t.endLine))).join('\n') : '## ' + spec.name);
      if (prose(a, A, ta) !== prose(b, B, tb)) return false;
      const ra2 = ta ? ta.rows.map((r) => r.raw.trim()) : [], rb2 = tb.rows.map((r) => r.raw.trim());
      const diff = (xs, ys) => { const m = new Map(); xs.forEach((v) => m.set(v, (m.get(v) || 0) + 1)); const extra = []; ys.forEach((v) => { if (m.get(v)) m.set(v, m.get(v) - 1); else extra.push(v); }); return extra; };
      const gone = diff(rb2, ra2), added = diff(ra2, rb2);
      // seed = 섹션이 없던 파일에 섹션을 새로 만들며 줄 0~8개 (기록 항목: 기본 칸을 실제 줄로 적을 때, 2026-10-08 피드백 4. 0개 = 기본 영화 한 칸을 지움). 기존 섹션에는 못 씀
      const want = op === 'seed' ? (A || added.length > 8 ? null : [0, added.length]) : { add: [0, 1], update: [1, 1], remove: [1, 0] }[op]; if (!want) return false;
      if (gone.length !== want[0] || added.length !== want[1]) return false;
      const ok = (l) => { if (/[\r\n]/.test(l)) return false; const c = splitRow(l); return c.length === spec.head.length && !!okCells(c.map(decode)); };
      if (op === 'update' && ra2.indexOf(gone[0]) !== rb2.indexOf(added[0])) return false;
      return added.every(ok);
    } catch (e) { return false; }
  }

  const TS = { encode, decode, splitRow, rowText, sepText, splitLines, nlOf, findSection, tableOf, locate, read, addRow, updateRow, removeRow, onlyRowsChanged, err };
  root.PHTableSection = TS;
  if (typeof module !== 'undefined' && module.exports) module.exports = TS;
})(typeof window !== 'undefined' ? window : globalThis);
