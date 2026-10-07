// 대변 관찰 일지·식사 일지 창 (2026-10-04 비트, logs 브랜치). 하나의 창이 두 가지를 그림: kind 'poop' | 'meal'
//   여는 곳: 집 변기(toilet) = 대변 / 거실 2인 테이블(table_two) = 식사 (js/interact.js go: poopLog·mealLog, 제작자 2026-10-04 정정)
//            생활 습관 탭 기록 카드 "대변"·"식사" / 생활일지 > 대변·식사 탭 "기록하기"·"고치기" (js/logs_view.js)
//   모양 = 물 창·독서 창과 같은 결 (크림 박스, 먹색 테두리, 아래 그림자). 사이드바까지 덮는 창이라 어느 탭에서 열어도 같음. css/logs.css
//   대변: 일시(기본 지금, 하루 경계 6시) · 형태(무늬 브리스톨 1~7형 그림 + "1형 토끼똥") · 양 g · 색 6칩 · 상세 여러 줄. 의학 판단 문구 없음
//   식사: 일시 · 끼니(아침/점심/저녁/간식, 기본 = 시각대) · 메뉴 · 만족도 하트 5칸 · 먹은 양 위장 4단(25/50/75/100%) · 상세 여러 줄
//   저장 = window.PHLogsDesktop (electron/logs_ipc.js, 메인만 씀). 저장되면 창을 닫고 두부가 한 줄 (집이면 집 말풍선, 다른 탭이면 사이드바)
// 키: Esc = 닫기(한글 조합 중은 무시), Cmd/Ctrl+Enter = 저장, Tab은 창 안에서만, 고르기 칸은 ← → 로. 바깥(어두운 곳) 클릭 = 닫기
//   열린 동안 집 조작(걷기·Space·물건)은 막음: 창 안 키는 창에서 멈추고(글자 입력은 됨), 창 밖 키는 window 잡기 단계에서 막음 (독서 창과 같은 방식)
(function (root) {
  'use strict';
  const S = root.PH_SETTINGS, LT = root.PHLogTable, PL = root.PHPoopLog, ML = root.PHMealLog, Md = root.PHLifeMd;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const st = { open: false, kind: null, mode: 'add', key: null, d: null, from: null, opened: 0, busy: false, kindTouched: false, log: [], err: '' };
  const LM = { now: () => (root.PHLife && root.PHLife.now ? root.PHLife.now() : Date.now()) };
  let el = null;
  const UI = () => (root.PH_LINES && root.PH_LINES.ui && root.PH_LINES.ui.logs) || {};
  const today = () => LT.logDay(LM.now(), S.DAY_START_HOUR);
  const q = (s) => el.querySelector(s);
  const TITLES = { poop: { add: '대변 관찰', edit: '대변 관찰 고치기' }, meal: { add: '식사 일지', edit: '식사 기록 고치기' } };

  // ---- 그림 (무늬 일지그림 v01). 없으면 글자 칸 ----
  const art = {};
  function img(key, label, cls) {
    const A = root.PHArt;
    if (art[key] == null) { try { art[key] = A && A.has(key) ? A.frameCanvas(key, 0).toDataURL() : ''; } catch (e) { art[key] = ''; } }
    return art[key] ? `<img class="lm-img ${cls || ''}" src="${art[key]}" alt="" data-art="${esc(key)}">` : `<span class="lm-img lm-ph ${cls || ''}" data-art="">${esc(label)}</span>`;
  }
  const formName = (n) => { const A = root.PH_ASSETS || {}, a = A['bristol_' + n]; return (a && a.ko) || n + '형'; }; // "1형 토끼똥" (무늬 ko). 파일에는 "1형"만
  const formDesc = (n) => { const A = root.PH_ASSETS || {}, a = A['bristol_' + n]; return (a && a.desc) || ''; };

  function build() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'lm'; el.className = 'lm'; el.hidden = true;
    el.innerHTML = '<div class="lm-box" role="dialog" aria-modal="true" aria-labelledby="lm-title" tabindex="-1"></div>';
    document.body.appendChild(el);
    el.addEventListener('mousedown', (e) => { if (e.target === el) { e.preventDefault(); if (!st.busy) close(); } });
    el.addEventListener('keydown', (e) => {
      e.stopPropagation(); // 집(document 듣기)으로 안 넘김
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape') { e.preventDefault(); if (!st.busy) close(); return; }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); return; }
      if (e.key === 'Tab') { trapTab(e); return; }
      const grp = e.target.closest && e.target.closest('[role="radiogroup"]');
      if (grp && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const list = [...grp.querySelectorAll('[role="radio"]')], i = list.indexOf(e.target); if (i < 0) return;
        e.preventDefault(); const n = list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length]; pick(n, true); n.focus();
      }
    });
    el.addEventListener('keyup', (e) => e.stopPropagation());
    return el;
  }
  function trapTab(e) {
    const f = [...el.querySelectorAll('button, input, textarea')].filter((x) => !x.disabled && x.offsetParent !== null && x.tabIndex !== -1);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }

  // ---- 그리기 ----
  function radio(group, v, on, inner, label, extra) {
    return `<button type="button" class="lm-pick ${on ? 'on' : ''}" role="radio" aria-checked="${on}" data-group="${group}" data-v="${esc(v)}" aria-label="${esc(label)}" title="${esc(label)}" tabindex="${on ? 0 : -1}" ${extra || ''}>${inner}</button>`;
  }
  // 고르기 칸에서 아무것도 안 골랐으면 첫 칸이 Tab으로 들어가게
  function fixTabStops() { el.querySelectorAll('[role="radiogroup"]').forEach((g) => { const l = [...g.querySelectorAll('[role="radio"]')]; if (!l.some((x) => x.tabIndex === 0) && l[0]) l[0].tabIndex = 0; }); }
  function whenRow(d) {
    return `<div class="lm-row"><span class="lm-lab">일시</span><span class="lm-when"><input class="lm-date" type="date" max="${today()}" value="${esc(d.date)}" aria-label="날짜" data-focus="lm-date"><input class="lm-time" type="time" value="${esc(d.time)}" aria-label="시각" data-focus="lm-time"></span><small class="lm-hint">하루는 새벽 ${S.DAY_START_HOUR}시에 넘어가요</small></div>`;
  }
  function poopHtml(d) {
    const forms = PL.FORMS.map((n) => radio('form', n, d.form === n, img('bristol_' + n, n + '형', 'bristol') + `<span class="lm-cap">${esc(formName(n))}</span>`, formName(n) + (formDesc(n) ? ', ' + formDesc(n) : ''))).join('');
    const colors = PL.COLORS.map((c) => radio('color', c.name, d.color === c.name, `<i class="lm-chip" style="--c:${c.hex}" aria-hidden="true"></i><span class="lm-cap">${esc(c.name)}</span>`, c.name)).join('');
    return whenRow(d) +
      `<div class="lm-row top"><span class="lm-lab" id="lm-form-lab">형태</span><div class="lm-forms" role="radiogroup" aria-labelledby="lm-form-lab">${forms}</div></div>` +
      `<label class="lm-row"><span class="lm-lab">양</span><input class="lm-amount" type="number" inputmode="numeric" min="0" max="${PL.AMOUNT_MAX}" step="1" placeholder="모르면 비워 두세요" value="${esc(d.amount == null ? '' : d.amount)}" data-focus="lm-amount"><span class="lm-unit">g</span></label>` +
      `<div class="lm-row"><span class="lm-lab" id="lm-color-lab">색</span><div class="lm-colors" role="radiogroup" aria-labelledby="lm-color-lab">${colors}</div></div>` +
      `<label class="lm-row top"><span class="lm-lab">상세</span><textarea class="lm-memo" rows="4" maxlength="${PL.MEMO_MAX}" placeholder="자유롭게 적어 두세요 (비워 둬도 돼요)" data-focus="lm-memo">${esc(d.memo)}</textarea></label>`;
  }
  function hearts(r) { return [1, 2, 3, 4, 5].map((k) => radio('rating', k, r === k, img(k <= (r || 0) ? 'heart_full' : 'heart_empty', k <= (r || 0) ? '♥' : '♡', 'heart'), '만족도 ' + k, `data-fill="${k <= (r || 0)}"`)).join(''); }
  function mealHtml(d) {
    const kinds = ML.KINDS.map((k) => radio('kind', k, d.kind === k, `<span class="lm-cap">${esc(k)}</span>`, k)).join('');
    const amounts = ML.AMOUNTS.map((a) => radio('amount', a, d.amount === a, img('stomach_' + a, a + '%', 'stomach') + `<span class="lm-cap">${a}%</span>`, '먹은 양 ' + a + '%')).join('');
    return whenRow(d) +
      `<div class="lm-row"><span class="lm-lab" id="lm-kind-lab">끼니</span><div class="lm-kinds" role="radiogroup" aria-labelledby="lm-kind-lab">${kinds}</div></div>` +
      `<label class="lm-row"><span class="lm-lab">메뉴</span><input class="lm-menu" maxlength="${ML.MENU_MAX}" autocomplete="off" placeholder="무엇을 드셨어요? (꼭 적어 주세요)" value="${esc(d.menu)}" data-focus="lm-menu"></label>` +
      `<div class="lm-row"><span class="lm-lab" id="lm-rating-lab">만족도</span><div class="lm-hearts" role="radiogroup" aria-labelledby="lm-rating-lab">${hearts(d.rating)}</div></div>` +
      `<div class="lm-row top"><span class="lm-lab" id="lm-amount-lab">먹은 양</span><div class="lm-stomachs" role="radiogroup" aria-labelledby="lm-amount-lab">${amounts}</div></div>` +
      `<label class="lm-row top"><span class="lm-lab">상세</span><textarea class="lm-memo" rows="3" maxlength="${ML.MEMO_MAX}" placeholder="맛, 함께 먹은 사람, 기분 (비워 둬도 돼요)" data-focus="lm-memo">${esc(d.memo)}</textarea></label>`;
  }
  function paint(focus, line) {
    const d = st.d, T = TITLES[st.kind][st.mode];
    q('.lm-box').dataset.kind = st.kind;
    q('.lm-box').innerHTML = `<div class="lm-head"><b class="lm-title" id="lm-title">${esc(T)}</b><span class="lm-keys" aria-hidden="true">Esc 닫기 · ⌘Enter 저장</span></div>` +
      `<p class="lm-say" ${line ? '' : 'hidden'}><b class="lm-name">${esc((root.PH_DIALOG_LINES || {}).name || '두부')}</b><span class="lm-line" aria-live="polite">${esc(line || '')}</span></p>` +
      `<form class="lm-form" novalidate>${st.kind === 'poop' ? poopHtml(d) : mealHtml(d)}<p class="lm-err" role="alert">${esc(st.err)}</p>` +
      `<div class="lm-btns"><button type="button" class="lm-cancel">그만두기</button><button type="submit" class="lm-save">${st.mode === 'edit' ? '고치기' : '저장'}</button></div></form>`;
    fixTabStops();
    const f = q('.lm-form');
    f.addEventListener('submit', (e) => { e.preventDefault(); save(); });
    q('.lm-cancel').addEventListener('click', () => close());
    f.querySelectorAll('.lm-pick').forEach((b) => b.addEventListener('click', () => pick(b, false)));
    const tm = q('.lm-time');
    if (st.kind === 'meal') tm.addEventListener('input', () => { if (!st.kindTouched && LT.isTime(tm.value)) setKind(ML.kindAt(tm.value)); }); // 끼니를 직접 안 골랐으면 시각대로 따라감
    if (focus) { const x = [...el.querySelectorAll('[data-focus]')].find((y) => y.dataset.focus === focus) || (/^[[.]/.test(focus) ? el.querySelector(focus) : null); if (x) x.focus(); }
  }
  // 고르기: 같은 칸을 다시 누르면 비움 (키보드 ← → 는 늘 고름)
  function pick(b, fromKey) {
    const g = b.dataset.group, grp = b.closest('[role="radiogroup"]'), v = b.dataset.v;
    const wasOn = b.classList.contains('on'), on = fromKey || !wasOn;
    const val = on ? (g === 'kind' || g === 'color' ? v : Number(v)) : null;
    if (g === 'kind') { st.kindTouched = true; if (!on) return; } // 끼니는 비울 수 없음
    readDraft(); st.d[g] = val; if (st.err) showErr(''); // 고르면 앞 안내는 지움
    if (g === 'rating') { grp.innerHTML = hearts(val); grp.querySelectorAll('.lm-pick').forEach((x) => x.addEventListener('click', () => pick(x, false))); fixTabStops(); const n = grp.querySelector(`[data-v="${val || v}"]`); if (n) n.focus(); return; }
    grp.querySelectorAll('.lm-pick').forEach((x) => { const o = on && x === b; x.classList.toggle('on', o); x.setAttribute('aria-checked', String(o)); x.tabIndex = o ? 0 : -1; });
    fixTabStops();
  }
  function setKind(k) { const grp = q('.lm-kinds'); if (!grp) return; st.d.kind = k; grp.querySelectorAll('.lm-pick').forEach((x) => { const o = x.dataset.v === k; x.classList.toggle('on', o); x.setAttribute('aria-checked', String(o)); x.tabIndex = o ? 0 : -1; }); }
  function readDraft() {
    if (!el || !q('.lm-form')) return st.d;
    const d = st.d, v = (s) => { const x = q(s); return x ? x.value : ''; };
    d.date = v('.lm-date'); d.time = v('.lm-time'); d.memo = v('.lm-memo');
    if (st.kind === 'poop') d.amount = v('.lm-amount');
    else d.menu = v('.lm-menu');
    return d;
  }
  function showErr(m) { st.err = m || ''; const p = el && q('.lm-err'); if (p) p.textContent = st.err; }

  // ---- 열기·닫기 ----
  function blockedNow() {
    const g = root.PHGame && root.PHGame.G;
    if (root.PHDialog && root.PHDialog.isOpen()) return true;
    if (['PHWardrobe', 'PHWaterModal', 'PHInventory', 'PHFridgeMemo', 'PHBookModal', 'PHRecordModal', 'PHBucketMemo', 'PHMemoWall'].some((k) => root[k] && root[k].isOpen && root[k].isOpen())) return true;
    return !!(g && g.dialog);
  }
  function fresh(kind) {
    const n = LM.now(), time = LT.hm(n), date = today();
    return kind === 'poop' ? { date, time, form: null, amount: '', color: '', memo: '' } : { date, time, kind: ML.kindAt(time), menu: '', rating: null, amount: null, memo: '' };
  }
  // kind 'poop' | 'meal'. opt = { from: 물건 type 또는 'habits'·'journal', line: 두부 한 줄(창 안), row: 고칠 줄(parse 결과) }
  async function open(kind, opt) {
    const o = opt || {};
    if (st.open || !TITLES[kind] || blockedNow()) return false;
    if (!o.row && root.PHFurnish && !root.PHFurnish.isOn(kind)) { st.lastOff = kind; return false; } // 습관 줄을 지운 일지 = 새로 적지 않음
    build();
    const g = root.PHGame && root.PHGame.G; if (g) g.held = []; // 누르던 방향키가 남아 걷지 않게
    if (root.PHGame && root.PHGame.hideBubble) root.PHGame.hideBubble();
    st.open = true; st.kind = kind; st.from = o.from || null; st.opened++; st.err = ''; st.kindTouched = false; st.busy = false;
    st.mode = o.row ? 'edit' : 'add'; st.key = o.row ? { sig: o.row.sig } : null;
    if (o.row) {
      const r = o.row;
      st.d = kind === 'poop' ? { date: r.date, time: r.time, form: r.form, amount: r.amount == null ? '' : r.amount, color: r.color || '', memo: r.memo || '' }
        : { date: r.date, time: r.time || '', kind: r.kind, menu: r.menu, rating: r.rating, amount: r.amount, memo: r.memo || '' };
      st.kindTouched = true;
    } else st.d = fresh(kind);
    if (o.date && !o.row && LT.isDate(o.date) && o.date <= today()) st.d.date = o.date; // 달력에서 고른 날로 적기
    el.hidden = false;
    paint(kind === 'poop' ? (st.mode === 'edit' ? 'lm-memo' : '[role="radio"]') : 'lm-menu', o.line || '');
    el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
    if (!el.contains(document.activeElement)) q('.lm-box').focus({ preventScroll: true });
    if (root.PHLife && !root.PHLife.data) { try { await root.PHLife.load(); } catch (e) { /* 저장할 때 다시 */ } }
    return true;
  }
  function close() {
    if (!st.open || st.busy) return;
    st.open = false; el.hidden = true; q('.lm-box').innerHTML = '';
    const back = st.from === 'habits' ? $('life-habits') : st.from === 'journal' ? $('life-archive') : null;
    const stage = $('stage');
    if (back) { const b = back.querySelector('.lg-open, .lg-add'); if (b) b.focus({ preventScroll: true }); }
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

  // ---- 저장 (메인) ----
  const lastPick = {};
  function pickLine(list, k) { if (!Array.isArray(list)) return list || ''; if (list.length < 2) return list[0] || ''; const c = list.filter((t) => t !== lastPick[k]); const t = c[Math.floor(Math.random() * c.length)]; lastPick[k] = t; return t; }
  function line(kind, key, vars) { const L = (UI()[kind] || {})[key]; const t = pickLine(L, kind + key); return root.PHLife && root.PHLife.fill ? root.PHLife.fill(t, vars || {}) : t; }
  // 두부 한 줄: 집 화면이면 집 말풍선, 아니면 사이드바
  function say(text) {
    if (!text) return; st.log.push(text);
    const home = root.PHApp && root.PHApp.tab === 'home', G = root.PHGame && root.PHGame.G;
    if (home && G && G.mode === 'play' && root.PHGame.bubble && root.PHGame.bubble('dubu', text)) return;
    if (root.PHApp && root.PHApp.sideSay) root.PHApp.sideSay(text);
  }
  // 열려 있는 생활 탭을 새 글로 다시 그림
  function repaintTabs() {
    const L = root.PHLife; if (!L || !L.data || !root.PHApp) return;
    const tab = root.PHApp.tab, box = $('life-' + tab);
    if ((tab === 'habits' || tab === 'archive') && box) L.paint(tab, box);
  }
  // call(lastModified) -> 메인 결과. 생활 기록 글을 새로 받아 둠. 충돌이면 { conflict }
  async function write(call) {
    const L = root.PHLife;
    if (!root.PHLogsDesktop || !L) throw Object.assign(new Error('browser'), { code: 'browser' });
    if (!L.data) await L.load();
    const res = await call(L.lastModified);
    L.data = Md.parse(res.text); L.lastModified = res.lastModified; L.readAt = Date.now();
    return res;
  }
  function errText(m) {
    if (/형태를 골라/.test(m)) return '형태를 하나 골라 주세요.';
    if (/메뉴가 비었음/.test(m)) return '메뉴를 적어 주세요.';
    if (/오늘 뒤 날짜/.test(m)) return '날짜는 오늘까지 고를 수 있어요.';
    if (/날짜 오류/.test(m)) return '날짜를 다시 골라 주세요.';
    if (/시각 오류/.test(m)) return '시각을 다시 골라 주세요.';
    if (/양 오류/.test(m)) return `양은 0~${PL.AMOUNT_MAX}g 사이 숫자로 적어 주세요.`;
    if (/너무 김/.test(m)) return '글이 너무 길어요.';
    return UI().fail || '저장하지 못했어요.';
  }
  async function save() {
    if (!st.open || st.busy) return null;
    const d = readDraft(), kind = st.kind;
    // 화면에서 먼저 보는 것 (메인도 같은 검사를 다시 함)
    if (kind === 'poop' && !d.form) { showErr('형태를 하나 골라 주세요.'); const b = q('.lm-forms [role="radio"]'); if (b) b.focus(); return null; }
    if (kind === 'meal' && !String(d.menu || '').trim()) { showErr('메뉴를 적어 주세요.'); q('.lm-menu').focus(); return null; }
    if (d.date && d.date > today()) { showErr('날짜는 오늘까지 고를 수 있어요.'); return null; }
    if (kind === 'poop' && String(d.amount).trim() !== '' && !/^\d+$/.test(String(d.amount).trim())) { showErr(`양은 0~${PL.AMOUNT_MAX}g 사이 숫자로 적어 주세요.`); return null; }
    const entry = kind === 'poop'
      ? { date: d.date, time: d.time, form: d.form, amount: String(d.amount).trim() === '' ? null : Number(d.amount), color: d.color || '', memo: d.memo || '' }
      : { date: d.date, time: d.time, kind: d.kind, menu: d.menu, rating: d.rating, amount: d.amount, memo: d.memo || '' };
    const D = root.PHLogsDesktop, edit = st.mode === 'edit', key = st.key;
    const call = kind === 'poop' ? (edit ? (lm) => D.updatePoop(key, entry, lm) : (lm) => D.addPoop(entry, lm)) : (edit ? (lm) => D.updateMeal(key, entry, lm) : (lm) => D.addMeal2(entry, lm));
    st.busy = true; showErr('');
    let res = null;
    try {
      res = await write(call);
      if (res.conflict) { st.busy = false; showErr(UI().conflict); repaintTabs(); return res; }
      st.last = { kind, op: edit ? 'edit' : 'add', entry: res.entry || entry, date: res.date, habitAdded: res.habitAdded };
      st.busy = false; close(); repaintTabs();
      say(line(kind, edit ? 'edited' : 'saved', { menu: (res.entry || entry).menu || '' }));
    } catch (e) {
      st.busy = false; st.lastError = String(e && e.message || e);
      showErr(e && e.code === 'browser' ? UI().browserOnly : errText(st.lastError));
    }
    return res;
  }

  function state() {
    const sel = (g) => { const b = el && el.querySelector(`.lm-pick.on[data-group="${g}"]`); return b ? b.dataset.v : null; };
    return { open: st.open, kind: st.kind, mode: st.mode, from: st.from, opened: st.opened, busy: st.busy, err: st.err, title: el && st.open ? q('.lm-title').textContent : '',
      form: sel('form'), color: sel('color'), kindPick: sel('kind'), rating: el ? el.querySelectorAll('.lm-hearts [data-fill="true"]').length : 0, amount: sel('amount'),
      say: el && st.open && q('.lm-line') ? q('.lm-line').textContent : '', draft: st.open ? Object.assign({}, readDraft()) : null, last: st.last || null, log: st.log.slice(), lastError: st.lastError || null,
      arts: el ? [...el.querySelectorAll('.lm-img')].map((x) => x.dataset.art) : [] };
  }
  Object.assign(LM, { open, close, save, isOpen: () => st.open, state, write, say, line, repaintTabs, build, today, formName });
  root.PHLogModal = LM;
})(window);
