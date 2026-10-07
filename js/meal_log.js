// 식사 일지 (2026-10-04 비트, logs 브랜치). 그림·파일 접근 없음: 글을 받아 새 글을 돌려준다. 공통 규칙은 js/log_table.js
// 생활 기록 파일 ## 식사 표 = 두부 대화창이 쓰던 표를 넓힘:
//   새 머리 | 날짜 | 시각 | 끼니 | 메뉴 | 만족도 | 양% | 메모 |   (옛 머리 | 날짜 | 끼니 | 내용 |)
//   옛 머리 표에 처음 쓸 때 머리·구분선 두 줄만 새 모양으로 바꾸고, 옛 줄(칸 3개)은 그대로 둠. 읽을 때 칸 3개 줄 = 옛 줄(끼니·내용 -> 끼니·메뉴)
//   만족도 = 1~5(비면 안 고름), 양% = 25·50·75·100(비면 안 고름), 메뉴·메모 = 안전 표시(js/log_table.js encode)
//   날짜 = 기록 날짜(하루 경계 6시), 시각 = HH:MM
// 쓰는 곳 둘
//   - 식사 일지 창(js/log_modal.js): addMeal2 / updateMeal / removeMeal (줄 고르기 key { sig } = 읽은 그 줄의 글)
//   - 두부 대화창(js/life_log.js addMeal -> dialogMeal): 아침·점심·저녁은 그날 그 끼니 마지막 줄의 메뉴만 고침(없으면 더함), 간식은 늘 더함 (전과 같은 규칙)
// 식사 일지 창으로 처음 더할 때 생활습관 표에 "| 식사 | 기록 | 식탁에서 기록 | - |" 한 줄 (없을 때만)
// 나중의 분석용: parse().rows -> byDate (날짜별, 기록한 순서) / entries
(function (root) {
  'use strict';
  const LT = root.PHLogTable || (typeof require !== 'undefined' ? require('./log_table.js') : null);

  const SEC = '식사';
  const HEAD = ['날짜', '시각', '끼니', '메뉴', '만족도', '양%', '메모'];
  const OLD_HEAD = ['날짜', '끼니', '내용'];
  const KINDS = ['아침', '점심', '저녁', '간식'];
  const MULTI = '간식';
  const AMOUNTS = [25, 50, 75, 100];
  const MENU_MAX = 100, MEMO_MAX = 1000; // 메뉴 100자 = 대화창 글 제한(life_log.js MAX_LEN)과 같게
  const HABIT = { name: '식사', target: '식탁에서 기록' };
  // 끼니 기본값 = 시각대 (시 기준, from 이상 to 미만). 그 밖은 간식
  const BANDS = [{ kind: '아침', from: 5, to: 11 }, { kind: '점심', from: 11, to: 16 }, { kind: '저녁', from: 17, to: 22 }];
  function kindAt(time) { const h = Number(String(time || '').slice(0, 2)); const b = BANDS.find((x) => h >= x.from && h < x.to); return b ? b.kind : MULTI; }

  // ---- 값 검사 ----
  function check(e) {
    if (!e || typeof e !== 'object') throw new Error('기록 형식 오류');
    if (!LT.isDate(e.date)) throw new Error('날짜 오류 (YYYY-MM-DD)');
    const time = e.time == null ? '' : e.time;
    if (time !== '' && !LT.isTime(time)) throw new Error('시각 오류 (HH:MM)');
    if (!KINDS.includes(e.kind)) throw new Error('끼니 오류');
    const menu = LT.oneline(e.menu, MENU_MAX, '메뉴');
    if (!menu) throw new Error('메뉴가 비었음');
    let rating = e.rating; if (rating === '' || rating == null) rating = null; else { rating = Number(rating); if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('만족도 오류 (1~5)'); }
    let amount = e.amount; if (amount === '' || amount == null) amount = null; else { amount = Number(amount); if (!AMOUNTS.includes(amount)) throw new Error('먹은 양 오류'); }
    const memo = LT.multiline(e.memo, MEMO_MAX, '메모');
    return { date: e.date, time, kind: e.kind, menu, rating, amount, memo };
  }
  const cellsFor = (e) => [e.date, e.time, e.kind, LT.encode(e.menu), e.rating == null ? '' : String(e.rating), e.amount == null ? '' : String(e.amount), LT.encode(e.memo)];
  const keyOf = (c) => (c.length <= 3 ? (c[0] || '') + ' ' : (c[0] || '') + ' ' + (c[1] || ''));

  // ---- 읽기 ----
  // 줄 하나 -> { line, sig, date, time, kind, menu, rating, amount, memo, old }
  function rowOf(c, line, raw, oldTable) {
    const base = { line, sig: String(raw).trim() };
    if (oldTable || c.length <= 3) return Object.assign(base, { date: c[0] || '', time: '', kind: c[1] || '', menu: c[2] || '', rating: null, amount: null, memo: '', old: true });
    const r = /^[1-5]$/.test(c[4] || '') ? Number(c[4]) : null, a = AMOUNTS.includes(Number(c[5])) && /^\d+$/.test(c[5] || '') ? Number(c[5]) : null;
    return Object.assign(base, { date: c[0] || '', time: c[1] || '', kind: c[2] || '', menu: LT.decode(c[3] || ''), rating: r, amount: a, memo: LT.decode(c[6] || ''), old: false });
  }
  // 글 -> { rows: [...파일 순], hasSection, oldHead, error }
  function parse(src) {
    const lines = Array.isArray(src) ? src : LT.splitLines(src);
    let sec;
    try { sec = LT.findSection(lines, SEC); } catch (e) { return { rows: [], error: String(e.message) }; }
    const t = LT.tableOf(lines, sec); if (!t) return { rows: [], hasSection: !!sec };
    const oldHead = t.head.join('|') === OLD_HEAD.join('|');
    if (!oldHead && t.head.join('|') !== HEAD.join('|')) return { rows: [], hasSection: true, error: '## 식사 표 머리가 달라요' };
    return { rows: t.rows.map((r) => rowOf(r.cells, r.line, lines[r.line], oldHead)), hasSection: true, oldHead };
  }
  // 날짜별 { 'YYYY-MM-DD': [줄... 기록한 순서 = 파일 순] } (달력에 메뉴가 기록한 대로 쌓임)
  function byDate(rows) {
    const out = {};
    (rows || []).filter((r) => LT.isDate(r.date)).forEach((r) => { (out[r.date] = out[r.date] || []).push(r); });
    return out;
  }
  function entries(rows) { return (rows || []).filter((r) => LT.isDate(r.date)).map((r) => ({ date: r.date, time: r.time || null, kind: r.kind, menu: r.menu, rating: r.rating, amount: r.amount, hasMemo: !!r.memo, old: r.old })); }
  function summary(rows, today) {
    const ok = (rows || []).filter((r) => LT.isDate(r.date));
    const k = (r) => r.date + ' ' + (r.time || '00:00') + ' ' + String(r.line).padStart(6, '0');
    const last = ok.slice().sort((x, y) => (k(x) < k(y) ? -1 : 1)).pop() || null;
    return { today: ok.filter((r) => r.date === today).length, last };
  }

  // ---- 쓰기 ----
  const out = (src, lines, extra) => Object.assign({ text: lines.join(LT.nlOf(src)), changed: true }, extra);
  function table(lines) { return LT.prepare(lines, SEC, HEAD, [OLD_HEAD]); }
  function findRow(t, key) {
    const sig = key && typeof key.sig === 'string' ? key.sig.trim() : null;
    const hits = t && sig ? t.rows.filter((r) => r.cells.join('|') === LT.cells(sig).join('|')) : [];
    if (!hits.length) throw new Error('기록 없음 (파일이 바뀌었을 수 있음)');
    return hits[hits.length - 1];
  }
  function insertRow(lines, p, e) {
    const row = LT.rowText(cellsFor(e));
    if (!p) return { line: LT.placeSection(lines, SEC, HEAD, row), created: true, row };
    // 기록한 순서대로 쌓이게 표 끝에 (같은 날 메뉴 순서 = 적은 순서). 지난 날짜를 적으면 그 날짜 줄들 바로 뒤
    const later = p.t.rows.find((r) => LT.isDate(r.cells[0]) && r.cells[0] > e.date);
    const line = later ? later.line : p.t.endLine;
    lines.splice(line, 0, row); return { line, created: false, row };
  }
  function addMeal2(src, entry) {
    const e = check(entry), lines = LT.splitLines(src);
    const habitLine = LT.ensureHabit(lines, HABIT);
    const p = table(lines), r = insertRow(lines, p, e);
    return out(src, lines, { op: 'add', line: r.line, created: r.created, upgraded: !!(p && p.upgraded), habitAdded: habitLine >= 0, entry: e, after: r.row });
  }
  function current(lines, r) { return rowOf(r.cells, r.line, lines[r.line], false); }
  function updateMeal(src, key, patch) {
    const lines = LT.splitLines(src), p = table(lines); if (!p) throw new Error('## 식사 표 없음');
    const r = findRow(p.t, key), cur = current(lines, r);
    const next = check(Object.assign({ date: cur.date, time: cur.time, kind: cur.kind, menu: cur.menu, rating: cur.rating, amount: cur.amount, memo: cur.memo }, patch || {}));
    const after = LT.rowText(cellsFor(next));
    if (after === lines[r.line] && !p.upgraded) return { text: src, changed: false, op: 'update', line: r.line, entry: next };
    const before = lines[r.line]; lines[r.line] = after;
    return out(src, lines, { op: 'update', line: r.line, entry: next, before, after, upgraded: p.upgraded });
  }
  function removeMeal(src, key) {
    const lines = LT.splitLines(src), p = table(lines); if (!p) throw new Error('## 식사 표 없음');
    const r = findRow(p.t, key), removed = current(lines, r);
    lines.splice(r.line, 1);
    return out(src, lines, { op: 'remove', line: r.line, removed, before: removed.sig, upgraded: p.upgraded });
  }
  // 두부 대화창: { date, time('' 가능), kind, text(대화창이 다듬은 한 줄) }
  function dialogMeal(src, o) {
    if (!LT.isDate(o.date)) throw new Error('날짜 오류');
    if (!KINDS.includes(o.kind)) throw new Error('끼니 오류');
    const lines = LT.splitLines(src), p = table(lines);
    const hits = p && o.kind !== MULTI ? p.t.rows.filter((r) => { const x = current(lines, r); return x.date === o.date && x.kind === o.kind; }) : [];
    if (hits.length) { // 그 끼니 마지막 줄: 메뉴만 바꿈 (시각·만족도·양·메모는 그대로, 옛 줄은 새 모양으로)
      const r = hits[hits.length - 1], cur = current(lines, r);
      const next = check({ date: cur.date, time: cur.time, kind: cur.kind, menu: o.text, rating: cur.rating, amount: cur.amount, memo: cur.memo });
      const after = LT.rowText(cellsFor(next));
      if (after === lines[r.line] && !p.upgraded) return { text: src, changed: false, line: r.line };
      const before = lines[r.line]; lines[r.line] = after;
      return out(src, lines, { line: r.line, inserted: false, created: false, upgraded: p.upgraded, before, after });
    }
    const e = check({ date: o.date, time: o.time || '', kind: o.kind, menu: o.text, rating: null, amount: null, memo: '' });
    const r = insertRow(lines, p, e);
    return out(src, lines, { line: r.line, inserted: true, created: r.created, upgraded: !!(p && p.upgraded), before: null, after: r.row });
  }
  function rowOk(c) {
    if (!LT.isDate(c[0]) || !(c[1] === '' || LT.isTime(c[1])) || !KINDS.includes(c[2])) return false;
    const menu = LT.decode(c[3]); if (!menu.trim() || /\n/.test(menu) || LT.len(menu) > MENU_MAX || LT.encode(menu) !== c[3]) return false;
    if (c[4] !== '' && !/^[1-5]$/.test(c[4])) return false;
    if (c[5] !== '' && !AMOUNTS.map(String).includes(c[5])) return false;
    const m = LT.decode(c[6]); return LT.len(m) <= MEMO_MAX && LT.encode(m) === c[6];
  }
  // op: add / update / remove (식사 일지 창), upsert (대화창: 날짜 = 오늘, 끼니 그대로)
  function onlyMealChanged(oldText, newText, op, opt) {
    const o = opt || {};
    const kindOf = (c) => (c.length <= 3 ? c[1] : c[2]);
    return LT.checkChange(oldText, newText, { sec: SEC, head: HEAD, oldHeads: [OLD_HEAD], op, habit: o.dialog ? null : HABIT, rowOk, date: o.date || null,
      sameRow: o.dialog ? (a, b) => kindOf(a) === kindOf(b) && a[0] === b[0] : null });
  }

  const ML = { SEC, HEAD, OLD_HEAD, KINDS, MULTI, AMOUNTS, MENU_MAX, MEMO_MAX, HABIT, BANDS, kindAt, check, parse, byDate, entries, summary, addMeal2, updateMeal, removeMeal, dialogMeal, onlyMealChanged, rowOk };
  root.PHMealLog = ML;
  if (typeof module !== 'undefined' && module.exports) module.exports = ML;
})(typeof window !== 'undefined' ? window : globalThis);
