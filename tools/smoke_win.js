#!/usr/bin/env node
// 설치한 앱을 진짜로 켜 보는 연기 시험 (C5 윈도우판, 2026-10-14 비트). Node 기본 모듈만 (깃허브 Actions 윈도우 서버에서 공개 저장소 그대로 돎). 설치 없음
// 실행:
//   윈도우(Actions): node tools/smoke_win.js "<설치된 PixelHouse.exe>" --shot out/smoke
//   맥(개발 확인):   node tools/smoke_win.js node_modules/electron/dist/Electron.app/Contents/MacOS/Electron . --hide --shot <폴더>
// 하는 일 (오피스 윈도우 Actions 에서 겪은 일을 미리 넣음: 창이 안 뜸·가짜 APPDATA 없는 폴더·Electron 고지 빠짐)
//   1. 앱을 --remote-debugging-port 로 켬 → 창(index.html)이 뜨는지 (오피스는 "설치 exe 창 안 뜸"으로 한 번 실패)
//   2. 저장 폴더: 윈도우 = 진짜 %APPDATA%\Pixel House (서버는 일이 끝나면 사라짐). 맥 = 임시 폴더(PH_USERDATA, 제작자 실제 설정을 안 건드림)
//   3. 첫 실행 온보딩을 화면 함수로 끝냄(이름 "민지"·원룸·기록 폴더 = 임시 폴더) → 기록 파일이 생기는지, 줄 끝, 집 화면
//   4. 바탕화면 펫 켜기(설정 화면과 같은 함수) → 펫 창이 뜨는지, 투명 창이 클릭 통과인지
//      윈도우만: 진짜 커서를 펫 위로 → 클릭 받기 → 멀리 → 다시 클릭 통과 (오피스 펫 버그 = 커서가 떠난 뒤에도 클릭을 먹음)
//   5. 화면 PNG (--shot 폴더: house.png·pet.png), 앱 끄기
// 상태는 앱이 PH_SMOKE_STATE 파일에 0.3초마다 씀 (electron/main.js smokeState, 이 시험 때만)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const shotAt = args.indexOf('--shot');
const pos = args.filter((a, i) => !a.startsWith('--') && !(shotAt >= 0 && i === shotAt + 1)); // --shot 없을 때 첫 인자를 빼던 것 고침 (2026-10-14)
const exe = pos[0], appDir = pos[1] || null;
const shotDir = shotAt >= 0 ? path.resolve(args[shotAt + 1]) : null;
const HIDE = args.includes('--hide');
const WIN = process.platform === 'win32';
if (!exe || !fs.existsSync(exe)) { console.error('앱 실행 파일이 없어요: ' + exe); process.exit(2); }

let pass = 0, fail = 0;
const check = (label, cond, extra) => { if (cond) { pass++; console.log('  통과 ' + label); } else { fail++; console.log('  X ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 600) : '')); } };

// ---- 크롬 개발 도구 통로 (CDP): Node 22 WebSocket ----
const getJson = (port, p) => new Promise((res) => {
  const rq = http.get({ host: '127.0.0.1', port, path: p, timeout: 2000 }, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(null); } }); });
  rq.on('error', () => res(null)); rq.on('timeout', () => { rq.destroy(); res(null); });
});
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP 연결 실패')); });
  let id = 0; const wait = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(typeof m.data === 'string' ? m.data : m.data.toString()); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
  const send = (method, params) => new Promise((res) => { const n = ++id; wait.set(n, res); ws.send(JSON.stringify({ id: n, method, params: params || {} })); setTimeout(() => { if (wait.has(n)) { wait.delete(n); res({ error: { message: '시간 초과 ' + method } }); } }, 20000); });
  const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.exceptionDetails ? { __err: r.result.exceptionDetails.text + ' ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || '') } : r.result ? r.result.result.value : { __err: r.error && r.error.message }; };
  const shot = async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); if (r.result && r.result.data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); return true; } return false; };
  return { ws, send, evaluate, shot, close: () => { try { ws.close(); } catch (e) { /* 닫힘 */ } } };
}
// 윈도우 진짜 커서 옮기기 (user32 SetCursorPos). 다른 OS 는 false (맥은 손 권한이 필요해 안 함)
function moveCursor(x, y) {
  if (!WIN) return false;
  const ps = 'Add-Type -Name U -Namespace W -MemberDefinition \'[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);\'; [W.U]::SetCursorPos(' + Math.round(x) + ',' + Math.round(y) + ') | Out-Null';
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', timeout: 30000 });
  return true;
}

// 윈도우: 커서를 (x, y)에 두고 SendInput 상대 이동 n번 (진짜 마우스처럼 저수준 훅을 거침) — forward 진단용. 다른 OS 는 false
function sendMoves(x, y, n) {
  if (!WIN) return false;
  const ps = 'Add-Type -Name U2 -Namespace W2 -MemberDefinition \'[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int d, int e);\'; '
    + '[W2.U2]::SetCursorPos(' + x + ',' + y + ') | Out-Null; for ($i = 0; $i -lt ' + n + '; $i++) { [W2.U2]::mouse_event(1, ($i % 2) * 2 - 1, 0, 0, 0); Start-Sleep -Milliseconds 80 }';
  try { execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', timeout: 30000 }); return true; } catch (e) { return 'ERR ' + e.message; }
}
// 윈도우: 펫을 따라가며 커서 옮기기. 상태 파일(PH_SMOKE_STATE)의 지금 펫 자리(cx, by - th*0.4)로 0.15초마다, 클릭 받기(ignore false)가 되면 그만
function followCursor(stateFile, n) {
  if (!WIN) return false;
  const ps = 'Add-Type -Name U -Namespace W -MemberDefinition \'[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);\'; '
    + 'for ($i = 0; $i -lt ' + n + '; $i++) { try { $s = Get-Content -Raw -LiteralPath \'' + stateFile + '\' | ConvertFrom-Json } catch { Start-Sleep -Milliseconds 150; continue }; '
    + 'if ($s.pet -eq $null) { break }; if ($i -gt 2 -and -not $s.pet.ignore) { break }; '
    + '[W.U]::SetCursorPos([int]$s.pet.cx + ($i % 2), [int]($s.pet.by - $s.pet.th * 0.4)) | Out-Null; Start-Sleep -Milliseconds 150 }';
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', timeout: 60000 });
  return true;
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(process.env.PH_TMP || os.tmpdir(), 'ph-smoke-'));
  const house = path.join(tmp, 'house'), stateFile = path.join(tmp, 'state.json');
  const env = Object.assign({}, process.env, { PH_DEFAULT_DIR: house, PH_SMOKE_STATE: stateFile, ELECTRON_ENABLE_LOGGING: '1' });
  ['ELECTRON_RUN_AS_NODE', 'PH_SHOTS', 'PH_PROFILE_USER', 'PH_HOUSE', 'PH_DEV', 'PH_USERDATA'].forEach((k) => delete env[k]);
  env.PH_PROFILE = 'default'; // 늘 공용판 (2026-10-14: 맥 개발 폴더엔 제작자 묶음이 있어, 안 주면 실제 기록 파일을 여는 쪽으로 감 — 그때 쓰기 전에 멈춤, 파일 그대로 확인)
  if (!WIN) env.PH_USERDATA = path.join(tmp, 'userData'); // 맥: 실제 ~/Library/Application Support/Pixel House 를 안 건드림
  if (HIDE) env.PH_SMOKE_HIDE = '1';
  const port = 9300 + Math.floor(Math.random() * 400);
  const argv = (appDir ? [path.resolve(appDir)] : []).concat(['--remote-debugging-port=' + port, '--use-mock-keychain', '--password-store=basic']);
  const proc = spawn(exe, argv, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '', exited = null;
  proc.stdout.on('data', (b) => { log += b; }); proc.stderr.on('data', (b) => { log += b; });
  proc.on('exit', (c) => { exited = c; });
  const killer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (e) { /* 끝남 */ } }, 180000);
  const state = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (e) { return null; } };
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (exited !== null) return null; const v = await fn(); if (v) return v; await sleep(300); } return fn(); };
  const pageOf = async (re) => { const l = await getJson(port, '/json/list'); return (l || []).find((t) => t.type === 'page' && re.test(t.url)) || null; };

  try {
    // ---- 1. 창이 뜸 ----
    const page = await until(() => pageOf(/index\.html/), 60000);
    check('앱이 켜지고 집 창(index.html)이 뜸 (60초 안)', !!page, { exited, log: log.slice(-1200) });
    if (!page) throw new Error('창 없음');
    let st = await until(async () => { const s = state(); return s && s.main ? s : null; }, 15000);
    check('창 보임 + 제목 Pixel House', st && st.wins.some((w) => w.visible && /Pixel House/.test(w.title)), st && st.wins);
    // ---- 2. 저장 폴더 ----
    if (WIN) check('저장 폴더 = %APPDATA%\\Pixel House', st && process.env.APPDATA && path.resolve(st.userData).toLowerCase() === path.join(process.env.APPDATA, 'Pixel House').toLowerCase(), st && { userData: st.userData, APPDATA: process.env.APPDATA });
    else check('저장 폴더 = 임시 폴더 (맥 확인용)', st && path.resolve(st.userData) === path.join(tmp, 'userData'), st && st.userData);
    check('처음 켜기 = 온보딩 (기록 폴더 아직 없음)', st && st.onboard === true && !st.houseOn, st && { onboard: st.onboard, houseOn: st.houseOn });
    if (!st || st.onboard !== true || st.houseOn || st.life) throw new Error('온보딩이 아님 → 다른 기록 파일에 쓰지 않게 여기서 멈춤 (' + (st && st.life) + ')');
    let cdp = await connect(page.webSocketDebuggerUrl);
    await until(async () => (await cdp.evaluate('document.readyState')) === 'complete', 15000);
    const plat = await cdp.evaluate('JSON.stringify(window.PHPlatform || null)');
    check('화면이 받은 플랫폼 = ' + process.platform, plat && JSON.parse(plat) && JSON.parse(plat).os === process.platform, plat);
    if (shotDir) await cdp.shot(path.join(shotDir, 'onboard.png'));
    // ---- 3. 온보딩 끝내기 (화면 함수 = 사용자가 [입장] 누른 것과 같은 길) ----
    const info = await cdp.evaluate('PHOnboardDesktop.info().then((r) => JSON.stringify(r))');
    const inf = info && !info.__err ? JSON.parse(info) : null;
    check('기본 기록 폴더 = 시험 폴더 (PH_DEFAULT_DIR)', inf && path.resolve(inf.defaultDir) === path.resolve(house), info);
    const fin = await cdp.evaluate(`PHOnboardDesktop.finish(${JSON.stringify({ name: '민지', cat: '', avatar: 'avatar1', house: 'room1', dir: inf ? inf.defaultDir : house, habits: ['water', 'yoga'] })}).then((r) => JSON.stringify(r))`);
    const f = fin && !fin.__err ? JSON.parse(fin) : null;
    check('온보딩 끝 → 기록 파일 새로 만듦', f && f.ok && f.made, fin);
    const lifeFile = f && f.file ? path.join(house, f.file) : null;
    const text = lifeFile && fs.existsSync(lifeFile) ? fs.readFileSync(lifeFile, 'utf8') : '';
    check('기록 파일이 기록 폴더에 생김 (' + (f && f.file) + ')', !!text && /^## /m.test(text), lifeFile);
    check('기록 파일 줄 끝 = LF 하나로 (CR 없음)', !!text && !/\r/.test(text));
    st = await until(async () => { const s = state(); return s && s.houseOn && s.main ? s : null; }, 15000);
    check('집 열림 (기록 파일 = 고른 폴더)', st && st.life && path.resolve(st.life) === path.resolve(lifeFile || ''), st && { life: st.life, houseOn: st.houseOn });
    cdp.close();
    const page2 = await until(() => pageOf(/index\.html/), 15000);
    cdp = await connect(page2.webSocketDebuggerUrl);
    await until(async () => (await cdp.evaluate('!!(window.PHApp && document.readyState === "complete")')) === true, 20000);
    await sleep(1500);
    const errs = await cdp.evaluate('JSON.stringify((window.__phErrors || []).slice(0, 5))');
    if (shotDir) await cdp.shot(path.join(shotDir, 'house.png'));
    // 화면이 기록 파일을 읽음: 물 한 잔 (화면 함수) → 파일에 오늘 줄
    const before = fs.readFileSync(lifeFile, 'utf8');
    const lm = await cdp.evaluate(`PHDesktop.read(PH_SETTINGS.LIFE_FILE).then((r) => r.lastModified)`);
    const w = await cdp.evaluate(`PHDesktop.setWater(1, ${Number(lm) || 0}).then((r) => JSON.stringify(r)).catch((e) => 'ERR ' + e.message)`);
    const after = fs.readFileSync(lifeFile, 'utf8');
    check('물 한 잔 쓰기 → 기록 파일 바뀜 (쓰기 통로)', after !== before && /물 1\//.test(after), { w, errs });
    // ---- 4. 바탕화면 펫 ----
    const on = await cdp.evaluate(`PHOnboardDesktop.setProfile('desktopPet', true).then((r) => JSON.stringify(r))`);
    const pet = await until(() => pageOf(/pet\/index\.html/), 15000);
    st = await until(async () => { const s = state(); return s && s.pet ? s : null; }, 10000);
    check('바탕화면 펫 켜기 → 펫 창 뜸', !!pet && !!st && !!st.pet, { on, st: st && st.pet });
    check('펫 창 = 처음엔 클릭 통과 (투명한 곳 뒤 바탕화면을 누를 수 있음)', st && st.pet && st.pet.ignore === true, st && st.pet);
    check('창 2개 (집 + 펫), 작업 표시줄엔 집만 (펫 skipTaskbar)', st && st.wins.length === 2, st && st.wins);
    if (pet && shotDir) { await sleep(1500); const pc = await connect(pet.webSocketDebuggerUrl); await pc.evaluate(`document.body.style.background = '#B9C7D6'; 0`); await sleep(300); await pc.shot(path.join(shotDir, 'pet.png')); await pc.evaluate(`document.body.style.background = ''; 0`); pc.close(); }
    if (st && st.pet && WIN) {
      // 커서 감시: 펫 몸(발 위 40%) 위로 → 화면 쪽 hit → 클릭 받기, 멀리 → 다시 통과 (C2)
      // (2026-10-14 Actions 38449050638: 첫 판은 7초 전 펫 자리로 커서를 옮겨 실패 — 그사이 펫이 걸어감(cx 소수 = 걷는 중), PowerShell 한 번 띄우는 데 1~3초)
      //   -> PowerShell 하나가 0.15초마다 상태 파일의 지금 펫 자리를 읽어 커서를 따라 붙임(1px 씩 흔들어 mousemove 를 만듦), 클릭 받기가 되면 멈춤
      const p = st.pet, bx = Math.round(p.cx), by = Math.round(p.by - p.th * 0.4);
      const petDbg = async () => { if (!pet) return null; try { const pc = await connect(pet.webSocketDebuggerUrl); const h = await pc.evaluate('JSON.stringify({ hit: window.__petDebug().hit, lastMove: window.__petDebug().lastMove, now: Date.now() })'); pc.close(); return JSON.parse(h); } catch (e) { return 'CDP 실패'; } };
      // 순서 = 사람 손과 같게: 진짜 입력(SendInput)으로 펫 창 안 빈 곳(머리 위)에서 움직임 → 창을 안 나가고 몸 위로 (Actions 38454677265 에서 막혔던 순서)
      const probe = sendMoves(Math.round(p.cx), Math.round(p.by - p.th - 40), 6);
      await sleep(500); const pd = await petDbg(), ps0 = state();
      followCursor(stateFile, 40);
      const a = state(), hit = await petDbg();
      check('창 안 빈 곳 → 몸 위로 옮기면 클릭 받기 (펫을 누르거나 끌 수 있음)', a && a.pet && a.pet.ignore === false, { pet: a && a.pet, renderer: hit });
      // 진단 (판정 아님): 빈 곳에서 진짜 입력이 화면 쪽에 넘어갔는지(forward), 몸 위에서 커서·상자·판단 값
      console.log('  진단 forward(빈 곳): SendInput=' + probe + ' 화면 쪽 마지막 mousemove=' + JSON.stringify(pd && pd.lastMove) + ' (now ' + (pd && pd.now) + ') 통과=' + (ps0 && ps0.pet && ps0.pet.ignore) + ' said=' + (ps0 && ps0.pet && ps0.pet.said) + ' 커서=' + JSON.stringify(ps0 && ps0.pet && ps0.pet.cursor));
      console.log('  진단 커서(몸 위): 화면 ' + JSON.stringify(a && a.pet && a.pet.cursor) + ' 펫 창 안 ' + JSON.stringify(a && a.pet && a.pet.inPet) + ' 몸 상자 ' + JSON.stringify(a && a.pet && a.pet.body) + ' said ' + (a && a.pet && a.pet.said) + ' 상자로 켬 ' + (a && a.pet && a.pet.boxOn) + ' 화면 쪽 ' + JSON.stringify(hit));
      moveCursor(Math.max(0, bx - 700), Math.max(0, by - 500)); await sleep(1200);
      const b = state();
      check('커서가 떠나면 다시 클릭 통과 (펫 옆 바탕화면이 눌림)', b && b.pet && b.pet.ignore === true, b && b.pet);
    } else console.log('  (커서 옮기기 건너뜀: ' + process.platform + ' — 윈도우 서버에서만)');
    // 펫 끄기
    await cdp.evaluate(`PHOnboardDesktop.setProfile('desktopPet', false).then((r) => JSON.stringify(r))`);
    st = await until(async () => { const s = state(); return s && !s.pet ? s : null; }, 8000);
    check('바탕화면 펫 끄기 → 펫 창 닫힘, 집 창 그대로', st && !st.pet && st.main, st && { pet: st.pet, main: st.main });
    cdp.close();
  } catch (e) { check('연기 시험 도중 멈춤: ' + (e && e.message), false, String(e && e.stack).slice(0, 500)); }

  try { proc.kill(); } catch (e) { /* 끝남 */ }
  for (let i = 0; i < 20 && exited === null; i++) await sleep(250);
  if (exited === null) try { proc.kill('SIGKILL'); } catch (e) { /* 끝남 */ }
  clearTimeout(killer);
  if (fail) console.log('--- 앱 기록 (끝 1500자) ---\n' + log.slice(-1500));
  console.log('\n' + pass + '개 통과, ' + fail + '개 실패');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('연기 시험 오류: ' + (e && e.stack || e)); process.exit(1); });
