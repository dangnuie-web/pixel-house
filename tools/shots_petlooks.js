// 펫 5종 모습 시험 (2026-10-13 비트, 실제 창). tests/test_pet_looks_app.js 가 펫마다 한 번씩 부름 (PH_SHOTS_SCRIPT=shots_petlooks.js)
//   앱에 들어가는 파일만(package.json build.files) 복사한 폴더에서 돈다 -> assets/ 같은 개발 폴더 파일 없이 초상·펫 그림이 읽히는지
//   PH_PETLOOK = 펫 id (cat_white·cat_cheese·cat_black·dog_white·dog_yellow)
//   1) 대화창 초상 = portraits/<PH_PETS[펫].portrait>, 그림이 실제로 읽힘 (naturalWidth 384)  2) 바탕화면 펫 = 고른 펫 그림, 4동작 캡처
//   캡처: PH_SHOTS_OUT(절대 경로) 아래 petlook_<펫>_dialog.png, petlook_<펫>_desk_{stand,walk,talk,lift}.png
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = async function shotsPetLooks(win, ROOT, opts) {
  const wc = win.webContents;
  const OUT = path.resolve(ROOT, process.env.PH_SHOTS_OUT || 'preview');
  fs.mkdirSync(OUT, { recursive: true });
  const ID = process.env.PH_PETLOOK || 'cat_white';
  const checks = [], errors = [];
  const ok = (label, cond, extra) => { checks.push({ label: ID + ': ' + label, ok: !!cond, extra }); if (process.env.PH_TRACE === '1') console.log('CHK ' + (cond ? 'o ' : 'X ') + label + (cond ? '' : ' ' + JSON.stringify(extra))); };
  const watchErr = (w) => w.on('console-message', (...args) => {
    const e = args[0] && typeof args[0] === 'object' && 'message' in args[0] ? args[0] : { level: args[1], message: args[2] };
    if (e.level === 'error' || e.level === 3) errors.push(e.message);
  });
  watchErr(wc);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 6000)) { const v = await fn().catch(() => null); if (v) return v; await sleep(80); } return fn().catch(() => null); };
  const loaded = () => new Promise((r) => (wc.isLoading() ? wc.once('did-finish-load', r) : r()));
  const ctl = opts.deskPet();
  const petWin = () => ctl.window();
  const pjs = (code) => petWin().webContents.executeJavaScript(code);
  async function shotPet(name) { // 투명 창이라 찍을 때만 바탕색
    await pjs(`document.body.style.background = '#B9C7D6'; document.getElementById('bwrap').hidden = true; 0`); await sleep(250);
    const img = await petWin().webContents.capturePage(); fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
    await pjs(`document.body.style.background = ''; 0`);
  }

  await loaded(); await sleep(500);
  try { await body(); } catch (e) { ok('시험 도중 멈춤: ' + (e && e.message), false, String(e && e.stack).slice(0, 500)); }
  const fail = checks.filter((c) => !c.ok);
  console.log('RESULT ' + JSON.stringify({ pass: checks.length - fail.length, fail: fail.length, failed: fail, errors }));
  return fail.length === 0;

  async function body() {
    ok('앱 파일만 있는 폴더에서 돎 (assets/ 없음)', !fs.existsSync(path.join(ROOT, 'assets')) && fs.existsSync(path.join(ROOT, 'portraits')), ROOT);
    const PETS = require(path.join(ROOT, 'js', 'data', 'pet_lines.js')).PH_PETS;
    const want = 'portraits/' + PETS[ID].portrait;
    ok('고른 펫 = ' + ID, (await js('PHProfile.pet()')) === ID);

    // ---- 1. 대화창 초상 ----
    // 입장 화면 -> 입장 버튼 -> 연출은 Esc로 건너뜀 (shots_dialog.js 와 같은 순서). 낮으로 고정, 말주머니·돌아다니기 끔
    await until(() => js('!!document.getElementById("btn-enter")'), 8000);
    await js(`PHGame.setDayNight('day'); document.getElementById('btn-enter').click(); 0`);
    await until(() => js('PHGame.G.mode === "intro" || PHGame.G.mode === "play"'), 4000);
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    const play = await until(() => js('PHGame.G.mode === "play" && PHGame.G.fadeT == null'), 15000);
    ok('집 안으로 들어옴 (play)', !!play, await js('[PHGame.G.mode, PHGame.G.fadeT]').catch(() => null));
    await js('PHGame.setWander(false); PHGame.G.bubble = null; document.getElementById("bubble").hidden = true; 0');
    await js('PHDialog.openDubu(); 0');
    const face = await until(() => js(`(() => { const i = document.querySelector('#dd .dd-face'); if (!i || !PHDialog.isOpen() || !i.complete) return null;
      return { src: i.getAttribute('src'), w: i.naturalWidth, h: i.naturalHeight, alt: i.alt, pet: i.dataset.pet }; })()`), 8000);
    ok('대화창 초상 = ' + want + ', 앱 파일만으로 읽힘 (384x384)', face && face.src === want && face.w === 384 && face.h === 384 && face.pet === ID, face);
    ok('초상 대체 글 = 이름 + 고른 펫 모습', face && /: 차를 따르는 /.test(face.alt) && !/플레이어/.test(face.alt), face && face.alt);
    await until(() => js(`document.querySelector('#dd .dd-line .dd-vis').textContent.length > 4`), 6000); await sleep(600);
    { const img = await wc.capturePage(); fs.writeFileSync(path.join(OUT, 'petlook_' + ID + '_dialog.png'), img.toPNG()); }
    await js('PHDialog.close(); 0'); await sleep(300);

    // ---- 2. 바탕화면 펫 ----
    const up = await until(async () => ctl.isOn() && petWin() && !petWin().webContents.isLoading(), 10000);
    ok('바탕화면 펫 창 뜸', !!up);
    if (!up) return;
    watchErr(petWin().webContents);
    const dbg = await until(() => pjs(`(() => { const d = window.__petDebug(); return d.png && d.png.ready === d.png.total && d.png.total > 0 ? d.png : null; })()`), 10000);
    const lk = ctl.look();
    ok('바탕화면 펫 = 고른 펫 PNG 그림 10장 다 읽힘 (서기 2·걷기 4·말하기 2·들기 2), 부드럽게, 빠진 동작 없음', lk && lk.pet === ID && lk.kind === 'png' && lk.missing.length === 0 && dbg && dbg.total === 10 && !dbg.pix && !dbg.pixelated, { lk, dbg });
    ok('서 있는 키 109pt 안팎', dbg && Math.abs(dbg.headH - 109) < 1, dbg && dbg.headH);
    // 동작별 캡처 (말주머니는 가림). 걷기는 오른쪽 보기
    ctl.T.pose('idle'); await sleep(300); await shotPet('petlook_' + ID + '_desk_stand');
    ctl.T.pose('walk', 'right'); await sleep(300); await shotPet('petlook_' + ID + '_desk_walk');
    ctl.T.pose('talk'); await sleep(300); await shotPet('petlook_' + ID + '_desk_talk');
    ctl.T.pose('drag'); await sleep(300);
    const last = await pjs('window.__petDebug().png.last');
    ok('끌 때 들어올리기 그림 (lift)', /^lift:/.test(last || ''), last);
    await shotPet('petlook_' + ID + '_desk_lift');
    ctl.T.pose('idle');
  }
};
