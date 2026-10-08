// 냉장고 메모지 창 (2026-10-03 제작자: "냉장고 클릭하면 약속 탭으로 이동하지 마. 모달로 귀여운 메모지 띄워서 오늘 약속만"). css/fridge_memo.css
// 디자인 = 무늬 디자인/20261003_pixel-house_메모지디자인_v01.md (2장 메모지, 아래 막대, 장식 그림 memo_*)
//   1장 = 테이프로 붙인 노란 포스트잇 "오늘 약속"(하루 경계 6시, 시간 순, 5줄 + "외 n개"). 없으면 빈 글 + 두부 memo.today_empty
//   2장 = 자석으로 눌러 둔 스프링 수첩 "사야 할 것"(체크 = 샀어요: 인벤토리에 있으면 +1, 없으면 줄만 빠짐. 산 줄은 1초쯤 보였다가 빠짐.
//         생활필수품이 떨어져 저절로 들어온 줄 = "필수" 칩, 마지막 줄 "+ 적기")
//   두 장은 늘 같이 놓이고 뒷장이 앞장 뒤에서 비침. 넘기기: 아래 막대 ◀ ▶, ←→ 키, 앞장 접힌 귀퉁이, 비치는 뒷장, 끌기(가로 40px). 두 장이라 끝에서 처음으로 돎
//   말(두부, 아래 막대 밑 한 줄 — 집 말풍선은 메모지에 가려져서): 열 때 memo.open / 약속 없음 memo.today_empty, 2장으로 갈 때 memo.flip(비었으면 shop.empty), 1장으로 돌아갈 때는 말 없음
//   아래 막대 "냉장고 열기" = 메모지 닫고 냉장고 문 열린 그림 + 인벤토리 식재료(냉장고 알약). 열리면 포커스는 냉장고 열기(Enter), Esc 닫기
//   약속이 있는 날 메모지를 보면 그날 입장 때 appt.today를 다시 말하지 않음 (localStorage pixel-house.memoAppt = 날짜, interact.js afterIntro가 봄)
(function (root) {
  'use strict';
  const HU = root.PHHouse, esc = HU.esc, IL = root.PHInteractLogic;
  const $ = (id) => document.getElementById(id);
  const DU_BASE = 432, DRAG_PX = 40, MAX_APPTS = 5, BOUGHT_MS = 1000;
  const KEY_APPT = 'pixel-house.memoAppt';
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  const st = { open: false, page: 0, from: null, log: [], line: '', opened: 0, drag: null, adding: false, bought: {} };
  let el = null;
  const q = (s) => el.querySelector(s);
  const P = () => root.PH_HOUSEHOLD_PLAIN || {};

  // 무늬 장식 그림 -> data URL (그림이 없으면 '')
  const art = {};
  function pic(key, frame) {
    const k = key + ':' + (frame || 0), A = root.PHArt;
    if (art[k] == null) { try { art[k] = A && A.has(key) ? A.frameCanvas(key, frame || 0).toDataURL() : ''; } catch (e) { art[k] = ''; } }
    return art[k];
  }
  const img = (key, cls, alt, frame) => { const u = pic(key, frame); return u ? `<img class="${cls}" src="${u}" alt="${esc(alt || '')}" ${alt ? '' : 'aria-hidden="true"'} draggable="false">` : (alt ? `<b class="${cls} txt">${esc(alt)}</b>` : ''); };

  function build() {
    if (el) return el;
    const stage = $('stage'); if (!stage) return null;
    el = document.createElement('div');
    el.id = 'memo'; el.className = 'memo'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '냉장고 메모지');
    el.innerHTML = `<div class="memo-box" tabindex="-1">
      <div class="memo-desk">
        <section class="memo-page memo-today" data-page="0" aria-label="1장 ${esc((P().memoTitle || {}).today || '오늘 약속')}"></section>
        <section class="memo-page memo-shop" data-page="1" aria-label="2장 ${esc((P().memoTitle || {}).shop || '장보기 메모')}"></section>
      </div>
      <div class="memo-bar">
        <button type="button" class="memo-nav memo-prev" aria-label="앞 장">◀</button>
        <span class="memo-dots" aria-hidden="true"><i></i><i></i></span>
        <button type="button" class="memo-nav memo-next" aria-label="다음 장">▶</button>
        <button type="button" class="memo-fridge"></button>
        <span class="memo-esc" aria-hidden="true">Esc 닫기</span>
      </div>
      <p class="memo-say" hidden><b class="memo-who"></b><span class="memo-line" aria-live="polite"></span></p></div>`;
    stage.appendChild(el);
    q('.memo-fridge').textContent = P().memoBtnFridge || '냉장고 열기';
    q('.memo-who').textContent = ((root.PH_DIALOG_LINES || {}).name) || '두부';
    el.addEventListener('mousedown', (e) => { if (e.target === el) { e.preventDefault(); close(); } });
    q('.memo-prev').addEventListener('click', () => flip(-1));
    q('.memo-next').addEventListener('click', () => flip(1));
    q('.memo-fridge').addEventListener('click', openFridge);
    q('.memo-desk').addEventListener('click', onDesk);
    // 끌기 (메모지 위에서 가로로 끌면 넘김)
    const desk = q('.memo-desk');
    desk.addEventListener('pointerdown', (e) => { if (e.target.closest('button, input')) return; st.drag = { x: e.clientX, y: e.clientY }; });
    root.addEventListener('pointerup', (e) => {
      const d = st.drag; st.drag = null; if (!d || !st.open) return;
      const dx = e.clientX - d.x;
      if (Math.abs(dx) >= DRAG_PX && Math.abs(dx) > Math.abs(e.clientY - d.y)) { st.dragged = (st.dragged || 0) + 1; st.justDragged = Date.now(); go(dx < 0 ? 1 : 0); }
    });
    const cv = $('cv');
    if (cv && root.ResizeObserver) new ResizeObserver(fit).observe(cv);
    root.addEventListener('resize', fit);
    HU.on(() => { if (st.open) paint(); });
    return el;
  }
  // du = 집 그림 높이 / 432 (대화창과 같음), u = 집 그림 1px (장식 그림)
  function fit() {
    if (!el) return; const cv = $('cv'), r = cv ? cv.getBoundingClientRect() : null; if (!r || !r.height) return;
    el.style.setProperty('--du', (r.height / DU_BASE) + 'px');
    const g = root.PHGame && root.PHGame.G; el.style.setProperty('--u', ((g && g.scale) || r.height / 304) + 'px');
  }

  const today = () => HU.today();
  function todays() { const d = root.PHLife && root.PHLife.data; return d ? IL.meetingsFor(d, today()).today : []; }
  function dateLabel() { const p = today().split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2]); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK[d.getDay()]}`; }

  function todayHtml() {
    const ms = todays(), more = ms.length - MAX_APPTS;
    let h = img('memo_tape', 'memo-tape', '') + `<header class="memo-head">${img('memo_title_today', 'memo-title', (P().memoTitle || {}).today || '오늘 약속')}<span class="memo-date">${esc(dateLabel())}</span></header><hr class="memo-rule">`;
    h += ms.length ? '<ul class="memo-list">' + ms.slice(0, MAX_APPTS).map((m) => `<li class="memo-appt"><b>${esc(m.time || '')}</b><span>${esc(m.text)}</span></li>`).join('') + (more > 0 ? `<li class="memo-more">외 ${more}개</li>` : '') + '</ul>'
      : '<p class="memo-none">오늘은 약속이 없어요.<small>약속 탭에서 적어 둘 수 있어요.</small></p>';
    return h + '<button type="button" class="memo-corner" aria-label="다음 장으로 넘기기" tabindex="-1"></button>';
  }
  function shopHtml() {
    const v = HU.view() || { shop: [] }, rows = v.shop.concat(Object.values(st.bought).filter((b) => !v.shop.some((r) => r.name === b.name)));
    const left = v.shop.filter((r) => !st.bought[r.name]).length;
    let h = '<i class="memo-spring" aria-hidden="true"></i>' + img('memo_magnet', 'memo-magnet', '');
    h += `<header class="memo-head">${img('memo_title_buy', 'memo-title', '사야 할 것')}<span class="memo-count">${left}개</span></header><ul class="memo-list memo-lines">`;
    h += rows.map((r) => {
      const done = !!st.bought[r.name], chk = pic('memo_check', done ? 1 : 0);
      return `<li class="memo-buy ${done ? 'done' : ''} ${r.auto ? 'auto' : ''}" data-name="${esc(r.name)}"><button type="button" class="memo-chk ${done ? 'on' : ''}" role="checkbox" aria-checked="${done}" aria-label="${esc(r.name)} ${esc(P().bought || '샀어요')}" data-focus="chk:${esc(r.name)}" ${done ? 'disabled' : ''}>${chk ? `<img src="${chk}" alt="" draggable="false">` : ''}</button><span class="memo-name">${esc(r.name)}</span>${r.auto ? `<small class="memo-need">${esc(P().needTag || '필수')}</small>` : ''}</li>`;
    }).join('');
    if (!rows.length) h += '<li class="memo-empty">살 것이 없어요.</li>';
    h += st.adding ? `<li class="memo-addrow"><form class="memo-add"><input class="memo-in" type="text" maxlength="30" aria-label="사야 할 것 이름" placeholder="이름"></form></li>`
      : `<li class="memo-addrow"><button type="button" class="memo-add-b" data-focus="memo-add">${esc(P().shopAdd || '+ 적기')}</button></li>`;
    return h + '</ul>';
  }
  function paint(focus) {
    if (!el) return;
    q('.memo-today').innerHTML = todayHtml();
    q('.memo-shop').innerHTML = shopHtml();
    el.dataset.page = st.page;
    el.querySelectorAll('.memo-page').forEach((p) => { const front = Number(p.dataset.page) === st.page; p.classList.toggle('front', front); p.classList.toggle('back', !front); p.setAttribute('aria-hidden', String(!front)); }); // 뒷장은 inert를 안 씀(누르면 넘겨야 해서). 안 글은 visibility hidden이라 포커스 안 감
    el.querySelectorAll('.memo-dots i').forEach((d, i) => d.classList.toggle('on', i === st.page));
    const sp = q('.memo-spring'); if (sp && pic('memo_spring')) sp.style.backgroundImage = `url(${pic('memo_spring')})`;
    const f = q('.memo-add'); if (f) f.addEventListener('submit', (e) => { e.preventDefault(); addNow(); });
    const ab = q('.memo-add-b'); if (ab) ab.addEventListener('click', () => { st.adding = true; paint(); const i = q('.memo-in'); if (i) i.focus(); });
    if (focus) { const x = Array.from(el.querySelectorAll('[data-focus]')).find((n) => n.dataset.focus === focus); if (x) x.focus(); }
  }
  function say(text) {
    if (!text) return; st.line = text; st.log.push(text);
    // 집 말풍선은 메모지에 가려질 수 있어서 아래 막대 밑 한 줄로 (무늬 목업에는 없는 줄, 비트 판단 2026-10-03)
    q('.memo-line').textContent = text; q('.memo-say').hidden = false;
  }
  function go(page) {
    page = ((page % 2) + 2) % 2;
    if (page === st.page) return;
    st.page = page; st.adding = false; paint();
    if (page === 1) { const v = HU.view(); say(v && v.shop.length ? HU.line('memo.flip') : HU.line('shop.empty')); }
  }
  function flip(d) { go(st.page + d); }
  // 메모지 위 클릭: 비치는 뒷장 / 앞장 접힌 귀퉁이 = 넘기기, 체크 칸 = 샀어요
  function onDesk(e) {
    if (st.justDragged && Date.now() - st.justDragged < 300) return;
    const back = e.target.closest('.memo-page.back'); if (back) { go(Number(back.dataset.page)); return; }
    if (e.target.closest('.memo-corner')) { flip(1); return; }
    const b = e.target.closest('.memo-chk'); if (b && !b.disabled) buy(b.closest('.memo-buy').dataset.name);
  }
  async function buy(name) {
    const t0 = Date.now(), v = HU.view(), row = v && v.shop.find((r) => r.name === name);
    st.bought[name] = { name, auto: !!(row && row.auto) }; paint();
    const res = await HU.save('shop', { type: 'bought', name });
    if (res.busy) { delete st.bought[name]; paint(); return res; }
    const bad = HU.problemLine(res);
    say(bad || (res.item ? HU.line('shop.bought', { item: name }) : HU.line('shop.done', { item: name })));
    if (bad) { delete st.bought[name]; paint(); return res; }
    setTimeout(() => { delete st.bought[name]; if (st.open) { paint(); const c = q('.memo-shop .memo-chk:not([disabled])'); if (c) c.focus(); else q('.memo-fridge').focus(); } }, Math.max(0, BOUGHT_MS - (Date.now() - t0)));
    return res;
  }
  async function addNow() {
    const inp = q('.memo-in'), raw = inp ? inp.value : '';
    if (!raw.trim()) { st.adding = false; paint('memo-add'); return null; }
    if (/[|｜]/.test(raw)) { say(HU.line('tmp.badName')); inp.focus(); return null; }
    const res = await HU.save('shop', { type: 'add', name: raw.replace(/\s+/g, ' ').trim() });
    if (res.busy) return res;
    const bad = HU.problemLine(res);
    if (bad) { say(bad); const i2 = q('.memo-in'); if (i2) i2.focus(); return res; }
    st.adding = false; paint('memo-add'); say(HU.line('shop.add'));
    return res;
  }
  function openFridge() {
    close();
    const IX = root.PHInteract; if (IX && IX.openFx) IX.openFx('fridge');
    if (root.PHInventory) return root.PHInventory.open('food', 'fridge', '냉장고');
    return null;
  }

  function blockedNow() {
    const g = root.PHGame && root.PHGame.G;
    return !g || g.mode !== 'play' || !g.active || !!g.dialog || (root.PHDialog && root.PHDialog.isOpen()) || (root.PHWardrobe && root.PHWardrobe.isOpen()) ||
      (root.PHWaterModal && root.PHWaterModal.isOpen()) || (root.PHInventory && root.PHInventory.isOpen()) || (root.PHBookModal && root.PHBookModal.isOpen()) || ['PHRecordModal', 'PHBucketMemo'].some((k) => root[k] && root[k].isOpen && root[k].isOpen());
  }
  // interact.js가 부름 (냉장고). 늘 1장부터
  async function open(from) {
    if (st.open || blockedNow()) return false;
    build(); if (!el) return false;
    const g = root.PHGame && root.PHGame.G; if (g) g.held = [];
    if (root.PHGame && root.PHGame.hideBubble) root.PHGame.hideBubble();
    st.open = true; st.from = from || null; st.opened++; st.page = 0; st.adding = false; st.bought = {}; q('.memo-say').hidden = true;
    await HU.ensure();
    el.hidden = false; fit(); paint();
    const has = todays().length > 0;
    say(HU.line(has ? 'memo.open' : 'memo.today_empty'));
    if (has) { try { localStorage.setItem(KEY_APPT, today()); } catch (e) { /* 못 적어도 진행 */ } }
    el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
    q('.memo-fridge').focus();
    return true;
  }
  function close() {
    if (!st.open) return;
    st.open = false; el.hidden = true; st.adding = false;
    const stage = $('stage'); if (stage) stage.focus({ preventScroll: true });
  }
  function onKey(e) {
    if (!st.open) return;
    e.stopPropagation();
    const k = e.key, t = e.target;
    if (t && t.tagName === 'INPUT') {
      if (e.isComposing || e.keyCode === 229) return;
      if (k === 'Escape') { e.preventDefault(); st.adding = false; paint('memo-add'); }
      else if (k === 'Enter') { e.preventDefault(); addNow(); }
      return;
    }
    if (k === 'Escape') { e.preventDefault(); close(); return; }
    if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); flip(k === 'ArrowLeft' ? -1 : 1); return; }
    if (k === 'ArrowUp' || k === 'ArrowDown') e.preventDefault();
  }
  function onKeyUp(e) { if (st.open) e.stopPropagation(); }
  root.addEventListener('keydown', onKey, true);
  root.addEventListener('keyup', onKeyUp, true);
  // 입장 때 appt.today를 말해도 되는지 (그날 메모지로 약속을 이미 봤으면 false)
  function apptSeen(date) { try { return localStorage.getItem(KEY_APPT) === date; } catch (e) { return false; } }

  function state() {
    const appts = el ? [...el.querySelectorAll('.memo-appt')].map((li) => li.textContent) : [];
    const shop = el ? [...el.querySelectorAll('.memo-buy')].map((li) => ({ name: li.dataset.name, auto: li.classList.contains('auto'), done: li.classList.contains('done') })) : [];
    return { open: st.open, page: st.page, from: st.from, appts, shop, line: st.line, log: st.log.slice(), opened: st.opened, dragged: st.dragged || 0, busy: HU.S.busy, adding: st.adding,
      art: ['memo_tape', 'memo_magnet', 'memo_spring', 'memo_check', 'memo_title_today', 'memo_title_buy'].filter((k) => !!pic(k)) };
  }
  root.PHFridgeMemo = { open, close, go, flip, isOpen: () => st.open, state, build, apptSeen, KEY_APPT, pic };
})(window);
