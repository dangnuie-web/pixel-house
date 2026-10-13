// 잠 기록하기 창 = 형광펜 칠하기 (2026-10-09 비트, 무늬 시안 v01 4절 = 제작자 2026-10-09 승인)
//   여는 곳: 생활일지 잠 탭(고른 줄·기록하기·고치기·두 번 누르기·Enter), 생활 습관 "기록" 카드 잠 줄(오늘), 집 침대(아침·낮 띠, 오늘. js/interact.js bedClose)
//   띠 하나 = 깬 날 줄 (전날 18시 ~ 그날 18시), 30분 칸 48개. 펜 잠·선잠·지우개(1·2·3). 끌면 범위 미리보기(펜 50% + "23:00 ~ 07:00" 말풍선), 손을 떼면 확정
//   이미 같은 펜으로 칠한 칸에서 누르기 시작하면 그 범위를 지움(붉은 빗금 미리보기). "지금" 뒤는 못 칠함(빗금)
//   칠하기는 칸 단위지만 손대지 않은 구간의 분은 그대로 (분 칸 1440개로 들고 있음, js/sleep_calc.js). 분은 아래 목록 시각 칸(5분 단위)으로 고침
//   잔 시각만·깬 시각만 줄(open): 사라지는 펜 + 목록 맨 아래 줄. 칠한 잠이 덮거나 앞뒤 60분 안에서 시작하면 "바뀌어요" 미리 알림, 저장 때 지움. [지우기]로도 지움
//   저장 = PHDesktop.setSleepWindow(전날 18:00, 24, 구간, 읽은 시각, 지울 open 줄) (메인 ph:setSleepWindow: conflict·값 검사·사본·창 밖 그대로 검사)
//   모양 = 대변·식사 기록 창(#lm)과 같은 결 (css/logs.css .lm-*), 너비만 min(720px, 100%). css/sleep.css
//   키: Esc 닫기, ⌘Enter 저장, Tab은 창 안에서만, 1·2·3 펜, 띠에서 ← → 칸 이동·Shift+← → 이어 칠하기·Space/Enter 칠하기·Backspace/Delete 지우기·Home/End
//   문구 = js/data/sleep_lines.js (부기 원고 자리)
(function (root) {
  'use strict';
  const S = root.PH_SETTINGS, SC = root.PHSleepCalc, LL = root.PHLifeLog, LT = root.PHLogTable, Md = root.PHLifeMd;
  if (!SC || !LL) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const modKeys = (t) => (root.PHPlatform ? root.PHPlatform.mac : /Mac/.test((root.navigator || {}).platform || '')) ? t : String(t || '').replace(/⌘/g, 'Ctrl+'); // 단축키 글: 윈도우 Ctrl+ (C1, js/log_modal.js 와 같음)
  const U = () => (root.PH_LINES && root.PH_LINES.uiPlain && root.PH_LINES.uiPlain.sleep) || {}; // 화면 글
  const UP = () => (root.PH_LINES && root.PH_LINES.ui && root.PH_LINES.ui.sleep) || {};          // 펫 말
  const fill = (t, v) => String(t == null ? '' : t).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));
  const SV = () => root.PHSleepView;
  const nowMs = () => (root.PHLife && root.PHLife.now ? root.PHLife.now() : Date.now());
  const PENS = { 1: 2, 2: 1, 3: 0 }; // 키 -> 펜 값 (2 잠, 1 선잠, 0 지우개)
  const st = { open: false, date: null, from: null, band: null, arr: null, pen: 2, cur: null, drag: null, hov: null, memo: '', memoInit: '', orig: [], opens: [], drop: [], had: false, busy: false, err: '', opened: 0, log: [], line: '' };
  let el = null;
  const q = (s) => el.querySelector(s);
  const limit = () => SC.nowIn(st.date, nowMs()); // 지금 줄이면 지금(분), 아니면 null
  const maxCell = () => { const l = limit(); return l == null ? 1440 / SC.CELL - 1 : Math.max(0, Math.floor((l - 1) / SC.CELL)); };
  const lastPick = {};
  function pick(list, k) { if (!Array.isArray(list)) return list || ''; if (list.length < 2) return list[0] || ''; const c = list.filter((t) => t !== lastPick[k]); const t = c[Math.floor(Math.random() * c.length)]; lastPick[k] = t; return t; }

  function build() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'slm'; el.className = 'lm slm'; el.hidden = true;
    el.innerHTML = '<div class="lm-box slm-box" role="dialog" aria-modal="true" aria-labelledby="slm-title" tabindex="-1"></div>';
    document.body.appendChild(el);
    el.addEventListener('mousedown', (e) => { if (e.target === el) { e.preventDefault(); if (!st.busy) close(); } });
    el.addEventListener('keydown', (e) => {
      e.stopPropagation(); // 집(document 듣기)으로 안 넘김
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape') { e.preventDefault(); if (st.drag) { st.drag = null; strokes(); return; } if (!st.busy) close(); return; }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); return; }
      if (e.key === 'Tab') { trapTab(e); return; }
      const inInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
      if (!inInput && !e.metaKey && !e.ctrlKey && !e.altKey && PENS[e.key] != null) { e.preventDefault(); setPen(PENS[e.key], true); return; }
      const grp = e.target.closest && e.target.closest('[role="radiogroup"]');
      if (grp && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const list = [...grp.querySelectorAll('[role="radio"]')], i = list.indexOf(e.target); if (i < 0) return;
        e.preventDefault(); const n = list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length]; setPen(Number(n.dataset.pen), false); q(`.slm-pen[data-pen="${n.dataset.pen}"]`).focus();
      }
    });
    el.addEventListener('keyup', (e) => e.stopPropagation());
    return el;
  }
  function trapTab(e) {
    const f = [...el.querySelectorAll('button, input, [tabindex="0"]')].filter((x) => !x.disabled && x.offsetParent !== null && x.tabIndex !== -1);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }

  // ---- 읽기: 그날(깬 날) 줄 ----
  function load(date) {
    const L = root.PHLife, text = L && L.data ? L.data.lines : [];
    const w = SC.day(text, date);
    st.date = date; st.arr = SC.arrFrom(w.merged); st.orig = w.merged.map((s) => ({ a: s.a, b: s.b, light: s.light, memo: s.memo || '' }));
    st.opens = w.open.map((o) => ({ at: o.at, t: o.a, side: o.side, memo: o.memo || '' }));
    st.drop = []; st.had = w.merged.length > 0 || w.open.length > 0;
    const memos = [...new Set(w.segments.map((s) => s.memo).concat(w.open.map((o) => o.memo)).filter(Boolean))];
    st.memo = st.memoInit = memos.join(' · ');
    st.cur = null; st.drag = null; st.hov = null; st.err = '';
  }

  // ---- 그리기 ----
  const P = (p, extra) => SV().pen(p, extra);
  function stripHours() {
    let h = '';
    for (let m = 0; m <= 1440; m += 120) { const c = ((m + SC.H * 60) % 1440) / 60; h += `<span class="${c === 0 ? 'mid' : ''} ${m % 240 ? 'h2' : ''}" style="left:${(m / 14.4).toFixed(4)}%">${c}</span>`; }
    return h;
  }
  function paint(focus) {
    const u = U().lm, d = st.date, nr = SC.rowOfMs(nowMs());
    const pens = [[2, u.pens.sleep, '1', SV().swatch(false, 5)], [1, u.pens.doze, '2', SV().swatch(true, 4)], [0, u.pens.eraser, '3', '<span class="eraser" aria-hidden="true"></span>']];
    q('.lm-box').innerHTML = `<div class="lm-head"><b class="lm-title" id="slm-title">${esc(st.had ? u.titleEdit : u.titleNew)}</b><span class="lm-keys" aria-hidden="true">${esc(modKeys(u.keys))}</span></div>` +
      `<p class="lm-say"><b class="lm-name">${esc((root.PH_DIALOG_LINES || {}).name || '두부')}</b><span class="lm-line" aria-live="polite">${esc(st.line)}</span></p>` +
      `<div class="lm-row"><span class="lm-lab">${esc(u.date)}</span><span class="slm-daynav"><button type="button" class="slm-prev" aria-label="${esc(u.datePrev)}" data-focus="slm-prev">◀</button><b class="slm-day">${esc(fill(u.dateText, SV().dv(d)))}</b>` +
      `<button type="button" class="slm-next" aria-label="${esc(u.dateNext)}" ${d >= nr ? 'disabled' : ''} data-focus="slm-next">▶</button></span><span class="slm-hint">${esc(SV().spanText(d, 'lm.dateHint'))}</span></div>` +
      `<div class="lm-row"><span class="lm-lab" id="slm-pen-lab">${esc(u.pen)}</span><span class="slm-pens" role="radiogroup" aria-label="${esc(u.pensAria)}">` +
      pens.map(([k, label, key, sw]) => `<button type="button" class="lm-pick slm-pen ${st.pen === k ? 'on' : ''}" role="radio" aria-checked="${st.pen === k}" tabindex="${st.pen === k ? 0 : -1}" data-pen="${k}" data-focus="slm-pen:${k}">${sw}${esc(label)}<kbd>${key}</kbd></button>`).join('') + '</span></div>' +
      `<div class="slm-strip-wrap"><div class="slm-strip-hours" aria-hidden="true">${stripHours()}</div>` +
      `<div class="slm-strip" tabindex="0" role="slider" data-focus="slm-strip" aria-label="${esc(u.stripAria)}" aria-valuemin="0" aria-valuemax="${maxCell()}" aria-valuenow="0" aria-valuetext="">${SV().lines(30)}<div class="slm-strokes"></div></div>` +
      `<div class="slm-strip-days" aria-hidden="true"><span>${esc(u.stripPrev)}</span><span class="m" style="left:${(((24 - SC.H) * 60) / 14.4).toFixed(4)}%">${esc(u.stripThis)}</span></div></div>` +
      `<div class="lm-row top slm-segrow"><span class="lm-lab">${esc(u.segs)}</span><div class="slm-segbox"></div></div>` +
      `<label class="lm-row"><span class="lm-lab">${esc(u.memo)}</span><input class="slm-memo" maxlength="${LL.MAX_LEN}" autocomplete="off" placeholder="${esc(u.memoHolder)}" value="${esc(st.memo)}" data-focus="slm-memo"></label>` +
      `<p class="lm-err" role="alert">${esc(st.err)}</p>` +
      `<div class="lm-btns"><button type="button" class="lm-cancel" data-focus="slm-cancel">${esc(u.cancel)}</button><button type="button" class="lm-save" data-focus="slm-save">${esc(st.had ? u.saveEdit : u.save)}</button></div>`;
    strokes(); segs();
    q('.slm-prev').addEventListener('click', () => moveDay(-1));
    q('.slm-next').addEventListener('click', () => moveDay(1));
    el.querySelectorAll('.slm-pen').forEach((b) => b.addEventListener('click', () => setPen(Number(b.dataset.pen), true)));
    q('.lm-cancel').addEventListener('click', () => close());
    q('.lm-save').addEventListener('click', () => save());
    q('.slm-memo').addEventListener('input', (e) => { st.memo = e.target.value; });
    bindStrip();
    if (focus) { const x = [...el.querySelectorAll('[data-focus]')].find((y) => y.dataset.focus === focus); if (x) x.focus({ preventScroll: true }); }
  }
  function strokes() {
    const s = el && q('.slm-strokes'); if (!s) return;
    const u = U(), rs = SC.runs(st.arr), C = SC.CELL;
    let h = rs.map((r) => P(r)).join('');
    st.opens.forEach((o) => {
      if (st.drop.includes(o.at)) return;
      const p = o.side === 'bed' ? { a: o.t, b: Math.min(1440, o.t + SC.OPEN_LEN), open: 'bed' } : { a: Math.max(0, o.t - SC.OPEN_LEN), b: o.t, open: 'wake' };
      h += P(p, SC.covered(o, rs) ? 'ghost' : '');
    });
    if (st.drag) {
      const a = Math.min(st.drag.a, st.drag.b) * C, lim = limit(), b = Math.min((Math.max(st.drag.a, st.drag.b) + 1) * C, lim == null ? 1440 : lim);
      h += P({ a, b, light: st.drag.pen === 1 }, st.drag.pen === 0 ? 'erase' : 'ghost');
      h += `<span class="tip" style="left:${((a + b) / 2 / 14.4).toFixed(3)}%">${esc(fill(st.drag.pen === 0 ? u.tip.erase : u.tip.paint, { a: SC.clock(a), b: SC.clock(b) }))}</span>`;
    } else if (st.hovFuture != null) h += `<span class="tip future" style="left:${Math.min(92, Math.max(8, (st.hovFuture + 0.5) * C / 14.4)).toFixed(3)}%">${esc(u.tip.future)}</span>`;
    else if (st.hov != null) h += `<b class="hov" style="left:${(st.hov * C / 14.4).toFixed(4)}%;width:${(C / 14.4).toFixed(4)}%"></b>`;
    if (st.cur != null) h += `<b class="cur" style="left:${(st.cur * C / 14.4).toFixed(4)}%;width:${(C / 14.4).toFixed(4)}%"></b>`;
    const lim = limit(); if (lim != null) h += `<b class="sl-yet" style="left:${(lim / 14.4).toFixed(4)}%"></b><b class="sl-now" style="left:${(lim / 14.4).toFixed(4)}%" data-label="${esc(u.grid.now)}"></b>`;
    s.innerHTML = h;
    SV().dress(s);
    const strip = q('.slm-strip');
    if (strip) { strip.setAttribute('aria-valuenow', String(st.cur == null ? 0 : st.cur)); strip.setAttribute('aria-valuetext', st.cur == null ? '' : SC.clock(st.cur * C)); }
  }
  function segs() {
    const box = el && q('.slm-segbox'); if (!box) return;
    const u = U().lm, rs = SC.runs(st.arr);
    const chip = (p, label) => `<span class="sl-chip">${P(Object.assign({}, p, { a: 0, b: 1440 }))}<span class="t">${esc(label)}</span></span>`;
    const opens = st.opens.filter((o) => !st.drop.includes(o.at));
    const openHtml = opens.map((o) => `<li class="slm-seg open" data-at="${esc(o.at)}">${chip({ open: o.side, seed: 77 }, o.side === 'bed' ? u.open.chip : u.open.chipWake)}` +
      `<span class="lg-time">${esc(o.side === 'bed' ? fill(u.open.time, { a: SC.clock(o.t) }) : fill(u.open.timeWake, { b: SC.clock(o.t) }))}</span><span class="dur">${esc(SC.covered(o, rs) ? u.open.covered : u.open.keep)}</span>` +
      `<button type="button" class="x xo" data-at="${esc(o.at)}" data-focus="slm-xo:${esc(o.at)}">${esc(u.open.del)}</button></li>`).join('');
    const rowHtml = rs.map((r, i) => `<li class="slm-seg" data-i="${i}">${chip(r, SV().kindLabel(r))}` +
      `<input type="time" step="300" value="${SC.clock(r.a)}" data-i="${i}" data-e="a" aria-label="${esc(u.segStart)}" data-focus="slm-t:${i}a"> ~ <input type="time" step="300" value="${SC.clock(r.b)}" data-i="${i}" data-e="b" aria-label="${esc(u.segEnd)}" data-focus="slm-t:${i}b">` +
      `<span class="dur">${esc(SC.dur(r.b - r.a))}</span><button type="button" class="x" data-i="${i}" data-focus="slm-x:${i}">${esc(u.segDel)}</button></li>`).join('');
    box.innerHTML = rs.length || opens.length ? `<ul class="slm-segs">${rowHtml}${openHtml}</ul>` : `<p class="slm-none">${esc(u.segsNone)}</p>`;
    box.querySelectorAll('.xo').forEach((b) => b.addEventListener('click', () => { st.drop.push(b.dataset.at); strokes(); segs(); const n = q('.slm-segbox button, .slm-strip'); if (n) n.focus(); }));
    box.querySelectorAll('.x:not(.xo)').forEach((b) => b.addEventListener('click', () => { const r = rs[Number(b.dataset.i)]; if (!r) return; for (let t = r.a; t < r.b; t++) st.arr[t] = 0; strokes(); segs(); const n = q('.slm-segbox button') || q('.slm-strip'); if (n) n.focus(); }));
    box.querySelectorAll('input[type=time]').forEach((inp) => inp.addEventListener('change', () => {
      const r = rs[Number(inp.dataset.i)]; if (!r) return;
      const E = U().err, x = SC.clockToMin(inp.value), lim = limit(), back = () => { inp.value = SC.clock(inp.dataset.e === 'a' ? r.a : r.b); };
      if (x == null) { back(); return; }
      const xx = inp.dataset.e === 'b' && x === 0 ? 1440 : x;
      if (lim != null && xx > lim) { showErr(E.future); back(); return; }
      if (inp.dataset.e === 'b' ? xx <= r.a : xx >= r.b) { showErr(E.timeOrder); back(); return; }
      showErr('');
      if (SC.setEdge(st.arr, r, inp.dataset.e, inp.value, lim)) { strokes(); segs(); const n = q(`[data-focus="slm-t:${inp.dataset.i}${inp.dataset.e}"]`); if (n) n.focus(); }
    }));
  }
  function setPen(k, focusStrip) {
    if (st.pen !== k) { st.line = pick(UP().say.pen[{ 2: 'sleep', 1: 'doze', 0: 'eraser' }[k]], 'pen' + k); const l = el && q('.lm-line'); if (l) l.textContent = st.line; } // 펜을 바꾸면 그 펜 줄로 한 번 (부기 2-4)
    st.pen = k;
    el.querySelectorAll('.slm-pen').forEach((b) => { const on = Number(b.dataset.pen) === k; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
    if (focusStrip) { const s = q('.slm-strip'); if (s) s.focus(); }
  }
  function moveDay(k) {
    const nd = SC.addDays(st.date, k); if (nd > SC.rowOfMs(nowMs())) return;
    readMemo(); load(nd); st.line = firstLine({});
    paint(k < 0 ? 'slm-prev' : (nd >= SC.rowOfMs(nowMs()) ? 'slm-prev' : 'slm-next'));
  }
  function readMemo() { const m = el && q('.slm-memo'); if (m) st.memo = m.value; }
  function bindStrip() {
    const s = q('.slm-strip'), N = 1440 / SC.CELL;
    const cellAt = (e) => { const b = s.getBoundingClientRect(); return Math.max(0, Math.min(maxCell(), Math.floor((e.clientX - b.left) / b.width * N))); };
    s.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); s.focus();
      if (rawCell(e) > maxCell()) { st.hovFuture = rawCell(e); strokes(); return; } // 아직 안 온 시간
      const c = cellAt(e); try { s.setPointerCapture(e.pointerId); } catch (x) { /* 시험 입력 */ }
      const here = st.arr[c * SC.CELL + SC.CELL / 2], pen = st.pen !== 0 && here === st.pen ? 0 : st.pen; // 같은 펜으로 칠한 칸에서 시작 = 지우기
      st.drag = { a: c, b: c, pen }; st.cur = c; strokes();
    });
    const rawCell = (e) => { const b = s.getBoundingClientRect(); return Math.max(0, Math.min(N - 1, Math.floor((e.clientX - b.left) / b.width * N))); };
    s.addEventListener('pointermove', (e) => {
      const c = cellAt(e), raw = rawCell(e), fut = raw > maxCell() ? raw : null;
      if (st.drag) { if (c !== st.drag.b) { st.drag.b = c; strokes(); } } else if (st.hov !== c || st.hovFuture !== fut) { st.hov = fut == null ? c : null; st.hovFuture = fut; strokes(); }
    });
    s.addEventListener('pointerleave', () => { if (!st.drag && (st.hov != null || st.hovFuture != null)) { st.hov = null; st.hovFuture = null; strokes(); } });
    const up = () => { if (!st.drag) return; SC.fill(st.arr, st.drag.a, st.drag.b, st.drag.pen, limit()); st.cur = st.drag.b; st.drag = null; strokes(); segs(); };
    s.addEventListener('pointerup', up); s.addEventListener('pointercancel', () => { st.drag = null; strokes(); });
    s.addEventListener('keydown', (e) => {
      const k = e.key;
      if (!['ArrowLeft', 'ArrowRight', ' ', 'Enter', 'Backspace', 'Delete', 'Home', 'End'].includes(k) || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      if (st.cur == null) st.cur = Math.min(maxCell(), Math.round(((22 - SC.H + 24) % 24) * 60 / SC.CELL)); // 처음 = 22시 칸
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        const n = Math.max(0, Math.min(maxCell(), st.cur + (k === 'ArrowLeft' ? -1 : 1)));
        if (e.shiftKey) { SC.fill(st.arr, st.cur, n, st.pen, limit()); st.cur = n; strokes(); segs(); return; }
        st.cur = n;
      } else if (k === ' ' || k === 'Enter') { SC.fill(st.arr, st.cur, st.cur, st.pen, limit()); strokes(); segs(); return; }
      else if (k === 'Backspace' || k === 'Delete') { SC.fill(st.arr, st.cur, st.cur, 0, limit()); strokes(); segs(); return; }
      else if (k === 'Home') st.cur = 0; else if (k === 'End') st.cur = maxCell();
      strokes();
    });
  }

  // ---- 열기·닫기 ----
  function blockedNow() {
    const g = root.PHGame && root.PHGame.G;
    if (root.PHDialog && root.PHDialog.isOpen()) return true;
    if (['PHWardrobe', 'PHWaterModal', 'PHInventory', 'PHFridgeMemo', 'PHBookModal', 'PHRecordModal', 'PHBucketMemo', 'PHLogModal'].some((k) => root[k] && root[k].isOpen && root[k].isOpen())) return true;
    return !!(g && g.dialog);
  }
  // 창 첫 줄 (부기 2-4): 잔 시각만 줄 > 침대(그어 둔 게 있으면 bedHas, 아니면 아침·낮) > 고치기 > 새로
  function firstLine(o) {
    const L = UP().say, has = SC.runs(st.arr).length > 0;
    if (st.opens.length) return pick(L.open, 'say.open');
    if (o.from === 'bed') return has || st.had ? pick(L.bedHas, 'say.bedHas') : pick(o.band === 'day' ? L.bedDay : L.bedMorning, 'say.bed');
    return pick(st.had ? L.edit : L.new, st.had ? 'say.edit' : 'say.new');
  }
  // o = { date: 깬 날 'YYYY-MM-DD'(없으면 지금 줄), from: 'journal'|'habits'|'bed'(또는 물건 type), band: 침대 시간대('morning'|'day'), line: 첫 줄(없으면 문구 파일) }
  async function open(o) {
    o = o || {};
    if (st.open || blockedNow()) return false;
    build();
    const L = root.PHLife;
    if (L && !L.data) { try { await L.load(); } catch (e) { /* 저장할 때 다시 */ } }
    const g = root.PHGame && root.PHGame.G; if (g) g.held = [];
    if (root.PHGame && root.PHGame.hideBubble) root.PHGame.hideBubble();
    const nr = SC.rowOfMs(nowMs());
    let date = /^\d{4}-\d{2}-\d{2}$/.test(o.date || '') ? o.date : nr; if (date > nr) date = nr;
    st.open = true; st.from = o.from || null; st.band = o.band || null; st.opened++; st.busy = false; st.pen = 2; st.hovFuture = null;
    load(date);
    st.line = o.line || firstLine(o);
    el.hidden = false;
    paint('slm-strip');
    el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
    return true;
  }
  function close() {
    if (!st.open || st.busy) return;
    st.open = false; el.hidden = true; q('.lm-box').innerHTML = '';
    const back = st.from === 'habits' ? $('life-habits') : st.from === 'journal' ? $('life-archive') : null, stage = $('stage');
    if (back) { const b = back.querySelector('.sl-row.sel') || back.querySelector('.lg-open[data-kind="sleep"]') || back.querySelector('.sl-add'); if (b) b.focus({ preventScroll: true }); }
    else if (stage && !stage.closest('.screen').hidden) stage.focus({ preventScroll: true });
  }
  function onKey(e) { // 창 밖에 포커스가 있을 때 오는 키
    if (!st.open || (el && el.contains(e.target))) return;
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') e.preventDefault();
  }
  function onKeyUp(e) { if (st.open && !(el && el.contains(e.target))) e.stopPropagation(); }
  root.addEventListener('keydown', onKey, true);
  root.addEventListener('keyup', onKeyUp, true);

  // ---- 저장 ----
  function say(text) {
    if (!text) return; st.log.push(text);
    const home = root.PHApp && root.PHApp.tab === 'home', G = root.PHGame && root.PHGame.G;
    if (home && G && G.mode === 'play' && root.PHGame.bubble && root.PHGame.bubble('dubu', text)) return;
    if (root.PHApp && root.PHApp.sideSay) root.PHApp.sideSay(text);
  }
  function repaintTabs() {
    const L = root.PHLife; if (!L || !L.data || !root.PHApp) return;
    const tab = root.PHApp.tab, box = $('life-' + tab);
    if ((tab === 'habits' || tab === 'archive') && box) L.paint(tab, box);
  }
  function showErr(m) { st.err = m || ''; const p = el && q('.lm-err'); if (p) p.textContent = st.err; }
  // 지금 칠한 것 -> 메인에 보낼 값 (시험에서도 봄)
  function plan() {
    readMemo();
    const rs = SC.runs(st.arr), segments = SC.segmentsOut(rs, st.orig, st.memo, st.memoInit);
    const dropOpen = st.opens.filter((o) => st.drop.includes(o.at) || SC.covered(o, rs)).map((o) => o.at);
    return { from: SC.fromOf(st.date), hours: 24, segments, dropOpen };
  }
  async function save() {
    if (!st.open || st.busy) return null;
    const u = UP(), E = U().err, L = root.PHLife, D = root.PHDesktop;
    if (!D || !D.setSleepWindow || !L) { showErr(pick(u.browserOnly, 'browser')); return null; }
    const pl = plan(), date = st.date;
    st.busy = true; showErr('');
    let res = null;
    try {
      if (!L.data) await L.load();
      res = await D.setSleepWindow(pl.from, pl.hours, pl.segments, L.lastModified, pl.dropOpen);
      L.data = Md.parse(res.text); L.lastModified = res.lastModified; L.readAt = Date.now();
      if (res.conflict) { st.busy = false; load(date); st.err = pick(u.conflict, 'conflict'); paint('slm-strip'); repaintTabs(); return res; }
      st.last = { date, from: pl.from, segments: pl.segments, dropOpen: pl.dropOpen, unchanged: !!res.unchanged };
      const had = st.had, from = st.from, [, m, d] = date.split('-').map(Number);
      st.busy = false; close();
      if (SV()) SV().select(date);
      repaintTabs();
      if (!res.unchanged) { // 바뀐 게 없으면 말 없이 닫음 (부기 2-5)
        const list = !pl.segments.length ? u.cleared : pl.dropOpen.length ? u.openDone : from === 'bed' ? u.bedSaved : had ? u.edited : u.saved;
        say(fill(pick(list, 'saved'), { m, d }));
      }
    } catch (e) {
      st.busy = false; st.lastError = String(e && e.message || e);
      showErr(/너무 김|100자/.test(st.lastError) ? E.memoLong : /오류|너무 많음|창 밖|앞섬/.test(st.lastError) ? E.bad : pick(u.fail, 'fail'));
    }
    return res;
  }

  function state() {
    return { open: st.open, date: st.date, from: st.from, pen: st.pen, opened: st.opened, busy: st.busy, err: st.err, cur: st.cur,
      title: el && st.open ? q('.lm-title').textContent : '', say: el && st.open ? q('.lm-line').textContent : '',
      runs: st.open ? SC.runs(st.arr).map((r) => [SC.clock(r.a), SC.clock(r.b), r.light ? '선잠' : '잠']) : null,
      opens: st.open ? st.opens.map((o) => ({ at: o.at, side: o.side, dropped: st.drop.includes(o.at), covered: SC.covered(o, SC.runs(st.arr)) })) : null,
      plan: st.open ? plan() : null, last: st.last || null, log: st.log.slice(), lastError: st.lastError || null };
  }
  root.PHSleepModal = { open, close, save, isOpen: () => st.open, state, build };
})(window);
