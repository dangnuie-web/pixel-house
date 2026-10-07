// 옷 갈아입기 차림 저장 (wardrobe 브랜치 2026-10-03, 비트). 생활 기록 파일이 아니라 앱 설정 폴더의 outfit.json 한 파일
//   위치: app.getPath('userData')/outfit.json (= ~/Library/Application Support/Pixel House/outfit.json). 시험(PH_SHOTS)은 임시 사용자 폴더
//   화면은 차림 값만 보낸다 (경로를 보낼 수 없음). 칸·값은 여기서 다시 검사: 정해진 칸만, 번호 1~99 정수 또는 null
//   쓰기: 임시 파일에 쓰고 이름 바꾸기 (쓰다 끊겨도 옛 파일이 남음)
// main.js에서 한 번 부른다: require('./outfit_ipc.js')({ ipcMain, app })
'use strict';
const fs = require('fs');
const path = require('path');

const SLOTS = ['top', 'bottom', 'outer', 'bag', 'hat', 'onepiece'];
function clean(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('차림 형식 오류');
  const out = {};
  Object.keys(o).forEach((k) => {
    if (!SLOTS.includes(k)) throw new Error('모르는 칸: ' + k);
    const v = o[k];
    if (v === null) { if (k === 'top' || k === 'bottom') throw new Error('상의·하의는 비울 수 없음'); out[k] = null; return; }
    if (!Number.isInteger(v) || v < 1 || v > 99) throw new Error('번호 오류: ' + k);
    out[k] = v;
  });
  return out;
}

module.exports = function register(o) {
  const { ipcMain, app } = o;
  const file = () => path.join(app.getPath('userData'), 'outfit.json');
  ipcMain.handle('ph:outfitGet', () => {
    try { const v = JSON.parse(fs.readFileSync(file(), 'utf8')); return { ok: true, outfit: clean(v && v.outfit ? v.outfit : v) }; }
    catch (e) { return { ok: true, outfit: null, missing: e.code === 'ENOENT' }; } // 없거나 깨졌으면 기본 차림 (화면이 정함)
  });
  ipcMain.handle('ph:outfitSet', (e, req) => {
    const outfit = clean(req);
    const f = file(), tmp = f + '.tmp';
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify({ outfit, savedAt: new Date().toISOString() }, null, 2));
    fs.renameSync(tmp, f);
    return { ok: true, outfit };
  });
  return { clean, file };
};
module.exports.clean = clean;
