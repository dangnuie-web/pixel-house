// 설정 화면 실제 창 시험 (2026-10-08 비트): tools/shots_settings.js 를 두 번 돌린다. 실행: node tests/test_settings_app.js
//   1) 공용판 사용자 (온보딩 끝난 profile.json 을 시험 임시 사용자 폴더에 미리 씀, 기록 폴더 = 빈 임시 폴더 + 빈 틀 기록 파일). 가짜 이름 "민지"
//   2) 제작자 묶음 (가짜 자료 tests/fixtures/house 의 임시 사본): 설정 버튼이 없는지만
//   실제 생활 기록·앱 설정은 안 씀. 끝나면 임시 폴더는 휴지통으로 (trash, 2026-10-08 제작자 결정: rm 안 씀)
'use strict';
const cleanupShots = require('./cleanup_tmp.js'); // 먼저: 이 시험의 임시 폴더 표시(PH_SHOTS_TAG)를 정함
const { spawnSync } = require('child_process');
const path = require('path'), os = require('os'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const ELECTRON = require('./electron_bin.js');
process.env.PH_PROFILE = 'default'; // 공용판 기본값으로 읽기 (기록 파일 이름 = PixelHouse_생활기록.md)
const S = require(path.join(ROOT, 'js', 'data', 'settings.js'));
const LT = require(path.join(ROOT, 'js', 'life_template.js'));

function run(env) {
  const r = spawnSync(ELECTRON, ['.'], { cwd: ROOT, env, encoding: 'utf8', timeout: 300000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('RESULT '));
  if (!line) { console.log('  X 결과 없음', r.status, r.error || '', (r.stdout || '').slice(-800), (r.stderr || '').slice(-1500)); return { pass: 0, fail: 1 }; }
  const res = JSON.parse(line.slice(7));
  res.failed.forEach((f) => console.log('  X ' + f.label + (f.extra !== undefined ? ' ' + JSON.stringify(f.extra) : '')));
  if (res.errors.length) console.log('  화면 오류:', res.errors);
  return res;
}
const left = [];
// 1) 공용판
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-house-settings-'));
left.push(dir);
fs.writeFileSync(path.join(dir, S.LIFE_FILE), LT.build(['water']).text);
const profile = { bundle: 'default', name: '민지', cat: '콩이', avatar: 'avatar1', house: 'room1', dir, furniture: {}, createdAt: '2026-10-08T00:00:00.000Z' };
const base = Object.assign({}, process.env, { PH_SHOTS: '1', PH_SHOTS_SCRIPT: 'shots_settings.js', PH_TODAY: '2026-10-08' });
delete base.PH_PROFILE_USER;
const a = run(Object.assign({}, base, { PH_PROFILE: 'default', PH_HOUSE: dir, PH_SHOTS_PROFILE: JSON.stringify(profile) }));
// 2) 제작자 묶음 (묶음 파일이 없는 공개용 복사본에선 건너뜀)
let b = { pass: 0, fail: 0 };
if (fs.existsSync(path.join(ROOT, 'profiles', 'player', 'profile.json'))) {
  const house = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-house-settings-fixture-'));
  left.push(house);
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'house'), house, { recursive: true });
  b = run(Object.assign({}, base, { PH_PROFILE: 'player', PH_HOUSE: house, PH_SETTINGS_MODE: 'player' }));
}
const re = new RegExp('^pixel-house-shots-' + cleanupShots.TAG + '-[A-Za-z0-9]+$');
const shots = fs.readdirSync(os.tmpdir()).filter((n) => re.test(n)).map((n) => path.join(os.tmpdir(), n));
spawnSync('/usr/bin/trash', left.concat(shots), { encoding: 'utf8' }); // 이 시험이 만든 임시 폴더만
const pass = a.pass + b.pass, fail = a.fail + b.fail;
console.log(`test_settings_app: ${pass} 통과, ${fail} 실패 (캡처: preview/set_*.png)`);
process.exit(fail ? 1 : 0);
