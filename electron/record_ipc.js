// 기록 넓히기 쓰기 (메인 프로세스, 2026-10-08 비트, 로드맵 3단계). 약속 쓰기(electron/meeting_ipc.js)와 같은 안전 규칙.
//   - 대상 파일(settings.LIFE_FILE)·섹션·오늘 날짜는 메인이 정한다. 화면은 값·고를 줄 글(sig)·"읽은 시각"만 보낸다 (경로를 보낼 수 없음)
//   - 앱이 읽은 뒤 파일이 바뀌었으면 쓰지 않고 새 글을 돌려줌 (conflict)
//   - 값이 틀리면 쓰지 않고 { ok: false, code } (badTitle, badText, badDate, badKind, kindBad, kindDup, badPart, dupPart, notFound, ...)
//   - 쓰기 직전 백업(main.js backup), 바뀐 줄 검사(섹션마다 only…Changed)를 통과해야 씀
// 여는 함수(정해진 것만):
//   기록(## 기록): ph:recordAdd, ph:recordUpdate, ph:recordRemove / 기록 항목(## 기록 항목): ph:recordKindAdd, ph:recordKindRemove
//   버킷리스트(## 버킷리스트 줄): ph:bucketAdd, ph:bucketDone, ph:bucketEdit, ph:bucketRemove
//   공부 단원(## 공부 단원): ph:partAdd, ph:partRename, ph:partRemove, ph:partToggle
// main.js에서 한 번 부른다: require('./record_ipc.js')({ ipcMain, file, backup, settings, fixedDay, guard })
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function register(o) {
  const J = (f) => require(path.join(__dirname, '..', 'js', f));
  J('life_md.js'); J('table_section.js');
  const RW = J('record_write.js'), BK = J('bucket_write.js'), SP = J('study_parts.js');
  const { ipcMain, file, backup, settings, fixedDay, guard } = o;
  const day = () => (fixedDay && fixedDay()) || J('life_md.js').logDay(Date.now(), settings && settings.DAY_START_HOUR);

  // check(old, new, op) = 그 섹션만 바뀌었는지
  function write(req, check, plan) {
    if (guard) guard();
    if (!req || typeof req !== 'object') throw new Error('요청 형식 오류');
    const seen = req.lastModified;
    const cur = fs.readFileSync(file, 'utf8'), mtime = fs.statSync(file).mtimeMs;
    if (typeof seen !== 'number' || Math.abs(seen - mtime) > 1) return { ok: false, conflict: true, text: cur, lastModified: mtime };
    const date = day();
    let r;
    try { r = plan(cur, date); } catch (e) { if (e.code) return { ok: false, code: e.code, message: e.message, text: cur, lastModified: mtime, date }; throw e; }
    const extra = {};
    ['op', 'before', 'after', 'next', 'line', 'created', 'record', 'kind', 'subject', 'part', 'old', 'on', 'date'].forEach((k) => { if (r[k] !== undefined) extra[k] = r[k]; });
    if (extra.date === undefined) extra.date = date;
    if (!r.changed) return Object.assign({ ok: true, unchanged: true, text: cur, lastModified: mtime }, extra);
    if (!check(cur, r.text, r.op)) throw new Error('정해진 섹션 밖이 바뀌려 해서 멈춤 (' + r.op + ')');
    const dir = backup(cur);
    fs.writeFileSync(file, r.text);
    return Object.assign({ ok: true, text: r.text, lastModified: fs.statSync(file).mtimeMs, backupDir: dir }, extra);
  }
  const str = (v) => typeof v === 'string' && v.length <= 4000;
  const optStr = (v) => v == null || str(v);
  const sig = (v) => { if (!str(v) || v.length > 4000) throw new Error('줄 고르기 형식 오류'); return v; };
  function only(obj, keys) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('값 형식 오류');
    const out = {};
    Object.keys(obj).forEach((k) => { if (!keys.includes(k)) throw new Error('모르는 칸: ' + k); if (!optStr(obj[k])) throw new Error('값 형식 오류: ' + k); if (obj[k] != null) out[k] = obj[k]; });
    return out;
  }
  const undoOpt = (req) => { if (!optStr(req.before) || !optStr(req.raw)) throw new Error('값 형식 오류'); return req.raw != null ? { before: req.before, raw: req.raw } : null; };

  // ---- 기록 (영화·연극·새 항목) ----
  const recCheck = (a, b, op) => RW.onlyRecordChanged(a, b, op);
  ipcMain.handle('ph:recordAdd', (e, req) => write(req, recCheck, (cur, date) => {
    const u = undoOpt(req); if (u) return RW.addRecord(cur, null, u);
    const r = only(req.record, ['kind', 'date', 'title', 'summary']);
    return RW.addRecord(cur, { kind: r.kind, date: r.date || date, title: r.title, summary: r.summary || '' });
  }));
  ipcMain.handle('ph:recordUpdate', (e, req) => write(req, recCheck, (cur, date) => {
    const u = undoOpt(req); if (u) return RW.updateRecord(cur, sig(req.sig), null, u);
    const r = only(req.record, ['kind', 'date', 'title', 'summary']);
    return RW.updateRecord(cur, sig(req.sig), { kind: r.kind, date: r.date || date, title: r.title, summary: r.summary || '' });
  }));
  ipcMain.handle('ph:recordRemove', (e, req) => write(req, recCheck, (cur) => RW.removeRecord(cur, sig(req.sig))));
  const kindCheck = (a, b, op) => RW.onlyKindChanged(a, b, op);
  ipcMain.handle('ph:recordKindAdd', (e, req) => write(req, kindCheck, (cur, date) => {
    const u = undoOpt(req); if (u) return RW.addKind(cur, null, null, u);
    if (!str(req.name)) throw new Error('이름 형식 오류');
    return RW.addKind(cur, req.name, date);
  }));
  ipcMain.handle('ph:recordKindRemove', (e, req) => write(req, kindCheck, (cur, date) => { if (!str(req.name)) throw new Error('이름 형식 오류'); return RW.removeKind(cur, req.name, date); })); // date = 화면에만 있던 영화·연극을 실제 줄로 적을 때 만든 날

  // ---- 버킷리스트 ----
  const bkCheck = (a, b, op) => BK.onlyBucketChanged(a, b, op);
  ipcMain.handle('ph:bucketAdd', (e, req) => write(req, bkCheck, (cur) => { const u = undoOpt(req); if (u) return BK.addItem(cur, null, u); if (!str(req.text)) throw new Error('형식 오류'); return BK.addItem(cur, req.text); }));
  ipcMain.handle('ph:bucketDone', (e, req) => write(req, bkCheck, (cur, date) => { if (typeof req.done !== 'boolean') throw new Error('형식 오류'); return BK.setDone(cur, sig(req.sig), req.done, date); }));
  ipcMain.handle('ph:bucketEdit', (e, req) => write(req, bkCheck, (cur) => { const u = undoOpt(req); if (u) return BK.editItem(cur, sig(req.sig), null, u); if (!str(req.text)) throw new Error('형식 오류'); return BK.editItem(cur, sig(req.sig), req.text); }));
  ipcMain.handle('ph:bucketRemove', (e, req) => write(req, bkCheck, (cur) => BK.removeItem(cur, sig(req.sig))));

  // ---- 공부 단원 ----
  const partCheck = (a, b, op) => SP.onlyPartsChanged(a, b, op);
  ipcMain.handle('ph:partAdd', (e, req) => write(req, partCheck, (cur) => { const u = undoOpt(req); if (u) return SP.addPart(cur, null, null, u); if (!str(req.subject) || !str(req.part)) throw new Error('형식 오류'); return SP.addPart(cur, req.subject, req.part); }));
  ipcMain.handle('ph:partRename', (e, req) => write(req, partCheck, (cur) => { if (!str(req.part)) throw new Error('형식 오류'); return SP.renamePart(cur, sig(req.sig), req.part); }));
  ipcMain.handle('ph:partRemove', (e, req) => write(req, partCheck, (cur) => SP.removePart(cur, sig(req.sig))));
  ipcMain.handle('ph:partToggle', (e, req) => write(req, partCheck, (cur) => {
    if (!str(req.subject) || !str(req.part) || !str(req.date)) throw new Error('형식 오류');
    return SP.toggle(cur, req.subject, req.part, req.date);
  }));
};
