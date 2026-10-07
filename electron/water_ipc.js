// 물 칸 쓰기 (메인 프로세스, ph:setWater). 2026-10-04 main.js에서 떼어 냄: 두부 펫(~/dev/dubu-pet)도 같은 코드로 씀
//   대상 파일·습관 이름·칸 수·오늘 날짜는 모두 메인이 정한다 (화면은 "몇 잔"과 "읽은 시각"만 보냄 = 경로를 보낼 수 없음)
//   앱이 읽은 뒤 파일이 바뀌었으면 쓰지 않고 새 글을 돌려줌 (conflict). 쓰기 전 백업, 바뀐 줄 검사(onlyRecordsRowChanged)
// main.js에서 한 번 부른다: require('./water_ipc.js')({ ipcMain, file, backup, settings, today, guard })
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function register(o) {
  const Md = require(path.join(__dirname, '..', 'js', 'life_md.js'));
  const LW = require(path.join(__dirname, '..', 'js', 'life_write.js'));
  const { ipcMain, file, backup, settings, today, guard } = o;
  ipcMain.handle('ph:setWater', (e, req) => {
    if (guard) guard();
    const value = req && req.value, seen = req && req.lastModified;
    const cur = fs.readFileSync(file, 'utf8'), mtime = fs.statSync(file).mtimeMs;
    // 앱이 읽은 뒤 파일이 바뀌었으면 쓰지 않고 새 글을 돌려줌 (화면이 다시 읽고 반영)
    if (typeof seen !== 'number' || Math.abs(seen - mtime) > 1) return { ok: false, conflict: true, text: cur, lastModified: mtime };
    const habit = settings.WATER_HABIT || '물';
    const row = (Md.parse(cur).habits || { rows: [] }).rows.find((r) => r.name === habit && r.slots > 0);
    if (!row) throw new Error('칸 습관 없음: ' + habit);
    if (!Number.isInteger(value) || value < 0 || value > row.slots) throw new Error('값 오류');
    const r = LW.setSlots(cur, { habit, value, of: row.slots, date: today() });
    if (!r.changed) return { ok: true, unchanged: true, text: cur, lastModified: mtime, date: today() };
    if (!LW.onlyRecordsRowChanged(cur, r.text)) throw new Error('습관 기록 표 밖이 바뀌려 해서 멈춤');
    const dir = backup(cur);
    fs.writeFileSync(file, r.text);
    return { ok: true, text: r.text, lastModified: fs.statSync(file).mtimeMs, date: today(), line: r.line, inserted: r.inserted, backupDir: dir };
  });
};
