// 설정 화면 (공용판 피드백 1, 2026-10-08 비트). 디자인 = 무늬 디자인/20261008_pixel-house_설정화면_v01.md + 목업 html, 글 = 부기 문구_공용판2 v01 4절 (js/data/pet_lines.js)
//   사이드바 맨 아래 [설정] -> #main 위에 겹친 폴더 한 권 (탭: 펫 / 집 / 내 모습 / 사이드바). 저장 버튼 없음: 고르면·칸을 벗어나면 바로 저장 (electron/profile_main.js ph:profileSet)
//   이름·그림이 대사·캐릭터에 묶여 있는 값(펫·펫 이름·내 모습·집 도면)은 저장 뒤 화면을 그 자리 그대로 다시 엶 (가구 바꾸기와 같은 길, resume.settings = 다시 열 탭)
//   하우스 이름·사이드바 탭은 다시 열지 않고 바로 바꿈. 펫 한마디는 창을 닫을 때 하나만 (부기 4-2 순서)
//   제작자 판은 안 씀 (settings SETTINGS_SCREEN false, profiles/player)
(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PL = () => root.PH_SETTINGS_PLAIN || {}, LN = () => root.PH_SETTINGS_LINES || {}, PF = () => root.PHProfile, S = () => root.PH_SETTINGS;
  const OD = () => root.PHOnboardDesktop;
  const TABS = ['pet', 'house', 'avatar', 'side'];
  const AVATARS = ['avatar1', 'avatar2', 'avatar3'], HOUSES = ['room1', 'room2', 'room3'];
  const SIDE_TABS = ['home', 'habits', 'meetings', 'bucket', 'archive'];
  const SAY_KEY = 'pixel-house.settingsSay', SAY_ORDER = ['plan', 'petSwap', 'petName', 'house', 'avatar', 'tabs', 'saved']; // plan = 집 도면 (새 집 입장 화면부터 열려 다른 말보다 먼저)
  const NAME_MAX = 12, BRAND_MAX = 10; // electron/profile_main.js 와 같음
  const U = { el: null, btn: null, on: false, tab: 'pet', last: null, timer: null, frame: 0, busy: false, log: [] };
  const reduce = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const fill = (t, v) => String(t || '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));

  // 9x9 톱니, 5x5 X (무늬 목업 GEAR)
  const GEAR = ['....k....', '.k.kkk.k.', '..kkkkk..', '.kkk.kkk.', 'kkk...kkk', '.kkk.kkk.', '..kkkkk..', '.k.kkk.k.', '....k....'];
  const XMARK = ['k...k', '.k.k.', '..k..', '.k.k.', 'k...k'];
  function pixIcon(rows, color) {
    const c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length; c.setAttribute('aria-hidden', 'true');
    const ctx = c.getContext('2d'); ctx.fillStyle = color;
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'k') ctx.fillRect(x, y, 1, 1); }));
    return c;
  }
  function paintIcon(c, rows) { const col = getComputedStyle(c.parentElement).color; const n = pixIcon(rows, col); c.getContext('2d').clearRect(0, 0, c.width, c.height); c.getContext('2d').drawImage(n, 0, 0); }

  // ---- 값 ----
  const user = () => (PF() && PF().user) || {};
  const pet = () => (PF() ? PF().pet() : 'cat_white');
  const petName = () => (PF() ? PF().catName() : '두부');
  const avatar = () => (AVATARS.includes(user().avatar) ? user().avatar : 'avatar1');
  const house = () => root.PH_ART_SET;
  const brand = () => S().BRAND || 'Pixel House';
  const hidden = () => (S().TABS_HIDDEN || []).slice();
  const deskPet = () => user().desktopPet === true; // 바탕화면 펫 (2026-10-13, 처음 꺼짐)

  // ---- 버튼 ----
  function mount() {
    if (U.btn || !$('tabs')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'cfg-open'; b.id = 'cfg-open';
    b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false');
    const ic = document.createElement('canvas'); ic.width = 9; ic.height = 9; ic.setAttribute('aria-hidden', 'true');
    const tx = document.createElement('span'); tx.textContent = PL().button || '설정';
    b.append(ic, tx); $('tabs').appendChild(b);
    paintIcon(ic, GEAR);
    b.addEventListener('mouseenter', () => paintIcon(ic, GEAR)); b.addEventListener('mouseleave', () => setTimeout(() => paintIcon(ic, GEAR), 0));
    b.addEventListener('click', () => (U.on ? close() : open()));
    U.btn = b;
  }
  function build() {
    if (U.el) return U.el;
    const el = document.createElement('div'); el.className = 'cfg'; el.id = 'cfg'; el.hidden = true;
    el.innerHTML = `<div class="cfg-box" role="dialog" aria-modal="true" aria-label="${esc(PL().title || '설정')}" tabindex="-1">
      <div class="cfg-tabs" role="tablist" aria-label="${esc(PL().title || '설정')}">${TABS.map((t) => `<button type="button" role="tab" class="cfg-tab" id="cfg-tab-${t}" data-tab="${t}" aria-controls="cfg-panel" aria-selected="false" tabindex="-1">${esc((PL().tabs || {})[t] || t)}</button>`).join('')}
        <button type="button" class="cfg-x" aria-label="${esc(PL().close || '닫기')}"><canvas width="5" height="5" aria-hidden="true"></canvas></button></div>
      <div class="cfg-panel" id="cfg-panel" role="tabpanel"></div></div>`;
    $('main').appendChild(el);
    el.addEventListener('mousedown', (e) => { if (e.target === el) { e.preventDefault(); close(); } });
    el.addEventListener('keydown', onKey);
    el.addEventListener('keyup', (e) => e.stopPropagation());
    el.querySelectorAll('.cfg-tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab, true)));
    el.querySelector('.cfg-x').addEventListener('click', () => close());
    paintIcon(el.querySelector('.cfg-x canvas'), XMARK);
    if (root.ResizeObserver) new ResizeObserver(() => { if (U.on) paintPics(); }).observe(el.querySelector('.cfg-box'));
    U.el = el; return el;
  }
  function onKey(e) {
    e.stopPropagation(); // 집(document 듣기)으로 안 넘김
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    const tab = e.target.closest && e.target.closest('.cfg-tab');
    if (tab && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault(); const i = TABS.indexOf(tab.dataset.tab), n = TABS[(i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length];
      showTab(n, true); U.el.querySelector(`#cfg-tab-${n}`).focus(); return;
    }
    const tile = e.target.closest && e.target.closest('.cfg-tile');
    if (tile && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { // 그림 칸: 화살표로 옮기며 바로 고름
      e.preventDefault(); const all = [...tile.parentElement.querySelectorAll('.cfg-tile')], i = all.indexOf(tile), d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      const n = all[(i + d + all.length) % all.length]; n.focus(); n.click(); return;
    }
    if (tile && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); tile.click(); }
  }

  // ---- 열기·닫기 ----
  function open(tab, opt) {
    if (!U.btn) return false;
    build();
    if (root.PHGame && root.PHGame.G) root.PHGame.G.held = [];
    U.on = true; U.el.hidden = false; U.btn.setAttribute('aria-expanded', 'true');
    U.el.classList.remove('enter'); void U.el.offsetWidth; if (!reduce()) U.el.classList.add('enter');
    showTab(TABS.includes(tab) ? tab : U.tab, false);
    U.el.querySelector('.cfg-box').focus({ preventScroll: true });
    clearInterval(U.timer); U.frame = 0;
    if (!reduce()) U.timer = setInterval(() => { U.frame = 1 - U.frame; paintPics(true); }, 520);
    U.opened = (U.opened || 0) + 1; U.resumed = !!(opt && opt.resumed);
    return true;
  }
  function close(opt) {
    if (!U.on) return;
    U.on = false; U.el.hidden = true; U.btn.setAttribute('aria-expanded', 'false');
    clearInterval(U.timer); U.timer = null;
    if (!(opt && opt.keepFocus)) U.btn.focus({ preventScroll: true });
    sayQueued();
  }
  function showTab(t, focusFirst) {
    U.tab = t;
    U.el.querySelectorAll('.cfg-tab').forEach((b) => { const on = b.dataset.tab === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    const p = U.el.querySelector('#cfg-panel'); p.setAttribute('aria-labelledby', 'cfg-tab-' + t);
    p.innerHTML = panel(t) + `<div class="cfg-foot"><span>${esc(PL().applied || '바꾸면 바로 적용돼요')}</span><span>${esc(PL().keys || 'Esc 닫기')}</span></div>`;
    bind(t, p); paintPics();
    if (focusFirst) { /* 탭 버튼에 포커스 그대로 */ }
  }

  // ---- 칸 ----
  function tiles(kind, list, cur, names) {
    return `<div class="cfg-pick ${kind}" role="radiogroup" aria-label="${esc(kind === 'pets' ? PL().pet : PL().avatar)}">` + list.map((id) =>
      `<button type="button" class="cfg-tile" role="radio" data-id="${esc(id)}" aria-checked="${id === cur}" tabindex="${id === cur ? 0 : -1}"><span class="cfg-floor"><canvas data-pic="${esc(id)}"></canvas></span><span class="cfg-nm">${esc(names[id] || id)}</span></button>`).join('') + '</div>';
  }
  function field(id, label, value, opt) {
    return `<div class="cfg-field"><label for="${id}">${esc(label)}</label><span class="cfg-input${opt.tag ? ' nametag' : ''}${opt.wide ? ' wide' : ''}"><input id="${id}" maxlength="${opt.max}" autocomplete="off" spellcheck="false" placeholder="${esc(opt.holder || '')}" value="${esc(value)}"></span><span class="cfg-ok" aria-live="polite"></span></div>
      <p class="cfg-err" role="alert" data-for="${id}"></p><p class="cfg-note">${(Array.isArray(opt.note) ? opt.note : [opt.note || '']).filter(Boolean).map(esc).join('<br>')}</p>`;
  }
  function panel(t) {
    const P = PL();
    if (t === 'pet') {
      const ids = Object.keys(root.PH_PETS || { cat_white: 1 }), kind = PF() ? PF().petKind() : 'cat';
      return `<section class="cfg-sec"><h3 class="cfg-h">${esc(P.pet || '함께 사는 펫')}<small>${esc(fill(P.petCount || '{n}마리 중 하나', { n: ids.length }))}</small></h3>${tiles('pets', ids, pet(), P.pets || {})}
        ${field('cfg-pet-name', P.petName || '펫 이름', petName(), { tag: true, max: NAME_MAX, holder: PF() ? PF().petDefault(kind) : '두부', note: [fill(P.petNameNote || '', { default: PF() ? PF().petDefault(kind) : '두부' }), P.petNote] })}</section>` + deskPetSec(); // 부기 4-1 두 줄
    }
    if (t === 'house') {
      const names = { room1: '원룸', room2: '투룸', room3: '쓰리룸' }; Object.keys(names).forEach((k) => { const a = (S().ART_SETS || {})[k]; if (a && a.label) names[k] = a.label; });
      return `<section class="cfg-sec">${field('cfg-brand', P.house || '하우스 이름', S().BRAND === 'Pixel House' ? '' : brand(), { wide: true, max: BRAND_MAX, holder: P.houseHolder || 'Pixel House', note: P.houseNote })}</section>
        <section class="cfg-sec"><h3 class="cfg-h">${esc(P.plan || '집 도면')}</h3><div class="cfg-chips" role="radiogroup" aria-label="${esc(P.plan || '집 도면')}">` +
        HOUSES.filter((h) => (root.PH_ART_SETS_HAVE || []).includes(h)).map((h) => `<button type="button" class="cfg-chip${h === house() ? ' on' : ''}" role="radio" aria-checked="${h === house()}" data-house="${h}">${esc(names[h])}</button>`).join('') + '</div></section>';
    }
    if (t === 'avatar') return `<section class="cfg-sec"><h3 class="cfg-h">${esc(P.avatarNote || '집 안을 걸어 다니는 모습이에요')}</h3>${tiles('avs', AVATARS, avatar(), P.avatars || {})}</section>`;
    const hid = hidden(), TN = S().TAB_NAMES || {};
    return `<section class="cfg-sec"><h3 class="cfg-h">${esc(P.tabsTitle || '사이드바 탭')}</h3><ul class="cfg-list">` + SIDE_TABS.map((k) => {
      const on = k === 'home' || !hid.includes(k), sub = k === 'home' ? `<span class="sub lock">${esc(P.tabAlways || '늘 보여요')}</span>` : k === 'bucket' ? `<span class="sub">${esc(P.tabBucket || '')}</span>` : '';
      return `<li><span class="tx"><span class="nm" id="cfg-sw-${k}">${esc(TN[k] || k)}</span>${sub}</span><button type="button" class="cfg-sw" role="switch" data-side="${k}" aria-checked="${on}" aria-labelledby="cfg-sw-${k}"${k === 'home' ? ' disabled' : ''}></button></li>`;
    }).join('') + `</ul><p class="cfg-note wide">${esc(P.tabsNote || '')}</p></section>`;
  }
  // 바탕화면 펫 켜기 (2026-10-13 제작자 결정, 펫 탭 맨 아래). 사이드바 탭 스위치와 같은 줄 모양(cfg-list·cfg-sw, 무늬 확인 2026-10-13), 글 = 부기 1안 (js/data/pet_lines.js deskPet*)
  function deskPetSec() {
    const P = PL(), on = deskPet();
    return `<section class="cfg-sec cfg-deskpet"><ul class="cfg-list"><li><span class="tx"><span class="nm" id="cfg-sw-deskpet">${esc(P.deskPet || '바탕화면 펫')}</span><span class="sub">${esc(P.deskPetSub || '')}</span></span>`
      + `<button type="button" class="cfg-sw" role="switch" data-deskpet="1" aria-checked="${on}" aria-labelledby="cfg-sw-deskpet"></button></li></ul><p class="cfg-note wide">${esc(P.deskPetNote || '')}</p></section>`;
  }
  // 그림: 펫 = {앞부분}_idle, 내 모습 = avatarN_idle. 정수 배율 (상자 430px 이하면 2배, 아니면 3배 = 무늬 5절 5번). 고른 칸만 2장 움직임
  function paintPics(onlyOn) {
    if (!U.el || !root.PHArt) return;
    const Art = root.PHArt, small = U.el.querySelector('.cfg-box').clientWidth <= 430;
    U.el.querySelectorAll('canvas[data-pic]').forEach((c) => {
      const id = c.dataset.pic, tile = c.closest('.cfg-tile'), on = tile && tile.getAttribute('aria-checked') === 'true';
      if (onlyOn && !on) return;
      const key = (root.PH_PETS && root.PH_PETS[id] ? root.PH_PETS[id].sprite : id) + '_idle'; if (!Art.has(key)) return;
      const z = Art.size(key), k = small ? 2 : 3, f = on && Art.frameCount(key) > 1 ? U.frame : 0;
      if (c.width !== z.w || c.height !== z.h) { c.width = z.w; c.height = z.h; }
      c.style.width = z.w * k + 'px'; c.style.height = z.h * k + 'px';
      const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, z.w, z.h); ctx.drawImage(Art.frameCanvas(key, f), 0, 0);
    });
  }
  function bind(t, p) {
    p.querySelectorAll('.cfg-tile').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.id;
      if (t === 'pet') { if (id !== pet()) save('pet', id, { reload: true, say: 'petSwap' }); }
      else if (id !== avatar()) save('avatar', id, { reload: true, say: 'avatar' });
    }));
    const nm = p.querySelector('#cfg-pet-name');
    if (nm) textField(nm, (v) => { if (v.trim() === petName()) { nm.value = petName(); return; } save('cat', v, { reload: true, say: 'petName', input: nm }); });
    const br = p.querySelector('#cfg-brand');
    if (br) {
      br.addEventListener('input', () => { if (root.PHApp && root.PHApp.setBrand) root.PHApp.setBrand(br.value.trim() || PL().houseHolder || 'Pixel House'); }); // 칠 때마다 사이드바 이름 미리보기
      textField(br, (v) => { if ((v.trim() || 'Pixel House') === brand()) return; save('brand', v, { say: 'house', input: br }); });
    }
    p.querySelectorAll('.cfg-chip').forEach((c) => c.addEventListener('click', () => { if (c.dataset.house !== house()) save('house', c.dataset.house, { reload: 'house', say: 'plan' }); }));
    const dp = p.querySelector('.cfg-sw[data-deskpet]');
    if (dp) dp.addEventListener('click', () => save('desktopPet', !deskPet(), { focus: '.cfg-sw[data-deskpet]' }));
    p.querySelectorAll('.cfg-sw[data-side]:not(:disabled)').forEach((sw) => sw.addEventListener('click', () => {
      const k = sw.dataset.side, h = hidden(), next = h.includes(k) ? h.filter((x) => x !== k) : h.concat(k);
      save('tabsHidden', next, { say: 'tabs', focus: '.cfg-sw[data-side="' + k + '"]' });
    }));
  }
  // 글 칸: Enter(한글 조합 중 제외) 또는 칸을 벗어날 때 확정
  function textField(inp, commit) {
    let done = false;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); done = true; commit(inp.value); } });
    inp.addEventListener('input', () => { done = false; const er = U.el.querySelector(`.cfg-err[data-for="${inp.id}"]`); if (er) er.textContent = ''; inp.classList.remove('bad'); });
    inp.addEventListener('change', () => { if (!done) commit(inp.value); done = false; });
  }

  // ---- 저장 ----
  async function save(key, value, o) {
    if (U.busy || !OD() || !OD().setProfile) return null;
    U.busy = true; let r = null;
    try { r = await OD().setProfile(key, value); } catch (e) { r = { ok: false, code: 'fail' }; }
    U.busy = false; U.last = { key, value, r };
    if (!r || !r.ok) { showErr(o && o.input, r); return r; }
    const u = r.user || {};
    // 저장된 값을 이 화면 값에도 (다시 열지 않는 것)
    PF().user = Object.assign({}, PF().user, { pet: u.pet, cat: u.cat, brand: u.brand, avatar: u.avatar, house: u.house, tabsHidden: u.tabsHidden, desktopPet: u.desktopPet === true }); // preload 값은 읽기 전용이라 새 객체로
    queueSay(o.say, { house: u.brand });
    if (o.reload) return reopen(key === 'house' ? u.house : root.PH_ART_SET, o.reload === 'house');
    if (key === 'brand') {
      S().BRAND = u.brand; S().TITLE = u.brand; document.title = u.brand;
      if (root.PHApp && root.PHApp.setBrand) root.PHApp.setBrand(u.brand);
      if (o.input) { o.input.value = u.brand === 'Pixel House' ? '' : u.brand; okMark(o.input); }
    }
    if (key === 'desktopPet') { showTab('pet', false); const f = o.focus && U.el.querySelector(o.focus); if (f) f.focus(); } // 펫 창은 메인이 열고 닫음
    if (key === 'tabsHidden') {
      S().TABS_HIDDEN = u.tabsHidden.slice();
      if (root.PHApp && root.PHApp.applyTabs) root.PHApp.applyTabs();
      showTab('side', false); const f = o.focus && U.el.querySelector(o.focus); if (f) f.focus();
    }
    return r;
  }
  function showErr(inp, r) {
    const E = PL().err || {}, brandF = inp && inp.id === 'cfg-brand';
    const msg = !r ? E.fail : r.code === 'tooLong' ? fill(brandF ? E.houseLong : E.nameLong, { max: r.max }) : r.code === 'bad' ? (brandF ? E.houseBad : E.nameBad) : E.fail;
    if (!inp) { U.errText = msg || '저장하지 못했어요.'; return; }
    const er = U.el.querySelector(`.cfg-err[data-for="${inp.id}"]`); if (er) er.textContent = msg || '';
    inp.classList.add('bad'); U.errText = msg;
  }
  function okMark(inp) {
    const ok = inp.closest('.cfg-field').querySelector('.cfg-ok'); if (!ok) return;
    ok.textContent = PL().ok || '✓ 바꿨어요'; ok.classList.add('on'); clearTimeout(ok._t); ok._t = setTimeout(() => ok.classList.remove('on'), 1500);
  }
  // 그 자리 그대로 다시 열기 (가구 바꾸기와 같은 길). 집 도면을 바꾸면 새 집 입장 화면부터
  function reopen(set, newHouse) {
    const App = root.PHApp || {}, g = root.PHGame;
    const r = newHouse ? { entered: false, tab: 'home' } : Object.assign(App.entered && g ? Object.assign({ entered: true }, g.resumeState()) : { entered: false }, { tab: App.tab || 'home' });
    r.settings = U.tab; U.reopened = r;
    if (root.PHDesktop && root.PHDesktop.setArtSet) root.PHDesktop.setArtSet(set, r);
    return r;
  }

  // ---- 펫 한마디 (창을 닫을 때 하나만. 다시 연 뒤에도 남게 sessionStorage) ----
  function queueSay(kind, v) {
    if (!kind) return;
    let q = null; try { q = JSON.parse(sessionStorage.getItem(SAY_KEY) || 'null'); } catch (e) { q = null; }
    if (q && SAY_ORDER.indexOf(q.kind) <= SAY_ORDER.indexOf(kind)) { if (kind === 'house' && q.kind === 'house') q.house = v.house; }
    else q = { kind, house: v && v.house };
    try { sessionStorage.setItem(SAY_KEY, JSON.stringify(q)); } catch (e) { /* 말만 못 함 */ }
  }
  function lineFor(q) {
    const L = LN(), kind = PF() ? PF().petKind() : 'cat';
    let list = q.kind === 'petSwap' ? ((L.petSwap || {})[kind] || []) : (L[q.kind] || L.saved || []);
    if (!list.length) list = L.saved || [];
    let t = list[Math.floor(Math.random() * list.length)] || '';
    if (PF()) t = PF().fillCat(t, PF().catName());
    return t.replace(/\{house(?:\|([^}]+))?\}/g, (m, j) => (j && PF() ? PF().josa(q.house || brand(), j) : (q.house || brand())));
  }
  function sayQueued() {
    let q = null; try { q = JSON.parse(sessionStorage.getItem(SAY_KEY) || 'null'); sessionStorage.removeItem(SAY_KEY); } catch (e) { q = null; }
    if (!q) return null;
    const text = lineFor(q), App = root.PHApp || {}; if (!text) return null;
    const say = root.PHWorld ? root.PHWorld.parseLine(text).say : text;
    U.said = { kind: q.kind, text: say }; U.log.push(U.said);
    if (App.tab === 'home' && App.entered && root.PHGame) root.PHGame.bubble('dubu', say, { tag: 'settings' });
    else if (App.tab !== 'home' && App.sideSay) App.sideSay(say);
    return U.said;
  }

  // 펫 메뉴에서 "바탕화면 펫 끄기"를 눌렀을 때 (메인 알림): 이 화면 값도 끔, 펫 탭이 열려 있으면 다시 그림
  if (OD() && OD().onDeskPet) OD().onDeskPet((d) => { if (!PF()) return; PF().user = Object.assign({}, PF().user, { desktopPet: !!d.on }); if (U.on && U.tab === 'pet') showTab('pet', false); });

  function state() {
    return { mounted: !!U.btn, open: U.on, tab: U.tab, last: U.last, said: U.said || null, resumed: !!U.resumed, err: U.errText || '',
      pet: pet(), petName: petName(), avatar: avatar(), house: house(), brand: brand(), hidden: hidden(), desktopPet: deskPet() };
  }
  root.PHSettingsUI = { mount, open, close, isOpen: () => U.on, mounted: () => !!U.btn, state, save, sayQueued, U };
})(window);
