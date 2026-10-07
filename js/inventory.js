// 인벤토리 창 (2026-10-03 제작자 지시, 비트). 가구를 누르면 집 화면 위에 뜨는 둥근 창 (물 창·옷장 창과 같은 결, du 단위). css/inventory.css
//   가구 -> 처음 탭: 거실 수납선반 하단장 = 생활용품, TV장 아래 장 = 잡화, 주방장 = 생활용품 > 주방 알약, 옷방 원형 거울 하단 서랍 = 화장품, 냉장고 = 메모지 창의 "냉장고 열기" -> 식재료
//   위쪽 큰 탭 4개(식재료/생활용품/화장품/잡화, 제작자 2026-10-03 주방을 생활용품 알약으로 합침)를 오가며 바꿈(말 없음). 안쪽 알약: 식재료(냉장고/냉동실/실온), 생활용품(생활/욕실/주방/청소)
//   아이템 칸: 아이콘, 이름, 수량(− n +), 생활필수품 ★, 빼기(바로 "되돌리기" 한 번). 화장품 립스틱·볼터치 = 색 칩
//   각 탭 "+ 추가": 이름 + 알약. 아이콘은 "알 수 없는 물건"
//   저장 = PHHouse.save('inv') -> 메인 ph:invOp (섹션 안 줄만, 백업, 충돌이면 안 씀). 파일에 섹션이 없으면 기본 아이템을 화면에만 보여 주고 처음 바꿀 때 씀
// 키: ←→ = 탭 (글 칸 밖에서), Esc = 닫기(추가 칸이 열려 있으면 그것 먼저). 바깥(어두운 곳) 클릭 = 닫기. 열린 동안 집 조작 막음(물 창과 같은 방식)
// 보기 방식 (2026-10-05 제작자 승인, 무늬 인벤토리그리드 v01 + 제작자 결정): 목록(지금 그대로) / 칸(그리드)
//   토글 = 알약 줄 오른쪽 끝 (알약 없는 탭도 같은 높이 줄에 토글만). 마지막 보기 = localStorage pixel-house.invView (창 전체 하나)
//   칸: 한 줄 6칸(제작자 결정, 문서 원안), 아이콘 32du = 16px 그림 2배를 실제 화면 픽셀 16의 정수배로(fit), 이름 한 줄 말줄임, 수량 배지(1개면 숨김, 0은 속 빈 배지 + 흐리게), 필수 ★ 왼쪽 위, 마지막 = 점선 "추가" 칸
//   칸을 누르면 아래 고정 높이 수정 줄(− 수량 + ★ ✕, 화장품 색 칩) / 빼면 그 줄에 되돌리기. 칸 모드에선 아래 "+ 추가" 숨김
//   키: 칸에 포커스면 화살표·Home·End = 칸 이동(먼저), 그 밖엔 ←→ = 탭. Enter·Space 고르기. Esc = 입력 줄 닫기 -> 선택 풀기 -> 창 닫기
//   보기를 바꿀 때 창 위 가장자리가 안 움직이게 위 기준으로 고정(열려 있는 동안, 아래가 넘치면 그만큼만 올림)
(function (root) {
  'use strict';
  const H = root.PH_HOUSEHOLD, HU = root.PHHouse, esc = HU.esc;
  const $ = (id) => document.getElementById(id);
  const DU_BASE = 432;
  const st = { open: false, cat: 'living', pill: {}, from: null, addOpen: false, undo: null, log: [], opened: 0, view: 'list', sel: null, topDu: null };
  const VIEW_KEY = 'pixel-house.invView', COLS = 6;
  const IC_DU = 32; // 칸 아이콘 = 16px 그림 2배 (무늬 문서 원안). fit()에서 실제 픽셀 16의 정수배로 맞춤
  try { const v = root.localStorage && root.localStorage.getItem(VIEW_KEY); if (v === 'grid' || v === 'list') st.view = v; } catch (e) { /* 저장소 못 씀 = 목록 */ }
  const G = () => st.view === 'grid';
  const fk = (k) => (G() ? 'e-' : '') + k; // 수정 줄 버튼 data-focus는 e- 붙임
  let el = null;
  const q = (s) => el.querySelector(s);
  const P = () => root.PH_HOUSEHOLD_PLAIN || {};
  const catOf = (id) => H.CATS.find((c) => c.id === id);

  function build() {
    if (el) return el;
    const stage = $('stage'); if (!stage) return null;
    el = document.createElement('div');
    el.id = 'inv'; el.className = 'inv'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '살림 물건');
    el.innerHTML = `<div class="inv-box" tabindex="-1">
      <div class="inv-head"><b class="inv-title"></b><button type="button" class="inv-close" aria-label="닫기">✕</button></div>
      <div class="inv-tabs" role="tablist" aria-label="물건 분류"></div>
      <div class="inv-pillrow"><div class="inv-pills" role="group" aria-label="안쪽 분류"></div>
        <span class="inv-view" role="group"><button type="button" class="inv-view-b" data-view="list" data-focus="view:list"></button><button type="button" class="inv-view-b" data-view="grid" data-focus="view:grid"></button></span></div>
      <ul class="inv-list" aria-live="off"></ul>
      <div class="inv-gwrap" hidden><div class="inv-grid" role="group"></div></div>
      <div class="inv-edit" hidden></div>
      <div class="inv-undo" hidden><span class="inv-undo-t"></span><button type="button" class="inv-undo-b"></button></div>
      <div class="inv-add"></div>
      <p class="inv-say"><b class="inv-who"></b><span class="inv-line" aria-live="polite"></span></p>
      <div class="inv-keys" aria-hidden="true"></div></div>`;
    stage.appendChild(el);
    q('.inv-title').textContent = P().invTitle || '살림';
    q('.inv-who').textContent = ((root.PH_DIALOG_LINES || {}).name) || '두부';
    q('.inv-keys').textContent = P().keys || '';
    q('.inv-undo-b').textContent = P().undo || '되돌리기';
    q('.inv-view').setAttribute('aria-label', P().viewLabel || '보기 방식');
    el.querySelectorAll('.inv-view-b').forEach((b) => { const t = b.dataset.view === 'grid' ? (P().viewGrid || '칸으로 보기') : (P().viewList || '목록으로 보기'); b.setAttribute('aria-label', t); b.title = t; });
    q('.inv-view').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); });
    el.addEventListener('mousedown', (e) => { if (e.target === el) { e.preventDefault(); close(); } });
    q('.inv-close').addEventListener('click', close);
    q('.inv-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) setCat(b.dataset.cat, true); });
    q('.inv-pills').addEventListener('click', (e) => { const b = e.target.closest('[data-pill]'); if (b) { st.pill[st.cat] = b.dataset.pill; st.sel = null; st.addOpen = false; paint('pill:' + b.dataset.pill); } });
    q('.inv-list').addEventListener('click', onList);
    q('.inv-edit').addEventListener('click', (e) => { const b = e.target.closest('.inv-undo-b'); if (b) { undo(); return; } onList(e); });
    q('.inv-grid').addEventListener('click', (e) => {
      const b = e.target.closest('.inv-cell'); if (!b) return;
      if (b.dataset.add) { st.addOpen = true; st.sel = null; st.undo = null; paint('add-in'); return; }
      selectCell(b.dataset.cell);
    });
    q('.inv-undo-b').addEventListener('click', undo);
    const cv = $('cv');
    if (cv && root.ResizeObserver) new ResizeObserver(fit).observe(cv);
    root.addEventListener('resize', fit);
    HU.on(() => { if (st.open) paint(); });
    return el;
  }
  function fit() {
    if (!el) return; const cv = $('cv'), h = cv ? cv.getBoundingClientRect().height : 0; if (h <= 0) return;
    const du = h / DU_BASE, dpr = root.devicePixelRatio || 1;
    el.style.setProperty('--du', du + 'px');
    // 픽셀 그림은 실제 화면 픽셀이 그림 1칸의 정수배가 되게 (무늬 v01 구현 메모 2): n칸 그림을 size du로 -> max(1, round(size*du*dpr/n))*n/dpr px
    const snap = (size, n, min) => (Math.max(min || 1, Math.round(size * du * dpr / n)) * n / dpr) + 'px';
    el.style.setProperty('--g-ic', snap(IC_DU, 16, 2));
    el.style.setProperty('--g-tg', snap(8, 8)); el.style.setProperty('--g-star', snap(7, 7)); el.style.setProperty('--g-plus', snap(14, 7));
    place();
  }
  const duPx = () => parseFloat(el.style.getPropertyValue('--du')) || 2;
  // 위 가장자리 고정 (보기 바꿀 때부터 이 창이 닫힐 때까지). topDu = 창 안 위치(du). 아래가 넘치면 넘친 만큼만 올림
  function place() {
    const box = el && q('.inv-box'); if (!box) return;
    if (st.topDu == null) { box.classList.remove('pinned'); box.style.top = ''; return; }
    const d = duPx(), H = el.clientHeight, hb = box.offsetHeight;
    const t = Math.max(2 * d, Math.min(st.topDu * d, H - hb - 4 * d));
    box.classList.add('pinned'); box.style.top = t + 'px';
  }
  function pinTop() {
    const box = q('.inv-box'); if (!box || st.topDu != null) return;
    st.topDu = (box.getBoundingClientRect().top - el.getBoundingClientRect().top) / duPx();
  }
  function setView(v) {
    if ((v !== 'list' && v !== 'grid') || v === st.view) { paint('view:' + v); return; }
    pinTop();
    st.view = v; st.sel = null; st.addOpen = false;
    try { root.localStorage.setItem(VIEW_KEY, v); } catch (e) { /* 저장 못 해도 이번엔 바뀜 */ }
    paint('view:' + v);
  }
  function selectCell(name) { st.sel = st.sel === name ? null : name; st.undo = null; st.addOpen = false; paint('cell:' + name); }

  // 지금 탭의 보이는 알약 (비어 있으면 숨기는 알약 빼기)
  function pillsOf(cat, items) {
    const hide = (H.HIDE_EMPTY_PILLS || {})[cat.id] || [];
    return cat.pills.filter((p) => !hide.includes(p) || items.some((i) => i.cat === cat.id && i.pill === p));
  }
  function curPill(cat, items) {
    const ps = pillsOf(cat, items); if (!ps.length) return '';
    if (!ps.includes(st.pill[cat.id])) st.pill[cat.id] = ps[0];
    return st.pill[cat.id];
  }
  function shown(v) {
    const cat = catOf(st.cat), pill = curPill(cat, v.items);
    return v.items.filter((i) => i.cat === cat.id && (!cat.pills.length || i.pill === pill));
  }

  function paint(focus) {
    if (!el) return;
    const v = HU.view() || { items: [], itemsDefault: true };
    const cat = catOf(st.cat);
    q('.inv-tabs').innerHTML = H.CATS.map((c) => `<button type="button" role="tab" class="inv-tab ${c.id === st.cat ? 'on' : ''}" data-cat="${c.id}" aria-selected="${c.id === st.cat}" data-focus="tab:${c.id}"><canvas class="inv-tab-ic" data-tab="${c.id}" width="16" height="16" aria-hidden="true"></canvas>${esc(c.name)}</button>`).join('');
    q('.inv-tabs').querySelectorAll('canvas.inv-tab-ic').forEach((c) => { if (!HU.drawTab(c, c.dataset.tab)) c.remove(); });
    const pills = pillsOf(cat, v.items), pill = curPill(cat, v.items);
    q('.inv-pills').hidden = !pills.length; // 알약 줄(.inv-pillrow)은 늘 남고 토글이 오른쪽 끝
    q('.inv-pills').innerHTML = pills.map((p) => `<button type="button" class="inv-pill ${p === pill ? 'on' : ''}" data-pill="${esc(p)}" aria-pressed="${p === pill}" data-focus="pill:${esc(p)}">${esc(p)}</button>`).join('');
    el.querySelectorAll('.inv-view-b').forEach((b) => { const on = b.dataset.view === st.view; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    const list = shown(v), grid = G();
    if (st.sel && !list.some((i) => i.name === st.sel)) st.sel = null;
    el.dataset.view = st.view;
    q('.inv-list').hidden = grid; q('.inv-gwrap').hidden = !grid; q('.inv-edit').hidden = !grid;
    if (grid) { q('.inv-list').innerHTML = ''; paintGrid(cat, list); }
    else {
      q('.inv-grid').innerHTML = ''; q('.inv-edit').innerHTML = '';
      q('.inv-list').innerHTML = list.length ? list.map(rowHtml).join('') : `<li class="inv-empty">${esc('비어 있어요')}</li>`;
      q('.inv-list').querySelectorAll('canvas.inv-ic').forEach((c) => { const it = list.find((i) => i.name === c.dataset.name); if (it) HU.drawIcon(c, it); });
    }
    el.dataset.cat = st.cat; el.dataset.pill = pill; el.dataset.default = v.itemsDefault ? '1' : '';
    q('.inv-keys').textContent = grid ? (P().keysGrid || P().keys || '') : (P().keys || '');
    paintUndo(); paintAdd(cat, pills, pill);
    place();
    if (focus) { const f = Array.from(el.querySelectorAll('[data-focus]')).find((x) => x.dataset.focus === focus); if (f) f.focus({ preventScroll: false }); }
  }
  // 칸 보기: 칸 + 마지막 "추가" 칸 (로빙 tabindex: 고른 칸, 없으면 첫 칸만 0) + 수정 줄
  function paintGrid(cat, list) {
    const g = q('.inv-grid');
    g.setAttribute('aria-label', `${cat.name} 물건 칸`);
    const add = `<button type="button" class="inv-cell inv-addcell" data-add="1" data-idx="${list.length}" tabindex="-1" aria-label="${esc(P().addCellLabel || '물건 추가')}" data-focus="cell:+add"><i class="inv-plusic" aria-hidden="true"></i><span class="inv-cname" aria-hidden="true">${esc(P().addCell || '추가')}</span></button>`;
    g.innerHTML = list.map(cellHtml).join('') + add;
    g.querySelectorAll('canvas.inv-gic').forEach((c) => { const it = list.find((i) => i.name === c.dataset.name); if (it) HU.drawIcon(c, it); });
    const cells = g.querySelectorAll('.inv-cell'), si = st.sel ? list.findIndex((i) => i.name === st.sel) : -1;
    cells[si >= 0 ? si : 0].tabIndex = 0;
    paintEdit();
  }
  function cellHtml(i, idx) {
    const n = esc(i.name), on = st.sel === i.name, kind = H.COLOR_ITEMS[i.name], cur = kind ? (i.color || H.COLOR_DEFAULT[kind]) : '';
    const label = `${i.name}, ${i.qty}개${i.need ? ', 생활필수품' : ''}${cur ? ', ' + cur : ''}`;
    return `<button type="button" class="inv-cell ${on ? 'on' : ''} ${i.qty === 0 ? 'zero' : ''} ${i.need ? 'need' : ''}" data-cell="${n}" data-idx="${idx}" data-qty="${i.qty}" aria-pressed="${on}" aria-label="${esc(label)}" tabindex="-1" data-focus="cell:${n}">` +
      (i.need ? '<i class="inv-star" aria-hidden="true"></i>' : '') +
      `<canvas class="inv-gic" data-name="${n}" width="16" height="16" aria-hidden="true"></canvas>` +
      (i.qty !== 1 ? `<b class="inv-badge" aria-hidden="true">${i.qty}</b>` : '') + // 1개는 숫자 숨김 (제작자 결정)
      `<span class="inv-cname" aria-hidden="true">${n}</span></button>`;
  }
  // 수정 줄 (늘 같은 높이): 안내 / 고른 물건 한 줄(목록 줄과 같은 부품, data-focus e-) / 방금 뺌 + 되돌리기
  function paintEdit() {
    const box = q('.inv-edit'), it = st.sel ? itemNow(st.sel) : null;
    box.className = 'inv-edit'; box.removeAttribute('data-name'); box.removeAttribute('role'); box.removeAttribute('aria-label'); box.setAttribute('aria-live', 'polite');
    if (st.undo) { box.classList.add('undo'); box.innerHTML = `<span class="inv-hint">${esc(st.undo.item.name)} 뺐어요</span><button type="button" class="inv-undo-b" data-focus="e-undo">${esc(P().undo || '되돌리기')}</button>`; return; }
    if (!it) { box.innerHTML = `<span class="inv-hint">${esc(P().editHint || '')}</span>`; return; }
    box.classList.add('has'); if (it.qty === 0) box.classList.add('zero');
    box.dataset.name = it.name; box.setAttribute('role', 'group'); box.setAttribute('aria-label', `${it.name} 수정`);
    box.innerHTML = rowInner(it, 'e-');
    const c = box.querySelector('canvas.inv-ic'); if (c) HU.drawIcon(c, it);
  }
  function rowHtml(i) {
    return `<li class="inv-item ${i.qty === 0 ? 'zero' : ''} ${i.need ? 'need' : ''}" data-name="${esc(i.name)}" data-qty="${i.qty}">${rowInner(i, '')}</li>`;
  }
  function rowInner(i, pre) {
    const n = esc(i.name), kind = H.COLOR_ITEMS[i.name], colors = kind ? H.COLORS[kind] : null, cur = kind ? (i.color || H.COLOR_DEFAULT[kind]) : '';
    const chips = colors ? `<span class="inv-colors" role="group" aria-label="${n} 색">` + colors.map((c) => `<button type="button" class="inv-chip ${c.name === cur ? 'on' : ''}" data-color="${esc(c.name)}" style="--chip:${c.hex}" aria-pressed="${c.name === cur}" aria-label="${n} 색 ${esc(c.name)}" title="${esc(c.name)}" data-focus="${pre}chip:${n}:${esc(c.name)}"></button>`).join('') + '</span>' : '';
    return `<canvas class="inv-ic" data-name="${n}" width="16" height="16" aria-hidden="true"></canvas>
      <span class="inv-name">${n}${cur ? `<small class="inv-cur">${esc(cur)}</small>` : ''}</span>${chips}
      <span class="inv-qty"><button type="button" class="inv-minus" aria-label="${n} 하나 줄이기" ${i.qty <= 0 ? 'disabled' : ''} data-focus="${pre}minus:${n}">−</button><b class="inv-n">${i.qty}</b><button type="button" class="inv-plus" aria-label="${n} 하나 늘리기" data-focus="${pre}plus:${n}">+</button></span>
      <button type="button" class="inv-need ${i.need ? 'on' : ''}" aria-pressed="${i.need}" aria-label="${n} 생활필수품" title="생활필수품" data-focus="${pre}need:${n}">★</button>
      <button type="button" class="inv-del" aria-label="${n} 목록에서 빼기" title="빼기" data-focus="${pre}del:${n}">✕</button>`;
  }
  function paintUndo() {
    const u = q('.inv-undo');
    u.hidden = !st.undo || G(); // 칸 보기에선 수정 줄 안에
    if (st.undo) q('.inv-undo-t').textContent = `${st.undo.item.name} 뺐어요`;
  }
  function paintAdd(cat, pills, pill) {
    const box = q('.inv-add');
    box.hidden = G() && !st.addOpen; // 칸 보기: 아래 "+ 추가" 숨김 (마지막 칸이 추가)
    if (!st.addOpen && G()) { box.innerHTML = ''; return; }
    if (!st.addOpen) { box.innerHTML = `<button type="button" class="inv-add-open" data-focus="add-open">${esc(P().add || '+ 추가')}</button>`; box.querySelector('button').addEventListener('click', () => { st.addOpen = true; paint('add-in'); }); return; }
    const opts = cat.pills.length ? `<select class="inv-add-pill" aria-label="안쪽 분류">${cat.pills.map((p) => `<option value="${esc(p)}" ${p === pill ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>` : '';
    box.innerHTML = `<form class="inv-add-form"><input class="inv-add-in" type="text" maxlength="${H.MAX_NAME}" placeholder="이름" aria-label="새 물건 이름" data-focus="add-in">${opts}` +
      `<button type="submit" class="inv-add-save">${esc(P().addSave || '넣기')}</button><button type="button" class="inv-add-cancel">${esc(P().cancel || '그만두기')}</button></form>`;
    box.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); addNow(); });
    box.querySelector('.inv-add-cancel').addEventListener('click', () => { st.addOpen = false; paint(addBack()); });
  }

  const addBack = () => (G() ? 'cell:+add' : 'add-open');
  function say(text) { if (!text || !el) return; q('.inv-line').textContent = text; st.log.push(text); }
  const itemNow = (name) => { const v = HU.view(); return v ? v.items.find((i) => i.cat === st.cat && i.name === name) : null; };

  async function run(op, onOk, focus) {
    const res = await HU.save('inv', Object.assign({ cat: st.cat }, op));
    if (res.busy) return res;
    const bad = HU.problemLine(res);
    if (bad) { paint(focus); say(bad); return res; }
    if (op.type !== 'remove') st.undo = null;
    paint(focus); say(onOk(res));
    return res;
  }
  async function onList(e) {
    const li = e.target.closest('.inv-item, .inv-edit[data-name]'); if (!li) return;
    const name = li.dataset.name, it = itemNow(name); if (!it) return;
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.classList.contains('inv-plus')) return run({ type: 'qty', name, qty: it.qty + 1 }, () => HU.line('inv.plus'), fk('plus:' + name));
    if (b.classList.contains('inv-minus')) {
      if (it.qty <= 0) return null;
      return run({ type: 'qty', name, qty: it.qty - 1 }, (res) => (res.shop === 'added' ? HU.line('shop.auto_added', { item: name }) : it.qty - 1 === 0 ? HU.line('inv.zero') : HU.line('inv.minus')), fk(it.qty - 1 > 0 ? 'minus:' + name : 'plus:' + name));
    }
    if (b.classList.contains('inv-need')) return run({ type: 'need', name, need: !it.need }, (res) => (res.shop === 'added' ? HU.line('shop.auto_added', { item: name }) : HU.line(it.need ? 'inv.essential_off' : 'inv.essential_on')), fk('need:' + name));
    if (b.classList.contains('inv-chip')) return run({ type: 'color', name, color: b.dataset.color }, () => HU.line('cosmetic.color', { color: b.dataset.color }), fk('chip:' + name + ':' + b.dataset.color));
    if (b.classList.contains('inv-del')) {
      const list = shown(HU.view()), i = list.findIndex((x) => x.name === name), allCat = HU.view().items.filter((x) => x.cat === st.cat), j = allCat.findIndex((x) => x.name === name);
      const before = allCat[j + 1] ? allCat[j + 1].name : '';
      const nextFocus = G() ? 'e-undo' : list[i + 1] ? 'del:' + list[i + 1].name : list[i - 1] ? 'del:' + list[i - 1].name : 'add-open';
      return run({ type: 'remove', name }, (res) => { st.undo = { item: res.removed || it, before, cat: st.cat }; st.sel = null; paint(nextFocus); return HU.line('inv.delete'); }, nextFocus);
    }
    return null;
  }
  async function undo() {
    const u = st.undo; if (!u) return null;
    const i = u.item;
    const res = await HU.save('inv', { type: 'restore', cat: u.cat, name: i.name, pill: i.pill || '', qty: i.qty, need: !!i.need, memo: i.memo || '', before: u.before || '' });
    if (res.busy) return res;
    const bad = HU.problemLine(res);
    st.undo = null;
    if (u.cat !== st.cat) st.cat = u.cat;
    if (i.pill) st.pill[u.cat] = i.pill;
    if (G() && !bad) st.sel = i.name; // 칸 보기: 돌아온 칸을 고른 상태로
    paint(bad ? null : G() ? 'cell:' + i.name : 'del:' + i.name); say(bad || HU.line('inv.undo'));
    return res;
  }
  async function addNow() {
    const inp = q('.inv-add-in'), sel = q('.inv-add-pill'), raw = inp ? inp.value : '', pill = sel ? sel.value : '';
    if (/[|｜]/.test(raw) || !raw.trim()) { say(raw.trim() ? HU.line('tmp.badName') : ''); if (inp) inp.focus(); return null; }
    const name = raw.replace(/\s+/g, ' ').trim();
    const res = await HU.save('inv', { type: 'add', cat: st.cat, name, pill });
    if (res.busy) return res;
    const bad = HU.problemLine(res);
    if (bad) { say(bad); const i2 = q('.inv-add-in'); if (i2) i2.focus(); return res; }
    st.undo = null; st.addOpen = false;
    if (pill) st.pill[st.cat] = pill;
    if (G()) { st.sel = name; paint('cell:' + name); } else paint('plus:' + name); // 칸 보기: 새 칸을 고른 상태로
    say(HU.line('inv.add'));
    return res;
  }
  function setCat(id, focusTab) { if (!catOf(id)) return; st.cat = id; st.addOpen = false; st.sel = null; paint(focusTab ? 'tab:' + id : null); }

  function blockedNow() {
    const g = root.PHGame && root.PHGame.G;
    return !g || g.mode !== 'play' || !g.active || !!g.dialog || (root.PHDialog && root.PHDialog.isOpen()) || (root.PHWardrobe && root.PHWardrobe.isOpen()) ||
      (root.PHWaterModal && root.PHWaterModal.isOpen()) || (root.PHFridgeMemo && root.PHFridgeMemo.isOpen()) || (root.PHBookModal && root.PHBookModal.isOpen()) || ['PHRecordModal', 'PHBucketMemo', 'PHMemoWall'].some((k) => root[k] && root[k].isOpen && root[k].isOpen());
  }
  // interact.js·메모지가 부름. cat = 처음 탭 id, from = 누른 물건 type. 말: inv.open.<탭>
  async function open(cat, from, pill, sayKey) { // sayKey = 대사 inv.open.<키> (주방장 = kitchen, 없으면 탭 id)
    if (st.open || blockedNow()) return false;
    build(); if (!el) return false;
    const g = root.PHGame && root.PHGame.G; if (g) g.held = [];
    if (root.PHGame && root.PHGame.hideBubble) root.PHGame.hideBubble();
    st.open = true; st.from = from || null; st.opened++; st.addOpen = false; st.undo = null; st.sel = null; st.topDu = null;
    st.cat = catOf(cat) ? cat : 'living';
    if (pill && catOf(st.cat).pills.includes(pill)) st.pill[st.cat] = pill; // 메모지 "냉장고 열기" = 냉장고 알약
    await HU.ensure();
    el.hidden = false; fit(); paint('tab:' + st.cat);
    q('.inv-line').textContent = ''; say(HU.line('inv.open.' + (sayKey || st.cat)));
    el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
    return true;
  }
  function close() {
    if (!st.open) return;
    st.open = false; el.hidden = true; st.undo = null;
    const stage = $('stage'); if (stage) stage.focus({ preventScroll: true });
  }
  function onKey(e) {
    if (!st.open) return;
    e.stopPropagation();
    const k = e.key, t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT');
    if (typing) {
      if (e.isComposing || e.keyCode === 229) return; // 한글 조합 중
      if (k === 'Escape') { e.preventDefault(); st.addOpen = false; paint(addBack()); }
      else if (k === 'Enter' && t.tagName === 'INPUT') { e.preventDefault(); addNow(); }
      return;
    }
    const cell = t && t.closest && t.closest('.inv-cell');
    if (cell && /^(Arrow(Left|Right|Up|Down)|Home|End)$/.test(k)) { e.preventDefault(); moveCell(cell, k); return; } // 칸 이동이 탭 이동보다 먼저
    if (k === 'Escape') {
      e.preventDefault();
      if (st.addOpen) { st.addOpen = false; paint(addBack()); }
      else if (G() && st.sel) { const n = st.sel; st.sel = null; paint('cell:' + n); } // 선택 풀기 -> 다시 Esc면 닫기
      else close();
      return;
    }
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      const i = H.CATS.findIndex((c) => c.id === st.cat), n = H.CATS.length;
      setCat(H.CATS[(i + (k === 'ArrowLeft' ? -1 : 1) + n) % n].id, true); return;
    }
    if (k === 'ArrowUp' || k === 'ArrowDown') e.preventDefault(); // 집으로 안 넘김 (목록은 Tab으로)
  }
  function moveCell(cell, k) {
    const cells = Array.from(q('.inv-grid').querySelectorAll('.inv-cell')), n = cells.length, i = cells.indexOf(cell);
    let j = i;
    if (k === 'ArrowRight') j = Math.min(n - 1, i + 1); else if (k === 'ArrowLeft') j = Math.max(0, i - 1);
    else if (k === 'ArrowDown') j = i + COLS < n ? i + COLS : i; else if (k === 'ArrowUp') j = i - COLS >= 0 ? i - COLS : i;
    else if (k === 'Home') j = 0; else if (k === 'End') j = n - 1;
    cells.forEach((x) => { x.tabIndex = -1; }); cells[j].tabIndex = 0; cells[j].focus();
  }
  function onKeyUp(e) { if (st.open) e.stopPropagation(); }
  root.addEventListener('keydown', onKey, true);
  root.addEventListener('keyup', onKeyUp, true);

  function state() {
    const rowsOf = (sel) => (el ? [...el.querySelectorAll(sel)].map((li) => ({ name: li.dataset.name || li.dataset.cell, qty: Number(li.dataset.qty), need: li.classList.contains('need'), icon: (li.querySelector('canvas') || {}).dataset ? li.querySelector('canvas').dataset.icon : null })) : []);
    const rows = G() ? rowsOf('.inv-grid .inv-cell[data-cell]') : rowsOf('.inv-list .inv-item');
    const cells = el && G() ? [...el.querySelectorAll('.inv-grid .inv-cell')].map((b) => ({ name: b.dataset.cell || null, add: !!b.dataset.add, qty: b.dataset.add ? null : Number(b.dataset.qty), badge: b.querySelector('.inv-badge') ? b.querySelector('.inv-badge').textContent : null,
      zero: b.classList.contains('zero'), star: !!b.querySelector('.inv-star'), on: b.classList.contains('on'), tab: b.tabIndex, label: b.getAttribute('aria-label') })) : [];
    const ed = el && G() ? q('.inv-edit') : null;
    const edit = ed ? { name: ed.dataset.name || null, qty: ed.querySelector('.inv-n') ? Number(ed.querySelector('.inv-n').textContent) : null, undo: !!ed.querySelector('.inv-undo-b'), text: ed.textContent.trim(), height: Math.round(ed.getBoundingClientRect().height * 10) / 10 } : null;
    const pills = el ? [...el.querySelectorAll('.inv-pill')].map((b) => b.dataset.pill) : [];
    return { open: st.open, cat: st.cat, pill: el ? el.dataset.pill : '', pills, from: st.from, rows, undo: st.undo ? st.undo.item.name : null, addOpen: st.addOpen, view: st.view, sel: st.sel, cells, edit, cols: COLS,
      focus: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.focus || null : null,
      line: el ? q('.inv-line').textContent : '', log: st.log.slice(), opened: st.opened, busy: HU.S.busy, isDefault: el ? el.dataset.default === '1' : null, lastError: HU.S.lastError };
  }
  root.PHInventory = { open, close, isOpen: () => st.open, state, build, fit, setCat, setView, undo, VIEW_KEY };
})(window);
