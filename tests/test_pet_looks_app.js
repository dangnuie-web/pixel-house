// 펫 5종 모습 실제 창 시험 (2026-10-13 비트): 대화창 초상 + 바탕화면 펫 그림이 "앱 파일만으로" 읽히는지. 실행: node tests/test_pet_looks_app.js
//   왜: 공개 v0.1.0 은 assets/ 가 앱에 안 들어가 대화창 초상이 깨졌는데(preview/portrait_public_dialog.png), 시험이 모두 개발 폴더에서 돌아 못 잡음
//   방법: package.json build.files 에 든 파일만 임시 폴더로 복사 (+ 시험 스크립트 tools/shots_petlooks.js 한 개) -> 그 폴더에서 Electron을 펫마다 한 번씩
//   공용판, 가짜 이름 "민지", 바탕화면 펫 켬, 임시 기록 폴더. 시험 창은 투명도 0 (fdebdba). 캡처: preview/petlook_<펫>_*.png. 끝나면 임시 폴더는 휴지통으로 (trash)
'use strict';
const cleanupShots = require('./cleanup_tmp.js');
const { spawnSync } = require('child_process');
const path = require('path'), os = require('os'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const ELECTRON = require('./electron_bin.js');
process.env.PH_PROFILE = 'default';
const S = require(path.join(ROOT, 'js', 'data', 'settings.js'));
const LT = require(path.join(ROOT, 'js', 'life_template.js'));
const PETS = require(path.join(ROOT, 'js', 'data', 'pet_lines.js')).PH_PETS;

let pass = 0, fail = 0;
const ok = (label, cond, extra) => { if (cond) pass++; else { fail++; console.log('  X ' + label + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); } };
const left = [];

// build.files 대로 복사 ("폴더/**" = 폴더 통째, 나머지 = 파일 하나, "!**/.DS_Store" = 빼기). 이 저장소 build.files 모양만 받음 (다른 모양이면 시험 실패)
function copyAppFiles(dest) {
  const files = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).build.files;
  const odd = [];
  for (const f of files) {
    if (f === '!**/.DS_Store') continue;
    const m = /^([A-Za-z0-9_./-]+)\/\*\*$/.exec(f);
    if (m) fs.cpSync(path.join(ROOT, m[1]), path.join(dest, m[1]), { recursive: true, filter: (s) => path.basename(s) !== '.DS_Store' });
    else if (/^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/.test(f) && fs.existsSync(path.join(ROOT, f))) { fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(dest, f)); }
    else odd.push(f);
  }
  return odd;
}

const app = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-house-petlooks-app-'));
left.push(app);
const odd = copyAppFiles(app);
ok('build.files 모양을 다 읽음', odd.length === 0, odd);
fs.mkdirSync(path.join(app, 'tools'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'tools', 'shots_petlooks.js'), path.join(app, 'tools', 'shots_petlooks.js'));
ok('앱 파일 복사본: assets/ 없음, portraits/ 에 초상 5장', !fs.existsSync(path.join(app, 'assets')) && Object.values(PETS).every((p) => fs.existsSync(path.join(app, 'portraits', p.portrait))));

const OUT = path.resolve(ROOT, process.env.PH_SHOTS_OUT || 'preview'); // 절대 경로도 받음 (path.join 이면 저장소 아래로 붙음)
const base = Object.assign({}, process.env, { PH_SHOTS: '1', PH_SHOTS_SCRIPT: 'shots_petlooks.js', PH_TODAY: '2026-10-13', PH_PROFILE: 'default', PH_SHOTS_OUT: OUT });
delete base.PH_PROFILE_USER;
for (const id of Object.keys(PETS)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-house-petlooks-'));
  left.push(dir);
  fs.writeFileSync(path.join(dir, S.LIFE_FILE), LT.build(['water']).text);
  const prof = JSON.stringify({ bundle: 'default', name: '민지', pet: id, avatar: 'avatar1', house: 'room1', dir, furniture: {}, desktopPet: true, createdAt: '2026-10-13T00:00:00.000Z' });
  const r = spawnSync(ELECTRON, ['.'], { cwd: app, env: Object.assign({}, base, { PH_HOUSE: dir, PH_SHOTS_PROFILE: prof, PH_PETLOOK: id }), encoding: 'utf8', timeout: 180000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('RESULT '));
  if (!line) { ok('[' + id + '] 결과 있음', false, { status: r.status, out: (r.stdout || '').slice(-600), err: (r.stderr || '').slice(-1200) }); continue; }
  const res = JSON.parse(line.slice(7));
  pass += res.pass; fail += res.fail;
  res.failed.forEach((f) => console.log('  X ' + f.label + (f.extra !== undefined ? ' ' + JSON.stringify(f.extra) : '')));
  ok('[' + id + '] 화면 오류 없음', !res.errors.length, res.errors);
}

const re = new RegExp('^pixel-house-shots-' + cleanupShots.TAG + '-[A-Za-z0-9]+$');
const shots = fs.readdirSync(os.tmpdir()).filter((n) => re.test(n)).map((n) => path.join(os.tmpdir(), n));
spawnSync('/usr/bin/trash', left.concat(shots), { encoding: 'utf8' });
console.log(`test_pet_looks_app: ${pass} 통과, ${fail} 실패 (캡처: preview/petlook_*.png)`);
process.exit(fail ? 1 : 0);
