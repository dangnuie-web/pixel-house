// 바탕화면 펫 실제 창 시험 (2026-10-13 비트). tests/test_desk_pet_app.js 가 PH_SHOTS_SCRIPT=shots_deskpet.js 로 부름
//   PH_DESKPET_MODE = on(공용판, 펫 켜 둔 사용자) | off(공용판, 처음 값) | player(제작자 묶음, 가짜 기록 폴더)
//   시험 창은 집 창·펫 창 모두 투명도 0·마우스 통과·키보드 안 뺏음 (fdebdba 규칙). 입력은 sendInputEvent로 화면에 직접
//   기록 폴더 = 임시 폴더 (PH_HOUSE), 기록 날짜 = PH_TODAY. 캡처: preview/deskpet_*.png (펫 창은 투명이라 찍을 때만 바탕색을 깖)
'use strict';
const fs = require('fs');
const path = require('path');
const { BrowserWindow, screen } = require('electron');

module.exports = async function shotsDeskPet(win, ROOT, opts) {
  const wc = win.webContents;
  const OUT = path.join(ROOT, process.env.PH_SHOTS_OUT || 'preview');
  fs.mkdirSync(OUT, { recursive: true });
  const checks = [], errors = [];
  const ok = (label, cond, extra) => { checks.push({ label, ok: !!cond, extra }); if (process.env.PH_TRACE === '1') console.log('CHK ' + (cond ? 'o ' : 'X ') + label + (cond ? '' : ' ' + JSON.stringify(extra))); };
  const watchErr = (w) => w.on('console-message', (...args) => {
    const e = args[0] && typeof args[0] === 'object' && 'message' in args[0] ? args[0] : { level: args[1], message: args[2] };
    if (e.level === 'error' || e.level === 3) errors.push(e.message);
  });
  watchErr(wc);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 6000)) { const v = await fn(); if (v) return v; await sleep(80); } return fn(); };
  const loaded = () => new Promise((r) => (wc.isLoading() ? wc.once('did-finish-load', r) : r()));
  const store = () => { try { return JSON.parse(fs.readFileSync(opts.profileStore(), 'utf8')); } catch (e) { return null; } };
  const ctl = opts.deskPet();
  const petWin = () => ctl.window();
  const pjs = (code) => petWin().webContents.executeJavaScript(code);
  const life = () => fs.readFileSync(path.join(process.env.PH_HOUSE, require(path.join(ROOT, 'js', 'data', 'settings.js')).LIFE_FILE), 'utf8');
  const shotMain = async (name) => { await sleep(150); const img = await wc.capturePage(); fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); };
  async function shotPet(name) { // 투명 창이라 바탕색(옅은 바탕화면 색)을 잠깐 깔고 찍음
    await pjs(`document.body.style.background = '#B9C7D6'; 0`); await sleep(200);
    const img = await petWin().webContents.capturePage(); fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
    await pjs(`document.body.style.background = ''; 0`);
  }
  async function pclick(x, y, button) {
    const pw = petWin().webContents;
    const real = screen.getCursorScreenPoint, fixed = real.call(screen); screen.getCursorScreenPoint = () => fixed; // 누르는 동안 커서 고정 (사람이 마우스를 움직여도 끌기가 되지 않게)
    try {
      pw.sendInputEvent({ type: 'mouseMove', x, y });
      pw.sendInputEvent({ type: 'mouseDown', x, y, button: button || 'left', clickCount: 1 }); await sleep(40);
      pw.sendInputEvent({ type: 'mouseUp', x, y, button: button || 'left', clickCount: 1 }); await sleep(200);
    } finally { screen.getCursorScreenPoint = real; }
  }
  const pcenter = (sel, i) => pjs(`(() => { const b = document.querySelectorAll(${JSON.stringify(sel)})[${i || 0}]; if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  async function pclickSel(sel, i) { const p = await pcenter(sel, i); if (!p) throw new Error('펫 창에 없음: ' + sel); await pclick(p.x, p.y); }
  const petPoint = () => pjs(`(() => { const c = document.getElementById('dubu'), r = c.getBoundingClientRect();
    for (let dy = 0.55; dy < 0.95; dy += 0.05) for (let dx = 0.3; dx < 0.7; dx += 0.05) { const x = Math.round(r.left + r.width * dx), y = Math.round(r.top + r.height * dy); if (window.__petOnPet(x, y)) return { x, y }; }
    return null; })()`);
  const dlg = () => pjs('window.__petDlg.state()');
  const talk = () => ctl.T.talk();
  const cur = async () => { const t = talk(), c = t && t.current(), s = await dlg(); return c && s.open && s.id === c.id && s.mode === c.mode ? s : null; };
  async function petReady() {
    const w = await until(() => ctl.isOn() && petWin() && !petWin().webContents.isLoading(), 8000);
    if (!w) return false;
    watchErr(petWin().webContents);
    return until(() => pjs(`(() => { const d = window.__petDebug(); return !!(d.png && d.png.ready === d.png.total && d.png.total > 0); })()`).catch(() => false), 8000);
  }
  const openSettings = async () => { await js(`PHSettingsUI.open('pet'); 0`); await sleep(300); return js('PHSettingsUI.isOpen()'); };
  const sw = () => js(`(() => { const b = document.querySelector('#cfg .cfg-sw[data-deskpet]'); return b ? b.getAttribute('aria-checked') : null; })()`);
  async function clickMain(sel) {
    const p = await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
    if (!p) return false;
    wc.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y }); wc.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 }); await sleep(30);
    wc.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1 }); await sleep(250); return true;
  }

  await loaded(); await sleep(600);
  const mode = process.env.PH_DESKPET_MODE || 'on';
  try { if (mode === 'on') await body(); else await offOnly(mode); } catch (e) { ok('시험 도중 멈춤: ' + (e && e.message), false, String(e && e.stack).slice(0, 600)); }
  try { ctl.stop(); } catch (e) {}
  const fail = checks.filter((c) => !c.ok);
  console.log('RESULT ' + JSON.stringify({ pass: checks.length - fail.length, fail: fail.length, failed: fail, errors }));
  return fail.length === 0;

  // 펫이 안 떠야 하는 경우: 공용판 처음 값 / 제작자 판
  async function offOnly(m) {
    await sleep(2500);
    const wins = BrowserWindow.getAllWindows().length;
    ok(m === 'player' ? '제작자 판: 바탕화면 펫 안 뜸 (창 1개)' : '공용판 처음 값: 바탕화면 펫 꺼짐 (창 1개, profile.json 에 없음)', !ctl.isOn() && wins === 1 && (m === 'player' || (store() && store().desktopPet === undefined)), { on: ctl.isOn(), wins, store: store() });
    if (m === 'off') {
      ok('공용판: 설정 펫 탭에 바탕화면 펫 스위치 = 꺼짐', (await openSettings()) && (await sw()) === 'false', await sw());
      await shotMain('deskpet_00_settings_off');
      await clickMain('#cfg .cfg-sw[data-deskpet]');
      ok('스위치 켜기 -> 펫 창 뜸, profile.json desktopPet true', (await petReady()) && store().desktopPet === true && (await sw()) === 'true', store());
    } else {
      ok('제작자 판: 설정 버튼 없음 (펫 켤 곳 없음)', (await js(`!document.getElementById('cfg-open')`)));
    }
  }

  async function body() {
    // ---- 1. 켜 둔 사용자로 시작 = 펫 창이 뜸 ----
    ok('켜 둔 공용판 사용자: 시작하면 펫 창이 뜨고 그림 다 읽음', await petReady());
    const pw = petWin();
    const b = pw.getBounds(), wa = screen.getPrimaryDisplay().workArea;
    ok('펫 창 = 집 창과 다른 두 번째 창, 시험이라 투명도 0·맨 위 아님·포커스 못 받음 (fdebdba)', pw !== win && BrowserWindow.getAllWindows().length === 2 && pw.getOpacity() === 0 && !pw.isAlwaysOnTop() && !pw.isFocusable() && pw.isVisible(), { op: pw.getOpacity(), top: pw.isAlwaysOnTop(), foc: pw.isFocusable() });
    ok('펫 창 자리 = 주 화면 아래쪽 (처음 = 왼쪽에서 220)', b.y + b.height <= wa.y + wa.height + 1 && b.y + b.height >= wa.y + wa.height - 2 && b.x < wa.x + wa.width / 2, { b, wa });
    const greet = await until(() => pjs('window.__petDebug().bubble'), 4000);
    ok('시작 인사 한 줄 (말주머니), 제작자 글 없음', typeof greet === 'string' && greet.length > 3 && !/플레이어/.test(greet), greet);
    await shotPet('deskpet_01_greet');
    ok('대사 이름 = 사용자가 지은 펫 이름(나비), 고양이 말끝', ctl.T.lines().name === '나비' && ctl.T.lines().kind === 'cat');

    // ---- 2. 펫 누르기 = 말풍선 메뉴 (실제 누르기, 커서 고정) ----
    await sleep(300);
    const p = await petPoint(); if (!p) throw new Error('펫 그림 점 없음');
    await pclick(p.x, p.y);
    let s = await until(async () => { const x = await cur(); return x && x.mode === 'ask' ? x : null; }, 5000);
    ok('펫 누르기 -> 말풍선 메뉴: 잠·식사·물·그냥 같이 있기 4줄, 아이콘 4개', s && s.choices.length === 4 && s.icons === 4, s);
    await shotPet('deskpet_02_menu');
    // ---- 3. 물 한 잔 (버튼 누르기) -> 기록 +1 ----
    const before = life();
    const wi = s.choices.findIndex((c) => /물/.test(c));
    await pclickSel('.dc-grid .dc', wi);
    const tell = await until(async () => { const x = await cur(); return x && x.mode === 'tell' ? x : null; }, 5000);
    const after = life();
    ok('물 한 잔 -> 기록 파일 바뀜(습관 기록 오늘 줄), 컵 줄 보임', after !== before && /2026-10-13/.test(after) && tell && tell.cups && tell.cups.full === 1, { tell });
    await shotPet('deskpet_03_water');
    ok('쓰기 전 사본 = 하우스와 같은 userData/backup', fs.existsSync(path.join(require('electron').app.getPath('userData'), 'backup')) && fs.readdirSync(path.join(require('electron').app.getPath('userData'), 'backup')).length >= 1);
    // 집 창도 바뀐 기록을 받음 (1.5초마다 확인하는 다른 앱 알림과 같은 길)
    await pclick((await pcenter('#bubble')).x, (await pcenter('#bubble')).y); // 한 줄 = 누르면 다음(끝)
    ok('대화 끝나면 메뉴 닫힘', await until(() => !talk().isOpen(), 6000));

    // ---- 4. 오른쪽 클릭 = 메뉴 + 아래 줄 (숨기기 · 바탕화면 펫 끄기) ----
    await sleep(400);
    const p2 = await petPoint();
    await pclick(p2.x, p2.y, 'right');
    s = await until(async () => { const x = await cur(); return x && x.mode === 'ask' && x.foot.length ? x : null; }, 5000);
    ok('오른쪽 클릭 -> 아래 줄 "잠깐 숨기기 (10분) · 바탕화면 펫 끄기" (종료 아님)', s && s.foot.join('|') === '잠깐 숨기기 (10분)|바탕화면 펫 끄기', s && s.foot);
    await shotPet('deskpet_04_footer');

    // ---- 5. 설정 화면 스위치 ----
    ok('설정 펫 탭: 바탕화면 펫 스위치 = 켜짐', (await openSettings()) && (await sw()) === 'true', await sw());
    await shotMain('deskpet_05_settings_on');
    await clickMain('#cfg .cfg-sw[data-deskpet]');
    ok('스위치 끄기 -> 펫 창 닫힘, profile.json 에서 지움, 집 창은 그대로', (await until(() => !ctl.isOn(), 4000)) && store().desktopPet === undefined && BrowserWindow.getAllWindows().length === 1 && !win.isDestroyed() && (await sw()) === 'false', store());
    await clickMain('#cfg .cfg-sw[data-deskpet]');
    ok('스위치 다시 켜기 -> 펫 창 다시 뜸 (놓은 자리 그대로)', (await petReady()) && store().desktopPet === true && (await sw()) === 'true');

    // ---- 6. 펫 이름 바꾸기 -> 펫 대사도 새 이름 ----
    await js(`PHSettingsUI.save('cat', '보리', { reload: true, say: 'petName' }); 0`).catch(() => 0);
    await until(() => !wc.isLoading(), 6000); await loaded(); await sleep(800);
    ok('설정에서 펫 이름 보리 -> 펫 창 그대로, 대사 이름 보리', ctl.isOn() && ctl.T.lines().name === '보리' && /보리/.test(JSON.stringify(ctl.T.lines().D)), ctl.T.lines().name);

    // ---- 6b. 펫 바꾸기 (2026-10-13 정정: 바탕화면 펫도 고른 펫 외형) -> 노란 강아지 그림(같은 날 제작자 PNG로 바꿈), 강아지 대사 ----
    const oldWin = petWin();
    await js(`PHSettingsUI.save('pet', 'dog_yellow', { reload: true, say: 'petSwap' }); 0`).catch(() => 0);
    await until(() => !wc.isLoading(), 6000); await loaded(); await sleep(500);
    const lk = await until(async () => (petWin() && petWin() !== oldWin && (await petReady()) ? ctl.look() : null), 8000);
    const dbg = await pjs('window.__petDebug().png');
    ok('펫을 노란 강아지로 -> 펫 창 새로 뜸, 노란 강아지 PNG 그림(pet/png/dog_yellow, 부드럽게, 10장 다 읽힘), 빠진 동작 없음', lk && lk.pet === 'dog_yellow' && lk.kind === 'png' && lk.missing.length === 0 && dbg && !dbg.pix && !dbg.pixelated && dbg.ready === 10 && dbg.total === 10 && Math.abs(dbg.headH - 109) < 1, { lk, dbg });
    ok('강아지 대사: 이름 보리 그대로, 말끝 멍~ (하우스 강아지 대사)', ctl.T.lines().kind === 'dog' && ctl.T.lines().name === '보리' && /멍~/.test(ctl.T.lines().line('click')) && /멍~/.test(ctl.T.lines().line('lift')));
    await until(() => pjs('window.__petDebug().bubble'), 3000);
    await shotPet('deskpet_07_dog_greet');
    ctl.T.pose('walk', 'left'); await sleep(300); await pjs(`document.getElementById('bwrap').hidden = true; 0`);
    await shotPet('deskpet_08_dog_walk_left');
    ctl.T.pose('drag'); await sleep(300);
    await shotPet('deskpet_09_dog_lift');
    ctl.T.pose('idle');
    const p4 = await petPoint(); await pclick(p4.x, p4.y);
    const s4 = await until(async () => { const x = await cur(); return x && x.mode === 'ask' ? x : null; }, 5000);
    ok('강아지 그림도 누르면 말풍선 메뉴 (칠한 칸 누르기 판정)', s4 && s4.choices.length === 4 && /멍\u2060?~/.test(s4.text), s4 && s4.text);
    await shotPet('deskpet_10_dog_menu');
    talk().cancel(true); await until(() => !talk().isOpen(), 3000);

    // ---- 7. 펫 메뉴 "바탕화면 펫 끄기" = 설정에서 끈 것과 같음 ----
    await openSettings();
    const p3 = await petPoint(); await pclick(p3.x, p3.y, 'right');
    await until(async () => { const x = await cur(); return x && x.foot.length ? x : null; }, 5000);
    await pclickSel('.bfoot .bf[data-act="quit"]');
    ok('펫 메뉴 "바탕화면 펫 끄기" -> 펫 창 닫힘, profile.json 에서 지움, 집 창 설정 스위치도 꺼짐 (앱은 안 꺼짐)', (await until(() => !ctl.isOn(), 4000)) && store().desktopPet === undefined && (await until(async () => (await sw()) === 'false', 3000)) && !win.isDestroyed(), { store: store(), sw: await sw() });
    await shotMain('deskpet_06_settings_after_quit');

    // ---- 8. 집 창 닫기 -> 펫만 남고 Dock 아이콘 숨김, 앱 다시 열기 -> 집 창·Dock 다시 (A4, 2026-10-14 제작자 정함) ----
    await clickMain('#cfg .cfg-sw[data-deskpet]');
    ok('다시 켜기 -> 펫 창 뜸', await petReady());
    const mac = process.platform === 'darwin';
    let d = opts.dock();
    ok('집 창 + 펫: Dock 아이콘 보임', d.mainWin && !d.hidden && (!mac || d.visible === true), d);
    await js(`PHSettingsUI.close && PHSettingsUI.close(); 0`).catch(() => 0);
    win.close();
    await until(() => win.isDestroyed(), 4000); await sleep(400);
    d = opts.dock();
    ok('집 창 닫음 -> 앱·펫 창 그대로, Dock 아이콘 숨김 (맥)', ctl.isOn() && !d.mainWin && BrowserWindow.getAllWindows().length === 1 && (!mac || (d.hidden && d.visible === false)), d);
    require('electron').app.emit('activate'); // Finder·Launchpad 로 앱을 한 번 더 연 것과 같음
    await until(() => opts.dock().mainWin, 6000); await sleep(600);
    d = opts.dock();
    ok('앱 다시 열기(activate) -> 집 창 새로, Dock 아이콘 다시 보임, 펫 그대로', d.mainWin && !d.hidden && (!mac || d.visible === true) && ctl.isOn() && BrowserWindow.getAllWindows().length === 2, d);

    // ---- 9. 보이는 창이 하나도 없으면 앱이 끝남 (A8, 2026-10-14 제작자: 창도 Dock 도 없이 앱만 남아 있었음) ----
    //   시험 프로세스가 진짜로 꺼지지 않게 app.quit 을 잠깐 세기만 하는 것으로 바꿈 (이 칸 끝에서 되돌림)
    const eapp = require('electron').app, realQuit = eapp.quit;
    let quits = 0; eapp.quit = () => { quits++; };
    const visible = () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.isVisible()).length;
    const mainOf = () => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w !== petWin());
    const reopen = async () => { eapp.emit('activate'); await until(() => opts.dock().mainWin, 6000); await sleep(500); };
    try {
      // 9-1 펫 보임 + 집 창 닫기 -> 앱 남음(펫이 보임)
      let m = mainOf(); m.close(); await until(() => m.isDestroyed(), 4000); await sleep(300);
      ok('A8-1 펫 켜짐·보임 + 집 창 닫기 -> 앱 그대로(끝내지 않음), 펫 보임', quits === 0 && ctl.isOn() && visible() === 1, { quits, vis: visible() });
      // 9-2 그 상태에서 펫 "잠깐 숨기기" -> 보이는 창 0 -> 앱 끝남
      ctl.T.hideForAWhile(); await sleep(400);
      ok('A8-2 집 창 없이 펫 잠깐 숨기기 -> 보이는 창 0 -> 앱 끝냄', quits >= 1, { quits, vis: visible(), wins: BrowserWindow.getAllWindows().length });
      quits = 0;
      // 9-3 펫이 숨은 채 집 창을 열었다 닫기 -> 보이는 창 0 -> 앱 끝남 (숨은 펫 창이 남아 window-all-closed 가 안 옴)
      await reopen(); m = mainOf(); m.close(); await until(() => m.isDestroyed(), 4000); await sleep(400);
      ok('A8-3 펫 숨은 채 집 창 닫기 -> 앱 끝냄', quits >= 1, { quits, vis: visible(), wins: BrowserWindow.getAllWindows().length });
      quits = 0;
      // 9-4 펫 다시 보이게(설정에서 다시 켠 것과 같게 restart) + 집 창 닫고 펫 메뉴 "바탕화면 펫 끄기" -> 앱 끝남
      await reopen(); ctl.restart(); await petReady(); m = mainOf(); m.close(); await until(() => m.isDestroyed(), 4000); await sleep(300);
      const pq = await petPoint(); await pclick(pq.x, pq.y, 'right');
      await until(async () => { const x = await cur(); return x && x.foot.length ? x : null; }, 5000);
      await pclickSel('.bfoot .bf[data-act="quit"]'); await sleep(500);
      ok('A8-4 집 창 없이 펫 메뉴 "바탕화면 펫 끄기" -> 펫 닫힘 + 앱 끝냄', !ctl.isOn() && quits >= 1, { quits, on: ctl.isOn(), wins: BrowserWindow.getAllWindows().length });
      quits = 0;
      // 9-5 펫 꺼짐 + 집 창 닫기 -> 앱 끝남
      await reopen(); m = mainOf(); m.close(); await until(() => m.isDestroyed(), 4000); await sleep(300);
      ok('A8-5 펫 꺼짐 + 집 창 닫기 -> 앱 끝냄', quits >= 1 && !ctl.isOn(), { quits, wins: BrowserWindow.getAllWindows().length });
    } finally { eapp.quit = realQuit; }
  }
};
