// 일지 표 공통 (대변 관찰 일지 js/poop_log.js · 식사 일지 js/meal_log.js, 2026-10-04 비트, logs 브랜치). 그림·파일 접근 없음: 글을 받아 새 글을 돌려준다.
// Electron 메인(electron/logs_ipc.js), 화면, Node 시험(tests/test_logs.js)이 같이 쓴다.
// 하는 일
//   - 칸 글 안전 표시: & -> &amp;, < -> &lt;, | -> &#124;, 줄바꿈 -> <br>. 읽을 때 그대로 되돌림 (왕복해도 한 글자도 안 바뀜)
//     독서 표(js/book_write.js)의 \| 방식과 다르게 HTML 글자 표시를 쓴 이유: 파일 안에 맨 | 가 남지 않아서
//     칸을 단순히 | 로 나누는 다른 코드(js/life_md.js cells, 다른 브랜치의 표 읽기)도 칸 수를 틀리지 않음. 마크다운 보기에서도 | · 줄바꿈으로 보임
//   - 섹션·표 찾기, 새 섹션 자리(## 버킷리스트 바로 앞, 없으면 파일 끝), 생활습관 표에 "기록" 줄 하나 더하기(없을 때만)
//   - 안전 검사 checkChange: 그 섹션 표 안에서 정해진 만큼(더하기 1 / 고치기 1 / 빼기 1)만 바뀌었는지, 섹션 밖은 한 글자도 같은지
(function (root) {
  'use strict';
  const Md = root.PHLifeMd || (typeof require !== 'undefined' ? require('./life_md.js') : null);
  const BEFORE = '버킷리스트';
  const HABITS = '생활습관';
  const HABIT_HEAD = ['습관', '종류', '기준', '주기'];

  // ---- 칸 글 안전 표시 ----
  function encode(s) {
    return String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\|/g, '&#124;').replace(/\n/g, '<br>');
  }
  function decode(s) {
    return String(s == null ? '' : s).replace(/<br\s*\/?>|&amp;|&lt;|&#124;/gi, (m) => (m[0] === '<' ? '\n' : m === '&amp;' ? '&' : m === '&lt;' ? '<' : '|'));
  }

  // ---- 값 ----
  const pad = (n) => String(n).padStart(2, '0');
  function isDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number), x = new Date(y, m - 1, d);
    return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d;
  }
  const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const hm = (ms) => { const x = new Date(ms); return pad(x.getHours()) + ':' + pad(x.getMinutes()); };
  const len = (s) => Array.from(String(s)).length;
  // 여러 줄 글 (메모): 줄바꿈·탭은 살리고 다른 제어 문자는 뺌. 앞뒤 빈칸·빈 줄 정리 (칸 앞뒤 공백은 표에서 사라지므로)
  function multiline(s, max, what) {
    if (s != null && typeof s !== 'string') throw new Error((what || '글') + ' 형식 오류');
    const t = String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u2028\u2029]/g, '').trim();
    if (len(t) > max) throw new Error((what || '글') + '이 너무 김 (' + max + '자까지)');
    return t;
  }
  // 한 줄 글 (메뉴 이름): 줄바꿈·제어 문자 -> 띄어쓰기, 겹친 공백 하나로
  function oneline(s, max, what) {
    if (s != null && typeof s !== 'string') throw new Error((what || '글') + ' 형식 오류');
    const t = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (len(t) > max) throw new Error((what || '글') + '이 너무 김 (' + max + '자까지)');
    return t;
  }

  // ---- 표 ----
  const splitLines = (src) => String(src).split(/\r?\n/);
  const nlOf = (src) => (/\r\n/.test(src) ? '\r\n' : '\n');
  const cells = (l) => String(l).trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const rowText = (c) => '| ' + c.join(' | ') + ' |';
  const sepText = (n) => '|' + Array(n).fill('---').join('|') + '|';
  const isRow = (l) => /^\s*\|/.test(l);
  const isSep = (l) => /^\s*\|?\s*:?-{3,}/.test(l);
  const same = (a, b) => a.join('|') === b.join('|');
  function findSection(lines, name) {
    const all = Md.sections(lines).filter((s) => s.name === name);
    if (all.length > 1) throw new Error('같은 섹션이 둘: ## ' + name);
    return all[0] || null;
  }
  // 섹션 안 첫 표 { headLine, head, sepLine, rows: [{ line, cells }], endLine } 또는 null
  function tableOf(lines, sec) {
    if (!sec) return null;
    let i = sec.start; while (i < sec.end && !isRow(lines[i])) i++;
    if (i >= sec.end) return null;
    const head = cells(lines[i]);
    let sep = i + 1; if (!(sep < sec.end && isSep(lines[sep]))) sep = null;
    let end = (sep == null ? i : sep) + 1;
    const rows = [];
    while (end < sec.end && isRow(lines[end])) { if (!isSep(lines[end])) rows.push({ line: end, cells: cells(lines[end]) }); end++; }
    return { headLine: i, head, sepLine: sep, rows, endLine: end };
  }
  // 새 섹션 한 덩이 넣기: ## 버킷리스트 바로 앞 (없으면 파일 끝, 빈 줄 하나 띄우고). -> 넣은 첫 데이터 줄 번호
  function placeSection(lines, name, head, row) {
    const block = ['## ' + name, rowText(head), sepText(head.length), row, ''];
    const bi = findSection(lines, BEFORE);
    let at;
    if (bi) at = bi.line;
    else { at = lines.length; while (at > 0 && lines[at - 1] === '') at--; block.unshift(''); block.pop(); }
    lines.splice(at, 0, ...block);
    return at + block.indexOf(row);
  }
  // 섹션 표 준비: 없으면 null(부른 쪽이 placeSection), 옛 머리면 머리·구분선만 새 모양으로(옛 줄은 그대로), 표가 없으면 머리·구분선을 넣음
  //   -> { sec, t, upgraded } / 머리가 다르면 오류
  function prepare(lines, name, head, oldHeads) {
    const sec = findSection(lines, name); if (!sec) return null;
    let t = tableOf(lines, sec), upgraded = false;
    if (!t) {
      let at = sec.end; while (at > sec.start && lines[at - 1].trim() === '') at--;
      lines.splice(at, 0, rowText(head), sepText(head.length));
      return { sec: findSection(lines, name), t: tableOf(lines, findSection(lines, name)), upgraded: false, madeTable: true };
    }
    if ((oldHeads || []).some((h) => same(h, t.head))) {
      lines[t.headLine] = rowText(head);
      if (t.sepLine != null) lines[t.sepLine] = sepText(head.length); else lines.splice(t.headLine + 1, 0, sepText(head.length));
      t = tableOf(lines, findSection(lines, name)); upgraded = true;
    }
    if (!same(t.head, head)) throw new Error('## ' + name + ' 표 머리가 달라서 멈춤');
    if (t.sepLine == null) { lines.splice(t.headLine + 1, 0, sepText(head.length)); t = tableOf(lines, findSection(lines, name)); }
    return { sec: findSection(lines, name), t, upgraded };
  }
  // 날짜·시각 순 자리: key(cells) 보다 큰 첫 줄 앞 (없으면 표 끝). 같은 값이면 뒤에
  function sortedAt(t, key, keyOf) {
    const hit = t.rows.find((r) => keyOf(r.cells) > key);
    return hit ? hit.line : t.endLine;
  }

  // ---- 생활습관 표 "기록" 줄 (없을 때만 표 끝에 한 줄) ----
  const habitRow = (h) => rowText([h.name, '기록', h.target, '-']);
  function habitsTable(lines) {
    const s = Md.sections(lines).filter((x) => x.name === HABITS); if (s.length !== 1) return null;
    const t = tableOf(lines, s[0]); return t && same(t.head, HABIT_HEAD) ? t : null;
  }
  function hasHabit(lines, name) { const t = habitsTable(lines); return !!t && t.rows.some((r) => r.cells[0] === name); }
  // -> 넣은 줄 번호 또는 -1 (표가 없거나 이미 있음)
  function ensureHabit(lines, h) {
    if (!h) return -1;
    const t = habitsTable(lines); if (!t || t.rows.some((r) => r.cells[0] === h.name)) return -1;
    lines.splice(t.endLine, 0, habitRow(h));
    return t.endLine;
  }

  // ---- 안전 검사 (메인이 쓰기 직전에) ----
  // spec = { sec, head, oldHeads, op: 'add' | 'update' | 'remove' | 'upsert'(더하기 또는 고치기), habit: { name, target } | null,
  //          rowOk(cells) -> bool (새로 생기거나 바뀐 줄), date: 'YYYY-MM-DD'(주면 바뀐 줄 날짜 칸이 이 값이어야 함),
  //          sameRow(oldCells, newCells) -> bool (고치기에서 옛 줄과 새 줄이 지켜야 할 것, 예: 끼니 그대로) }
  function checkChange(oldText, newText, spec) {
    try {
      const a = splitLines(oldText); let b = splitLines(newText);
      // 1) 생활습관 "기록" 줄: 옛 글에 없고 새 글 생활습관 표 끝에 정해진 모양 한 줄이면 빼고 봄 (더하기만)
      if (spec.habit && (spec.op === 'add' || spec.op === 'upsert') && !hasHabit(a, spec.habit.name)) {
        const tb = habitsTable(b), hits = tb ? tb.rows.filter((r) => r.cells[0] === spec.habit.name) : [];
        if (hits.length === 1 && b[hits[0].line] === habitRow(spec.habit) && hits[0].line === tb.endLine - 1) b = b.slice(0, hits[0].line).concat(b.slice(hits[0].line + 1));
      }
      const sa = findSection(a, spec.sec), sb = findSection(b, spec.sec); if (!sb) return false;
      // 2) 섹션 밖은 그대로 (새 섹션을 파일 끝에 붙일 때 띄운 빈 줄 하나만 허용)
      const outA = sa ? a.slice(0, sa.line).concat(a.slice(sa.end)) : a, outB = b.slice(0, sb.line).concat(b.slice(sb.end));
      const trimEnd = (arr) => { const c = arr.slice(); while (c.length && c[c.length - 1].trim() === '') c.pop(); return c; };
      const atEnd = !sa && sb.end === b.length; // 새 섹션을 파일 끝에 붙임: 끝의 빈 줄 수만 달라질 수 있음
      if ((atEnd ? trimEnd(outA) : outA).join('\n') !== (atEnd ? trimEnd(outB) : outB).join('\n')) return false;
      const tb = tableOf(b, sb); if (!tb || !same(tb.head, spec.head) || tb.sepLine == null) return false;
      const good = (line) => { const c = cells(line); return c.length === spec.head.length && rowText(c) === line.trim() && (!spec.date || c[0] === spec.date) && !!spec.rowOk(c); };
      const prose = (L, s, t) => trimEnd(L.slice(s.line, s.end).filter((l, i) => !(t && s.line + i >= t.headLine && s.line + i < t.endLine)));
      // 3) 새 섹션: 정해진 모양 그대로 + 자리 = 버킷리스트 바로 앞 또는 파일 끝
      if (!sa) {
        if (spec.op !== 'add' && spec.op !== 'upsert') return false;
        const next = Md.sections(b).find((s) => s.line === sb.end);
        if (!(sb.end === b.length || (next && next.name === BEFORE))) return false;
        if (prose(b, sb, tb).join('\n') !== '## ' + spec.sec || tb.rows.length !== 1) return false;
        return good(b[tb.rows[0].line]);
      }
      // 4) 섹션 안: 글줄 그대로, 표 머리 = 새 머리(옛 머리에서 바뀐 것은 허용), 데이터 줄은 op만큼
      if (prose(a, sa, tableOf(a, sa)).join('\n') !== prose(b, sb, tb).join('\n')) return false;
      const ta = tableOf(a, sa);
      if (ta && !same(ta.head, spec.head) && !(spec.oldHeads || []).some((h) => same(h, ta.head))) return false;
      const ra = ta ? ta.rows.map((r) => a[r.line]) : [], rb = tb.rows.map((r) => b[r.line]);
      const minus = (xs, i) => xs.slice(0, i).concat(xs.slice(i + 1));
      const eq = (x, y) => x.join('\n') === y.join('\n');
      const isAdd = () => { if (rb.length !== ra.length + 1) return false; for (let i = 0; i < rb.length; i++) if (eq(minus(rb, i), ra)) return good(rb[i]); return false; };
      const isUpdate = () => {
        if (rb.length !== ra.length) return false;
        const d = ra.map((x, i) => (x === rb[i] ? -1 : i)).filter((i) => i >= 0);
        if (d.length === 0) return true;
        if (d.length !== 1) return false;
        if (spec.date && cells(ra[d[0]])[0] !== spec.date) return false;
        if (spec.sameRow && !spec.sameRow(cells(ra[d[0]]), cells(rb[d[0]]))) return false;
        return good(rb[d[0]]);
      };
      const isRemove = () => { if (rb.length !== ra.length - 1) return false; for (let i = 0; i < ra.length; i++) if (eq(minus(ra, i), rb)) return true; return false; };
      if (spec.op === 'add') return isAdd();
      if (spec.op === 'update') return isUpdate();
      if (spec.op === 'remove') return isRemove();
      if (spec.op === 'upsert') return isAdd() || isUpdate();
      return false;
    } catch (e) { return false; }
  }

  const LT = { BEFORE, HABITS, encode, decode, isDate, isTime, hm, len, multiline, oneline, splitLines, nlOf, cells, rowText, sepText, findSection, tableOf, placeSection, prepare, sortedAt, habitRow, hasHabit, ensureHabit, checkChange, logDay: (ms, h) => Md.logDay(ms, h) };
  root.PHLogTable = LT;
  if (typeof module !== 'undefined' && module.exports) module.exports = LT;
})(typeof window !== 'undefined' ? window : globalThis);
