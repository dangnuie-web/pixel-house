// 대변 관찰 일지·식사 일지 쓰기 (메인 프로세스, 2026-10-04 비트, logs 브랜치). 물컵·독서(electron/book_ipc.js)와 같은 안전 규칙.
//   - 대상 파일(settings.LIFE_FILE)·섹션은 메인이 정한다. 화면은 기록 값과 "읽은 시각"만 보낸다 (경로를 보낼 수 없음)
//   - 앱이 읽은 뒤 파일이 바뀌었으면 쓰지 않고 새 글을 돌려줌 (conflict)
//   - 값 검사는 js/poop_log.js, js/meal_log.js. 날짜는 오늘(하루 경계 6시)까지만, 비우면 오늘 / 시각을 비우면 지금
//   - 쓰기 직전 백업(main.js backup), 바뀐 줄 검사(onlyPoopChanged / onlyMealChanged)를 통과해야 씀
//   - 건강 기록: 이 파일 밖으로 보내지 않음 (네트워크 없음)
// 여는 함수 (정해진 것만): addPoop, updatePoop, removePoop, addMeal2, updateMeal, removeMeal
// 일지 기능 끄기 (2026-10-04 제작자 결정): 생활습관 표에 대변·식사 줄이 없고, 전에 한 번이라도 있었으면(features.isSeen) 더하기를 거절 { ok: false, off: true }.
//   한 번도 없었으면 지금처럼 첫 저장 때 줄을 더하고 seen에 적음. 고치기·지우기는 그대로 (화면에서 들어갈 곳이 없어짐)
// main.js에서 한 번 부른다: require('./logs_ipc.js')({ ipcMain, file, backup, settings, fixedDay, guard, features })
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function register(o) {
  const PL = require(path.join(__dirname, '..', 'js', 'poop_log.js'));
  const ML = require(path.join(__dirname, '..', 'js', 'meal_log.js'));
  const LT = require(path.join(__dirname, '..', 'js', 'log_table.js'));
  const { ipcMain, file, backup, settings, fixedDay, guard, features } = o;
  const FID = { poop: 'poop', meal: 'meal' }, HAB = { poop: PL.HABIT, meal: ML.HABIT };
  const day = () => (fixedDay && fixedDay()) || LT.logDay(Date.now(), settings.DAY_START_HOUR);

  function write(kind, op, req, plan) {
    if (guard) guard();
    if (!req || typeof req !== 'object') throw new Error('요청 형식 오류');
    const seen = req.lastModified;
    const cur = fs.readFileSync(file, 'utf8'), mtime = fs.statSync(file).mtimeMs;
    if (typeof seen !== 'number' || Math.abs(seen - mtime) > 1) return { ok: false, conflict: true, text: cur, lastModified: mtime };
    const date = day();
    if (op === 'add' && features && !LT.hasHabit(LT.splitLines(cur), HAB[kind].name) && features.isSeen(FID[kind])) return { ok: false, off: true, text: cur, lastModified: mtime, date, op };
    const r = plan(cur, date);
    if (!r.changed) return { ok: true, unchanged: true, text: cur, lastModified: mtime, date, op, entry: r.entry };
    const safe = kind === 'poop' ? PL.onlyPoopChanged(cur, r.text, op) : ML.onlyMealChanged(cur, r.text, op);
    if (!safe) throw new Error('## ' + (kind === 'poop' ? PL.SEC : ML.SEC) + ' 표 밖이 바뀌려 해서 멈춤');
    const dir = backup(cur);
    fs.writeFileSync(file, r.text);
    if (features && LT.hasHabit(LT.splitLines(r.text), HAB[kind].name)) features.markSeen(FID[kind]);
    return { ok: true, text: r.text, lastModified: fs.statSync(file).mtimeMs, date, op, entry: r.entry || null, removed: r.removed || null, line: r.line, created: !!r.created, habitAdded: !!r.habitAdded, backupDir: dir };
  }
  const FIELDS = { poop: ['date', 'time', 'form', 'amount', 'color', 'memo'], meal: ['date', 'time', 'kind', 'menu', 'rating', 'amount', 'memo'] };
  function clean(kind, v) { // 정해진 칸만, 글자·숫자·null만
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('기록 값 형식 오류');
    const out = {};
    Object.keys(v).forEach((k) => {
      if (!FIELDS[kind].includes(k)) throw new Error('모르는 칸: ' + k);
      const x = v[k];
      if (!(x == null || typeof x === 'string' || (typeof x === 'number' && isFinite(x)))) throw new Error('값 형식 오류: ' + k);
      if (typeof x === 'string' && x.length > 5000) throw new Error('값이 너무 김: ' + k);
      out[k] = x;
    });
    return out;
  }
  function key(k) { // 줄 고르기 = { sig: 읽은 그 줄 글 }
    if (!k || typeof k !== 'object' || typeof k.sig !== 'string' || k.sig.length > 10000) throw new Error('기록 고르기 형식 오류');
    return { sig: k.sig };
  }
  function nowHm() { const n = new Date(), p = (x) => String(x).padStart(2, '0'); return p(n.getHours()) + ':' + p(n.getMinutes()); }
  function withDefaults(v, today) { // 날짜 비면 오늘, 시각 비면 지금. 오늘 뒤 날짜는 거절
    const e = Object.assign({}, v);
    if (e.date == null || e.date === '') e.date = today;
    if (e.time == null || e.time === '') e.time = nowHm();
    if (typeof e.date === 'string' && e.date > today) throw new Error('날짜 오류: 오늘 뒤 날짜');
    return e;
  }
  function patchOk(p, today) { if (p.date != null && p.date !== '' && typeof p.date === 'string' && p.date > today) throw new Error('날짜 오류: 오늘 뒤 날짜'); return p; }

  ipcMain.handle('ph:poopAdd', (e, req) => write('poop', 'add', req, (cur, date) => PL.addPoop(cur, withDefaults(clean('poop', req.entry), date))));
  ipcMain.handle('ph:poopUpdate', (e, req) => write('poop', 'update', req, (cur, date) => PL.updatePoop(cur, key(req.key), patchOk(clean('poop', req.patch), date))));
  ipcMain.handle('ph:poopRemove', (e, req) => write('poop', 'remove', req, (cur) => PL.removePoop(cur, key(req.key))));
  ipcMain.handle('ph:mealAdd', (e, req) => write('meal', 'add', req, (cur, date) => ML.addMeal2(cur, withDefaults(clean('meal', req.entry), date))));
  ipcMain.handle('ph:mealUpdate', (e, req) => write('meal', 'update', req, (cur, date) => ML.updateMeal(cur, key(req.key), patchOk(clean('meal', req.patch), date))));
  ipcMain.handle('ph:mealRemove', (e, req) => write('meal', 'remove', req, (cur) => ML.removeMeal(cur, key(req.key))));
};
