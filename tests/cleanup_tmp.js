// 시험이 만든 임시 사용자 폴더 지우기: 이 시험 프로세스가 만든 것만.
// electron/main.js finish()도 지우지만, 앱이 꺼지는 도중 Chromium이 세션 파일을 다시 써서 폴더가 남음(2026-10-03 84개 쌓임).
// 그래서 Electron 프로세스가 끝난 뒤 시험 쪽에서 한 번 더 지운다.
// 2026-10-03: 여러 작업 폴더(worktree)가 같은 시간에 시험을 돌리면 "이 시험 뒤에 생긴 폴더 전부"를 지우다 남의 시험 폴더(백업 등)까지 지워 흔들렸음.
//   -> 시험마다 표시(PH_SHOTS_TAG = 'p' + 시험 프로세스 pid)를 정하고, 메인이 폴더 이름을 pixel-house-shots-<표시>-XXXXXX로 만듦. 여기서는 그 표시가 붙은 것만 지움.
//   이 파일을 require하면 표시가 정해지므로, Electron을 띄우기 전에(env를 만들기 전에) 먼저 require한다.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
if (!/^[A-Za-z0-9]{1,24}$/.test(process.env.PH_SHOTS_TAG || '')) process.env.PH_SHOTS_TAG = 'p' + process.pid;
const TAG = process.env.PH_SHOTS_TAG;
module.exports = function cleanupShotDirs() {
  const dir = os.tmpdir(), re = new RegExp('^pixel-house-shots-' + TAG + '-[A-Za-z0-9]+$'); let n = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!re.test(name)) continue;
    try { fs.rmSync(path.join(dir, name), { recursive: true, force: true }); n++; } catch (e) { /* 이미 없음 */ }
  }
  return n;
};
module.exports.TAG = TAG;
