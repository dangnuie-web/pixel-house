// 생활 습관 탭 "기록 항목" 칸 (2026-10-08 비트, 로드맵 3단계 "생활습관에서 기록 항목 추가로 새 폼").
//   영화·연극 = 기본(지울 수 없음), "+ 기록 항목 추가" -> 이름 하나 묻는 줄 입력(습관 추가 줄과 같은 모양) -> ## 기록 항목에 한 줄
//   -> 생활일지에 그 이름 탭 + 제목·날짜·요약 폼 (js/record_list.js). 지우기 = 항목만 빠지고 적은 기록은 ## 기록에 남음, 되돌리기 한 번
//   버튼 글·모양 = 습관 편집과 같음 (흰 칩 + 추가, 빨강 글자 지우기, 갈색 되돌리기)
(function (root) {
  'use strict';
  const RW = root.PHRecordWrite, Md = root.PHLifeMd, Life = root.PHLife;
  if (!RW || !Life) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const D = () => root.PHRecordDesktop;
  const L = () => (root.PH_LINES && root.PH_LINES.ui && root.PH_LINES.ui.record) || {};
  const PL = () => (root.PH_LINES && root.PH_LINES.uiPlain && root.PH_LINES.uiPlain.recordKind) || {};
  const K = { form: false, err: '', busy: false, undoItem: null, draft: '', said: null };
  const pickLast = {};
  function say(list, k, v) {
    if (!Array.isArray(list) || !list.length) return;
    const c = list.length > 1 ? list.filter((t) => t !== pickLast[k]) : list, t = c[Math.floor(Math.random() * c.length)]; pickLast[k] = t;
    const text = Life.fill(t, v || {}); K.said = { key: k, text };
    if (root.PHApp && root.PHApp.sideSay) root.PHApp.sideSay(text);
  }
  function html(d) {
    const P = RW.parse(d.lines || []);
    let h = `<section class="card rk-card" data-card="기록 항목"><h3>${esc(PL().title || '기록 항목')}</h3><p class="kind-desc">${esc(PL().note || '')}</p><ul class="rk-list">`;
    P.kinds.forEach((k) => {
      h += `<li class="rk-it"><span class="rk-name">${esc(k.name)}</span>` + (k.custom ? `<button type="button" class="rk-del he-del" data-kind="${esc(k.name)}">${esc(PL().del || '지우기')}</button>` : `<small class="rk-fixed">${esc(PL().fixed || '기본')}</small>`) + '</li>';
    });
    h += '</ul>';
    if (K.undoItem) h += `<div class="rk-undo he-undo" role="status"><span>${esc((PL().removedNote || '{kind} 칸 지웠어요').replace('{kind}', K.undoItem.kind))}</span><button type="button" class="he-undo-b">${esc(PL().undo || '되돌리기')}</button></div>`;
    if (K.form) {
      h += `<div class="rk-form he-form"><label><span class="rk-lab">${esc(PL().name || '항목 이름')}</span><input class="rk-in${K.err ? ' bad' : ''}" maxlength="${RW.KIND_MAX}" autocomplete="off" placeholder="${esc(PL().nameHolder || '')}" value="${esc(K.draft)}"></label>` +
        `<button type="button" class="rk-save he-save">${esc(PL().save || '만들기')}</button><button type="button" class="rk-cancel he-cancel">${esc(PL().cancel || '그만두기')}</button>` +
        `<p class="rk-err" role="alert">${esc(K.err)}</p></div>`;
    } else h += `<button type="button" class="rk-add he-add">${esc(PL().add || '+ 기록 항목 추가')}</button>`;
    return h + '</section>';
  }
  let EL = null;
  function paint(focus) {
    if (!EL || !Life.data) return;
    const old = EL.querySelector('.rk-card'); if (!old) return;
    const box = document.createElement('div'); box.innerHTML = html(Life.data);
    const neu = box.firstElementChild; old.replaceWith(neu); bind(neu);
    if (focus) { const f = neu.querySelector(focus); if (f) f.focus(); }
  }
  function bind(c) {
    const add = c.querySelector('.rk-add'); if (add) add.addEventListener('click', () => { K.form = true; K.err = ''; K.draft = ''; paint('.rk-in'); });
    const inp = c.querySelector('.rk-in');
    if (inp) {
      inp.addEventListener('input', () => { K.draft = inp.value; if (K.err) { K.err = ''; inp.classList.remove('bad'); const p = c.querySelector('.rk-err'); if (p) p.textContent = ''; } });
      inp.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); K.form = false; K.err = ''; paint('.rk-add'); }
        e.stopPropagation();
      });
    }
    const sv = c.querySelector('.rk-save'); if (sv) sv.addEventListener('click', save);
    const cc = c.querySelector('.rk-cancel'); if (cc) cc.addEventListener('click', () => { K.form = false; K.err = ''; paint('.rk-add'); });
    c.querySelectorAll('.rk-del').forEach((b) => b.addEventListener('click', () => remove(b.dataset.kind)));
    const ub = c.querySelector('.rk-undo .he-undo-b'); if (ub) ub.addEventListener('click', undo);
  }
  async function run(call, onOk) {
    if (K.busy || !D()) return null;
    K.busy = true; let res = null;
    try {
      res = await call(Life.lastModified);
      Life.data = Md.parse(res.text); Life.lastModified = res.lastModified; Life.readAt = Date.now();
      if (res.conflict) { K.busy = false; paint(); say(L().conflict, 'conflict'); return res; }
      if (res.code) {
        K.busy = false; K.err = res.code === 'kindDup' ? '같은 이름의 기록 칸이 있어요.' : '이름은 글자로만 12자까지 적을 수 있어요 (기호나 숫자 빼고).';
        paint('.rk-in'); say(L()[res.code] || L().kindBad, res.code); return res;
      }
      onOk(res);
    } catch (e) { K.lastError = String(e.message || e); say(L().fail, 'fail'); }
    K.busy = false;
    return res;
  }
  // 생활일지 탭 목록이 바뀌므로 다시 그림 (다음에 열 때 탭이 맞게)
  const refreshJournal = () => { if (root.PHJournal && root.PHJournal.tab && !root.PHJournal.tabs().some((t) => t.id === root.PHJournal.tab)) root.PHJournal.tab = null; };
  function save() {
    const v = String(K.draft || '').trim();
    if (!v) { K.err = '이름을 적어 주세요.'; paint('.rk-in'); return null; }
    return run((lm) => D().kindAdd(v, lm), (res) => { K.form = false; K.err = ''; K.undoItem = null; K.last = { op: 'add', kind: res.kind }; paint('.rk-add'); say(L().kindAdded, 'kindAdded', { kind: res.kind || v }); });
  }
  function remove(name) {
    return run((lm) => D().kindRemove(name, lm), (res) => { K.undoItem = { kind: name, raw: res.before, next: res.next }; K.last = { op: 'remove', kind: name }; refreshJournal(); paint('.rk-undo .he-undo-b'); say(L().kindRemoved, 'kindRemoved', { kind: name }); });
  }
  function undo() {
    const u = K.undoItem; if (!u) return null;
    return run((lm) => D().kindAdd(null, lm, u.next, u.raw), () => { K.undoItem = null; K.last = { op: 'undo', kind: u.kind }; paint('.rk-add'); say(L().kindUndo, 'kindUndo', { kind: u.kind }); });
  }
  // 생활 습관 탭을 그린 뒤: 데스크톱 앱(쓰기 가능)일 때만, 버킷리스트 칸 앞(없으면 맨 끝)에
  function mount(tab, el, d) {
    if (tab !== 'habits' || !d || !d.lines || !D()) return;
    EL = el; K.form = K.form && !!el.querySelector('.rk-card');
    const box = document.createElement('div'); box.innerHTML = html(d);
    const card = box.firstElementChild, bucket = el.querySelector('[data-card="버킷리스트"]');
    if (bucket) bucket.before(card); else el.appendChild(card);
    bind(card);
  }
  (Life.renderHooks = Life.renderHooks || []).push(mount);
  root.PHRecordKinds = Object.assign(K, { html, mount, save, remove, undo, paint });
})(typeof window !== 'undefined' ? window : globalThis);
