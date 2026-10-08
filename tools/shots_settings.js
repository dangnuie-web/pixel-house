// 설정 화면 시험 (실제 Electron 창, 2026-10-08 비트): 공용판 사용자(온보딩 끝난 상태, 시험 임시 사용자 폴더)로 설정 창 -> 펫·펫 이름·하우스 이름·내 모습·사이드바 탭·집 도면.
// tests/test_settings_app.js 가 PH_PROFILE=default, PH_SHOTS_PROFILE(profile.json), PH_SHOTS_SCRIPT=shots_settings.js 로 부름. 기록 폴더 = 임시 폴더. 이름은 가짜 "민지"
//   PH_SETTINGS_MODE=player 이면 제작자 묶음(가짜 기록 폴더)에서 설정 버튼이 없는지만 봄
// 다시 여는(reload) 칸이 많아 단계마다 did-finish-load를 기다림. 캡처: preview/set_*.png. 결과: 표준 출력 "RESULT {json}"
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = async function shotsSettings(win, ROOT, opts) {
  const wc = win.webContents;
  const OUT = path.join(ROOT, process.env.PH_SHOTS_OUT || 'preview');
  fs.mkdirSync(OUT, { recursive: true });
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
  const center = (sel) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const clickSel = async (sel) => { const p = await center(sel); if (!p) return false; await click(p.x, p.y); return true; };
  const key = async (k) => { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); if (k === 'Return') wc.sendInputEvent({ type: 'char', keyCode: '\r' }); await sleep(40); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await sleep(120); };
  async function type(sel, text) { await clickSel(sel); await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.select(); return 0; })()`); if (text) wc.insertText(text); else await key('Backspace'); await sleep(80); }
  const loaded = () => new Promise((r) => (wc.isLoading() ? wc.once('did-finish-load', r) : r()));
  const waitFor = async (code, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 8000)) { if (await js(code).catch(() => false)) return true; await sleep(80); } return false; };
  const store = () => { try { return JSON.parse(fs.readFileSync(opts.profileStore(), 'utf8')); } catch (e) { return null; } };
  const st = () => js('PHSettingsUI.state()');
  // 다시 열기를 기다림: 누르기 전에 표시를 남기고, 새 화면(표시 없음)이 뜰 때까지
  async function reloadAfter(fn) {
    await js('window.__before = 1; 0');
    const p = new Promise((r) => wc.once('did-finish-load', r));
    await fn();
    await Promise.race([p, sleep(9000)]); await sleep(700);
    return !(await js('!!window.__before').catch(() => true));
  }

  await loaded(); await sleep(500);
  try { if (process.env.PH_SETTINGS_MODE === 'player') await player(); else await body(); } catch (e) { ok('시험 도중 멈춤: ' + (e && e.message), false, String(e && e.stack).slice(0, 500)); }
  const fail = checks.filter((c) => !c.ok);
  console.log('RESULT ' + JSON.stringify({ pass: checks.length - fail.length, fail: fail.length, failed: fail, errors }));
  return fail.length === 0;

  async function player() {
    const s = await js(`({ id: PHProfile.id, btn: !!document.getElementById('cfg-open'), flag: PH_SETTINGS.SETTINGS_SCREEN, dubu: PH_CHARS.dubu.sprite, brand: document.querySelector('#tabs .brand').textContent })`);
    ok('제작자 묶음: 설정 버튼 없음 (SETTINGS_SCREEN false), 두부 그림·이름표 그대로', s.id === 'player' && !s.btn && s.flag === false && s.dubu === 'dubuM' && s.brand === 'Pixel House', s);
    await js(`PHApp.selectTab('habits'); 0`); await sleep(400);
    ok('제작자 묶음: 사이드바 두부 = 옛 작은 판 dubu_sit (펫 그림 아님)', (await js(`document.getElementById('side-dubu-cv').dataset.pet || ''`)) === '' && (await js(`document.getElementById('side-dubu-cv').width`)) === 16);
    ok('제작자 묶음: 대사 말끝 그대로 냥~ (강아지 바꾸기 안 걸림)', (await js(`JSON.stringify(PH_LINES.click).includes('냥~') && !PHProfile.petApplied`)));
  }

  async function body() {
    // ---- 0. 처음: 공용판 사용자, 입장 화면 ----
    let s = await js(`({ id: PHProfile.id, onboard: PHProfile.isOnboard(), btn: !!document.getElementById('cfg-open'), last: document.querySelector('#tabs').lastElementChild.id, foot: !!document.querySelector('#tabs .tab-foot + #cfg-open'), dubu: PH_CHARS.dubu.sprite, cat: PHProfile.catName() })`);
    ok('공용판 사용자 = 설정 버튼이 사이드바 맨 아래(두부 칸 아래), 펫 = 흰 고양이(dubuM), 이름 콩이', s.id === 'default' && !s.onboard && s.btn && s.foot && s.dubu === 'dubuM' && s.cat === '콩이', s);
    await js(`PHGame.setDayNight('day'); PHApp.redrawCover(); 0`);
    await js('PHApp.onEnter(); 0');
    ok('입장 -> 집 (play)', await waitFor(`PHGame.G.mode === 'play' || !!PHGame.G.dialog`, 15000));
    if (await js('typeof PHGame.skipIntro === "function"')) await js('PHGame.skipIntro(); 0');
    await waitFor(`PHGame.G.mode === 'play' && !PHGame.G.dialog`, 15000); await sleep(300);
    await js('PHGame.setWander && PHGame.setWander(false); PHGame.hideBubble(); 0');

    // ---- 1. 열기: 펫 탭 ----
    await clickSel('#cfg-open'); await sleep(300);
    s = await st();
    const tiles = await js(`[...document.querySelectorAll('#cfg .cfg-pick.pets .cfg-tile')].map((b) => b.dataset.id + (b.getAttribute('aria-checked') === 'true' ? '*' : '') + '=' + b.textContent.trim() + ':' + b.querySelector('canvas').width + 'x' + b.querySelector('canvas').height + '@' + b.querySelector('canvas').style.width)`);
    ok('설정 버튼 -> 설정 창 = 펫 탭, 펫 다섯 칸(흰 고양이 고름), 그림 20x22 3배', s.open && s.tab === 'pet' && tiles.length === 5 && tiles[0].startsWith('cat_white*=흰 고양이:20x22@60px') && tiles[3].startsWith('dog_white=흰 강아지:20x22'), tiles);
    ok('버튼 aria-expanded, 폴더 탭 4개 (펫·집·내 모습·사이드바), 아래 줄 "Esc 닫기"', (await js(`document.getElementById('cfg-open').getAttribute('aria-expanded')`)) === 'true' && (await js(`[...document.querySelectorAll('#cfg .cfg-tab')].map((t) => t.textContent).join()`)) === '펫,집,내 모습,사이드바' && /Esc 닫기/.test(await js(`document.querySelector('#cfg .cfg-foot').textContent`)));
    ok('펫 이름 칸 = 콩이 (이름표 모양)', (await js(`document.getElementById('cfg-pet-name').value`)) === '콩이' && (await js(`!!document.querySelector('#cfg .cfg-input.nametag #cfg-pet-name')`)));
    await shot('set_01_pet');
    // 이름 오류 (다시 열지 않음)
    await type('#cfg-pet-name', '콩|이'); await key('Return'); await sleep(300);
    s = await st();
    ok('펫 이름 "콩|이" -> 오류 글(기호 없이), 저장 안 함', /기호 없이/.test(s.err) && store().cat === '콩이' && (await js('!!document.querySelector("#cfg .cfg-err").textContent')), s);
    await shot('set_02_name_bad');
    await type('#cfg-pet-name', '콩이'); await key('Tab'); await sleep(200);

    // ---- 2. 펫 바꾸기: 흰 강아지 -> 다시 열림, 강아지 말끝 ----
    let re = await reloadAfter(() => clickSel('#cfg .cfg-tile[data-id="dog_white"]'));
    s = await st();
    ok('흰 강아지 고르기 -> profile.json pet = dog_white, 화면 다시 열림, 설정 창 펫 탭 다시 열림', re && store().pet === 'dog_white' && s.open && s.tab === 'pet' && s.resumed && s.pet === 'dog_white', { re, s, store: store() });
    s = await js(`({ sprite: PH_CHARS.dubu.sprite, mode: PHGame.G.mode, art: PHArt.has('dogwhiteM_walk_down') })`);
    ok('집 안 펫 그림 = dogwhiteM (같은 자리, 집 안 그대로)', s.sprite === 'dogwhiteM' && s.mode === 'play' && s.art, s);
    s = await js(`(() => { const names = Object.keys(window).filter((k) => /^PH_(\\w+_)?LINES$/.test(k) && k !== 'PH_PET_LINES'); const left = names.filter((k) => JSON.stringify(window[k]).includes('냥~')); return { names: names.length, left, click: PH_LINES.click[1], living: PH_LINES.room.living[0], hello: PH_ONBOARD_LINES.hello[0], study: PH_STUDY_LINES.saved[0] }; })()`);
    ok('강아지: 모든 대사 묶음 "냥~" 없음 (멍~), 강아지 덮기(클릭·새 방·온보딩), {pet} = 콩이', s.names >= 8 && !s.left.length && s.click === '(꼬리를 붕붕) 콩이 여기 있어요멍~' && s.living === '거실이에요. 집 한가운데라 어디로든 금방 가요멍~' && /멍~$/.test(s.hello) && /멍~$/.test(s.study), s);
    await shot('set_03_dog_picked');
    await key('Escape'); await sleep(300);
    s = await st();
    ok('닫기(Esc) -> 펫 한마디 = petSwap 강아지 줄 (콩이)', !s.open && s.said && s.said.kind === 'petSwap' && s.said.text === '오늘부터 이 집 집사는 콩이예요멍~' && (await js('PHGame.G.bubble && PHGame.G.bubble.text')) === s.said.text, s);
    ok('닫으면 포커스 = 설정 버튼', (await js('document.activeElement && document.activeElement.id')) === 'cfg-open');
    await shot('set_04_dog_house');
    await js(`PHApp.selectTab('habits'); 0`); await sleep(400);
    s = await js(`({ pet: document.getElementById('side-dubu-cv').dataset.pet, w: document.getElementById('side-dubu-cv').width, h: document.getElementById('side-dubu-cv').height })`);
    ok('사이드바 작은 펫 = dogwhiteM_sit 2배 (48x60 칸)', s.pet === 'dogwhiteM_sit' && s.w === 48 && s.h === 60, s);
    await shot('set_05_side_dog');

    // ---- 3. 생활 습관 탭에서 열기 -> 펫 이름 바꾸기 ----
    await clickSel('#cfg-open'); await sleep(300);
    re = await reloadAfter(async () => { await type('#cfg-pet-name', '보리'); await key('Return'); });
    s = await st();
    ok('펫 이름 "보리" (Enter) -> 저장, 다시 열림(생활 습관 탭 그대로), 대사 이름도 보리', re && store().cat === '보리' && s.open && s.petName === '보리' && (await js('PHApp.tab')) === 'habits' && (await js('PH_LINES.click[1]')) === '(꼬리를 붕붕) 보리 여기 있어요멍~', { re, s });
    await js(`document.querySelector('#cfg .cfg-tab[data-tab="house"]').click(); 0`); await sleep(200);

    // ---- 4. 집: 하우스 이름 (다시 열지 않음) ----
    await js('window.__keep = 1; 0');
    await type('#cfg-brand', '보리네 집');
    ok('하우스 이름 칠 때마다 사이드바 이름 미리보기', (await js(`document.querySelector('#tabs .brand').textContent`)) === '보리네 집');
    await key('Return'); await sleep(300);
    s = await js(`({ keep: window.__keep, brand: document.querySelector('#tabs .brand').textContent, title: document.title, ok: document.querySelector('#cfg .cfg-ok.on') && document.querySelector('#cfg .cfg-ok.on').textContent })`);
    ok('Enter -> profile.json brand, 창 제목, ✓ 바꿨어요, 화면은 다시 안 엶', s.keep === 1 && store().brand === '보리네 집' && s.brand === '보리네 집' && s.title === '보리네 집' && s.ok === '✓ 바꿨어요', s);
    await shot('set_06_house');
    await type('#cfg-brand', '콩이네 작은 오두막'); await key('Return'); await sleep(300);
    s = await js(`(() => { const b = document.querySelector('#tabs .brand'); return { t: b.textContent, small: b.classList.contains('small'), fs: getComputedStyle(b).fontSize, over: b.scrollWidth > b.clientWidth + 1, title: b.title }; })()`);
    ok('긴 하우스 이름(10자) -> 사이드바 17px로 줄여 들어가거나 말줄임 + title', s.t === '콩이네 작은 오두막' && (s.small ? s.fs === '17px' : true) && (!s.over || s.title === s.t), s);
    s = await js(`PHSettingsUI.save('brand', '가나다라마바사아자차카', { say: 'house' })`);
    ok('하우스 이름 11자 -> 저장 안 함 (tooLong, 10자)', s && !s.ok && s.code === 'tooLong' && store().brand === '콩이네 작은 오두막', s);
    await type('#cfg-brand', ''); await key('Return'); await sleep(300);
    ok('하우스 이름 비우기 -> Pixel House (profile.json brand 없음)', !('brand' in store()) && (await js(`document.querySelector('#tabs .brand').textContent`)) === 'Pixel House');
    await type('#cfg-brand', '보리네 집'); await key('Return'); await sleep(300);

    // ---- 5. 사이드바 탭 ----
    await js(`document.querySelector('#cfg .cfg-tab[data-tab="side"]').click(); 0`); await sleep(200);
    const sw = await js(`[...document.querySelectorAll('#cfg .cfg-sw')].map((b) => b.dataset.side + '=' + b.getAttribute('aria-checked') + (b.disabled ? '!' : ''))`);
    ok('사이드바 탭 = 우리집(늘 켜짐, 못 끔) + 네 탭 켜짐', sw.join() === 'home=true!,habits=true,meetings=true,bucket=true,archive=true', sw);
    await shot('set_07_side');
    await clickSel('#cfg .cfg-sw[data-side="habits"]'); await sleep(300);
    s = await js(`({ hid: document.querySelector('#tabs [data-tab="habits"]').hidden, tab: PHApp.tab, open: PHSettingsUI.isOpen(), on: document.querySelector('#cfg .cfg-sw[data-side="habits"]').getAttribute('aria-checked') })`);
    ok('보던 탭(생활 습관) 끄기 -> 사이드바에서 빠짐, 우리집으로, 설정 창 그대로, profile.json tabsHidden', s.hid && s.tab === 'home' && s.open && s.on === 'false' && JSON.stringify(store().tabsHidden) === '["habits"]', s);
    await clickSel('#cfg .cfg-sw[data-side="meetings"]'); await sleep(300);
    ok('약속도 끄기 -> tabsHidden 둘', JSON.stringify(store().tabsHidden) === '["habits","meetings"]' && (await js(`document.querySelector('#tabs [data-tab="meetings"]').hidden`)));
    await shot('set_08_side_off');
    await clickSel('#cfg .cfg-sw[data-side="habits"]'); await sleep(300);
    await clickSel('#cfg .cfg-sw[data-side="meetings"]'); await sleep(300);
    ok('다시 켜기 -> tabsHidden 없음, 탭 다시 보임', !('tabsHidden' in store()) && !(await js(`document.querySelector('#tabs [data-tab="habits"]').hidden`)) && !(await js(`document.querySelector('#tabs [data-tab="meetings"]').hidden`)));

    // ---- 6. 내 모습 ----
    await js(`document.querySelector('#cfg .cfg-tab[data-tab="avatar"]').click(); 0`); await sleep(200);
    const avs = await js(`[...document.querySelectorAll('#cfg .cfg-pick.avs .cfg-tile')].map((b) => b.dataset.id + (b.getAttribute('aria-checked') === 'true' ? '*' : '') + '=' + b.textContent.trim() + ':' + b.querySelector('canvas').style.width)`);
    ok('내 모습 세 칸 (avatar1 고름, 보리·도토리·모래, 3배)', avs.length === 3 && avs[0].startsWith('avatar1*=보리') && /px$/.test(avs[0]), avs);
    await shot('set_09_avatar');
    re = await reloadAfter(() => clickSel('#cfg .cfg-tile[data-id="avatar3"]'));
    s = await st();
    ok('avatar3 -> profile.json, 집 안 내 캐릭터 = avatar3, 설정 창 내 모습 탭', re && store().avatar === 'avatar3' && (await js('PH_CHARS.player.sprite')) === 'avatar3' && s.open && s.tab === 'avatar', { re, s });
    // 화살표로 고르기 (펫 탭): 치즈 고양이 -> 고양이 말끝 돌아옴
    await js(`document.querySelector('#cfg .cfg-tab[data-tab="pet"]').click(); 0`); await sleep(200);
    await js(`document.querySelector('#cfg .cfg-tile[data-id="dog_white"]').focus(); 0`);
    re = await reloadAfter(async () => { await key('Left'); await key('Left'); });
    s = await st();
    ok('펫 칸에서 왼쪽 화살표 -> 바로 고름 (검은 고양이 또는 치즈 고양이) + 고양이 말끝 냥~', re && /^cat_/.test(store().pet) && s.pet === store().pet && (await js(`JSON.stringify(PH_LINES.click).includes('냥~') && !JSON.stringify(PH_LINES.click).includes('멍~')`)), { re, s, pet: store().pet });
    await key('Escape'); await sleep(300);
    s = await st();
    ok('여러 칸 바꾼 뒤 닫기 -> 한마디 하나 = petSwap(고양이)', s.said && s.said.kind === 'petSwap' && /냥~$/.test(s.said.text) && s.said.text.includes('보리'), s.said);

    // ---- 7. 밤 · 작은 창 ----
    await js(`PHGame.setDayNight('night'); 0`); await sleep(300);
    await clickSel('#cfg-open'); await sleep(300);
    await shot('set_10_night');
    await key('Escape'); await sleep(200);
    await js(`PHGame.setDayNight('day'); 0`);
    const sz = win.getContentSize();
    win.setContentSize(640, 480); await sleep(500);
    await clickSel('#cfg-open'); await sleep(400);
    s = await js(`({ w: document.querySelector('#cfg .cfg-box').clientWidth, pic: document.querySelector('#cfg .cfg-pick.pets canvas').style.width })`);
    ok('작은 창 (상자 430px 이하) -> 펫 그림 2배', s.w <= 430 && s.pic === '40px', s);
    await shot('set_11_narrow');
    await key('Escape'); await sleep(200);
    win.setContentSize(sz[0], sz[1]); await sleep(400);

    // ---- 8. 집 도면 바꾸기 (투룸) -> 새 집 입장 화면 ----
    await clickSel('#cfg-open'); await sleep(300);
    await js(`document.querySelector('#cfg .cfg-tab[data-tab="house"]').click(); 0`); await sleep(200);
    ok('집 도면 칩 = 원룸(고름)·투룸·쓰리룸', (await js(`[...document.querySelectorAll('#cfg .cfg-chip')].map((c) => c.dataset.house + (c.classList.contains('on') ? '*' : '')).join()`)) === 'room1*,room2,room3');
    re = await reloadAfter(() => clickSel('#cfg .cfg-chip[data-house="room2"]'));
    s = await st();
    ok('투룸 -> profile.json house = room2, 투룸 입장 화면, 설정 창 집 탭', re && store().house === 'room2' && (await js('PH_ART_SET')) === 'room2' && (await js('PHApp.screen')) === 'start' && s.open && s.tab === 'house', { re, s, house: store().house });
    ok('투룸에도 고른 펫·하우스 이름·내 모습 그대로', (await js('PH_CHARS.dubu.sprite')) === ({ cat_cheese: 'catcheeseM', cat_black: 'catblackM' })[store().pet] && (await js(`document.querySelector('#tabs .brand').textContent`)) === '보리네 집' && (await js('PH_CHARS.player.sprite')) === 'avatar3');
    await shot('set_12_room2');
    // 바깥(막) 누르기 = 닫기
    await js(`document.getElementById('cfg').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); 0`); await sleep(200);
    ok('막 누르기 -> 닫힘', !(await js('PHSettingsUI.isOpen()')));
  }
};
