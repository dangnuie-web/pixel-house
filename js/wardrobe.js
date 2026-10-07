// 옷 갈아입기 창 (wardrobe 브랜치 2026-10-03, 비트). 규칙·합성은 js/outfit.js, 표는 js/data/wardrobe.js, 모양은 css/wardrobe.css
// 여는 곳: 옷방 옷장 둘(wardrobe_top, wardrobe_side)과 원형 거울(mirror_oval)을 클릭하거나 옆에서 Space (js/interact.js go: 'wardrobe')
//   v10만 창이 열림. v08·v09는 두부 말풍선 한 줄(ui.wardrobe.cannot)만
// 모양: 하단 대화창(css/dialog.css)과 같은 결 (둥근 베이지 박스, 먹색 테두리, du 단위)
//   왼쪽 = 지금 차림 미리보기(정면, ←→로 방향 돌려 보기), 오른쪽 = 탭(상의/하의/외투/가방/모자/한벌) + 옷 칸 한 줄씩(작은 그림 + 이름)
//   외투·가방·모자 탭 맨 앞에 "없음". 그림이 없는 칸 = 회색 "준비 중"(못 고름). 고르면 미리보기와 집 안 플레이어가 바로 바뀌고 저장
// 키: 탭 = Q/E 또는 Tab(Shift+Tab 거꾸로) / 칸 = ↑↓ / 고르기 = Enter·Space / 미리보기 방향 = ←→ / 닫기 = Esc
//   (←→는 미리보기 방향에 써서 칸은 한 줄 목록으로 둠. 지시 "←→로 방향 돌려 보기"와 "칸은 방향키"를 같이 지키려고)
// 열려 있는 동안 집 조작(걷기·Space·물건 누르기)은 막음: window 잡기 단계에서 키를 먼저 받음 (game.js·dialog.js보다 먼저)
(function (root) {
  'use strict';
  const C = root.PH_WARDROBE, O = root.PHOutfit, Art = root.PHArt;
  const $ = (id) => document.getElementById(id);
  const DU_BASE = 432; // 대화창과 같은 du (dialog.js)
  const FACES = ['down', 'left', 'up', 'right']; // ←→로 도는 순서 (→ = 시계 방향)
  const st = { open: false, tab: 0, sel: 0, face: 'down', from: null, t0: 0, raf: 0, log: [], lastPick: {} };
  const W = { now: () => Date.now() };
  let el = null;

  const lines = () => ((root.PH_LINES || {}).ui || {}).wardrobe || {};
  function line(key) { // 묶음에서 하나 (바로 앞 줄 제외)
    const v = lines()[key]; const arr = Array.isArray(v) ? v : v ? [v] : [];
    if (!arr.length) return '';
    let i = Math.floor(Math.random() * arr.length);
    if (arr.length > 1 && i === st.lastPick[key]) i = (i + 1) % arr.length;
    st.lastPick[key] = i; return arr[i];
  }

  // ---- 틀 ----
  function build() {
    if (el) return el;
    const stage = $('stage'); if (!stage) return null;
    el = document.createElement('div');
    el.id = 'wd'; el.className = 'wd'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '옷 갈아입기');
    el.innerHTML = `<div class="wd-box" tabindex="-1">
      <div class="wd-left">
        <div class="wd-mirror"><canvas class="wd-pv" width="44" height="66" aria-label="지금 차림"></canvas></div>
        <div class="wd-turn"><button type="button" class="wd-rot" data-d="-1" aria-label="왼쪽으로 돌기">◀</button><span class="wd-face"></span><button type="button" class="wd-rot" data-d="1" aria-label="오른쪽으로 돌기">▶</button></div>
      </div>
      <div class="wd-main">
        <div class="wd-tabs" role="tablist"></div>
        <div class="wd-list" role="listbox"></div>
        <p class="wd-say"><b class="wd-name"></b><span class="wd-line" aria-live="polite"></span></p>
        <div class="wd-esc" aria-hidden="true"></div>
      </div></div>`;
    stage.appendChild(el);
    q('.wd-name').textContent = ((root.PH_DIALOG_LINES || {}).name) || '두부';
    q('.wd-esc').textContent = C.KEYS_HINT;
    const tabs = q('.wd-tabs');
    C.TABS.forEach((t, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'wd-tab'; b.setAttribute('role', 'tab'); b.dataset.slot = t.slot; b.textContent = t.label;
      b.addEventListener('click', (e) => { e.stopPropagation(); setTab(i); });
      tabs.appendChild(b);
    });
    el.querySelectorAll('.wd-rot').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); turn(Number(b.dataset.d)); }));
    el.addEventListener('mousedown', (e) => { if (e.target === el) { e.preventDefault(); close(); } }); // 박스 밖(어두운 곳)을 누르면 닫힘
    const cv = $('cv');
    if (cv && root.ResizeObserver) new ResizeObserver(fit).observe(cv);
    root.addEventListener('resize', fit);
    O.onChange(() => { if (st.open) { paintList(); drawPreview(true); } });
    return el;
  }
  const q = (s) => el.querySelector(s);
  function fit() {
    if (!el) return;
    const cv = $('cv'), h = cv ? cv.getBoundingClientRect().height : 0;
    if (h > 0) el.style.setProperty('--du', (h / DU_BASE) + 'px');
    // 미리보기 = 거울 한 장 (갈색 베젤 + 유리 + 마룻바닥 + 플레이어). 거울 칸을 정수 배율 픽셀로 채움 (제작자 2026-10-05)
    const box = q('.wd-mirror'), pv = q('.wd-pv'); if (!box || !pv) return;
    const r = box.getBoundingClientRect(), dpr = root.devicePixelRatio || 1;
    if (!(r.width > 0 && r.height > 0)) return;
    const k = Math.max(1, Math.round(r.height * dpr / MIR.h));
    const mh = Math.max(MIR.minH, Math.floor(r.height * dpr / k)), mw = Math.min(Math.floor(r.width * dpr / k), Math.round(mh * MIR.aspect));
    st.mir = { w: mw, h: mh }; st.pvKey = null;
    pv.style.width = (mw * k / dpr) + 'px'; pv.style.height = (mh * k / dpr) + 'px';
    st.pvScale = k;
  }

  // ---- 거울 그림 (픽셀 단위로 직접 칠함: 먹색 테두리 1 + 베젤 3 + 안쪽 선 1 + 유리, 아래쪽은 마룻바닥) ----
  const MIR = { h: 66, minH: 52, aspect: 0.66, floor: 0.64, feet: 0.84 }; // floor = 바닥 시작, feet = 발 위치 (거울 높이 비율)
  const MC = { line: '#29262F', hi: '#B9875A', bez: '#93613D', lo: '#6B4429', inner: '#4A2F20',
    glass: '#EADFC8', glassLo: '#E1D3B8', shine: '#F7F0E1', base: '#86593A', wood: '#CC9F72', woodHi: '#DAB083', seam: '#A97B51', shadow: '#9C7250' };
  function mirrorBg(w, h) {
    const key = w + 'x' + h; if (st.mirBg && st.mirBg.key === key) return st.mirBg.c;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
    const cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2;
    const inside = (x, y, t) => { const a = rx - t, b = ry - t; if (a <= 0 || b <= 0) return false; const dx = (x + 0.5 - cx) / a, dy = (y + 0.5 - cy) / b; return dx * dx + dy * dy <= 1; };
    const fy = Math.round(h * MIR.floor), plank = 4;
    const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    const pal = {}; Object.keys(MC).forEach((n) => { pal[n] = hex(MC[n]); });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!inside(x, y, 0)) continue;
      let t = 1; while (t < 5 && inside(x, y, t)) t++; // t = 가장자리에서 몇 칸 안쪽인지 (1 = 맨 바깥)
      let col;
      if (t === 1) col = 'line';
      else if (t <= 3) { // 베젤: 왼쪽 위가 밝고 오른쪽 아래가 어두움
        const d = ((x + 0.5 - cx) / rx + (y + 0.5 - cy) / ry);
        col = d < -0.55 ? 'hi' : d > 0.55 ? 'lo' : 'bez';
        if (t === 2 && col === 'bez' && d < 0) col = 'hi';
      } else if (t === 4) col = 'inner';
      else if (y < fy) { // 유리 (벽 비침) + 오른쪽 위 빛줄 두 개
        col = y >= fy - 2 ? 'glassLo' : 'glass';
        const u = x - Math.round(w * 0.62) + (y - Math.round(h * 0.14));
        if (y < h * 0.45 && (u === 0 || u === 1 || u === 4)) col = 'shine';
      } else if (y === fy) col = 'base'; // 걸레받이 선
      else { // 마룻바닥: 가로 널 + 엇갈린 이음매
        const row = Math.floor((y - fy - 1) / plank), ry2 = (y - fy - 1) % plank;
        if (ry2 === plank - 1) col = 'seam';
        else if (((x + row * 7) % 17) === 0) col = 'seam';
        else col = ry2 === 0 ? 'woodHi' : 'wood';
      }
      const p = (y * w + x) * 4, v = pal[col]; img.data[p] = v[0]; img.data[p + 1] = v[1]; img.data[p + 2] = v[2]; img.data[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    st.mirBg = { key, c }; return c;
  }

  // ---- 칸 ----
  const tabConf = () => C.TABS[st.tab];
  function cells() {
    const t = tabConf(), out = [];
    if (t.none) out.push({ slot: t.slot, num: null, label: C.NONE_LABEL });
    Object.keys(C.ITEMS[t.slot] || {}).map(Number).sort((a, b) => a - b).forEach((n) => out.push({ slot: t.slot, num: n, label: C.ITEMS[t.slot][n] }));
    // 표에 없는 번호의 그림이 오면 그것도 (그림 파일 label)
    Object.values((root.PH_OUTFITS || {}).items || {}).filter((it) => it.slot === t.slot && !(C.ITEMS[t.slot] || {})[it.num])
      .sort((a, b) => a.num - b.num).forEach((it) => out.push({ slot: t.slot, num: it.num, label: it.label || (t.label + ' ' + it.num) }));
    return out.map((c) => Object.assign(c, {
      ok: O.available(O.state, c.slot, c.num), on: c.num == null ? O.state[c.slot] == null : O.isWorn(O.state, c.slot, c.num),
      title: c.num != null && root.PH_OUTFITS && root.PH_OUTFITS.items[c.slot + '_' + c.num] ? root.PH_OUTFITS.items[c.slot + '_' + c.num].label : '',
    }));
  }
  function paintTabs() {
    el.querySelectorAll('.wd-tab').forEach((b, i) => { const on = i === st.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
  }
  function paintList() {
    const list = q('.wd-list'), cs = cells();
    st.sel = Math.max(0, Math.min(st.sel, cs.length - 1));
    list.innerHTML = '';
    cs.forEach((c, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'wd-cell'; b.setAttribute('role', 'option');
      b.dataset.slot = c.slot; b.dataset.num = c.num == null ? '' : String(c.num);
      b.classList.toggle('sel', i === st.sel); b.classList.toggle('worn', c.on); b.classList.toggle('off', !c.ok);
      b.setAttribute('aria-selected', c.on ? 'true' : 'false'); b.setAttribute('aria-disabled', c.ok ? 'false' : 'true');
      if (c.title) b.title = c.title;
      const th = document.createElement('span'); th.className = 'wd-thumb';
      const img = c.num != null && c.ok ? O.thumb(c.slot, c.num) : null;
      if (img) { const k = Math.max(1, Math.min(4, Math.floor(16 / Math.max(img.width, img.height) * 2) || 1)); img.className = 'wd-ti'; img.style.setProperty('--tw', img.width); img.style.setProperty('--th', img.height); img.dataset.k = k; th.appendChild(img); }
      else if (c.num == null) th.classList.add('none');
      const lab = document.createElement('span'); lab.className = 'wd-lab'; lab.textContent = c.label;
      b.append(th, lab);
      if (!c.ok) { const n = document.createElement('span'); n.className = 'wd-wait'; n.textContent = C.NOT_READY; b.appendChild(n); }
      else if (c.on) { const n = document.createElement('span'); n.className = 'wd-mark'; n.textContent = C.WEARING; b.appendChild(n); }
      b.addEventListener('click', (e) => { e.stopPropagation(); st.sel = i; choose(); });
      b.addEventListener('mouseenter', () => { st.sel = i; el.querySelectorAll('.wd-cell').forEach((x, j) => x.classList.toggle('sel', j === i)); });
      list.appendChild(b);
    });
    const cur = list.children[st.sel]; if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }
  function setTab(i) {
    st.tab = (i + C.TABS.length) % C.TABS.length;
    const cs = cells(), w = cs.findIndex((c) => c.on); st.sel = w >= 0 ? w : 0; // 탭을 바꾸면 입는 칸에 커서
    paintTabs(); paintList();
  }
  function say(text) { if (!text) return; q('.wd-line').textContent = text; st.log.push(text); }
  async function choose() {
    const c = cells()[st.sel]; if (!c) return;
    if (!c.ok) { say(line('notReady')); return; }
    if (c.on) { say(line('same')); return; }
    const saved = await Promise.resolve(O.pick(c.slot, c.num)); // 집 안 플레이어·미리보기는 onChange로 바로 바뀜
    st.lastChoice = { slot: c.slot, num: c.num, saved };
    say(saved === false ? line('saveFail') : line(c.num == null ? 'none' : (c.slot === 'onepiece' ? 'onepiece' : 'pick')));
  }
  function turn(d) { const i = FACES.indexOf(st.face); st.face = FACES[(i + d + FACES.length) % FACES.length]; drawPreview(true); }

  // ---- 미리보기 (정면은 숨쉬기 2장, 옆·뒤는 선 자세 = 걷기 1번 장) ----
  function previewAnim() { return st.face === 'down' ? { anim: 'idle', fi: Math.floor((performance.now() - st.t0) / 500) % Math.max(1, O.frameCount('idle')) } : { anim: 'walk_' + st.face, fi: 1 }; }
  function drawPreview(force) {
    const pv = q('.wd-pv'), sz = O.size(); if (!pv) return;
    const { anim, fi } = previewAnim(), key = anim + fi + ':' + O.ver;
    if (!force && key === st.pvKey) return;
    st.pvKey = key;
    if (!st.mir) fit(); const m = st.mir; if (!m) return;
    if (pv.width !== m.w || pv.height !== m.h) { pv.width = m.w; pv.height = m.h; }
    const ctx = pv.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, pv.width, pv.height);
    ctx.drawImage(mirrorBg(m.w, m.h), 0, 0);
    // 발밑 그림자 + 플레이어 (그림 아래 가운데 = 발, 바닥 위에 서 있게)
    const feet = Math.round(m.h * MIR.feet), x0 = Math.round((m.w - sz.w) / 2);
    ctx.fillStyle = MC.shadow; ctx.fillRect(x0 + Math.round(sz.w * 0.22), feet - 1, Math.round(sz.w * 0.56), 2); ctx.fillRect(x0 + Math.round(sz.w * 0.3), feet + 1, Math.round(sz.w * 0.4), 1);
    const fr = O.previewFrame(anim, fi); if (fr) ctx.drawImage(fr, x0, feet - sz.h);
    q('.wd-face').textContent = (C.FACES || {})[st.face] || st.face;
  }
  function loop() { if (!st.open) return; drawPreview(false); st.raf = requestAnimationFrame(loop); }

  // ---- 열기·닫기 ----
  function blockedNow() {
    const g = root.PHGame && root.PHGame.G;
    return !g || g.mode !== 'play' || !g.active || !!g.dialog || (root.PHDialog && root.PHDialog.isOpen());
  }
  // interact.js가 부름 (옷장·거울). s = 누른 곳
  function openFrom(s) {
    if (!O.enabled()) { // v08·v09
      const text = line('cannot');
      st.lastCannot = { type: s && s.type, text, at: W.now() };
      if (root.PHGame && root.PHGame.bubble) root.PHGame.bubble('dubu', text, { tag: 'obj:' + (s ? s.id : 'wardrobe') });
      return false;
    }
    return open(s ? s.type : null);
  }
  function open(from) {
    if (st.open || !O.enabled()) return false;
    build(); if (!el) return false;
    const g = root.PHGame && root.PHGame.G; if (g) g.held = []; // 누르던 방향키가 남아 걷지 않게
    if (root.PHGame && root.PHGame.hideBubble) root.PHGame.hideBubble();
    st.open = true; st.from = from || null; st.face = 'down'; st.t0 = performance.now(); st.pvKey = null; st.opened = (st.opened || 0) + 1;
    el.hidden = false; fit();
    setTab(st.tab || 0);
    q('.wd-line').textContent = ''; say(line('open'));
    drawPreview(true);
    el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
    q('.wd-box').focus({ preventScroll: true });
    cancelAnimationFrame(st.raf); st.raf = requestAnimationFrame(loop);
    return true;
  }
  function close() {
    if (!st.open) return;
    st.open = false; el.hidden = true; cancelAnimationFrame(st.raf);
    const stage = $('stage'); if (stage) stage.focus({ preventScroll: true });
  }

  // ---- 키 (window 잡기 단계: 열려 있으면 집·대화창보다 먼저 받고 막음) ----
  function onKey(e) {
    if (!st.open) return;
    const k = e.key;
    e.stopPropagation();
    if (k === 'Escape') { e.preventDefault(); close(); return; }
    if (k === 'Tab') { e.preventDefault(); setTab(st.tab + (e.shiftKey ? -1 : 1)); return; }
    if (k === 'q' || k === 'Q' || k === 'ㅂ') { e.preventDefault(); setTab(st.tab - 1); return; }
    if (k === 'e' || k === 'E' || k === 'ㄷ') { e.preventDefault(); setTab(st.tab + 1); return; }
    if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); const n = cells().length; st.sel = (st.sel + (k === 'ArrowUp' ? -1 : 1) + n) % n; paintList(); return; }
    if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); turn(k === 'ArrowLeft' ? -1 : 1); return; }
    if (k === 'Enter' || k === ' ') { e.preventDefault(); if (!e.repeat) choose(); return; }
    // 그 밖의 키는 집으로 안 넘김 (창이 열려 있는 동안)
  }
  function onKeyUp(e) { if (st.open) e.stopPropagation(); }
  root.addEventListener('keydown', onKey, true);
  root.addEventListener('keyup', onKeyUp, true);

  function state() {
    const cs = el && st.open ? cells() : [];
    return { open: st.open, enabled: O.enabled(), set: root.PH_ART_SET, from: st.from, tab: C.TABS[st.tab].slot, sel: st.sel, face: st.face, outfit: Object.assign({}, O.state),
      cells: cs.map((c) => ({ num: c.num, label: c.label, ok: c.ok, on: c.on })), line: el ? q('.wd-line').textContent : '', log: st.log.slice(), lastCannot: st.lastCannot || null,
      lastChoice: st.lastChoice || null, opened: st.opened || 0, pvScale: st.pvScale || 0, lastSave: O.lastSave || null };
  }
  Object.assign(W, { openFrom, open, close, isOpen: () => st.open, state, build, fit, blockedNow });
  root.PHWardrobe = W;
  if (document.readyState !== 'loading') build(); else document.addEventListener('DOMContentLoaded', build);
})(window);
