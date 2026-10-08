// 공용판 최신 기능 시험 (실제 Electron 창, 2026-10-09 비트, 로드맵 4단계 "공용판 옛 기능 갈아 끼우기"·"버킷 사이드바 카드 모양").
// tests/test_public_life_app.js 가 PH_PROFILE=default, PH_SHOTS_SCRIPT=shots_publiclife.js 로 부름.
// 공용판 사용자 = 온보딩 끝난 profile.json(시험 임시 사용자 폴더), 기록 파일 = 온보딩이 만드는 빈 틀(js/life_template.js, 물만 고름) = 공용판 첫날 모습.
// 이름은 가짜 "민지". 실제 생활 기록·제작자 묶음 안 씀. 날짜 = PH_TODAY 2026-10-08, 화면 시계 15:20
// 확인 (제작자 판 시험과 같은 최신 코드가 공용 묶음·공용 집·빈 틀 파일에서도 도는지):
//   1) 공부 [추가|수정] + 세부 계획  2) 생활 습관 기록 카드 잠 줄 + 잠 칠하기 창  3) 기록 편집 + 추가(제목·날짜·요약) · TV 영화 기록 폼
//   4) 버킷: 비었을 때 생활 습관 카드, 적으면 사이드바 탭 = 카드 모양, 글씨 누르기 [고치기][지우기], 고치기, 되돌리기, 메모지 열어 둔 채 탭(31a788b)
//   5) 생활일지 안 탭(잠·공부·영화)  5b) 옷 갈아입기(공용 옷 묶음·처음 옷·모자 v02)  6) 개인 이름 없음·화면 오류 없음
// 캡처: preview/publife_*.png. 결과: 표준 출력 "RESULT {json}"
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = async function shotsPublicLife(win, ROOT) {
  const wc = win.webContents;
  const OUT = path.join(ROOT, process.env.PH_SHOTS_OUT || 'preview');
  fs.mkdirSync(OUT, { recursive: true });
  const S = require(path.join(ROOT, 'js', 'data', 'settings.js'));
  const LIFE = path.join(process.env.PH_HOUSE, ...S.LIFE_FILE.split('/'));
  const LL = require(path.join(ROOT, 'js', 'life_log.js'));
  const RW = require(path.join(ROOT, 'js', 'record_write.js'));
  const BK = require(path.join(ROOT, 'js', 'bucket_write.js'));
  const SW = require(path.join(ROOT, 'js', 'study_write.js'));
  const checks = [], errors = [];
  const ok = (label, cond, extra) => { checks.push({ label, ok: !!cond, extra }); if (process.env.PH_TRACE === '1') console.log('CHK ' + (cond ? 'o ' : 'X ') + label + (cond ? '' : ' ' + JSON.stringify(extra))); };
  wc.on('console-message', (...args) => {
    const e = args[0] && typeof args[0] === 'object' && 'message' in args[0] ? args[0] : { level: args[1], message: args[2] };
    if (e.level === 'error' || e.level === 3) errors.push(e.message);
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { await sleep(150); let img; try { img = await wc.capturePage(); } catch (e) { await sleep(300); img = await wc.capturePage(); } fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); };
  const KEY = { Escape: 'Escape', Enter: 'Return' };
  async function key(k) { wc.sendInputEvent({ type: 'keyDown', keyCode: KEY[k] || k }); if (k === 'Enter') wc.sendInputEvent({ type: 'char', keyCode: '\r' }); await sleep(30); wc.sendInputEvent({ type: 'keyUp', keyCode: KEY[k] || k }); await sleep(80); }
  async function click(x, y) { wc.sendInputEvent({ type: 'mouseMove', x, y }); wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 }); await sleep(30); wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 }); await sleep(100); }
  const center = (sel) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const clickSel = async (sel) => { const p = await center(sel); if (!p) return false; await click(p.x, p.y); return true; };
  const typeIn = async (sel, v) => { await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.select && e.select(); return 0; })()`); await wc.insertText(v); await sleep(80); };
  const setv = (sel, v) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return 0; })()`);
  const clickText = async (scope, txt) => { const p = await js(`(() => { const t = [...document.querySelectorAll(${JSON.stringify(scope + ' .bkm-t')})].find((x) => x.textContent === ${JSON.stringify(txt)}); if (!t) return null; t.scrollIntoView({ block: 'nearest' }); const r = t.getBoundingClientRect(); return { x: Math.round(r.left + Math.min(20, r.width / 2)), y: Math.round(r.top + r.height / 2) }; })()`); if (!p) return false; await click(p.x, p.y); await sleep(150); return true; };
  const fileText = () => fs.readFileSync(LIFE, 'utf8');
  const busy = async (mod) => { for (let i = 0; i < 100 && (await js(`!!(window.${mod} && ${mod}.state && ${mod}.state().busy)`)); i++) await sleep(40); await sleep(250); };
  const PERSONAL = /플레이어|player|이웃|guest|토리|오피스/i; // player(대소문자 무시)가 기록 폴더 이름도 잡음. 그 폴더 이름을 따로 적으면 공개용 내보내기 글 바꾸기가 공용 파일 이름으로 바꿔 화면의 파일 이름에 걸림 (2026-10-09)

  await new Promise((r) => (wc.isLoading() ? wc.once('did-finish-load', r) : r())); await sleep(500);
  try { await body(); } catch (e) { ok('시험 도중 멈춤: ' + (e && e.message), false, String(e && e.stack).slice(0, 500)); }
  const fail = checks.filter((c) => !c.ok);
  console.log('RESULT ' + JSON.stringify({ pass: checks.length - fail.length, fail: fail.length, failed: fail, errors }));
  return fail.length === 0;

  async function body() {
    const NOW = 'new Date(2026, 9, 8, 15, 20).getTime()';
    const st0 = await js(`({ id: PHProfile.id, onboard: PHProfile.isOnboard(), set: window.PH_ART_SET, brand: document.getElementById('brand') ? document.getElementById('brand').textContent : '' })`);
    ok('공용 묶음 + 온보딩 끝난 사용자 + 원룸 세트', st0.id === 'default' && !st0.onboard && st0.set === 'room1', st0);
    ok('기록 파일 = 빈 틀 (공부·습관 기록·약속·버킷 섹션, 물 한 줄)', /## 공부\n/.test(fileText()) && /## 버킷리스트/.test(fileText()) && !/## 수면|## 기록 항목|## 공부 단원/.test(fileText()), fileText().slice(0, 400));
    // 집에 들어감 (가구 누르기용)
    await js(`PHGame.setDayNight('day'); PHLife.now = () => ${NOW}; if (window.PHInteract) PHInteract.now = PHLife.now; if (window.PHStudyGantt) PHStudyGantt.St.now = PHLife.now; Math.random = () => 0; 0`);
    const b = await center('#btn-enter');
    if (b) await click(b.x, b.y);
    for (let i = 0; i < 40 && (await js('PHGame.G.mode')) !== 'intro'; i++) await sleep(50);
    await key('Escape');
    for (let i = 0; i < 100 && (await js('PHGame.G.mode')) !== 'play'; i++) await sleep(50);
    await js('PHGame.setWander(false); PHGame.hideBubble(); 0'); await sleep(300);
    ok('집에 들어감 (play)', (await js('PHGame.G.mode')) === 'play', await js('PHGame.G.mode'));

    // ---- 1. 공부 [추가 | 수정] + 세부 계획 ----
    await clickSel('#tabs [data-tab="habits"]'); await sleep(500);
    let g = await js(`(() => { const c = document.querySelector('#life-habits [data-card="공부"]'); return c && { am: [...c.querySelectorAll('.st-am button')].map((b) => b.textContent + (b.disabled ? '(off)' : '')).join('|'), edit: c.classList.contains('st-edit') }; })()`);
    ok('공부 카드: 빈 틀에서도 머리 버튼 [추가|수정] (수정은 공부가 없어 꺼짐)', g && g.am === '추가|수정(off)', g);
    await clickSel('#life-habits .st-add'); await sleep(250);
    let f = await js(`(() => { const d = document.querySelector('.sm-dlg'); return d && { title: d.querySelector('.bk-name').textContent, start: d.querySelector('.sm-start').value, plans: (d.querySelector('.sm-plans-head b') || {}).textContent }; })()`);
    ok('[추가] -> 공부 추가 창 (시작 = 오늘 10/8, 세부 계획 칸)', f && f.title === '공부 추가' && f.start === '2026-10-08' && f.plans === '세부 계획', f);
    await typeIn('.sm-name', '시험 공부 (가짜)'); await setv('.sm-end', '2026-10-31'); await sleep(120);
    await clickSel('.sm-p-add'); await sleep(150);
    await wc.insertText('1주차'); await setv('.sm-plan[data-i="0"] .sm-p-to', '2026-10-14');
    await shot('publife_01_study_add');
    await clickSel('.sm-dlg .bk-save'); await busy('PHStudyModal'); await sleep(200);
    let txt = fileText();
    const srow = SW.parse(txt).study.find((x) => x.name === '시험 공부 (가짜)');
    ok('저장 -> ## 공부 한 줄 + ## 공부 단원 세부 계획 (섹션 새로)', srow && srow.start === '2026-10-08' && srow.end === '2026-10-31' && /## 공부 단원/.test(txt) && txt.includes('| 시험 공부 (가짜) | 1주차 | 2026-10-08~2026-10-14 |'), [srow, txt.split('\n').filter((l) => l.includes('시험 공부'))]);
    g = await js(`(() => { const c = document.querySelector('#life-habits [data-card="공부"]'); return c && { bars: c.querySelectorAll('.g-bar').length, prow: [...c.querySelectorAll('.g-prow')].map((r) => r.dataset.part).join(), mod: !c.querySelector('.st-mod').disabled }; })()`);
    ok('간트: 막대 1 + 세부 계획 줄 "1주차", [수정] 켜짐', g && g.bars === 1 && g.prow === '1주차' && g.mod, g);
    await js(`document.querySelector('#life-habits [data-card="공부"]').scrollIntoView({ block: 'start' }); 0`);
    await shot('publife_02_study_card');
    await key('Escape');

    // ---- 2. 기록 카드 잠 줄 + 칠하기 창 ----
    let rc = await js(`(() => { const c = document.querySelector('#life-habits .card[data-card="기록"]'); if (!c) return null; const lis = [...c.querySelectorAll(':scope > ul > li')]; return { logs: lis.map((l) => l.dataset.log || l.dataset.habit).join(), sleep: !!c.querySelector('li[data-log="sleep"] .lg-open'), today: (c.querySelector('li[data-log="sleep"] .sl-today') || {}).textContent }; })()`);
    ok('기록 카드 (물만 고른 빈 틀): 대변·식사·잠 줄 + 잠 [기록하기]', rc && /poop,meal,sleep/.test(rc.logs) && rc.sleep, rc);
    await clickSel('#life-habits li[data-log="sleep"] .lg-open'); await sleep(350);
    let m = await js('PHSleepModal.state()');
    ok('[기록하기] -> 잠 칠하기 창 (오늘 10/8)', m.open && m.date === '2026-10-08', m);
    const cellXY = (c) => js(`(() => { const s = document.querySelector('#slm .slm-strip'); const r = s.getBoundingClientRect(); return { x: Math.round(r.left + (${c} + 0.5) * r.width / 48), y: Math.round(r.top + r.height / 2) }; })()`);
    { const p = await cellXY(11), q = await cellXY(26);
      wc.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y }); wc.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 }); await sleep(40);
      for (let i = 1; i <= 4; i++) { wc.sendInputEvent({ type: 'mouseMove', x: Math.round(p.x + (q.x - p.x) * i / 4), y: p.y, modifiers: ['leftButtonDown'] }); await sleep(30); }
      wc.sendInputEvent({ type: 'mouseUp', x: q.x, y: q.y, button: 'left', clickCount: 1 }); await sleep(150); }
    m = await js('PHSleepModal.state()');
    ok('끌어 칠하기 23:30~07:30 잠', JSON.stringify(m.runs) === JSON.stringify([['23:30', '07:30', '잠']]), m.runs);
    await shot('publife_03_sleep_paint');
    await clickSel('#slm .lm-save'); await busy('PHSleepModal');
    txt = fileText();
    const sl = LL.parse(txt).sleep;
    ok('저장 -> ## 수면 섹션 새로 (버킷리스트 앞), 10/8 줄 23:30~07:30', /## 수면[\s\S]*## 버킷리스트/.test(txt) && sl.length === 1 && txt.split('\n')[sl[0].line].startsWith('| 2026-10-08 | 23:30 | 07:30 |'), sl);
    rc = await js(`(document.querySelector('#life-habits li[data-log="sleep"] .sl-today') || {}).textContent`);
    ok('기록 카드 잠 줄 = "오늘 8시간"', /^오늘 8시간/.test(rc || ''), rc);

    // ---- 3. 기록 편집 + 추가 · TV 영화 기록 폼 ----
    if (!(await js(`!!document.querySelector('.he-panel[data-kind="기록"]')`))) { await clickSel('#life-habits .kind[data-kind="기록"] .he-toggle'); await sleep(250); }
    ok('기록 편집 칸: 영화 한 칸 (빈 틀 = ## 기록 항목 없음 = 영화만)', (await js(`[...document.querySelectorAll('.he-panel[data-kind="기록"] .he-rk')].map((x) => x.dataset.rk).join()`)) === '영화', await js(`[...document.querySelectorAll('.he-panel[data-kind="기록"] .he-rk')].map((x) => x.dataset.rk).join()`));
    await clickSel('.he-panel[data-kind="기록"] .he-add'); await sleep(200);
    await clickSel('.he-form .he-type:nth-of-type(2)'); await sleep(200);
    const furn = await js(`(() => { const s = document.querySelector('.he-form .he-in-furn'); return s && { groups: [...s.querySelectorAll('optgroup')].map((g) => g.label), tv: [...s.options].some((o) => o.value === 'tv_cabinet' && /\\(영화\\)/.test(o.textContent)) }; })()`);
    ok('제목·날짜·요약 기록 -> 가구 연동 칸 (공용 집 공간별 묶음, TV장 (영화))', furn && furn.groups.length >= 2 && furn.tv, furn);
    await typeIn('.he-form .he-in-name', '공연');
    await clickSel('.he-form .he-save'); await busy('PHHabitEditUI'); await sleep(300);
    ok('공연 칸 -> ## 기록 항목 영화·공연 (섹션 새로)', RW.parse(fileText()).kinds.map((k) => k.name + (k.virtual ? '~' : '')).join() === '영화,공연', RW.parse(fileText()).kinds);
    await key('Escape');
    await clickSel('#tabs [data-tab="home"]'); await sleep(300);
    await js('PHGame.hideBubble(); PHInteract.cool = {}; 0');
    await js(`PHInteract.activateType('tv_cabinet', 'obj')`); await sleep(600);
    let rm = await js(`Object.assign(PHRecordModal.state(), { title: (document.querySelector('#rm .bm-title') || {}).textContent || '' })`);
    ok('TV장 -> 영화 기록 창 (공연 칸이 생겨도 영화만)', rm.open && rm.list && rm.list.group.join() === '영화' && rm.title === '영화', rm);
    await clickSel('#rm .rc-add'); await sleep(200);
    await typeIn('#rm .rc-in-title', '가짜 영화 하나'); await clickSel('#rm .bk-save'); await busy('PHRecordModal');
    ok('영화 기록 폼 저장 -> ## 기록 한 줄', RW.parse(fileText()).records.some((r) => r.kind === '영화' && r.title === '가짜 영화 하나' && r.date === '2026-10-08'), RW.parse(fileText()).records);
    await shot('publife_04_movie');
    await key('Escape'); await sleep(200);

    // ---- 4. 버킷 ----
    await clickSel('#tabs [data-tab="habits"]'); await sleep(400);
    let bk = await js(`(() => { const t = document.querySelector('#tabs [data-tab="bucket"]'); const c = document.querySelector('#life-habits [data-card="버킷리스트"]'); return { tabHidden: !t || t.hidden, card: !!c && c.classList.contains('card'), paper: !!(c && c.querySelector('.bkm-paper, .bkm-pin, .bkm-title')), add: !!(c && c.querySelector('.bkm-add')) }; })()`);
    ok('버킷 빈 틀: 사이드바 탭 숨김, 생활 습관 맨 아래 카드 모양(메모지 그림 없음) + 적기', bk.tabHidden && bk.card && !bk.paper && bk.add, bk);
    await clickSel('#life-habits [data-card="버킷리스트"] .bkm-add'); await typeIn('#life-habits .bkm-in-add', '바다 보며 아침 먹기 (가짜)');
    ok('카드 적기 칸 = [그만두기][저장]', (await js(`[...document.querySelectorAll('#life-habits .bkm-it.adding .bkm-btns button')].map((b) => b.textContent).join('|')`)) === '그만두기|저장');
    await clickSel('#life-habits .bkm-it.adding .bkm-save'); await busy('PHBucketMemo');
    ok('카드에서 적기 -> ## 버킷리스트 한 줄', BK.parse(fileText()).items.map((x) => x.text).join() === '바다 보며 아침 먹기 (가짜)', BK.parse(fileText()).items);
    await key('Escape'); await sleep(150);
    ok('적으면 사이드바 버킷리스트 탭 보임 (BUCKET_TAB auto)', await js(`!document.querySelector('#tabs [data-tab="bucket"]').hidden`));
    await clickSel('#tabs [data-tab="bucket"]'); await sleep(400);
    const tc = await js(`(() => { const c = document.querySelector('#life-bucket .bkc-tabcard'); return c && { card: c.classList.contains('card') && c.classList.contains('bucket-card'), paper: !!document.querySelector('#life-bucket .bkm-paper, #life-bucket .bkm-pin, #life-bucket .bkm-title, #life-bucket .bkm-inline'), tabs: c.querySelectorAll('.bkc-tabs .bkm-tab').length, boxes: c.querySelectorAll('.bkc-box').length, lines: [...c.querySelectorAll('.bkm-t')].map((x) => x.textContent), add: !!c.querySelector('.bkm-add') }; })()`);
    ok('사이드바 버킷리스트 탭 = 카드 모양 (알약 탭 2·네모 체크 칸·+ 적기, 메모지 그림 없음)', tc && tc.card && !tc.paper && tc.tabs === 2 && tc.boxes === 1 && tc.lines.join() === '바다 보며 아침 먹기 (가짜)' && tc.add, tc);
    await clickText('#life-bucket', '바다 보며 아침 먹기 (가짜)');
    const acts = await js(`(() => { const li = document.querySelector('#life-bucket .bkm-it.picked'), a = li && li.querySelector('.bkm-acts'), bf = li && getComputedStyle(li, '::before'); return li && { btns: a ? [...a.querySelectorAll('button')].map((b) => b.textContent).join('|') : '', last: li.lastElementChild === a, band: bf && bf.content !== 'none' ? bf.backgroundColor : null }; })()`);
    ok('글씨 누르기 -> 줄 오른쪽 [고치기][지우기] + 형광펜 띠 (119d0b3)', acts && acts.btns === '고치기|지우기' && acts.last && acts.band === 'rgb(243, 220, 152)', acts);
    await shot('publife_05_bucket_tab_pick');
    const b0 = fileText();
    await clickSel('#life-bucket .bkm-it.picked .bkm-edit'); await sleep(150);
    await js(`(() => { const i = document.querySelector('#life-bucket .bkm-in-edit'); i.focus(); i.select(); return 0; })()`); await wc.insertText('바다 보며 저녁 먹기 (가짜)'); await sleep(80);
    await clickSel('#life-bucket .bkm-it.editing .bkm-save'); await busy('PHBucketMemo');
    ok('[고치기] -> 저장 -> 그 줄만 고침 + "고쳤어요 [되돌리기]"', BK.onlyBucketChanged(b0, fileText(), 'update') && BK.parse(fileText()).items.map((x) => x.text).join() === '바다 보며 저녁 먹기 (가짜)' && /고쳤어요/.test(await js(`(document.querySelector('#life-bucket .bkm-undo') || {}).textContent || ''`)));
    await clickSel('#life-bucket .bkm-restore'); await busy('PHBucketMemo');
    ok('되돌리기 -> 파일 같음', fileText() === b0);
    // 되돌리기 띠 저절로 사라짐 (31a788b, UNDO_MS)
    await clickText('#life-bucket', '바다 보며 아침 먹기 (가짜)'); await clickSel('#life-bucket .bkm-del'); await busy('PHBucketMemo');
    const had = await js(`!!document.querySelector('#life-bucket .bkm-undo')`);
    await clickSel('#life-bucket .bkm-restore'); await busy('PHBucketMemo');
    ok('지우기 -> 되돌리기 띠 -> 되돌리면 파일 같음 (31a788b)', had && fileText() === b0);
    // 메모지 열어 둔 채 사이드바 버킷리스트 탭 (31a788b 버그 고침)
    await clickSel('#tabs [data-tab="home"]'); await sleep(300);
    await js(`PHInteract.cool = {}; PHInteract.activateType('memo_bucket', 'obj')`); await sleep(600);
    if (!(await js('PHBucketMemo.isOpen()'))) { await js('PHBucketMemo.open(); 0'); await sleep(300); }
    ok('(준비) 공용 집 벽 메모지 -> 메모지 창', await js('PHBucketMemo.isOpen()'));
    await clickSel('#tabs [data-tab="bucket"]'); await sleep(400);
    const after = await js(`({ open: PHBucketMemo.isOpen(), lines: [...document.querySelectorAll('#life-bucket .bkm-t')].map((x) => x.textContent), add: !!document.querySelector('#life-bucket .bkc-tabcard .bkm-add') })`);
    ok('메모지 열어 둔 채 버킷리스트 탭 -> 메모지 닫힘 + 탭에 줄 보임 (31a788b)', !after.open && after.lines.join() === '바다 보며 아침 먹기 (가짜)' && after.add, after);
    await shot('publife_06_bucket_tab');

    // ---- 5. 생활일지 안 탭 ----
    await clickSel('#tabs [data-tab="archive"]'); await sleep(400);
    const tabs = await js(`[...document.querySelectorAll('#life-archive .jn-tab')].map((b) => b.dataset.tab)`);
    ok('생활일지 안 탭: 식사 다음 잠, 영화·연극, 공부, 공연(사용자 칸)', tabs.indexOf('sleep') === tabs.indexOf('meal') + 1 && tabs.includes('movie') && tabs.includes('study') && tabs.length >= 8, tabs);
    await clickSel('#life-archive .jn-tab[data-tab="sleep"]'); await sleep(500);
    const p = await js(`(() => { const p = document.querySelector('#life-archive .sl-panel'); if (!p) return null; const r = p.querySelector('.sl-row[data-date="2026-10-08"]'); return { rows: p.querySelectorAll('.sl-row').length, today: r && r.classList.contains('today'), pens: r ? r.querySelectorAll('.pen').length : 0, tot: r && r.querySelector('.sl-tot').textContent }; })()`);
    ok('잠 탭 = 한 달 모눈 31줄, 오늘 줄 형광펜 1 · 8:00', p && p.rows === 31 && p.today && p.pens === 1 && p.tot === '8:00', p);
    await shot('publife_07_sleep_tab');
    await clickSel('#life-archive .jn-tab[data-tab="study"]'); await sleep(400);
    ok('공부 탭 = 잔디에 시험 공부', /시험 공부 \(가짜\)/.test(await js(`document.getElementById('life-archive').innerText`)));

    // ---- 5b. 옷 갈아입기 (2026-10-09 공용판 켜기: 아바타 바탕 avatarN_body + 공용 옷 묶음 js/outfit_public.js, 모자 v02) ----
    await clickSel('#tabs [data-tab="home"]'); await sleep(300);
    const w0 = await js(`({ en: PHOutfit.enabled(), av: PHOutfit.avatar(), st: Object.assign({}, PHOutfit.state), own: !!PHOutfit.data().own, playerBundle: !!window.PH_OUTFITS && !!window.PH_OUTFITS.base, layers: PHOutfit.plan().layers })`);
    ok('옷 갈아입기 켜짐 (보리 avatar1), 처음 차림 = 처음 옷(한벌 0) = 원래 그림 그대로', w0.en && w0.av === 'avatar1' && w0.st.onepiece === 0 && w0.own && w0.layers === null, w0);
    await js('PHWardrobe.open("test"); 0'); await sleep(300);
    const tabCells = async (slot) => { await js(`(() => { const b = document.querySelector('.wd-tab[data-slot="${slot}"]'); b.click(); return 0; })()`); await sleep(120); return (await js('PHWardrobe.state()')).cells; };
    let cs = await tabCells('onepiece');
    ok('옷장 창 열림, 한벌 탭 = 처음 옷(입는 중)·원피스 2벌, 모두 고를 수 있음', (await js('PHWardrobe.isOpen()')) && cs.map((c) => c.num + ':' + c.label + ':' + c.on + ':' + c.ok).join('|') === '0:처음 옷:true:true|1:페이즐리 원피스:false:true|2:인디언핑크 잠옷:false:true', cs);
    const kinds = ['top', 'bottom', 'outer', 'bag', 'hat'];
    const allOk = []; for (const k of kinds) { const c = await tabCells(k); allOk.push(k + ':' + c.every((x) => x.ok)); }
    ok('상의·하의·외투·가방·모자 칸 모두 고를 수 있음 ("준비 중" 없음)', allOk.every((x) => x.endsWith('true')), allOk);
    await shot('publife_08_wardrobe_own');
    // 모자 1 (처음 옷 위에)
    cs = await tabCells('hat'); await clickSel('.wd-cell[data-slot="hat"][data-num="1"]'); await sleep(300);
    const w1 = await js(`(() => { const o = PHArt.frameCanvas('avatar1_idle', 0, false), L = PHOutfit.plan().layers; return { st: Object.assign({}, PHOutfit.state), layers: L && L.map((l) => l.id).join(), w: o.width, h: o.height, save: PHOutfit.lastSave }; })()`);
    ok('처음 옷 + 모자 1 -> 집 안 보리 = 원래 그림 + 모자 (32x36), 저장됨', w1.st.onepiece === 0 && w1.st.hat === 1 && w1.layers === 'orig,hat_1' && w1.w === 32 && w1.h === 36 && w1.save && w1.save.ok, w1);
    const saved = await js('PHOutfitDesktop.get()');
    ok('outfit.json = 한벌 0 + 모자 1 (앱 설정 = 시험 임시 폴더)', saved && saved.outfit && saved.outfit.onepiece === 0 && saved.outfit.hat === 1, saved);
    // 상의 3 -> 바탕 body + 하의 5 + 상의 3 + 모자
    await tabCells('top'); await clickSel('.wd-cell[data-slot="top"][data-num="3"]'); await sleep(300);
    const w2 = await js(`(() => { const L = PHOutfit.plan().layers; return { st: Object.assign({}, PHOutfit.state), layers: L && L.map((l) => l.id).join(), base: PHOutfit.data().base === PH_OUTFITS_PUBLIC.avatars.avatar1.base }; })()`);
    ok('상의 3 고르기 -> 한벌 꺼짐, 바탕 = avatar1 body, 층 = 바탕 -> 하의5 -> 상의3 -> 모자1', w2.st.onepiece === null && w2.layers === 'base,bottom_5,top_3,hat_1' && w2.base, w2);
    await shot('publife_09_wardrobe_top3_hat');
    // 모래 전용 모자 장: 공용 묶음 규칙 (화면 아바타는 보리라, 묶음 값으로만 확인)
    const w3 = await js(`(() => { const P = PH_OUTFITS_PUBLIC, a3 = PHOutfit.forAvatar(P, 'avatar3'), a1 = PHOutfit.forAvatar(P, 'avatar1'); return { s3: a3.items.hat_1.anims.idle === P.items.hat_1.anims_avatar.avatar3.idle, s1: a1.items.hat_1.anims.idle === P.items.hat_1.anims.idle }; })()`);
    ok('모자: 모래는 anims_avatar.avatar3 장, 보리는 기본 anims', w3.s3 && w3.s1, w3);
    // 처음 옷으로 되돌리기
    await tabCells('onepiece'); await clickSel('.wd-cell[data-slot="onepiece"][data-num="0"]'); await sleep(250);
    await tabCells('hat'); await clickSel('.wd-cell[data-slot="hat"][data-num=""]'); await sleep(250);
    ok('처음 옷 + 모자 없음 -> 원래 그림 그대로로 돌아옴', (await js('PHOutfit.plan().layers')) === null && (await js('PHOutfit.state.onepiece')) === 0);
    await key('Escape'); await sleep(200);
    ok('Esc -> 옷장 창 닫힘', !(await js('PHWardrobe.isOpen()')));

    // ---- 6. 개인 이름·오류 ----
    ok('화면에 개인 이름·이웃·토리 글 없음', !PERSONAL.test(await js('document.body.innerText')), (await js('document.body.innerText')).match(PERSONAL));
    ok('기록 파일에 개인 이름 없음', !PERSONAL.test(fileText()), fileText().match(PERSONAL));
    ok('화면 오류 없음', errors.length === 0, errors.slice(0, 5));
  }
};
