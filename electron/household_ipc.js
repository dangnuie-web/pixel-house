// 살림 쓰기 (메인 프로세스, 2026-10-03 비트): 인벤토리(## 살림 물건), 사야 할 것(## 사야 할 것), 청소 습관 체크(## 생활습관 "살림" 줄 + 습관 기록 오늘 줄).
//   물컵·습관 체크와 같은 안전 규칙:
//   - 대상 파일(settings.LIFE_FILE)·섹션·오늘 날짜는 메인이 정한다. 화면은 바꾸기 값과 "읽은 시각"만 보낸다 (경로를 보낼 수 없음)
//   - 앱이 읽은 뒤 파일이 바뀌었으면 쓰지 않고 새 글을 돌려줌 (conflict)
//   - 값 검사(분류·알약·이름(표 글자 막음)·수량·색)는 js/household.js
//   - 쓰기 직전 백업(main.js backup), 바뀐 줄 검사(onlyHouseChanged / onlyChoreRowsAdded + onlyRecordsRowChanged)
// 여는 함수(정해진 것만): ph:invOp, ph:shopOp, ph:choreToggle
// main.js에서 한 번 부른다: require('./household_ipc.js')({ ipcMain, file, backup, settings, fixedDay, guard })
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function register(o) {
  const J = (f) => require(path.join(__dirname, '..', 'js', f));
  const Md = J('life_md.js'), LW = J('life_write.js'); J('life_check.js'); J('data/household.js');
  const HH = J('household.js');
  const { ipcMain, file, backup, settings, fixedDay, guard } = o;
  const day = () => (fixedDay && fixedDay()) || Md.logDay(Date.now(), settings.DAY_START_HOUR);

  function write(req, plan, safe) {
    if (guard) guard();
    if (!req || typeof req !== 'object') throw new Error('요청 형식 오류');
    const seen = req.lastModified;
    const cur = fs.readFileSync(file, 'utf8'), mtime = fs.statSync(file).mtimeMs;
    if (typeof seen !== 'number' || Math.abs(seen - mtime) > 1) return { ok: false, conflict: true, text: cur, lastModified: mtime };
    const date = day();
    let r;
    try { r = plan(cur, date); } catch (e) { if (e.code) return { ok: false, code: e.code, text: cur, lastModified: mtime, date }; throw e; }
    const extra = { date };
    ['item', 'removed', 'shop', 'created', 'name', 'habit', 'done', 'count', 'of', 'daily', 'per', 'choresAdded'].forEach((k) => { if (r[k] !== undefined) extra[k] = r[k]; });
    if (!r.changed) return Object.assign({ ok: true, unchanged: true, text: cur, lastModified: mtime }, extra);
    if (!safe(cur, r)) throw new Error('살림 섹션 밖이 바뀌려 해서 멈춤');
    const dir = backup(cur);
    fs.writeFileSync(file, r.text);
    return Object.assign({ ok: true, text: r.text, lastModified: fs.statSync(file).mtimeMs, backupDir: dir }, extra);
  }
  const OPS_INV = ['qty', 'need', 'add', 'remove', 'restore', 'color'];
  function cleanInv(op) { // 정해진 칸만
    if (!op || typeof op !== 'object' || Array.isArray(op)) throw new Error('바꾸기 형식 오류');
    if (!OPS_INV.includes(op.type)) throw new Error('모르는 바꾸기');
    const out = { type: op.type, cat: String(op.cat || ''), name: op.name };
    if (typeof op.name !== 'string') throw new Error('이름 형식 오류');
    ['pill', 'color', 'memo', 'before'].forEach((k) => { if (op[k] != null) { if (typeof op[k] !== 'string') throw new Error('값 형식 오류: ' + k); out[k] = op[k]; } });
    if (op.qty != null) out.qty = op.qty;
    if (op.need != null) out.need = op.need;
    return out;
  }
  ipcMain.handle('ph:invOp', (e, req) => write(req, (cur, date) => HH.applyInv(cur, cleanInv(req.op), date), (cur, r) => HH.onlyHouseChanged(cur, r.text)));
  ipcMain.handle('ph:shopOp', (e, req) => write(req, (cur, date) => {
    const op = req.op;
    if (!op || typeof op !== 'object' || !['add', 'bought'].includes(op.type) || typeof op.name !== 'string') throw new Error('바꾸기 형식 오류');
    return HH.applyShop(cur, { type: op.type, name: op.name }, date);
  }, (cur, r) => HH.onlyHouseChanged(cur, r.text)));
  ipcMain.handle('ph:choreToggle', (e, req) => write(req, (cur, date) => {
    if (typeof req.habit !== 'string' || !req.habit || req.habit.length > 40) throw new Error('습관 이름 오류');
    return HH.toggleChore(cur, { habit: req.habit, date });
  }, (cur, r) => HH.onlyChoreRowsAdded(cur, r.mid) && LW.onlyRecordsRowChanged(r.mid, r.text)));
};
