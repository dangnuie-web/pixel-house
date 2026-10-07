// 대변 관찰 일지 (2026-10-04 비트, logs 브랜치). 그림·파일 접근 없음: 글을 받아 새 글을 돌려준다. 공통 규칙은 js/log_table.js
// 생활 기록 파일 ## 대변 표 (없으면 ## 버킷리스트 바로 앞에 만듦):
//   | 날짜 | 시각 | 형태 | 양g | 색 | 메모 |
//   날짜 = 기록 날짜(하루 경계 6시, 새벽 2시 기록은 전날), 시각 = HH:MM(실제 시계), 형태 = "1형"~"7형", 양g = 정수(비면 모름), 색 = 6칩 이름(비면 안 고름), 메모 = 여러 줄(안전 표시)
//   의학 판단 문구는 쓰지 않음. 색 붉은색·검정도 표시 없이 기록만 (지시서)
// 줄 고르기(고치기·지우기) = key { sig }: 화면이 읽은 그 줄의 글 그대로. 같은 글 줄이 여럿이면 마지막 줄 (어느 쪽을 지워도 파일 글은 같음)
// 처음 더할 때 생활습관 표에 "| 대변 | 기록 | 변기에서 기록 | - |" 한 줄 (없을 때만). 생활 습관 탭 기록 카드에 보이게
// 나중의 분석용: parse().rows (파일 순) -> byDate (날짜별) / entries (한 줄 = 한 번, 숫자 값)
(function (root) {
  'use strict';
  const LT = root.PHLogTable || (typeof require !== 'undefined' ? require('./log_table.js') : null);

  const SEC = '대변';
  const HEAD = ['날짜', '시각', '형태', '양g', '색', '메모'];
  const FORMS = [1, 2, 3, 4, 5, 6, 7];
  // 무늬 일지그림 v01 2장 (칩 테두리 #29262F 2px)
  const COLORS = [
    { name: '갈색', hex: '#8E5A2E' }, { name: '짙은 갈색', hex: '#4E3220' }, { name: '연갈색·노랑', hex: '#D8B05A' },
    { name: '초록', hex: '#6C8A35' }, { name: '검정', hex: '#1E1C1B' }, { name: '붉은색', hex: '#B23A32' },
  ];
  const COLOR_NAMES = COLORS.map((c) => c.name);
  const AMOUNT_MAX = 2000, MEMO_MAX = 1000;
  const HABIT = { name: '대변', target: '변기에서 기록' };

  // ---- 값 검사 ----
  function check(e) {
    if (!e || typeof e !== 'object') throw new Error('기록 형식 오류');
    if (!LT.isDate(e.date)) throw new Error('날짜 오류 (YYYY-MM-DD)');
    if (!LT.isTime(e.time)) throw new Error('시각 오류 (HH:MM)');
    const form = Number(e.form);
    if (!FORMS.includes(form)) throw new Error('형태를 골라 주세요');
    let amount = e.amount;
    if (amount === '' || amount == null) amount = null;
    else { if (typeof amount === 'string' && /^\d+$/.test(amount.trim())) amount = Number(amount.trim()); if (!Number.isInteger(amount) || amount < 0 || amount > AMOUNT_MAX) throw new Error('양 오류 (0~' + AMOUNT_MAX + 'g)'); }
    const color = e.color == null ? '' : e.color;
    if (color !== '' && !COLOR_NAMES.includes(color)) throw new Error('색 오류: ' + color);
    const memo = LT.multiline(e.memo, MEMO_MAX, '메모');
    return { date: e.date, time: e.time, form, amount, color, memo };
  }
  const cellsFor = (e) => [e.date, e.time, e.form + '형', e.amount == null ? '' : String(e.amount), e.color, LT.encode(e.memo)];
  const keyOf = (c) => (c[0] || '') + ' ' + (c[1] || '');

  // ---- 읽기 ----
  function rowOf(c, line, raw) {
    const f = /^([1-7])\s*형$/.exec(c[2] || ''), a = /^\d+$/.test(c[3] || '') ? Number(c[3]) : null;
    return { line, sig: String(raw).trim(), date: c[0] || '', time: c[1] || '', form: f ? Number(f[1]) : null, formText: c[2] || '', amount: a, color: c[4] || '', memo: LT.decode(c[5] || '') };
  }
  // 글 -> { rows: [...파일 순], hasSection, error }
  function parse(src) {
    const lines = Array.isArray(src) ? src : LT.splitLines(src);
    let sec;
    try { sec = LT.findSection(lines, SEC); } catch (e) { return { rows: [], error: String(e.message) }; }
    const t = LT.tableOf(lines, sec);
    if (t && t.head.join('|') !== HEAD.join('|')) return { rows: [], hasSection: true, error: '## 대변 표 머리가 달라요' };
    return { rows: t ? t.rows.map((r) => rowOf(r.cells, r.line, lines[r.line])) : [], hasSection: !!sec };
  }
  const sortKey = (r) => r.date + ' ' + (r.time || '99:99') + ' ' + String(r.line).padStart(6, '0');
  // 날짜별 { 'YYYY-MM-DD': [줄... 시각 순] }
  function byDate(rows) {
    const out = {};
    (rows || []).filter((r) => LT.isDate(r.date)).slice().sort((x, y) => (sortKey(x) < sortKey(y) ? -1 : 1)).forEach((r) => { (out[r.date] = out[r.date] || []).push(r); });
    return out;
  }
  // 분석용 한 줄 = 한 번: { date, time, form, amount, color, hasMemo }
  function entries(rows) { return (rows || []).filter((r) => LT.isDate(r.date)).map((r) => ({ date: r.date, time: r.time, form: r.form, amount: r.amount, color: r.color || null, hasMemo: !!r.memo })); }
  // 오늘 몇 번 + 마지막 기록 { today: n, last: 줄 | null }
  function summary(rows, today) {
    const ok = (rows || []).filter((r) => LT.isDate(r.date));
    const last = ok.slice().sort((x, y) => (sortKey(x) < sortKey(y) ? -1 : 1)).pop() || null;
    return { today: ok.filter((r) => r.date === today).length, last };
  }

  // ---- 쓰기 ----
  const out = (src, lines, extra) => Object.assign({ text: lines.join(LT.nlOf(src)), changed: true }, extra);
  function findRow(t, key) {
    const sig = key && typeof key.sig === 'string' ? key.sig.trim() : null;
    const hits = t && sig ? t.rows.filter((r) => LT.rowText(r.cells) === sig || r.cells.join('|') === LT.cells(sig).join('|')) : [];
    if (!hits.length) throw new Error('기록 없음 (파일이 바뀌었을 수 있음)');
    return hits[hits.length - 1];
  }
  function addPoop(src, entry) {
    const e = check(entry), lines = LT.splitLines(src);
    const habitLine = LT.ensureHabit(lines, HABIT);
    const row = LT.rowText(cellsFor(e)), p = LT.prepare(lines, SEC, HEAD);
    let line, created = false;
    if (!p) { line = LT.placeSection(lines, SEC, HEAD, row); created = true; }
    else { line = LT.sortedAt(p.t, keyOf(cellsFor(e)), keyOf); lines.splice(line, 0, row); }
    return out(src, lines, { op: 'add', line, created, habitAdded: habitLine >= 0, entry: e, after: row });
  }
  function updatePoop(src, key, patch) {
    const lines = LT.splitLines(src), p = LT.prepare(lines, SEC, HEAD); if (!p) throw new Error('## 대변 표 없음');
    const r = findRow(p.t, key), cur = rowOf(r.cells, r.line, lines[r.line]);
    const next = check(Object.assign({ date: cur.date, time: cur.time, form: cur.form, amount: cur.amount, color: cur.color, memo: cur.memo }, patch || {}));
    const after = LT.rowText(cellsFor(next));
    if (after === lines[r.line]) return { text: src, changed: false, op: 'update', line: r.line, entry: next };
    const before = lines[r.line]; lines[r.line] = after;
    return out(src, lines, { op: 'update', line: r.line, entry: next, before, after });
  }
  function removePoop(src, key) {
    const lines = LT.splitLines(src), p = LT.prepare(lines, SEC, HEAD); if (!p) throw new Error('## 대변 표 없음');
    const r = findRow(p.t, key), removed = rowOf(r.cells, r.line, lines[r.line]);
    lines.splice(r.line, 1);
    return out(src, lines, { op: 'remove', line: r.line, removed, before: removed.sig });
  }
  // 새 줄·바뀐 줄 검사: 칸 6개, 날짜·시각·형태 맞음, 양 0~2000, 색 이름, 메모 1000자 (되돌린 글 기준)
  function rowOk(c) {
    if (!LT.isDate(c[0]) || !LT.isTime(c[1]) || !/^[1-7]형$/.test(c[2])) return false;
    if (c[3] !== '' && !(/^\d+$/.test(c[3]) && Number(c[3]) <= AMOUNT_MAX)) return false;
    if (c[4] !== '' && !COLOR_NAMES.includes(c[4])) return false;
    const m = LT.decode(c[5]); return LT.len(m) <= MEMO_MAX && LT.encode(m) === c[5];
  }
  function onlyPoopChanged(oldText, newText, op) { return LT.checkChange(oldText, newText, { sec: SEC, head: HEAD, op, habit: HABIT, rowOk }); }

  const PL = { SEC, HEAD, FORMS, COLORS, COLOR_NAMES, AMOUNT_MAX, MEMO_MAX, HABIT, check, parse, byDate, entries, summary, addPoop, updatePoop, removePoop, onlyPoopChanged, rowOk,
    hexOf: (name) => { const c = COLORS.find((x) => x.name === name); return c ? c.hex : null; } };
  root.PHPoopLog = PL;
  if (typeof module !== 'undefined' && module.exports) module.exports = PL;
})(typeof window !== 'undefined' ? window : globalThis);
