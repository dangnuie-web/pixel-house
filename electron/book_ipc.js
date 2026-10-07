// 독서 책꽂이 쓰기 (메인 프로세스, 2026-10-03 비트, journal 브랜치). 물컵·공부(electron/study_ipc.js)와 같은 안전 규칙.
//   - 대상 파일(settings.LIFE_FILE)·섹션·오늘 날짜는 메인이 정한다. 화면은 책 값과 "읽은 시각"만 보낸다 (경로를 보낼 수 없음)
//   - 앱이 읽은 뒤 파일이 바뀌었으면 쓰지 않고 새 글을 돌려줌 (conflict -> 화면이 다시 그림)
//   - 값 검사(날짜, 제목 60자, 요약 2000자, 표지색 이름, 칸 글 안전 표시)는 js/book_write.js
//   - 쓰기 직전 백업(main.js backup), 바뀐 줄 검사(onlyBookChanged)를 통과해야 씀
// 여는 함수 (정해진 것만): addBook, updateBook, archiveBook, restoreBook
// 독서 기능 끄기 (2026-10-04 제작자 결정, 대변·식사 일지와 같은 규칙. features = electron/furnish_ipc.js):
//   생활습관 표에 "독서" 줄이 없고 전에 한 번이라도 있었으면(features.isSeen('reading')) 책 더하기를 거절 { ok: false, off: true }.
//   한 번도 없었으면 첫 책 더하기 때 표 끝에 "| 독서 | 기록 | 쪽 | - |" 한 줄을 같이 더하고 seen에 적음. 고치기·빼기·되돌리기는 그대로 (화면에서 들어갈 곳이 없어짐)
//   안전 검사: 더한 습관 줄 한 줄을 빼고 보면 onlyBookChanged를 통과해야 함 (js/log_table.js checkChange와 같은 방식)
// main.js에서 한 번 부른다: require('./book_ipc.js')({ ipcMain, file, backup, settings, fixedDay, guard, features })
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function register(o) {
  const BW = require(path.join(__dirname, '..', 'js', 'book_write.js'));
  const LT = require(path.join(__dirname, '..', 'js', 'log_table.js'));
  const FX = require(path.join(__dirname, '..', 'js', 'features.js'));
  const { ipcMain, file, backup, settings, fixedDay, guard, features } = o;
  const RF = FX.get('reading'), HAB = { name: RF.habit, target: RF.target };
  // 새 글에서 표 끝에 더한 독서 습관 줄 하나를 뺀 글 (없으면 null)
  function withoutHabit(oldText, newText) {
    const a = LT.splitLines(oldText), b = LT.splitLines(newText);
    if (LT.hasHabit(a, HAB.name)) return null;
    const t = LT.findSection(b, LT.HABITS) && LT.tableOf(b, LT.findSection(b, LT.HABITS));
    const hits = t ? t.rows.filter((r) => r.cells[0] === HAB.name) : [];
    if (hits.length !== 1 || b[hits[0].line] !== LT.habitRow(HAB) || hits[0].line !== t.endLine - 1) return null;
    return b.slice(0, hits[0].line).concat(b.slice(hits[0].line + 1)).join(LT.nlOf(newText));
  }
  const day = () => (fixedDay && fixedDay()) || BW.logDay(Date.now(), settings.DAY_START_HOUR);

  function write(op, req, plan) {
    if (guard) guard();
    if (!req || typeof req !== 'object') throw new Error('요청 형식 오류');
    const seen = req.lastModified;
    const cur = fs.readFileSync(file, 'utf8'), mtime = fs.statSync(file).mtimeMs;
    if (typeof seen !== 'number' || Math.abs(seen - mtime) > 1) return { ok: false, conflict: true, text: cur, lastModified: mtime };
    const date = day();
    const noHabit = !LT.hasHabit(LT.splitLines(cur), HAB.name);
    if (op === 'add' && features && noHabit && features.isSeen(RF.id)) return { ok: false, off: true, text: cur, lastModified: mtime, date, op };
    const r = plan(cur, date);
    if (!r.changed) return { ok: true, unchanged: true, text: cur, lastModified: mtime, date, op: r.op, book: r.book };
    let text = r.text, habitAdded = false;
    if (op === 'add' && features && noHabit) { // 독서 줄이 한 번도 없었음: 첫 책과 함께 한 번만
      const L = LT.splitLines(text);
      if (LT.ensureHabit(L, HAB) >= 0) { text = L.join(LT.nlOf(text)); habitAdded = true; }
    }
    const bookOnly = habitAdded ? withoutHabit(cur, text) : text;
    if (bookOnly == null || !BW.onlyBookChanged(cur, bookOnly, op)) throw new Error('## 독서 표 밖이 바뀌려 해서 멈춤');
    const dir = backup(cur);
    fs.writeFileSync(file, text);
    if (features && LT.hasHabit(LT.splitLines(text), HAB.name)) features.markSeen(RF.id);
    return { ok: true, text, lastModified: fs.statSync(file).mtimeMs, date, op: r.op, book: r.book, line: r.line, created: r.created, habitAdded, backupDir: dir };
  }
  const isStr = (v) => v == null || typeof v === 'string';
  function key(k) { // 책 고르기 = { date, title } (둘 다 글자)
    if (!k || typeof k !== 'object' || typeof k.date !== 'string' || typeof k.title !== 'string') throw new Error('책 고르기 형식 오류');
    return { date: k.date, title: k.title };
  }
  function cleanBook(b, partial) { // 정해진 칸만 (date, title, color, summary), 모두 글자
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error('책 값 형식 오류');
    const out = {};
    Object.keys(b).forEach((k) => {
      if (!['date', 'title', 'color', 'summary'].includes(k)) throw new Error('모르는 칸: ' + k);
      if (!isStr(b[k])) throw new Error('값 형식 오류: ' + k);
      if (b[k] != null && (b[k] !== '' || k === 'summary' || !partial)) out[k] = b[k];
    });
    return out;
  }

  ipcMain.handle('ph:bookAdd', (e, req) => write('add', req, (cur, date) => {
    const b = cleanBook(req.book, false);
    return BW.addBook(cur, { date: b.date || date, title: b.title, color: b.color, summary: b.summary || '' }); // 날짜를 안 고르면 오늘 (하루 경계 6시)
  }));
  ipcMain.handle('ph:bookUpdate', (e, req) => write('update', req, (cur) => BW.updateBook(cur, key(req.key), cleanBook(req.patch, true))));
  ipcMain.handle('ph:bookArchive', (e, req) => write('archive', req, (cur, date) => BW.archiveBook(cur, key(req.key), { date })));
  ipcMain.handle('ph:bookRestore', (e, req) => write('restore', req, (cur) => BW.restoreBook(cur, key(req.key))));
};
