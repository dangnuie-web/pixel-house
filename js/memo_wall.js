// 벽에 붙은 버킷리스트 메모지 + 붙일 자리 고르기 (2026-10-08 비트, 로드맵 3단계 "메모지 픽셀을 가구 꾸미기처럼 벽에 실제로 붙이기")
// 디자인 = 무늬 디자인/20261008_pixel-house_기록기능디자인_v01.md 2절: 그림 memo_bucket_wall(10x11, 벽 층, 밤 팔레트 있음),
//   자리 = settings.MEMO_WALL_SLOTS[그림 세트] (왼쪽 위 점만). 고른 자리 = 앱 설정(localStorage pixel-house.bucketSlot). 처음 값 = 목록 첫 자리
//   자리 고르기 = 가구 기능 연동(css/furnish.css)과 같은 틀: 빈 자리 점선 칸 + 메모지 45% 미리 보기, 지금 자리 실선, 아래 띠 + "다 했어요"
//   점선 칸 누르면 바로 옮김(120ms 1u 위에서 내려앉음, 움직임 줄이기면 없음). ←→ 자리 차례, Enter 고르기, Esc·"다 했어요" 끝
// 집에서 메모지를 누르면 버킷리스트 메모지 창 (js/bucket_memo.js). 생활 기록 파일은 안 건드림 (자리는 앱 설정)
(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const S = root.PH_SETTINGS, KEY = 'pixel-house.bucketSlot', SPRITE = 'memo_bucket_wall', PAD = 2;
  const W = { placing: false, cur: 0, drop: null, said: null, log: [] };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const A = () => root.PHArt, L = () => root.PH_LAYOUT;
  const PL = () => (root.PH_LINES && root.PH_LINES.uiPlain && root.PH_LINES.uiPlain.memoWall) || {};
  const LN = () => (root.PH_LINES && root.PH_LINES.ui && root.PH_LINES.ui.memoWall) || {};
  const slots = () => ((S.MEMO_WALL_SLOTS || {})[root.PH_ART_SET] || (L() && L().wallSlots) || []); // 공용 집 = 배치표 wall_slots
  const size = () => (A() && A().has(SPRITE) ? A().size(SPRITE) : null);
  function on() { return !!(slots().length && size() && root.PHBucketWrite); }
  function slotId() { let v = null; try { v = localStorage.getItem(KEY); } catch (e) { v = null; } return slots().some((s) => s.id === v) ? v : (slots()[0] || {}).id; }
  const slot = () => slots().find((s) => s.id === slotId()) || null;
  function setSlot(id) { try { localStorage.setItem(KEY, id); } catch (e) { /* 저장 못 하면 이번만 */ } }

  // 집 그림 위 (render.js drawScene: 벽 층 다음). 고르는 중 내려앉는 움직임 = drop
  function drawWall(ctx, t) {
    if (!on()) return;
    const s = slot(); if (!s) return;
    let dy = 0;
    if (W.drop && W.drop.id === s.id) { const p = (performance.now() - W.drop.t0) / 120; if (p < 1) dy = -1; else W.drop = null; }
    ctx.drawImage(A().frameCanvas(SPRITE, 0), s.px, s.py + dy);
  }
  // 집 클릭 (game.js onClick, 캔버스 px): 메모지 위면 버킷리스트 메모지 열기
  function hit(p) { const s = slot(), z = size(); return !!(on() && s && z && p.x >= s.px && p.x < s.px + z.w && p.y >= s.py && p.y < s.py + z.h); }
  function onClick(p) {
    if (W.placing || !hit(p)) return false;
    if (root.PHBucketMemo) root.PHBucketMemo.open('wall');
    return true;
  }

  // ---- 자리 고르기 ----
  let el = null;
  function build() {
    if (el) return el;
    const stage = $('stage'); if (!stage) return null;
    el = document.createElement('div'); el.id = 'mw'; el.className = 'mw'; el.hidden = true;
    el.innerHTML = `<div class="mw-boxes"></div><div class="fn-bar mw-bar" role="toolbar" aria-label="${esc(PL().mode || '메모지 붙일 자리')}"><i class="fn-bar-dot" aria-hidden="true"></i><b class="fn-bar-m">${esc(PL().mode || '메모지 붙일 자리')}</b><span class="fn-bar-t">${esc(PL().hint || '')}</span><button type="button" class="fn-done mw-done">${esc(PL().done || '다 했어요')}</button></div>`;
    stage.appendChild(el);
    el.querySelector('.mw-done').addEventListener('click', (e) => { e.stopPropagation(); finish(); });
    el.addEventListener('mousedown', (e) => { if (e.target === el || e.target.classList.contains('mw-boxes')) e.preventDefault(); });
    el.addEventListener('keydown', onKey);
    root.addEventListener('resize', () => { if (W.placing) paint(); });
    return el;
  }
  function toCss(x, y) {
    const cv = $('cv'), st = $('stage'), r = cv.getBoundingClientRect(), s = st.getBoundingClientRect(), k = r.width / L().W;
    return { x: r.left - s.left + x * k, y: r.top - s.top + y * k, k };
  }
  let pic = null;
  function paint(focusId) {
    if (!el) return;
    const z = size(), cur = slotId(), box = el.querySelector('.mw-boxes');
    if (!pic) { try { pic = A().frameCanvas(SPRITE, 0).toDataURL(); } catch (e) { pic = ''; } }
    box.innerHTML = slots().map((s, i) => {
      const p = toCss(s.px - PAD, s.py - PAD), w = (z.w + PAD * 2) * p.k, h = (z.h + PAD * 2) * p.k, here = s.id === cur;
      return `<button type="button" class="fn-hover mw-slot${here ? ' sel' : ''}${i === W.cur ? ' focus' : ''}" data-id="${esc(s.id)}" aria-pressed="${here}" aria-label="${esc(s.label || s.id)}${here ? ' (지금 자리)' : ''}" style="left:${p.x}px;top:${p.y}px;width:${w}px;height:${h}px">` +
        (here || !pic ? '' : `<img src="${pic}" alt="" aria-hidden="true" style="left:${PAD * p.k}px;top:${PAD * p.k}px;width:${z.w * p.k}px;height:${z.h * p.k}px">`) + '</button>';
    }).join('');
    box.querySelectorAll('.mw-slot').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); pick(b.dataset.id); }));
    const f = box.querySelector(`.mw-slot[data-id="${focusId || slots()[W.cur].id}"]`); if (f && focusId !== false) f.focus({ preventScroll: true });
  }
  function say(list, k, v) {
    if (!Array.isArray(list) || !list.length) return;
    const t = list[Math.floor(Math.random() * list.length)].replace(/\{memo\}/g, (v && v.memo) || '버킷리스트');
    W.said = { key: k, text: t };
    if (root.PHApp && root.PHApp.sideSay) root.PHApp.sideSay(t);
  }
  function start() {
    if (!on() || W.placing) return false;
    if (root.PHBucketMemo && root.PHBucketMemo.isOpen()) root.PHBucketMemo.close();
    build(); W.placing = true; W.cur = Math.max(0, slots().findIndex((s) => s.id === slotId())); W.moved = false;
    const g = root.PHGame && root.PHGame.G; if (g) g.held = [];
    if (root.PHGame && root.PHGame.hideBubble) root.PHGame.hideBubble();
    el.hidden = false; paint();
    say(LN().start, 'start');
    return true;
  }
  function pick(id) {
    const i = slots().findIndex((s) => s.id === id); if (i < 0) return false;
    W.cur = i;
    if (id === slotId()) { paint(id); return true; }
    setSlot(id); W.moved = true; W.log.push(id);
    const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) W.drop = { id, t0: performance.now() };
    paint(id); say(LN().moved, 'moved');
    return true;
  }
  function finish() {
    if (!W.placing) return;
    W.placing = false; el.hidden = true;
    say(W.moved ? LN().done : LN().cancel, W.moved ? 'done' : 'cancel');
    const st = $('stage'); if (st) st.focus({ preventScroll: true });
  }
  function onKey(e) {
    if (!W.placing || e.isComposing) return;
    const n = slots().length;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); W.cur = (W.cur + (e.key === 'ArrowRight' ? 1 : -1) + n) % n; paint(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (document.activeElement && document.activeElement.classList.contains('mw-done')) finish(); else pick(slots()[W.cur].id); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); }
    else if (e.key !== 'Tab') e.stopPropagation();
  }
  // 고르는 동안 집 조작은 막음 (창 밖 키)
  root.addEventListener('keydown', (e) => { if (!W.placing || (el && el.contains(e.target))) return; e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); finish(); } else if (e.key !== 'Tab') e.preventDefault(); }, true);

  function state() { return { on: on(), placing: W.placing, slot: slotId(), slots: slots().map((s) => s.id), cur: W.cur, said: W.said, log: W.log.slice() }; }
  Object.assign(W, { drawWall, hit, onClick, start, pick, finish, isOpen: () => W.placing, state, on, slot, KEY });
  root.PHMemoWall = W;
})(window);
