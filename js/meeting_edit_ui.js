// 약속 쓰기 화면 (2026-10-07 비트, 제작자 결정 2026-10-07). life.js·calendar.js는 거의 안 고치고 Life.renderHooks로 끼운다 (달력 다음).
//   달력에서 고른 날 약속 목록(.cal-list): 줄마다 "고치기" "삭제", 목록 아래 "+ 약속 적기". 지난 날짜에도 적을 수 있음
//   적기 칸: 시간(10am, 7:30pm 꼴, 비워도 됨)·내용. Enter = 저장, Esc = 그만두기. 고치기 칸은 날짜도 바꿀 수 있음
//   삭제·고치기 뒤 "되돌리기" 한 번 (다음 쓰기 전까지, 그 날짜를 보고 있을 때 보임) — 습관 편집(js/habit_edit_ui.js)과 같은 관례
//   버튼·입력 모양 = 습관 편집 칸 그대로 (css/habit_edit.css 규칙에 .cal-list 선택자만 더함)
// 쓰기는 모두 메인(electron/meeting_ipc.js, window.PHMeetingDesktop). 화면은 약속 값·고를 줄 글·읽은 시각만 보냄. 값 검사는 js/meeting_edit.js를 같이 써서 먼저 알려 줌(메인이 다시 검사)
// 쓴 뒤 Life.data를 새 글로 바꾸고 약속 탭을 다시 그림 -> 오늘 약속·달력 점·지난 약속이 바로 바뀜. 냉장고 메모지·입장 대사는 Life.data / 파일을 읽으므로 같이 맞음
(function (root) {
  'use strict';
  const Life = root.PHLife, Md = root.PHLifeMd, ME = root.PHMeetingEdit, CAL = root.PHCalendar;
  if (!Life || !ME) return;
  const L = () => (root.PH_LINES && root.PH_LINES.ui && root.PH_LINES.ui.meeting) || {};
  const P = () => Object.assign({}, root.PH_HABIT_EDIT_PLAIN || {}, L().plain || {}); // 저장·그만두기·고치기·삭제·되돌리기 = 습관 편집과 같은 글
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const D = () => root.PHMeetingDesktop;
  const canWrite = () => !!(D() && D().add && root.PHDesktop);
  const TAB = 'meetings';
  // form: { mode: 'add' | 'edit', date(고른 날), sig(고치는 줄 글), v: 입력 중 값 { date, time, text } }
  // undo: 지운 줄 { type: 'remove', date, removed, raw, before } 또는 고친 줄 { type: 'update', date(보이는 날), sig(지금 줄 글), raw(고치기 전 줄 글), prev }
  const St = { form: null, err: '', errInfo: null, undo: null, busy: false, log: [], last: null };

  function say(text) { if (!text) return; St.log.push(text); if (root.PHApp && root.PHApp.sideSay) root.PHApp.sideSay(text); }
  const lastPick = {};
  function line(k, vars) {
    const list = L()[k]; let t = list;
    if (Array.isArray(list)) { const c = list.length > 1 ? list.filter((x) => x !== lastPick[k]) : list; t = c[Math.floor(Math.random() * c.length)]; lastPick[k] = t; }
    return Life.fill(t || '', vars || {});
  }
  const dayText = (s) => { const p = String(s).split('-').map(Number); return p.length === 3 ? `${p[1]}월 ${p[2]}일` : s; };
  const sigOfLine = (d, n) => ME.sigOf((d.lines || [])[n] || '');
  // 화면 줄(data-line) -> 약속 { date, time, text, sig }
  function byLine(d, n) { const m = (d.meetings || []).find((x) => x.line === n); return m ? { date: m.date, time: m.time || '', text: m.text || '', sig: sigOfLine(d, n) } : null; }

  // ---- 그리기 ----
  const FIELD = { badDate: 'date', badTime: 'time', badText: 'text' };
  function setErr(text, code) { St.err = text; St.errInfo = { text, field: FIELD[code] || null }; }
  const errInfo = () => (St.err ? (St.errInfo && St.errInfo.text === St.err ? St.errInfo : { text: St.err, field: null }) : null);
  function form(f) {
    const p = P(), v = f.v || {}, e = errInfo(), bad = (k) => (e && e.field === k ? ' err" aria-invalid="true' : '');
    let h = `<form class="he-form mte-form" data-mode="${f.mode}" autocomplete="off">`;
    if (f.mode === 'edit') h += `<label>${esc(p.date)} <input type="date" class="mte-in-date${bad('date')}" value="${esc(v.date || '')}" data-focus="mte-in-date"></label>`;
    h += `<label>${esc(p.time)} <input class="mte-in-time${bad('time')}" maxlength="${ME.TIME_MAX}" value="${esc(v.time || '')}" placeholder="${esc(p.timeHolder)}" data-focus="mte-in-time"></label>`;
    h += `<label>${esc(p.text)} <input class="mte-in-text${bad('text')}" maxlength="${ME.TEXT_MAX}" value="${esc(v.text || '')}" placeholder="${esc(p.textHolder)}" data-focus="mte-in-text"></label>`;
    h += '<div class="he-f-foot"><div class="he-f-msg">' + (e ? `<p class="he-err" role="alert"><b>${esc(e.text)}</b></p>` : `<p class="he-note">${esc(p.note)}</p>`) + '</div>';
    h += `<span class="he-f-btns"><button type="submit" class="he-save"${e ? ' disabled' : ''}>${esc(p.save)}</button><button type="button" class="he-cancel">${esc(p.cancel)}</button></span></div>`;
    return h + '</form>';
  }
  const undoNote = (u) => Life.fill(u.type === 'update' ? P().updatedNote : P().removedNote, { text: u.type === 'update' ? u.prev.text : u.removed.text });

  function mount(tab, el, d) {
    if (tab !== TAB || !d || !d.meetings || !canWrite()) return;
    St.el = el;
    const list = el.querySelector('.cal .cal-list'); if (!list) return;
    const date = list.dataset.date, p = P();
    const ro = el.querySelector('.life-src .ro'); if (ro) { ro.textContent = p.badge; ro.classList.add('rw'); }
    if (St.form && St.form.date !== date) { St.form = null; St.err = ''; } // 다른 날로 넘어가면 칸 닫음
    list.querySelectorAll('.cal-it').forEach((li) => {
      const m = byLine(d, Number(li.dataset.line)); if (!m) return;
      li.dataset.sig = m.sig;
      const b = document.createElement('span'); b.className = 'he-btns';
      b.innerHTML = `<button type="button" class="he-fix" data-focus="mte-fix:${esc(m.sig)}" aria-label="${esc(m.text)} ${esc(p.fix)}">${esc(p.fix)}</button><button type="button" class="he-del" data-focus="mte-del:${esc(m.sig)}" aria-label="${esc(m.text)} ${esc(p.del)}">${esc(p.del)}</button>`;
      li.appendChild(b);
      if (St.form && St.form.mode === 'edit' && St.form.sig === m.sig) li.insertAdjacentHTML('beforeend', form(St.form));
      b.querySelector('.he-fix').addEventListener('click', () => { St.form = { mode: 'edit', date, sig: m.sig, v: { date: m.date, time: m.time, text: m.text } }; St.err = ''; Life.paint(TAB, el, 'mte-in-text'); });
      b.querySelector('.he-del').addEventListener('click', () => op(el, 'remove', { key: { sig: m.sig }, date }, 'mte-undo'));
    });
    const box = document.createElement('div');
    if (St.undo && St.undo.date === date) box.insertAdjacentHTML('beforeend', `<div class="he-undo" role="status"><span>${esc(undoNote(St.undo))}</span><button type="button" class="he-undo-b" data-focus="mte-undo">${esc(p.undo)}</button></div>`);
    box.insertAdjacentHTML('beforeend', St.form && St.form.mode === 'add' ? form(St.form) : `<button type="button" class="he-add" data-focus="mte-add">${esc(p.add)}</button>`);
    while (box.firstChild) list.appendChild(box.firstChild);
    const ub = list.querySelector('.he-undo-b'); if (ub) ub.addEventListener('click', () => op(el, 'undo', { date }, 'mte-add'));
    const ab = list.querySelector(':scope > .he-add'); if (ab) ab.addEventListener('click', () => { St.form = { mode: 'add', date, v: { date } }; St.err = ''; Life.paint(TAB, el, 'mte-in-time'); });
    const fm = list.querySelector('.mte-form'); if (fm) bindForm(el, fm);
  }
  function readForm(fm) {
    const q = (s) => fm.querySelector(s);
    return { date: q('.mte-in-date') ? q('.mte-in-date').value : St.form.date, time: q('.mte-in-time').value, text: q('.mte-in-text').value };
  }
  function bindForm(el, fm) {
    fm.addEventListener('submit', (e) => { e.preventDefault(); submit(el, fm); });
    // 오류 뒤 칸을 고치면 오류 글·칸 표시를 걷고 저장을 다시 켬 (다시 그리지 않음 = 커서·한글 조합 그대로)
    fm.addEventListener('input', () => {
      if (!St.err) return;
      St.err = ''; St.errInfo = null;
      const m = fm.querySelector('.he-f-msg'); if (m) m.innerHTML = `<p class="he-note">${esc(P().note)}</p>`;
      fm.querySelectorAll('.err').forEach((x) => { x.classList.remove('err'); x.removeAttribute('aria-invalid'); });
      const sv = fm.querySelector('.he-save'); if (sv) sv.disabled = false;
    });
    fm.querySelector('.he-cancel').addEventListener('click', () => cancel(el));
    fm.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return; // 한글 조합 중 Enter·Esc는 글자 확정만
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(el); }
      else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); submit(el, fm); }
    });
    const a = document.activeElement; if (a && fm.contains(a) && a.setSelectionRange && a.type !== 'date') a.setSelectionRange(a.value.length, a.value.length);
  }
  function cancel(el) { const f = St.form; St.form = null; St.err = ''; Life.paint(TAB, el, f && f.mode === 'edit' ? 'mte-fix:' + f.sig : 'mte-add'); }
  function submit(el, fm) {
    const f = St.form; if (!f) return null;
    const v = readForm(fm); f.v = v;
    const cur = f.mode === 'edit' ? byLine(Life.data, (Life.data.meetings.find((m) => sigOfLine(Life.data, m.line) === f.sig) || {}).line) : null;
    let m;
    try { m = ME.check(v, cur ? { time: cur.time, text: cur.text } : null); } // 고치기: 옛 꼴 시간("저녁쯤")은 안 건드리면 그대로
    catch (e) { setErr(e.message, e.code); say(line(e.code && L()[e.code] ? e.code : 'fail')); Life.paint(TAB, el, 'mte-in-' + (FIELD[e.code] || 'text')); return null; }
    if (f.mode === 'add') return op(el, 'add', { meeting: m, date: f.date }, 'mte-add');
    return op(el, 'update', { key: { sig: f.sig }, patch: m, date: f.date }, null);
  }

  // 고른 날을 바꿈 (고치기에서 날짜를 옮겼을 때 그 날로)
  function selectDay(date) {
    if (!CAL || !date) return;
    const today = CAL.todayOf(Life.now(), root.PH_SETTINGS && root.PH_SETTINGS.DAY_START_HOUR), [ty, tm] = today.split('-').map(Number), [y, m] = date.split('-').map(Number);
    if (y === ty && m === tm) { CAL.y = null; CAL.m0 = null; } else { CAL.y = y; CAL.m0 = m - 1; }
    CAL.sel = date;
  }

  // ---- 저장 (메인) ----
  async function op(el, kind, a, focus) {
    if (St.busy || !canWrite()) return null;
    St.busy = true;
    const lm = Life.lastModified, Dk = D();
    let res = null;
    try {
      if (kind === 'add') res = await Dk.add(a.meeting, lm);
      else if (kind === 'update') res = await Dk.update(a.key, a.patch, lm);
      else if (kind === 'remove') res = await Dk.remove(a.key, lm);
      else if (kind === 'undo') {
        const u = St.undo; if (!u) { St.busy = false; return null; }
        if (u.type === 'update') res = await Dk.update({ sig: u.sig }, null, lm, u.raw); // 고치기 전 줄 글자 그대로
        else res = await Dk.add(u.removed, lm, u.before, u.raw); // 지운 줄을 같은 자리에 같은 글자로
      }
      Life.data = Md.parse(res.text); Life.lastModified = res.lastModified; Life.readAt = Date.now();
    } catch (e) {
      St.busy = false; St.err = String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); St.errInfo = null; St.last = { op: kind, error: St.err };
      Life.paint(TAB, el, focus); say(line('fail')); return null;
    }
    St.busy = false;
    St.last = { op: kind, ok: res.ok, code: res.code || null, conflict: !!res.conflict, unchanged: !!res.unchanged };
    if (res.conflict) { // 새 글로 다시 그림. 적던 칸은 그대로 (고치던 줄이 사라졌으면 닫음)
      if (St.form && St.form.mode === 'edit' && !Life.data.meetings.some((m) => sigOfLine(Life.data, m.line) === St.form.sig)) St.form = null;
      St.err = ''; St.undo = null; Life.paint(TAB, el, St.form ? 'mte-in-text' : focus); say(line('conflict')); return res;
    }
    if (res.code) { setErr(res.message || res.code, res.code); Life.paint(TAB, el, St.form ? 'mte-in-' + (FIELD[res.code] || 'text') : focus); say(line(L()[res.code] ? res.code : 'fail')); return res; }
    St.err = '';
    if (kind === 'add') { St.form = null; St.undo = null; say(line('added', { day: dayText(res.meeting.date), text: res.meeting.text })); }
    else if (kind === 'update') {
      St.form = null;
      if (res.unchanged) { St.undo = null; say(line('same')); }
      else {
        selectDay(res.meeting.date);
        St.undo = { type: 'update', date: res.meeting.date, sig: ME.sigOf(res.after), raw: res.before, prev: res.prev };
        say(line('updated', { text: res.meeting.text })); focus = 'mte-undo';
      }
    }
    else if (kind === 'remove') { St.form = null; St.undo = { type: 'remove', date: a.date, removed: res.removed, raw: res.removedText, before: res.before }; say(line('removed', { text: res.removed.text })); }
    else if (kind === 'undo') {
      const u = St.undo; St.undo = null;
      if (u.type === 'update') selectDay(u.prev.date);
      say(line('undo', { text: u.type === 'update' ? u.prev.text : u.removed.text }));
      focus = 'mte-fix:' + ME.sigOf(u.raw);
    }
    Life.paint(TAB, el, focus);
    return res;
  }

  (Life.renderHooks = Life.renderHooks || []).push(mount);
  root.PHMeetingEditUI = { St, mount, op, state: () => ({ form: St.form ? { mode: St.form.mode, date: St.form.date, sig: St.form.sig || null } : null, err: St.err, undo: St.undo ? { type: St.undo.type, date: St.undo.date } : null, last: St.last, log: St.log.slice(), busy: St.busy }) };
})(window);
