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
  const STEPS = ['name', 'cat', 'avatar', 'house', 'folder', 'habit']; // cat = 고양이 이름 짓기 (2026-10-08 제작자 3-1단계)
  const CAT0 = () => (root.PHProfile && root.PHProfile.CAT_DEFAULT) || '두부';
  const OB = { on: false, step: 0, name: '', cat: '', avatar: 'avatar1', house: 'room1', folder: null, info: null, habits: null, custom: [], line: '', busy: false, done: false, last: {} };

  const pick = (arr, key) => { const a = Array.isArray(arr) ? arr : [arr]; if (a.length < 2) return a[0] || ''; let i; do { i = Math.floor(Math.random() * a.length); } while (i === OB.last[key] && a.length > 1); OB.last[key] = i; return a[i]; };
  const catOf = () => OB.cat || CAT0();
  const fill = (s) => { const t = String(s || '').split('{user}').join(OB.name || ''); return root.PHProfile && root.PHProfile.fillCat ? root.PHProfile.fillCat(t, catOf()) : t.replace(/\{cat(\|[^}]+)?\}/g, catOf()); };
  const strip = (s) => (root.PHWorld ? root.PHWorld.parseLine(s).say : String(s).replace(/\([^)]*\)/g, '').trim());
  // 말풍선 글: 마지막 어절은 줄바꿈 없이 묶음 ("남아요냥 / ~"처럼 물결표만 떨어지지 않게, 무늬 공용판후속 v01 3-1 #4)
  function sayHtml(t) { const i = String(t).lastIndexOf(' '); return i < 0 ? `<span class="nw">${esc(t)}</span>` : esc(t.slice(0, i + 1)) + `<span class="nw">${esc(t.slice(i + 1))}</span>`; }
  function say(line) { OB.line = strip(fill(line)); const b = $('ob-say'); if (b) b.innerHTML = sayHtml(OB.line); }

  function drawSprite(cv, key, scale) {
    const Art = root.PHArt; if (!cv || !Art || !Art.has(key)) return;
    const sz = Art.size(key); cv.width = sz.w * scale; cv.height = sz.h * scale;
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(Art.frameCanvas(key, 0), 0, 0, cv.width, cv.height);
  }
  const FOLDER_ICON = { rows: ['kkkkk.......', 'kYYYYk......', 'kkkkkkkkkkkk', 'kyYYYYYYYYYk', 'kYYYYYYYYYYk', 'kYYYYYYYYYYk', 'kYYYYYYYYYYk', 'kkkkkkkkkkkk'], pal: { k: '#29262F', Y: '#F3CF6B', y: '#E0A84A' } }; // 무늬 공용판화면목업 v01 FOLDER_ICON
  function drawFolder(cv) {
    if (!cv) return; const F = FOLDER_ICON; cv.width = F.rows[0].length; cv.height = F.rows.length; const ctx = cv.getContext('2d');
    F.rows.forEach((r, y) => [...r].forEach((c, x) => { if (F.pal[c]) { ctx.fillStyle = F.pal[c]; ctx.fillRect(x, y, 1, 1); } }));
  }
  // 경로 보이기: 홈 폴더는 ~ (무늬 3-1 #7). 전체 경로는 title
  const homeShort = (d) => String(d || '').replace(/^\/Users\/[^/]+(?=\/|$)/, '~');
  // 공용 집 배치표·그림 (js/house_rooms.js PH_DATA_SETS, js/assets_rooms.js PH_ASSET_SETS). 온보딩 화면은 원룸 세트로 열리므로 다른 집은 여기서 직접 그림
  const houseData = (h) => ((root.PH_DATA_SETS || {})[h] || {}).PH_LAYOUT_DATA || {};
  const houseArt = (h) => (root.PH_ASSET_SETS || {})[h] || {};
  const ROOM_COLOR = { bath: '#AFD2E2', genkan: '#C9C6BF', room: '#E7D5B2', living: '#DDBF98', bedroom: '#EAB8B6', study: '#A2BBA3', dress: '#E9C35C' }; // 무늬 목업 planIcon
  function drawPlan(cv, h) { // 평면 아이콘: rows 1칸 = 3px, 방마다 색, 벽 먹선, 현관문 노랑
    const D = houseData(h), R = D.rows; if (!cv || !R) return; const k = 3, T = D.tile || 16;
    cv.width = R[0].length * k; cv.height = R.length * k; const g = cv.getContext('2d');
    R.forEach((r, y) => [...r].forEach((ch, x) => {
      let col = '#9DBE7C';
      if (ch === '#') col = '#29262F'; else if (ch === 'e') col = '#E9C35C';
      else if ('.d'.includes(ch)) { const px = x * T + T / 2, py = y * T + T / 2, rm = (D.rooms || []).filter((q) => Array.isArray(q.px) && px >= q.px[0] && px <= q.px[2] && py >= q.px[1] && py <= q.px[3]).pop(); col = rm ? (ROOM_COLOR[rm.id] || '#EEEEEE') : '#EEEEEE'; }
      g.fillStyle = col; g.fillRect(x * k, y * k, k, k);
    }));
  }
  function rawSprite(g, a, x, y) { // 그림 JSON 첫 장을 낮 색으로 (온보딩 미리보기만. 집 화면은 js/sprites.js)
    if (!a || !a.frames || !a.frames[0]) return; const P = a.palette || {};
    a.frames[0].forEach((row, j) => [...row].forEach((c, i) => { const v = P[c]; if (!v || v === 'transparent') return; g.fillStyle = v[0] === '#' ? v : '#' + v; g.fillRect(x + i, y + j, 1, 1); }));
  }
  function drawHouseThumb(cv) { // 고른 집 미리보기: 바탕 + 기본 가구, 정수 배율 1 (최대 384x320)
    if (!cv) return; const D = houseData(OB.house), A = houseArt(OB.house), c = D.canvas; if (!c || !A.background) return;
    cv.width = c[0]; cv.height = c[1]; cv.style.width = c[0] + 'px'; cv.style.height = c[1] + 'px';
    const g = cv.getContext('2d'); rawSprite(g, A.background, 0, 0);
    const ord = (o) => (o.layer === 'floor' ? 0 : o.layer === 'wall' ? 1 : 2);
    (D.objects || []).filter((o) => o.px != null && A[o.sprite]).slice().sort((p, q) => ord(p) - ord(q) || ((p.sort_y != null ? p.sort_y : p.py + (p.size ? p.size[1] : 0)) - (q.sort_y != null ? q.sort_y : q.py + (q.size ? q.size[1] : 0))))
      .forEach((o) => rawSprite(g, A[o.sprite], o.px, o.py));
  }

  function stepsBar() {
    const names = PL().steps || STEPS;
    // 무늬 공용판후속 v01 3-1 #2: 누르는 칩처럼 안 보이게 번호 원 + 글. 지난 단계 ✓, 지금 = 갈색 원 + 굵게, 다음 = 흐림
    return `<ol class="ob-steps" aria-label="${esc((PL().stepsLabel || '처음 설정 {n}/{all}단계').replace('{n}', OB.step + 1).replace('{all}', names.length))}">${names.map((n, i) => `<li class="${i === OB.step ? 'on' : i < OB.step ? 'past' : ''}" ${i === OB.step ? 'aria-current="step"' : ''}><span class="n" aria-hidden="true">${i < OB.step ? '✓' : i + 1}</span>${esc(n)}</li>`).join('')}</ol>`;
  }
  function body() {
    const P = PL(), st = STEPS[OB.step];
    if (st === 'name') return `<label class="ob-field"><span class="ob-label">${esc(P.nameLabel)}</span>
      <input id="ob-name" type="text" maxlength="${(OB.info && OB.info.nameMax) || 12}" placeholder="${esc(P.nameHolder)}" value="${esc(OB.name)}" autocomplete="off"></label>
      <p class="ob-note">${esc(P.nameNote)}</p>`;
    if (st === 'cat') return `<label class="ob-field"><span class="ob-label">${esc(P.catLabel)}</span>
      <input id="ob-cat" type="text" maxlength="${(OB.info && OB.info.nameMax) || 12}" placeholder="${esc(P.catHolder)}" value="${esc(OB.cat)}" autocomplete="off"></label>
      <p class="ob-note">${esc(P.catNote)}</p>`;
    if (st === 'avatar') {
      const list = (OB.info && OB.info.avatars) || ['avatar1', 'avatar2', 'avatar3'], nm = P.avatarNames || {};
      return `<h3 class="ob-h">${esc(P.avatarTitle)}</h3><div class="ob-avatars" role="radiogroup">${list.map((a) => `<button type="button" class="ob-av" role="radio" data-av="${esc(a)}" aria-checked="${a === OB.avatar}"><canvas data-cv="${esc(a)}"></canvas><span>${esc(nm[a] || a)}</span></button>`).join('')}</div>`;
    }
    if (st === 'house') { // 원룸·투룸·쓰리룸. 무늬 공용판마무리 v01 1절 (2026-10-09): 넓은 창 = 왼쪽 목록 280 / 오른쪽 미리보기 틀 384x320 고정, 좁은 창(< 984) = 목록 가로 3칸 + 방 구성은 미리보기 아래 첫 줄
      // 칸 = 평면 아이콘(배치표 rows 1칸 3px, 72x60 고정 틀 가운데·아래 맞춤) + 이름 + 방 구성. 콘셉트 글 = 부기 houseConcept(없으면 배치표 house.concept)
      const list = (OB.info && OB.info.houses) || ['room1'], meta = (h) => houseData(h).house || {}, m = meta(OB.house);
      const concept = (P.houseConcept || {})[OB.house] || m.concept || '';
      return `<h3 class="ob-h">${esc(P.houseTitle)}</h3><ul class="ob-houses" role="radiogroup" aria-label="${esc(P.houseTitle)}">${list.map((h) => `<li><button type="button" class="ob-house" role="radio" data-house="${esc(h)}" aria-checked="${OB.house === h}"><span class="ob-plan" aria-hidden="true"><canvas data-plan="${esc(h)}"></canvas></span><span class="ob-house-t"><b>${esc(meta(h).label || h)}</b><small>${esc(meta(h).rooms_ko || '')}</small></span></button></li>`).join('')}</ul>
      <figure class="ob-preview"><div class="ob-preview-box"><canvas id="ob-house-cv" aria-label="${esc((m.label || OB.house) + ' ' + (P.previewLabel || '미리보기'))}"></canvas></div><figcaption><span class="ob-rooms">${esc(m.rooms_ko || '')}</span><span class="ob-concept">${esc(concept)}</span></figcaption>
      ${P.houseNote ? `<p class="ob-note">${esc(P.houseNote)}</p>` : ''}</figure>`;
    }
    if (st === 'folder') {
      const f = OB.folder;
      // 무늬 3-1 #7: 입력칸처럼 안 보이게 점선 칸 + 폴더 그림 + 보통 글꼴 경로(홈 ~), 파일 이름은 따로 한 줄 (끊기지 않게)
      return `<h3 class="ob-h">${esc(P.folderTitle)}</h3><div class="ob-folder"><canvas id="ob-folder-cv" aria-hidden="true"></canvas><span id="ob-dir" class="ob-dir" title="${esc(f && f.dir)}">${esc(f ? homeShort(f.dir) : '')}</span>
        <button type="button" id="ob-pick" class="ob-btn">${esc(P.folderBtn)}</button></div>
        ${f ? `<p class="ob-file-row">${esc(f.found ? (P.fileFound || '이어 쓸 파일') : (P.fileNew || '새로 생길 파일'))} <b class="ob-file">${esc(f.file)}</b></p>` : ''}
        <p class="ob-note">${esc(P.folderNote)}</p>`;
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
    el.classList.toggle('is-house', STEPS[OB.step] === 'house'); // 집 단계만 넓은 카드 (무늬 공용판마무리 1절)
    el.innerHTML = `<div class="ob-card${STEPS[OB.step] === 'house' ? ' is-house' : ''}">${stepsBar()}
      <div class="ob-dubu"><canvas id="ob-dubu-cv" aria-hidden="true"></canvas><p id="ob-say" class="ob-say" aria-live="polite">${esc(OB.line)}</p></div>
      <div class="ob-body">${body()}</div>
      <div class="ob-nav">${OB.step > 0 ? `<button type="button" id="ob-back" class="ob-btn">${esc(P.back)}</button>` : '<span></span>'}
        <span class="ob-nav-r">${last ? `<button type="button" id="ob-skip" class="ob-btn ghost">${esc(P.skip)}</button><button type="button" id="ob-next" class="ob-btn main">${esc(P.start)}</button>` : `<button type="button" id="ob-next" class="ob-btn main">${esc(P.next)}</button>`}</span></div></div>`;
    drawSprite($('ob-dubu-cv'), 'dubu_sit', 3);
    el.querySelectorAll('canvas[data-cv]').forEach((c) => drawSprite(c, c.dataset.cv + '_idle', 3));
    drawHouseThumb($('ob-house-cv')); drawFolder($('ob-folder-cv'));
    el.querySelectorAll('canvas[data-plan]').forEach((c) => drawPlan(c, c.dataset.plan));
    const sb = $('ob-say'); if (sb) sb.innerHTML = sayHtml(OB.line);
    wire(el);
    const f = el.querySelector('#ob-name') || el.querySelector('#ob-cat') || el.querySelector('#ob-habit-new') || el.querySelector('[aria-checked="true"]') || el.querySelector('#ob-next');
    if (f) f.focus();
  }
  function wire(el) {
    const on = (sel, ev, fn) => { const x = el.querySelector(sel); if (x) x.addEventListener(ev, fn); };
    on('#ob-next', 'click', () => next());
    on('#ob-back', 'click', () => go(OB.step - 1));
    on('#ob-skip', 'click', () => { OB.habits = new Set(); OB.custom = []; finish(true); });
    on('#ob-name', 'keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); next(); } });
    on('#ob-name', 'input', (e) => { OB.name = e.target.value; });
    on('#ob-cat', 'keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); next(); } });
    on('#ob-cat', 'input', (e) => { OB.cat = e.target.value; });
    el.querySelectorAll('.ob-av').forEach((b) => b.addEventListener('click', () => { OB.avatar = b.dataset.av; say(pick(L().avatar.pick, 'avatar')); el.querySelectorAll('.ob-av').forEach((x) => x.setAttribute('aria-checked', String(x === b))); }));
    el.querySelectorAll('.ob-house').forEach((b) => b.addEventListener('click', () => { OB.house = b.dataset.house; say(pick([].concat(L().house['pick_' + OB.house] || [], L().house.pick || []), 'house')); render(); })); // 미리보기·고른 표시를 다시 그림
    on('#ob-pick', 'click', pickFolder);
    el.querySelectorAll('.ob-chip[data-habit]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.habit; if (OB.habits.has(id)) OB.habits.delete(id); else OB.habits.add(id); b.setAttribute('aria-pressed', String(OB.habits.has(id))); }));
    el.querySelectorAll('.ob-chip[data-custom]').forEach((b) => b.addEventListener('click', () => { OB.custom.splice(Number(b.dataset.custom), 1); render(); }));
    // 직접 더하기: 빈칸 = 말 없이 무시, 못 쓰는 이름 = habit.bad, 이미 있음(추천 칩·더한 것) = habit.dup, 더함 = habit.added (부기 공용판 v01 1-1)
    //   이름 규칙 = 습관 편집과 같음 (js/habit_edit.js checkName: 표를 깨는 글자·숫자로 시작 등)
    const add = () => {
      const i = el.querySelector('#ob-habit-new'), v = (i.value || '').replace(/\s+/g, ' ').trim(); if (!v) return;
      const HE = root.PHHabitEdit, H = L().habit || {}, rec = ((root.PHLifeTemplate && root.PHLifeTemplate.RECOMMEND) || []).find((r) => r.name === v);
      if (HE && HE.checkName) { try { HE.checkName(v); } catch (e) { say(pick(H.bad, 'habit:bad')); render(); const j = $('ob-habit-new'); if (j) { j.value = v; j.focus(); } return; } }
      if (rec || OB.custom.includes(v)) { say(pick(H.dup, 'habit:dup')); render(); return; }
      OB.custom.push(v); say(pick(H.added, 'habit:added')); render();
    };
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
      OB.name = r.name; go(1); say(pick(L().name.ok, 'name:ok') + ' ' + strip(fill(askLine('cat')))); return;
    }
    if (st === 'cat') { // 비우면 기본 두부. 글자 규칙은 사용자 이름과 같음
      const inp = $('ob-cat'), v = inp ? inp.value : OB.cat, C = L().cat || {};
      if (!String(v || '').trim()) { OB.cat = ''; go(2); say(pick(C.keep, 'cat:keep') + ' ' + strip(fill(askLine('avatar')))); return; }
      const r = D() ? await D().checkName(v) : { ok: true, name: String(v).trim() };
      if (!r.ok) { OB.cat = v; say(pick(C[r.code] || C.bad, 'cat:' + r.code)); render(); return; }
      OB.cat = r.name; go(2); say(pick(C.ok, 'cat:ok') + ' ' + strip(fill(askLine('avatar')))); return;
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
    const res = D() ? await D().finish({ name: OB.name, cat: OB.cat || '', avatar: OB.avatar, house: OB.house, dir: OB.folder && OB.folder.dir, habits }) : { ok: false, code: 'browser' };
    OB.result = res;
    if (res && res.ok) { OB.done = true; return; } // 메인이 화면을 집으로 다시 엶
    OB.busy = false;
    if (res && /^name/.test(res.code)) { go(0); return; }
    if (res && /^cat/.test(res.code)) { go(1); return; }
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
  function state() { return { on: OB.on, step: STEPS[OB.step], name: OB.name, cat: catOf(), avatar: OB.avatar, house: OB.house, folder: OB.folder, habits: Array.from(OB.habits || []), custom: OB.custom.slice(), line: OB.line, busy: OB.busy, done: OB.done, result: OB.result || null }; }
  root.PHOnboard = { start, state, next, go, finish, pickFolder, STEPS };
})(window);
