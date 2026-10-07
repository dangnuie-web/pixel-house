// 공용판 첫 실행 온보딩 (2026-10-08 로드맵 4단계, 기획/20261008_pixel-house_공용판기획_v01.md 4절)
//   이름 -> 아바타 -> 집(목록형, 지금 원룸 하나) -> 기록 폴더(기본 ~/Documents/PixelHouse, 빈 기록 파일) -> 습관(추천 + 직접 추가) -> 저장 -> 입장
//   문구 = 부기 js/data/onboard_lines.js. 모양 = 앱 공통 종이 칸(--ui-*)·습관 편집 칸과 같은 칩·입력 칸 (css/onboard.css)
//   저장·폴더는 메인(electron/profile_main.js, window.PHOnboardDesktop): 폴더는 고르기 창에서 고른 것·기본 폴더만, 끝나면 메인이 화면을 집으로 다시 엶
//   습관 줄은 메인이 js/life_template.js 로 습관 편집 규칙(js/habit_edit.js addHabit) 그대로 더함
(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const L = () => root.PH_ONBOARD_LINES || {}, PL = () => root.PH_ONBOARD_PLAIN || {};
  const D = () => root.PHOnboardDesktop;
  const STEPS = ['name', 'avatar', 'house', 'folder', 'habit'];
  const OB = { on: false, step: 0, name: '', avatar: 'avatar1', house: 'room1', folder: null, info: null, habits: null, custom: [], line: '', busy: false, done: false, last: {} };

  const pick = (arr, key) => { const a = Array.isArray(arr) ? arr : [arr]; if (a.length < 2) return a[0] || ''; let i; do { i = Math.floor(Math.random() * a.length); } while (i === OB.last[key] && a.length > 1); OB.last[key] = i; return a[i]; };
  const fill = (s) => String(s || '').split('{user}').join(OB.name || '');
  const strip = (s) => (root.PHWorld ? root.PHWorld.parseLine(s).say : String(s).replace(/\([^)]*\)/g, '').trim());
  function say(line) { OB.line = strip(fill(line)); const b = $('ob-say'); if (b) b.textContent = OB.line; }

  function drawSprite(cv, key, scale) {
    const Art = root.PHArt; if (!cv || !Art || !Art.has(key)) return;
    const sz = Art.size(key); cv.width = sz.w * scale; cv.height = sz.h * scale;
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(Art.frameCanvas(key, 0), 0, 0, cv.width, cv.height);
  }
  function drawHouseThumb(cv) { // 집 목록 그림: 배치표 바탕 + 기본 가구를 한 장으로 줄여서 (정수 배율 1)
    const Art = root.PHArt, Lay = root.PH_LAYOUT; if (!cv || !Art || !Lay || !Art.has('background')) return;
    cv.width = Lay.W; cv.height = Lay.H;
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    root.PHRender.drawScene(ctx, { actors: [], t: 0, walkMs: 130 });
  }

  function stepsBar() {
    const names = PL().steps || STEPS;
    return `<ol class="ob-steps" aria-label="온보딩 단계">${names.map((n, i) => `<li class="${i === OB.step ? 'on' : i < OB.step ? 'past' : ''}" ${i === OB.step ? 'aria-current="step"' : ''}>${esc(n)}</li>`).join('')}</ol>`;
  }
  function body() {
    const P = PL(), st = STEPS[OB.step];
    if (st === 'name') return `<label class="ob-field"><span class="ob-label">${esc(P.nameLabel)}</span>
      <input id="ob-name" type="text" maxlength="${(OB.info && OB.info.nameMax) || 12}" placeholder="${esc(P.nameHolder)}" value="${esc(OB.name)}" autocomplete="off"></label>
      <p class="ob-note">${esc(P.nameNote)}</p>`;
    if (st === 'avatar') {
      const list = (OB.info && OB.info.avatars) || ['avatar1', 'avatar2', 'avatar3'], nm = P.avatarNames || {};
      return `<h3 class="ob-h">${esc(P.avatarTitle)}</h3><div class="ob-avatars" role="radiogroup">${list.map((a) => `<button type="button" class="ob-av" role="radio" data-av="${esc(a)}" aria-checked="${a === OB.avatar}"><canvas data-cv="${esc(a)}"></canvas><span>${esc(nm[a] || a)}</span></button>`).join('')}</div>`;
    }
    if (st === 'house') return `<h3 class="ob-h">${esc(P.houseTitle)}</h3><ul class="ob-houses" role="radiogroup">
      <li><button type="button" class="ob-house" role="radio" data-house="room1" aria-checked="${OB.house === 'room1'}"><canvas id="ob-house-cv"></canvas><span class="ob-house-t"><b>${esc(P.oneRoom)}</b><small>${esc(P.oneRoomNote)}</small></span></button></li></ul>`;
    if (st === 'folder') {
      const f = OB.folder;
      return `<h3 class="ob-h">${esc(P.folderTitle)}</h3><div class="ob-folder"><code id="ob-dir" title="${esc(f && f.dir)}">${esc(f ? f.dir : '')}</code>
        <button type="button" id="ob-pick" class="ob-btn">${esc(P.folderBtn)}</button></div>
        <p class="ob-note">${esc(P.folderNote)}${f ? ` · <span class="ob-file">${esc(f.file)}</span>` : ''}</p>`;
    }
    const LT = root.PHLifeTemplate, rec = (LT && LT.RECOMMEND) || [];
    if (!OB.habits) OB.habits = new Set(rec.filter((r) => r.on).map((r) => r.id));
    return `<h3 class="ob-h">${esc(P.habitTitle)}</h3><div class="ob-chips">${rec.map((r) => `<button type="button" class="ob-chip" data-habit="${esc(r.id)}" aria-pressed="${OB.habits.has(r.id)}">${esc(r.name)}<small>${esc(r.cycle === '-' ? r.target : r.cycle)}</small></button>`).join('')}
      ${OB.custom.map((n, i) => `<button type="button" class="ob-chip mine" data-custom="${i}" aria-pressed="true">${esc(n)}<small>매일</small></button>`).join('')}</div>
      <div class="ob-add"><input id="ob-habit-new" type="text" maxlength="20" placeholder="${esc(P.habitAddHolder)}" autocomplete="off"><button type="button" id="ob-habit-add" class="ob-btn">${esc(P.habitAdd)}</button></div>
      <p class="ob-note">${esc(P.habitNote)}</p>`;
  }
  function render() {
    const el = $('screen-onboard'); if (!el) return;
    const P = PL(), last = OB.step === STEPS.length - 1;
    el.innerHTML = `<div class="ob-card">${stepsBar()}
      <div class="ob-dubu"><canvas id="ob-dubu-cv" aria-hidden="true"></canvas><p id="ob-say" class="ob-say" aria-live="polite">${esc(OB.line)}</p></div>
      <div class="ob-body">${body()}</div>
      <div class="ob-nav">${OB.step > 0 ? `<button type="button" id="ob-back" class="ob-btn">${esc(P.back)}</button>` : '<span></span>'}
        <span class="ob-nav-r">${last ? `<button type="button" id="ob-skip" class="ob-btn">${esc(P.skip)}</button><button type="button" id="ob-next" class="ob-btn main">${esc(P.start)}</button>` : `<button type="button" id="ob-next" class="ob-btn main">${esc(P.next)}</button>`}</span></div></div>`;
    drawSprite($('ob-dubu-cv'), 'dubu_sit', 3);
    el.querySelectorAll('canvas[data-cv]').forEach((c) => drawSprite(c, c.dataset.cv + '_idle', 3));
    drawHouseThumb($('ob-house-cv'));
    wire(el);
    const f = el.querySelector('#ob-name') || el.querySelector('#ob-habit-new') || el.querySelector('[aria-checked="true"]') || el.querySelector('#ob-next');
    if (f) f.focus();
  }
  function wire(el) {
    const on = (sel, ev, fn) => { const x = el.querySelector(sel); if (x) x.addEventListener(ev, fn); };
    on('#ob-next', 'click', () => next());
    on('#ob-back', 'click', () => go(OB.step - 1));
    on('#ob-skip', 'click', () => { OB.habits = new Set(); OB.custom = []; finish(true); });
    on('#ob-name', 'keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); next(); } });
    on('#ob-name', 'input', (e) => { OB.name = e.target.value; });
    el.querySelectorAll('.ob-av').forEach((b) => b.addEventListener('click', () => { OB.avatar = b.dataset.av; say(pick(L().avatar.pick, 'avatar')); el.querySelectorAll('.ob-av').forEach((x) => x.setAttribute('aria-checked', String(x === b))); }));
    el.querySelectorAll('.ob-house').forEach((b) => b.addEventListener('click', () => { OB.house = b.dataset.house; say(pick(L().house.pick, 'house')); b.setAttribute('aria-checked', 'true'); }));
    on('#ob-pick', 'click', pickFolder);
    el.querySelectorAll('.ob-chip[data-habit]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.habit; if (OB.habits.has(id)) OB.habits.delete(id); else OB.habits.add(id); b.setAttribute('aria-pressed', String(OB.habits.has(id))); }));
    el.querySelectorAll('.ob-chip[data-custom]').forEach((b) => b.addEventListener('click', () => { OB.custom.splice(Number(b.dataset.custom), 1); render(); }));
    const add = () => { const i = el.querySelector('#ob-habit-new'), v = (i.value || '').replace(/\s+/g, ' ').trim(); if (!v) return; if (!OB.custom.includes(v)) OB.custom.push(v); render(); };
    on('#ob-habit-add', 'click', add);
    on('#ob-habit-new', 'keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } });
  }
  function askLine(st) { const g = L()[st] || {}; return pick(g.ask, st + ':ask'); }
  function go(i) { OB.step = Math.max(0, Math.min(STEPS.length - 1, i)); say(askLine(STEPS[OB.step])); render(); }

  async function next() {
    if (OB.busy) return;
    const st = STEPS[OB.step];
    if (st === 'name') {
      const inp = $('ob-name'); OB.name = inp ? inp.value : OB.name;
      const r = D() ? await D().checkName(OB.name) : { ok: !!OB.name.trim(), name: OB.name.trim(), code: 'empty' };
      if (!r.ok) { say(pick(L().name[r.code] || L().name.bad, 'name:' + r.code)); render(); return; }
      OB.name = r.name; go(1); say(pick(L().name.ok, 'name:ok') + ' ' + strip(fill(askLine('avatar')))); return;
    }
    if (st === 'folder' && (!OB.folder || OB.folder.fail)) { say(pick(L().folder.fail, 'folder:fail')); render(); return; }
    if (st === 'habit') { finish(false); return; }
    go(OB.step + 1);
    if (STEPS[OB.step] === 'folder' && OB.folder) say(OB.folder.found ? pick(L().folder.found, 'folder:found') : askLine('folder'));
  }
  async function pickFolder() {
    if (!D() || OB.busy) return;
    OB.busy = true;
    try {
      const r = await D().pickFolder();
      if (r && r.ok) { OB.folder = { dir: r.dir, file: r.file, found: r.found }; say(r.found ? pick(L().folder.found, 'folder:found') : pick(L().folder.ok, 'folder:ok')); }
    } finally { OB.busy = false; render(); }
  }
  async function finish(skipped) {
    if (OB.busy || OB.done) return;
    OB.busy = true;
    const habits = Array.from(OB.habits || []).concat(OB.custom.map((n) => ({ name: n })));
    say(habits.length ? pick(L().habit.ok, 'habit:ok') : pick(L().habit.none, 'habit:none'));
    render();
    const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    await new Promise((r) => setTimeout(r, reduce ? 50 : 900));
    say(pick(L().done, 'done')); render();
    await new Promise((r) => setTimeout(r, reduce ? 50 : 900));
    const res = D() ? await D().finish({ name: OB.name, avatar: OB.avatar, house: OB.house, dir: OB.folder && OB.folder.dir, habits }) : { ok: false, code: 'browser' };
    OB.result = res;
    if (res && res.ok) { OB.done = true; return; } // 메인이 화면을 집으로 다시 엶
    OB.busy = false;
    if (res && /^name/.test(res.code)) { go(0); return; }
    if (res && (res.code === 'dir' || res.code === 'folder')) { if (OB.folder) OB.folder.fail = true; go(STEPS.indexOf('folder')); say(pick(L().folder.fail, 'folder:fail')); render(); return; }
    render();
  }

  async function start() {
    OB.on = true;
    document.body.classList.add('onboarding');
    if (D()) { try { OB.info = await D().info(); } catch (e) { OB.info = null; } }
    if (OB.info && OB.info.folder) OB.folder = { dir: OB.info.folder.dir, file: OB.info.folder.file, found: OB.info.folder.found };
    const hello = L().hello || [];
    OB.step = 0; say(hello[0] || ''); render();
    const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (let i = 1; i < hello.length; i++) { await new Promise((r) => setTimeout(r, reduce ? 0 : 1600)); if (OB.step === 0 && !OB.name) say(hello[i]); }
    await new Promise((r) => setTimeout(r, reduce ? 0 : 1400));
    if (OB.step === 0 && OB.line === strip(hello[hello.length - 1] || '')) say(askLine('name'));
  }
  // 시험·확인용
  function state() { return { on: OB.on, step: STEPS[OB.step], name: OB.name, avatar: OB.avatar, house: OB.house, folder: OB.folder, habits: Array.from(OB.habits || []), custom: OB.custom.slice(), line: OB.line, busy: OB.busy, done: OB.done, result: OB.result || null }; }
  root.PHOnboard = { start, state, next, go, finish, pickFolder, STEPS };
})(window);
