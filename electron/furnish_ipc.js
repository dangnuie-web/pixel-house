// 가구 연결·일지 기능 표시 저장 (메인 프로세스, 2026-10-04 비트). 생활 기록 파일이 아니라 앱 설정 폴더의 features.json 한 파일
//   위치: app.getPath('userData')/features.json (= ~/Library/Application Support/Pixel House/features.json). 시험(PH_SHOTS)은 임시 사용자 폴더
//   { links: { 가구 key: 기능 id | 'none' } (기본과 다른 것만), seen: [표에 한 번이라도 있었던 일지 기능 id (대변·식사·독서)] }
//   규칙·계산은 js/features.js. 화면은 key·기능 id만 보냄 (경로를 보낼 수 없음). 여기서 다시 다듬음(cleanLinks·cleanSeen)
//   seen: 기능을 읽을 때(ph:featuresGet) 생활 기록 파일 생활습관 표를 읽기만 해서, 표에 대변·식사 줄이 있으면 더함. 쓰지는 않음
//         일지·책을 처음 저장해 줄이 생길 때(logs_ipc·book_ipc), 화면에만 보이던 줄을 지울 때(ph:featuresHide)도 더함
//   쓰기: 임시 파일에 쓰고 이름 바꾸기 (outfit.json과 같음)
// 여는 함수: ph:featuresGet, ph:featuresSetLinks(통째로, 화면이 js/features.js setLink로 만든 값), ph:featuresReset(기본으로), ph:featuresHide(일지 기능 끄기)
// main.js에서 한 번 부른다: const FS = require('./furnish_ipc.js')({ ipcMain, app, file }) -> FS.isSeen(id), FS.markSeen(id) (logs_ipc·habit_ipc가 씀)
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function register(o) {
  const FX = require(path.join(__dirname, '..', 'js', 'features.js'));
  const Md = require(path.join(__dirname, '..', 'js', 'life_md.js'));
  const { ipcMain, app, file } = o;
  const store = () => path.join(app.getPath('userData'), 'features.json');
  function read() {
    try { const v = JSON.parse(fs.readFileSync(store(), 'utf8')); return { links: FX.cleanLinks(v && v.links), seen: FX.cleanSeen(v && v.seen) }; }
    catch (e) { return { links: {}, seen: [] }; } // 없거나 깨졌으면 기본
  }
  function write(v) {
    const f = store(), tmp = f + '.tmp', out = { links: FX.cleanLinks(v.links), seen: FX.cleanSeen(v.seen), savedAt: new Date().toISOString() };
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(out, null, 2));
    fs.renameSync(tmp, f);
    return { links: out.links, seen: out.seen };
  }
  // 생활습관 표 이름들 (읽기만). 못 읽으면 null
  function habitNames(text) {
    try { const d = Md.parse(text != null ? text : fs.readFileSync(file, 'utf8')); return d.habits ? d.habits.rows.map((r) => r.name) : []; } catch (e) { return null; }
  }
  function syncSeen(text) {
    const v = read(), names = habitNames(text); if (!names) return v;
    const add = FX.seenFrom(names).filter((id) => !v.seen.includes(id));
    return add.length ? write({ links: v.links, seen: v.seen.concat(add) }) : v;
  }
  const isSeen = (id) => read().seen.includes(id);
  function markSeen(id) { const v = read(); if (!FX.get(id) || !FX.get(id).fnHabit || v.seen.includes(id)) return v; return write({ links: v.links, seen: v.seen.concat([id]) }); }

  ipcMain.handle('ph:featuresGet', () => Object.assign({ ok: true }, syncSeen()));
  ipcMain.handle('ph:featuresSetLinks', (e, req) => {
    if (!req || typeof req !== 'object' || !req.links || typeof req.links !== 'object') throw new Error('요청 형식 오류');
    const v = read(); return Object.assign({ ok: true }, write({ links: req.links, seen: v.seen }));
  });
  ipcMain.handle('ph:featuresReset', () => { const v = read(); return Object.assign({ ok: true }, write({ links: {}, seen: v.seen })); });
  // 화면에만 보이던 일지 기능 줄(아직 표에 한 번도 없음)을 지움 = 꺼짐 표시만 (생활 기록 파일은 그대로)
  ipcMain.handle('ph:featuresHide', (e, req) => {
    const id = req && req.id; if (!FX.get(id) || !FX.get(id).fnHabit) throw new Error('일지 기능만 끌 수 있음');
    return Object.assign({ ok: true }, markSeen(id));
  });
  return { read, isSeen, markSeen, syncSeen, store };
};
