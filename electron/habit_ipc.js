// 습관 편집·공부 완전 삭제 쓰기 (메인 프로세스, 2026-10-04 비트). 물컵·습관 체크·살림과 같은 안전 규칙.
//   - 대상 파일(settings.LIFE_FILE)·섹션·오늘 날짜는 메인이 정한다. 화면은 이름·값과 "읽은 시각"만 보낸다 (경로를 보낼 수 없음)
//   - 앱이 읽은 뒤 파일이 바뀌었으면 쓰지 않고 새 글을 돌려줌 (conflict -> 화면이 다시 읽고 그림)
//   - 값 검사(이름·기준·주기, 표를 깨는 글자 막음)는 js/habit_edit.js. 값이 틀리면 쓰지 않고 { ok: false, code } (badName, dupName, badTarget, badCycle, locked, lastChore, notFound)
//   - 쓰기 직전 백업(main.js backup), 바뀐 줄 검사(onlyHabitsChanged / onlyHabitUpdated / onlyStudyRemoved / onlyStudyAdded / onlyRecordsRowChanged)
//   - 고치기(ph:habitUpdate)는 두 단계로 검사: 생활습관 표 한 줄 + 지난 기록 이름(oldName -> name)만 (js/record_rename.js onlyNamesRenamed)
// 여는 함수(정해진 것만): ph:habitAdd, ph:habitUpdate, ph:habitRemove, ph:habitMove, ph:studyRemove, ph:studyUnremove(완전 삭제 되돌리기),
//   ph:habitSetDaily(매일 n회 습관 오늘 k/n, 물컵과 같은 쓰기)
// main.js에서 한 번 부른다: require('./habit_ipc.js')({ ipcMain, file, backup, settings, fixedDay, guard })
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function register(o) {
  const J = (f) => require(path.join(__dirname, '..', 'js', f));
  const Md = J('life_md.js'), LW = J('life_write.js'); J('life_check.js'); const HC = J('habit_cycle.js'); J('data/household.js'); J('household.js'); J('record_rename.js'); J('study_write.js');
  const HE = J('habit_edit.js');
  const { ipcMain, file, backup, settings, fixedDay, guard, features } = o;
  const FX = J('features.js');
  const day = () => (fixedDay && fixedDay()) || Md.logDay(Date.now(), settings.DAY_START_HOUR);
  const SAFE = { habits: (a, b) => HE.onlyHabitsChanged(a, b), habitUpdate: (a, b, r) => HE.onlyHabitUpdated(a, r) && r.text === b, studyRemove: HE.onlyStudyRemoved, studyAdd: HE.onlyStudyAdded, records: LW.onlyRecordsRowChanged };
  const KEEP = ['op', 'name', 'oldName', 'prev', 'renamedRecords', 'kind', 'row', 'removed', 'before', 'removedText', 'edge', 'choresAdded', 'line', 'value', 'of', 'habit'];

  function write(kind, req, plan) {
    if (guard) guard();
    if (!req || typeof req !== 'object') throw new Error('요청 형식 오류');
    const seen = req.lastModified;
    const cur = fs.readFileSync(file, 'utf8'), mtime = fs.statSync(file).mtimeMs;
    if (typeof seen !== 'number' || Math.abs(seen - mtime) > 1) return { ok: false, conflict: true, text: cur, lastModified: mtime };
    const date = day();
    let r;
    try { r = plan(cur, date); } catch (e) { if (e.code) return { ok: false, code: e.code, message: e.message, text: cur, lastModified: mtime, date, usedName: e.usedName || null, lastDate: e.lastDate || null }; throw e; } // usedName: 막은 이름·마지막 기록 날 (안내용)
    const extra = { date };
    KEEP.forEach((k) => { if (r[k] !== undefined) extra[k] = r[k]; });
    if (!r.changed) return Object.assign({ ok: true, unchanged: true, text: cur, lastModified: mtime }, extra);
    if (!SAFE[kind](cur, r.text, r)) throw new Error('정해진 표 밖이 바뀌려 해서 멈춤 (' + kind + ')');
    const dir = backup(cur);
    fs.writeFileSync(file, r.text);
    // 일지 기능 습관(대변·식사)이 표에 있었으면 seen에 (지운 뒤 일지 저장이 줄을 다시 만들지 않게)
    if (features && r.name && FX.byHabit(r.name)) features.markSeen(FX.byHabit(r.name).id);
    return Object.assign({ ok: true, text: r.text, lastModified: fs.statSync(file).mtimeMs, backupDir: dir }, extra);
  }
  const str = (v) => typeof v === 'string';
  const optStr = (v) => v == null || typeof v === 'string';
  function cleanCycle(c) { // { per, n } 또는 글만
    if (c == null || typeof c === 'string') return c;
    if (typeof c !== 'object' || Array.isArray(c) || !['day', 'week', 'month'].includes(c.per) || !Number.isInteger(c.n)) throw Object.assign(new Error('주기 형식 오류'), { code: 'badCycle' });
    return { per: c.per, n: c.n };
  }
  function cleanHabit(h) { // 정해진 칸만 (kind, name, target, cycle)
    if (!h || typeof h !== 'object' || Array.isArray(h)) throw new Error('습관 형식 오류');
    if (!str(h.kind) || !str(h.name) || !optStr(h.target)) throw new Error('값 형식 오류');
    return { kind: h.kind, name: h.name, target: h.target, cycle: cleanCycle(h.cycle) };
  }
  function cleanPatch(p) { // newName, target, cycle만
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('고칠 값 형식 오류');
    const out = {};
    Object.keys(p).forEach((k) => {
      if (!['newName', 'target', 'cycle'].includes(k)) throw new Error('모르는 칸: ' + k);
      if (k === 'cycle') { if (p.cycle != null) out.cycle = cleanCycle(p.cycle); } else { if (!optStr(p[k])) throw new Error('값 형식 오류: ' + k); if (p[k] != null) out[k] = p[k]; }
    });
    return out;
  }

  // 습관 더하기 (before = 되돌리기 때 원래 자리: 이 이름 앞)
  ipcMain.handle('ph:habitAdd', (e, req) => write('habits', req, (cur) => {
    if (!optStr(req.before) || !optStr(req.raw)) throw new Error('값 형식 오류');
    return HE.addHabit(cur, Object.assign(cleanHabit(req.habit), { before: req.before, raw: req.raw }));
  }));
  ipcMain.handle('ph:habitUpdate', (e, req) => write('habitUpdate', req, (cur) => { if (!str(req.name)) throw new Error('이름 형식 오류'); return HE.updateHabit(cur, req.name, cleanPatch(req.patch)); }));
  ipcMain.handle('ph:habitRemove', (e, req) => write('habits', req, (cur) => { if (!str(req.name)) throw new Error('이름 형식 오류'); return HE.removeHabit(cur, req.name); }));
  ipcMain.handle('ph:habitMove', (e, req) => write('habits', req, (cur) => { if (!str(req.name)) throw new Error('이름 형식 오류'); return HE.moveHabit(cur, req.name, req.dir); }));
  // 공부: 보관함이 아니라 완전히 빼기 / 되돌리기 (지운 줄 값 + 자리)
  ipcMain.handle('ph:studyRemove', (e, req) => write('studyRemove', req, (cur) => { if (!str(req.name)) throw new Error('이름 형식 오류'); return HE.removeStudy(cur, req.name); }));
  ipcMain.handle('ph:studyUnremove', (e, req) => write('studyAdd', req, (cur) => {
    const r = req.row;
    if (!r || typeof r !== 'object' || Array.isArray(r) || !str(r.name) || !str(r.start) || !optStr(r.end) || !optStr(r.memo) || !optStr(req.before) || !optStr(req.raw)) throw new Error('값 형식 오류');
    return HE.unremoveStudy(cur, { name: r.name, start: r.start, end: r.end || '', memo: r.memo || '' }, req.before, req.raw);
  }));
  // 매일 n회(n >= 2) 습관: 오늘 k/n (목표 또는 살림 종류, 물은 ph:setWater). 0 <= value <= n
  ipcMain.handle('ph:habitSetDaily', (e, req) => write('records', req, (cur, date) => {
    if (!str(req.habit) || !req.habit || req.habit.length > 40) throw new Error('습관 이름 오류');
    const d = Md.parse(cur), row = ((d.habits && d.habits.rows) || []).find((x) => x.name === req.habit);
    const n = row ? HC.slotsOf(row.cycle) : 0;
    if (!row || !n || ![HE.KIND.goal, HE.KIND.house].includes(row.kind) || row.name === HE.water()) throw new Error('매일 n회 습관이 아님: ' + req.habit);
    if (!Number.isInteger(req.value) || req.value < 0 || req.value > n) throw new Error('값 오류');
    const prev = HC.todaySlots(d.records, row.name, date);
    const r = LW.setSlots(cur, { habit: row.name, value: req.value, of: n, date });
    return Object.assign(r, { habit: row.name, value: req.value, of: n, prev });
  }));
};
