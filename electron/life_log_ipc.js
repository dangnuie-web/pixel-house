// 두부 대화창 쓰기 (메인 프로세스): 수면·식사·한마디. 물컵(ph:setWater, electron/main.js)과 같은 안전 규칙.
//   - 대상 파일·섹션·날짜는 모두 메인이 정한다. 화면은 값과 "읽은 시각"만 보낸다 (경로를 보낼 수 없음)
//   - 앱이 읽은 뒤 파일이 바뀌었으면 쓰지 않고 새 글을 돌려줌 (conflict)
//   - 값 검사(시각 형식, 끼니 4종, 100자, | 와 줄바꿈 바꾸기)는 js/life_log.js
//   - 쓰기 직전 백업(main.js backup), 바뀐 줄 검사(onlyLogChanged)를 통과해야 씀
// 식사 일지 끄기 (2026-10-04 제작자): 생활습관 표에 "식사" 줄이 없고 전에 있었으면(features.isSeen('meal')) 대화창 식사 적기도 거절 { ok: false, off: true }
//   (화면 대화창도 식사 선택지를 빼지만, 메인에서 한 번 더 막음. 잠·한마디는 습관 줄이 없어 그대로)
// main.js에서 한 번 부른다: require('./life_log_ipc.js')({ ipcMain, file, backup, settings, fixedDay, guard, features })
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function register(o) {
  const LL = require(path.join(__dirname, '..', 'js', 'life_log.js'));
  const LT = require(path.join(__dirname, '..', 'js', 'log_table.js'));
  const FX = require(path.join(__dirname, '..', 'js', 'features.js'));
  const { ipcMain, file, backup, settings, fixedDay, guard, features } = o;
  const OFF_FID = { meal: 'meal' }; // 대화창 쓰기 중 습관 줄과 이어진 것 = 식사뿐
  const isOff = (kind, cur) => { const fid = OFF_FID[kind]; if (!features || !fid) return false; return !LT.hasHabit(LT.splitLines(cur), FX.get(fid).habit) && features.isSeen(fid); };
  // 기록 날짜: 하루의 경계 settings.DAY_START_HOUR(기본 6시). 시험(PH_SHOTS + PH_TODAY)에서만 고정 날짜
  const day = () => (fixedDay && fixedDay()) || LL.logDay(Date.now(), settings.DAY_START_HOUR);
  const str = (v) => (v == null ? '' : v);

  function write(kind, req, plan) {
    if (guard) guard();
    if (!req || typeof req !== 'object') throw new Error('요청 형식 오류');
    const seen = req.lastModified;
    const cur = fs.readFileSync(file, 'utf8'), mtime = fs.statSync(file).mtimeMs;
    if (typeof seen !== 'number' || Math.abs(seen - mtime) > 1) return { ok: false, conflict: true, text: cur, lastModified: mtime };
    const date = day();
    if (isOff(kind, cur)) return { ok: false, off: true, text: cur, lastModified: mtime, date };
    const r = plan(cur, date);
    if (!r.changed) return { ok: true, unchanged: true, text: cur, lastModified: mtime, date };
    if (!LL.onlyLogChanged(cur, r.text, kind, date)) throw new Error('## ' + LL.SECTIONS[kind].name + ' 표 밖이 바뀌려 해서 멈춤');
    const dir = backup(cur);
    fs.writeFileSync(file, r.text);
    return { ok: true, text: r.text, lastModified: fs.statSync(file).mtimeMs, date, line: r.line, inserted: r.inserted, created: r.created, backupDir: dir };
  }
  const isStr = (v) => v == null || typeof v === 'string';
  function check(...vals) { if (!vals.every(isStr)) throw new Error('값 형식 오류'); }

  ipcMain.handle('ph:setSleep', (e, req) => write('sleep', req, (cur, date) => {
    check(req.bed, req.wake, req.memo);
    return LL.setSleep(cur, { date, bed: str(req.bed), wake: str(req.wake), memo: str(req.memo) });
  }));
  ipcMain.handle('ph:addMeal', (e, req) => write('meal', req, (cur, date) => {
    check(req.kind, req.text);
    // 시각 = 지금 시계 'HH:MM' (식사 일지 표 시각 칸, logs 브랜치 2026-10-04). 날짜는 위 하루 경계 6시 기준 그대로
    const n = new Date(), p2 = (x) => String(x).padStart(2, '0');
    return LL.addMeal(cur, { date, kind: req.kind, text: str(req.text), time: p2(n.getHours()) + ':' + p2(n.getMinutes()) });
  }));
  ipcMain.handle('ph:setNote', (e, req) => write('note', req, (cur, date) => {
    check(req.text, req.mood);
    // mood = 기분 칸 (D 기분 4칸, life_log.js MOODS 중 하나). 안 보내면(undefined/null) 고칠 때 그 줄 기분 그대로, 새 줄은 빈칸
    return LL.setNote(cur, { date, text: str(req.text), fix: req.fix === true, mood: req.mood == null ? undefined : req.mood });
  }));
};
