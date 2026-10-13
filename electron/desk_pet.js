// 바탕화면 펫 (2026-10-13 제작자 결정: 두부 펫을 따로 앱으로 내지 않고 하우스 앱 안에 "바탕화면 펫 켜기", dmg 하나)
//   하우스 메인 프로세스 안의 두 번째 창 (투명·테두리 없음). 바탕화면 왼쪽 아래를 돌아다니는 펫 + 말주머니 + 말풍선 메뉴(물 한 잔·식사·잠·그냥 같이 있기)
//   원본 = 두부 펫(dubu-pet) main.js. 움직임·끌기·말주머니·메뉴는 그대로, 바뀐 곳:
//     - 따로 앱이 아님: 이름·단일 실행·Dock 숨기기 없음. 켜고 끄기 = 공용판 설정 화면(profile.json desktopPet, 처음 꺼짐). 제작자 판은 켜지 않음 (electron/main.js)
//     - 기록 쓰기 = 하우스 메인과 같은 파일·같은 쓰기 전 사본·같은 꺼진 기능 (electron/pet_house.js), 대사 = 하우스 대사 파일 (electron/pet_lines.js)
//     - 그림·이름·말끝 = 사용자가 고른 펫 (2026-10-13 토리 정정). 흰 고양이 = 두부 PNG(pet/png), 나머지 4종 = 제작자 챗지피티 그림 pet/png/<펫 id> (2026-10-13. 못 읽으면 하우스 픽셀 그림 pixPet)
//     - 오른쪽 클릭 메뉴 아래 줄: 잠깐 숨기기(10분) · 바탕화면 펫 끄기 (= 설정에서 끈 것과 같음)
//     - 토리 펫 확인(제작자 컴퓨터 전용)은 뺌
//   쓰는 파일: 생활 기록(정해진 표·줄만) + userData/backup(하우스와 같은 사본) + userData/desk_pet.json(놓은 위치). 네트워크 없음
//   시험(PH_SHOTS): 창 투명도 0·맨 위 아님·마우스 안 받음·키보드 안 뺏음 (하우스 시험 창과 같은 규칙, 2026-10-08 fdebdba). 눈으로 볼 땐 PH_SHOTS_SHOW=1
'use strict';
const path = require('path');
const fs = require('fs');

const S = require('./pet_sprites');
const PetLines = require('./pet_lines');
const PETS = require('../js/data/pet_lines.js').PH_PETS; // 펫 id -> 그림 앞부분 (설정 화면과 같은 표)
const PetHouse = require('./pet_house');
const Talk = require('./pet_talk');
const Cursor = require('./pet_cursor'); // C2 커서 감시 (윈도우 클릭 통과)

// ---------- 고칠 수 있는 값 (두부 펫과 같음) ----------
const STAND_PT = 109;            // 서 있는 펫 화면 키(pt)
const BUBBLE_ROOM = 146;         // 머리 위 말주머니 자리(px)
const START_FROM_LEFT = 220;     // 처음 (저장된 위치 없음): 주 화면 왼쪽 끝에서 이만큼
const RANGE = 170;               // 놓은 자리에서 좌우로 어슬렁거리는 범위(px)
const SPEED = 30;                // 걷는 속도 px/초
const DIALOG_ROOM_MAX = 440;     // 말풍선 메뉴가 길 때 머리 위 자리를 이만큼까지 늘림(px)
const FOOT = [['hide', '잠깐 숨기기 (10분)'], ['quit', '바탕화면 펫 끄기']];

// o: { app, BrowserWindow, ipcMain, screen, shots, show, boot() -> 화면 boot 값, parts() -> { file, backup, features, settings, guard, fixedDay },
//      onTurnOff() (펫 메뉴에서 끔), now?() }
module.exports = function createDeskPet(o) {
  const { app, BrowserWindow, ipcMain } = o;
  const screen = () => o.screen;
  const SHOTS = !!o.shots;
  const HIDE_MS = SHOTS && Number(process.env.PH_PET_HIDE_MS) > 0 ? Number(process.env.PH_PET_HIDE_MS) : 10 * 60 * 1000;
  let WIN_W = 300, WIN_H = 230, TW = 150, TH = 150;
  let png = null, look = null, pet = null, house = null, talk = null, lines = null, screenOn = false;
  const st = {};
  function resetState() {
    Object.assign(st, { cx: 0, by: 0, home: null, mode: 'idle', dir: 'right', ignore: true, hidden: false, menu: null, dialog: false,
      modeTimer: null, walkTimer: null, dragTimer: null, hideTimer: null, poseTimer: null, drag: null, queue: [], talking: false, talkTimer: null, greetTimer: null });
  }
  resetState();
  const alive = () => !!(pet && !pet.isDestroyed());

  // ---------- 위치 저장 (userData/desk_pet.json) ----------
  const POS_FILE = () => path.join(app.getPath('userData'), 'desk_pet.json');
  function loadPos() { try { const p = JSON.parse(fs.readFileSync(POS_FILE(), 'utf8')); if (Number.isFinite(p.cx) && Number.isFinite(p.by)) return p; } catch (e) {} return null; }
  function savePos() { try { fs.writeFileSync(POS_FILE(), JSON.stringify({ cx: Math.round(st.home.cx), by: Math.round(st.home.by) })); } catch (e) {} }

  // ---------- 화면 경계 ----------
  function displayAt(cx, by) { return screen().getDisplayNearestPoint({ x: Math.round(cx), y: Math.round(by - TH / 2) }); }
  function clampPos(cx, by, disp) {
    const wa = (disp || displayAt(cx, by)).workArea;
    return { cx: Math.min(Math.max(cx, wa.x + TW / 2), wa.x + wa.width - TW / 2), by: Math.min(Math.max(by, wa.y + WIN_H), wa.y + wa.height) };
  }
  // 창은 되도록 화면 안에 두고, 화면 끝에서는 창 안에서 펫 자리를 옮긴다 (말주머니가 잘리지 않게)
  function winX() {
    const wa = displayAt(st.cx, st.by).workArea;
    const want = st.cx - WIN_W / 2;
    return Math.round(wa.width >= WIN_W ? Math.min(Math.max(want, wa.x), wa.x + wa.width - WIN_W) : want);
  }
  function placeWindow() {
    if (!alive()) return;
    const x = winX();
    pet.setBounds({ x, y: Math.round(st.by - WIN_H), width: WIN_W, height: WIN_H });
    sendView(x);
  }
  function sendView(x0) {
    if (!alive()) return;
    if (x0 === undefined) x0 = winX();
    const wa = displayAt(st.cx, st.by).workArea;
    send('pet:view', { left: Math.max(0, wa.x - x0), right: Math.min(WIN_W, wa.x + wa.width - x0), petX: Math.round(st.cx - x0 - TW / 2) });
  }
  function send(ch, data) { if (alive()) pet.webContents.send(ch, data); }

  // ---------- 행동 ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  function faceCenter() { const wa = displayAt(st.cx, st.by).workArea; st.dir = st.cx < wa.x + wa.width / 2 ? 'right' : 'left'; }
  function stopMoving() { clearTimeout(st.modeTimer); clearInterval(st.walkTimer); st.walkTimer = null; }
  function setMode(mode, ms) {
    if (!alive()) return;
    if (mode !== 'walk') faceCenter();
    stopMoving();
    st.mode = mode;
    send('pet:pose', { mode, dir: st.dir });
    if (ms) st.modeTimer = setTimeout(nextAction, ms);
  }
  // 천천히 돌아다니고 가끔 서서 깜빡인다
  function nextAction() {
    if (!alive() || st.hidden || st.drag || st.talking || st.menu || st.dialog) return;
    if (Math.random() < 0.45) walk(); else setMode('idle', rand(4000, 10000));
  }
  function walk() {
    const home = st.home || { cx: st.cx, by: st.by };
    const disp = displayAt(home.cx, home.by);
    let target = clampPos(home.cx + rand(-RANGE, RANGE), home.by, disp).cx;
    if (Math.abs(target - st.cx) < 30) target = clampPos(st.cx + (st.cx > home.cx ? -60 : 60), home.by, disp).cx;
    st.dir = target < st.cx ? 'left' : 'right';
    setMode('walk');
    let last = Date.now();
    st.walkTimer = setInterval(() => {
      if (!alive()) { stopMoving(); return; }
      const now = Date.now(); const step = SPEED * (now - last) / 1000; last = now;
      const d = target - st.cx;
      if (Math.abs(d) <= step) { st.cx = target; placeWindow(); setMode('idle', rand(2500, 6000)); return; }
      st.cx += Math.sign(d) * step; placeWindow();
    }, 33);
  }

  // ---------- 말주머니 ----------
  function say(text, opts) {
    if (!text || !alive()) return;
    opts = opts || {};
    if (st.dialog) return; // 말풍선 메뉴가 열려 있는 동안은 다른 대사 없음
    if (opts.now) st.queue.unshift(text); else st.queue.push(text);
    if (st.queue.length > 3) st.queue.length = 3;
    if (opts.now && st.talking) { send('pet:hideBubble'); finishTalk(0); return; }
    if (!st.talking) talkNext();
  }
  function talkNext() {
    if (!alive() || st.hidden || st.dialog) return;
    const text = st.queue.shift();
    if (!text) { st.talking = false; if (!st.drag) nextAction(); return; }
    st.talking = true;
    const ms = Talk.tellMs(text);
    if (!st.drag) setMode('talk');
    send('pet:say', { text, ms });
    clearTimeout(st.talkTimer);
    st.talkTimer = setTimeout(() => finishTalk(), ms + 1500); // 화면 쪽 소식이 없어도 다음으로
  }
  function finishTalk(gap) {
    clearTimeout(st.talkTimer);
    st.talking = false;
    setTimeout(() => { if (!st.talking) talkNext(); }, gap === undefined ? 600 : gap);
  }

  // ---------- 끌어 옮기기 ----------
  function dragStart() {
    if (st.drag) return;
    const p = screen().getCursorScreenPoint();
    st.drag = { ox: p.x - st.cx, oy: p.y - st.by, sx: p.x, sy: p.y, moved: false, still: Date.now(), lx: p.x, ly: p.y };
    stopMoving();
    setIgnore(false);
    st.dragTimer = setInterval(() => {
      if (!alive() || !st.drag) { clearInterval(st.dragTimer); return; }
      const q = screen().getCursorScreenPoint(); const d = st.drag;
      if (Math.abs(q.x - d.sx) + Math.abs(q.y - d.sy) > 4 && !d.moved) liftUp();
      if (q.x !== d.lx || q.y !== d.ly) { d.lx = q.x; d.ly = q.y; d.still = Date.now(); }
      else if (d.moved && Date.now() - d.still > 15000) { dragEnd(); return; } // 뗌 소식을 놓쳤을 때 안전장치
      if (d.moved) { st.cx = q.x - d.ox; st.by = q.y - d.oy; placeWindow(); }
    }, 16);
  }
  function liftUp() { // 끌기 시작 = 들어올리기 그림 + 대사 (말풍선 메뉴가 열려 있으면 조용히 닫고)
    st.drag.moved = true;
    if (talk && talk.isOpen()) { talk.cancel(true); st.dialog = false; }
    st.mode = 'drag'; send('pet:pose', { mode: 'drag', dir: st.dir });
    say(lines.line('lift'), { now: true });
  }
  function dragEnd() {
    if (!st.drag) return;
    clearInterval(st.dragTimer);
    const d = st.drag; st.drag = null;
    if (!d.moved) { tap(); return; }
    const p = screen().getCursorScreenPoint();
    const c = clampPos(st.cx, st.by, screen().getDisplayNearestPoint(p)); // 놓은 화면 기준
    st.cx = c.cx; st.by = c.by; st.home = { cx: c.cx, by: c.by };
    placeWindow(); savePos();
    setMode('idle');
    say(lines.line('drop'), { now: true });
  }
  // 한 번 누름 = 말풍선 메뉴. 열려 있으면 닫기("필요하면 또 불러 주세요"). 기록 연결이 없으면 누르기 대사만
  function tap() {
    if (talk && talk.isOpen()) { talk.cancel(false); return; }
    if (talk) { openTalk(false); return; }
    if (st.talking) { send('pet:hideBubble'); finishTalk(); return; }
    say(lines.line('click'));
  }
  // ---------- 말풍선 메뉴 ----------
  async function openTalk(footer) {
    if (!talk || talk.isOpen() || st.hidden || !alive()) return;
    st.queue = []; clearTimeout(st.talkTimer); st.talking = false; send('pet:hideBubble');
    stopMoving();
    st.dialog = true; setMode('idle');
    try { await talk.open({ footer }); }
    finally {
      st.dialog = false; clearTimeout(st.poseTimer); unfocusPet(); setRoom(0);
      if (alive() && !st.hidden && !st.drag) setMode('idle', rand(1500, 3000));
    }
  }
  function onTalkLine(text) { // 펫이 한 줄 말할 때 잠깐 말하기 그림
    if (!st.dialog || st.drag) return;
    setMode('talk'); clearTimeout(st.poseTimer);
    st.poseTimer = setTimeout(() => { if (st.dialog && st.mode === 'talk') setMode('idle'); }, Math.min(2600, 700 + Array.from(String(text)).length * 80));
  }
  function focusPet() { // 키보드 받기. 사람이 펫을 눌러 연 메뉴에서 글을 적는 칸이 나올 때만. 시험은 키보드를 뺏지 않음
    if (!alive()) return;
    if (SHOTS) return;
    pet.setFocusable(true);
    app.focus({ steal: true }); pet.focus();
  }
  function unfocusPet() {
    if (!alive() || !pet.isFocusable()) return;
    pet.blur(); pet.setFocusable(false);
  }
  function setRoom(need) {
    const room = Math.min(DIALOG_ROOM_MAX, Math.max(BUBBLE_ROOM, Math.ceil(need || 0)));
    const h = TH + room; if (h === WIN_H) return;
    WIN_H = h; placeWindow();
  }
  function sendTalk(ch, d) {
    if (ch === 'pet:dlg' && (d.mode === 'input' || d.mode === 'time')) focusPet();
    send(ch, d);
  }
  function setIgnore(ig) {
    if (!alive() || st.ignore === ig) return;
    if (SHOTS) return; // 시험 창은 늘 마우스를 통과시킴 (시험 입력은 sendInputEvent)
    st.ignore = ig;
    pet.setIgnoreMouseEvents(ig, { forward: true });
  }
  // 오른쪽 클릭 = 말풍선 메뉴 + 아래 줄(숨기기·끄기). 열려 있으면 그 줄만 보이게
  function showMenu() {
    if (talk) { if (talk.isOpen()) send('pet:dlgFooter', {}); else openTalk(true); return; }
    say(lines.line('click'));
  }
  function hideForAWhile() {
    if (!alive()) return;
    if (talk && talk.isOpen()) talk.cancel(true);
    st.hidden = true; stopMoving();
    st.queue = []; st.talking = false; clearTimeout(st.talkTimer); send('pet:hideBubble');
    pet.hide();
    if (o.onHidden) o.onHidden(); // 집 창도 없으면 앱이 끝남 (A8, electron/main.js)
    clearTimeout(st.hideTimer);
    st.hideTimer = setTimeout(() => { if (!alive()) return; st.hidden = false; pet.showInactive(); setIgnore(true); nextAction(); }, HIDE_MS);
  }

  // ---------- IPC (펫 화면 -> main). 한 번만 등록, 펫 창에서 온 것만 ----------
  const fromPet = (e) => alive() && e.sender === pet.webContents;
  ipcMain.on('pet:hit', (e, hit) => { if (fromPet(e) && !st.drag) { st.said = !!hit; st.lastHitAt = Date.now(); setIgnore(!hit); } }); // said = 커서 감시가 화면 쪽 판단을 존중 (electron/pet_cursor.js)
  // 커서 감시 (C2 윈도우 클릭 통과): 클릭 받기 중인데 커서가 창 밖이면 다시 통과 (계산은 electron/pet_cursor.js). 시험 창은 늘 통과라 안 돎
  let cursorTimer = null;
  function watchCursor() {
    if (cursorTimer || SHOTS) return;
    cursorTimer = setInterval(() => {
      if (!alive()) return;
      let p; try { p = screen().getCursorScreenPoint(); } catch (e) { return; }
      st.cursor = p;
      const r = Cursor.step({ ignore: st.ignore, drag: !!st.drag, hidden: !!st.hidden, dialog: !!st.dialog, said: st.said === undefined ? null : st.said }, p, { cx: st.cx, by: st.by, tw: TW, th: TH }, pet.getBounds());
      if (r.clearSaid) st.said = null;
      if (r.ignore !== null) { if (r.ignore === false) st.boxOn = (st.boxOn || 0) + 1; setIgnore(r.ignore); }
      if (r.resetHit) send('pet:hitReset');
    }, 120);
    if (cursorTimer.unref) cursorTimer.unref();
  }
  ipcMain.on('pet:dragStart', (e) => { if (fromPet(e)) dragStart(); });
  ipcMain.on('pet:dragEnd', (e) => { if (fromPet(e)) dragEnd(); });
  ipcMain.on('pet:menu', (e) => { if (fromPet(e)) showMenu(); });
  ipcMain.on('pet:bubbleDone', (e) => { if (fromPet(e) && st.talking) finishTalk(); });
  ipcMain.on('pet:dlgAnswer', (e, a) => { if (fromPet(e) && talk && a && typeof a === 'object' && Number.isInteger(a.id)) talk.answer({ id: a.id, value: a.value }); });
  ipcMain.on('pet:footer', (e, a) => {
    if (!fromPet(e) || !a) return;
    if (a.act === 'hide') hideForAWhile();
    else if (a.act === 'quit') { stop(); if (o.onTurnOff) o.onTurnOff(); }
  });
  ipcMain.on('pet:room', (e, need) => { if (fromPet(e) && st.dialog && Number.isFinite(need)) setRoom(need - TH); });

  // ---------- 대사·기록 연결 ----------
  function link() {
    lines = PetLines.build(o.boot());
    talk = null; house = null;
    let parts = null;
    try { parts = o.parts(); } catch (e) { parts = null; }
    if (!parts || !parts.file) return; // 기록 폴더가 없으면 누르기 대사만
    try {
      house = PetHouse.create(Object.assign({ lines, now: o.now }, parts));
      talk = Talk.create({ house, send: sendTalk, onLine: onTalkLine, extra: lines.talk, clickLines: () => lines.clickLines() });
    } catch (e) { console.error('바탕화면 펫: 기록 연결 못 함 ' + (e && e.message)); house = null; talk = null; }
  }
  // 이름·펫 종류를 바꾼 뒤 (설정 화면): 대사 다시 만들기. 메뉴가 열려 있으면 조용히 닫고
  function refresh() {
    if (!alive()) return false;
    if (talk && talk.isOpen()) talk.cancel(true);
    link();
    return true;
  }

  // ---------- 고른 펫 외형 ----------
  // 돌려줌 { pet, kind: 'png' | 'pix', layout, init(화면에 보낼 그림) }.
  //   흰 고양이·모르는 값 = 두부 PNG (pet/png). 4종 = 제작자 챗지피티 그림 pet/png/<펫 id> (2026-10-13, tools/make_pet_sprites.py. 두부와 같은 sprites.json 형식, 들어올리기 있음)
  //   4종 그림을 못 읽으면 하우스 픽셀 그림 5배(2026-10-13 임시판) -> 그것도 없으면 두부 PNG
  function pickLook() {
    const u = (o.boot() || {}).user || {}, id = PETS[u.pet] ? u.pet : 'cat_white';
    if (id !== 'cat_white') {
      const dir = S.petDir(id), pm = S.loadPngManifest(dir);
      if (pm.man) {
        const layout = S.pngLayout(pm.man, STAND_PT);
        return { pet: id, kind: 'png', layout, missing: [], init: { png: { layout, images: S.pngData(pm.man, dir), pixelated: false } } };
      }
      console.error('바탕화면 펫: ' + id + ' 그림 없음 (' + pm.why + ') -> 픽셀 그림');
      const px = S.pixPet(PETS[id].sprite, STAND_PT);
      if (px) return { pet: id, kind: 'pix', layout: px.layout, missing: px.missing, init: { pix: { layout: px.layout, sprites: px.sprites } } };
      console.error('바탕화면 펫: ' + id + ' 픽셀 그림 없음 -> 두부 그림');
    }
    if (!png) {
      const pm = S.loadPngManifest();
      if (!pm.man) { console.error('바탕화면 펫 그림 없음 (' + pm.why + ')'); return null; }
      png = { man: pm.man, layout: S.pngLayout(pm.man, STAND_PT), images: S.pngData(pm.man) };
    }
    return { pet: id === 'cat_white' ? id : 'cat_white', kind: 'png', layout: png.layout, missing: [], init: { png: { layout: png.layout, images: png.images, pixelated: false } } };
  }
  let ui = null, tailSp = null;

  // ---------- 켜기·끄기 ----------
  function start() {
    if (alive()) return true;
    look = pickLook();
    if (!look) return false;
    if (!ui) { ui = S.uiSprites(); tailSp = S.tail(); }
    resetState();
    TW = look.layout.W; TH = look.layout.H;
    WIN_W = Math.max(300, TW + 40); WIN_H = TH + BUBBLE_ROOM;
    link();
    const saved = loadPos();
    const prim = screen().getPrimaryDisplay().workArea;
    const at = saved ? clampPos(saved.cx, saved.by) : clampPos(prim.x + START_FROM_LEFT, prim.y + prim.height);
    st.cx = at.cx; st.by = at.by; st.home = { cx: at.cx, by: at.by };
    faceCenter();
    pet = new BrowserWindow({
      x: Math.round(st.cx - WIN_W / 2), y: Math.round(st.by - WIN_H), width: WIN_W, height: WIN_H,
      frame: false, transparent: true, hasShadow: false, resizable: false, movable: false, fullscreenable: false,
      minimizable: false, maximizable: false, focusable: false, skipTaskbar: true, acceptFirstMouse: true,
      alwaysOnTop: !SHOTS, show: false, title: 'Pixel House Pet', enableLargerThanScreen: true,
      webPreferences: { preload: path.join(__dirname, 'pet_preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    const win = pet;
    if (SHOTS) { if (!o.show) win.setOpacity(0); } // 시험 창: 띄워 둔 채 안 보이게 (하우스 시험 창과 같음)
    else {
      if (o.hide) win.setOpacity(0); // 맥 연기 시험 (PH_SMOKE_HIDE): 안 보이게만, 나머지는 실제와 같음
      win.setAlwaysOnTop(true, 'floating');
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    }
    win.setIgnoreMouseEvents(true, { forward: true }); st.ignore = true;
    watchCursor();
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.on('closed', () => { if (pet === win) { pet = null; clearTimers(); if (talk && talk.isOpen()) talk.cancel(true); } });
    win.loadFile(path.join(__dirname, '..', 'pet', 'index.html'));
    win.webContents.once('did-finish-load', () => {
      if (pet !== win || win.isDestroyed()) return;
      send('pet:init', Object.assign({}, look.init, { tail: tailSp, ui: talk ? ui : {}, foot: FOOT, winW: WIN_W, winH: WIN_H }));
      send('pet:pose', { mode: st.mode, dir: st.dir });
      placeWindow();
      win.showInactive();
      st.greetTimer = setTimeout(() => say(lines.greet(new Date(o.now ? o.now() : Date.now()), (parts0().settings || {}).TIME_BANDS || DEFAULT_BANDS)), 1200); // 시작 인사: 시간대 인사 한 줄
    });
    if (!screenOn) {
      screenOn = true;
      screen().on('display-removed', () => { if (!alive()) return; const c = clampPos(st.cx, st.by); st.cx = c.cx; st.by = c.by; st.home = { cx: c.cx, by: c.by }; placeWindow(); });
      screen().on('display-metrics-changed', () => { if (!alive()) return; const c = clampPos(st.cx, st.by); st.cx = c.cx; st.by = c.by; placeWindow(); });
    }
    return true;
  }
  const DEFAULT_BANDS = [{ id: 'morning', from: 6, to: 11 }, { id: 'day', from: 11, to: 17 }, { id: 'evening', from: 17, to: 21 }, { id: 'night', from: 21, to: 1 }, { id: 'dawn', from: 1, to: 6 }];
  function parts0() { try { return o.parts() || {}; } catch (e) { return {}; } }
  function clearTimers() {
    stopMoving(); clearInterval(st.dragTimer); clearTimeout(st.talkTimer); clearTimeout(st.hideTimer); clearTimeout(st.poseTimer); clearTimeout(st.greetTimer);
    st.drag = null; st.queue = []; st.talking = false;
  }
  function stop() {
    if (talk && talk.isOpen()) talk.cancel(true);
    clearTimers();
    clearInterval(cursorTimer); cursorTimer = null;
    const w = pet; pet = null;
    if (w && !w.isDestroyed()) w.destroy();
    return true;
  }

  // 펫 종류를 바꾼 뒤 (설정 화면): 창을 새 그림으로 다시 띄움 (놓아 둔 자리 그대로)
  function restart() {
    if (!alive()) return false;
    if (st.home) savePos();
    stop(); return start();
  }

  return {
    start, stop, refresh, restart, isOn: alive, window: () => pet,
    state: () => (alive() ? { ignore: !!st.ignore, hidden: !!st.hidden, drag: !!st.drag, dialog: !!st.dialog, bounds: pet.getBounds(), cx: st.cx, by: st.by, th: TH, tw: TW, said: st.said === undefined ? null : st.said, lastHitAt: st.lastHitAt || null, boxOn: st.boxOn || 0,
      cursor: st.cursor || null, inPet: st.cursor ? { x: st.cursor.x - pet.getBounds().x, y: st.cursor.y - pet.getBounds().y } : null, body: { x1: Math.round(st.cx - TW * 0.3), x2: Math.round(st.cx + TW * 0.3), y1: Math.round(st.by - TH * 0.85), y2: Math.round(st.by - TH * 0.1) } } : null), // 진단: 커서 화면 좌표·펫 창 안 좌표·몸 상자 // 연기 시험 (tools/smoke_win.js, PH_SMOKE_STATE)
    look: () => (look ? { pet: look.pet, kind: look.kind, missing: look.missing, k: look.layout.k } : null),
    // 시험용 (tools/shots_deskpet.js)
    T: { st, pose: (mode, dir) => { if (dir) st.dir = dir; stopMoving(); st.mode = mode; send('pet:pose', { mode, dir: st.dir }); }, tap, showMenu, openTalk, hideForAWhile, dragEnd, say, talk: () => talk, house: () => house, lines: () => lines, TH: () => TH, winH: () => WIN_H, liftUp: () => { st.drag = { ox: 0, oy: 0, sx: 0, sy: 0, moved: false, still: Date.now() }; stopMoving(); liftUp(); } },
  };
};
