// 생활 습관 체크 (MVP E·I + 기록 습관 양 적기). 그림·파일 접근 없음: 글(text)을 받아 새 글을 돌려준다.
// Electron 메인(electron/life_check_ipc.js)과 화면(life.js), Node 시험(tests/test_check.js)이 같이 쓴다.
//   E 주 N회 (주기 "주 N회"인 습관): 오늘 습관 기록 줄에 "요가"를 더하거나 뺌. 주는 월요일 시작. 연속 기록 숫자·못 채운 표시 없음
//   기록 습관 양 (종류 "기록", 기준 = 단위 "쪽"·"장"): 오늘 줄에 "독서 20쪽". 이미 있으면 더하기(add) 또는 바꾸기(set)
//   I 안전장치 주간 확인: ## 안전장치 확인 표(주 시작일 | 항목 | 결과). "놓침"인 항목은 그 주부터 2주 더(PROMOTE_DAYS) "오늘" 카드에 올라옴
// 쓰기 원칙은 물컵(life_write.js)과 같다: 습관 기록 표 오늘 줄 하나만 바꾸거나 한 줄 더함 / 안전장치 확인 표 한 줄만. 메인이 쓰기 직전에 다시 검사한다.
(function (root) {
  'use strict';
  const Md = root.PHLifeMd || (typeof require !== 'undefined' ? require('./life_md.js') : null);
  const LW = root.PHLifeWrite || (typeof require !== 'undefined' ? require('./life_write.js') : null);
  const LL = root.PHLifeLog || (typeof require !== 'undefined' ? require('./life_log.js') : null);

  const KIND = { goal: '목표', safety: '안전장치', log: '기록' }; // 파일의 종류 이름
  const RESULTS = { good: '잘 챙김', missed: '놓침' };            // 파일에 적는 결과 글자 (화면 버튼은 "잘 챙겼어 / 놓쳤어")
  const PROMOTE_DAYS = 21; // "놓침"을 고른 주의 월요일부터 21일 = 그 주 + 다음 2주 동안 "오늘" 카드에 (그 뒤 자동으로 안전장치로 돌아감)
  const MAX_AMOUNT = 9999;  // 한 번에 적는 양 (쪽·장) 1 ~ 9999, 정수

  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  // "주 2회" -> 2 (아니면 0)
  function weeklyOf(cycle) { const m = /주\s*(\d+)\s*회/.exec(String(cycle || '')); return m ? Number(m[1]) : 0; }
  // 기록 습관 단위: 기준 칸 "쪽" / "장" (숫자·공백·표 글자 없는 짧은 글). 아니면 ''
  function unitOf(target) { const t = String(target || '').trim(); return /^[^\d\s|,，/\-–—]{1,4}$/.test(t) ? t : ''; }

  // ---- 읽기 ----
  // 이번 주(월요일 시작) 이 습관을 한 날 수 + 오늘 했는지. records = Md.parse(...).records, today = "YYYY-MM-DD"(기록 날짜)
  function weekCount(records, habit, today) {
    const from = Md.dateOf(Md.weekStart(today)), to = Md.dateOf(Md.addDays(Md.weekStart(today), 7)), t = Md.dateOf(today);
    const days = new Set(); let todayDone = false;
    (records || []).forEach((r) => {
      const d = Md.dateOf(r.date); if (d == null || d < from || d >= to) return;
      if (!r.items.some((it) => it.name === habit)) return;
      days.add(d); if (d === t) todayDone = true;
    });
    return { count: days.size, todayDone, week: Md.weekStart(today) };
  }
  // 오늘 줄에 적힌 양 (예: 독서 20쪽 -> 20). 없으면 null
  function todayAmount(records, habit, unit, today) {
    const t = Md.dateOf(today); let v = null;
    (records || []).forEach((r) => { if (Md.dateOf(r.date) !== t) return; r.items.forEach((it) => { if (it.name === habit && it.value != null && !it.of && it.unit === unit) v = (v || 0) + it.value; }); });
    return v;
  }
  // 안전장치 확인 표 줄 [{ line, week, item, result }]
  function safetyRows(text) { return LL.parse(text).safety; }
  // 이번 주에 고른 결과 { 항목: 'good' | 'missed' }
  function weekResults(rows, week) {
    const out = {}; const back = { [RESULTS.good]: 'good', [RESULTS.missed]: 'missed' };
    (rows || []).forEach((r) => { if (r.week === week && back[r.result]) out[r.item] = back[r.result]; });
    return out;
  }
  // "오늘" 카드로 올라온 안전장치: [{ name, week, until(마지막 날 "YYYY-MM-DD") }]. 같은 항목이 여러 번이면 가장 늦게 끝나는 것
  function promoted(habitRows, rows, today) {
    const t = Md.dateOf(today), names = new Set((habitRows || []).filter((r) => r.kind === KIND.safety).map((r) => r.name)), out = new Map();
    (rows || []).forEach((r) => {
      if (r.result !== RESULTS.missed || !names.has(r.item) || !isDate(r.week)) return;
      const from = Md.dateOf(r.week), end = Md.dateOf(Md.addDays(r.week, PROMOTE_DAYS));
      if (t < from || t >= end) return;
      const until = Md.addDays(r.week, PROMOTE_DAYS - 1), cur = out.get(r.item);
      if (!cur || until > cur.until) out.set(r.item, { name: r.item, week: r.week, until });
    });
    return [...out.values()];
  }

  // ---- 습관 기록 표 오늘 줄 고치기 (공통) ----
  // 칸 글 "물 5/6, 요가" -> 항목 글자 목록. 구분자(쉼표+공백)는 원래 모양 그대로 둠
  function splitCell(core) {
    const parts = String(core).split(/(\s*[,，]\s*)/);
    const items = [], seps = [];
    parts.forEach((p, i) => (i % 2 ? seps : items).push(p));
    return { items, seps };
  }
  function joinCell(c) { let s = ''; c.items.forEach((it, i) => { s += it; if (i < c.seps.length) s += c.seps[i]; }); return s; }
  function removeItems(core, pred) {
    const c = splitCell(core);
    for (let i = c.items.length - 1; i >= 0; i--) {
      if (!pred(c.items[i].trim())) continue;
      c.items.splice(i, 1);
      if (c.seps.length) c.seps.splice(i > 0 ? i - 1 : 0, 1); // 앞 구분자(첫 항목이면 뒤 구분자)를 같이 뺌
    }
    return joinCell(c).trim();
  }
  const appendItem = (core, item) => { const t = String(core).replace(/\s+$/, ''); return t ? `${t}, ${item}` : item; };
  const nameOf = (t) => Md.recordItems(t)[0] ? Md.recordItems(t)[0].name : t;

  // date 줄의 "한 습관" 칸을 fn(옛 칸 글) -> 새 칸 글로. 줄이 없으면 insert = true일 때만 fn('')로 새 줄
  //   -> { text, changed, line, inserted, before, after }
  function editRecordCell(text, date, fn, insert) {
    if (!isDate(date)) throw new Error('날짜 오류');
    const nl = /\r\n/.test(text) ? '\r\n' : '\n';
    const lines = String(text).split(/\r?\n/);
    const T = LW.recordsTable(lines); if (!T) throw new Error('습관 기록 표 없음');
    const hit = T.rows.find((r) => Md.dateOf(r.date) === Md.dateOf(date));
    if (hit) {
      const m = /^(\s*\|[^|]*\|)([^|]*)(\|.*)$/.exec(lines[hit.line]); if (!m) throw new Error('줄 모양 오류');
      const lead = /^\s*/.exec(m[2])[0], trail = /\s*$/.exec(m[2])[0];
      const core = m[2].slice(lead.length, m[2].length - trail.length), next = fn(core);
      if (next === core) return { text, changed: false, line: hit.line, cell: core };
      const before = lines[hit.line], after = m[1] + (lead || ' ') + next + (trail || ' ') + m[3];
      lines[hit.line] = after;
      return { text: lines.join(nl), changed: true, line: hit.line, inserted: false, before, after, cell: next };
    }
    if (!insert) return { text, changed: false, line: null, cell: '' };
    const cell = fn(''); if (!cell) return { text, changed: false, line: null, cell: '' };
    const row = `| ${date} | ${cell} |`;
    const at = LW.order(T.rows) === 'desc' ? (T.sepLine != null ? T.sepLine + 1 : T.headLine + 1) : T.endLine;
    lines.splice(at, 0, row);
    return { text: lines.join(nl), changed: true, line: at, inserted: true, before: null, after: row, cell };
  }

  // E: 오늘 이 습관을 했음/안 했음 뒤집기 (했으면 오늘 칸에서 빼고, 안 했으면 끝에 더함). -> { ...edit, done(바뀐 뒤 오늘 했는지) }
  //   빼기는 오늘 줄만 (지난 날은 안 건드림). 칸이 비어도 줄은 남김(줄 삭제 없음)
  function toggleWeekly(text, o) {
    const habit = String(o.habit || '');
    if (!habit || /[|,，]/.test(habit)) throw new Error('습관 이름 오류');
    let done = null;
    const r = editRecordCell(text, o.date, (core) => {
      const has = splitCell(core).items.some((it) => it.trim() && nameOf(it.trim()) === habit);
      done = !has;
      return has ? removeItems(core, (it) => nameOf(it) === habit) : appendItem(core, habit);
    }, true);
    return Object.assign(r, { done });
  }

  // 기록 습관 양 적기. mode 'add' = 더하기, 'set' = 바꾸기 (오늘 적힌 양이 없으면 둘 다 새로 적기). -> { ...edit, value(바뀐 뒤 양), prev(옛 양 또는 null) }
  function addAmount(text, o) {
    const habit = String(o.habit || ''), unit = String(o.unit || ''), n = o.value;
    if (!habit || /[|,，]/.test(habit)) throw new Error('습관 이름 오류');
    if (!unitOf(unit)) throw new Error('단위 오류');
    if (!Number.isInteger(n) || n < 1 || n > MAX_AMOUNT) throw new Error('양 오류 (1~' + MAX_AMOUNT + ')');
    if (o.mode !== 'add' && o.mode !== 'set') throw new Error('방식 오류');
    let prev = null, value = n;
    const mine = (t) => { const it = Md.recordItems(t)[0]; return it && it.name === habit && it.value != null && !it.of && it.unit === unit; };
    const r = editRecordCell(text, o.date, (core) => {
      const c = splitCell(core), i = c.items.findIndex((it) => mine(it.trim()));
      if (i < 0) return appendItem(core, `${habit} ${n}${unit}`);
      prev = Md.recordItems(c.items[i].trim())[0].value;
      value = o.mode === 'add' ? prev + n : n;
      if (!Number.isInteger(value) || value > MAX_AMOUNT * 10) throw new Error('양 오류');
      const lead = /^\s*/.exec(c.items[i])[0], trail = /\s*$/.exec(c.items[i])[0];
      c.items[i] = lead + `${habit} ${value}${unit}` + trail;
      return joinCell(c);
    }, true);
    return Object.assign(r, { value, prev });
  }

  // I: 안전장치 확인 한 줄 (그 주·그 항목 줄이 있으면 결과만 바꿈). result = 'good' | 'missed'
  function setSafetyCheck(text, o) {
    if (!isDate(o.week) || Md.weekStart(o.week) !== o.week) throw new Error('주 시작일 오류 (월요일)');
    const item = String(o.item || ''); if (!item || /[|]/.test(item)) throw new Error('항목 오류');
    if (!RESULTS[o.result]) throw new Error('결과 오류');
    return LL.upsert(text, 'safety', [o.week, item, RESULTS[o.result]], (c) => c[0] === o.week && c[1] === item);
  }

  const C = { KIND, RESULTS, PROMOTE_DAYS, MAX_AMOUNT, weeklyOf, unitOf, weekCount, todayAmount, safetyRows, weekResults, promoted,
    splitCell, removeItems, editRecordCell, toggleWeekly, addAmount, setSafetyCheck };
  root.PHLifeCheck = C;
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
