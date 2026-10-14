// 정수기 물 기록 창 (2026-10-03 제작자 요청, 비트). 주방 정수기(layout 물건 purifier)를 클릭하거나 옆에서 Space -> 집 화면 위 작은 창.
//   사이드바 탭은 안 바뀜. 모양 = 하단 대화창(css/dialog.css)과 같은 결 (둥근 베이지 박스, 먹색 테두리, du 단위). css/water_modal.css
//   안: 물 6칸 컵 (생활 습관 탭과 같은 규칙: k번째 컵 = k잔, 채워진 마지막 컵을 다시 누르면 한 잔 빠짐), "오늘 n/6", 두부 한 줄
//   저장 = PHDesktop.setWater (물컵과 같은 메인 처리: 오늘 줄만, 백업, 충돌이면 안 씀). 물 화분 단계는 interact.js가 PHLife.data를 보고 바로 바꿈
// 키: 1~6 = 그 컵 / ←→ = 컵 옮기기 / Enter·Space = 지금 컵 / Esc = 닫기. 바깥(어두운 곳) 클릭 = 닫기
//   열려 있는 동안 집 조작(걷기·Space·물건)은 막음: window 잡기 단계에서 키를 먼저 받고, 창 뒤 판이 집 그림을 덮어 클릭을 받음 (옷장 창과 같은 방식)
(function (root) {
  'use strict';
  const S = root.PH_SETTINGS, Md = root.PHLifeMd;
  const $ = (id) => document.getElementById(id);
  const DU_BASE = 432;
  const st = { open: false, from: null, sel: 0, busy: false, log: [], opened: 0 };
  const WM = { now: () => Date.now() };
  let el = null;
  const UI = () => (root.PH_LINES && root.PH_LINES.ui) || {};
  const q = (s) => el.querySelector(s);

  function build() {
    if (el) return el;
    const stage = $('stage'); if (!stage) return null;
    el = document.createElement('div');
    el.id = 'wm'; el.className = 'wm'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '물 기록');
    el.innerHTML = `<div class="wm-box" tabindex="-1">
      <div class="wm-head"><b class="wm-title"></b><span class="wm-count" aria-live="polite"></span><span class="wm-esc" aria-hidden="true"></span></div>
      <div class="wm-cups" role="group" aria-label="물 칸 (눌러서 체크)"></div>
      <p class="wm-say"><b class="wm-name"></b><span class="wm-line" aria-live="polite"></span></p></div>`; // 키 안내 = 머리 줄 오른쪽 (D4 ⑥), 오늘 n/6 은 이름 옆
    stage.appendChild(el);
    const PL = (root.PH_LINES && root.PH_LINES.uiPlain && root.PH_LINES.uiPlain.waterModal) || {};
    q('.wm-title').textContent = PL.title || '물';
    q('.wm-name').textContent = ((root.PH_DIALOG_LINES || {}).name) || '두부';
    q('.wm-esc').textContent = PL.keys || '1~6 · ←→ · Enter · Esc 닫기';
    el.addEventListener('mousedown', (e) => { if (e.target === el) { e.preventDefault(); close(); } });
    const cv = $('cv');
    if (cv && root.ResizeObserver) new ResizeObserver(fit).observe(cv);
    root.addEventListener('resize', fit);
    return el;
  }
  function fit() { if (!el) return; const cv = $('cv'), h = cv ? cv.getBoundingClientRect().height : 0; if (h > 0) el.style.setProperty('--du', (h / DU_BASE) + 'px'); }

  // 오늘 물 { n, of, row } (물컵과 같은 "오늘" = 하루 경계 DAY_START_HOUR)
  function waterNow() {
    const d = root.PHLife && root.PHLife.data; if (!d) return null;
    const habit = S.WATER_HABIT || '물', row = d.habits && d.habits.rows.find((r) => r.name === habit && r.slots > 0);
    const last = Md.latestSlots(d.records, habit, WM.now(), S.DAY_START_HOUR);
    return { n: last && last.isToday ? last.value : 0, of: row ? row.slots : 6, row: !!row };
  }
  function paint() {
    const w = waterNow() || { n: 0, of: 6, row: false }, box = q('.wm-cups');
    if (box.children.length !== w.of) {
      box.innerHTML = '';
      for (let i = 1; i <= w.of; i++) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'wm-cup'; b.dataset.k = i;
        b.addEventListener('click', (e) => { e.stopPropagation(); st.sel = i - 1; press(i); });
        box.appendChild(b);
      }
    }
    [...box.children].forEach((b, i) => {
      const k = i + 1, on = k <= w.n;
      b.classList.toggle('on', on); b.classList.toggle('sel', i === st.sel);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', `물 ${k}잔${k === w.n ? ' (다시 누르면 한 잔 빠져요)' : ''}`);
    });
    q('.wm-count').textContent = `${w.n}/${w.of}`; // 이름(오늘 물) 바로 옆이라 "오늘" 뺌 (D4 ⑥, 전엔 오른쪽 끝 "오늘 n/6")
    el.dataset.n = w.n;
  }
  function say(text) { if (!text) return; q('.wm-line').textContent = text; st.log.push(text); }
  const pick = (list) => { const a = Array.isArray(list) ? list : list ? [list] : []; return a[Math.floor(Math.random() * a.length)] || ''; };

  // k번째 컵: 지금 k잔이면 k-1 (되돌리기), 아니면 k. 화면은 저장 뒤 다시 그림
  async function press(k) {
    if (st.busy) return;
    const L = UI().water || {}, Life = root.PHLife, api = root.PHDesktop && root.PHDesktop.setWater ? root.PHDesktop : null;
    if (!api || !Life) { say(UI().browserOnly); return; }
    st.busy = true;
    try {
      if (!Life.data) await Life.load();
      const w = waterNow(); if (!w || !w.row) { say(L.fail); return; }
      const next = k === w.n ? k - 1 : k, IX = root.PHInteract, stage = (n) => (IX && IX.stageOf ? IX.stageOf(n) : null);
      const res = await api.setWater(next, Life.lastModified);
      Life.data = Md.parse(res.text); Life.lastModified = res.lastModified; Life.readAt = Date.now();
      if (res.conflict) { paint(); say(L.conflict); return; }
      st.last = { value: next, of: w.of, date: res.date, line: res.line };
      paint();
      // 두부 한 줄: 6칸 = full / 늘었고 화분 단계가 바뀌는 순간 = plant.grow·bloom (싱크대와 같음) / 늘면 up / 줄면 down
      const before = stage(w.n), after = stage(next), P = root.PH_INTERACT_LINES && root.PH_INTERACT_LINES.plant;
      if (next === w.of) say(L.full);
      else if (next > w.n && after && after !== before && P && P[after]) say(pick(P[after]).replace(/^\([^)]*\)\s*/, ''));
      else say(next > w.n ? L.up : next < w.n ? L.down : '');
    } catch (e) { st.lastError = String(e && e.message || e); say((UI().water || {}).fail); }
    finally { st.busy = false; }
  }

  function blockedNow() {
    const g = root.PHGame && root.PHGame.G;
    return !g || g.mode !== 'play' || !g.active || !!g.dialog || (root.PHDialog && root.PHDialog.isOpen()) || (root.PHWardrobe && root.PHWardrobe.isOpen()) || (root.PHBookModal && root.PHBookModal.isOpen()) || ['PHRecordModal', 'PHBucketMemo'].some((k) => root[k] && root[k].isOpen && root[k].isOpen());
  }
  // interact.js가 부름 (정수기). from = 누른 물건 type
  async function open(from) {
    if (st.open || blockedNow()) return false;
    build(); if (!el) return false;
    const g = root.PHGame && root.PHGame.G; if (g) g.held = []; // 누르던 방향키가 남아 걷지 않게
    if (root.PHGame && root.PHGame.hideBubble) root.PHGame.hideBubble();
    st.open = true; st.from = from || null; st.opened++;
    if (root.PHLife && !root.PHLife.data) await root.PHLife.load();
    const w = waterNow(); st.sel = Math.min(Math.max(0, (w ? w.n : 0)), ((w && w.of) || 6) - 1); // 다음에 채울 컵에 커서
    el.hidden = false; fit(); paint();
    q('.wm-line').textContent = ''; say(pick(UI().waterModal && UI().waterModal.open));
    el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
    q('.wm-box').focus({ preventScroll: true });
    return true;
  }
  function close() {
    if (!st.open) return;
    st.open = false; el.hidden = true;
    const stage = $('stage'); if (stage) stage.focus({ preventScroll: true });
  }
  function onKey(e) {
    if (!st.open) return;
    const k = e.key; e.stopPropagation();
    if (k === 'Escape') { e.preventDefault(); close(); return; }
    const n = q('.wm-cups').children.length;
    if (/^[1-9]$/.test(k) && Number(k) <= n) { e.preventDefault(); if (!e.repeat) { st.sel = Number(k) - 1; press(Number(k)); } return; }
    if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); st.sel = (st.sel + (k === 'ArrowLeft' ? -1 : 1) + n) % n; paint(); return; }
    if (k === 'Enter' || k === ' ') { e.preventDefault(); if (!e.repeat) press(st.sel + 1); return; }
    if (k !== 'Tab') e.preventDefault(); // 그 밖의 키는 집으로 안 넘김
  }
  function onKeyUp(e) { if (st.open) e.stopPropagation(); }
  root.addEventListener('keydown', onKey, true);
  root.addEventListener('keyup', onKeyUp, true);

  function state() {
    const cups = el ? [...el.querySelectorAll('.wm-cup')].map((b) => b.classList.contains('on')) : [];
    return { open: st.open, from: st.from, sel: st.sel, busy: st.busy, cups, count: el ? q('.wm-count').textContent : '', line: el ? q('.wm-line').textContent : '', log: st.log.slice(), last: st.last || null, opened: st.opened, lastError: st.lastError || null };
  }
  Object.assign(WM, { open, close, isOpen: () => st.open, state, build, fit, press });
  root.PHWaterModal = WM;
})(window);
