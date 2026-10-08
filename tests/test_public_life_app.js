// 공용판 최신 기능 실제 창 시험 (2026-10-09 비트): tools/shots_publiclife.js 를 돌린다. 실행: node tests/test_public_life_app.js
//   공용판 사용자 (온보딩 끝난 profile.json 을 시험 임시 사용자 폴더에 미리 씀), 기록 폴더 = 빈 임시 폴더 + 온보딩과 같은 빈 틀 기록 파일(물만). 가짜 이름 "민지"
//   실제 생활 기록·앱 설정은 안 씀. 끝나면 이 시험이 만든 임시 폴더만 휴지통으로 (trash, 2026-10-08 제작자 결정: rm 안 씀)
'use strict';
const cleanupShots = require('./cleanup_tmp.js'); // 먼저: 이 시험의 임시 폴더 표시(PH_SHOTS_TAG)를 정함
const { spawnSync } = require('child_process');
const path = require('path'), os = require('os'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const ELECTRON = require('./electron_bin.js');
process.env.PH_PROFILE = 'default'; // 공용판 기본값으로 읽기 (기록 파일 이름 = PixelHouse_생활기록.md)
const S = require(path.join(ROOT, 'js', 'data', 'settings.js'));
const LT = require(path.join(ROOT, 'js', 'life_template.js'));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-house-publife-'));
fs.writeFileSync(path.join(dir, S.LIFE_FILE), LT.build(['water']).text);
const profile = { bundle: 'default', name: '민지', cat: '콩이', avatar: 'avatar1', house: 'room1', dir, furniture: {}, createdAt: '2026-10-08T00:00:00.000Z' };
const env = Object.assign({}, process.env, { PH_SHOTS: '1', PH_SHOTS_SCRIPT: 'shots_publiclife.js', PH_TODAY: '2026-10-08', PH_PROFILE: 'default', PH_HOUSE: dir, PH_SHOTS_PROFILE: JSON.stringify(profile) });
delete env.PH_PROFILE_USER;
const r = spawnSync(ELECTRON, ['.'], { cwd: ROOT, env, encoding: 'utf8', timeout: 300000 });
const line = (r.stdout || '').split('\n').find((l) => l.startsWith('RESULT '));
let pass = 0, fail = 1;
if (!line) console.log('  X 결과 없음', r.status, r.error || '', (r.stdout || '').slice(-800), (r.stderr || '').slice(-1500));
else {
  const res = JSON.parse(line.slice(7));
  res.failed.forEach((f) => console.log('  X ' + f.label + (f.extra !== undefined ? ' ' + JSON.stringify(f.extra) : '')));
  if (res.errors.length) console.log('  화면 오류:', res.errors);
  pass = res.pass; fail = res.fail;
}
const re = new RegExp('^pixel-house-shots-' + cleanupShots.TAG + '-[A-Za-z0-9]+$');
const shots = fs.readdirSync(os.tmpdir()).filter((n) => re.test(n)).map((n) => path.join(os.tmpdir(), n));
spawnSync('/usr/bin/trash', [dir].concat(shots), { encoding: 'utf8' }); // 이 시험이 만든 임시 폴더만
console.log(`test_public_life_app: ${pass} 통과, ${fail} 실패 (캡처: preview/publife_*.png)`);
process.exit(fail ? 1 : 0);
