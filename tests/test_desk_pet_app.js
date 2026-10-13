// 바탕화면 펫 실제 창 시험 (2026-10-13 비트): tools/shots_deskpet.js 를 세 번 돌린다. 실행: node tests/test_desk_pet_app.js
//   1) 공용판, 펫 켜 둔 사용자 (profile.json desktopPet true, 가짜 이름 "민지", 펫 이름 "나비"): 펫 창·인사·메뉴·물 쓰기·아래 줄·설정 스위치·이름 바꾸기·펫 메뉴로 끄기
//   2) 공용판, 처음 값 (desktopPet 없음): 펫 안 뜸 -> 설정 스위치로 켜짐
//   3) 제작자 묶음 (가짜 자료 tests/fixtures/house 임시 사본): 펫 안 뜸, 설정 버튼 없음
//   시험 창은 집 창·펫 창 모두 투명도 0·마우스 통과·키보드 안 뺏음 (fdebdba). 실제 생활 기록·앱 설정은 안 씀. 끝나면 임시 폴더는 휴지통으로 (trash)
'use strict';
const cleanupShots = require('./cleanup_tmp.js'); // 먼저: 이 시험의 임시 폴더 표시(PH_SHOTS_TAG)를 정함
const { spawnSync } = require('child_process');
const path = require('path'), os = require('os'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const ELECTRON = require('./electron_bin.js');
process.env.PH_PROFILE = 'default';
const S = require(path.join(ROOT, 'js', 'data', 'settings.js'));
const LT = require(path.join(ROOT, 'js', 'life_template.js'));

function run(label, env) {
  const r = spawnSync(ELECTRON, ['.'], { cwd: ROOT, env, encoding: 'utf8', timeout: 300000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('RESULT '));
  if (!line) { console.log('  X [' + label + '] 결과 없음', r.status, r.error || '', (r.stdout || '').slice(-800), (r.stderr || '').slice(-1500)); return { pass: 0, fail: 1 }; }
  const res = JSON.parse(line.slice(7));
  res.failed.forEach((f) => console.log('  X [' + label + '] ' + f.label + (f.extra !== undefined ? ' ' + JSON.stringify(f.extra) : '')));
  if (res.errors.length) { console.log('  [' + label + '] 화면 오류:', res.errors); res.fail++; } else res.pass++;
  return res;
}
// 제작자 실제 기록 파일 (있으면): 시험 앞뒤로 수정 시각·크기만 비교 (열지 않음, 결재와_보안 7절)
function realStamp() {
  try {
    const b = JSON.parse(fs.readFileSync(path.join(ROOT, 'profiles', 'player', 'profile.json'), 'utf8'));
    const dir = String(b.houseDir || '').replace(/^~(?=\/)/, os.homedir()), rel = ((b.patch || {}).PH_SETTINGS || {}).LIFE_FILE;
    if (!dir || !rel) return null;
    const st = fs.statSync(path.join(dir, ...rel.split('/'))); return st.mtimeMs + ':' + st.size;
  } catch (e) { return null; }
}
const left = [];
const real0 = realStamp();
const base = Object.assign({}, process.env, { PH_SHOTS: '1', PH_SHOTS_SCRIPT: 'shots_deskpet.js', PH_TODAY: '2026-10-13' });
delete base.PH_PROFILE_USER;
function publicDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-house-deskpet-'));
  left.push(dir);
  fs.writeFileSync(path.join(dir, S.LIFE_FILE), LT.build(['water']).text);
  return dir;
}
const prof = (dir, extra) => JSON.stringify(Object.assign({ bundle: 'default', name: '민지', cat: '나비', avatar: 'avatar1', house: 'room1', dir, furniture: {}, createdAt: '2026-10-13T00:00:00.000Z' }, extra));
const results = [];
// 1) 켜 둔 사용자
const d1 = publicDir();
results.push(run('켜짐', Object.assign({}, base, { PH_PROFILE: 'default', PH_HOUSE: d1, PH_SHOTS_PROFILE: prof(d1, { desktopPet: true }), PH_DESKPET_MODE: 'on' })));
// 2) 처음 값
const d2 = publicDir();
results.push(run('처음 값', Object.assign({}, base, { PH_PROFILE: 'default', PH_HOUSE: d2, PH_SHOTS_PROFILE: prof(d2), PH_DESKPET_MODE: 'off' })));
// 3) 제작자 묶음 (공개용 복사본에선 건너뜀)
if (fs.existsSync(path.join(ROOT, 'profiles', 'player', 'profile.json'))) {
  const house = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-house-deskpet-fixture-'));
  left.push(house);
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'house'), house, { recursive: true });
  results.push(run('제작자 묶음', Object.assign({}, base, { PH_PROFILE: 'player', PH_HOUSE: house, PH_DESKPET_MODE: 'player' })));
}
const real1 = realStamp();
let pass = results.reduce((a, r) => a + r.pass, 0), fail = results.reduce((a, r) => a + r.fail, 0);
if (real0 !== real1) { fail++; console.log('  X 실제 생활 기록 파일이 바뀜 (시험이 쓰면 안 됨)'); } else pass++;
const re = new RegExp('^pixel-house-shots-' + cleanupShots.TAG + '-[A-Za-z0-9]+$');
const shots = fs.readdirSync(os.tmpdir()).filter((n) => re.test(n)).map((n) => path.join(os.tmpdir(), n));
spawnSync('/usr/bin/trash', left.concat(shots), { encoding: 'utf8' }); // 이 시험이 만든 임시 폴더만
console.log(`test_desk_pet_app: ${pass} 통과, ${fail} 실패 (캡처: preview/deskpet_*.png)`);
process.exit(fail ? 1 : 0);
