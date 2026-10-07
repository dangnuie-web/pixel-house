// 약속 쓰기 (메인 프로세스, 2026-10-07 비트). 습관 편집(electron/habit_ipc.js)과 같은 안전 규칙.
//   - 대상 파일(settings.LIFE_FILE)·섹션(## 약속, 옛 이름 ## Meeting)은 메인이 정한다. 화면은 약속 값·고를 줄 글·"읽은 시각"만 보낸다 (경로를 보낼 수 없음)
//   - 앱이 읽은 뒤 파일이 바뀌었으면 쓰지 않고 새 글을 돌려줌 (conflict -> 화면이 새 글로 다시 그림)
//   - 값 검사(날짜·시간·내용, 표를 깨는 글자 막음)는 js/meeting_edit.js. 값이 틀리면 쓰지 않고 { ok: false, code } (badDate, badTime, badText, notFound, noSection)
//   - 쓰기 직전 백업(main.js backup, 최근 10개), 바뀐 줄 검사(onlyMeetingsChanged: ## 약속 표 안 한 줄만)
// 여는 함수(정해진 것만): ph:meetingAdd, ph:meetingUpdate, ph:meetingRemove
// main.js에서 한 번 부른다: require('./meeting_ipc.js')({ ipcMain, file, backup, guard })
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function register(o) {
  const J = (f) => require(path.join(__dirname, '..', 'js', f));
  J('life_md.js'); J('log_table.js');
  const ME = J('meeting_edit.js');
  const { ipcMain, file, backup, guard } = o;
  const KEEP = ['op', 'meeting', 'prev', 'removed', 'removedText', 'before', 'after', 'line', 'section'];

  function write(op, req, plan) {
    if (guard) guard();
    if (!req || typeof req !== 'object') throw new Error('요청 형식 오류');
    const seen = req.lastModified;
    const cur = fs.readFileSync(file, 'utf8'), mtime = fs.statSync(file).mtimeMs;
    if (typeof seen !== 'number' || Math.abs(seen - mtime) > 1) return { ok: false, conflict: true, text: cur, lastModified: mtime };
    let r;
    try { r = plan(cur); } catch (e) { if (e.code) return { ok: false, code: e.code, message: e.message, text: cur, lastModified: mtime }; throw e; }
    const extra = {};
    KEEP.forEach((k) => { if (r[k] !== undefined) extra[k] = r[k]; });
    if (!r.changed) return Object.assign({ ok: true, unchanged: true, text: cur, lastModified: mtime }, extra);
    if (!ME.onlyMeetingsChanged(cur, r.text, op)) throw new Error('## 약속 표 밖이 바뀌려 해서 멈춤 (' + op + ')');
    const dir = backup(cur);
    fs.writeFileSync(file, r.text);
    return Object.assign({ ok: true, text: r.text, lastModified: fs.statSync(file).mtimeMs, backupDir: dir }, extra);
  }
  const str = (v) => typeof v === 'string';
  const optStr = (v) => v == null || typeof v === 'string';
  const short = (v) => v == null || (typeof v === 'string' && v.length <= 1000);
  function cleanMeeting(m, partial) { // 정해진 칸만 (date, time, text)
    if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('약속 형식 오류');
    const out = {};
    Object.keys(m).forEach((k) => {
      if (!['date', 'time', 'text'].includes(k)) throw new Error('모르는 칸: ' + k);
      if (!optStr(m[k]) || !short(m[k])) throw new Error('값 형식 오류: ' + k);
      if (m[k] != null) out[k] = m[k];
    });
    if (!partial && (!str(out.date) || !str(out.text))) throw new Error('값 형식 오류');
    return out;
  }
  function key(k) { // 줄 고르기 = { sig: 읽은 그 줄 글 }
    if (!k || typeof k !== 'object' || !str(k.sig) || k.sig.length > 1000) throw new Error('약속 고르기 형식 오류');
    return { sig: k.sig };
  }
  const cleanOpt = (req) => { if (!optStr(req.before) || !optStr(req.raw) || !short(req.before) || !short(req.raw)) throw new Error('값 형식 오류'); return { before: req.before, raw: req.raw }; };

  // 더하기 (before·raw = 지우기 되돌리기 때 원래 자리·글자)
  ipcMain.handle('ph:meetingAdd', (e, req) => write('add', req, (cur) => ME.addMeeting(cur, cleanMeeting(req.meeting), cleanOpt(req))));
  // 고치기 (raw = 고치기 되돌리기 때 이전 줄 글자)
  ipcMain.handle('ph:meetingUpdate', (e, req) => write('update', req, (cur) => {
    const opt = cleanOpt(req);
    return ME.updateMeeting(cur, key(req.key), req.patch == null && opt.raw != null ? {} : cleanMeeting(req.patch, true), { raw: opt.raw });
  }));
  ipcMain.handle('ph:meetingRemove', (e, req) => write('remove', req, (cur) => ME.removeMeeting(cur, key(req.key))));
};
