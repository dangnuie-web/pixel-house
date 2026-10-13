// 시험이 띄울 Electron: 이 폴더 node_modules/electron 이 알려 주는 실행 파일 (맥 Electron.app/…/Electron, 윈도우 electron.exe)
//   2026-10-14 C4: 전엔 node_modules/.bin/electron(셸 대본)이었는데 윈도우는 .cmd 라 spawnSync 로 못 띄움 -> 패키지가 주는 진짜 실행 파일로
//   없으면 .bin/electron -> ~/dev/pixel-office 것 (그 전 방식)
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
function find() {
  try { const p = require(path.join(__dirname, '..', 'node_modules', 'electron')); if (typeof p === 'string' && fs.existsSync(p)) return p; } catch (e) { /* 실행 파일을 아직 안 받음 */ }
  const local = path.join(__dirname, '..', 'node_modules', '.bin', 'electron');
  return fs.existsSync(local) ? local : path.join(os.homedir(), 'dev', 'pixel-office', 'node_modules', '.bin', 'electron');
}
module.exports = find();
