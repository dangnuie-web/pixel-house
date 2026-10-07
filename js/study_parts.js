// 공부 단원 (2026-10-08 비트, 로드맵 3단계 "공부"). 그림·파일 접근 없음. 메인(electron/record_ipc.js)·화면(js/study_gantt.js, js/study_grass.js)·Node 시험이 같이 쓴다.
// 제작자 2026-10-08: 과목마다 시작일·끝일(기존 ## 공부 표 그대로), 과목 안에서 쪼개기(1단원, 1단원 복습 …),
//   막대는 끊겨도 됨, 막대 있음 = 공부함(계획이자 기록), "공부했어요·끝냈어요" 버튼 없음 -> 칸을 눌러 칠하고 다시 누르면 지움
// 새 섹션 하나 (기존 파서 js/life_md.js는 모르는 섹션을 건너뜀):
//   ## 공부 단원   | 과목 | 단원 | 한 날 |
//     과목 = ## 공부 표 이름, 단원 = 쪼갠 이름 (쪼개지 않은 과목은 "전체" 한 줄), 한 날 = 칠한 날 "2026-10-01~2026-10-03, 2026-10-05" (이어진 날은 ~로 묶음)
//   새로 만들 자리: ## 습관 기록 바로 앞 (없으면 ## 약속·## 버킷리스트 앞, 다 없으면 파일 끝)
// 과목 이름을 바꾸면 이 표의 과목 칸도 같이 바뀜 (electron/study_ipc.js). 과목을 보관·삭제해도 단원 줄은 남음 (되돌리면 다시 보임)
(function (root) {
  'use strict';
  const TS = root.PHTableSection || (typeof require !== 'undefined' ? require('./table_section.js') : null);
  const SPEC = { name: '공부 단원', head: ['과목', '단원', '한 날'], before: ['습관 기록', '약속', 'Meeting', '버킷리스트'] };
  const WHOLE = '전체', PART_MAX = 20, MAX_DAYS = 3000;
  // 과목 색 (무늬 기록기능디자인 v01 5-1: 추가한 순서대로 6색 돌려 씀). bg = 막대 바탕, deep = 짙은 쪽(잔디 3단)
  const COLORS = [
    { name: '잎', bg: '#8DB583', deep: '#5F8A5A' }, { name: '하늘', bg: '#6F8FB5', deep: '#4E6E96' }, { name: '귤', bg: '#E59A4F', deep: '#BC8456' },
    { name: '장미', bg: '#CF8E8E', deep: '#A85E5E' }, { name: '겨자', bg: '#E9C35C', deep: '#C79A3E' }, { name: '이끼', bg: '#6F8E79', deep: '#4F6954' },
  ];
  const colorOf = (i) => COLORS[((i % COLORS.length) + COLORS.length) % COLORS.length];

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function isDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number), x = new Date(y, m - 1, d);
    return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d;
  }
  function addDays(s, n) { const [y, m, d] = s.split('-').map(Number); return ymd(new Date(y, m - 1, d + n, 12)); }
  function diffDays(a, b) { const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000); }
  const bad = (code, msg) => TS.err(code, msg);

  // ---- 한 날 칸 ----
  // "2026-10-01~2026-10-03, 2026-10-05" -> ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'] (못 읽는 조각은 bad에)
  function parseDays(s) {
    const set = new Set(), badParts = [];
    String(s || '').split(/[,，]/).map((x) => x.trim()).filter(Boolean).forEach((p) => {
      const m = /^(\d{4}-\d{2}-\d{2})(?:\s*~\s*(\d{4}-\d{2}-\d{2}))?$/.exec(p);
      if (!m || !isDate(m[1]) || (m[2] && (!isDate(m[2]) || m[2] < m[1]))) { badParts.push(p); return; }
      if (!m[2]) { set.add(m[1]); return; }
      const n = diffDays(m[1], m[2]); if (n > MAX_DAYS) { badParts.push(p); return; }
      for (let i = 0; i <= n; i++) set.add(addDays(m[1], i));
    });
    return { days: [...set].sort(), bad: badParts };
  }
  // 날짜 목록 -> 이어진 날 묶음 [{ from, to }]
  function runs(days) {
    const d = [...new Set(days)].sort(), out = [];
    d.forEach((x) => { const r = out[out.length - 1]; if (r && addDays(r.to, 1) === x) r.to = x; else out.push({ from: x, to: x }); });
    return out;
  }
  function formatDays(days) { return runs(days).map((r) => (r.from === r.to ? r.from : r.from + '~' + r.to)).join(', '); }
  function toggleDay(daysText, date) {
    const P = parseDays(daysText); if (P.bad.length) throw bad('badDays', '한 날 칸을 못 읽음');
    const has = P.days.includes(date);
    return { text: formatDays(has ? P.days.filter((x) => x !== date) : P.days.concat([date])), on: !has };
  }

  // ---- 읽기 ----
  // -> { parts: [{ subject, part, days, bad, sig, line, review }], error }
  function parse(src) {
    const R = TS.read(src, SPEC);
    const parts = R.rows.map((r) => { const P = parseDays(r.cells['한 날']); return { subject: r.cells['과목'].trim(), part: r.cells['단원'].trim(), days: P.days, bad: P.bad, daysText: r.cells['한 날'].trim(), sig: r.raw, line: r.line, review: /복습/.test(r.cells['단원']) }; });
    return { parts, error: R.error || null, has: R.has };
  }
  const partsOf = (P, subject) => P.parts.filter((p) => p.subject === subject);
  // 한 과목의 날짜별 칠한 단원 수 (잔디 단계): { 'YYYY-MM-DD': [단원 이름...] }. logged = 옛 "이름 n시간" 기록 날(있으면 한 칸으로 셈)
  function dayMap(P, subject, logged) {
    const m = {};
    partsOf(P, subject).forEach((p) => p.days.forEach((d) => { (m[d] = m[d] || []).push(p.part); }));
    Object.keys(logged || {}).forEach((d) => { if (logged[d] > 0 && !m[d]) m[d] = ['기록']; });
    return m;
  }
  const level = (n) => (n <= 0 ? 0 : n >= 3 ? 3 : n);

  // ---- 쓰기 ----
  function checkPart(s) {
    if (typeof s !== 'string') throw bad('badPart', '형식 오류');
    const t = s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || Array.from(t).length > PART_MAX || /[|\\<>,]/.test(t)) throw bad('badPart', '이름 오류');
    return t;
  }
  const cells = (subject, part, daysText) => [TS.encode(subject), TS.encode(part), daysText];
  function addPart(src, subject, part, opt) {
    if (opt && opt.raw != null) return TS.addRow(src, SPEC, null, { before: opt.before, raw: opt.raw });
    const s = String(subject || '').trim(); if (!s) throw bad('badPart', '과목 없음');
    const n = checkPart(part);
    if (partsOf(parse(src), s).some((p) => p.part === n)) throw bad('dupPart', '같은 이름이 있음');
    return Object.assign(TS.addRow(src, SPEC, cells(s, n, '')), { subject: s, part: n });
  }
  function renamePart(src, sig, newName) {
    const p = parse(src).parts.find((x) => x.sig === String(sig).trim()); if (!p) throw bad('notFound', '줄 없음');
    const n = checkPart(newName);
    if (n !== p.part && partsOf(parse(src), p.subject).some((x) => x.part === n)) throw bad('dupPart', '같은 이름이 있음');
    return Object.assign(TS.updateRow(src, SPEC, sig, cells(p.subject, n, p.daysText)), { subject: p.subject, part: n, old: p.part });
  }
  function removePart(src, sig) { return TS.removeRow(src, SPEC, sig); }
  // 칸 칠하기·지우기. 단원 줄이 없으면(쪼개지 않은 과목의 "전체") 먼저 만듦 -> op 'add'
  function toggle(src, subject, part, date) {
    if (!isDate(date)) throw bad('badDate', '날짜 오류');
    const p = partsOf(parse(src), subject).find((x) => x.part === part);
    if (!p) {
      if (part !== WHOLE) throw bad('notFound', '단원 없음');
      return Object.assign(TS.addRow(src, SPEC, cells(subject, WHOLE, date)), { on: true, date, subject, part });
    }
    const t = toggleDay(p.daysText, date);
    return Object.assign(TS.updateRow(src, SPEC, p.sig, cells(p.subject, p.part, t.text)), { on: t.on, date, subject, part });
  }
  // 과목 이름 바꾸기 따라가기 (study_ipc가 ## 공부 표를 고친 뒤 부름). 바꿀 줄이 없으면 그대로
  function renameSubject(src, oldName, newName) {
    const lines = TS.splitLines(src); let n = 0;
    let loc; try { loc = TS.locate(lines, SPEC); } catch (e) { return { text: src, changed: false, n: 0 }; }
    if (!loc.t) return { text: src, changed: false, n: 0 };
    loc.t.rows.forEach((r) => { if (TS.decode(r.cells[0]) === oldName) { const c = r.cells.slice(0, 3); while (c.length < 3) c.push(''); c[0] = TS.encode(newName); lines[r.line] = TS.rowText(c); n++; } });
    return n ? { text: lines.join(TS.nlOf(src)), changed: true, n } : { text: src, changed: false, n: 0 };
  }
  function onlySubjectRenamed(a, b, oldName, newName) {
    try {
      const A = TS.splitLines(a), B = TS.splitLines(b); if (A.length !== B.length) return false;
      const la = TS.locate(A, SPEC), lb = TS.locate(B, SPEC); if (!la.t || !lb.t) return a === b;
      const rowsA = new Map(la.t.rows.map((r) => [r.line, r]));
      for (let i = 0; i < A.length; i++) {
        if (A[i] === B[i]) continue;
        const r = rowsA.get(i); if (!r || TS.decode(r.cells[0]) !== oldName) return false;
        const c = TS.splitRow(B[i]); if (TS.decode(c[0]) !== newName || c.slice(1).join('|') !== r.cells.slice(1).join('|')) return false;
      }
      return true;
    } catch (e) { return false; }
  }
  const okCells = (c) => !!c[0].trim() && (() => { try { return checkPart(c[1]) === c[1]; } catch (e) { return false; } })() && !parseDays(c[2]).bad.length;
  function onlyPartsChanged(oldText, newText, op) { return TS.onlyRowsChanged(oldText, newText, SPEC, op, okCells); }

  const SP = { SPEC, WHOLE, PART_MAX, COLORS, colorOf, isDate, addDays, diffDays, parseDays, runs, formatDays, toggleDay, parse, partsOf, dayMap, level, checkPart,
    addPart, renamePart, removePart, toggle, renameSubject, onlySubjectRenamed, onlyPartsChanged };
  root.PHStudyParts = SP;
  if (typeof module !== 'undefined' && module.exports) module.exports = SP;
})(typeof window !== 'undefined' ? window : globalThis);
