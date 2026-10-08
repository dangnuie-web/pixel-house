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
  // 누르기 전 화면 안으로 (온보딩 집 단계는 집 세 칸 + 1배 미리보기라 작은 창에선 카드가 길어 스크롤됨)
  const center = (sel) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
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
    ok('이름 "민지" -> 고양이 이름 단계 (3-1단계), 두부가 {user}님으로 부르고 이름 묻기 (부기 1-1 cat.ask 둘 중 하나)', o.step === 'cat' && o.name === '민지' && o.line.includes('민지님') && (o.line.includes('두부예요') || o.line.includes('이번엔 제 차례예요')) && !/\{user\}|\{cat/.test(o.line) && o.cat === '두부', o);
    ok('고양이 단계: 이름 칸(빈칸 = 기본 두부) + 안내, 단계 표시 6칸', (await js(`!!document.getElementById('ob-cat') && document.getElementById('ob-cat').value === '' && document.querySelectorAll('.ob-steps li').length === 6 && document.querySelector('.ob-steps li.on').textContent === '2고양이'`))); // 단계 = 번호 원 + 글 (무늬 3-1 #2)
    await shot('public_01b_onboard_cat');
    await js(`(() => { const i = document.getElementById('ob-cat'); i.value = '콩|이'; i.dispatchEvent(new Event('input')); })()`);
    await clickSel('#ob-next'); await sleep(250);
    ok('고양이 이름에 못 쓰는 글자 -> cat.bad 줄, 그대로', (await ob()).step === 'cat' && (await ob()).line.includes('못 쓰는 글자'), await ob());
    await js(`(() => { const i = document.getElementById('ob-cat'); i.value = '콩이'; i.dispatchEvent(new Event('input')); })()`);
    await clickSel('#ob-next'); await sleep(250);
    o = await ob();
    ok('고양이 이름 "콩이" -> 모습 단계, 두부가 새 이름으로 (cat.ok)', o.step === 'avatar' && o.cat === '콩이' && /^(콩이, 좋아요. 오늘부터 저는 콩이예요|제 이름이 생겼어요. 콩이, 마음에 쏙|콩이. 부르시면 바로 갈게요)/.test(o.line) && !o.line.includes('{cat'), o);
    const av = await js(`[...document.querySelectorAll('.ob-av')].map((b) => ({ av: b.dataset.av, w: b.querySelector('canvas').width, name: b.textContent.trim() }))`);
    ok('아바타 3명 그림(32x36 x3)·임시 이름', av.length === 3 && av.every((a) => a.w === 96) && av.map((a) => a.name).join() === '보리,도토리,모래', av);
    await shot('public_02_onboard_avatar');
    await clickSel('.ob-av[data-av="avatar2"]'); await sleep(150);
    ok('아바타2 고름 -> avatar.pick 줄', (await ob()).avatar === 'avatar2', await ob());
    await clickSel('#ob-next'); await sleep(250);
    // 무늬 공용판마무리 v01 1절 (2026-10-09): 넓은 창 = 왼쪽 목록 280 / 오른쪽 미리보기 틀 384x320 고정, 아이콘 72x60 틀(가운데·아래), 글 x 같게, 스크롤 없이 [다음]
    const houseGeo = () => js(`(() => { const R = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) }; };
      const card = document.querySelector('.ob-card'), box = document.querySelector('.ob-preview-box'), c = document.getElementById('ob-house-cv'), nx = document.getElementById('ob-next'), sc = document.getElementById('screen-onboard');
      return { n: [...document.querySelectorAll('.ob-house')].map((b) => b.dataset.house + ':' + b.querySelector('b').textContent + ':' + b.getAttribute('aria-checked')).join(),
        plans: [...document.querySelectorAll('canvas[data-plan]')].map((p) => p.width + 'x' + p.height).join(), frames: [...document.querySelectorAll('.ob-plan')].map((f) => R(f).w + 'x' + R(f).h).join(),
        planBottom: [...document.querySelectorAll('.ob-plan')].map((f) => R(f).b - R(f.querySelector('canvas')).b).join(), textX: [...document.querySelectorAll('.ob-house')].map((b) => R(b.querySelector('.ob-house-t')).x - R(b).x).join(),
        list: R(document.querySelector('.ob-houses')), box: R(box), boxIn: [box.clientWidth, box.clientHeight], cv: R(c), w: c.width, h: c.height, card: R(card), isHouse: card.classList.contains('is-house'),
        cols: getComputedStyle(document.querySelector('.ob-houses')).gridTemplateColumns || '', smallShown: [...document.querySelectorAll('.ob-house-t small')].map((s) => getComputedStyle(s).display !== 'none').join(),
        rooms: document.querySelector('.ob-rooms').textContent, roomsShown: getComputedStyle(document.querySelector('.ob-rooms')).display !== 'none', concept: document.querySelector('.ob-concept').textContent,
        note: (document.querySelector('.ob-preview .ob-note') || {}).textContent || '', next: R(nx), vh: innerHeight, scroll: sc.scrollHeight > sc.clientHeight, padTop: getComputedStyle(sc).paddingTop }; })()`);
    const PLN = await js('PH_ONBOARD_PLAIN');
    { const hs = await houseGeo();
      ok('집 단계: 원룸·투룸·쓰리룸 세 칸 (평면 아이콘 48x45·63x48·72x60 = 1칸 3px 그대로), 원룸 골라짐, 미리보기 256x240', (await ob()).step === 'house' && hs.n === 'room1:원룸:true,room2:투룸:false,room3:쓰리룸:false' && hs.plans === '48x45,63x48,72x60' && hs.w === 256 && hs.h === 240, hs);
      ok('집 단계 넓은 창(기본 창): 카드 740·위 여백 24, 왼쪽 목록 280 / 20 띄고 오른쪽 미리보기 틀 안쪽 384x320, 아이콘 틀 72x60 세 칸 같음(아래 맞춤), 글 x 세 칸 같음, 방 구성 목록에', hs.isHouse && hs.card.w === 740 && hs.padTop === '24px' && hs.list.w === 280 && hs.box.x - hs.list.r === 20 && hs.boxIn.join() === '384,320' && Math.abs(hs.box.y - hs.list.y) <= 1 && hs.frames === '72x60,72x60,72x60' && hs.planBottom === '0,0,0' && new Set(hs.textX.split(',')).size === 1 && hs.smallShown === 'true,true,true' && !hs.roomsShown, hs);
      ok('집 단계: 원룸 미리보기 = 틀 안 가로 가운데·아래 맞춤, 콘셉트 = 부기 houseConcept, 그 아래 houseNote 한 줄', Math.abs((hs.cv.x - hs.box.x) - (hs.box.r - hs.cv.r)) <= 1 && Math.abs(hs.box.b - 2 - hs.cv.b) <= 1 && hs.concept === PLN.houseConcept.room1 && hs.note === PLN.houseNote, hs);
      ok('집 단계: 기본 창에서 스크롤 없이 [다음]까지 보임', !hs.scroll && hs.next.b <= hs.vh, hs); }
    await clickSel('.ob-house[data-house="room3"]'); await sleep(200);
    { const h3 = await js(`(() => { const c = document.getElementById('ob-house-cv'); return { w: c.width, h: c.height, on: document.querySelector('.ob-house[aria-checked=true]').dataset.house, px: c.getContext('2d').getImageData(200, 200, 1, 1).data[3] }; })()`), g3 = await houseGeo(), HL = await js('PH_ONBOARD_LINES.house');
      ok('쓰리룸 누르기 -> 고름 + 미리보기 384x320 (그림 있음) + pick_room3·pick 중 한 줄 + 콘셉트 바뀜', (await ob()).house === 'room3' && h3.w === 384 && h3.h === 320 && h3.on === 'room3' && h3.px === 255 && HL.pick_room3.concat(HL.pick).includes((await ob()).line) && g3.concept === PLN.houseConcept.room3, { h3, line: (await ob()).line, c: g3.concept });
      ok('쓰리룸으로 바꿔도 미리보기 틀 자리·크기 그대로 (출렁이지 않음)', g3.boxIn.join() === '384,320' && g3.card.h === (await houseGeo()).card.h, g3); }
    await shot('public_03b_onboard_house_room3');
    { const a = await houseGeo(); await clickSel('.ob-house[data-house="room2"]'); await sleep(200); const b = await houseGeo();
      ok('투룸으로 바꿔도 미리보기 틀·카드 자리 그대로', b.box.x === a.box.x && b.box.y === a.box.y && b.card.h === a.card.h && b.w === 336 && b.concept === PLN.houseConcept.room2, { a: a.box, b: b.box, ah: a.card.h, bh: b.card.h }); }
    await shot('public_03a_onboard_house_room2');
    // 좁은 창 (무늬 1절: 창 폭 < 984 -> 목록 가로 3칸, 아이콘 위·이름 아래, 방 구성은 미리보기 아래 첫 줄, [다음]은 카드 아래에 붙음)
    { const [W0, H0] = win.getContentSize(); win.setContentSize(800, 600); await sleep(400);
      const n = await houseGeo();
      ok('좁은 창(800x600): 목록 가로 3칸(칸 너비 같음)·방 구성 목록에서 빠지고 미리보기 아래 첫 줄·미리보기 틀 384x320 그대로', n.cols.split(' ').length === 3 && n.smallShown === 'false,false,false' && n.roomsShown && n.rooms.length > 0 && n.boxIn.join() === '384,320' && n.frames === '72x60,72x60,72x60', n);
      ok('좁은 창: 스크롤이 생겨도 [다음]이 창 안에 보임 (sticky)', n.next.b <= n.vh && n.next.y >= 0, { next: n.next, vh: n.vh, scroll: n.scroll });
      await shot('public_03c_onboard_house_narrow');
      win.setContentSize(W0, H0); await sleep(400); }
    await clickSel('.ob-house[data-house="room1"]'); await sleep(200);
    await shot('public_03_onboard_house');
    await clickSel('#ob-next'); await sleep(250);
    { const fd = await js(`(() => { const d = document.getElementById('ob-dir'); return { title: d.title, text: d.textContent, tag: d.tagName, file: (document.querySelector('.ob-file-row') || {}).textContent || '', fileWrap: getComputedStyle(document.querySelector('.ob-file-row b')).whiteSpace, dash: getComputedStyle(document.querySelector('.ob-folder')).borderTopStyle, icon: !!document.getElementById('ob-folder-cv') }; })()`);
      // 무늬 3-1 #7: 경로 = 보통 글(코드 칸 아님), 홈은 ~, 전체 경로는 title / 파일 이름 따로 한 줄 nowrap / 점선 칸 + 폴더 그림
      ok('기록 폴더 단계: 기본 폴더 경로 + 고르기 버튼 (점선 칸·폴더 그림·보통 글 경로, "새로 생길 파일 PixelHouse_생활기록.md" 한 줄)', (await ob()).step === 'folder' && fd.title === DIR && fd.tag === 'SPAN' && fd.text === DIR.replace(/^\/Users\/[^/]+/, '~') && /^새로 생길 파일 \S+\.md$/.test(fd.file) && fd.fileWrap === 'nowrap' && fd.dash === 'dashed' && fd.icon && !!(await center('#ob-pick')), fd); }
    await shot('public_04_onboard_folder');
    await clickSel('#ob-next'); await sleep(250);
    ok('습관 단계: 추천 6개, 물만 처음부터 골라 둠', (await ob()).step === 'habit' && (await js(`document.querySelectorAll('.ob-chip[data-habit]').length`)) === 6 && (await ob()).habits.join() === 'water', await ob());
    await clickSel('.ob-chip[data-habit="yoga"]'); await clickSel('.ob-chip[data-habit="reading"]');
    // 부기 공용판 v01 1-1: 직접 더하기 두부 말 (못 쓰는 이름 bad · 이미 있음 dup · 더함 added)
    const HL = await js('PH_ONBOARD_LINES.habit');
    await js(`(() => { const i = document.getElementById('ob-habit-new'); i.value = '물'; })()`); await clickSel('#ob-habit-add'); await sleep(150);
    o = await ob();
    ok('직접 "물" (추천에 있음) -> 안 더함 + habit.dup', o.custom.length === 0 && HL.dup.some((t) => t.startsWith(o.line.slice(0, 6))), o);
    await js(`(() => { const i = document.getElementById('ob-habit-new'); i.value = '1일 1그림'; })()`); await clickSel('#ob-habit-add'); await sleep(150);
    o = await ob();
    ok('직접 "1일 1그림" (숫자로 시작) -> 안 더함 + habit.bad, 적던 글 그대로', o.custom.length === 0 && HL.bad.some((t) => t.startsWith(o.line.slice(0, 6))) && (await js(`document.getElementById('ob-habit-new').value`)) === '1일 1그림', o);
    await js(`(() => { const i = document.getElementById('ob-habit-new'); i.value = '일기'; })()`); await clickSel('#ob-habit-add'); await sleep(150);
    o = await ob();
    ok('직접 "일기" -> 더함 + habit.added', HL.added.some((t) => t.startsWith(o.line.slice(0, 6))), o);
    { const ui = await js(`({ n: [...document.querySelectorAll('.ob-steps .n')].map((x) => x.textContent).join(), cur: (document.querySelector('.ob-steps li[aria-current=step]') || {}).textContent, chipMark: getComputedStyle(document.querySelector('.ob-chip[aria-pressed=true]'), '::before').content, skipBg: getComputedStyle(document.getElementById('ob-skip')).backgroundColor, skipLine: getComputedStyle(document.getElementById('ob-skip')).borderTopColor, nw: !!document.querySelector('#ob-say .nw'), tail: getComputedStyle(document.getElementById('ob-say'), '::before').content })`);
      ok('무늬 3-1: 단계 = 번호 원(지난 ✓·지금 6) / 고른 칩 앞 ✓ / 건너뛰기 = 글 버튼(바탕·테 없음) / 말풍선 꼬리 + 마지막 어절 묶음', ui.n === '✓,✓,✓,✓,✓,6' && ui.cur === '6습관' && ui.chipMark === '"✓"' && ui.skipBg === 'rgba(0, 0, 0, 0)' && ui.skipLine === 'rgba(0, 0, 0, 0)' && ui.nw && ui.tail === '""', ui); }
    ok('요가·독서 고름 + 직접 "일기" 더함', o.habits.join() === 'water,yoga,reading' && o.custom.join() === '일기', o);
    ok('온보딩 화면에 개인 이름·이웃·토리 글 없음', !PERSONAL.test(await visibleText()), (await visibleText()).match(PERSONAL));
    await shot('public_05_onboard_habit');
    // 들어가기 -> 메인이 기록 파일·profile.json 을 만들고 화면을 다시 엶
    const reloaded = new Promise((r) => wc.once('did-finish-load', r));
    await clickSel('#ob-next');
    await Promise.race([reloaded, sleep(9000)]); await sleep(600);
    const pf = store();
    ok('profile.json = 공용 묶음 + 민지·고양이 콩이·avatar2·room1·시험 폴더', pf && pf.bundle === 'default' && pf.name === '민지' && pf.cat === '콩이' && pf.avatar === 'avatar2' && pf.house === 'room1' && pf.dir === DIR, pf);
    ok('기록 파일 생김 (빈 틀 + 고른 습관: 물·요가·일기 목표, 독서 기록)', fs.existsSync(LIFE) && (() => { const d = Md.parse(fs.readFileSync(LIFE, 'utf8')); return d.habits.rows.map((r) => r.name + ':' + r.kind).join() === '물:목표,요가:목표,일기:목표,독서:기록' && !!d.meetingsSection; })(), fs.existsSync(LIFE) && fs.readFileSync(LIFE, 'utf8').slice(0, 600));
    st = await js(`({ onboard: PHProfile.isOnboard(), start: !document.getElementById('screen-start').hidden, user: PHProfile.userName(), char: PH_CHARS.player.sprite, tabs: getComputedStyle(document.querySelector('#tabs [data-tab=habits]')).visibility })`);
    ok('다시 열림: 입장 화면, 이름 민지, 내 캐릭터 = avatar2, 탭 보임', !st.onboard && st.start && st.user === '민지' && st.char === 'avatar2' && st.tabs === 'visible', st);
        await js(`PHGame.setDayNight('day'); PHApp.redrawCover(); 0`); await sleep(300); // 낮 입장 그림 (시험 시각과 상관없이)
    await shot('public_06_cover');
    const cat = await js(`({ name: PHProfile.catName(), tag: PH_DIALOG_LINES.name, click: PH_LINES.click.filter((t) => /여기 있어요/.test(t)), intro: PH_LINES.intro.map((x) => x.say || '').join(' '), win: PH_LINES.entrance.idle.window, left: JSON.stringify([PH_LINES, PH_DIALOG_LINES]).includes('{cat') })`);
    ok('켠 뒤 고양이 이름 = 콩이: 대화창 이름표·클릭 대사·입장 대사·입장 화면 글 ({cat} 남은 곳 없음)', cat.name === '콩이' && cat.tag === '콩이' && cat.click.some((t) => t.includes('콩이 여기 있어요')) && cat.intro.includes('집사 콩이예요') && cat.win.includes('콩이가 기다린다') && !cat.left, cat);

    // 입장 그림 = 무늬 entrance_room1_v01 (임시 표지 대신, 2026-10-08 공용판후속 v01 2절): 384x256, 버튼 = button_zone 세로 가운데, 밤 = palette_night
    const cov = await js(`(() => { const e = PH_ASSETS.entrance, cv = document.getElementById('cover-cv'), el = document.getElementById('cover'), b = PH_SETTINGS.ENTER_BUTTON;
      return { file: e && e.file, w: cv.width, h: cv.height, by: Number(el.style.getPropertyValue('--by')), want: e && e.button_zone && (e.button_zone.py + Math.floor((e.button_zone.h - b.h) / 2)), door: e && e.door_zone, night: !!(e && e.palette_night) }; })()`);
    ok('입장 그림 = entrance_room1_v01 (384x256, 입장하기 = button_zone 자리, door_zone·밤 팔레트 있음)', cov.file === '20261008_pixel-house_entrance_room1_v01.json' && cov.w === 384 && cov.h === 256 && cov.by === cov.want && !!cov.door && cov.night, cov);
    await js(`PHGame.setDayNight('night'); PHApp.redrawCover(); 0`); await sleep(300);
    await shot('public_06b_cover_night');
    // 집 안 캡처는 늘 낮으로 (시험 시각과 상관없이). 전에는 'auto'로 되돌려서 18시 넘어 돌리면 낮 캡처(public_08 등)도 밤으로 찍혀
    //   밤 캡처 public_night_01과 픽셀이 같았음 (무늬 확인모음 v01 ②. 집 밤 그리기는 정상, 시험 쪽 문제)
    await js(`PHGame.setDayNight('day'); PHApp.redrawCover(); 0`); await sleep(300);
    // ---- 2. 입장: 원룸, 현관문 칸에서 시작, 첫 인사 = intro.afterOnboard ----
    // 현관문(door_zone)을 눌러도 입장 (무늬 2절). 진짜 누르기로
    { const dp = await js(`(() => { const z = PH_ASSETS.entrance.door_zone, r = document.getElementById('cover-cv').getBoundingClientRect(), k = r.width / 384; return { x: Math.round(r.left + (z.px + z.w / 2) * k), y: Math.round(r.top + (z.py + z.h / 2) * k) }; })()`);
      await click(dp.x, dp.y); await sleep(200);
      ok('현관문 누르기 -> 입장 (문 열림 장 1)', (await js('PHApp.lastCoverHit')) === 'door' && ((await js('PHApp.entering || PHApp.screen === "house"'))), await js('({ hit: PHApp.lastCoverHit, screen: PHApp.screen, door: PHApp.door })')); }
    if ((await js('PHApp.screen')) === 'start') await js('PHApp.onEnter(); 0');
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

    // ---- 3. 가구 기능 (무늬 자리 표): 물컵 = 물 +1, 달력 = 약속 탭, TV = 영화 기록, 냉장고 = 메모지 ----
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
    { const tv = await js(`(() => { const o = !!(window.PHRecordModal && PHRecordModal.isOpen && PHRecordModal.isOpen()), s = o ? PHRecordModal.state() : null; return { open: o, group: s && s.list ? s.list.group.join() : '', pills: s ? s.pills.length : -1, title: (document.querySelector('#rm .bm-title') || {}).textContent || '' }; })()`);
      ok('TV 누르기 -> 영화 기록 창 (공용판 새 파일 = 영화 한 칸, 알약 없음, 제목 영화. 2026-10-08 제작자)', tv.open && tv.group === '영화' && tv.pills === 0 && tv.title === '영화', tv); }
    await shot('public_10_tv_record');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 0`); await sleep(300);
    if (await js('!!(window.PHRecordModal && PHRecordModal.isOpen && PHRecordModal.isOpen())')) await js('PHRecordModal.close && PHRecordModal.close(); 0');
    await sleep(300);
    const wall = await js('(() => { const o = PH_LAYOUT.objects.find((x) => x.type === "memo_bucket"), s = PHInteract.spots().find((x) => x.key === "memo_bucket"); return { slot: o && o.wall_slot, go: s && PHInteract.activeGo(s), name: PHFeatures.nameOf("memo_bucket") }; })()');
    ok('벽 메모지 = 배치표 물건 그대로 (첫 자리 room_north), 가구 이름 벽 메모지, 기능 = 버킷리스트 (2026-10-08 메모지를 가구처럼)', wall.slot === 'room_north' && wall.go === 'bucketMemo' && wall.name === '벽 메모지', wall);

    // ---- 밤 화면 캡처 (무늬 밤 색 확인용, public_night_*) ----
    // 집 캔버스도 밤으로 그려졌는지 (무늬 확인모음 v01 ②: 전에는 public_night_01 = 낮 public_08과 픽셀이 같았음). 캔버스 픽셀 요약을 낮·밤 비교
    const cvSum = `(() => { const c = document.getElementById('cv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] * 7 + d[i + 1] * 3 + d[i + 2]) >>> 0; const bg = PHArt.sprite('background'), cnt = (hex) => { const v = parseInt(hex.slice(1), 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === r && d[i + 1] === g && d[i + 2] === b) n++; return n; };
      const dayN = bg ? Object.values(bg.palette).filter((x) => /^#[0-9A-Fa-f]{6}$/.test(x)).reduce((s, x) => s + cnt(x), 0) : -1, nightN = bg && bg.palette_night ? Object.values(bg.palette_night).reduce((s, x) => s + cnt(x), 0) : -1;
      return { h, dayN, nightN, night: PHArt.night, gn: PHGame.G.night, mode: PHGame.G.mode }; })()`;
    const daySum = await js(cvSum);
    await js(`PHGame.setDayNight('night'); 0`); await sleep(500);
    ok('밤으로 바꿈 (html.night)', await js(`document.documentElement.classList.contains('night')`), null);
    const nightSum = await js(cvSum);
    ok('낮 캡처 = 집 배경 낮 색 / 밤 캡처 = 밤 색 (배경 팔레트 픽셀 수로)', daySum.night === false && daySum.dayN > daySum.nightN && nightSum.night === true && nightSum.nightN > nightSum.dayN, { daySum, nightSum });
    await shot('public_night_01_room');
    await js('PHInteract.activateType("tv_cabinet"); 0'); await sleep(700);
    await shot('public_night_02_tv_record');
    if (await js('!!(window.PHRecordModal && PHRecordModal.isOpen())')) await js('PHRecordModal.close(); 0');
    await sleep(200);
    await js('PHBucketMemo.open(); 0'); await sleep(500);
    await shot('public_night_03_bucket_memo');
    if (await js('PHBucketMemo.isOpen()')) await js('PHBucketMemo.close(); 0');
    await js(`PHGame.setDayNight('day'); 0`); await sleep(400);

    // ---- 4. 집 꾸미기 (가): 침대 자리 -> 소파베드 ----
    await js('PHFurnishUI.setMode(true); 0'); await sleep(200);
    await js('PHFurnishUI.openMenu(PHInteract.spots().find((s) => s.key === "bed")); 0'); await sleep(200);
    const sw = await js(`[...document.querySelectorAll('.fn-swap-b')].map((b) => ({ s: b.dataset.sprite, t: b.textContent, on: b.getAttribute('aria-pressed') }))`);
    ok('침대 자리 목록에 가구 바꾸기 후보 2개 (넓은 침대 = 지금, 소파베드)', sw.length === 2 && sw[0].s === 'bed_wide' && sw[0].on === 'true' && sw[1].t === '소파베드', sw);
    { const m = await js(`(() => { const M = document.getElementById('fn-menu'), cv = [...M.querySelectorAll('.fs-tile canvas')], sel = M.querySelector('.fs-tile[aria-pressed=true]');
        return { title: M.querySelector('.fn-menu-furn').textContent, heads: [...M.querySelectorAll('.fs-h')].map((x) => x.textContent), pics: cv.map((c) => [c.width, c.height, c.style.width]), selLine: sel && getComputedStyle(sel).borderTopWidth,
          sep: !!M.querySelector('.fs ~ .fn-sep'), bubble: document.getElementById('bubble').hidden, bar: document.querySelector('#fn-bar .fn-bar-t').textContent }; })()`);
      // 무늬 3-2: 제목 = 자리 이름, "들일 가구 2개 중 하나", 그림 칸(넓은 침대 48x64 / 소파베드 1배), 고른 칸 2px 테, 나눔선 + "붙일 기능", 말풍선 숨김, 띠 글 짧게
      ok('가구 바꾸기 = 그림 칸 (제목 "침대 자리", 들일 가구·2개 중 하나, 1배 그림 2장, 고른 칸 2px 테, 붙일 기능 나눔, 말풍선 숨김, 띠 "가구를 누르면 모양·기능을 바꿔요")', m.title === '침대 자리' && m.heads[0] === '들일 가구 2개 중 하나' && m.heads[1] === '붙일 기능' && m.pics.length === 2 && m.pics[0][0] === 48 && m.pics[0][2] === '48px' && m.selLine === '2px' && m.sep && m.bubble && m.bar === '가구를 누르면 모양·기능을 바꿔요', m); }
    await shot('public_11_furnish_swap');
    const re2 = new Promise((r) => wc.once('did-finish-load', r));
    await clickSel('.fn-swap-b[data-sprite="sofa"]');
    await Promise.race([re2, sleep(6000)]); await sleep(700);
    g = await js('PHGame.snapshot()');
    const bed = await js('(() => { const o = PH_LAYOUT.objects.find((q) => q.type === "bed"); return { sprite: o.sprite, px: o.px, py: o.py, name: PHFeatures.nameOf("bed") }; })()');
    ok('소파베드로 바뀜: 저장(profile.json furniture.bed = sofa), 자리 기준점 왼쪽 아래 (195, 72), 이름 소파베드', (store().furniture || {}).bed === 'sofa' && bed.sprite === 'sofa' && bed.px === 195 && bed.py === 72 && bed.name === '소파베드', [store(), bed]);
    ok('다시 연 뒤 입장 연출 없이 그 자리에서 이어짐 (play)', g.mode === 'play' && g.me.zone === 'room', g);
    { let sw2 = ''; for (let i = 0; i < 30 && !sw2; i++) { sw2 = await js('PHFurnishUI.swapSaid || ""'); if (!sw2) await sleep(100); }
      ok('다시 연 뒤 두부 swapped 한 줄 (부기 1-2, {furn} = 소파베드)', sw2.includes('소파베드') && (await js('PH_FURNISH_LINES.swapped')).some((t) => t.replace('{furn}', '소파베드').replace(/^\(.*?\)\s*/, '') === sw2), sw2); }
    // 부기 공용판 v01 3절: 공용 집 가구 대사 = objRoom[그림] -> objRoom[type] -> obj[type]. 화분(몬스테라)·현관문(gate)·스탠드 켜기
    { const said = async (type) => { await js(`PHInteract.activateType(${JSON.stringify(type)}); 0`); await sleep(250); const l = (await js('PHInteract.state().log')); return l[l.length - 1] || ''; };
      const R = await js('PH_INTERACT_LINES.objRoom');
      const pl = await said('plant'), gt = await said('gate'), lp = await said('floorlamp');
      ok('공용 집 가구 대사: 화분 = objRoom.plant_monstera, 현관문 = objRoom.gate(민지님), 스탠드 = objRoom.floorlamp on/off', R.plant_monstera.includes(pl) && R.gate.map((t) => t.replace('{user}', '민지')).includes(gt) && R.floorlamp.on.concat(R.floorlamp.off).includes(lp), [pl, gt, lp]); }
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
