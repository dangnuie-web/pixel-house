// 습관 편집·공부 완전 삭제 (2026-10-04 비트, 제작자 "메뉴 내가 추가하거나 없앨 수 있게"). 그림·파일 접근 없음: 글(text)을 받아 새 글을 돌려준다.
// Electron 메인(electron/habit_ipc.js)과 화면(js/habit_edit_ui.js), Node 시험(tests/test_habit_edit.js)이 같이 쓴다.
//   ## 생활습관 표 | 습관 | 종류 | 기준 | 주기 |  한 줄 더하기(addHabit)·고치기(updateHabit)·빼기(removeHabit)·같은 종류 안에서 위아래(moveHabit)
//   ## 공부 표 한 줄 완전히 빼기(removeStudy) / 되돌리기(unremoveStudy, 같은 자리)
//   종류: 목표(화면 "오늘") / 안전장치 / 기록 / 살림. 종류는 고치기에서 안 바꿈
//   주기: 목표·살림 = 매일 n회 / 주 n회 / 월 n회, 안전장치 = 매일 / 주 n회, 기록 = "-" (기준 = 단위 "쪽", "장")
//   물(settings.WATER_HABIT)은 정수기·물컵과 이어져 있어서 이름·기준·주기·삭제는 막음 (순서만 바꿀 수 있음)
//   살림 줄이 파일에 하나도 없으면(화면에만 기본 5개) 처음 편집할 때 기본 줄을 먼저 표에 더함 (household.js ensureChores와 같음)
// 쓰기 원칙: 정해진 표 안 줄만. 다른 줄은 한 글자도 안 바뀐다. 메인이 쓰기 직전에 onlyHabitsChanged / onlyStudyRemoved로 다시 확인한다.
// 이름을 바꾸면 지난 기록(## 습관 기록 항목, ## 안전장치 확인 항목)의 그 이름도 같이 바꾼다 (2026-10-04 제작자 결정, js/record_rename.js).
//   지우면 지난 기록 글자는 그대로 둔다 (옛 기록 줄의 "러닝"처럼). 지난 기록에만 남은 이름으로는 바꾸지도 새로 더하지도 않는다
//   (code 'usedName' + lastDate 마지막 기록 날: 섞이면 되돌릴 수 없어서. 2026-10-04 제작자 결정으로 더하기도 막음, 바로 앞 삭제의 되돌리기만 허용)
// 일지 기능 습관(대변·식사·독서, js/features.js fnHabit): 이름이 변기·식탁 일지·책꽂이와 이어진 열쇠라 고치기는 막음(code 'locked', 순서·삭제만).
//   더하기는 기록 카드 추가 목록에서: 종류 = 기록, 기준 = 정해진 글("변기에서 기록"), 주기 "-" (일지 첫 저장 때 메인이 더하는 줄과 같은 글자)
(function (root) {
  'use strict';
  const req = (n) => (typeof require !== 'undefined' ? require(n) : null);
  const Md = root.PHLifeMd || req('./life_md.js');
  const LC = root.PHLifeCheck || req('./life_check.js');
  const HC = root.PHHabitCycle || req('./habit_cycle.js');
  const HH = root.PHHousehold || req('./household.js');
  const H = root.PH_HOUSEHOLD || req('./data/household.js');
  const SW = root.PHStudyWrite || req('./study_write.js');
  const RR = root.PHRecordRename || req('./record_rename.js');
  const FX = root.PHFeatures || req('./features.js');

  const KIND = { goal: '목표', safety: '안전장치', log: '기록', house: '살림' };
  const KINDS = Object.values(KIND);
  const HEAD = ['습관', '종류', '기준', '주기'];
  const NAME_MAX = 20, TARGET_MAX = 30;
  const NO_CYCLE = '-';
  // 기록 카드 + 추가 "횟수·양 기록" 기준 (2026-10-08 제작자 피드백 4: 단위 입력 없음). "회" = 생활 습관 카드에서 "+ n회"로 적힘 (js/life_check.js unitOf를 그대로 통과)
  const LOG_UNIT = '회';
  const water = () => (root.PH_SETTINGS && root.PH_SETTINGS.WATER_HABIT) || '물';
  const fnOf = (name) => (FX ? FX.byHabit(name) : null); // 일지 기능 습관이면 그 기능
  const fnRow = (f) => [f.habit, '기록', f.target, NO_CYCLE];

  const err = (msg, code) => Object.assign(new Error(msg), code ? { code } : {});
  const splitLines = (t) => String(t).split(/\r?\n/);
  const nlOf = (t) => (/\r\n/.test(t) ? '\r\n' : '\n');
  const cellsOf = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const isRow = (l) => /^\s*\|/.test(l);
  const isSep = (l) => /^\s*\|?\s*:?-{3,}/.test(l);
  const rowText = (c) => '| ' + c.join(' | ') + ' |';
  const len = (s) => Array.from(s).length;

  // ---- 값 검사: 표를 깨는 글자는 바꾸지 않고 막음 (code 'badName' / 'badTarget' / 'badCycle') ----
  const TABLE_BAD = /[|｜\u0000-\u001f\u007f\u2028\u2029]/;
  // 이름: 습관 기록 칸에 "이름", "이름 2/3", "이름 20쪽"으로 들어가므로 쉼표·빗금도 막고, 숫자로 시작하거나 " 숫자"가 들어간 이름도 막음(양으로 읽힘)
  const NAME_BAD = /[|｜,，/\\`*#\[\]<>]/;
  function checkName(s) {
    if (typeof s !== 'string') throw err('이름 형식 오류', 'badName');
    if (TABLE_BAD.test(s)) throw err('이름에 표를 깨는 글자', 'badName');
    const t = s.replace(/\s+/g, ' ').trim();
    if (!t) throw err('이름이 비었음', 'badName');
    if (NAME_BAD.test(t)) throw err('이름에 쓸 수 없는 글자 (| , / \\ ` * # [ ] < >)', 'badName');
    if (/^\d/.test(t) || /\s\d/.test(t)) throw err('이름에 숫자를 띄어 쓸 수 없음 (양으로 읽혀요)', 'badName');
    if (/^-+$/.test(t)) throw err('이름 모양 오류', 'badName');
    if (len(t) > NAME_MAX) throw err('이름이 너무 김 (' + NAME_MAX + '자까지)', 'badName');
    return t;
  }
  // 기준: 짧은 글 (빈 글 = "-"). 기록 습관은 단위(쪽, 장: 숫자·띄어쓰기 없는 1~4글자)
  function checkTarget(s, kind) {
    if (s != null && typeof s !== 'string') throw err('기준 형식 오류', 'badTarget');
    if (TABLE_BAD.test(s || '')) throw err('기준에 표를 깨는 글자', 'badTarget');
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (kind === KIND.log) { if (!LC.unitOf(t)) throw err('단위는 숫자 없이 4글자까지 (예: 쪽, 장)', 'badTarget'); return t; }
    if (len(t) > TARGET_MAX) throw err('기준이 너무 김 (' + TARGET_MAX + '자까지)', 'badTarget');
    return t || '-';
  }
  // 주기: { per, n } 또는 글. 종류마다 고를 수 있는 것만
  function checkCycle(c, kind) {
    if (kind === KIND.log) return NO_CYCLE;
    let cy = null;
    if (c && typeof c === 'object' && !Array.isArray(c)) { try { cy = HC.parseCycle(HC.formatCycle(c.per, c.n)); } catch (e) { cy = null; } }
    else if (typeof c === 'string') cy = HC.parseCycle(c);
    if (!cy) throw err('주기 오류', 'badCycle');
    if (kind === KIND.safety && cy.per === 'month') throw err('안전장치는 매일 또는 주 n회', 'badCycle');
    if (kind === KIND.safety && cy.per === 'day' && cy.n !== 1) throw err('안전장치는 매일 또는 주 n회', 'badCycle');
    return HC.formatCycle(cy.per, cy.n);
  }
  function checkKind(k) { if (!KINDS.includes(k)) throw err('종류 오류', 'badKind'); return k; }

  // ---- 표 찾기 ----
  function habitsTable(lines) {
    const secs = Md.sections(lines).filter((s) => s.name === Md.NAMES.habits);
    if (!secs.length) throw err('## 생활습관 섹션 없음');
    if (secs.length > 1) throw err('## 생활습관 섹션이 둘이라 멈춤');
    const sec = secs[0], t = Md.table(lines, sec); if (!t) throw err('## 생활습관 표 없음');
    if (t.head.join('|') !== HEAD.join('|')) throw err('## 생활습관 표 머리가 달라서 멈춤');
    let sep = t.line + 1; if (!(sep < sec.end && isSep(lines[sep]))) sep = null;
    let end = (sep == null ? t.line : sep) + 1;
    while (end < sec.end && isRow(lines[end])) end++;
    const rows = []; for (let i = (sep == null ? t.line : sep) + 1; i < end; i++) if (!isSep(lines[i])) rows.push({ line: i, cells: cellsOf(lines[i]) });
    return { sec, headLine: t.line, sepLine: sep, rows, endLine: end };
  }
  const nameOf = (r) => r.cells[0] || '';
  function findRow(T, name) {
    const hits = T.rows.filter((r) => nameOf(r) === name);
    if (!hits.length) throw err('습관 없음: ' + name, 'notFound');
    if (hits.length > 1) throw err('같은 이름이 둘이라 멈춤: ' + name, 'dupName');
    return hits[0];
  }
  function studyNames(text) { try { const p = SW.parse(text); return p.study.concat(p.archive).map((r) => r.name); } catch (e) { return []; } }
  // 이름이 비었는지: 습관 표(except 빼고) + 공부 이름 (습관 기록 칸에서 헷갈리지 않게)
  function nameFree(text, T, name, except) {
    if (T.rows.some((r) => nameOf(r) === name && nameOf(r) !== except)) throw err('같은 이름의 습관이 이미 있음: ' + name, 'dupName');
    if (studyNames(text).includes(name)) throw err('공부 이름과 같아서 안 됨: ' + name, 'dupName');
  }
  // 살림 줄이 하나도 없으면 기본 줄을 먼저 더함 (화면에만 보이던 기본 5개를 파일로)
  function withChores(text, kind) {
    if (kind !== KIND.house) return { text, choresAdded: false };
    const r = HH.ensureChores(text);
    return { text: r.text, choresAdded: !!r.changed };
  }
  // 고칠 줄 찾기. 화면에만 있는 살림 기본 줄(파일에 살림 줄이 하나도 없을 때)이면 기본 줄을 먼저 더하고 찾음
  //   -> { text(기본 줄 더한 뒤), lines, T, row, choresAdded }
  function locate(text, name) {
    let lines = splitLines(text), T = habitsTable(lines);
    if (!T.rows.some((r) => nameOf(r) === name) && H.CHORES.some((c) => c.name === name) && !T.rows.some((r) => r.cells[1] === KIND.house)) {
      const b = withChores(text, KIND.house); lines = splitLines(b.text); T = habitsTable(lines);
      return { text: b.text, lines, T, row: findRow(T, name), choresAdded: b.choresAdded };
    }
    const row = findRow(T, name);
    const b = withChores(text, row.cells[1]);
    if (b.choresAdded) { lines = splitLines(b.text); T = habitsTable(lines); return { text: b.text, lines, T, row: findRow(T, name), choresAdded: true }; }
    return { text, lines, T, row, choresAdded: false };
  }
  // 되돌리기 때 지운 줄 글자 그대로(띄어쓰기까지) 쓰기: raw의 칸이 검사한 값과 똑같을 때만. 아니면 새로 만든 줄
  function sameRaw(raw, cells) {
    if (typeof raw !== 'string' || /[\r\n]/.test(raw) || !isRow(raw) || isSep(raw)) return null;
    const c = cellsOf(raw); return c.length === cells.length && c.every((x, i) => x === cells[i]) ? raw : null;
  }
  const done = (src, lines, extra) => Object.assign({ text: lines.join(nlOf(src)), changed: true }, extra);
  const rowObj = (c) => ({ name: c[0] || '', kind: c[1] || '', target: c[2] || '', cycle: c[3] || '' });

  // ---- 더하기: o = { kind, name, target, cycle({per,n} 또는 글), before(이 이름 앞에, 되돌리기용) } ----
  //   자리: before가 같은 종류 줄이면 그 앞, 아니면 같은 종류 마지막 줄 다음, 같은 종류가 없으면 표 끝
  function addHabit(text, o) {
    o = o || {};
    const kind = checkKind(o.kind), name = checkName(o.name), fn = fnOf(name);
    if (fn && kind !== KIND.log) throw err('일지 기능 이름이라 기록 카드에서만 더할 수 있음: ' + name, 'dupName');
    const target = fn ? fn.target : checkTarget(o.target, kind), cycle = fn ? NO_CYCLE : checkCycle(o.cycle, kind);
    const base = withChores(text, kind), lines = splitLines(base.text), T = habitsTable(lines);
    nameFree(base.text, T, name);
    // 지난 기록에만 남은 이름(지운 습관)으로 새로 더하기도 막음 (제작자 결정 2026-10-04). 삭제 되돌리기(before 자리 또는 raw 원래 글자를 줌)만 그대로 허용
    const undo = o.before !== undefined || o.raw != null;
    if (!undo && !fn && RR.usedInRecords(base.text, name)) throw RR.usedErr(base.text, name, 'habit');
    const same = T.rows.filter((r) => r.cells[1] === kind);
    const bef = o.before != null ? same.find((r) => nameOf(r) === o.before) : null;
    const at = bef ? bef.line : same.length ? same[same.length - 1].line + 1 : T.endLine;
    const row = sameRaw(o.raw, [name, kind, target, cycle]) || rowText([name, kind, target, cycle]);
    lines.splice(at, 0, row);
    return done(text, lines, { op: 'add', line: at, name, kind, row: rowObj([name, kind, target, cycle]), after: row, choresAdded: base.choresAdded });
  }
  // ---- 고치기: patch = { newName, target, cycle } (없는 값 = 그대로). 종류는 그대로 ----
  function updateHabit(text, name, patch) {
    const p = patch || {};
    if (typeof name !== 'string') throw err('이름 형식 오류', 'badName');
    if (name === water()) throw err('물은 정수기와 이어져 있어서 고칠 수 없음 (순서만)', 'locked');
    if (fnOf(name)) throw err(name + '은(는) 일지와 이어진 이름이라 고칠 수 없음 (순서·삭제만)', 'locked');
    const base = locate(text, name), lines = base.lines, T = base.T, row = base.row, kind = row.cells[1];
    if (!KINDS.includes(kind)) throw err('모르는 종류라 고칠 수 없음: ' + kind, 'badKind');
    const c = row.cells.slice(0, 4); while (c.length < 4) c.push('');
    const next = c.slice();
    if (p.newName != null) { next[0] = checkName(p.newName); if (next[0] !== c[0]) { nameFree(base.text, T, next[0], c[0]); if (fnOf(next[0])) throw err('일지 기능 이름으로는 바꿀 수 없음: ' + next[0], 'dupName'); } }
    if (p.target != null) next[2] = checkTarget(p.target, kind);
    if (p.cycle != null) next[3] = checkCycle(p.cycle, kind);
    if (next.join('|') === c.join('|') && row.cells.length === 4 && !base.choresAdded) return { text, changed: false, op: 'update', line: row.line, name: next[0], kind };
    const renamed = next[0] !== c[0];
    if (renamed && RR.usedInRecords(base.text, next[0])) throw RR.usedErr(base.text, next[0], 'habit');
    const before = lines[row.line], after = rowText(next);
    lines[row.line] = after;
    // 1단계 = 생활습관 표 한 줄(mid), 2단계 = 지난 기록 이름 (메인이 단계마다 따로 검사)
    const mid = lines.join(nlOf(text)), rn = renamed ? RR.renameInRecords(mid, c[0], next[0]) : { text: mid, changed: false, records: 0, items: 0, safety: 0 };
    return { text: rn.text, changed: true, mid, op: 'update', line: row.line, name: next[0], oldName: c[0], kind, row: rowObj(next), prev: rowObj(c), before, after, choresAdded: base.choresAdded,
      renamedRecords: { records: rn.records, items: rn.items, safety: rn.safety } };
  }
  // ---- 빼기: -> { removed: { name, kind, target, cycle }, before(바로 뒤 같은 종류 줄 이름, 되돌리기 자리) } ----
  //   살림은 마지막 한 줄은 못 뺌 (다 빼면 기본 5개가 다시 화면에 나와서): code 'lastChore'
  function removeHabit(text, name) {
    if (typeof name !== 'string') throw err('이름 형식 오류', 'badName');
    if (name === water()) throw err('물은 정수기와 이어져 있어서 지울 수 없음', 'locked');
    const base = locate(text, name), lines = base.lines, T = base.T, row = base.row, kind = row.cells[1];
    const same = T.rows.filter((r) => r.cells[1] === kind);
    if (kind === KIND.house && same.length <= 1) throw err('살림 습관은 하나는 남겨 두어야 함', 'lastChore');
    const i = same.indexOf(row), next = same[i + 1];
    const c = row.cells.slice(0, 4); while (c.length < 4) c.push('');
    const before = lines[row.line];
    lines.splice(row.line, 1);
    return done(text, lines, { op: 'remove', line: row.line, name, kind, removed: rowObj(c), before: next ? nameOf(next) : null, removedText: before, choresAdded: base.choresAdded });
  }
  // ---- 순서: dir -1 = 위로, +1 = 아래로. 같은 종류 바로 옆 줄과 자리 바꿈 (끝이면 그대로) ----
  function moveHabit(text, name, dir) {
    if (dir !== -1 && dir !== 1) throw err('방향 오류');
    if (typeof name !== 'string') throw err('이름 형식 오류', 'badName');
    const base = locate(text, name), lines = base.lines, T = base.T, row = base.row, kind = row.cells[1];
    const same = T.rows.filter((r) => r.cells[1] === kind), i = same.indexOf(row), other = same[i + dir];
    if (!other) return base.choresAdded ? done(text, lines, { op: 'move', name, kind, line: row.line, edge: true, choresAdded: true }) : { text, changed: false, op: 'move', name, kind, edge: true };
    const a = lines[row.line]; lines[row.line] = lines[other.line]; lines[other.line] = a;
    return done(text, lines, { op: 'move', name, kind, line: other.line, from: row.line, choresAdded: base.choresAdded });
  }

  // ---- 안전 검사 (메인이 쓰기 직전에): ## 생활습관 표 줄만 바뀌었는지 ----
  //   섹션 밖·섹션 안 글 줄·표 머리·구분선은 한 글자도 같음. 새로 생긴(또는 바뀐) 줄은 칸 4개·종류·이름·기준·주기 검사. 이름 겹침 없음
  //   바뀐 줄 수(빠진 + 생긴)는 limit 이하 (기본 2 + 살림 기본 줄 수)
  // 고치기(이름 바꾸기 포함) 검사: 옛 글 -> mid = 생활습관 표만(줄 1개), mid -> 새 글 = 지난 기록 이름만 oldName -> name
  function onlyHabitUpdated(oldText, r) {
    if (!r || typeof r.mid !== 'string') return onlyHabitsChanged(oldText, r && r.text);
    if (!onlyHabitsChanged(oldText, r.mid, r.choresAdded ? undefined : 2)) return false; // 고친 줄 하나(빠진 1 + 생긴 1), 살림 기본 줄을 처음 더할 때만 그만큼 더
    if (r.text === r.mid) return true;
    return !!r.oldName && r.oldName !== r.name && RR.onlyNamesRenamed(r.mid, r.text, r.oldName, r.name);
  }
  function onlyHabitsChanged(oldText, newText, limit) {
    try {
      const a = splitLines(oldText), b = splitLines(newText);
      const A = habitsTable(a), B = habitsTable(b);
      if (a.slice(0, A.sec.line).join('\n') !== b.slice(0, B.sec.line).join('\n')) return false;
      if (a.slice(A.sec.end).join('\n') !== b.slice(B.sec.end).join('\n')) return false;
      const prose = (L, T) => L.slice(T.sec.line, T.sec.end).filter((l, k) => { const i = T.sec.line + k; return !(i > (T.sepLine == null ? T.headLine : T.sepLine) && i < T.endLine); });
      if (prose(a, A).join('\n') !== prose(b, B).join('\n')) return false; // 제목·설명·머리·구분선·표 뒤 글
      const ra = A.rows.map((r) => a[r.line]), rb = B.rows.map((r) => b[r.line]);
      const left = ra.slice(), added = [];
      rb.forEach((l) => { const i = left.indexOf(l); if (i >= 0) left.splice(i, 1); else added.push(l); });
      if (left.length + added.length > (limit == null ? 2 + H.CHORES.length : limit)) return false;
      if (!added.every(okRow)) return false;
      const names = rb.map((l) => cellsOf(l)[0]), namesA = ra.map((l) => cellsOf(l)[0]);
      if (new Set(names).size !== names.length && new Set(namesA).size === namesA.length) return false;
      return true;
    } catch (e) { return false; }
  }
  function okRow(l) {
    if (isSep(l)) return false;
    const c = cellsOf(l); if (c.length !== 4) return false;
    try {
      if (!KINDS.includes(c[1])) return false;
      if (checkName(c[0]) !== c[0]) return false;
      if (c[0] === water()) return okWaterRow(c);
      const fn = fnOf(c[0]); if (fn) return fnRow(fn).join('|') === c.join('|'); // 일지 기능 줄은 정해진 글자 그대로만
      if (checkTarget(c[2], c[1]) !== c[2]) return false;
      return checkCycle(c[3], c[1]) === c[3];
    } catch (e) { return false; }
  }
  // 물 줄은 순서만 바뀌므로 줄 글자 그대로 (여기 오면 = 바뀐 줄로 보인 것). 기준에 n칸이 있으면 통과
  function okWaterRow(c) { return Md.slotsOf(c[2]) > 0; }

  // ---- 공부 완전 삭제 / 되돌리기 ----
  function studyTable(lines) {
    const secs = Md.sections(lines).filter((s) => s.name === SW.STUDY);
    if (secs.length !== 1) throw err('## 공부 섹션 없음 또는 둘');
    const sec = secs[0], t = Md.table(lines, sec); if (!t) throw err('## 공부 표 없음');
    if (t.head.join('|') !== SW.HEAD.join('|')) throw err('## 공부 표 머리가 달라서 멈춤');
    let sep = t.line + 1; if (!(sep < sec.end && isSep(lines[sep]))) sep = null;
    let end = (sep == null ? t.line : sep) + 1;
    while (end < sec.end && isRow(lines[end])) end++;
    const rows = []; for (let i = (sep == null ? t.line : sep) + 1; i < end; i++) if (!isSep(lines[i])) rows.push({ line: i, cells: cellsOf(lines[i]) });
    return { sec, headLine: t.line, sepLine: sep, rows, endLine: end };
  }
  // ## 공부에서 그 줄을 뺌 (보관함으로 가지 않음). 습관 기록의 "이름 n시간"은 그대로. -> { removed: { name, start, end, memo }, before(바로 뒤 줄 이름) }
  function removeStudy(text, name) {
    if (typeof name !== 'string' || !name) throw err('이름 형식 오류', 'badName');
    const lines = splitLines(text), T = studyTable(lines), hits = T.rows.filter((r) => r.cells[0] === name);
    if (!hits.length) throw err('공부 없음: ' + name, 'notFound');
    if (hits.length > 1) throw err('같은 이름이 둘이라 멈춤: ' + name, 'dupName');
    const row = hits[0], i = T.rows.indexOf(row), next = T.rows[i + 1];
    const c = row.cells.slice(0, 4); while (c.length < 4) c.push('');
    const before = lines[row.line];
    lines.splice(row.line, 1);
    return done(text, lines, { op: 'removeStudy', line: row.line, name, removed: { name: c[0], start: c[1], end: c[2], memo: c[3] }, before: next ? next.cells[0] : null, removedText: before });
  }
  // 되돌리기: 지운 줄을 같은 자리(before 앞, 없으면 표 끝)에. 값은 공부 추가와 같은 검사
  function unremoveStudy(text, row, before, raw) {
    if (!row || typeof row !== 'object') throw err('값 형식 오류');
    const name = SW.checkName(row.name), memo = SW.checkMemo(row.memo || ''), start = row.start, end = row.end == null ? '' : row.end;
    if (typeof start !== 'string' || typeof end !== 'string' || !SW.validDates(start, end)) throw err('날짜 오류');
    const lines = splitLines(text), T = studyTable(lines);
    if (T.rows.some((r) => r.cells[0] === name)) throw err('같은 이름의 공부가 이미 있음: ' + name, 'dupName');
    const d = Md.parse(text); if (d.habits && d.habits.rows.some((r) => r.name === name)) throw err('생활습관 이름과 같아서 안 됨: ' + name, 'dupName');
    const bef = before != null ? T.rows.find((r) => r.cells[0] === before) : null;
    const at = bef ? bef.line : T.endLine, l = sameRaw(raw, [name, start, end, memo]) || rowText([name, start, end, memo]);
    lines.splice(at, 0, l);
    return done(text, lines, { op: 'unremoveStudy', line: at, name, after: l });
  }
  // ## 공부 표에서 한 줄만 빠졌는지 (나머지 줄·순서·섹션 밖 그대로)
  function onlyStudyRemoved(oldText, newText) {
    try {
      const a = splitLines(oldText), b = splitLines(newText);
      if (b.length !== a.length - 1) return false;
      const T = studyTable(a);
      let i = 0; while (i < b.length && a[i] === b[i]) i++;
      if (a.slice(i + 1).join('\n') !== b.slice(i).join('\n')) return false;
      return T.rows.some((r) => r.line === i);
    } catch (e) { return false; }
  }
  // ## 공부 표에 한 줄만 더해졌는지 (되돌리기)
  function onlyStudyAdded(oldText, newText) {
    try {
      const a = splitLines(oldText), b = splitLines(newText);
      if (b.length !== a.length + 1) return false;
      const T = studyTable(a);
      let i = 0; while (i < a.length && a[i] === b[i]) i++;
      if (a.slice(i).join('\n') !== b.slice(i + 1).join('\n')) return false;
      const lo = (T.sepLine == null ? T.headLine : T.sepLine) + 1, c = cellsOf(b[i]);
      return i >= lo && i <= T.endLine && isRow(b[i]) && !isSep(b[i]) && c.length === 4 && !!c[0] && SW.validDates(c[1], c[2]);
    } catch (e) { return false; }
  }

  // 옛 일지 기능 줄 옮기기 (2026-10-08 제작자 "독서 쪽수 완전히 없애기"): | 독서 | 기록 | 쪽 | - | -> | 독서 | 기록 | 책꽂이에 기록 | - |
  //   features.js oldTargets에 적힌 옛 기준 글자일 때만, 그 줄 기준 칸만 바꿈. ## 독서·## 독서 보관(책꽂이 책)·지난 기록 "독서 20쪽"은 그대로
  function migrateFnRows(src) {
    const lines = splitLines(src); let T;
    try { T = habitsTable(lines); } catch (e) { return { text: src, changed: false, moved: [] }; }
    const moved = [];
    T.rows.forEach((r) => {
      const fn = fnOf(nameOf(r)); if (!fn || !fn.oldTargets || r.cells.length !== 4) return;
      if (r.cells[1] !== KIND.log || !fn.oldTargets.includes(r.cells[2]) || r.cells[3] !== NO_CYCLE) return;
      lines[r.line] = rowText(fnRow(fn)); moved.push(fn.habit);
    });
    if (!moved.length) return { text: src, changed: false, moved };
    return { text: lines.join(nlOf(src)), changed: true, op: 'migrate', moved };
  }
  const needsMigrate = (src) => migrateFnRows(src).changed;

  const HE = { KIND, KINDS, LOG_UNIT, migrateFnRows, needsMigrate, HEAD, NAME_MAX, TARGET_MAX, NO_CYCLE, checkName, checkTarget, checkCycle, habitsTable, addHabit, updateHabit, removeHabit, moveHabit,
    onlyHabitsChanged, onlyHabitUpdated, okRow, fnOf, removeStudy, unremoveStudy, onlyStudyRemoved, onlyStudyAdded, water };
  root.PHHabitEdit = HE;
  if (typeof module !== 'undefined' && module.exports) module.exports = HE;
})(typeof window !== 'undefined' ? window : globalThis);
