// 두부 하단 대화창 (화면). 왼쪽 두부 초상, 오른쪽 이름표 + 대사(한 글자씩) + 선택지 / 시각 칩 / 한 줄 입력창.
// 흐름(무엇을 묻고 무엇을 저장하는지)은 js/dialog_flow.js, 대사는 js/data/dialog_lines.js, 모양은 css/dialog.css.
// 디자인: 무늬 대화창 디자인 v01 ((제작 문서))
//   + 제작자 수정(2026-10-03): 초상 나무 액자 없앰(둥근 모서리만), 대화창·선택지·칩·입력창 모서리 둥글게
// 내보내는 것: PHDialog.openDubu() (두부 클릭·두부 옆 Space에서 game.js가 부름), PHDialog.isOpen() (열려 있는 동안 게임 입력 막기)
//   (interact) PHDialog.openFlow(fn) = 같은 대화창으로 다른 흐름 (하루 마감·요가 묻기). fn(ui, ctx) -> 결과
//   (interact) ui.tell(text, { card: { title, items: [{ label, text }] } }) = 대사 위에 "오늘 하루" 카드 / ui.ask 선택지의 desc·icon = 기분 4칸 작은 설명·그림
// 키: 방향키·숫자·클릭 = 고르기, Enter·Space = 정하기(글자 나오는 중이면 끝까지 보이기), Esc = 닫기(입력창에서는 입력 취소)
//   한글 입력: 조합 중(compositionstart~end, isComposing, keyCode 229)의 Enter·Esc는 대화창이 받지 않음 = 글자가 깨지지 않음
(function (root) {
  'use strict';
  const S = root.PH_SETTINGS, D = root.PH_DIALOG_LINES, LL = root.PHLifeLog, Flow = root.PHDialogFlow;
  const $ = (id) => document.getElementById(id);
  const PORTRAIT = 'assets/portraits/20261002_dubu_portrait_v01.png'; // 디자인/20261002_dubu_초상_v01.png 사본: 무늬 메모 4-2 자르기(가운데 600,610 기준 1000px) 후 384px
  const DU_BASE = 432; // du = 화면에 보이는 집 그림 높이 / 432 (무늬 메모 1장). 그림 세트가 바뀌어도 대화창 크기가 같음

  const st = { open: false, mode: null, text: '', t0: 0, done: true, choices: [], sel: 0, cols: 2, resolve: null, opt: null, composing: false, row: null, rows: [], timer: 0, log: [], result: null };
  const Dlg = { now: () => Date.now(), lastPick: {} };
  let el = null;

  // ---- 틀 만들기 (#stage 안, 전개도 위에 겹침) ----
  function build() {
    if (el) return el;
    const stage = $('stage'); if (!stage) return null;
    el = document.createElement('div');
    el.id = 'dd'; el.className = 'dd'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '두부와 대화');
    el.innerHTML = `<div class="dd-box" tabindex="-1">
      <img class="dd-face" src="${PORTRAIT}" alt="두부: 차를 따르는 흰 고양이" draggable="false">
      <div class="dd-main">
        <div class="dd-name"></div>
        <div class="dd-card" hidden><div class="dd-card-title"></div><ul class="dd-card-list"></ul></div>
        <p class="dd-line"><span class="dd-vis" aria-hidden="true"></span><span class="dd-sr" aria-live="polite"></span><i class="dd-more" aria-hidden="true"></i></p>
        <div class="dd-choices" role="group" aria-label="선택지"></div>
        <div class="dd-times"></div>
        <form class="dd-form" hidden autocomplete="off">
          <input class="dd-field" type="text" maxlength="${(S.DIALOG && S.DIALOG.MAX_LEN) || 100}" spellcheck="false" aria-label="직접 적기">
          <button type="button" class="dd-skip" hidden></button>
          <button type="submit" class="dd-submit"></button>
        </form>
        <div class="dd-esc" aria-hidden="true"></div>
      </div></div>`;
    stage.appendChild(el);
    q('.dd-name').textContent = D.name || '두부';
    q('.dd-submit').textContent = D.ui.submit;
    q('.dd-esc').textContent = D.ui.esc;
    const field = q('.dd-field');
    field.addEventListener('compositionstart', () => { st.composing = true; });
    field.addEventListener('compositionend', () => { st.composing = false; });
    q('.dd-form').addEventListener('submit', (e) => { e.preventDefault(); submitField(); });
    q('.dd-skip').addEventListener('click', (e) => { e.preventDefault(); if (st.mode === 'input' && st.opt && st.opt.skip) finish({ skip: true }); });
    q('.dd-box').addEventListener('click', onBoxClick);
    field.addEventListener('focus', () => el.classList.add('typing-field'));
    field.addEventListener('blur', () => el.classList.remove('typing-field'));
    // du = 그림 높이 / 432 (창 크기·그림 세트가 바뀌면 다시)
    const cv = $('cv');
    if (cv && root.ResizeObserver) new ResizeObserver(fitDu).observe(cv);
    root.addEventListener('resize', fitDu);
    return el;
  }
  const q = (s) => el.querySelector(s);
  function fitDu() {
    if (!el) return;
    const cv = $('cv'), h = cv ? cv.getBoundingClientRect().height : 0;
    if (h > 0) el.style.setProperty('--du', (h / DU_BASE) + 'px');
  }
  const reduceMotion = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---- 대사 한 줄 (한 글자씩) ----
  //   keep = 선택지·입력창을 그대로 보이게 둠 (입력 검사 대사: 입력창이 숨으면 포커스와 적던 글자 자리를 잃음)
  function setLine(text, keep) {
    st.text = String(text || ''); st.t0 = performance.now(); st.done = false;
    q('.dd-sr').textContent = st.text; q('.dd-vis').textContent = '';
    st.log.push(st.text);
    el.classList.toggle('typing', !keep);
    if (reduceMotion() || !st.text) showAll(); else tick();
  }
  function tick() {
    cancelAnimationFrame(st.timer);
    if (st.done || !st.open) return;
    const n = Math.floor((performance.now() - st.t0) / (S.TYPE_MS || 35)), chars = Array.from(st.text);
    if (n >= chars.length) { showAll(); return; }
    q('.dd-vis').textContent = chars.slice(0, n).join('');
    st.timer = requestAnimationFrame(tick);
  }
  function showAll() {
    cancelAnimationFrame(st.timer);
    st.done = true; q('.dd-vis').textContent = st.text; el.classList.remove('typing');
    q('.dd-more').textContent = st.mode === 'tell' ? '▼' : '';
    focusMode();
  }
  // 글자가 다 나오면 키보드 자리로 포커스 (선택지 = 고른 칸, 입력 = 입력창)
  function focusMode() {
    if (!st.open || !st.done) return;
    if (st.mode === 'ask') { const b = q('.dd-choices').children[st.sel]; if (b) b.focus({ preventScroll: true }); }
    else if (st.mode === 'time') { const b = activeChips()[st.sel]; if (b && document.activeElement !== q('.dd-field')) b.focus({ preventScroll: true }); }
    else if (st.mode === 'input') { const f = q('.dd-field'); if (document.activeElement !== f) { f.focus({ preventScroll: true }); f.setSelectionRange(f.value.length, f.value.length); } }
    else q('.dd-box').focus({ preventScroll: true });
  }

  // ---- 화면 상태 바꾸기 ----
  function clearParts() {
    q('.dd-choices').innerHTML = ''; q('.dd-times').innerHTML = '';
    q('.dd-form').hidden = true; q('.dd-skip').hidden = true; q('.dd-more').textContent = '';
    q('.dd-card').hidden = true; q('.dd-choices').dataset.kind = '';
    el.dataset.mode = st.mode || '';
  }
  function finish(v) { const r = st.resolve; st.resolve = null; st.mode = null; st.result = v; if (r) r(v); }

  // ui.ask: 선택지 (2열, 번호 = 숫자 키)
  function ask(text, choices, opt) {
    return new Promise((resolve) => {
      st.mode = 'ask'; st.resolve = resolve; st.opt = opt || {}; st.choices = choices; st.sel = 0; st.cols = (opt && opt.cols) || 2;
      clearParts();
      const box = q('.dd-choices'); box.style.setProperty('--cols', st.cols); box.dataset.kind = (opt && opt.kind) || '';
      choices.forEach((c, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'dd-ch'; b.dataset.i = i; b.dataset.id = c.id;
        b.innerHTML = `<i class="dd-arrow" aria-hidden="true"></i><span class="dd-num">${i + 1}</span>${c.icon ? '<img class="dd-icon" alt="" aria-hidden="true" draggable="false">' : ''}<span class="dd-lab"></span>${c.desc ? '<small class="dd-desc"></small>' : ''}`;
        b.querySelector('.dd-lab').textContent = c.label;
        if (c.icon) b.querySelector('.dd-icon').src = c.icon; // 기분 4칸 그림 (무늬 mood_0~3)
        if (c.desc) { b.querySelector('.dd-desc').textContent = c.desc; b.setAttribute('aria-label', c.label + ', ' + c.desc); }
        b.addEventListener('click', (e) => { e.stopPropagation(); if (st.mode === 'ask') { st.sel = i; paintSel(); finish(c.id); } });
        box.appendChild(b);
      });
      paintSel(); setLine(text);
    });
  }
  function paintSel() {
    const list = st.mode === 'time' ? activeChips() : Array.from(q('.dd-choices').children);
    list.forEach((b, i) => { const on = i === st.sel; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    if (st.done && list[st.sel] && document.activeElement !== q('.dd-field')) list[st.sel].focus({ preventScroll: true });
  }

  // ui.time: 시각 칩 줄(잔 시각·깬 시각) + 직접 적기 입력창. 이미 적은 값 = 주황 점
  function time(text, opt) {
    return new Promise((resolve) => {
      st.mode = 'time'; st.resolve = resolve; st.opt = opt; st.row = opt.row;
      clearParts();
      const rows = q('.dd-times'), H = (h) => String(h).padStart(2, '0') + ':00';
      const showRows = opt.row === 'wake' ? ['bed', 'wake'] : ['bed'];
      showRows.forEach((r) => {
        const row = document.createElement('div'); row.className = 'dd-trow'; row.dataset.row = r;
        const active = r === opt.row;
        row.classList.toggle('done', !active);
        row.innerHTML = `<span class="dd-tname">${r === 'bed' ? D.ui.bedRow : D.ui.wakeRow}</span><span class="dd-chips"></span>`;
        const hours = active ? opt.hours : [], picked = opt.picked && opt.picked[r];
        const chips = row.querySelector('.dd-chips');
        if (!active) { // 앞에서 고른 값 (고름 = 반전)
          const b = document.createElement('span'); b.className = 'dd-chip picked'; b.textContent = LL.fmtTime(picked); chips.appendChild(b);
        }
        hours.forEach((h, i) => {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'dd-chip'; b.dataset.time = H(h); b.dataset.i = i;
          b.textContent = h + '시';
          const dot = opt.dots && opt.dots[r]; if (dot && Number(dot.slice(0, 2)) === h) { b.classList.add('dot'); b.title = '오늘 적어 둔 시각'; }
          b.addEventListener('click', (e) => { e.stopPropagation(); if (st.mode === 'time') { st.sel = i; paintSel(); finish({ time: H(h) }); } });
          chips.appendChild(b);
        });
        rows.appendChild(row);
      });
      // 커서 처음 자리: 이미 적은 값이 있으면 그 칸, 없으면 첫 칸
      const dot = opt.dots && opt.dots[opt.row], idx = dot ? opt.hours.indexOf(Number(dot.slice(0, 2))) : -1;
      st.sel = idx >= 0 ? idx : 0;
      showField(opt.placeholder, '');
      paintSel(); setLine(text);
    });
  }
  const activeChips = () => Array.from(el.querySelectorAll('.dd-trow:not(.done) .dd-chip'));

  // ui.input: 한 줄 입력창 (+ 넘어가기 버튼)
  function input(text, opt) {
    return new Promise((resolve) => {
      st.mode = 'input'; st.resolve = resolve; st.opt = opt || {};
      clearParts();
      showField(opt.placeholder, opt.value || '');
      if (opt.skip) { q('.dd-skip').hidden = false; q('.dd-skip').textContent = opt.skip; }
      setLine(text);
    });
  }
  function showField(placeholder, value) {
    const f = q('.dd-field'); q('.dd-form').hidden = false;
    f.placeholder = placeholder || ''; f.value = value || ''; st.composing = false;
  }
  // 입력창 Enter: 검사 -> 틀리면 두부가 알려 주고 입력창은 그대로, 맞으면 끝
  function submitField() {
    if (st.composing) return;
    const f = q('.dd-field'), v = f.value, opt = st.opt || {};
    const err = opt.validate ? opt.validate(v) : null;
    if (st.mode === 'time') {
      if (err) { setLine(err, true); f.focus(); return; }
      const t = LL.parseTimes(v);
      finish(t.length >= 2 && st.row === 'bed' ? { times: t.slice(0, 2) } : { time: t[0] });
      return;
    }
    if (st.mode !== 'input') return;
    if (err) { setLine(err, true); f.focus(); return; }
    finish(v);
  }
  // ui.tell: 대사만 (Enter·Space·클릭 = 다음, Esc = 닫기)
  function tell(text, opt) {
    return new Promise((resolve) => {
      st.mode = 'tell'; st.resolve = resolve; st.opt = opt || {}; clearParts();
      const c = opt && opt.card;
      if (c) { // "오늘 하루" 카드 (하루 마감): 머리말 + 한 것만 줄
        q('.dd-card').hidden = false; q('.dd-card-title').textContent = c.title || '';
        const ul = q('.dd-card-list'); ul.innerHTML = '';
        (c.items || []).forEach((it) => { const li = document.createElement('li'); li.dataset.key = it.key || ''; li.innerHTML = '<b></b><span></span>'; li.querySelector('b').textContent = it.label; li.querySelector('span').textContent = it.text; ul.appendChild(li); });
      }
      setLine(text);
    });
  }

  // ---- 입력 ----
  const visible = () => { const scr = $('screen-house'); return !!(el && !el.hidden && scr && !scr.hidden && (!root.PHGame || root.PHGame.G.active)); };
  function move(d) {
    const list = st.mode === 'time' ? activeChips() : Array.from(q('.dd-choices').children);
    if (!list.length) return;
    st.sel = Math.max(0, Math.min(list.length - 1, st.sel + d)); paintSel();
  }
  function choose(i) {
    if (st.mode === 'ask') { const c = st.choices[i]; if (c) { st.sel = i; paintSel(); finish(c.id); } }
    else if (st.mode === 'time') { const b = activeChips()[i]; if (b) { st.sel = i; paintSel(); finish({ time: b.dataset.time }); } }
  }
  function onKey(e) {
    if (!st.open || !visible()) return;
    const field = q('.dd-field'), inField = document.activeElement === field;
    e.stopPropagation(); // 게임(game.js)·탭 키로 안 넘김
    if (e.metaKey || e.ctrlKey || e.altKey) return; // Cmd+C·V 등은 그대로
    // 한글 조합 중: Enter·Esc·방향키를 대화창이 쓰지 않음 (조합 확정은 입력기가 함)
    if (inField && (e.isComposing || e.keyCode === 229 || st.composing)) return;
    const k = e.key;
    if (inField) {
      if (k === 'Enter') { e.preventDefault(); if (!e.repeat) submitField(); return; }
      if (k === 'Escape') { e.preventDefault(); if (st.mode === 'time') { field.blur(); focusMode(); } else finish(null); return; }
      if (st.mode === 'time' && (k === 'ArrowUp' || (k === 'Tab' && e.shiftKey))) { e.preventDefault(); field.blur(); focusMode(); return; }
      if (k === 'Tab') { e.preventDefault(); cycleFormButtons(field, e.shiftKey); }
      return; // 글자 입력은 그대로
    }
    if (k === 'Escape') { e.preventDefault(); finish(null); return; }
    // 입력 모드에서 버튼(넘어가기·적기)에 포커스가 있을 때
    if (st.mode === 'input') {
      if (k === 'Tab') { e.preventDefault(); cycleFormButtons(document.activeElement, e.shiftKey); return; }
      if (k === 'Enter' || k === ' ') { e.preventDefault(); const a = document.activeElement; if (a && el.contains(a) && a.tagName === 'BUTTON') a.click(); else { showAll(); field.focus(); } }
      return;
    }
    const isDigit = /^[1-9]$/.test(k);
    if (!st.done && (k === 'Enter' || k === ' ' || isDigit || k.startsWith('Arrow'))) { e.preventDefault(); showAll(); if (!isDigit) return; }
    if (st.mode === 'tell') { if (k === 'Enter' || k === ' ') { e.preventDefault(); if (!e.repeat) finish(true); } return; }
    if (isDigit) { e.preventDefault(); choose(Number(k) - 1); return; }
    if (k === 'Enter' || k === ' ') { e.preventDefault(); if (!e.repeat) choose(st.sel); return; }
    if (st.mode === 'ask') {
      if (k === 'ArrowLeft') { e.preventDefault(); move(-1); } else if (k === 'ArrowRight') { e.preventDefault(); move(1); }
      else if (k === 'ArrowUp') { e.preventDefault(); move(-st.cols); } else if (k === 'ArrowDown') { e.preventDefault(); move(st.cols); }
      else if (k === 'Tab') { e.preventDefault(); const n = st.choices.length; st.sel = (st.sel + (e.shiftKey ? n - 1 : 1)) % n; paintSel(); }
      return;
    }
    if (st.mode === 'time') {
      if (k === 'ArrowLeft') { e.preventDefault(); move(-1); } else if (k === 'ArrowRight') { e.preventDefault(); move(1); }
      else if (k === 'ArrowDown' || (k === 'Tab' && !e.shiftKey)) { e.preventDefault(); field.focus(); }
      else if (k === 'ArrowUp' || k === 'Tab') e.preventDefault();
    }
  }
  function cycleFormButtons(from, back) {
    const list = [q('.dd-field'), q('.dd-skip'), q('.dd-submit')].filter((b) => !b.hidden);
    const i = list.indexOf(from), n = list[(i + (back ? list.length - 1 : 1)) % list.length];
    if (n) n.focus();
  }
  function onBoxClick(e) {
    if (e.target.closest('button, input')) return;
    if (!st.done) { showAll(); return; }
    if (st.mode === 'tell') finish(true);
  }

  // ---- 열기·닫기 ----
  // 자리: 언제나 하단 고정 (제작자 2026-10-03 "두부 대화창은 하단에"). 두부가 아래쪽에 있어도 위로 옮기지 않음 (예전 placeTop·.top 없앰)
  function canOpen() {
    const G = root.PHGame && root.PHGame.G;
    if (st.open || !build()) return false;
    if (G && (G.mode !== 'play' || G.fadeT != null || G.dialog)) return false; // 입장 연출·밝아지기 중에는 안 열림 (무늬 메모 5장)
    return true;
  }
  async function readData() {
    try {
      if (!root.PHDesktop || !root.PHDesktop.read) return null;
      const r = await root.PHDesktop.read(S.LIFE_FILE);
      return { text: r.text, lastModified: r.lastModified };
    } catch (e) { return null; }
  }
  // 대화창 선택지 중 습관 줄과 이어진 것 = 식사(식사 일지)뿐. 물은 줄을 지울 수 없음, 잠은 습관 줄 없음
  //   방금 읽은 글(data)의 생활습관 표 + 앱 설정 seen으로 계산 (js/features.js stateOf). 못 읽으면 PHFurnish.isOn (생활 탭 글)
  const TOPIC_FN = { meal: 'meal' };
  function offTopics(data) {
    const FX = root.PHFeatures, FS = root.PHFurnish, Md = root.PHLifeMd; if (!FX || !FS) return [];
    let names = null;
    try { if (data && data.text != null && Md) { const d = Md.parse(data.text); if (d.habits) names = d.habits.rows.map((r) => r.name); } } catch (e) { names = null; }
    return Object.keys(TOPIC_FN).filter((k) => {
      if (!names) return !FS.isOn(TOPIC_FN[k]);
      FX.seenFrom(names).forEach((id) => { if (!FS.seen.includes(id)) FS.seen.push(id); });
      return FX.stateOf(TOPIC_FN[k], names, FS.seen) === 'off';
    });
  }
  // 두부와 대화 (두부 클릭·두부 옆 Space)
  function openDubu() { return openWith((ui, ctx) => Flow.run(ui, ctx)); }
  // (interact) 다른 흐름: fn(ui, ctx). ctx는 openDubu와 같은 것 (생활 기록 글·저장 함수·대사)
  function openFlow(fn) { return openWith(fn); }
  async function openWith(runner) {
    if (!canOpen()) return null;
    st.open = true; st.log = []; st.result = null;
    if (root.PHGame) root.PHGame.G.held = []; // 누르고 있던 방향키 놓기
    const data = await readData();
    fitDu();
    el.classList.remove('top'); // 하단 고정
    el.hidden = false; el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
    const api = root.PHDesktop && root.PHDesktop.setSleep ? root.PHDesktop : null;
    const ctx = {
      lines: D, clickLines: (root.PH_LINES && root.PH_LINES.click) || [], settings: S, now: Dlg.now, lastPick: Dlg.lastPick,
      data, api, off: offTopics(data), // 꺼진 기능 선택지 (2026-10-04 제작자: 식사 일지 습관 줄을 지우면 "식사 적기"도 없음)
      more: root.PH_INTERACT_LINES || null, // (interact) 대사 묶음 하나 더 (기분 4칸은 2026-10-13 뺌)
      onWrite: (res) => { // 생활 탭이 가진 글도 새것으로 (물컵이 괜히 충돌로 보이지 않게)
        const Life = root.PHLife; if (!Life || !root.PHLifeMd) return;
        Life.data = root.PHLifeMd.parse(res.text); Life.lastModified = res.lastModified; Life.readAt = Date.now();
      },
    };
    let out = null;
    try { out = await runner({ ask, time, input, tell }, ctx); }
    catch (e) { out = { error: String(e && e.message || e) }; console.warn('dialog flow', e); }
    close();
    Dlg.last = out;
    return out;
  }
  function close() {
    if (!el) return;
    if (st.resolve) finish(null);
    cancelAnimationFrame(st.timer);
    st.open = false; st.mode = null; el.hidden = true; el.classList.remove('typing', 'enter');
    const f = q('.dd-field'); if (document.activeElement === f) f.blur();
    const stage = $('stage'); if (stage && $('screen-house') && !$('screen-house').hidden) stage.focus({ preventScroll: true });
  }

  // 시험·확인용 상태
  function state() {
    if (!el) return { open: false };
    const f = q('.dd-field');
    return {
      open: st.open, mode: st.mode, text: st.text, shown: q('.dd-vis').textContent, done: st.done, hidden: el.hidden, top: el.classList.contains('top'),
      choices: Array.from(q('.dd-choices').children).map((b) => b.querySelector('.dd-lab').textContent), sel: st.sel,
      chips: activeChips().map((b) => b.textContent), dots: Array.from(el.querySelectorAll('.dd-chip.dot')).map((b) => b.textContent), row: st.mode === 'time' ? st.row : null,
      field: { hidden: q('.dd-form').hidden, value: f.value, focused: document.activeElement === f, placeholder: f.placeholder }, skip: !q('.dd-skip').hidden,
      card: q('.dd-card').hidden ? null : { title: q('.dd-card-title').textContent, items: Array.from(q('.dd-card-list').children).map((li) => li.querySelector('b').textContent + ' ' + li.querySelector('span').textContent) },
      descs: Array.from(q('.dd-choices').querySelectorAll('.dd-desc')).map((d) => d.textContent),
      composing: st.composing, du: parseFloat(el.style.getPropertyValue('--du')) || null, log: st.log.slice(), result: st.result, last: Dlg.last || null,
    };
  }

  document.addEventListener('keydown', onKey, true); // 잡기 단계: game.js(document 거품 단계)보다 먼저
  Object.assign(Dlg, { openDubu, openFlow, isOpen: () => st.open, close, state, build, fitDu });
  root.PHDialog = Dlg;
  if (document.readyState !== 'loading') build(); else document.addEventListener('DOMContentLoaded', build);
})(window);
