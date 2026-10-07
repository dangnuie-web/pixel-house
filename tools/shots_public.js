// 공용판 흐름 시험 (실제 Electron 창): 첫 실행 온보딩 -> 원룸 입장 -> 가구 기능(물컵·달력·TV) -> 집 꾸미기(자리 후보 바꾸기) -> 다시 열기.
// tests/test_public_app.js 가 PH_PROFILE=default, PH_SHOTS_SCRIPT=shots_public.js 로 부름. 기록 폴더 = 임시 빈 폴더(PH_HOUSE = PH_DEFAULT_DIR), 날짜 PH_TODAY
// 이름은 시험용 가짜 이름 "민지". 실제 생활 기록·제작자 묶음을 쓰지 않음. 캡처: preview/public_*.png. 결과: 표준 출력 "RESULT {json}"
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = async function shotsPublic(win, ROOT, opts) {
  const wc = win.webContents;
  const OUT = path.join(ROOT, process.env.PH_SHOTS_OUT || 'preview');
  fs.mkdirSync(OUT, { recursive: true });
  const S = require(path.join(ROOT, 'js', 'data', 'settings.js'));
  const Md = require(path.join(ROOT, 'js', 'life_md.js'));
  const DIR = process.env.PH_HOUSE, LIFE = path.join(DIR, ...S.LIFE_FILE.split('/'));
  const checks = [], errors = [];
  const ok = (label, cond, extra) => { checks.push({ label, ok: !!cond, extra }); if (process.env.PH_TRACE === '1') console.log('CHK ' + (cond ? 'o ' : 'X ') + label + (cond ? '' : ' ' + JSON.stringify(extra))); };
  wc.on('console-message', (...args) => {
    const e = args[0] && typeof args[0] === 'object' && 'message' in args[0] ? args[0] : { level: args[1], message: args[2] };
    if (e.level === 'error' || e.level === 3) errors.push(e.message);
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { await sleep(150); let img; try { img = await wc.capturePage(); } catch (e) { await sleep(300); img = await wc.capturePage(); } fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); };
  async function click(x, y) { wc.sendInputEvent({ type: 'mouseMove', x, y }); wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 }); await sleep(30); wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 }); await sleep(120); }
  const center = (sel) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const clickSel = async (sel) => { const p = await center(sel); if (!p) return false; await click(p.x, p.y); return true; };
  const loaded = () => new Promise((r) => (wc.isLoading() ? wc.once('did-finish-load', r) : r()));
  const waitFor = async (code, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 8000)) { if (await js(code).catch(() => false)) return true; await sleep(80); } return false; };
  const ob = () => js('PHOnboard.state()');
  const store = () => { try { return JSON.parse(fs.readFileSync(opts.profileStore(), 'utf8')); } catch (e) { return null; } };
  const PERSONAL = /플레이어|player|이웃|guest|PixelHouse|토리|오피스/i;
  const visibleText = () => js('document.body.innerText');

  await loaded(); await sleep(500);
  try { await body(); } catch (e) { ok('시험 도중 멈춤: ' + (e && e.message), false, String(e && e.stack).slice(0, 500)); }
  const fail = checks.filter((c) => !c.ok);
  console.log('RESULT ' + JSON.stringify({ pass: checks.length - fail.length, fail: fail.length, failed: fail, errors }));
  return fail.length === 0;

  async function body() {
    // ---- 1. 첫 실행 = 온보딩 ----
    let st = await js(`({ id: PHProfile.id, onboard: PHProfile.isOnboard(), scr: !document.getElementById('screen-onboard').hidden, start: !document.getElementById('screen-start').hidden, set: PH_ART_SET, brand: document.querySelector('#tabs .brand').textContent, title: document.title })`);
    ok('공용 묶음 + 첫 실행: 온보딩 화면, 입장 화면 숨김, 원룸 세트, 이름표 Pixel House', st.id === 'default' && st.onboard && st.scr && !st.start && st.set === 'room1' && st.brand === 'Pixel House' && st.title === 'Pixel House', st);
    ok('온보딩 첫 줄 = 부기 hello', (await ob()).line.includes('처음 뵙겠어요'), await ob());
    ok('기록 폴더 기본 = 시험 폴더 (PH_DEFAULT_DIR), 기록 파일 아직 없음', (await ob()).folder && (await ob()).folder.dir === DIR && !(await ob()).folder.found && !fs.existsSync(LIFE), await ob());
    await shot('public_01_onboard_hello');
    // 이름: 빈칸 -> 안내, "민지" -> 다음
    await clickSel('#ob-next'); await sleep(200);
    ok('이름 빈칸 -> name.empty 줄, 그대로 이름 단계', (await ob()).step === 'name' && (await ob()).line.includes('한 글자만이라도'), await ob());
    await js(`(() => { const i = document.getElementById('ob-name'); i.value = '가나다라마바사아자차카타파'; i.dispatchEvent(new Event('input')); })()`);
    await clickSel('#ob-next'); await sleep(200);
    ok('이름 13자 -> tooLong 줄', (await ob()).step === 'name' && (await ob()).line.includes('짧게'), await ob());
    await js(`(() => { const i = document.getElementById('ob-name'); i.value = '민지'; i.dispatchEvent(new Event('input')); })()`);
    await clickSel('#ob-next'); await sleep(250);
    let o = await ob();
    ok('이름 "민지" -> 모습 단계, 두부가 {user}님으로 부름', o.step === 'avatar' && o.name === '민지' && o.line.includes('민지님') && !o.line.includes('{user}'), o);
    const av = await js(`[...document.querySelectorAll('.ob-av')].map((b) => ({ av: b.dataset.av, w: b.querySelector('canvas').width, name: b.textContent.trim() }))`);
    ok('아바타 3명 그림(32x36 x3)·임시 이름', av.length === 3 && av.every((a) => a.w === 96) && av.map((a) => a.name).join() === '보리,도토리,모래', av);
    await shot('public_02_onboard_avatar');
    await clickSel('.ob-av[data-av="avatar2"]'); await sleep(150);
    ok('아바타2 고름 -> avatar.pick 줄', (await ob()).avatar === 'avatar2', await ob());
    await clickSel('#ob-next'); await sleep(250);
    ok('집 단계: 원룸 하나 (목록형), 그림 256x240', (await ob()).step === 'house' && (await js(`(() => { const c = document.getElementById('ob-house-cv'); return document.querySelectorAll('.ob-house').length === 1 && c.width === 256 && c.height === 240; })()`)), await ob());
    await shot('public_03_onboard_house');
    await clickSel('#ob-next'); await sleep(250);
    ok('기록 폴더 단계: 기본 폴더 경로 + 고르기 버튼', (await ob()).step === 'folder' && (await js(`document.getElementById('ob-dir').textContent`)) === DIR && !!(await center('#ob-pick')), await ob());
    await shot('public_04_onboard_folder');
    await clickSel('#ob-next'); await sleep(250);
    ok('습관 단계: 추천 6개, 물만 처음부터 골라 둠', (await ob()).step === 'habit' && (await js(`document.querySelectorAll('.ob-chip[data-habit]').length`)) === 6 && (await ob()).habits.join() === 'water', await ob());
    await clickSel('.ob-chip[data-habit="yoga"]'); await clickSel('.ob-chip[data-habit="reading"]');
    await js(`(() => { const i = document.getElementById('ob-habit-new'); i.value = '일기'; })()`); await clickSel('#ob-habit-add'); await sleep(150);
    o = await ob();
    ok('요가·독서 고름 + 직접 "일기" 더함', o.habits.join() === 'water,yoga,reading' && o.custom.join() === '일기', o);
    ok('온보딩 화면에 개인 이름·이웃·토리 글 없음', !PERSONAL.test(await visibleText()), (await visibleText()).match(PERSONAL));
    await shot('public_05_onboard_habit');
    // 들어가기 -> 메인이 기록 파일·profile.json 을 만들고 화면을 다시 엶
    const reloaded = new Promise((r) => wc.once('did-finish-load', r));
    await clickSel('#ob-next');
    await Promise.race([reloaded, sleep(9000)]); await sleep(600);
    const pf = store();
    ok('profile.json = 공용 묶음 + 민지·avatar2·room1·시험 폴더', pf && pf.bundle === 'default' && pf.name === '민지' && pf.avatar === 'avatar2' && pf.house === 'room1' && pf.dir === DIR, pf);
    ok('기록 파일 생김 (빈 틀 + 고른 습관: 물·요가·일기 목표, 독서 기록)', fs.existsSync(LIFE) && (() => { const d = Md.parse(fs.readFileSync(LIFE, 'utf8')); return d.habits.rows.map((r) => r.name + ':' + r.kind).join() === '물:목표,요가:목표,일기:목표,독서:기록' && !!d.meetingsSection; })(), fs.existsSync(LIFE) && fs.readFileSync(LIFE, 'utf8').slice(0, 600));
    st = await js(`({ onboard: PHProfile.isOnboard(), start: !document.getElementById('screen-start').hidden, user: PHProfile.userName(), char: PH_CHARS.player.sprite, tabs: getComputedStyle(document.querySelector('#tabs [data-tab=habits]')).visibility })`);
    ok('다시 열림: 입장 화면, 이름 민지, 내 캐릭터 = avatar2, 탭 보임', !st.onboard && st.start && st.user === '민지' && st.char === 'avatar2' && st.tabs === 'visible', st);
    await shot('public_06_cover');

    // ---- 2. 입장: 원룸, 현관문 칸에서 시작, 첫 인사 = intro.afterOnboard ----
    await js('PHApp.onEnter(); 0');
    let said = '';
    for (let i = 0; i < 60; i++) { const s = await js('PHGame.snapshot()'); if (s.dialog && s.dialog.text) { said = s.dialog.text; break; } await sleep(100); }
    ok('입장 첫 대화 = "이제 진짜 우리 집이에요. 어서 오세요, 민지님냥~"', said === '이제 진짜 우리 집이에요. 어서 오세요, 민지님냥~', said);
    await shot('public_07_enter');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 0`);
    await waitFor('PHGame.snapshot().mode === "play"', 6000); await sleep(400);
    let g = await js('PHGame.snapshot()');
    ok('입장 끝: 조작 = 내 캐릭터(아바타), 현관 안, 두부 보임', g.mode === 'play' && g.ctrl === 'player' && g.me.zone === 'genkan' && g.dubu.visible && g.cols === 16 && g.rows === 15, g);
    const pos = await js('PHGame.tileToClient(13, 7)'); await click(pos.x, pos.y);
    await waitFor('PHGame.snapshot().me.x === 13 && PHGame.snapshot().me.y === 7 && !PHGame.snapshot().me.moving', 8000);
    g = await js('PHGame.snapshot()');
    ok('방 칸 클릭 -> 걸어가서 방에 도착, 방 이름표 "방"', g.me.x === 13 && g.me.y === 7 && g.me.zone === 'room' && (await js(`document.getElementById('room-name').textContent`)) === '방', g.me);
    ok('집 화면에 개인 이름·이웃·토리 글 없음', !PERSONAL.test(await visibleText()), (await visibleText()).match(PERSONAL));
    await shot('public_08_room');

    // ---- 3. 가구 기능 (무늬 자리 표): 물컵 = 물 +1, 달력 = 약속 탭, TV = 영화·연극 기록, 냉장고 = 메모지 ----
    const links = await js('PHFeatures.resolve(PHInteractLogic.linkKeys(PH_LAYOUT, PH_INTERACTIONS).all, {})');
    ok('기본 연결 = 무늬 자리 표 (침대 마감, 주방 살림, 물컵 물+1, 냉장고 메모, 달력 약속, 책꽂이 독서, TV 기록, 탁자 식사, 러그 요가, 책상 공부, 변기 대변)', links.bed === 'close' && links.kitchen_cabinet === 'inv_kitchen' && links.cup_water === 'water_cup' && links.fridge === 'memo' && links.calendar === 'calendar' && links.bookshelf === 'reading' && links.tv_cabinet === 'record' && links.table_low === 'meal' && links.rug === 'yoga' && links.desk === 'study' && links.toilet === 'poop' && !links['tv_cabinet.part'], links);
    await js('PHInteract.activateType("cup_water"); 0'); await sleep(900);
    const rec = Md.parse(fs.readFileSync(LIFE, 'utf8')).records;
    ok('물컵 누르기 -> 기록 파일 오늘 물 1/6', JSON.stringify(rec).includes('물 1/6'), rec);
    await js('PHInteract.activateType("calendar"); 0'); await sleep(900);
    ok('벽 달력 누르기 -> 약속 탭', (await js('PHApp.tab')) === 'meetings', await js('PHApp.tab'));
    await shot('public_09_calendar_meetings');
    await js('PHApp.selectTab("home"); 0'); await sleep(400);
    await js('PHInteract.activateType("tv_cabinet"); 0'); await sleep(700);
    ok('TV 누르기 -> 영화·연극 기록 창', await js('!!(window.PHRecordModal && PHRecordModal.isOpen && PHRecordModal.isOpen())'), null);
    await shot('public_10_tv_record');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 0`); await sleep(300);
    if (await js('!!(window.PHRecordModal && PHRecordModal.isOpen && PHRecordModal.isOpen())')) await js('PHRecordModal.close && PHRecordModal.close(); 0');
    await sleep(300);
    const wall = await js('({ slots: (PH_LAYOUT.wallSlots || []).map((s) => s.id), drawn: !PH_LAYOUT.objects.some((o) => o.type === "memo_bucket") })');
    ok('벽 메모지 자리 3곳(무늬 wall_slots), 배치표 메모지 물건은 메모지 모듈이 그림', wall.slots.join() === 'room_north,genkan_wall,lamp_wall' && wall.drawn, wall);

    // ---- 4. 집 꾸미기 (가): 침대 자리 -> 소파베드 ----
    await js('PHFurnishUI.setMode(true); 0'); await sleep(200);
    await js('PHFurnishUI.openMenu(PHInteract.spots().find((s) => s.key === "bed")); 0'); await sleep(200);
    const sw = await js(`[...document.querySelectorAll('.fn-swap-b')].map((b) => ({ s: b.dataset.sprite, t: b.textContent, on: b.getAttribute('aria-pressed') }))`);
    ok('침대 자리 목록에 가구 바꾸기 후보 2개 (넓은 침대 = 지금, 소파베드)', sw.length === 2 && sw[0].s === 'bed_wide' && sw[0].on === 'true' && sw[1].t === '소파베드', sw);
    await shot('public_11_furnish_swap');
    const re2 = new Promise((r) => wc.once('did-finish-load', r));
    await clickSel('.fn-swap-b[data-sprite="sofa"]');
    await Promise.race([re2, sleep(6000)]); await sleep(700);
    g = await js('PHGame.snapshot()');
    const bed = await js('(() => { const o = PH_LAYOUT.objects.find((q) => q.type === "bed"); return { sprite: o.sprite, px: o.px, py: o.py, name: PHFeatures.nameOf("bed") }; })()');
    ok('소파베드로 바뀜: 저장(profile.json furniture.bed = sofa), 자리 기준점 왼쪽 아래 (195, 72), 이름 소파베드', (store().furniture || {}).bed === 'sofa' && bed.sprite === 'sofa' && bed.px === 195 && bed.py === 72 && bed.name === '소파베드', [store(), bed]);
    ok('다시 연 뒤 입장 연출 없이 그 자리에서 이어짐 (play)', g.mode === 'play' && g.me.zone === 'room', g);
    ok('침대 자리 기능(하루 마감)은 그대로', (await js('PHFeatures.resolve(PHInteractLogic.linkKeys(PH_LAYOUT, PH_INTERACTIONS).all, {}).bed')) === 'close', null);
    await shot('public_12_sofa');

    // ---- 5. 다시 켠 것처럼: 온보딩 없이 입장 화면 ----
    const re3 = new Promise((r) => wc.once('did-finish-load', r));
    opts.reopen().catch(() => {}); // loadFile 약속은 기다리지 않고 화면 다 읽힘만 기다림
    await Promise.race([re3, sleep(8000)]); await sleep(600);
    if (process.env.PH_TRACE === '1') console.log('TRACE reopened');
    st = await js(`({ onboard: PHProfile.isOnboard(), start: !document.getElementById('screen-start').hidden, user: PHProfile.userName() })`);
    ok('다시 켜면 온보딩 없이 입장 화면 (저장된 민지)', !st.onboard && st.start && st.user === '민지', st);
    ok('화면 오류 없음', errors.length === 0, errors.slice(0, 5));
  }
};
