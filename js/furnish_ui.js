// 가구 기능 연동 모드 (2026-10-04 비트, 2026-10-04 제작자 결정으로 "가구 연결" -> "가구 기능 연동", 제작자 희망 "가구에 기능을 직접 연결" + 집 짓기 2단계 토대). 비트 임시 모양 (무늬 확인 전)
//   집 위 오른쪽 위 작은 버튼 "가구 기능 연동" -> 모드 켜짐: 아래 띠(안내 + 기본으로 되돌리기 + 연동 끝), 기능이 붙은 가구마다 작은 이름표
//   가구 누르기 -> 그 가구 옆에 기능 목록: 없음 + 기능들. 줄 = 왼쪽 기능 이름 / 오른쪽 가구 이름. 붙은 것은 강조색, 다른 가구 것은 옮기지 않고 안내만(먼저 그 가구에서 연동 풀기),
//   습관 줄을 지운 기능(대변·식사·독서·요가)은 회색으로 고를 수 없음. 모든 기능은 가구 하나에만 (2026-10-04 옷 갈아입기도)
//   계산·규칙 = js/features.js, 저장 = js/furnish.js -> 앱 설정 features.json. 누르는 곳 = js/interact.js spotAt (연결 모드에서는 기능 없는 아래 칸도)
//   모드 동안: 가구를 눌러도 기능이 안 열림(interact blocked), 클릭으로 걷지 않음. 방향키 걷기는 그대로. Esc = 목록 닫기 -> 모드 끄기
//   game.js onClick이 맨 먼저 부름: PHFurnishUI.onClick(p) (두부가 앉은 테이블도 고를 수 있게 두부보다 먼저)
(function (root) {
  'use strict';
  const FX = root.PHFeatures, FS = () => root.PHFurnish, IX = () => root.PHInteract, Game = () => root.PHGame;
  const L = root.PH_LAYOUT, TB = root.PH_INTERACTIONS;
  const LN = () => root.PH_FURNISH_LINES || {}, P = () => root.PH_FURNISH_PLAIN || {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fill = (t, v) => (root.PHLife && root.PHLife.fill ? root.PHLife.fill(t, v) : String(t).replace(/\{(\w+)(?:\|[^}]+)?\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
  const U = { on: false, menu: null, busy: false, log: [], last: null, els: null, hover: null };
  const lastPick = {};
  function line(k, v) {
    const a = [].concat(LN()[k] || []); if (!a.length) return '';
    const c = a.length > 1 ? a.filter((x) => x !== lastPick[k]) : a, t = c[Math.floor(Math.random() * c.length)]; lastPick[k] = t;
    return fill(t, v || {});
  }
  // 두부 한마디. 목록이 열린 동안 말풍선이 목록과 겹치면 띄우지 않고 기록만 (무늬 v01 A안, 제작자 승인 2026-10-04: 같은 말은 목록 안 안내·이름표로 보임)
  function say(text) {
    if (!text) return; U.log.push(text); const g = Game(); if (!g || !g.bubble) return;
    g.bubble('dubu', text, { tag: 'furnish' });
    if (U.menu && U.els && overMenu()) { g.hideBubble(); U.hushed = (U.hushed || 0) + 1; U.lastHushed = text; }
  }
  // 말풍선 자리를 지금 바로 잡아(game.js drawBubble과 같은 셈) 목록 상자와 겹치는지 봄
  function overMenu() {
    const b = $('bubble'), d = Game().actor('dubu'), gg = G(); if (!b || !d || b.hidden) return false;
    const T = 16; b.style.left = Math.round((d.px + T / 2) * gg.scale) + 'px'; b.style.top = Math.round((d.py - 2 + (d.lift || 0)) * gg.scale) + 'px';
    const p = b.getBoundingClientRect(), m = U.els.menu.getBoundingClientRect();
    return p.left < m.right && p.right > m.left && p.top < m.bottom && p.bottom > m.top;
  }

  const allKeys = () => root.PHInteractLogic.linkKeys(L, TB).all;
  const map = () => FX.resolve(allKeys(), FS() ? FS().links : {});
  const G = () => (Game() ? Game().G : null);
  const playing = () => { const g = G(); return !!g && g.mode === 'play' && !g.dialog && !$('screen-house').hidden; };

  // ---- 화면 조각 ----
  function build() {
    if (U.els) return U.els;
    const stage = $('stage'); if (!stage) return null;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'fn-toggle'; btn.className = 'fn-toggle'; btn.hidden = true; btn.textContent = P().toggle; btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    const bar = document.createElement('div');
    bar.id = 'fn-bar'; bar.className = 'fn-bar'; bar.hidden = true; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', P().toggle);
    bar.innerHTML = `<i class="fn-bar-dot" aria-hidden="true"></i><b class="fn-bar-m">${esc(P().barMode)}</b><span class="fn-bar-t">${esc(P().bar)}</span><button type="button" class="fn-reset">${esc(P().reset)}</button><button type="button" class="fn-done">${esc(P().done)}</button>`;
    bar.querySelector('.fn-reset').addEventListener('click', (e) => { e.stopPropagation(); reset(); });
    bar.querySelector('.fn-done').addEventListener('click', (e) => { e.stopPropagation(); setMode(false); });
    const tags = document.createElement('div'); tags.id = 'fn-tags'; tags.className = 'fn-tags'; tags.hidden = true; tags.setAttribute('aria-hidden', 'true');
    const hov = document.createElement('div'); hov.className = 'fn-hover'; hov.hidden = true; tags.appendChild(hov);
    const menu = document.createElement('div'); menu.id = 'fn-menu'; menu.className = 'fn-menu'; menu.hidden = true; menu.setAttribute('role', 'dialog');
    menu.addEventListener('click', (e) => e.stopPropagation());
    menu.addEventListener('keydown', onMenuKey);
    const ov = $('overlay'); if (ov) stage.insertBefore(tags, ov); else stage.appendChild(tags); // 이름표는 두부 말풍선 아래
    stage.append(bar, btn, menu);
    U.els = { stage, btn, bar, tags, hov, menu };
    return U.els;
  }
  // 캔버스 px -> #stage 안 CSS px
  function toCss(x, y) {
    const cv = $('cv'), st = $('stage'), r = cv.getBoundingClientRect(), s = st.getBoundingClientRect(), k = r.width / L.W;
    return { x: r.left - s.left + x * k, y: r.top - s.top + y * k, k };
  }
  function drawTags() {
    const E = build(); if (!E) return;
    E.tags.querySelectorAll('.fn-tag').forEach((t) => t.remove());
    if (!U.on) return;
    IX().spots().forEach((s) => {
      const f = FX.get(s.conf.fid); if (!f || (s.kind === 'part' && (s.lamp || s.conf.plant))) return;
      if (!FS().isOn(f.id)) return; // 2026-10-04 제작자: 꺼진 기능(습관 없음) 이름표는 숨김
      const c = toCss(s.rect[0] + s.rect[2] / 2, s.rect[1] + (s.kind === 'part' ? s.rect[3] / 2 : 2));
      const t = document.createElement('span');
      t.className = 'fn-tag' + (s.kind === 'part' ? ' part' : '') + (U.menu && U.menu.key === s.key ? ' sel' : '');
      t.dataset.key = s.key; t.dataset.fn = f.id; t.textContent = f.short;
      t.style.left = Math.round(c.x) + 'px'; t.style.top = Math.round(c.y) + 'px';
      E.tags.appendChild(t);
    });
    unoverlap(E);
  }
  // 이름표 겹침 풀기 (무늬 v01 F3): 왼쪽부터 보며 앞 이름표와 상자가 겹치면 그 오른쪽 4px 뒤로 옮기고 세로는 앞 것과 맞춤
  function unoverlap(E) {
    const tags = [...E.tags.querySelectorAll('.fn-tag')], put = [];
    tags.map((t) => ({ t, r: t.getBoundingClientRect() })).sort((a, b) => a.r.left - b.r.left).forEach((o) => {
      let r = o.r;
      for (let i = 0; i < 4; i++) {
        const hit = put.find((p) => r.left < p.r.right + 4 && r.right + 4 > p.r.left && r.top < p.r.bottom && r.bottom > p.r.top); if (!hit) break;
        const dx = hit.r.right + 4 - r.left, dy = hit.r.top - r.top;
        o.t.style.left = (parseFloat(o.t.style.left) + dx) + 'px'; o.t.style.top = (parseFloat(o.t.style.top) + dy) + 'px';
        o.t.classList.add('moved'); r = o.t.getBoundingClientRect();
      }
      put.push({ t: o.t, r });
    });
  }
  function showBox(el, s) {
    if (!s) { el.hidden = true; return; }
    const a = toCss(s.rect[0], s.rect[1]), b = toCss(s.rect[0] + s.rect[2], s.rect[1] + s.rect[3]);
    Object.assign(el.style, { left: Math.round(a.x) + 'px', top: Math.round(a.y) + 'px', width: Math.round(b.x - a.x) + 'px', height: Math.round(b.y - a.y) + 'px' });
    el.hidden = false;
  }

  // ---- 모드 ----
  function setMode(on) {
    const E = build(); if (!E) return false;
    if (on && !playing()) return false;
    U.on = !!on; closeMenu(true);
    IX().setConnect(U.on);
    E.btn.classList.toggle('on', U.on); E.btn.setAttribute('aria-pressed', String(U.on)); E.btn.textContent = U.on ? P().done : P().toggle;
    E.bar.hidden = !U.on; E.tags.hidden = !U.on; E.hov.hidden = true; U.hover = null;
    E.stage.classList.toggle('fn-on', U.on);
    if (Game() && Game().hideBubble) Game().hideBubble();
    drawTags();
    if (playing()) say(line(U.on ? 'open' : 'close'));
    if (!U.on) E.stage.focus({ preventScroll: true });
    return true;
  }
  const toggle = () => setMode(!U.on);

  // ---- 기능 목록 ----
  function openMenu(s) {
    const E = build(), m = map(), cur = m[s.key] || null, P_ = P(), furn = FX.nameOf(s.key);
    U.menu = { key: s.key, furn };
    // 2026-10-04 제작자: 제목 = "가구 기능 연동" + 아래 "누른 가구: OO". 줄 = 왼쪽 기능 이름(작게), 오른쪽 가구 이름(진하게·크게)
    //   붙은 곳 없음 = 오른쪽 작게 "(연동 안 됨)". 꺼진 기능(습관 없음)은 목록에서 뺌 (다시 켜기 = 생활 습관 편집에서 습관 추가)
    //   "연동 풀기 (그냥 가구로)" = 맨 아래 구분선 밑, 이 가구에 연동된 기능이 있을 때만
    // 무늬 v01 (제작자 승인 2026-10-04): 머리 = 작은 "가구 기능 연동" + 누른 가구 이름 크게. 줄 테두리 없음. 다른 가구가 쓰는 줄 = 갈색 글 + 올리면 자물쇠
    const row = (fn, cls, checked, furnText, furnEmpty, fnText, dis) => `<button type="button" role="menuitemradio" class="fn-item${cls}" data-fn="${esc(fn)}" aria-checked="${checked}"${dis ? ' aria-disabled="true"' : ''}>` +
      `<small class="fn-fn">${esc(fnText)}</small><b class="fn-furn${furnEmpty ? ' empty' : ''}">${dis ? '<i class="fn-lock" aria-hidden="true"></i>' : ''}${esc(furnText)}</b></button>`;
    let h = `<p class="fn-menu-t" id="fn-menu-t">${esc(P_.menuTitle)}</p><p class="fn-menu-furn">${esc(furn)}</p>`;
    // 집 꾸미기 (가) (2026-10-08 로드맵 4단계): 공용 집의 정해진 자리면 후보 고르기 칸 (js/house_slots.js). 고르면 저장하고 집을 그 자리에서 다시 엶
    const slot = s.kind === 'obj' && root.PHHouseSlots ? root.PHHouseSlots.slots.find((x) => x.type === s.type) : null;
    if (slot && slot.candidates.length > 1 && root.PHOnboardDesktop) {
      h += `<p class="fn-swap-t">${esc(P_.swapTitle || '가구 바꾸기')}</p><div class="fn-swap" role="group" aria-label="${esc(P_.swapTitle || '가구 바꾸기')}">` +
        slot.candidates.map((c) => `<button type="button" class="fn-swap-b" data-slot="${esc(slot.id)}" data-sprite="${esc(c.sprite)}" aria-pressed="${c.sprite === slot.sprite}">${esc(c.name)}</button>`).join('') + '</div>';
    }
    h += `<div class="fn-list" role="menu" aria-labelledby="fn-menu-t">`;
    // 2026-10-08: 공용 집 전용 기능(약속 달력)은 공용 집에만, 옷 갈아입기는 그 집에서 옷을 못 바꾸면(원룸 아바타 = 기본 옷 고정) 목록에서 뺌
    const hiddenHere = (f) => (f.houseOnly && !root.PH_HOUSE_LINKS) || (f.id === 'wardrobe' && root.PH_HOUSE_LINKS && root.PHOutfit && !root.PHOutfit.enabled());
    FX.FEATURES.forEach((f) => {
      if (FS().state(f.id) === 'off' || hiddenHere(f)) return;
      const here = cur === f.id, other = FX.keysWith(m, f.id).filter((k) => k !== s.key);
      const right = here ? furn : other.length ? FX.nameOf(other[0]) : P_.unlinked;
      h += row(f.id, (here ? ' cur' : '') + (other.length ? ' taken' : ''), here, right, !here && !other.length, f.label, other.length > 0); // taken = 다른 가구가 사용 중 (누르면 안내만)
    });
    if (cur) h += `<hr class="fn-sep" aria-hidden="true">` + `<button type="button" role="menuitemradio" class="fn-item fn-unlink" data-fn="none" aria-checked="false"><small class="fn-fn">${esc(P_.unlink)}</small><b class="fn-furn empty">${esc(P_.unlinkSub)}</b></button>`;
    E.menu.innerHTML = h + '</div>';
    E.menu.setAttribute('aria-label', P_.menuTitle + ': ' + furn);
    E.menu.querySelectorAll('.fn-item').forEach((b) => b.addEventListener('click', () => choose(s.key, b.dataset.fn)));
    E.menu.querySelectorAll('.fn-swap-b').forEach((b) => b.addEventListener('click', () => swap(b.dataset.slot, b.dataset.sprite)));
    // 자리: 가구 오른쪽(모자라면 왼쪽), 위아래는 무대 안
    E.menu.hidden = false; E.menu.style.left = '0px'; E.menu.style.top = '0px';
    const a = toCss(s.rect[0], s.rect[1]), b = toCss(s.rect[0] + s.rect[2], s.rect[1] + s.rect[3]), W = E.stage.clientWidth, H = E.stage.clientHeight, mw = E.menu.offsetWidth, mh = E.menu.offsetHeight;
    let x = b.x + 8; if (x + mw > W - 6) x = a.x - mw - 8; if (x < 6) x = Math.max(6, Math.min(W - mw - 6, a.x));
    let y = Math.max(6, Math.min(H - mh - 52, a.y)); // 아래 띠(연동 끝) 위까지
    E.menu.style.left = Math.round(x) + 'px'; E.menu.style.top = Math.round(y) + 'px';
    showBox(E.hov, s); E.hov.classList.add('sel');
    drawTags();
    const first = E.menu.querySelector('.fn-item.cur') || E.menu.querySelector('.fn-item'); if (first) first.focus({ preventScroll: true });
  }
  function closeMenu(quiet) {
    const E = U.els; U.menu = null; if (!E) return;
    E.menu.hidden = true; E.menu.innerHTML = ''; E.hov.classList.remove('sel'); E.hov.hidden = true;
    if (!quiet) { drawTags(); E.stage.focus({ preventScroll: true }); }
  }
  function onMenuKey(e) {
    if (e.isComposing || e.keyCode === 229) return;
    const items = [...U.els.menu.querySelectorAll('.fn-item')], i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); return; }
    const d = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (d) { e.preventDefault(); e.stopPropagation(); items[(i + d + items.length) % items.length].focus(); return; }
    if (e.key === 'Tab') { e.preventDefault(); items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus(); return; }
    if (/^Arrow| /.test(e.key)) e.stopPropagation(); // 목록 안 키가 걷기로 새지 않게
  }
  // 목록 안 작은 안내: 누른 줄 바로 아래 2줄 (무늬 v01, 맨 위 노란 칸 없앰). 다른 줄을 누르거나 목록이 닫히면 사라짐
  function note(fid, main, sub) {
    const M = U.els && U.els.menu; if (!M) return;
    M.querySelectorAll('.fn-note').forEach((x) => x.remove()); M.querySelectorAll('.fn-item.clicked').forEach((x) => x.classList.remove('clicked'));
    if (!main) return;
    const r = M.querySelector(`.fn-item[data-fn="${fid}"]`); if (!r) return;
    const el = document.createElement('p'); el.className = 'fn-note'; el.setAttribute('role', 'status');
    el.innerHTML = `<b>${esc(main)}</b><span>${esc(sub || '')}</span>`;
    r.classList.add('clicked'); r.after(el);
  }
  async function choose(key, fid) {
    if (U.busy) return null;
    const furn = FX.nameOf(key), f = FX.get(fid), before = map();
    note(null);
    if (f && FS().state(f.id) === 'off') { say(line('off', { fn: f.label })); U.last = { key, fid, off: true }; return null; }
    if ((before[key] || 'none') === (f ? f.id : 'none')) { closeMenu(); say(f ? line('same', { furn, fn: f.label }) : line('unlinked', { furn })); U.last = { key, fid, same: true }; return null; }
    // 2026-10-04 제작자: 다른 가구가 쓰는 기능은 옮기지 않음. 연동은 그대로 + 목록 안 안내 + 두부 한마디 (옮기기 = 원래 가구에서 연동 풀기 -> 새 가구에서 고르기)
    const taken = f ? FX.keysWith(before, f.id).filter((k) => k !== key) : [];
    if (taken.length) {
      const from = FX.nameOf(taken[0]);
      note(f.id, fill(P().takenMain, { furn: from }), fill(P().takenSub, { furn: from }));
      say(line('taken', { fn: f.label, furn: from }));
      U.last = { key, fid, taken: true, from: taken[0] };
      return null;
    }
    U.busy = true;
    try {
      await FS().setLinks(FX.setLink(allKeys(), FS().links, key, f ? f.id : null));
    } catch (e) { U.busy = false; U.last = { key, fid, error: String(e && e.message || e) }; say(line('fail')); return null; }
    U.busy = false;
    U.last = { key, fid: f ? f.id : 'none' };
    closeMenu();
    say(!f ? line('unlinked', { furn }) : line('linked', { furn, fn: f.label }));
    return U.last;
  }
  // 자리 후보 바꾸기: 앱 설정(profile.json furniture)에 저장 -> 같은 그림 세트로 화면을 다시 엶 (지금 자리·탭 그대로 이어짐, js/artset.js resume)
  async function swap(slotId, sprite) {
    if (U.busy) return null;
    const slot = root.PHHouseSlots.slots.find((x) => x.id === slotId); if (!slot || slot.sprite === sprite) { closeMenu(); return null; }
    U.busy = true;
    let r = null; try { r = await root.PHOnboardDesktop.setFurniture(slotId, sprite); } catch (e) { r = null; }
    U.busy = false;
    if (!r || !r.ok) { say(line('fail')); U.last = { slot: slotId, sprite, error: true }; return null; }
    U.last = { slot: slotId, sprite, swapped: true };
    const g = Game(), resume = Object.assign({ entered: true, tab: 'home' }, g ? g.resumeState() : {});
    if (root.PHDesktop && root.PHDesktop.setArtSet) root.PHDesktop.setArtSet(root.PH_ART_SET, resume);
    return U.last;
  }
  async function reset() {
    if (U.busy) return;
    U.busy = true;
    try { await FS().reset(); } catch (e) { U.busy = false; say(line('fail')); return; }
    U.busy = false; closeMenu(); say(line('reset')); U.last = { reset: true };
  }

  // ---- 입력 ----
  // game.js onClick 맨 앞. 모드면 클릭을 모두 여기서 씀 (걷기·두부·가구 기능 없음)
  function onClick(p) {
    if (!U.on) return false;
    if (U.busy) return true;
    const s = IX().spotAt(p);
    if (!s) { closeMenu(); return true; }
    if (U.menu && U.menu.key === s.key) { closeMenu(); return true; }
    openMenu(s);
    return true;
  }
  function onMove(e) {
    if (!U.on || U.menu) return;
    const cv = $('cv'), r = cv.getBoundingClientRect(), k = r.width / L.W;
    const s = IX().spotAt({ x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k });
    U.hover = s ? s.key : null; showBox(U.els.hov, s); cv.style.cursor = s ? 'pointer' : '';
  }
  function onKey(e) {
    if (!U.on || e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (U.menu) closeMenu(); else setMode(false); }
  }

  function init() {
    const E = build(); if (!E) return;
    $('cv').addEventListener('mousemove', onMove);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', () => { if (U.on) { drawTags(); if (U.menu) closeMenu(); } });
    if (FS()) FS().onChange(() => { if (U.on) drawTags(); });
    // 버튼은 집 안에서 걷는 동안만 (입장 연출·대화창·다른 탭에서는 숨김). 그 밖이 되면 모드도 끔
    setInterval(() => { const p = playing(); E.btn.hidden = !p; if (!p && U.on) setMode(false); }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  root.PHFurnishUI = Object.assign(U, { setMode, toggle, onClick, openMenu, closeMenu, choose, swap, reset, drawTags,
    state: () => ({ on: U.on, menu: U.menu ? Object.assign({}, U.menu) : null, busy: U.busy, last: U.last, log: U.log.slice(), map: map(),
      tags: U.els ? [...U.els.tags.querySelectorAll('.fn-tag')].map((t) => ({ key: t.dataset.key, fn: t.dataset.fn, text: t.textContent })) : [] }) });
})(window);
