// 생활 습관 체크 쓰기 (메인 프로세스): 주 N회 칸, 기록 습관 양, 안전장치 주간 확인. 물컵(ph:setWater)과 같은 안전 규칙.
//   - 대상 파일·섹션·날짜(오늘·이번 주)는 모두 메인이 정한다. 화면은 습관 이름·값과 "읽은 시각"만 보낸다 (경로를 보낼 수 없음)
//   - 습관 이름은 파일의 ## 생활습관 표에 있는 것만, 종류·주기도 메인이 다시 확인
//   - 앱이 읽은 뒤 파일이 바뀌었으면 쓰지 않고 새 글을 돌려줌 (conflict)
//   - 쓰기 직전 백업(main.js backup), 바뀐 줄 검사(습관 기록 = onlyRecordsRowChanged, 안전장치 확인 = onlyLogChanged)
// main.js에서 한 번 부른다: require('./life_check_ipc.js')({ ipcMain, file, backup, settings, fixedDay, guard })
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function register(o) {
  const J = (f) => require(path.join(__dirname, '..', 'js', f));
  const Md = J('life_md.js'), LW = J('life_write.js'), LL = J('life_log.js'), LC = J('life_check.js'), HC = J('habit_cycle.js');
  const { ipcMain, file, backup, settings, fixedDay, guard } = o;
  // 기록 날짜: 하루 경계 settings.DAY_START_HOUR(6시). 시험(PH_SHOTS + PH_TODAY)에서만 고정 날짜
  const day = () => (fixedDay && fixedDay()) || Md.logDay(Date.now(), settings.DAY_START_HOUR);

  // kind: 'records' (습관 기록 표 오늘 줄) | 'safety' (안전장치 확인 표). plan(cur, date, parsed) -> { text, changed, ... }
  function write(kind, req, plan) {
    if (guard) guard();
    if (!req || typeof req !== 'object') throw new Error('요청 형식 오류');
    const seen = req.lastModified;
    const cur = fs.readFileSync(file, 'utf8'), mtime = fs.statSync(file).mtimeMs;
    if (typeof seen !== 'number' || Math.abs(seen - mtime) > 1) return { ok: false, conflict: true, text: cur, lastModified: mtime };
    const date = day();
    const r = plan(cur, date, Md.parse(cur));
    if (r.stale) return Object.assign({ ok: false, text: cur, lastModified: mtime, date }, r);
    const extra = { date, line: r.line, inserted: r.inserted, created: r.created };
    ['done', 'value', 'prev', 'week', 'item', 'result', 'habit'].forEach((k) => { if (r[k] !== undefined) extra[k] = r[k]; });
    if (!r.changed) return Object.assign({ ok: true, unchanged: true, text: cur, lastModified: mtime }, extra);
    const safe = kind === 'safety' ? LL.onlyLogChanged(cur, r.text, 'safety', r.week) : LW.onlyRecordsRowChanged(cur, r.text);
    if (!safe) throw new Error((kind === 'safety' ? '## 안전장치 확인' : '## 습관 기록') + ' 표 밖이 바뀌려 해서 멈춤');
    const dir = backup(cur);
    fs.writeFileSync(file, r.text);
    return Object.assign({ ok: true, text: r.text, lastModified: fs.statSync(file).mtimeMs, backupDir: dir }, extra);
  }
  const habitRow = (d, name) => ((d.habits && d.habits.rows) || []).find((r) => r.name === name);
  const isName = (v) => typeof v === 'string' && v.length > 0 && v.length <= 40;

  // E 주 N회: 오늘 했음/안 했음 뒤집기. 목표 습관(주기 "주 N회") 또는 "오늘" 카드로 올라온 안전장치(주 N회)만
  ipcMain.handle('ph:toggleWeekly', (e, req) => write('records', req, (cur, date, d) => {
    if (!isName(req.habit)) throw new Error('습관 이름 오류');
    const row = habitRow(d, req.habit);
    // 2026-10-04 습관 편집: 목표 습관은 주 N회 + 월 N회 + 매일 1회(오늘 한 칸)도 뒤집기 (js/habit_cycle.js isToggle). 올라온 안전장치는 주 N회만 (그대로)
    const up = row && LC.weeklyOf(row.cycle) && LC.promoted(d.habits.rows, LC.safetyRows(cur), date).some((p) => p.name === row.name);
    if (!row || !(up || (row.kind === LC.KIND.goal && !row.slots && HC.isToggle(row.cycle)))) throw new Error('오늘 카드에서 뒤집는 습관이 아님: ' + req.habit);
    const r = LC.toggleWeekly(cur, { habit: row.name, date });
    const after = HC.countFor(Md.parse(r.text).records, row, date);
    return Object.assign(r, { habit: row.name, value: after.count });
  }));

  // 기록 습관 양: 종류 "기록", 단위 = 기준 칸. mode 'add' | 'set'
  ipcMain.handle('ph:addAmount', (e, req) => write('records', req, (cur, date, d) => {
    if (!isName(req.habit)) throw new Error('습관 이름 오류');
    const row = habitRow(d, req.habit), unit = row && LC.unitOf(row.target);
    if (!row || row.kind !== LC.KIND.log || !unit) throw new Error('양을 적는 기록 습관이 아님: ' + req.habit);
    const r = LC.addAmount(cur, { habit: row.name, unit, value: req.value, mode: req.mode, date });
    return Object.assign(r, { habit: row.name });
  }));

  // I 안전장치 확인: week = 화면이 보고 있던 주(월요일). 메인의 이번 주와 다르면(그사이 주가 바뀜) 쓰지 않고 stale
  ipcMain.handle('ph:setSafetyCheck', (e, req) => write('safety', req, (cur, date, d) => {
    const week = Md.weekStart(date);
    if (req.week !== week) return { stale: true, week };
    if (!isName(req.item)) throw new Error('항목 오류');
    const row = habitRow(d, req.item);
    if (!row || row.kind !== LC.KIND.safety) throw new Error('안전장치 항목이 아님: ' + req.item);
    if (!LC.RESULTS[req.result]) throw new Error('결과 오류');
    const r = LC.setSafetyCheck(cur, { week, item: row.name, result: req.result });
    return Object.assign(r, { week, item: row.name, result: req.result });
  }));
};
