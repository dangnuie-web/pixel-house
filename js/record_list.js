// 영화·연극·새 기록 항목 목록 + 기록 폼 (2026-10-08 비트, 로드맵 3단계). 그리는 곳 두 군데, 상태 하나:
//   집 TV 누르기 -> 기록 창 (js/record_modal.js, [영화|연극] 알약 탭, 제작자 2026-10-08) / 생활일지 > 영화·연극 탭, 새 항목 탭 (js/journal.js)
// 모양: 무늬 기록기능디자인 v01 3절(리스트형, 달 머리, 날짜 칸 + 제목 + 요약 한 줄, 누르면 펼침) + 4절(폼 = 독서 폼과 같은 틀, 칸만 제목·날짜·요약)
// 쓰기는 모두 메인 (electron/record_ipc.js, window.PHRecordDesktop). 화면은 값·고를 줄 글·읽은 시각만 보냄
// 버튼 글 "고치기"·"지우기"·"되돌리기" = 습관 편집·약속 쓰기와 같음 (제작자 2026-10-07)
(function (root) {
  'use strict';
  const RW = root.PHRecordWrite, Md = root.PHLifeMd, Life = root.PHLife, S = root.PH_SETTINGS;
  if (!RW || !Life) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const D = () => root.PHRecordDesktop;
  const canWrite = () => !!(D() && D().add);
  const L = () => (root.PH_LINES && root.PH_LINES.ui && root.PH_LINES.ui.record) || {};
  const PL = () => (root.PH_LINES && root.PH_LINES.uiPlain && root.PH_LINES.uiPlain.recordForm) || {};
  const ID = { 영화: 'movie', 연극: 'play' };
  // 상태: group = 알약 탭에 들어갈 항목들, kind = 지금 항목, open = 펼친 줄 sig, form = null | { mode: add|edit, sig }, undo = 지운 줄 되돌리기, just = 방금 적은 줄
  const R = { group: ['영화', '연극'], kind: '영화', open: null, form: null, draft: null, err: '', busy: false, undoItem: null, just: null, said: null, list: [] };
  const today = () => Md.logDay(Life.now(), S.DAY_START_HOUR);
  const dShort = (s) => { const d = Md.dateOf(s); if (d == null) return { md: esc(s), wd: '', cls: '' }; const x = new Date(d); return { md: `${String(x.getMonth() + 1).padStart(2, '0')}.${String(x.getDate()).padStart(2, '0')}`, wd: WD[x.getDay()], cls: x.getDay() === 6 ? 'sat' : x.getDay() === 0 ? 'sun' : '' }; };
  const monthName = (m) => (m === '?' ? '날짜 모름' : `${Number(m.slice(0, 4))}년 ${Number(m.slice(5, 7))}월`);
  const isDefault = (k) => !!ID[k];
  const kindKey = (k) => ID[k] || 'any';

  function set(group, kind) { R.group = group; R.kind = group.includes(kind) ? kind : group[0]; R.open = null; R.form = null; R.err = ''; }
  function pills(P) {
    if (R.group.length < 2) return '';
    return `<span class="rc-pills" role="tablist" aria-label="기록 고르기">` + R.group.map((k) => {
      const n = RW.listOf(P, k).length, on = k === R.kind;
      return `<button type="button" role="tab" class="rc-pill ${on ? 'on' : ''}" data-kind="${esc(k)}" aria-selected="${on}" tabindex="${on ? 0 : -1}" data-focus="rc-pill:${esc(k)}">${esc(k)}<small>${n}</small></button>`;
    }).join('') + '</span>';
  }
  function html(d) {
    const P = RW.parse(d.lines || []), list = RW.listOf(P, R.kind);
    R.list = list; R.P = P;
    let h = `<div class="records" data-kind="${esc(R.kind)}"><div class="rc-bar">${pills(P)}${R.group.length < 2 ? `<b class="rc-title">${esc(R.kind)} <small>${list.length}</small></b>` : ''}` +
      (canWrite() ? `<button type="button" class="rc-add" data-focus="rc-add">${esc(PL().add || '+ 기록하기')}</button>` : '') + '</div>';
    if (P.error) h += `<p class="fmt">${esc(P.error)}</p>`;
    if (R.undoItem && R.undoItem.kind === R.kind) h += `<div class="rc-undo" role="status"><span>${esc((PL().removedNote || '{title} 지웠어요').replace('{title}', R.undoItem.title))}</span><button type="button" class="rc-restore" data-focus="rc-restore">${esc(PL().undo || '되돌리기')}</button></div>`;
    if (!list.length) {
      const e = L().empty || {}, t = Life.fill(e[kindKey(R.kind)] || e.any || '아직 기록이 없어요냥~', { kind: R.kind });
      h += `<div class="rc-empty"><p>${esc(t)}</p></div>`;
    } else {
      h += '<div class="rc-list">';
      RW.byMonth(list).forEach((g) => {
        h += `<div class="rc-month"><h4>${esc(monthName(g.month))}</h4><span>${g.items.length}편</span></div><ul class="rc-items">`;
        g.items.forEach((r) => {
          const ds = dShort(r.date), open = r.sig === R.open, just = r.sig === R.just;
          h += `<li class="rc-it${open ? ' open' : ''}${just ? ' just' : ''}" data-sig="${esc(r.sig)}"><button type="button" class="rc-row" aria-expanded="${open}" data-focus="rc:${esc(r.sig)}">` +
            `<span class="rc-date"><b>${ds.md}</b><small class="${ds.cls}">${ds.wd}</small></span><span class="rc-main"><span class="rc-t">${esc(r.title)}</span>${r.summary && !open ? `<span class="rc-s">${esc(r.summary.split('\n')[0])}</span>` : ''}</span></button>`;
          if (open) h += `<div class="rc-detail">${r.summary ? `<p class="rc-full">${esc(r.summary)}</p>` : `<p class="rc-none">요약은 비어 있어요.</p>`}` +
            (canWrite() ? `<div class="rc-btns"><button type="button" class="rc-fix he-fix" data-focus="rc-fix">${esc(PL().fix || '고치기')}</button><button type="button" class="rc-del he-del">${esc(PL().del || '지우기')}</button></div>` : '') + '</div>';
          h += '</li>';
        });
        h += '</ul>';
      });
      h += '</div>';
    }
    if (R.form) h += formHtml();
    return h + '</div>';
  }
  function formHtml() {
    const v = R.draft || {}, edit = R.form.mode === 'edit', t = today(), any = !isDefault(R.form.kind);
    const head = R.group.length > 1 && R.group.includes(R.form.kind)
      ? `<span class="rc-pills rc-form-pills" role="radiogroup" aria-label="무엇을 봤나요">` + R.group.map((k) => `<button type="button" role="radio" class="rc-pill ${k === R.form.kind ? 'on' : ''}" data-fkind="${esc(k)}" aria-checked="${k === R.form.kind}">${esc(k)}</button>`).join('') + '</span>'
      : `<div class="bk-name">${esc(R.form.kind)} ${edit ? '기록 고치기' : '기록하기'}</div>`;
    return `<div class="bk-overlay rc-overlay" data-kind="form"><form class="bk-dlg bk-form rc-form" role="dialog" aria-modal="true" aria-label="${esc(R.form.kind)} 기록" novalidate>
      ${head}
      <label class="bk-row"><span class="bk-lab">${esc(PL().title || '제목')}</span><input class="rc-in-title${R.err ? ' bad' : ''}" maxlength="${RW.TITLE_MAX}" autocomplete="off" placeholder="${esc(PL().titleHolder || '')}" value="${esc(v.title || '')}" data-focus="rc-title"></label>
      <label class="bk-row"><span class="bk-lab">${esc(any ? (PL().dateAny || '한 날') : (PL().date || '본 날'))}</span><input class="rc-in-date" type="date" max="${t}" value="${esc(v.date || '')}" data-focus="rc-date"><small class="bk-hint">${v.date ? '' : esc(PL().dateNote || '')}</small></label>
      <label class="bk-row top"><span class="bk-lab">${esc(any ? (PL().summaryAny || '요약·메모') : (PL().summary || '요약·줄거리'))}</span><textarea class="rc-in-sum" rows="5" maxlength="${RW.SUMMARY_MAX}" placeholder="${esc(PL().summaryHolder || '')}" data-focus="rc-sum">${esc(v.summary || '')}</textarea></label>
      <p class="bk-err" role="alert">${esc(R.err)}</p>
      <div class="bk-btns"><button type="button" class="bk-cancel">${esc(PL().cancel || '그만두기')}</button><button type="submit" class="bk-save">${esc(edit ? (PL().fix || '고치기') : (PL().save || '적기'))}</button></div>
    </form></div>`;
  }

  // ---- 연결 ----
  let EL = null, PAINT = null, TAB = null;
  function repaint(focus) { if (!EL || !Life.data) return; if (PAINT) PAINT(focus); else Life.paint(TAB || 'archive', EL, focus); }
  function readDraft() {
    const f = EL && EL.querySelector('.rc-form'); if (!f) return R.draft;
    R.draft = { title: f.querySelector('.rc-in-title').value, date: f.querySelector('.rc-in-date').value, summary: f.querySelector('.rc-in-sum').value };
    return R.draft;
  }
  function openForm(mode, r) {
    R.err = '';
    R.form = { mode, sig: r ? r.sig : null, kind: r ? r.kind : R.kind };
    R.draft = r ? { title: r.title, date: r.date, summary: r.summary } : { title: '', date: '', summary: '' };
    repaint('rc-title');
  }
  function closeForm(focus) { R.form = null; R.draft = null; R.err = ''; repaint(focus || 'rc-add'); }
  function reset() { R.form = null; R.draft = null; R.err = ''; R.open = null; }
  function bind(el, paint, tab) {
    EL = el; PAINT = typeof paint === 'function' ? paint : null; TAB = tab || null;
    const box = el.querySelector('.records'); if (!box) return;
    const add = box.querySelector('.rc-add'); if (add) add.addEventListener('click', () => openForm('add'));
    const pillsEl = box.querySelectorAll('.rc-bar .rc-pill');
    pillsEl.forEach((b) => {
      b.addEventListener('click', () => { R.kind = b.dataset.kind; R.open = null; repaint('rc-pill:' + R.kind); });
      b.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; e.preventDefault();
        const i = R.group.indexOf(R.kind), n = R.group[(i + (e.key === 'ArrowRight' ? 1 : -1) + R.group.length) % R.group.length];
        R.kind = n; R.open = null; repaint('rc-pill:' + n);
      });
    });
    box.querySelectorAll('.rc-row').forEach((b) => b.addEventListener('click', () => { const sig = b.parentElement.dataset.sig; R.open = R.open === sig ? null : sig; repaint('rc:' + sig); }));
    const fix = box.querySelector('.rc-fix'); if (fix) fix.addEventListener('click', () => { const r = R.list.find((x) => x.sig === R.open); if (r) openForm('edit', r); });
    const del = box.querySelector('.rc-del'); if (del) del.addEventListener('click', () => { const r = R.list.find((x) => x.sig === R.open); if (r) remove(r); });
    const rs = box.querySelector('.rc-restore'); if (rs) rs.addEventListener('click', undo);
    const ov = box.querySelector('.rc-overlay');
    if (ov) {
      ov.addEventListener('mousedown', (e) => { if (e.target === ov) { readDraft(); ov.dataset.down = '1'; } });
      ov.addEventListener('click', (e) => { if (e.target === ov && ov.dataset.down === '1' && !R.busy) closeForm(); });
      ov.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!R.busy) closeForm(); }
        else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
        else if (e.key === 'Enter' && e.target.classList.contains('rc-in-title')) { e.preventDefault(); const n = ov.querySelector('.rc-in-date'); if (n) n.focus(); }
      });
      const f = ov.querySelector('.rc-form');
      f.addEventListener('submit', (e) => { e.preventDefault(); save(); });
      f.querySelector('.bk-cancel').addEventListener('click', () => closeForm());
      f.querySelectorAll('[data-fkind]').forEach((b) => b.addEventListener('click', () => { readDraft(); R.form.kind = b.dataset.fkind; repaint('rc-title'); }));
      f.querySelector('.rc-in-date').addEventListener('input', (e) => { const h = f.querySelector('.bk-hint'); if (h) h.textContent = e.target.value ? '' : (PL().dateNote || ''); });
      f.querySelector('.rc-in-title').addEventListener('input', (e) => { if (R.err && e.target.value.trim()) { R.err = ''; e.target.classList.remove('bad'); const p = f.querySelector('.bk-err'); if (p) p.textContent = ''; } });
    }
    if (R.just) { const j = R.just; setTimeout(() => { if (R.just === j) R.just = null; }, 700); }
  }

  // ---- 저장 ----
  const lastPick = {};
  function pick(list, k) { if (!Array.isArray(list)) return list || ''; if (list.length < 2) return list[0] || ''; const c = list.filter((t) => t !== lastPick[k]); const t = c[Math.floor(Math.random() * c.length)]; lastPick[k] = t; return t; }
  function say(list, k, v) {
    const text = Life.fill(pick(list, k), v || {}); if (!text) return;
    R.said = { key: k, text };
    if (root.PHApp && root.PHApp.sideSay) root.PHApp.sideSay(text);
  }
  function showErr(msg) { R.err = msg; const p = EL && EL.querySelector('.rc-form .bk-err'); if (p) p.textContent = msg; const i = EL && EL.querySelector('.rc-in-title'); if (i && /제목/.test(msg)) i.classList.add('bad'); }
  async function run(call, onOk) {
    if (R.busy) return null;
    R.busy = true; let res = null;
    try {
      res = await call(Life.lastModified);
      Life.data = Md.parse(res.text); Life.lastModified = res.lastModified; Life.readAt = Date.now();
      if (res.conflict) { R.busy = false; repaint(R.form ? 'rc-title' : null); say(L().conflict, 'conflict'); return res; }
      if (res.code) {
        R.busy = false;
        if (R.form) showErr(res.code === 'badTitle' ? (PL().badTitle || '제목을 적어 주세요') : res.code === 'badDate' ? '날짜를 다시 골라 주세요.' : '못 쓰는 글자가 섞여 있어요.');
        say(L()[res.code] || L().fail, res.code); return res;
      }
      onOk(res);
    } catch (e) {
      R.lastError = String(e.message || e);
      if (R.form) showErr('저장하지 못했어요.');
      say(L().fail, 'fail');
    }
    R.busy = false;
    return res;
  }
  function save() {
    const v = readDraft() || {}, title = String(v.title || '').trim();
    if (!title) { showErr(PL().badTitle || '제목을 적어 주세요'); say(L().badTitle, 'badTitle'); const i = EL.querySelector('.rc-in-title'); if (i) i.focus(); return null; }
    if (v.date && v.date > today()) { showErr('날짜는 오늘까지 고를 수 있어요.'); return null; }
    const mode = R.form.mode, kind = R.form.kind, sig = R.form.sig;
    const rec = { kind, date: v.date || '', title, summary: v.summary || '' };
    const call = mode === 'edit' ? (lm) => D().update(sig, rec, lm) : (lm) => D().add(rec, lm);
    return run(call, (res) => {
      R.form = null; R.draft = null; R.err = ''; R.undoItem = null;
      R.kind = kind; R.just = res.after || null; R.open = mode === 'edit' ? res.after : null;
      R.last = { op: mode, record: res.record, after: res.after, date: res.date };
      repaint(mode === 'edit' ? 'rc:' + res.after : 'rc-add');
      const t = res.record ? res.record.title : title;
      if (mode === 'edit') say(L().edited, 'edited', { title: t });
      else { const s = L().saved || {}; say(s[kindKey(kind)] || s.any, 'saved:' + kind, { title: t, kind }); }
    });
  }
  function remove(r) {
    return run((lm) => D().remove(r.sig, lm), (res) => {
      R.open = null; R.undoItem = { kind: r.kind, title: r.title, raw: res.before, next: res.next };
      R.last = { op: 'remove', before: res.before };
      repaint('rc-restore'); say(L().removed, 'removed', { title: r.title });
    });
  }
  function undo() {
    const u = R.undoItem; if (!u) return null;
    return run((lm) => D().add(null, lm, u.next, u.raw), (res) => {
      R.undoItem = null; R.just = res.after; R.last = { op: 'undo', after: res.after };
      repaint('rc-add'); say(L().undo, 'undo', { title: u.title });
    });
  }
  // 열 때 두부 한 줄 (TV)
  function sayOpen() { const o = L().open || {}; say(o[kindKey(R.kind)], 'open:' + R.kind); }
  function state() { return { group: R.group.slice(), kind: R.kind, open: R.open, form: R.form && Object.assign({}, R.form), err: R.err, undo: !!R.undoItem, items: R.list.map((x) => x.title), said: R.said, last: R.last, lastError: R.lastError }; }
  root.PHRecordList = Object.assign(R, { html, bind, reset, set, canWrite, openForm, save, remove, undo, sayOpen, state });
})(typeof window !== 'undefined' ? window : globalThis);
