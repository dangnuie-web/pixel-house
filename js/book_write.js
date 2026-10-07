// 독서 책꽂이 쓰기 (2026-10-03 비트, journal 브랜치). 그림·파일 접근 없음: 글(text)을 받아 새 글을 돌려준다.
// Electron 메인(electron/book_ipc.js), 화면(js/bookshelf.js: 읽기), Node 시험(tests/test_journal.js)이 같이 쓴다.
// 바꾸는 곳은 둘뿐: ## 독서 표, ## 독서 보관 표. 없으면 만든다 (## 독서 = ## 버킷리스트 바로 앞, 없으면 파일 끝 / ## 독서 보관 = ## 독서 바로 뒤).
// 원칙은 물컵·공부와 같다: 한 줄 더하기 / 그 줄만 바꾸기 / 한 줄 옮기기. 다른 줄은 한 글자도 안 바뀐다.
// 메인은 쓰기 직전에 onlyBookChanged로 다시 확인한다.
//
// 표: | 날짜 | 제목 | 표지색 | 요약 |   보관: | 날짜 | 제목 | 표지색 | 요약 | 보관한 날 |
//   책 하나 = (날짜, 제목). 같은 날 같은 제목은 둘 둘 수 없음 (고르기·고치기·빼기에서 어느 줄인지 헷갈리지 않게)
//   표지색 = 이름 (BOOK_COLORS의 key, 예: 벽돌). 파일을 사람이 읽어도 알 수 있게 색 이름으로 적음
// 칸 글 안전 표시 (제목·요약): 쓸 때 \ -> \\, | -> \|, < -> \<, 줄바꿈 -> <br>. 읽을 때 그대로 되돌림 (왕복해도 한 글자도 안 바뀜)
//   마크다운 보기에서도 \| \< \\ 는 글자로, <br>은 줄바꿈으로 보임
(function (root) {
  'use strict';
  const Md = root.PHLifeMd || (typeof require !== 'undefined' ? require('./life_md.js') : null);

  const SEC = '독서';
  const ARCHIVE = '독서 보관';
  const BEFORE = '버킷리스트';
  const HEAD = ['날짜', '제목', '표지색', '요약'];
  const ARCHIVE_HEAD = ['날짜', '제목', '표지색', '요약', '보관한 날'];
  const TITLE_MAX = 60, SUMMARY_MAX = 2000;
  // 표지색 (하우스 팔레트 css/app.css 값). 순서 = 칩 순서. 파일에는 이름만
  const COLORS = [
    { name: '벽돌', hex: '#A65446' }, { name: '주황', hex: '#E08A3C' }, { name: '겨자', hex: '#C99A4E' }, { name: '잎', hex: '#86B07E' },
    { name: '숲', hex: '#5C8458' }, { name: '민트', hex: '#C4DCD8' }, { name: '남색', hex: '#3E4B69' }, { name: '분홍', hex: '#E9A9A0' },
    { name: '나무', hex: '#B07A4F' }, { name: '호두', hex: '#5A3B2A' },
  ];
  const COLOR_NAMES = COLORS.map((c) => c.name);

  const pad = (n) => String(n).padStart(2, '0');
  function ymd(d) { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; }
  function logDay(ms, startHour) { const h = Number.isFinite(startHour) ? startHour : 6; return ymd(ms - h * 3600000); }
  function isDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number), x = new Date(y, m - 1, d);
    return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d;
  }

  // ---- 칸 글 안전 표시 ----
  function encode(s) {
    return String(s).replace(/\r\n?/g, '\n').replace(/[\\|<]/g, (c) => '\\' + c).replace(/\n/g, '<br>');
  }
  function decode(s) {
    let out = '';
    const t = String(s);
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '\\' && i + 1 < t.length) { out += t[i + 1]; i++; continue; }
      if (c === '<' && t.slice(i, i + 4).toLowerCase() === '<br>') { out += '\n'; i += 3; continue; }
      out += c;
    }
    return out;
  }
  // 표 한 줄 -> 칸 (\| 는 칸을 나누지 않음). 칸 글은 아직 encode된 그대로 (앞뒤 공백만 뺌)
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
    if (cur.trim() !== '') out.push(cur.trim()); // 끝 | 가 없을 때 마지막 칸
    return out;
  }
  const rowText = (cells) => '| ' + cells.join(' | ') + ' |';
  const sepText = (n) => '|' + Array(n).fill('---').join('|') + '|';
  const isRow = (l) => /^\s*\|/.test(l);
  const isSep = (l) => /^\s*\|?\s*:?-{3,}/.test(l);
  const splitLines = (src) => String(src).split(/\r?\n/);

  // ---- 값 다듬기·검사 ----
  const len = (s) => Array.from(s).length;
  function checkTitle(s) {
    if (typeof s !== 'string') throw new Error('제목 형식 오류');
    const t = s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) throw new Error('제목이 비었음');
    if (len(t) > TITLE_MAX) throw new Error('제목이 너무 김 (' + TITLE_MAX + '자까지)');
    return t;
  }
  function checkSummary(s) {
    if (s != null && typeof s !== 'string') throw new Error('요약 형식 오류');
    // 줄바꿈·탭은 살리고 다른 제어 문자만 뺌. 앞뒤 빈 줄은 정리
    const t = String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u2028\u2029]/g, '').trim(); // 칸 앞뒤 공백은 표에서 사라지므로 미리 정리
    if (len(t) > SUMMARY_MAX) throw new Error('요약이 너무 김 (' + SUMMARY_MAX + '자까지)');
    return t;
  }
  function checkColor(s) { if (!COLOR_NAMES.includes(s)) throw new Error('표지색 오류: ' + s); return s; }
  function checkDate(s) { if (!isDate(s)) throw new Error('날짜 오류 (YYYY-MM-DD)'); return s; }
  const hexOf = (name) => { const c = COLORS.find((x) => x.name === name); return c ? c.hex : null; };

  // ---- 읽기 ----
  function findSection(lines, name) {
    const all = Md.sections(lines).filter((s) => s.name === name);
    if (all.length > 1) throw new Error('같은 섹션이 둘: ## ' + name);
    return all[0] || null;
  }
  // 섹션 안 첫 표: { headLine, head, sepLine, rows: [{ line, cells(encode된 칸) }], endLine } 또는 null
  function tableOf(lines, sec) {
    if (!sec) return null;
    let i = sec.start; while (i < sec.end && !isRow(lines[i])) i++;
    if (i >= sec.end) return null;
    const head = splitRow(lines[i]);
    let sep = i + 1; if (!(sep < sec.end && isSep(lines[sep]))) sep = null;
    let end = (sep == null ? i : sep) + 1;
    const rows = [];
    while (end < sec.end && isRow(lines[end])) { if (!isSep(lines[end])) rows.push({ line: end, cells: splitRow(lines[end]) }); end++; }
    return { headLine: i, head, sepLine: sep, rows, endLine: end };
  }
  const book = (r, archived) => {
    const c = r.cells, o = { line: r.line, date: c[0] || '', title: decode(c[1] || ''), color: c[2] || '', summary: decode(c[3] || '') };
    o.hex = hexOf(o.color); o.day = Md.dateOf(o.date);
    if (archived) o.archived = c[4] || '';
    return o;
  };
  // 글 -> { books: [...파일 순서], archive: [...], shelf: [...날짜 순(같은 날은 파일 순)], hasSection }
  function parse(src) {
    const lines = Array.isArray(src) ? src : splitLines(src);
    let s = null, a = null;
    try { s = findSection(lines, SEC); a = findSection(lines, ARCHIVE); } catch (e) { return { books: [], archive: [], shelf: [], error: String(e.message) }; }
    const t = tableOf(lines, s), at = tableOf(lines, a);
    const books = t ? t.rows.map((r) => book(r)) : [], archive = at ? at.rows.map((r) => book(r, true)) : [];
    const shelf = books.map((b, i) => Object.assign({ order: i }, b)).sort((x, y) => (x.day == null ? 1e15 : x.day) - (y.day == null ? 1e15 : y.day) || x.order - y.order);
    return { books, archive, shelf, hasSection: !!s };
  }
  // 이번 달 읽은 쪽: 습관 기록(Md.parse records)의 "독서 n쪽" 합. month = 'YYYY-MM'
  function monthPages(records, month, habit, unit) {
    let n = 0;
    (records || []).forEach((r) => { if (String(r.date || '').slice(0, 7) !== month) return; r.items.forEach((it) => { if (it.name === (habit || '독서') && it.value > 0 && (it.unit || '') === (unit || '쪽')) n += it.value; }); });
    return n;
  }

  // ---- 쓰기 ----
  const out = (src, lines, extra) => Object.assign({ text: lines.join(/\r\n/.test(src) ? '\r\n' : '\n'), changed: true }, extra);
  const same = (c, date, title) => c[0] === date && decode(c[1] || '') === title;
  function bookTable(lines) {
    const sec = findSection(lines, SEC); if (!sec) return { sec: null, t: null };
    const t = tableOf(lines, sec);
    if (t && t.head.join('|') !== HEAD.join('|')) throw new Error('## 독서 표 머리가 달라서 멈춤');
    return { sec, t };
  }
  function findRow(t, date, title) {
    const hits = t ? t.rows.filter((r) => same(r.cells, date, title)) : [];
    if (!hits.length) throw new Error('책 없음: ' + date + ' ' + title);
    if (hits.length > 1) throw new Error('같은 날 같은 제목이 둘이라 멈춤: ' + title);
    return hits[0];
  }
  function free(t, date, title, except) {
    if (t && t.rows.some((r) => same(r.cells, date, title) && r !== except)) throw new Error('같은 날 같은 제목 책이 이미 있음: ' + title);
  }
  const cellsFor = (b) => [b.date, encode(b.title), b.color, encode(b.summary)];
  function pad4(c) { const x = c.slice(0, 4); while (x.length < 4) x.push(''); return x; }

  // 더하기: ## 독서 표 끝. 섹션이 없으면 ## 버킷리스트 앞에 (없으면 파일 끝)
  function addBook(src, o) {
    o = o || {};
    const b = { date: checkDate(o.date), title: checkTitle(o.title), color: checkColor(o.color), summary: checkSummary(o.summary) };
    const lines = splitLines(src), { sec, t } = bookTable(lines), row = rowText(cellsFor(b));
    if (!sec) {
      const block = ['## ' + SEC, rowText(HEAD), sepText(HEAD.length), row, ''];
      const bi = findSection(lines, BEFORE);
      let at;
      if (bi) at = bi.line;
      else { at = lines.length; while (at > 0 && lines[at - 1] === '') at--; block.unshift(''); block.pop(); } // 파일 끝: 빈 줄 하나 띄우고 (끝 빈 줄은 그대로)
      lines.splice(at, 0, ...block);
      return out(src, lines, { op: 'add', line: at + block.indexOf(row), created: true, book: b, after: row });
    }
    if (!t) { // 섹션은 있는데 표가 없음: 섹션 글 끝(빈 줄 앞)에 머리·구분선·줄
      let at = sec.end; while (at > sec.start && lines[at - 1].trim() === '') at--;
      lines.splice(at, 0, rowText(HEAD), sepText(HEAD.length), row);
      return out(src, lines, { op: 'add', line: at + 2, created: false, book: b, after: row });
    }
    free(t, b.date, b.title);
    lines.splice(t.endLine, 0, row);
    return out(src, lines, { op: 'add', line: t.endLine, created: false, book: b, after: row });
  }
  // 고치기: key = { date, title }, patch = { date, title, color, summary } (없는 값 = 그대로)
  function updateBook(src, key, patch) {
    const p = patch || {}, k = key || {};
    const lines = splitLines(src), { t } = bookTable(lines), row = findRow(t, k.date, k.title);
    const c = pad4(row.cells), cur = { date: c[0], title: decode(c[1]), color: c[2], summary: decode(c[3]) };
    const next = Object.assign({}, cur);
    if (p.date != null) next.date = checkDate(p.date);
    if (p.title != null) next.title = checkTitle(p.title);
    if (p.color != null) next.color = checkColor(p.color);
    if (p.summary != null) next.summary = checkSummary(p.summary);
    if (next.date !== cur.date || next.title !== cur.title) free(t, next.date, next.title, row);
    const after = rowText(cellsFor(next));
    if (after === lines[row.line]) return { text: src, changed: false, op: 'update', line: row.line, book: next };
    const before = lines[row.line]; lines[row.line] = after;
    return out(src, lines, { op: 'update', line: row.line, book: next, before, after });
  }
  // 빼기: ## 독서에서 그 줄을 빼고 ## 독서 보관 표 끝에 (보관한 날 = date). 보관 섹션이 없으면 ## 독서 바로 뒤에 만듦
  function archiveBook(src, key, o) {
    const date = o && o.date; checkDate(date);
    const k = key || {};
    const lines = splitLines(src), { t } = bookTable(lines), row = findRow(t, k.date, k.title);
    const moved = rowText(pad4(row.cells).concat([date])), before = lines[row.line];
    lines.splice(row.line, 1);
    const aSec = findSection(lines, ARCHIVE), at = tableOf(lines, aSec);
    let line, created = false;
    if (aSec && at) {
      if (at.head.join('|') !== ARCHIVE_HEAD.join('|')) throw new Error('## 독서 보관 표 머리가 달라서 멈춤');
      line = at.endLine; lines.splice(line, 0, moved);
    } else if (aSec) {
      let p = aSec.end; while (p > aSec.start && lines[p - 1].trim() === '') p--;
      lines.splice(p, 0, rowText(ARCHIVE_HEAD), sepText(ARCHIVE_HEAD.length), moved); line = p + 2;
    } else { // ## 독서 섹션 바로 뒤 (study_write.js archiveStudy와 같은 자리 규칙)
      const s2 = findSection(lines, SEC);
      const p = s2.end, atEnd = p === lines.length;
      let q = p; while (q > s2.start && lines[q - 1].trim() === '') q--;
      const block = ['## ' + ARCHIVE, rowText(ARCHIVE_HEAD), sepText(ARCHIVE_HEAD.length), moved];
      if (atEnd) { lines.splice(q, 0, '', ...block); line = q + 4; }
      else { if (q === p) block.unshift(''); block.push(''); lines.splice(p, 0, ...block); line = p + block.indexOf(moved); }
      created = true;
    }
    return out(src, lines, { op: 'archive', from: row.line, line, created, before, after: moved });
  }
  // 되돌리기: ## 독서 보관에서 (날짜, 제목)의 마지막 줄을 빼고 ## 독서 표 끝에 (보관한 날 칸은 버림)
  function restoreBook(src, key) {
    const k = key || {};
    const lines = splitLines(src);
    const aSec = findSection(lines, ARCHIVE), at = tableOf(lines, aSec); if (!at) throw new Error('## 독서 보관 표 없음');
    const hits = at.rows.filter((r) => same(r.cells, k.date, k.title)); if (!hits.length) throw new Error('보관한 책 없음: ' + k.title);
    const row = hits[hits.length - 1];
    const { t } = bookTable(lines); if (!t) throw new Error('## 독서 표 없음');
    free(t, k.date, k.title);
    const before = lines[row.line], back = rowText(pad4(row.cells));
    lines.splice(row.line, 1);
    const t2 = bookTable(lines).t;
    lines.splice(t2.endLine, 0, back);
    return out(src, lines, { op: 'restore', from: row.line, line: t2.endLine, before, after: back });
  }

  // ---- 안전 검사 (메인이 쓰기 직전에) ----
  // 두 섹션 밖은 한 글자도 같아야 함(새 섹션을 파일 끝에 붙일 때 띄운 빈 줄 하나만 허용). 섹션 안 글 줄도 그대로.
  // 데이터 줄은 op에 맞게: add +1 / update 같은 자리 1줄 / archive 독서 -1·보관 +1 / restore 보관 -1·독서 +1. 새 줄은 칸 수·날짜·제목·색 검사
  function onlyBookChanged(oldText, newText, op) {
    try {
      const a = splitLines(oldText), b = splitLines(newText);
      const pick = (L) => {
        const s = findSection(L, SEC), x = findSection(L, ARCHIVE);
        const secs = [s, x].filter(Boolean).sort((p, q) => q.line - p.line);
        let rest = L.slice(); secs.forEach((z) => { rest = rest.slice(0, z.line).concat(rest.slice(z.end)); });
        const t = tableOf(L, s), at = tableOf(L, x);
        const prose = (z, tt) => (z ? L.slice(z.line, z.end).filter((l, i) => !(tt && z.line + i >= tt.headLine && z.line + i < tt.endLine)) : []);
        return { s, x, rest, t, at, prose, rows: t ? t.rows.map((r) => L[r.line]) : [], arows: at ? at.rows.map((r) => L[r.line]) : [] };
      };
      const A = pick(a), B = pick(b); if (!B.s || !B.t) return false;
      const ra = A.rest.join('\n'), rb = B.rest.join('\n');
      if (ra !== rb) {
        // 새 ## 독서를 파일 끝에 붙임: 앞 섹션 끝에 빈 줄 하나가 더 생김
        const endPad = !A.s && B.rest.length === A.rest.length + 1 && B.rest[B.rest.length - 1] === '' && A.rest.join('\n') === B.rest.slice(0, -1).join('\n');
        if (!endPad) return false;
      }
      // 새로 만든 ## 독서는 버킷리스트 바로 앞 또는 파일 끝
      if (!A.s) { // 버킷리스트가 있으면 그 바로 앞(사이에 독서 보관만 허용), 없으면 파일 끝
        const secsB = Md.sections(b), next = secsB.find((z) => z.line === B.s.end), hasBefore = secsB.some((z) => z.name === BEFORE);
        if (hasBefore ? !(next && (next.name === BEFORE || next.name === ARCHIVE)) : B.s.end !== b.length && !(next && next.name === ARCHIVE)) return false;
      }
      const trimEnd = (arr) => { const c = arr.slice(); while (c.length && c[c.length - 1].trim() === '') c.pop(); return c; };
      if (A.s && trimEnd(A.prose(A.s, A.t)).join('\n') !== trimEnd(B.prose(B.s, B.t)).join('\n')) return false;
      if (!A.s && trimEnd(B.prose(B.s, B.t)).join('\n') !== '## ' + SEC) return false;
      if (A.x && trimEnd(A.prose(A.x, A.at)).join('\n') !== trimEnd(B.prose(B.x, B.at)).join('\n')) return false;
      if (!A.x && B.x && trimEnd(B.prose(B.x, B.at)).join('\n') !== '## ' + ARCHIVE) return false;
      if (A.x && !B.x) return false;
      if (B.t.head.join('|') !== HEAD.join('|')) return false;
      if (B.at && B.at.head.join('|') !== ARCHIVE_HEAD.join('|')) return false;
      if (A.t && B.t.sepLine == null) return false;
      const diff = (xs, ys) => { const m = new Map(); xs.forEach((v) => m.set(v, (m.get(v) || 0) + 1)); const extra = []; ys.forEach((v) => { if (m.get(v)) m.set(v, m.get(v) - 1); else extra.push(v); }); return extra; };
      const goneS = diff(B.rows, A.rows), newS = diff(A.rows, B.rows), goneA = diff(B.arows, A.arows), newA = diff(A.arows, B.arows);
      const want = { add: [0, 1, 0, 0], update: [1, 1, 0, 0], archive: [1, 0, 0, 1], restore: [0, 1, 1, 0] }[op];
      if (!want) return false;
      if (goneS.length !== want[0] || newS.length !== want[1] || goneA.length !== want[2] || newA.length !== want[3]) return false;
      const okBook = (l) => {
        const c = splitRow(l); if (c.length !== 4 || !isDate(c[0]) || !COLOR_NAMES.includes(c[2])) return false;
        const ti = decode(c[1]); if (!ti.trim() || /\n/.test(ti) || len(ti) > TITLE_MAX || len(decode(c[3])) > SUMMARY_MAX) return false;
        return rowText(c) === l.trim(); // 다시 만든 줄과 같아야 함 (칸 사이 이상한 글자 없음)
      };
      const keyOf = (l) => { const c = splitRow(l); return c[0] + '|' + decode(c[1] || ''); };
      const dupKeys = (rows) => { const k = rows.map(keyOf); return new Set(k).size !== k.length; };
      if (dupKeys(B.rows) && !dupKeys(A.rows)) return false;
      const sig4 = (l) => pad4(splitRow(l)).join('|');
      if (op === 'add') return okBook(newS[0]);
      if (op === 'update') return A.rows.indexOf(goneS[0]) === B.rows.indexOf(newS[0]) && okBook(newS[0]);
      if (op === 'archive') { const c = splitRow(newA[0]); return c.length === 5 && isDate(c[4]) && c.slice(0, 4).join('|') === sig4(goneS[0]); }
      if (op === 'restore') return okBook(newS[0]) && sig4(newS[0]) === splitRow(goneA[0]).slice(0, 4).join('|');
      return false;
    } catch (e) { return false; }
  }

  const BW = { SEC, ARCHIVE, HEAD, ARCHIVE_HEAD, TITLE_MAX, SUMMARY_MAX, COLORS, COLOR_NAMES, ymd, logDay, isDate, encode, decode, splitRow, hexOf,
    checkTitle, checkSummary, parse, monthPages, addBook, updateBook, archiveBook, restoreBook, onlyBookChanged };
  root.PHBookWrite = BW;
  if (typeof module !== 'undefined' && module.exports) module.exports = BW;
})(typeof window !== 'undefined' ? window : globalThis);
