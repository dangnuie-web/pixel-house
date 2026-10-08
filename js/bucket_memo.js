// 버킷리스트 메모지 (2026-10-08 비트, 로드맵 3단계). 디자인 = 무늬 디자인/20261008_pixel-house_기록기능디자인_v01.md 1절
//   "벽에 압정으로 꽂아 둔 모눈종이 한 장": 흰 모눈, 초록 펜 손글씨 제목(memo_title_bucket), 빨간 압정(memo_pin), 체크 칸(memo_check 다시 씀)
//   종이 윗변 색인 탭 [버킷 n | 완료 n]. 버킷 탭 = 안 한 것 + 마지막 줄 "+ 적기"(Enter 저장, Esc 그만두기)
//   체크하면 1초 뒤 줄이 오른쪽으로 밀리며 사라지고 완료 탭 숫자가 커짐 (파일에는 바로 "- [x] … (완료 날짜)"). 가운데 줄 긋기 없음
//   완료 탭 = 끝낸 날 최신 먼저 + 오른쪽 끝 날짜. 체크 풀면 버킷으로 (파일 줄 자리는 그대로)
//   줄 두 번 누르기 또는 포커스 + Enter -> 그 줄이 입력칸 + "지우기". 지우면 아래 막대에 "… 지웠어요 [되돌리기]"
//   아래 막대: "붙일 자리 바꾸기"(js/memo_wall.js) + "Esc 닫기". 뒤를 어둡게 덮지 않음 (냉장고 메모지와 같음)
// 그리는 곳: 집 위 창(#bkm, 벽 메모지 누르기 = 메모지) / 생활 습관 탭·사이드바 "버킷리스트" 탭 (카드 모양, 2026-10-08 피드백 2). 상태는 하나
//   적기·고치기 칸 = 입력칸 + [그만두기][저장] (피드백 2). Enter = 저장, Esc = 그만두기 그대로
// 쓰기는 모두 메인 (electron/record_ipc.js, window.PHBucketDesktop). 파일 모양은 기존 ## 버킷리스트 그대로 (js/bucket_write.js)
(function (root) {
  'use strict';
  const BK = root.PHBucketWrite, Md = root.PHLifeMd, Life = root.PHLife;
  if (!BK || !Life) return;
  const $ = (id) => document.getElementById(id);
  const DU_BASE = 432, LEAVE_MS = 1000;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const D = () => root.PHBucketDesktop;
  const canWrite = () => !!(D() && D().add);
  const LN = () => (root.PH_LINES && root.PH_LINES.ui && root.PH_LINES.ui.bucket) || {};
  const PL = () => (root.PH_LINES && root.PH_LINES.uiPlain && root.PH_LINES.uiPlain.bucket) || {};
  // 상태: tab = todo | done, adding, edit = 고치는 줄 sig, leaving = 체크해서 1초 보이는 줄 sig, undo = 지운 줄
  const B = { tab: 'todo', adding: false, draft: '', edit: null, editDraft: '', err: '', leaving: null, undoItem: null, busy: false, said: null, isOn: false, from: null, opened: 0 };

  const art = {};
  function pic(key, frame) { const k = key + ':' + (frame || 0), A = root.PHArt; if (art[k] == null) { try { art[k] = A && A.has(key) ? A.frameCanvas(key, frame || 0).toDataURL() : ''; } catch (e) { art[k] = ''; } } return art[k]; }
  const img = (key, cls, alt, frame) => { const u = pic(key, frame); return u ? `<img class="${cls}" src="${u}" alt="${esc(alt || '')}" ${alt ? '' : 'aria-hidden="true"'} draggable="false">` : (alt ? `<b class="${cls} txt">${esc(alt)}</b>` : ''); };
  const md = (s) => (s ? `${s.slice(5, 7)}.${s.slice(8, 10)}` : '');

  function lists(d) {
    const P = BK.parse(d.lines || []), T = BK.tabs(P);
    // 체크해서 떠나는 줄은 1초 동안 버킷 탭에 그대로 (체크 표시)
    if (B.leaving) { const it = T.done.find((x) => x.sig === B.leaving.sig); if (it) { T.done = T.done.filter((x) => x !== it); T.todo = P.items.filter((x) => !x.done || x === it); } }
    return { P, T };
  }
  // card = 생활 습관 탭 카드 모양 (2026-10-08 제작자: 메모지 말고 다른 카드들과 같은 모양). 체크 칸 = 그림 대신 네모 칸
  const box = (checked, card, frame) => (card ? `<span class="bkc-box${checked ? ' on' : ''}" aria-hidden="true">${checked ? '✓' : ''}</span>` : img('memo_check', 'bkm-chk-i', '', frame));
  // 적기·고치기 칸 버튼 (2026-10-08 3-1단계 피드백 2 제작자: "저장 클릭 버튼이 닫기 옆에"). 순서 = 다른 폼과 같이 [그만두기][저장]. Enter·Esc도 그대로
  const btns = () => `<span class="bkm-btns"><button type="button" class="bkm-cancel">${esc(PL().cancel || '그만두기')}</button><button type="button" class="bkm-save">${esc(PL().save || '저장')}</button></span>`;
  function lineHtml(it, done, card) {
    const leaving = B.leaving && B.leaving.sig === it.sig, checked = done || leaving;
    if (B.edit === it.sig) {
      return `<li class="bkm-it edit" data-sig="${esc(it.sig)}">${box(checked, card, checked ? 1 : 0)}<input class="bkm-in bkm-in-edit${B.err ? ' bad' : ''}" maxlength="${BK.TEXT_MAX}" value="${esc(B.editDraft)}" aria-label="고칠 내용" autocomplete="off"><button type="button" class="bkm-del">${esc(PL().del || '지우기')}</button>${btns()}</li>`;
    }
    return `<li class="bkm-it${leaving ? ' leaving' : ''}" data-sig="${esc(it.sig)}"><button type="button" class="bkm-chk" role="checkbox" aria-checked="${checked}" aria-label="${esc(it.text)} ${checked ? '끝냄' : '체크'}" data-focus="bkm-chk:${esc(it.sig)}">${box(checked, card, checked ? 1 : 0)}</button>` +
      `<span class="bkm-t" tabindex="0" data-focus="bkm-t:${esc(it.sig)}">${esc(it.text)}</span>${done && it.doneDate ? `<small class="bkm-date">${md(it.doneDate)}</small>` : ''}</li>`;
  }
  function html(d, opt) {
    const { T } = lists(d), todo = B.tab === 'todo', items = todo ? T.todo : T.done, card = !!(opt && opt.card);
    const tab = (id, n) => `<button type="button" role="tab" class="bkm-tab ${B.tab === id ? 'on' : ''}" data-tab="${id}" aria-selected="${B.tab === id}" tabindex="${B.tab === id ? 0 : -1}" data-focus="bkm-tab:${id}">${esc((PL().tabs || {})[id] || id)} <b>${n}</b></button>`;
    let h = card ? `<div class="bkc"><div class="bkm-tabs bkc-tabs" role="tablist" aria-label="버킷리스트">${tab('todo', T.todo.length)}${tab('done', T.done.length)}</div><div class="bkc-panel" role="tabpanel" aria-label="${todo ? '버킷' : '완료'}"><ul class="bkm-lines bkc-lines">`
      : `<div class="bkm-paper-wrap"><div class="bkm-tabs" role="tablist" aria-label="버킷리스트">${tab('todo', T.todo.length)}${tab('done', T.done.length)}</div>` +
      `<section class="bkm-paper" role="tabpanel" aria-label="${todo ? '버킷' : '완료'}">${img('memo_pin', 'bkm-pin', '')}<header class="bkm-head">${img('memo_title_bucket', 'bkm-title', '하고 싶은 것')}</header><ul class="bkm-lines">`;
    items.forEach((it) => { h += lineHtml(it, !todo, card); });
    if (!items.length && !(todo && B.adding)) {
      h += todo ? `<li class="bkm-empty">${esc(PL().emptyTodo || '하고 싶은 걸 한 줄 적어 보세요.')}</li>` : `<li class="bkm-empty">${esc(PL().emptyDone || '아직 끝낸 게 없어요.')}<small>${esc(PL().emptyDoneSub || '')}</small></li>`;
    }
    if (todo && canWrite()) {
      h += B.adding ? `<li class="bkm-it adding">${box(false, card, 0)}<input class="bkm-in bkm-in-add${B.err ? ' bad' : ''}" maxlength="${BK.TEXT_MAX}" placeholder="${esc(PL().holder || '')}" value="${esc(B.draft)}" aria-label="하고 싶은 일" autocomplete="off">${btns()}</li>`
        : `<li class="bkm-addline"><button type="button" class="bkm-add" data-focus="bkm-add">${esc(PL().add || '+ 적기')}</button></li>`;
    }
    h += '</ul>' + (B.err ? `<p class="bkm-err" role="alert">${esc(B.err)}</p>` : '') + (card ? '</div></div>' : '</section></div>');
    return `<div class="bkm-body${card ? ' bkc-body' : ''}">${h}</div>`;
  }
  function undoHtml() { return B.undoItem ? `<span class="bkm-undo" role="status"><span>${esc((PL().removedNote || '{text} 지웠어요').replace('{text}', B.undoItem.text))}</span><button type="button" class="bkm-restore" data-focus="bkm-restore">${esc(PL().undo || '되돌리기')}</button></span>` : ''; }
  function barHtml() {
    return (B.undoItem ? `<span class="bkm-undo" role="status"><span>${esc((PL().removedNote || '{text} 지웠어요').replace('{text}', B.undoItem.text))}</span><button type="button" class="bkm-restore" data-focus="bkm-restore">${esc(PL().undo || '되돌리기')}</button></span>` : '') +
      (root.PHMemoWall && root.PHMemoWall.on() && root.PH_SETTINGS && root.PH_SETTINGS.MEMO_WALL_MOVE ? `<button type="button" class="bkm-move">${esc(PL().move || '붙일 자리 바꾸기')}</button>` : '') + `<span class="bkm-esc" aria-hidden="true">${esc(PL().keys || 'Esc 닫기')}</span>`;
  }

  // ---- 연결 (집 창 / 사이드바 탭) ----
  let EL = null, BAR = null, PAINT = null, TABPAINT = null; // TABPAINT = 사이드바 탭 쪽 (창을 닫으면 다시 이쪽)
  function repaint(focus) { if (PAINT) PAINT(focus); }
  function bind(el, bar) {
    EL = el; BAR = bar || null;
    el.querySelectorAll('.bkm-tab').forEach((b) => {
      b.addEventListener('click', () => setTab(b.dataset.tab));
      b.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); setTab(B.tab === 'todo' ? 'done' : 'todo'); } });
    });
    el.querySelectorAll('.bkm-chk').forEach((b) => b.addEventListener('click', () => toggle(b.closest('.bkm-it').dataset.sig)));
    el.querySelectorAll('.bkm-t').forEach((t) => {
      t.addEventListener('dblclick', () => startEdit(t.closest('.bkm-it').dataset.sig));
      t.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); startEdit(t.closest('.bkm-it').dataset.sig); } });
    });
    const add = el.querySelector('.bkm-add'); if (add) add.addEventListener('click', () => { B.adding = true; B.draft = ''; B.err = ''; B.edit = null; repaint('.bkm-in-add'); });
    const ai = el.querySelector('.bkm-in-add');
    if (ai) {
      ai.addEventListener('input', () => { B.draft = ai.value; if (B.err) { B.err = ''; ai.classList.remove('bad'); const p = el.querySelector('.bkm-err'); if (p) p.remove(); } });
      ai.addEventListener('keydown', (e) => { if (e.isComposing || e.keyCode === 229) return; e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); addItem(); } else if (e.key === 'Escape') { e.preventDefault(); B.adding = false; B.err = ''; repaint('.bkm-add'); } });
      const li = ai.closest('.bkm-it');
      // 저장 = Enter와 같음 (누르는 순간 글자 확정 뒤 칸 값을 읽음). 그만두기 = Esc와 같음
      li.querySelector('.bkm-save').addEventListener('click', () => { B.draft = ai.value; addItem(); });
      li.querySelector('.bkm-cancel').addEventListener('click', () => { B.adding = false; B.err = ''; repaint('.bkm-add'); });
    }
    const ei = el.querySelector('.bkm-in-edit');
    if (ei) {
      ei.addEventListener('input', () => { B.editDraft = ei.value; });
      ei.addEventListener('keydown', (e) => { if (e.isComposing || e.keyCode === 229) return; e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } else if (e.key === 'Escape') { e.preventDefault(); const s = B.edit; B.edit = null; B.err = ''; repaint(`[data-focus="bkm-t:${cssq(s)}"]`); } });
      const del = el.querySelector('.bkm-del'); if (del) { del.addEventListener('mousedown', (e) => e.preventDefault()); del.addEventListener('click', () => remove(B.edit)); }
      const li = ei.closest('.bkm-it');
      li.querySelector('.bkm-save').addEventListener('click', () => { B.editDraft = ei.value; saveEdit(); });
      li.querySelector('.bkm-cancel').addEventListener('click', () => { const s = B.edit; B.edit = null; B.err = ''; repaint(`[data-focus="bkm-t:${cssq(s)}"]`); });
    }
    if (bar) {
      const rs = bar.querySelector('.bkm-restore'); if (rs) rs.addEventListener('click', undo);
      const mv = bar.querySelector('.bkm-move'); if (mv) mv.addEventListener('click', async () => { // 사이드바 탭에서 누르면 집 화면으로 먼저
        if (!root.PHMemoWall) return;
        if (root.PHApp && root.PHApp.tab !== 'home' && root.PHApp.selectTab) { await root.PHApp.selectTab('home'); await new Promise((r) => setTimeout(r, 120)); }
        root.PHMemoWall.start();
      });
    }
  }
  const cssq = (s) => String(s).replace(/["\\]/g, '\\$&');
  function setTab(t) { if (t !== 'todo' && t !== 'done') return; B.tab = t; B.adding = false; B.edit = null; B.err = ''; repaint(`[data-focus="bkm-tab:${t}"]`); }
  function startEdit(sig) { if (!canWrite()) return; const it = BK.parse(Life.data.lines).items.find((x) => x.sig === sig); if (!it) return; B.edit = sig; B.editDraft = it.text; B.adding = false; B.err = ''; repaint('.bkm-in-edit'); }

  // ---- 저장 ----
  const lastPick = {};
  function say(list, k, v) {
    if (!Array.isArray(list) || !list.length) return;
    const c = list.length > 1 ? list.filter((t) => t !== lastPick[k]) : list, t = c[Math.floor(Math.random() * c.length)]; lastPick[k] = t;
    const text = Life.fill(t, v || {}); B.said = { key: k, text };
    if (B.isOn && EL) { const p = $('bkm') && $('bkm').querySelector('.bkm-line'); if (p) { p.textContent = text; p.parentElement.hidden = false; } } // 집 창: 말풍선이 메모지에 가려져 아래 한 줄 (냉장고 메모지와 같음)
    if (root.PHApp && root.PHApp.sideSay) root.PHApp.sideSay(text);
  }
  async function run(call, onOk) {
    if (B.busy || !canWrite()) return null;
    B.busy = true; let res = null;
    try {
      res = await call(Life.lastModified);
      Life.data = Md.parse(res.text); Life.lastModified = res.lastModified; Life.readAt = Date.now();
      if (res.conflict) { B.busy = false; B.edit = null; repaint(); say(LN().conflict, 'conflict'); return res; }
      if (res.code) { B.busy = false; B.err = '내용이 비었거나 못 쓰는 글자가 있어요.'; repaint(B.edit ? '.bkm-in-edit' : '.bkm-in-add'); say(LN().badText, 'badText'); return res; }
      onOk(res);
    } catch (e) { B.lastError = String(e.message || e); say(LN().fail, 'fail'); }
    B.busy = false;
    return res;
  }
  function addItem() {
    const v = String(B.draft || '').trim();
    if (!v) { B.adding = false; repaint('.bkm-add'); return null; }
    return run((lm) => D().add(v, lm), (res) => { B.draft = ''; B.err = ''; B.undoItem = null; B.last = { op: 'add', after: res.after }; repaint('.bkm-in-add'); say(LN().added, 'added', { text: v }); });
  }
  function toggle(sig) {
    const it = BK.parse(Life.data.lines).items.find((x) => x.sig === sig); if (!it || B.leaving) return null;
    const done = !it.done;
    return run((lm) => D().done(sig, done, lm), (res) => {
      B.last = { op: done ? 'done' : 'undone', after: res.after }; B.undoItem = null;
      if (done) {
        const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!reduce) { B.leaving = { sig: res.after }; setTimeout(() => { B.leaving = null; repaint(); }, LEAVE_MS); }
        say(LN().done, 'done', { text: it.text });
      } else say(LN().undone, 'undone', { text: it.text });
      repaint(`[data-focus="bkm-chk:${cssq(res.after)}"]`);
    });
  }
  function saveEdit() {
    const sig = B.edit, v = String(B.editDraft || '').trim(); if (!sig) return null;
    if (!v) { B.err = '내용이 비었어요. 지우려면 "지우기"를 눌러 주세요.'; repaint('.bkm-in-edit'); return null; }
    return run((lm) => D().edit(sig, v, lm), (res) => { B.edit = null; B.err = ''; B.last = { op: 'edit', after: res.after }; repaint(res.after ? `[data-focus="bkm-t:${cssq(res.after)}"]` : null); if (!res.unchanged) say(LN().edited, 'edited', { text: v }); });
  }
  function remove(sig) {
    const it = BK.parse(Life.data.lines).items.find((x) => x.sig === sig); if (!it) return null;
    return run((lm) => D().remove(sig, lm), (res) => { B.edit = null; B.err = ''; B.undoItem = { text: it.text, raw: res.before, next: res.next }; B.last = { op: 'remove' }; repaint('.bkm-restore'); say(LN().removed, 'removed', { text: it.text }); });
  }
  function undo() {
    const u = B.undoItem; if (!u) return null;
    return run((lm) => D().add(null, lm, u.next, u.raw), (res) => { B.undoItem = null; B.last = { op: 'undo', after: res.after }; repaint('.bkm-add'); say(LN().undo, 'undo', { text: u.text }); });
  }

  // ---- 집 위 창 (#bkm) ----
  let el = null;
  function build() {
    if (el) return el;
    const stage = $('stage'); if (!stage) return null;
    el = document.createElement('div'); el.id = 'bkm'; el.className = 'bkm'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '버킷리스트 메모지');
    el.innerHTML = `<div class="bkm-box" tabindex="-1"><div class="bkm-slot"></div><div class="memo-bar bkm-bar"></div><p class="memo-say bkm-say" hidden><b class="memo-who"></b><span class="memo-line bkm-line" aria-live="polite"></span></p></div>`;
    stage.appendChild(el);
    el.querySelector('.memo-who').textContent = ((root.PH_DIALOG_LINES || {}).name) || '두부';
    el.addEventListener('mousedown', (e) => { if (e.target === el) { e.preventDefault(); close(); } });
    el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.isComposing || e.keyCode === 229) return; if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); close(); } });
    el.addEventListener('keyup', (e) => e.stopPropagation());
    const cv = $('cv'); if (cv && root.ResizeObserver) new ResizeObserver(fit).observe(cv);
    root.addEventListener('resize', fit);
    return el;
  }
  function fit() {
    if (!el) return; const cv = $('cv'), r = cv ? cv.getBoundingClientRect() : null; if (!r || !r.height) return;
    el.style.setProperty('--du', (r.height / DU_BASE) + 'px');
    const g = root.PHGame && root.PHGame.G; el.style.setProperty('--u', ((g && g.scale) || r.height / 304) + 'px');
  }
  function paintModal(focus) {
    if (!el || !B.isOn) return;
    const slot = el.querySelector('.bkm-slot'), bar = el.querySelector('.bkm-bar');
    slot.innerHTML = Life.data ? html(Life.data) : `<p class="fmt">생활 기록을 읽지 못했어요.</p>`;
    bar.innerHTML = barHtml();
    if (Life.data) bind(slot, bar);
    if (focus) { const f = el.querySelector(focus); if (f) f.focus({ preventScroll: true }); }
  }
  function blockedNow() {
    const g = root.PHGame && root.PHGame.G;
    return !g || g.mode !== 'play' || !g.active || !!g.dialog || (root.PHDialog && root.PHDialog.isOpen()) ||
      ['PHWardrobe', 'PHWaterModal', 'PHInventory', 'PHFridgeMemo', 'PHBookModal', 'PHRecordModal', 'PHLogModal', 'PHMemoWall'].some((k) => root[k] && root[k].isOpen && root[k].isOpen());
  }
  async function open(from) {
    if (B.isOn || blockedNow()) return false;
    build(); if (!el) return false;
    const g = root.PHGame && root.PHGame.G; if (g) g.held = [];
    if (root.PHGame && root.PHGame.hideBubble) root.PHGame.hideBubble();
    if (Life && !Life.data) { try { await Life.load(); } catch (e) { /* 아래 글 */ } }
    B.isOn = true; B.from = from || null; B.opened++; B.adding = false; B.edit = null; B.err = ''; B.tab = 'todo';
    PAINT = paintModal; el.hidden = false; fit(); paintModal('[data-focus="bkm-tab:todo"]');
    el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
    const o = LN().open || []; say(root.PHMemoWall && root.PHMemoWall.on() ? o : o.slice(1), 'open'); // open[0] "벽에 붙은 메모지"는 벽에 붙어 있을 때만 (부기 원고 주석)
    return true;
  }
  function close() {
    if (!B.isOn || B.busy) return;
    B.isOn = false; el.hidden = true; B.adding = false; B.edit = null; B.err = '';
    PAINT = TABPAINT && document.contains(TABPAINT.wrap) ? TABPAINT : null; if (PAINT) PAINT();
    const st = $('stage'); if (st) st.focus({ preventScroll: true });
  }
  root.addEventListener('keydown', (e) => { if (!B.isOn || (el && el.contains(e.target))) return; e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key !== 'Tab') e.preventDefault(); }, true);
  root.addEventListener('keyup', (e) => { if (B.isOn && !(el && el.contains(e.target))) e.stopPropagation(); }, true);

  // ---- 사이드바 "버킷리스트" 탭 (+ 비었을 때 생활 습관 맨 아래 칸): 같은 종이로 바꿔 끼움 (데스크톱 앱일 때만) ----
  function mountTab(tab, page, d) {
    if (!d || !d.lines || !canWrite()) return;
    let host = null;
    if (tab === 'bucket') host = page.querySelector('ul.bucket') || page.querySelector('.life-dubu');
    if (tab === 'habits') { const c = page.querySelector('.bucket-card'); if (c) host = c.querySelector('ul.bucket') || c.querySelector('.life-dubu'); }
    if (!host) return;
    // 카드 모양 = 생활 습관 탭 (2026-10-08 제작자) + 사이드바 "버킷리스트" 탭 (피드백 2 제작자: "사이드바에서는 메모지에서 카드 모양으로"). 메모지 = 집 벽 메모지 창(#bkm)만
    const card = true;
    const wrap = document.createElement('div'); wrap.className = 'bkm-cardwrap';
    wrap.innerHTML = '<div class="bkm-slot"></div><div class="memo-bar bkm-bar"></div>';
    if (tab === 'bucket') { // 탭 쪽은 카드 틀이 없어서 생활 습관 탭과 같은 카드(.card.bucket-card)로 감쌈. 제목은 탭 머리에 있어 카드 안 제목은 뺌
      const sec = document.createElement('section'); sec.className = 'card bucket-card bkc-tabcard'; sec.dataset.card = '버킷리스트'; sec.appendChild(wrap);
      const cards = document.createElement('div'); cards.className = 'cards'; cards.appendChild(sec);
      host.replaceWith(cards);
    } else host.replaceWith(wrap);
    if (tab === 'bucket') { const ro = page.querySelector('.life-src .ro'); if (ro) { ro.textContent = '버킷 적기 가능 · 버킷리스트에 적혀요'; ro.classList.add('rw'); } }
    const paintTab = (focus) => {
      if (B.isOn) { paintModal(focus); return; }
      const slot = wrap.querySelector('.bkm-slot'), bar = wrap.querySelector('.bkm-bar');
      slot.innerHTML = html(Life.data, { card }); bar.innerHTML = undoHtml(); bind(slot, bar);
      if (focus) { const f = wrap.querySelector(focus); if (f) f.focus({ preventScroll: true }); }
    };
    paintTab.wrap = wrap; TABPAINT = paintTab; if (!B.isOn) PAINT = paintTab; paintTab();
  }
  (Life.renderHooks = Life.renderHooks || []).push(mountTab);

  function state() {
    const d = Life.data, T = d ? BK.tabs(BK.parse(d.lines)) : { todo: [], done: [] };
    const box = B.isOn ? el : document.querySelector('.bkm-cardwrap');
    return { open: B.isOn, from: B.from, opened: B.opened, tab: B.tab, adding: B.adding, edit: B.edit, err: B.err, leaving: B.leaving && B.leaving.sig, undo: !!B.undoItem, said: B.said, last: B.last, lastError: B.lastError,
      todo: T.todo.map((x) => x.text), done: T.done.map((x) => x.text + (x.doneDate ? '@' + x.doneDate : '')),
      shown: box ? [...box.querySelectorAll('.bkm-it:not(.adding) .bkm-t')].map((x) => x.textContent) : [], tabs: box ? [...box.querySelectorAll('.bkm-tab')].map((x) => x.textContent) : [] };
  }
  Object.assign(B, { html, bind, open, close, isOpen: () => B.isOn, state, setTab, toggle, addItem, remove, undo, startEdit, saveEdit, canWrite });
  root.PHBucketMemo = B;
})(window);
