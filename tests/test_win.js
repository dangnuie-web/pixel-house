// 윈도우판 시험 (C4, 2026-10-14 비트). 그림·창 없음 — 맥·윈도우 둘 다에서 돎. 실행: node tests/test_win.js
//   플랫폼 분기(맥 전용 메뉴·Dock·신호, 윈도우 AppUserModelId·메뉴 막대), 경로 검사(윈도우 \·드라이브, path.win32 로), CRLF 기록 파일 읽기·쓰기,
//   바탕화면 펫 커서 감시(클릭 통과), 설치 설정(NSIS·실행 파일 이름·Electron 고지·아이콘), 저장 자리(%APPDATA%\Pixel House), 워크플로
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (label, cond, extra) => { if (cond) pass++; else { fail++; console.log('  X ' + label + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); } };
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const throws = (fn) => { try { fn(); return false; } catch (e) { return true; } };

// ---- 1. 경로 검사 (electron/house_path.js) — 윈도우 경로 규칙(path.win32)과 맥(path.posix) 둘 다 ----
const HP = require('../electron/house_path.js');
for (const [name, P, house] of [['윈도우', path.win32, 'C:\\Users\\minji\\Documents\\PixelHouse'], ['맥', path.posix, '/Users/minji/Documents/PixelHouse']]) {
  const full = HP.safeMd(house, 'PixelHouse_생활기록.md', P);
  ok(name + ': 기록 파일 = 기록 폴더 안', full === P.join(house, 'PixelHouse_생활기록.md'), full);
  ok(name + ': 하위 폴더 / 는 됨', HP.safeMd(house, 'sub/log.md', P) === P.join(house, 'sub', 'log.md'));
  const bad = ['..\\x.md', 'a\\..\\..\\x.md', 'sub\\.env.md', 'C:\\x.md', 'C:x.md', '../x.md', '.env.md', 'a/../../x.md', '_to_delete/x.md', 'x.txt', 'a\0.md', '/', ''];
  const leaked = bad.filter((r) => !throws(() => HP.safeMd(house, r, P)));
  ok(name + ': \\·드라이브·..·숨김·비밀·_to_delete·md 아님·널 글자 막음', leaked.length === 0, leaked);
}
ok('기록 폴더가 없으면(온보딩 중) 막음', throws(() => HP.safeMd(null, 'a.md')));
ok('main.js 가 경로 검사를 house_path 로 함 (같은 규칙)', /HousePath\.safeMd\(HOUSE, rel\)/.test(read('electron/main.js')));

// ---- 2. CRLF 기록 파일 (메모장으로 고친 파일) ----
require('../js/data/settings.js');
const Md = require('../js/life_md.js');
const LW = require('../js/life_write.js');
const LL = require('../js/life_log.js');
const HE = require('../js/habit_edit.js'); globalThis.PHHabitEdit = globalThis.PHHabitEdit || HE;
const LT = require('../js/life_template.js');
const lf = LT.build(['water', 'yoga']).text;
const crlf = lf.replace(/\n/g, '\r\n');
ok('빈 기록 틀: LF (새 파일은 맥·윈도우 같은 줄 끝)', lf.length > 50 && !/\r/.test(lf));
ok('CRLF 파일 읽기 = LF 파일 읽기와 같음 (습관 표·섹션)', JSON.stringify(Md.parse(crlf)) === JSON.stringify(Md.parse(lf)));
const w1 = LW.setSlots(crlf, { habit: '물', value: 2, of: 6, date: '2026-10-14' });
ok('CRLF 파일에 물 칸 쓰기 → CRLF 그대로 (LF 섞이지 않음)', w1.changed && /물 2\/6/.test(w1.text) && !/[^\r]\n/.test(w1.text), w1.text.slice(-120));
const w2 = LW.setSlots(lf, { habit: '물', value: 2, of: 6, date: '2026-10-14' });
ok('LF 파일에 물 칸 쓰기 → LF 그대로', w2.changed && !/\r/.test(w2.text));
ok('CRLF·LF 결과 글자는 줄 끝만 다름', w1.text.replace(/\r\n/g, '\n') === w2.text);
let m1 = null; try { m1 = LL.addMeal(crlf, { date: '2026-10-14', kind: '점심', text: '김밥', time: '12:30' }); } catch (e) { m1 = { err: e.message }; }
const mt = m1 && (m1.text || (typeof m1 === 'string' ? m1 : null));
ok('CRLF 파일에 식사 쓰기 → CRLF 그대로', !!mt && mt.includes('김밥') && !/[^\r]\n/.test(mt), m1 && (m1.err || String(mt).slice(-160)));

// ---- 3. 플랫폼 분기 (electron/main.js) ----
const main = read('electron/main.js');
ok('맥 전용 앱 메뉴는 darwin 일 때만', /if \(process\.platform === 'darwin'\) tpl\.push\(\{ role: 'appMenu' \}\)/.test(main));
ok('Dock 아이콘 숨기기는 맥만 (app.dock 있을 때)', /process\.platform !== 'darwin' \|\| !app\.dock/.test(main));
ok('윈도우 AppUserModelId = build.appId', /process\.platform === 'win32'\) app\.setAppUserModelId\('app\.pixelhouse\.desktop'\)/.test(main) && JSON.parse(read('package.json')).build.appId === 'app.pixelhouse.desktop');
ok('윈도우 메뉴 막대는 Alt 로만 (autoHideMenuBar)', /autoHideMenuBar: process\.platform !== 'darwin'/.test(main));
ok('맥 전용 신호 SIGUSR1·2 안 씀 (윈도우에 없음)', !/SIGUSR/.test(main) && !/SIGUSR/.test(read('electron/desk_pet.js')));
ok('/usr/bin/open·osascript 안 씀 (앱 코드)', !['electron/main.js', 'electron/desk_pet.js', 'electron/profile_main.js'].some((f) => /\/usr\/bin\/|osascript/.test(read(f))));
ok('preload 가 화면에 플랫폼을 줌 (PHPlatform)', /exposeInMainWorld\('PHPlatform'/.test(read('electron/preload.js')));
ok('단축키 글: ⌘ 는 윈도우에서 Ctrl+ 로 (식사·잠 창)', ['js/log_modal.js', 'js/sleep_modal.js'].every((f) => /modKeys\(/.test(read(f)) && /replace\(\/⌘\/g, 'Ctrl\+'\)/.test(read(f))));
// 화면 글에 ⌘ 가 직접 박힌 곳이 modKeys 를 거치는 두 곳뿐인지
const jsFiles = []; (function walk(d) { for (const n of fs.readdirSync(path.join(ROOT, d))) { const r = d + '/' + n; if (fs.statSync(path.join(ROOT, r)).isDirectory()) walk(r); else if (/\.js$/.test(n)) jsFiles.push(r); } })('js');
const cmdUse = jsFiles.filter((f) => /⌘/.test(read(f).split('\n').filter((l) => !/^\s*\/\//.test(l) && !/replace\(\/⌘\/g/.test(l)).join('\n'))); // 주석·바꾸는 줄 자체는 뺌
ok('⌘ 가 든 화면 글 = 식사 창·잠 창 글(modKeys 거침)뿐', cmdUse.sort().join() === ['js/data/sleep_lines.js', 'js/log_modal.js'].join(), cmdUse);
ok('글꼴: 맥 Apple SD Gothic Neo 다음 윈도우 Malgun Gothic (맥 모양 그대로)', /--font: "Apple SD Gothic Neo"[^;]*"Malgun Gothic"/.test(read('css/app.css')) && /--font: "Apple SD Gothic Neo"[^;]*"Malgun Gothic"/.test(read('pet/pet.css')));

// ---- 4. 바탕화면 펫 커서 감시 (C2 클릭 통과) ----
const C = require('../electron/pet_cursor.js');
const B = { x: 100, y: 500, width: 300, height: 255 }, BOX = { cx: 250, by: 755, tw: 120, th: 113 };
const BODY = { x: 250, y: 700 }, AIR = { x: 250, y: 560 }, OUT = { x: 50, y: 50 };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
ok('통과 중 커서가 펫 몸 상자 안 → main 이 클릭 받기로 (화면 쪽 mousemove 가 안 와도, 윈도우 Actions 38453257327)', eq(C.step({ ignore: true, said: null }, BODY, BOX, B), { ignore: false, resetHit: true, clearSaid: false }));
ok('통과 중 창 안이지만 몸 밖(머리 위 빈 곳) → 그대로 통과', C.step({ ignore: true, said: null }, AIR, BOX, B).ignore === null);
ok('화면 쪽이 "펫 아님"이라 한 뒤엔 상자 안에 있는 동안 다시 안 켬 (깜빡임 없음), 창 밖에 나가면 잊음', C.step({ ignore: true, said: false }, BODY, BOX, B).ignore === null && eq(C.step({ ignore: true, said: false }, OUT, BOX, B), { ignore: null, resetHit: false, clearSaid: true }));
{ // 창 안 빈 곳에서 "펫 아님" → 창을 안 나가고 몸 위로 (Actions 38454677265 실패 순서): 빈 곳에서 잊고, 몸 위에서 켬
  let st = { ignore: true, said: false }; const r1 = C.step(st, AIR, BOX, B); if (r1.clearSaid) st.said = null; const r2 = C.step(st, BODY, BOX, B);
  ok('창 안 빈 곳("펫 아님") → 창 안 나가고 몸 위 → 클릭 받기', r1.clearSaid && r1.ignore === null && r2.ignore === false, [r1, r2]); }
ok('클릭 받기 중 커서가 창 밖 → 다시 통과 + 화면 hit 모름으로', eq(C.step({ ignore: false }, OUT, BOX, B), { ignore: true, resetHit: true, clearSaid: true }));
ok('클릭 받기 중 커서가 창 안 → 그대로 (화면 쪽 판단)', C.step({ ignore: false }, { x: 200, y: 600 }, BOX, B).ignore === null);
ok('말풍선 메뉴가 열려 있으면 창 안 어디든 클릭 받기', C.step({ ignore: true, dialog: true, said: false }, AIR, BOX, B).ignore === false);
ok('끄는 중(drag)·숨김 → 그대로', C.step({ ignore: false, drag: true }, OUT, BOX, B).ignore === null && C.step({ ignore: true, hidden: true }, BODY, BOX, B).ignore === null);
ok('창 오른쪽·아래 끝 칸은 밖', !C.inWin({ x: 400, y: 600 }, B) && !C.inWin({ x: 200, y: 755 }, B) && C.inWin({ x: 399, y: 754 }, B));
const dp = read('electron/desk_pet.js');
ok('펫이 커서 감시를 켬 (시험 창은 안 켬), 끌 때 멈춤', /watchCursor\(\);/.test(dp) && /if \(cursorTimer \|\| SHOTS\) return;/.test(dp) && /clearInterval\(cursorTimer\)/.test(dp));
ok('펫 화면이 hitReset 을 받음 (preload 통로 + pet.js)', /'pet:hitReset'/.test(read('electron/pet_preload.js')) && /DP\.on\('pet:hitReset', \(\) => \{ hit = null; \}\)/.test(read('pet/pet.js')));
ok('펫 창: 작업 표시줄에 안 나옴·항상 위·포커스 안 뺏음', /skipTaskbar: true/.test(dp) && /alwaysOnTop: !SHOTS/.test(dp) && /focusable: false/.test(dp));

// ---- 5. 설치 설정 (package.json build) ----
const pkg = JSON.parse(read('package.json')), b = pkg.build;
ok('윈도우 = NSIS x64 하나', JSON.stringify(b.win.target) === JSON.stringify([{ target: 'nsis', arch: ['x64'] }]));
ok('실행 파일 PixelHouse.exe (영어), 받는 파일 Pixel-House-windows-setup.exe', b.win.executableName === 'PixelHouse' && b.win.artifactName === 'Pixel-House-windows-setup.exe' && b.nsis.artifactName === 'Pixel-House-windows-setup.exe');
ok('한 번에 설치(oneClick)·사용자 폴더(perMachine false)·관리자 권한 없음', b.nsis.oneClick === true && b.nsis.perMachine === false && !b.win.requestedExecutionLevel);
ok('시작 메뉴·제거 이름 "Pixel House"', b.nsis.shortcutName === 'Pixel House' && b.nsis.uninstallDisplayName === 'Pixel House');
ok('서명 설정 없음 (서명 안 함)', !b.win.certificateFile && !b.win.signtoolOptions && !b.win.sign);
ok('Electron 고지(LICENSE·LICENSES.chromium.html)를 맥·윈도우 앱 resources 에', JSON.stringify(b.extraResources) === JSON.stringify([{ from: 'node_modules/electron/dist/LICENSE', to: 'LICENSE.electron.txt' }, { from: 'node_modules/electron/dist/LICENSES.chromium.html', to: 'LICENSES.chromium.html' }]));
ok('맥 dmg 받는 파일 Pixel-House-mac-arm64.dmg (버전·공백 없음)', b.mac.artifactName === 'Pixel-House-mac-arm64.dmg');
ok('저장 자리 = 앱 이름 "Pixel House" (윈도우 %APPDATA%\\Pixel House, 맥 ~/Library/Application Support/Pixel House)', pkg.productName === 'Pixel House' && b.productName === 'Pixel House');
const ico = fs.readFileSync(path.join(ROOT, 'icons', 'public', 'icon.ico'));
const icoN = ico.readUInt16LE(4), icoSizes = Array.from({ length: icoN }, (_, i) => ico[6 + i * 16] || 256);
ok('윈도우 아이콘 icons/public/icon.ico = 16·32·48·64·128·256', ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1 && [16, 32, 48, 64, 128, 256].every((n) => icoSizes.includes(n)), icoSizes);
const exp = fs.existsSync(path.join(ROOT, 'tools', 'export_public.js')) ? read('tools/export_public.js') : null; // 공개 저장소엔 내보내기 도구가 없음 -> 건너뜀
if (exp) ok('공개 내보내기: 윈도우 아이콘·워크플로·연기 시험·이 시험을 싣고, 공용판 package.json build.win.icon', /'icons\/public\/icon\.ico'/.test(exp) && /win: Object\.assign\(\{\}, p\.build && p\.build\.win, \{ icon: 'icons\/public\/icon\.ico' \}\)/.test(exp) && /\.github\/workflows\/windows\.yml/.test(exp) && /'tools\/smoke_win\.js'/.test(exp) && /'tests\/test_win\.js'/.test(exp));
ok('시험이 띄우는 Electron = 패키지가 주는 실행 파일 (윈도우 .cmd 대본 아님)', /require\(path\.join\(__dirname, '\.\.', 'node_modules', 'electron'\)\)/.test(read('tests/electron_bin.js')));

// ---- 6. 워크플로 (.github/workflows/windows.yml) ----
const wf = read('.github/workflows/windows.yml');
ok('워크플로: 손으로만 실행(workflow_dispatch), 푸시 때 안 돎', /on:\s*\n\s*workflow_dispatch:/.test(wf) && !/^\s*(push|pull_request|schedule):/m.test(wf));
ok('워크플로: 읽기 권한만, 비밀값 안 씀', /permissions:\s*\n\s*contents: read/.test(wf) && !/secrets\.|GITHUB_TOKEN|contents: write/.test(wf));
ok('워크플로: 줄 끝 그대로·npm ci·Electron 받기·시험·exe·고지 확인·설치·켜 보기·제거·Artifacts 7일', ['core.autocrlf false', 'npm ci', 'node_modules/electron/install.js', 'scripts.test', 'electron-builder --win --publish never', 'LICENSE.electron.txt', "'/S'", 'tools/smoke_win.js', 'Uninstall', 'retention-days: 7'].every((k) => wf.includes(k)), ['core.autocrlf false', 'npm ci', 'install.js', 'scripts.test', 'electron-builder', 'LICENSE.electron.txt', '/S', 'smoke_win', 'Uninstall', 'retention'].filter((k) => !wf.includes(k)));
// (2026-10-14 첫 푸시 때 "workflow file issue" 0초 실패: 한 줄 run: 안의 ': ' 를 YAML 이 키로 읽음) 한 줄 run: 값에는 ': '·' #' 가 없어야 함 → 그런 줄은 run: | 로
const badRun = wf.split('\n').filter((l) => /^\s*(- )?run: (?![|>'"])/.test(l) && /: | #/.test(l.replace(/^\s*(- )?run: /, '')));
ok('워크플로: 한 줄 run: 값에 ": "·" #" 없음 (YAML 이 깨지지 않게)', badRun.length === 0, badRun);
ok('워크플로: 릴리스·게시 없음 (시험판 올리기는 따로 손으로)', !/gh release|softprops|action-gh-release|--publish always/.test(wf));
const smoke = read('tools/smoke_win.js');
ok('연기 시험: Node 기본 모듈만 (서버에서 설치 없이)', (smoke.match(/require\('([^']+)'\)/g) || []).every((r) => /'(fs|os|path|http|child_process)'/.test(r)));
ok('연기 시험: 창 뜸·%APPDATA%·기록 파일·펫·클릭 통과·키체인 막기', ['index.html', "'Pixel House'", '기록 파일이 기록 폴더에 생김', '바탕화면 펫 켜기', '클릭 통과', '--use-mock-keychain'].every((k) => smoke.includes(k)));
ok('앱의 연기 시험 상태 쓰기는 PH_SMOKE_STATE 가 있을 때만', /const f = process\.env\.PH_SMOKE_STATE; if \(!f\) return;/.test(main));

console.log(`test_win: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
