// 약속 쓰기 (2026-10-07 비트, 제작자 결정 2026-10-07). 그림·파일 접근 없음: 글(text)을 받아 새 글을 돌려준다.
// Electron 메인(electron/meeting_ipc.js)과 화면(js/meeting_edit_ui.js), Node 시험(tests/test_meeting_edit.js)이 같이 쓴다.
//   ## 약속 표 | 날짜 | 시간 | 내용 | (옛 이름 ## Meeting도 같은 표) 한 줄 더하기(addMeeting)·고치기(updateMeeting)·빼기(removeMeeting)
//   더하기 자리 = 날짜·시간 순으로 알맞은 자리 (더 늦은 첫 줄 앞, 같으면 뒤). 날짜 못 읽는 옛 줄은 비교에서 건너뜀
//   고치기 = 같은 자리에서 그 줄만 바꿈 (날짜를 바꿔도 자리는 그대로. 화면은 늘 날짜 순으로 보임)
//   빼기 -> 되돌리기 = 같은 자리(바로 뒤 줄 앞)에 원래 글자 그대로(띄어쓰기까지)
// 줄 고르기 = key { sig: 화면이 읽은 그 줄 글 } (대변·식사 일지와 같은 방식). 같은 글 줄이 여럿이면 마지막 줄 (어느 쪽이든 파일 글은 같음)
// 값 (고치지 않고 막음, code를 붙여 던짐: 'badDate' / 'badTime' / 'badText'):
//   날짜 = YYYY-MM-DD 실제 있는 날 (지난 날도 됨)
//   시간 = 기존 표와 같은 꼴 "10am" "7pm" "7:30pm" (1~12시, 분 00~59). 대소문자·띄어쓰기만 맞춰 줌("7 PM" -> "7pm"), 비우면 시간 없음
//          달력(js/calendar.js timeKey)·입장 대사(js/interact_logic.js timeKey)·냉장고 메모지가 모두 이 꼴을 읽음
//          옛 줄의 다른 꼴("저녁쯤")은 고치기에서 시간을 그대로 두면 그대로 남김 (몰래 바꾸지 않음)
//   내용 = 한 줄, 표를 깨는 글자(| ｜ \ 줄바꿈·제어 문자) 막음, 60자까지
// 쓰기 원칙: ## 약속 표 안 줄만. 다른 줄은 한 글자도 안 바뀐다. 메인이 쓰기 직전에 onlyMeetingsChanged로 다시 확인한다
(function (root) {
  'use strict';
  const req = (n) => (typeof require !== 'undefined' ? require(n) : null);
  const Md = root.PHLifeMd || req('./life_md.js');
  const LT = root.PHLogTable || req('./log_table.js');

  const HEAD = ['날짜', '시간', '내용'];
  const NAMES = [].concat(Md.NAMES.meetings); // ['약속', 'Meeting']
  const TEXT_MAX = 60, TIME_MAX = 20, OLD_MAX = 200; // OLD_MAX = 옛 줄을 그대로 되살릴 때(되돌리기) 내용 길이 상한
  const err = (msg, code) => Object.assign(new Error(msg), code ? { code } : {});
  const len = (s) => Array.from(String(s)).length;
  const BAD = /[|｜\\\u0000-\u001f\u007f\u2028\u2029]/;

  // ---- 값 검사 ----
  function checkDate(s) {
    if (!LT.isDate(s)) throw err('날짜 오류 (YYYY-MM-DD)', 'badDate');
    return s;
  }
  // 시간 꼴: 1~12 (+ :분) + am/pm. "07pm" "7 PM" -> "7pm"
  const TIME_RE = /^0?(1[0-2]|[1-9])(?::([0-5]\d))?\s*(am|pm)$/i;
  function normTime(s) {
    const m = TIME_RE.exec(String(s).trim()); if (!m) return null;
    return m[1] + (m[2] != null ? ':' + m[2] : '') + m[3].toLowerCase();
  }
  // keep = 그대로 두어도 되는 옛 값 (고치기에서 시간을 안 건드림 / 되돌리기)
  function checkTime(s, keep) {
    if (s != null && typeof s !== 'string') throw err('시간 형식 오류', 'badTime');
    const t = String(s == null ? '' : s).trim();
    if (!t) return '';
    if (keep != null && t === keep && okOld(t, TIME_MAX)) return t;
    const n = normTime(t);
    if (!n) throw err('시간은 10am, 7pm, 7:30pm처럼', 'badTime');
    return n;
  }
  function checkText(s, keep) {
    if (typeof s !== 'string') throw err('내용 형식 오류', 'badText');
    if (BAD.test(s)) throw err('내용에 쓸 수 없는 글자 (| \\ 줄바꿈)', 'badText');
    const t = s.replace(/\s+/g, ' ').trim();
    if (!t) throw err('내용이 비었음', 'badText');
    if (keep != null && t === keep && okOld(t, OLD_MAX)) return t;
    if (len(t) > TEXT_MAX) throw err('내용이 너무 김 (' + TEXT_MAX + '자까지)', 'badText');
    return t;
  }
  const okOld = (t, max) => !BAD.test(t) && len(t) <= max;
  function check(m, keep) {
    if (!m || typeof m !== 'object') throw err('약속 형식 오류', 'badText');
    const k = keep || {};
    return { date: checkDate(m.date), time: checkTime(m.time, k.time), text: checkText(m.text, k.text) };
  }

  // ---- 표 ----
  // 약속 섹션 하나 + 표 (없으면 머리·구분선을 넣음, LT.prepare). -> { name, t, lines }
  function meetTable(lines) {
    const secs = Md.sections(lines).filter((s) => NAMES.includes(s.name));
    if (!secs.length) throw err('## 약속 섹션 없음', 'noSection');
    if (secs.length > 1) throw err('## 약속 섹션이 둘이라 멈춤');
    const name = secs[0].name;
    const p = LT.prepare(lines, name, HEAD); // 머리가 다르면 오류
    return { name, t: p.t };
  }
  const sigOf = (l) => String(l).trim();
  function findRow(lines, t, key) {
    const sig = key && typeof key.sig === 'string' ? sigOf(key.sig) : null;
    const hits = sig ? t.rows.filter((r) => sigOf(lines[r.line]) === sig) : [];
    if (!hits.length) throw err('약속 없음 (파일이 바뀌었을 수 있음)', 'notFound');
    return hits[hits.length - 1];
  }
  // 정렬 값: 날짜 + 시간(분, 못 읽으면 하루 끝). 날짜 못 읽으면 null
  function minutes(s) { const n = normTime(s || ''); if (!n) return 9999; const m = /^(\d+)(?::(\d+))?(am|pm)$/.exec(n); let h = Number(m[1]) % 12; if (m[3] === 'pm') h += 12; return h * 60 + Number(m[2] || 0); }
  const sortKey = (c) => (LT.isDate(c[0]) ? c[0] + ' ' + String(minutes(c[1])).padStart(4, '0') : null);
  function sortedAt(t, cells) {
    const k = sortKey(cells), hit = t.rows.find((r) => { const x = sortKey(r.cells); return x != null && x > k; });
    return hit ? hit.line : t.endLine;
  }
  // 되살릴 원래 글: 칸이 검사한 값과 똑같을 때만 (아니면 새로 만든 줄)
  function sameRaw(raw, cells) {
    if (typeof raw !== 'string' || /[\r\n]/.test(raw) || !/^\s*\|/.test(raw)) return null;
    const c = LT.cells(raw); return c.length === cells.length && c.every((x, i) => x === cells[i]) ? raw : null;
  }
  const cellsOf = (m) => [m.date, m.time, m.text];
  const objOf = (c) => ({ date: c[0] || '', time: c[1] || '', text: c[2] || '' });
  const done = (src, lines, extra) => Object.assign({ text: lines.join(LT.nlOf(src)), changed: true }, extra);

  // ---- 더하기: m = { date, time, text }, opt = { before(바로 뒤 줄 글, 되돌리기), raw(원래 줄 글, 되돌리기) } ----
  function addMeeting(text, m, opt) {
    const o = opt || {}, undo = o.raw != null;
    const raw = undo && typeof o.raw === 'string' ? objOf(LT.cells(o.raw)) : null;
    const v = check(m, raw && raw.date === (m && m.date) ? { time: raw.time, text: raw.text } : null); // 되돌리기 = 옛 값 그대로 허용
    const lines = LT.splitLines(text), T = meetTable(lines);
    const c = cellsOf(v), row = (undo && sameRaw(o.raw, c)) || LT.rowText(c);
    let at = null;
    if (o.before != null) { const b = T.t.rows.find((r) => sigOf(lines[r.line]) === sigOf(o.before)); if (b) at = b.line; }
    if (at == null) at = undo && o.before == null ? T.t.endLine : sortedAt(T.t, c); // 되돌리기에서 뒤 줄이 없었으면 = 표 끝 (원래 자리)
    lines.splice(at, 0, row);
    return done(text, lines, { op: 'add', line: at, meeting: v, after: row, section: T.name });
  }
  // ---- 고치기: key = { sig }, patch = { date, time, text } (없는 값 = 그대로). opt.raw = 되돌리기(그 글자 그대로 다시) ----
  function updateMeeting(text, key, patch, opt) {
    const o = opt || {};
    const lines = LT.splitLines(text), T = meetTable(lines), r = findRow(lines, T.t, key);
    const cur = objOf(r.cells), before = lines[r.line];
    let v, after;
    if (o.raw != null) { // 되돌리기: 이전 줄 글 그대로 (값 검사는 옛 값 허용)
      if (typeof o.raw !== 'string') throw err('값 형식 오류');
      const p = objOf(LT.cells(o.raw)); v = check(p, { time: p.time, text: p.text });
      after = sameRaw(o.raw, cellsOf(v)) || LT.rowText(cellsOf(v));
    } else {
      const p = patch || {};
      v = check({ date: p.date != null ? p.date : cur.date, time: p.time != null ? p.time : cur.time, text: p.text != null ? p.text : cur.text }, { time: cur.time, text: cur.text });
      after = LT.cells(before).length === 3 && cellsOf(v).every((x, i) => x === r.cells[i]) ? before : LT.rowText(cellsOf(v));
    }
    if (after === before) return { text, changed: false, op: 'update', line: r.line, meeting: v, prev: cur, section: T.name };
    lines[r.line] = after;
    return done(text, lines, { op: 'update', line: r.line, meeting: v, prev: cur, before, after, section: T.name });
  }
  // ---- 빼기: -> removed(값), removedText(원래 줄 글), before(바로 뒤 줄 글, 되돌리기 자리) ----
  function removeMeeting(text, key) {
    const lines = LT.splitLines(text), T = meetTable(lines), r = findRow(lines, T.t, key);
    const i = T.t.rows.indexOf(r), next = T.t.rows[i + 1], removedText = lines[r.line];
    lines.splice(r.line, 1);
    return done(text, lines, { op: 'remove', line: r.line, removed: objOf(r.cells), removedText, before: next ? sigOf(lines[next.line - 1]) : null, section: T.name });
  }

  // ---- 안전 검사 (메인이 쓰기 직전에): ## 약속 표 줄만 op만큼 바뀌었는지 ----
  //   섹션 밖·섹션 안 글 줄·표 머리·구분선은 한 글자도 같음 (표가 없던 섹션에 머리·구분선을 처음 넣는 것만 허용)
  //   add = 한 줄 생김 / remove = 한 줄 빠짐 / update = 같은 자리 한 줄만 바뀜. 생기거나 바뀐 줄은 칸 3개·날짜·시간·내용 검사
  function rowOk(l) {
    if (!/^\s*\|/.test(l) || /^\s*\|?\s*:?-{3,}/.test(l)) return false;
    const c = LT.cells(l); if (c.length !== 3) return false;
    return LT.isDate(c[0]) && okOld(c[1], TIME_MAX) && !!c[2] && okOld(c[2], OLD_MAX);
  }
  function onlyMeetingsChanged(oldText, newText, op) {
    try {
      const a = LT.splitLines(oldText), b = LT.splitLines(newText);
      const find = (L) => { const s = Md.sections(L).filter((x) => NAMES.includes(x.name)); return s.length === 1 ? s[0] : null; };
      const sa = find(a), sb = find(b); if (!sa || !sb || sa.name !== sb.name) return false;
      if (a.slice(0, sa.line).join('\n') !== b.slice(0, sb.line).join('\n')) return false;
      if (a.slice(sa.end).join('\n') !== b.slice(sb.end).join('\n')) return false;
      const ta = LT.tableOf(a, sa), tb = LT.tableOf(b, sb);
      if (!tb || tb.head.join('|') !== HEAD.join('|') || tb.sepLine == null) return false;
      const inT = (t, s, i) => t && s.line + 1 + i >= t.headLine && s.line + 1 + i < t.endLine;
      const prose = (L, s, t) => { const x = L.slice(s.start, s.end).filter((l, i) => !inT(t, s, i)); while (x.length && !x[x.length - 1].trim()) x.pop(); return x.join('\n'); };
      if (prose(a, sa, ta) !== prose(b, sb, tb)) return false;
      if (ta) { // 머리 그대로, 구분선 그대로(없었으면 새 구분선만)
        if (a[ta.headLine] !== b[tb.headLine]) return false;
        if (ta.sepLine != null ? a[ta.sepLine] !== b[tb.sepLine] : b[tb.sepLine] !== LT.sepText(3)) return false;
      } else if (b[tb.headLine] !== LT.rowText(HEAD) || b[tb.sepLine] !== LT.sepText(3) || op !== 'add') return false;
      const ra = ta ? ta.rows.map((r) => a[r.line]) : [], rb = tb.rows.map((r) => b[r.line]);
      const minus = (xs, i) => xs.slice(0, i).concat(xs.slice(i + 1)), eq = (x, y) => x.join('\n') === y.join('\n');
      if (op === 'add') { if (rb.length !== ra.length + 1) return false; for (let i = 0; i < rb.length; i++) if (eq(minus(rb, i), ra)) return rowOk(rb[i]); return false; }
      if (op === 'remove') { if (rb.length !== ra.length - 1) return false; for (let i = 0; i < ra.length; i++) if (eq(minus(ra, i), rb)) return true; return false; }
      if (op === 'update') {
        if (rb.length !== ra.length) return false;
        const d = ra.map((x, i) => (x === rb[i] ? -1 : i)).filter((i) => i >= 0);
        return d.length === 1 && rowOk(rb[d[0]]);
      }
      return false;
    } catch (e) { return false; }
  }

  const ME = { HEAD, NAMES, TEXT_MAX, TIME_MAX, checkDate, checkTime, checkText, check, normTime, minutes, meetTable, addMeeting, updateMeeting, removeMeeting, onlyMeetingsChanged, rowOk, sigOf };
  root.PHMeetingEdit = ME;
  if (typeof module !== 'undefined' && module.exports) module.exports = ME;
})(typeof window !== 'undefined' ? window : globalThis);
