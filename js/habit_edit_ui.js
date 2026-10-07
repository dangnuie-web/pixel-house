// 습관 편집 화면 (2026-10-04 비트, 제작자 "메뉴 내가 추가하거나 없앨 수 있게"). life.js는 거의 안 고치고 Life.renderHooks로 끼운다.
//   생활 습관 탭의 오늘(목표)·안전장치·기록·살림 카드 제목 줄에 "편집" 버튼 -> 카드 제목 아래에 편집 칸
//   편집 칸: 습관마다 위로·아래로·고치기·삭제, 맨 아래 "+ 추가". 삭제·고치기 뒤 "되돌리기" 한 번 (다음 편집 전까지)
//   이름을 바꾸면 지난 기록 이름도 같이 바뀜 (2026-10-04 제작자 결정). 되돌리기 = 이전 값으로 다시 고치기 -> 지난 기록 이름도 원래대로
//   추가·고치기 칸: 이름, 기준(기록은 단위), 주기(오늘·살림 = 매일/주/월 + n회, 안전장치 = 매일 / 주 n회, 기록 = 없음)
//   물(settings.WATER_HABIT)은 순서만 (정수기·물컵과 이어져 있어서)
//   일지 기능 습관(대변·식사, js/features.js): 이름은 고정(순서·삭제만). 표에 한 번도 없었으면 화면에만 보이는 줄(지우면 = 꺼짐 표시, 파일 그대로)
//   꺼진 일지 기능은 기록 카드 편집 칸 아래 "일지 기능 + 대변 일지"로 다시 더함 (표 끝에 정해진 줄, 지난 기록은 그대로 다시 보임) (2026-10-04)
// 쓰기는 모두 메인(electron/habit_ipc.js, window.PHHabitDesktop). 화면은 이름·값·읽은 시각만 보냄. 값 검사는 js/habit_edit.js를 같이 써서 먼저 알려 줌(메인이 다시 검사)
(function (root) {
  'use strict';
  const Life = root.PHLife, Md = root.PHLifeMd, HE = root.PHHabitEdit, HC = root.PHHabitCycle, HH = root.PHHousehold;
  const L = () => root.PH_HABIT_EDIT_LINES || {}, P = () => root.PH_HABIT_EDIT_PLAIN || {};
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const D = () => root.PHHabitDesktop;
  const canWrite = () => !!(D() && D().addHabit && root.PHDesktop);
  // 카드 -> 파일 종류. 살림 카드는 household_card.js가 끼운 것 (data-card="살림")
  const CARDS = [
    { sel: '.kind[data-kind="목표"]', kind: '목표' }, { sel: '.kind[data-kind="안전장치"]', kind: '안전장치' },
    { sel: '.kind[data-kind="기록"]', kind: '기록' }, { sel: '[data-card="살림"]', kind: '살림' },
  ];
  // open: 편집 칸 열린 종류, form: { kind, mode: 'add' | 'edit', name(고치는 습관), v: 입력 중 값 }
  // undo (되돌리기 한 번): 지운 줄 { kind, removed, before, raw } 또는 고친 줄 { kind, update: true, name(지금 이름), prev(고치기 전 값) }
  const St = { open: {}, form: null, err: '', undo: null, busy: false, log: [], last: null };

  function say(text) { if (!text) return; St.log.push(text); if (root.PHApp && root.PHApp.sideSay) root.PHApp.sideSay(text); }
  const lastPick = {};
  function line(path, vars) {
    const list = path.split('.').reduce((o, k) => (o ? o[k] : null), L());
    let t = list;
    if (Array.isArray(list)) { const c = list.length > 1 ? list.filter((x) => x !== lastPick[path]) : list; t = c[Math.floor(Math.random() * c.length)]; lastPick[path] = t; }
    return Life.fill(t || '', vars || {});
  }

  // 이 종류의 습관 줄 (살림 줄이 파일에 없으면 화면에만 보이는 기본 5개, isDefault)
  function rowsOf(d, kind) {
    const rows = (d.habits ? d.habits.rows : []).filter((r) => r.kind === kind);
    if (kind === HE.KIND.house && !rows.length && HH) return HH.view(d.lines.join('\n'), d).chores.map((c) => ({ name: c.name, kind, target: c.target, cycle: c.cycle, isDefault: true }));
    if (kind === HE.KIND.log && FS()) return rows.concat(FX().fnHabits().filter((f) => FS().state(f.id) === 'virtual').map((f) => ({ name: f.habit, kind, target: f.target, cycle: '-', isVirtual: true, fn: f })));
    return rows;
  }
  const isWater = (r) => r.name === HE.water();
  const FX = () => root.PHFeatures, FS = () => root.PHFurnish, FL = () => root.PH_FURNISH_LINES || {}, FP = () => root.PH_FURNISH_PLAIN || {};
  const fnOf = (r) => (FX() ? FX().byHabit(r.name) : null);
  // 꺼진 일지 기능 (기록 카드에서 다시 더할 수 있는 것)
  const fnOff = () => (FX() && FS() ? FX().fnHabits().filter((f) => FS().state(f.id) === 'off') : []);
  function fnLine(path, vars) { const v = FL()[path]; const t = Array.isArray(v) ? v[0] : v; return Life.fill(t || '', vars || {}); }
  const cycleText = (r) => (r.kind === HE.KIND.log ? '' : r.cycle);

  // ---- 그리기 ----
  function panel(d, kind) {
    const rows = rowsOf(d, kind), p = P(), f = St.form && St.form.kind === kind ? St.form : null;
    let h = `<div class="he-panel" data-kind="${esc(kind)}" role="group" aria-label="${esc(kind)} 편집"><ul class="he-list">`;
    const real = rows.filter((r) => !r.isVirtual).length;
    rows.forEach((r, i) => {
      const nm = esc(r.name), lock = isWater(r), fn = fnOf(r);
      const meta = [r.target && r.target !== '-' ? r.target : '', cycleText(r)].filter(Boolean).join(' · ');
      // 무늬 편집연동화면 v01 (제작자 승인 2026-10-04): [▲▼ 묶음] 이름 기준 ……… [고치기] 삭제 / 잠김(자물쇠 + 글)
      h += `<li class="he-row" data-name="${nm}"><span class="he-order">` +
        `<button type="button" class="he-up" aria-label="${nm} ${esc(p.up)}" data-focus="he-up:${nm}" ${i === 0 || r.isVirtual ? 'disabled' : ''}></button>` +
        `<button type="button" class="he-down" aria-label="${nm} ${esc(p.down)}" data-focus="he-down:${nm}" ${i >= real - 1 || r.isVirtual ? 'disabled' : ''}></button></span>` +
        `<span class="he-name"><b>${nm}</b><small>${esc(meta)}</small></span><span class="he-btns">` +
        (lock ? `<span class="he-lock" title="${esc(p.lockWhy)}">${esc(p.lockWater)}</span>` :
          fn ? `<span class="he-lock he-fn-lock" title="${esc(FP().fnLockWhy)}">${esc(FP().fnLock)}</span><button type="button" class="he-del" data-focus="he-del:${nm}">${esc(p.del)}</button>` :
          `<button type="button" class="he-fix" data-focus="he-fix:${nm}">${esc(p.fix)}</button><button type="button" class="he-del" data-focus="he-del:${nm}">${esc(p.del)}</button>`) +
        '</span>' + (f && f.mode === 'edit' && f.name === r.name ? form(kind, f) : '') + '</li>';
    });
    h += '</ul>';
    if (St.undo && St.undo.kind === kind) h += `<div class="he-undo" role="status"><span>${esc(undoNote(St.undo))}</span><button type="button" class="he-undo-b" data-focus="he-undo">${esc(p.undo)}</button></div>`;
    h += f && f.mode === 'add' ? form(kind, f) : `<button type="button" class="he-add" data-focus="he-add:${esc(kind)}">${esc(p.add)}</button>`;
    const off = kind === HE.KIND.log && canWrite() ? fnOff() : [];
    if (off.length) h += `<div class="he-fn-picks" role="group" aria-label="${esc(FP().fnPick)}"><span class="he-lab">${esc(FP().fnPick)}</span>` +
      off.map((x) => `<button type="button" class="he-fn-add" data-fn="${esc(x.id)}" data-focus="he-fn-add:${esc(x.id)}">+ ${esc(x.label)}</button>`).join('') + '</div>';
    return h + '</div>';
  }
  const undoNote = (u) => { const p = P(); return u.update ? Life.fill(u.prev.name !== u.name ? p.renamedNote : p.updatedNote, { old: u.prev.name, name: u.name }) : Life.fill(p.removedNote, { name: u.removed.name }); };
  // 추가·고치기 칸
  function form(kind, f) {
    const p = P(), v = f.v || {}, log = kind === HE.KIND.log, safe = kind === HE.KIND.safety;
    const per = v.per || 'day', n = v.n || 1, max = HC.MAX[per];
    let h = `<form class="he-form" data-mode="${f.mode}" data-kind="${esc(kind)}" autocomplete="off">`;
    const bad = (k) => (St.err && errInfo().field === k ? ' err" aria-invalid="true' : '');
    h += `<label class="he-f-name">${esc(p.name)} <input class="he-in-name${bad('name')}" maxlength="${HE.NAME_MAX}" value="${esc(v.name || '')}" placeholder="예: ${log ? '필사' : kind === HE.KIND.house ? '이불 빨래' : '명상'}" data-focus="he-in-name"></label>`;
    h += `<label class="he-f-target">${esc(log ? p.unit : p.target)} <input class="he-in-target${bad('target')}" maxlength="${log ? 4 : HE.TARGET_MAX}" value="${esc(v.target == null || v.target === '-' ? '' : v.target)}" placeholder="${log ? '쪽, 장' : '예: 10분'}"></label>`;
    if (!log) {
      const pers = safe ? ['day', 'week'] : ['day', 'week', 'month'];
      h += `<span class="he-f-cycle" role="group" aria-label="${esc(p.cycle)}"><span class="he-lab">${esc(p.cycle)}</span><select class="he-in-per" aria-label="주기 단위">` + pers.map((x) => `<option value="${x}" ${x === per ? 'selected' : ''}>${esc(p.per[x])}</option>`).join('') + '</select>';
      if (!(safe && per === 'day')) h += `<input class="he-in-n${bad('n')}" type="number" min="1" max="${max}" step="1" value="${Math.min(n, max)}" aria-label="횟수"><span class="he-lab">${esc(p.times)}</span>`;
      h += '</span>';
    }
    // 2줄: 왼쪽 안내·오류 | 오른쪽 저장·그만두기 (무늬 v01). 오류가 있으면 저장 꺼짐 + 이름 칸 표시, 다시 고치면 풀림 (bind)
    const err = errInfo();
    h += '<div class="he-f-foot"><div class="he-f-msg">';
    if (err) h += `<p class="he-err" role="alert"><b>${esc(err.main)}</b>${err.sub ? `<span>${esc(err.sub)}</span>` : ''}</p>`;
    else if (f.mode === 'edit') h += `<p class="he-note">${esc(p.renameNote)}</p>`;
    h += `</div><span class="he-f-btns"><button type="submit" class="he-save"${err ? ' disabled' : ''}>${esc(p.save)}</button><button type="button" class="he-cancel">${esc(p.cancel)}</button></span></div>`;
    return h + '</form>';
  }

  // life.js가 탭을 그린 뒤 부름 (household_card·study_gantt 다음)
  function mount(tab, el, d) {
    if (tab !== 'habits' || !d || !d.habits || !canWrite()) return;
    St.el = el;
    CARDS.forEach((c) => {
      const card = el.querySelector('.cards ' + c.sel); if (!card) return;
      const h3 = card.querySelector('h3'); if (!h3 || h3.querySelector('.he-toggle')) return;
      const open = !!St.open[c.kind];
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'he-toggle' + (open ? ' on' : ''); b.textContent = open ? P().editDone : P().edit;
      b.setAttribute('aria-expanded', String(open)); b.dataset.focus = 'he-toggle:' + c.kind;
      h3.appendChild(b);
      b.addEventListener('click', () => toggle(tab, el, c.kind));
      if (!open) return;
      card.classList.add('he-editing');
      const box = document.createElement('div'); box.innerHTML = panel(d, c.kind);
      const pn = box.firstElementChild, desc = card.querySelector(':scope > .kind-desc');
      (desc || h3).after(pn);
      bind(tab, el, pn, c.kind);
    });
  }
  function toggle(tab, el, kind) {
    St.open[kind] = !St.open[kind];
    if (!St.open[kind]) { if (St.form && St.form.kind === kind) St.form = null; if (St.undo && St.undo.kind === kind) St.undo = null; St.err = ''; }
    else say(line('edit.open'));
    Life.paint(tab, el, 'he-toggle:' + kind);
  }
  function readForm(fm) {
    const q = (s) => fm.querySelector(s);
    return { name: q('.he-in-name').value, target: q('.he-in-target').value, per: q('.he-in-per') ? q('.he-in-per').value : null, n: q('.he-in-n') ? Number(q('.he-in-n').value) : 1 };
  }
  // 오류 표시 (무늬 v01): 글 + 어느 칸 + 2줄 나눔. St.err(글)와 같을 때만 씀 (다른 곳에서 St.err를 바꾸면 자동으로 안 맞음)
  const FIELD = { badName: 'name', dupName: 'name', usedName: 'name', badTarget: 'target', badUnit: 'target', badCycle: 'n' };
  function setErr(text, code, parts) { St.err = text; St.errInfo = { text, field: FIELD[code] || null, main: parts ? parts.main : text, sub: parts ? parts.sub : '' }; }
  const errInfo = () => (St.err && St.errInfo && St.errInfo.text === St.err ? St.errInfo : St.err ? { text: St.err, field: null, main: St.err, sub: '' } : null);
  function bind(tab, el, pn, kind) {
    const on = (sel, fn) => pn.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => fn(b.closest('.he-row') ? b.closest('.he-row').dataset.name : null, b)));
    on('.he-up', (name) => op(tab, el, 'move', { name, dir: -1, kind }, 'he-up:' + name));
    on('.he-down', (name) => op(tab, el, 'move', { name, dir: 1, kind }, 'he-down:' + name));
    on('.he-del', (name) => {
      const r = rowsOf(Life.data, kind).find((x) => x.name === name);
      if (r && r.isVirtual) return hideFn(tab, el, r); // 화면에만 있던 일지 줄 = 꺼짐 표시만
      return op(tab, el, 'remove', { name, kind }, 'he-undo');
    });
    on('.he-fn-add', (x, b) => { const fx = FX().get(b.dataset.fn); if (fx) op(tab, el, 'add', { habit: { kind: HE.KIND.log, name: fx.habit }, kind, fn: fx }, 'he-del:' + fx.habit); });
    on('.he-fix', (name) => {
      const r = rowsOf(Life.data, kind).find((x) => x.name === name); if (!r) return;
      const cy = HC.parseCycle(r.cycle) || { per: 'day', n: 1 };
      St.form = { kind, mode: 'edit', name, v: { name: r.name, target: r.target, per: cy.per, n: cy.n } }; St.err = '';
      Life.paint(tab, el, 'he-in-name');
    });
    on('.he-add', () => { St.form = { kind, mode: 'add', v: { per: kind === HE.KIND.safety ? 'week' : 'day', n: 1 } }; St.err = ''; Life.paint(tab, el, 'he-in-name'); });
    on('.he-undo-b', () => op(tab, el, 'undo', { kind }, 'he-add:' + kind));
    const fm = pn.querySelector('.he-form'); if (!fm) return;
    const per = fm.querySelector('.he-in-per');
    if (per) per.addEventListener('change', () => { St.form.v = readForm(fm); Life.paint(tab, el, null); const s = el.querySelector('.he-in-per'); if (s) s.focus(); });
    fm.addEventListener('submit', (e) => { e.preventDefault(); submit(tab, el, fm); });
    // 오류 뒤 칸을 고치면: 오류 글·칸 표시를 걷고 저장을 다시 켬 (다시 그리지 않음 = 입력 중 커서·한글 조합 그대로)
    fm.addEventListener('input', () => {
      if (!St.err) return;
      St.err = ''; St.errInfo = null;
      const m = fm.querySelector('.he-f-msg'); if (m) m.innerHTML = St.form && St.form.mode === 'edit' ? `<p class="he-note">${esc(P().renameNote)}</p>` : '';
      fm.querySelectorAll('.err').forEach((x) => { x.classList.remove('err'); x.removeAttribute('aria-invalid'); });
      const sv = fm.querySelector('.he-save'); if (sv) sv.disabled = false;
    });
    fm.querySelector('.he-cancel').addEventListener('click', () => cancel(tab, el));
    fm.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return; // 한글 조합 중 Enter·Esc는 글자 확정만
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(tab, el); }
      else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); submit(tab, el, fm); }
    });
    // 첫 그리기에서 이름 칸에 커서를 끝에
    const ni = fm.querySelector('.he-in-name'); if (ni && document.activeElement === ni) ni.setSelectionRange(ni.value.length, ni.value.length);
  }
  function cancel(tab, el) { const f = St.form; St.form = null; St.err = ''; Life.paint(tab, el, f && f.mode === 'edit' ? 'he-fix:' + f.name : f ? 'he-add:' + f.kind : null); }
  // 저장 전에 화면에서 먼저 검사 (메인이 다시 검사). 틀리면 칸 그대로 + 두부 한 줄
  function submit(tab, el, fm) {
    const f = St.form; if (!f) return null;
    const v = readForm(fm); f.v = v;
    const kind = f.kind, codeLine = (e) => { setErr(e.message, e.code); say(line('edit.' + (e.code === 'badTarget' && kind === HE.KIND.log ? 'badUnit' : e.code || 'fail'))); Life.paint(tab, el, 'he-in-name'); return null; };
    let habit;
    try {
      habit = { kind, name: HE.checkName(v.name), target: HE.checkTarget(v.target, kind) };
      if (kind !== HE.KIND.log) { const c = { per: v.per, n: kind === HE.KIND.safety && v.per === 'day' ? 1 : v.n }; HE.checkCycle(c, kind); habit.cycle = c; }
    } catch (e) { return codeLine(e); }
    if (f.mode === 'add') return op(tab, el, 'add', { habit, kind }, 'he-add:' + kind);
    const patch = { target: habit.target };
    if (habit.name !== f.name) patch.newName = habit.name;
    if (habit.cycle) patch.cycle = habit.cycle;
    return op(tab, el, 'update', { name: f.name, patch, kind }, 'he-fix:' + habit.name);
  }

  // ---- 저장 (메인) ----
  async function op(tab, el, kind, a, focus) {
    if (St.busy || !canWrite()) return null;
    St.busy = true;
    const lm = Life.lastModified, Dk = D();
    let res = null;
    try {
      if (kind === 'add') res = await Dk.addHabit(a.habit, lm);
      else if (kind === 'update') res = await Dk.updateHabit(a.name, a.patch, lm);
      else if (kind === 'remove') res = await Dk.removeHabit(a.name, lm);
      else if (kind === 'move') res = await Dk.moveHabit(a.name, a.dir, lm);
      else if (kind === 'undo') {
        const u = St.undo; if (!u) { St.busy = false; return null; }
        if (u.update) res = await Dk.updateHabit(u.name, { newName: u.prev.name, target: u.prev.target, cycle: u.prev.cycle }, lm); // 이전 값으로 다시 고치기 (지난 기록 이름도 원래대로)
        else res = await Dk.addHabit({ kind: u.removed.kind, name: u.removed.name, target: u.removed.target, cycle: u.removed.cycle }, lm, u.before, u.raw);
      }
      Life.data = Md.parse(res.text); Life.lastModified = res.lastModified; Life.readAt = Date.now();
    } catch (e) {
      St.busy = false; St.err = String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); St.last = { op: kind, error: St.err };
      Life.paint(tab, el, focus); say(line('edit.fail')); return null;
    }
    St.busy = false;
    St.last = { op: kind, ok: res.ok, code: res.code || null, conflict: !!res.conflict, unchanged: !!res.unchanged, name: res.name || a.name, date: res.date };
    if (res.conflict) { St.form = null; St.err = ''; await Life.render(tab, el); say(line('edit.conflict')); return res; }
    if (res.code) { // 값 문제: 쓰지 않음. 칸은 그대로 두고 알려 줌
      setErr(res.message || res.code, res.code);
      if (res.code === 'usedName' && root.PH_HABIT_EDIT_USED) { // 지난 기록에만 남은 이름: 이유 + 마지막 기록 날 (제작자 결정 2026-10-04)
        const u = root.PH_HABIT_EDIT_USED(res.usedName || (a.habit && a.habit.name) || (a.patch && a.patch.newName) || '', res.lastDate, 'habit');
        setErr(u.note, 'usedName', { main: u.noteMain, sub: u.noteSub }); St.last.usedName = res.usedName || null; St.last.lastDate = res.lastDate || null;
        Life.paint(tab, el, St.form ? 'he-in-name' : focus); say(u.say); return res;
      }
      const k = res.code === 'badTarget' && a.kind === HE.KIND.log ? 'badUnit' : res.code;
      Life.paint(tab, el, St.form ? 'he-in-name' : focus); say(line('edit.' + (L().edit && L().edit[k] ? k : 'fail'))); return res;
    }
    St.err = '';
    if (kind === 'add') { St.form = null; St.undo = null; say(a.fn ? fnLine('fnAdded', { fn: a.fn.label }) : line('edit.added', { name: res.name })); }
    else if (kind === 'update') {
      St.form = null; St.undo = !res.unchanged && res.prev ? { kind: a.kind, update: true, name: res.name, prev: res.prev } : null;
      say(res.unchanged ? line('edit.same', { name: res.name }) : res.oldName && res.oldName !== res.name ? line('edit.renamed', { name: res.name, old: res.oldName }) : line('edit.updated', { name: res.name }));
      if (St.undo) focus = 'he-undo';
    }
    else if (kind === 'remove') { St.form = null; St.undo = { kind: a.kind, removed: res.removed, before: res.before, raw: res.removedText }; say(line('edit.removed', { name: a.name })); }
    else if (kind === 'move') { St.undo = null; say(res.edge || res.unchanged ? line('edit.edge') : line('edit.moved')); }
    else if (kind === 'undo') {
      const u = St.undo, n = u.update ? u.prev.name : u.removed.name; St.undo = null;
      say(line(u.update ? (u.prev.name !== u.name ? 'edit.renameUndo' : 'edit.fixUndo') : 'edit.undo', { name: n })); focus = 'he-fix:' + n;
    }
    Life.paint(tab, el, focus);
    return res;
  }

  // 화면에만 보이던 일지 기능 줄(아직 표에 한 번도 없음) 지우기 = 앱 설정에 꺼짐 표시. 되돌리기 = 표에 그 줄을 더함 (다시 켜짐)
  async function hideFn(tab, el, r) {
    if (St.busy || !FS()) return null;
    St.busy = true;
    try { await FS().hide(r.fn.id); } catch (e) { St.busy = false; St.err = String(e && e.message || e); Life.paint(tab, el, null); say(line('edit.fail')); return null; }
    St.busy = false; St.form = null; St.err = '';
    St.undo = { kind: r.kind, removed: { name: r.name, kind: r.kind, target: r.target, cycle: '-' }, before: null, raw: null };
    St.last = { op: 'hide', ok: true, name: r.name };
    say(fnLine('fnHidden', { fn: r.fn.label }));
    Life.paint(tab, el, 'he-undo');
    return true;
  }

  (Life.renderHooks = Life.renderHooks || []).push(mount);
  root.PHHabitEditUI = { St, mount, op, state: () => ({ open: Object.assign({}, St.open), form: St.form ? { kind: St.form.kind, mode: St.form.mode, name: St.form.name || null } : null, err: St.err, undo: St.undo ? { kind: St.undo.kind, name: St.undo.update ? St.undo.name : St.undo.removed.name, type: St.undo.update ? 'update' : 'remove', prev: St.undo.update ? St.undo.prev.name : null } : null, last: St.last, log: St.log.slice(), busy: St.busy }) };
})(window);
