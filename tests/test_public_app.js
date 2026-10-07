// 공용판 흐름 시험 (실제 Electron 창): tools/shots_public.js 를 돌리고 결과를 읽는다. 실행: node tests/test_public_app.js
//   설정 묶음 = 공용(PH_PROFILE=default), 임시 사용자 폴더(첫 실행), 기록 폴더 = 빈 임시 폴더. 실제 생활 기록·제작자 묶음 안 씀
'use strict';
const cleanupShots = require('./cleanup_tmp.js'); // 먼저: 이 시험의 임시 폴더 표시(PH_SHOTS_TAG)를 정함
const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const ELECTRON = require('./electron_bin.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-house-public-'));
const env = Object.assign({}, process.env, { PH_SHOTS: '1', PH_PROFILE: 'default', PH_HOUSE: dir, PH_DEFAULT_DIR: dir, PH_TODAY: '2026-10-08', PH_SHOTS_SCRIPT: 'shots_public.js' });
delete env.PH_PROFILE_USER;
const r = spawnSync(ELECTRON, ['.'], { cwd: ROOT, env, encoding: 'utf8', timeout: 300000 });
const line = (r.stdout || '').split('\n').find((l) => l.startsWith('RESULT '));
let failN = 1, pass = 0;
if (!line) console.log('  X 결과 없음', r.status, r.error || '', (r.stderr || '').slice(-2000));
else {
  const res = JSON.parse(line.slice(7));
  res.failed.forEach((f) => console.log('  X ' + f.label + (f.extra !== undefined ? ' ' + JSON.stringify(f.extra) : '')));
  if (res.errors.length) console.log('  화면 오류:', res.errors);
  pass = res.pass; failN = res.fail;
}
cleanupShots();
fs.rmSync(dir, { recursive: true, force: true }); // 시험이 만든 임시 기록 폴더만 지움
console.log(`test_public_app: ${pass} 통과, ${failN} 실패 (캡처: preview/public_*.png)`);
process.exit(failN ? 1 : 0);
