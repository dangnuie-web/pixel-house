// 생활 기록 쓰기 (첫 판: 물 칸만). 그림·파일 접근 없음: 글(text)을 받아 새 글을 돌려준다. Electron 메인과 Node 시험이 같이 쓴다.
// 원칙: "그 줄만 바꿔 쓰기". 다른 줄은 한 글자도 안 바뀐다. 같은 칸의 다른 습관 글자도 그대로 둔다.
//   0/6이 되면 항목을 지우지 않고 "물 0/6"으로 남긴다 (줄·항목 삭제 없음 = 바뀌는 범위가 가장 작고, 되돌리기 쉬움)
(function (root) {
  'use strict';
  const Md = root.PHLifeMd || (typeof require !== 'undefined' ? require('./life_md.js') : null);

  function ymd(d) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 습관 기록 표의 범위: { sec, headLine, sepLine, rows: [{ line, date }], first(첫 데이터 줄), endLine(표 다음 줄) }
  function recordsTable(lines) {
    const secs = Md.sections(lines), sec = secs.find((s) => s.name === Md.NAMES.records);
    if (!sec) return null;
    const t = Md.table(lines, sec); if (!t) return null;
    let sep = t.line + 1; if (!(sep < sec.end && /^\s*\|?\s*:?-{3,}/.test(lines[sep]))) sep = null;
    let end = (sep == null ? t.line : sep) + 1;
    while (end < sec.end && /^\s*\|/.test(lines[end])) end++;
    return { sec, headLine: t.line, sepLine: sep, rows: t.rows.map((r) => ({ line: r.line, date: r.cells['날짜'] })), endLine: end };
  }
  // 표 순서: 날짜가 내려가면 'desc'(최신이 위), 아니면 'asc'(최신이 아래, 기본)
  function order(rows) {
    const ds = rows.map((r) => Md.dateOf(r.date)).filter((d) => d != null);
    if (ds.length < 2) return 'asc';
    return ds[0] > ds[ds.length - 1] ? 'desc' : 'asc';
  }

  // 한 칸(한 습관 칸 글)에서 물 항목만 바꿈. 없으면 끝에 ", 물 v/of"를 붙임 (칸이 비었으면 "물 v/of")
  function setInCell(cell, habit, value, of) {
    const re = new RegExp('(^|[,，]\\s*)(' + esc(habit) + ')\\s+\\d+\\s*/\\s*\\d+(?=\\s*(?:[,，]|$))');
    if (re.test(cell)) return cell.replace(re, (m, pre, name) => `${pre}${name} ${value}/${of}`);
    const t = cell.replace(/\s+$/, '');
    return t ? `${t}, ${habit} ${value}/${of}` : `${habit} ${value}/${of}`;
  }
  // 표 한 줄 "| 날짜 | 한 습관 |"에서 둘째 칸만 바꿈 (칸 사이 공백·뒤 글자는 그대로)
  function setInRow(rowText, habit, value, of) {
    const m = /^(\s*\|[^|]*\|)([^|]*)(\|.*)$/.exec(rowText);
    if (!m) return null;
    const lead = /^\s*/.exec(m[2])[0], trail = /\s*$/.exec(m[2])[0];
    const core = m[2].slice(lead.length, m[2].length - trail.length);
    return m[1] + (lead || ' ') + setInCell(core, habit, value, of) + (trail || ' ') + m[3];
  }

  // 물 n/of로 정하기. -> { text, line, inserted, before, after } (쓸 것이 없으면 text 그대로, changed false)
  function setSlots(text, opt) {
    const habit = opt.habit, value = opt.value, of = opt.of, date = opt.date;
    if (!Number.isInteger(value) || !Number.isInteger(of) || of < 1 || value < 0 || value > of) throw new Error('값 오류');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜 오류');
    const nl = /\r\n/.test(text) ? '\r\n' : '\n';
    const lines = String(text).split(/\r?\n/);
    const T = recordsTable(lines); if (!T) throw new Error('습관 기록 표 없음');
    const hit = T.rows.find((r) => Md.dateOf(r.date) === Md.dateOf(date));
    if (hit) {
      const after = setInRow(lines[hit.line], habit, value, of); if (after == null) throw new Error('줄 모양 오류');
      if (after === lines[hit.line]) return { text, changed: false, line: hit.line };
      const before = lines[hit.line]; lines[hit.line] = after;
      return { text: lines.join(nl), changed: true, line: hit.line, inserted: false, before, after };
    }
    const row = `| ${date} | ${habit} ${value}/${of} |`;
    const desc = order(T.rows) === 'desc';
    const at = desc ? (T.sepLine != null ? T.sepLine + 1 : T.headLine + 1) : T.endLine;
    lines.splice(at, 0, row);
    return { text: lines.join(nl), changed: true, line: at, inserted: true, before: null, after: row };
  }

  // 안전 검사 (메인이 쓰기 직전에 다시 확인): 옛 글 -> 새 글이 "습관 기록 표 안 한 줄 바꿈" 또는 "그 표 안에 한 줄 더함"인지
  function onlyRecordsRowChanged(oldText, newText) {
    const a = String(oldText).split(/\r?\n/), b = String(newText).split(/\r?\n/);
    const T = recordsTable(a); if (!T) return false;
    const rowLine = (s) => /^\s*\|.*\|\s*$/.test(s) && !/^\s*\|?\s*:?-{3,}/.test(s);
    if (a.length === b.length) {
      const diff = a.map((x, i) => (x === b[i] ? -1 : i)).filter((i) => i >= 0);
      if (diff.length !== 1) return diff.length === 0;
      const i = diff[0];
      return T.rows.some((r) => r.line === i) && rowLine(b[i]) && cellsOf(a[i])[0] === cellsOf(b[i])[0]; // 날짜 칸은 그대로
    }
    if (b.length !== a.length + 1) return false;
    let i = 0; while (i < a.length && a[i] === b[i]) i++;
    if (a.slice(i).join('\n') !== b.slice(i + 1).join('\n')) return false;
    const lo = T.sepLine != null ? T.sepLine + 1 : T.headLine + 1;
    return i >= lo && i <= T.endLine && rowLine(b[i]) && cellsOf(b[i]).length === 2 && Md.dateOf(cellsOf(b[i])[0]) != null;
  }
  function cellsOf(l) { return l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()); }

  const W = { ymd, recordsTable, order, setInCell, setInRow, setSlots, onlyRecordsRowChanged };
  root.PHLifeWrite = W;
  if (typeof module !== 'undefined' && module.exports) module.exports = W;
})(typeof window !== 'undefined' ? window : globalThis);
