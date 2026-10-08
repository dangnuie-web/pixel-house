// 공부 간트 쓰기 (메인 프로세스, 2026-10-03 비트 B). 물컵·대화창(electron/life_log_ipc.js)과 같은 안전 규칙.
//   - 대상 파일(settings.LIFE_FILE)·섹션·오늘 날짜는 메인이 정한다. 화면은 공부 이름·값·"읽은 시각"만 보낸다 (경로를 보낼 수 없음)
//   - 앱이 읽은 뒤 파일이 바뀌었으면 쓰지 않고 새 글을 돌려줌 (conflict -> 화면이 다시 그림)
//   - 값 검사(날짜 YYYY-MM-DD, 이름에 | , / 금지, 메모 | -> ｜, 길이)는 js/study_write.js
//   - 쓰기 직전 백업(main.js backup), 바뀐 줄 검사(onlyStudyChanged / onlyStudyLogChanged)를 통과해야 씀
//   - 이름 바꾸기는 ## 공부 표 한 줄 + 지난 기록 이름(record_rename.js onlyNamesRenamed)만. 지난 기록에만 남은 이름이면 { ok: false, code: 'usedName' }
// 여는 함수 (정해진 것만): addStudy, updateStudy(이름, {start, end, memo, newName}), archiveStudy, restoreStudy(보관 되돌리기), logStudyToday
// main.js에서 한 번 부른다: require('./study_ipc.js')({ ipcMain, file, backup, settings, fixedDay, guard })
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function register(o) {
  const SW = require(path.join(__dirname, '..', 'js', 'study_write.js'));
  const RR = require(path.join(__dirname, '..', 'js', 'record_rename.js'));
  require(path.join(__dirname, '..', 'js', 'table_section.js'));
  const SP = require(path.join(__dirname, '..', 'js', 'study_parts.js'));
  const SPL = require(path.join(__dirname, '..', 'js', 'study_plan.js'));
  const { ipcMain, file, backup, settings, fixedDay, guard } = o;
  const day = () => (fixedDay && fixedDay()) || SW.logDay(Date.now(), settings.DAY_START_HOUR);

  // kind: 'study' = ## 공부·## 공부 보관만 / 'log' = ## 습관 기록 오늘 줄만
  function write(kind, op, req, plan) {
    if (guard) guard();
    if (!req || typeof req !== 'object') throw new Error('요청 형식 오류');
    if (typeof req.name !== 'string') throw new Error('이름 형식 오류');
    const seen = req.lastModified;
    const cur = fs.readFileSync(file, 'utf8'), mtime = fs.statSync(file).mtimeMs;
    if (typeof seen !== 'number' || Math.abs(seen - mtime) > 1) return { ok: false, conflict: true, text: cur, lastModified: mtime };
    const date = day();
    let r;
    try { r = plan(cur, date); } catch (e) { if (e.code) return { ok: false, code: e.code, message: e.message, text: cur, lastModified: mtime, date, usedName: e.usedName || null, lastDate: e.lastDate || null, plans: e.plans || null }; throw e; } // plans = 기간 밖 세부 계획 (planOut). usedName: 막은 이름·마지막 기록 날 (안내용)
    if (!r.changed) return { ok: true, unchanged: true, text: cur, lastModified: mtime, date, name: r.name, hours: r.hours };
    // 고치기: 1단계(## 공부 표 한 줄)와 2단계(지난 기록 이름 oldName -> name)를 따로 검사
    const staged = typeof r.mid === 'string';
    const safe = kind === 'log' ? SW.onlyStudyLogChanged(cur, r.text, date)
      : staged ? SW.onlyStudyChanged(cur, r.mid, op) && (r.text === r.mid || (!!r.oldName && RR.onlyNamesRenamed(r.mid, r.text, r.oldName, r.name)))
      : SW.onlyStudyChanged(cur, r.text, op);
    if (!safe) throw new Error((kind === 'log' ? '## 습관 기록 오늘 줄' : '## 공부 표') + ' 밖이 바뀌려 해서 멈춤');
    // 3단계 (2026-10-08): 과목 이름이 바뀌면 ## 공부 단원 표의 과목 칸도 따라감 (그 칸만 바뀌었는지 따로 검사)
    if (staged && r.oldName && r.name && r.oldName !== r.name) {
      const t3 = SP.renameSubject(r.text, r.oldName, r.name);
      if (t3.changed) { if (!SP.onlySubjectRenamed(r.text, t3.text, r.oldName, r.name)) throw new Error('## 공부 단원 표 밖이 바뀌려 해서 멈춤'); r.text = t3.text; }
    }
    const dir = backup(cur);
    fs.writeFileSync(file, r.text);
    return { ok: true, text: r.text, lastModified: fs.statSync(file).mtimeMs, date, op: r.op, name: r.name, oldName: r.oldName, prev: r.prev, renamedRecords: r.renamedRecords, hours: r.hours, line: r.line, created: r.created, backupDir: dir };
  }
  const isStr = (v) => v == null || typeof v === 'string';
  function cleanPatch(p) { // 정해진 칸만 (start, end, memo, newName), 모두 글자
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('고칠 값 형식 오류');
    const out = {};
    Object.keys(p).forEach((k) => {
      if (!['start', 'end', 'memo', 'newName'].includes(k)) throw new Error('모르는 칸: ' + k);
      if (!isStr(p[k])) throw new Error('값 형식 오류: ' + k);
      if (p[k] != null) out[k] = p[k];
    });
    return out;
  }

  ipcMain.handle('ph:studyAdd', (e, req) => write('study', 'add', req, (cur, date) => {
    if (!isStr(req.start) || !isStr(req.memo)) throw new Error('값 형식 오류');
    return SW.addStudy(cur, { name: req.name, start: req.start || date, memo: req.memo || '' });
  }));
  // 고치기 (기간 띠 끌기·키보드). 2026-10-08: 세부 계획이 새 기간 밖으로 나가면 막음 (code planOut)
  ipcMain.handle('ph:studyUpdate', (e, req) => write('study', 'update', req, (cur) => {
    const p = cleanPatch(req.patch), r = SW.updateStudy(cur, req.name, p);
    if (r.changed && (p.start != null || p.end != null)) { const row = SW.parse(r.text).study.find((x) => x.name === r.name); if (row) SPL.checkInside(cur, req.name, row.start, row.end); }
    return r;
  }));
  ipcMain.handle('ph:studyArchive', (e, req) => write('study', 'archive', req, (cur, date) => SW.archiveStudy(cur, req.name, { date })));
  ipcMain.handle('ph:studyRestore', (e, req) => write('study', 'restore', req, (cur) => SW.restoreStudy(cur, req.name)));
  // 공부 [추가 | 수정] 창 한 번 저장 (2026-10-08 3-1단계): ## 공부 줄 + ## 공부 단원(세부 계획) 여러 줄을 쓰기 한 번에. 단계마다 섹션 검사는 js/study_plan.js save
  ipcMain.handle('ph:studySave', (e, req) => {
    if (guard) guard();
    if (!req || typeof req !== 'object') throw new Error('요청 형식 오류');
    const seen = req.lastModified;
    const cur = fs.readFileSync(file, 'utf8'), mtime = fs.statSync(file).mtimeMs;
    if (typeof seen !== 'number' || Math.abs(seen - mtime) > 1) return { ok: false, conflict: true, text: cur, lastModified: mtime };
    const q = { mode: req.mode, name: typeof req.name === 'string' ? req.name : '', study: cleanStudy(req.study), plans: cleanPlans(req.plans), removed: cleanSigs(req.removed) };
    let r;
    try { r = SPL.save(cur, q); } catch (x) { if (x.code) return { ok: false, code: x.code, message: x.message, plans: x.plans || null, part: x.part || null, text: cur, lastModified: mtime, usedName: x.usedName || null, lastDate: x.lastDate || null }; throw x; }
    if (!r.changed) return { ok: true, unchanged: true, text: cur, lastModified: mtime, name: r.name };
    const dir = backup(cur);
    fs.writeFileSync(file, r.text);
    return { ok: true, text: r.text, lastModified: fs.statSync(file).mtimeMs, name: r.name, oldName: r.oldName, steps: r.steps, backupDir: dir };
  });
  // 세부 계획 막대 끌기 (2026-10-08 3-1단계 피드백 2): ## 공부 단원 한 줄의 기간만. 상위 공부 기간 밖이면 code planOut (안 씀)
  ipcMain.handle('ph:planMove', (e, req) => {
    if (guard) guard();
    if (!req || typeof req !== 'object') throw new Error('요청 형식 오류');
    if (typeof req.sig !== 'string' || req.sig.length > 4000 || typeof req.from !== 'string' || typeof req.to !== 'string' || req.from.length > 20 || req.to.length > 20) throw new Error('값 형식 오류');
    const seen = req.lastModified;
    const cur = fs.readFileSync(file, 'utf8'), mtime = fs.statSync(file).mtimeMs;
    if (typeof seen !== 'number' || Math.abs(seen - mtime) > 1) return { ok: false, conflict: true, text: cur, lastModified: mtime };
    let r;
    try { r = SPL.movePlan(cur, req.sig, req.from, req.to); } catch (x) { if (x.code) return { ok: false, code: x.code, message: x.message, plans: x.plans || null, part: x.part || null, start: x.start || null, end: x.end || null, text: cur, lastModified: mtime }; throw x; }
    if (!r.changed) return { ok: true, unchanged: true, text: cur, lastModified: mtime, part: r.part };
    if (!SP.onlyPartsChanged(cur, r.text, 'update')) throw new Error('## 공부 단원 표 밖이 바뀌려 해서 멈춤');
    const dir = backup(cur);
    fs.writeFileSync(file, r.text);
    return { ok: true, text: r.text, lastModified: fs.statSync(file).mtimeMs, part: r.part, subject: r.subject, backupDir: dir };
  });
  const s200 = (v) => typeof v === 'string' && v.length <= 200;
  function cleanStudy(o) { if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('공부 값 형식 오류'); ['name', 'start', 'end', 'memo'].forEach((k) => { if (o[k] != null && !s200(o[k])) throw new Error('값 형식 오류: ' + k); }); return { name: o.name || '', start: o.start || '', end: o.end || '', memo: o.memo || '' }; }
  function cleanPlans(a) { if (a == null) return []; if (!Array.isArray(a) || a.length > 30) throw new Error('세부 계획 형식 오류'); return a.map((p) => { if (!p || typeof p !== 'object') throw new Error('세부 계획 형식 오류'); ['sig', 'part', 'from', 'to'].forEach((k) => { if (p[k] != null && !(typeof p[k] === 'string' && p[k].length <= 4000)) throw new Error('값 형식 오류: ' + k); }); return { sig: p.sig || null, part: p.part || '', from: p.from || '', to: p.to || '' }; }); }
  function cleanSigs(a) { if (a == null) return []; if (!Array.isArray(a) || a.length > 30 || a.some((x) => typeof x !== 'string' || x.length > 4000)) throw new Error('줄 고르기 형식 오류'); return a; }
  ipcMain.handle('ph:studyLog', (e, req) => write('log', 'log', req, (cur, date) => {
    if (req.add !== 1 && req.add !== -1) throw new Error('시간 오류');
    return SW.logStudyToday(cur, req.name, { date, add: req.add });
  }));
};
