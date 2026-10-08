// 공부 [추가 | 수정] 창 (2026-10-08 비트, 로드맵 3-1단계 제작자 피드백). 생활 습관 탭 공부 카드 머리 버튼에서 연다 (js/study_gantt.js)
//   칸: 공부 이름, 전체 기간(시작일 ~ 끝일, 추가할 때 끝일도 정함), 메모, 세부 계획(이름 + 기간) 여러 줄 + "+ 세부 계획 추가"
//   수정: 위에 "고칠 공부" 고르기. 세부 계획 고치기·지우기도 이 창에서 (따로 "쪼개기"·"메모 고치기"·"진행 중" 버튼 없음)
//   세부 계획 기간은 상위 공부 전체 기간 안에서만: 날짜 칸 min·max로 막고, 저장 때 다시 검사 -> 밖이면 저장 안 함 + 두부 안내(planOut)
//   모양 = 독서·영화 기록 폼과 같은 틀 (.bk-overlay / .bk-dlg, css/journal.css) + css/study.css .sm-*
//   "세부 계획" 글은 data/study_lines.js PH_STUDY_PLAIN.plan 한 곳 (제작자 확인 대기)
// 저장은 메인 ph:studySave 한 번 (js/study_plan.js save: 여러 줄을 쓰기 한 번에, 단계마다 섹션 검사)
(function (root) {
  'use strict';
  const SW = root.PHStudyWrite, SP = root.PHStudyParts, SPL = root.PHStudyPlan, Md = root.PHLifeMd, Life = root.PHLife, S = root.PH_SETTINGS;
  if (!SW || !SPL || !Life) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PL = () => root.PH_STUDY_PLAIN || {};
  const LB = () => PL().plan || '세부 계획';
  const D = () => root.PHStudyDesktop;
  const canWrite = () => !!(D() && D().save);
  const today = () => SW.logDay(Life.now(), S.DAY_START_HOUR);
  const M = { on: false, mode: null, name: null, v: null, err: '', errAt: null, busy: false, el: null, last: null, said: null };

  // 지금 파일에서 그 공부 값 -> 칸 값
  function fromRow(name) {
    const d = Life.data, row = d && d.study ? d.study.rows.find((r) => r.name === name) : null; if (!row) return null;
    const src = d.lines.join('\n');
    return { name: row.name, start: SW.isDate(row.start) ? row.start : '', end: SW.isDate(row.end) ? row.end : '', memo: row.memo || '',
      plans: SPL.plansOf(src, row.name).map((p) => ({ sig: p.sig, part: p.part, from: p.from, to: p.to, gaps: p.gaps })), removed: [] };
  }
  function rows() { return (Life.data && Life.data.study && Life.data.study.rows) || []; }

  function html() {
    const v = M.v, edit = M.mode === 'edit', P = PL(), bad = (k) => (M.errAt === k ? ' bad' : '');
    const lim = (x) => `${v.start ? ` min="${esc(v.start)}"` : ''}${v.end ? ` max="${esc(v.end)}"` : ''}`;
    let h = `<div class="bk-overlay sm-overlay" data-kind="study"><form class="bk-dlg bk-form sm-dlg" role="dialog" aria-modal="true" aria-label="${esc(edit ? (P.editTitle || '공부 수정') : (P.addTitle || '공부 추가'))}" novalidate>
      <div class="bk-name">${esc(edit ? (P.editTitle || '공부 수정') : (P.addTitle || '공부 추가'))}</div>`;
    if (edit) h += `<label class="bk-row"><span class="bk-lab">${esc(P.pick || '고칠 공부')}</span><select class="sm-pick">${rows().map((r) => `<option value="${esc(r.name)}" ${r.name === M.name ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>`;
    h += `<label class="bk-row"><span class="bk-lab">${esc(P.name || '공부 이름')}</span><input class="sm-name${bad('name')}" maxlength="${SW.NAME_MAX}" autocomplete="off" placeholder="${esc(P.nameHolder || '예: 클로드 코드 개발 공부')}" value="${esc(v.name)}"></label>
      <div class="bk-row"><span class="bk-lab">${esc(P.period || '전체 기간')}</span><span class="sm-range"><input type="date" class="sm-start${bad('start')}" aria-label="${esc(P.start || '시작일')}" value="${esc(v.start)}"><i aria-hidden="true">~</i><input type="date" class="sm-end${bad('end')}" aria-label="${esc(P.end || '끝일')}" value="${esc(v.end)}"${v.start ? ` min="${esc(v.start)}"` : ''}></span></div>
      <label class="bk-row"><span class="bk-lab">${esc(P.memo || '메모')}</span><input class="sm-memo" maxlength="${SW.MEMO_MAX}" autocomplete="off" placeholder="${esc(P.memoHolder || '비워 둬도 돼요')}" value="${esc(v.memo)}"></label>
      <section class="sm-plans" aria-label="${esc(LB())}"><div class="sm-plans-head"><b>${esc(LB())}</b><small>${esc(Life.fill(P.planNote || '{plan|은} 전체 기간 안에서만 정할 수 있어요', { plan: LB() }))}</small></div><ul class="sm-plan-list">`;
    v.plans.forEach((p, i) => {
      h += `<li class="sm-plan${M.errAt === 'plan:' + i ? ' bad' : ''}" data-i="${i}"><input class="sm-p-name" maxlength="${SP.PART_MAX}" autocomplete="off" placeholder="${esc(P.planHolder || '예: 1단원, 1단원 복습')}" aria-label="${esc(LB())} 이름" value="${esc(p.part)}">` +
        `<span class="sm-range"><input type="date" class="sm-p-from" aria-label="${esc(LB())} 시작일" value="${esc(p.from)}"${lim()}><i aria-hidden="true">~</i><input type="date" class="sm-p-to" aria-label="${esc(LB())} 끝일" value="${esc(p.to)}"${lim()}></span>` +
        `<button type="button" class="sm-p-del he-del" data-i="${i}">${esc(P.del || '지우기')}</button>${p.gaps ? `<small class="sm-gaps">${esc(P.gapsNote || '띄엄띄엄 칠한 옛 기록이에요. 기간을 바꾸면 한 막대로 이어져요')}</small>` : ''}</li>`;
    });
    if (!v.plans.length) h += `<li class="sm-none">${esc(Life.fill(P.planEmpty || '아직 {plan|이} 없어요. 없으면 전체 기간이 한 막대예요', { plan: LB() }))}</li>`;
    h += `</ul><button type="button" class="sm-p-add">${esc(Life.fill(P.planAdd || '+ {plan} 추가', { plan: LB() }))}</button></section>
      <p class="bk-err sm-err" role="alert">${esc(M.err)}</p>
      <div class="bk-btns"><button type="button" class="bk-cancel">${esc(P.cancel || '그만두기')}</button><button type="submit" class="bk-save">${esc(P.save || '저장')}</button></div>
    </form></div>`;
    return h;
  }
  // 칸 값 읽기 (다시 그리기 전에)
  function read() {
    const f = M.el && M.el.querySelector('.sm-dlg'); if (!f) return M.v;
    const q = (s) => f.querySelector(s);
    M.v.name = q('.sm-name').value; M.v.start = q('.sm-start').value; M.v.end = q('.sm-end').value; M.v.memo = q('.sm-memo').value;
    f.querySelectorAll('.sm-plan').forEach((li) => { const p = M.v.plans[Number(li.dataset.i)]; if (!p) return; p.part = li.querySelector('.sm-p-name').value; p.from = li.querySelector('.sm-p-from').value; p.to = li.querySelector('.sm-p-to').value; });
    return M.v;
  }
  function paint(focus) {
    if (!M.on || !M.host) return;
    M.host.innerHTML = html(); M.el = M.host;
    bind();
    const f = focus ? M.el.querySelector(focus) : null; if (f) f.focus();
  }
  function bind() {
    const ov = M.el.querySelector('.sm-overlay'), f = ov.querySelector('.sm-dlg');
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) ov.dataset.down = '1'; });
    ov.addEventListener('click', (e) => { if (e.target === ov && ov.dataset.down === '1' && !M.busy) close(); });
    ov.addEventListener('keydown', (e) => {
      e.stopPropagation(); // 공부 카드 화살표 키(막대 옮기기)로 안 넘김
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape') { e.preventDefault(); if (!M.busy) close(); }
      else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); save(); }
    });
    f.addEventListener('submit', (e) => { e.preventDefault(); save(); });
    f.querySelector('.bk-cancel').addEventListener('click', () => close());
    const pk = f.querySelector('.sm-pick'); if (pk) pk.addEventListener('change', () => { const v = fromRow(pk.value); if (!v) return; M.name = pk.value; M.v = v; M.err = ''; M.errAt = null; paint('.sm-pick'); });
    // 전체 기간을 바꾸면 세부 계획 날짜 칸의 고를 수 있는 범위도 같이
    ['.sm-start', '.sm-end'].forEach((s) => f.querySelector(s).addEventListener('change', () => { read(); paint(s); }));
    f.querySelector('.sm-p-add').addEventListener('click', () => {
      read(); const t = today(), s = M.v.start || t, from = M.v.end && t > M.v.end ? M.v.start : (t < s ? s : t);
      M.v.plans.push({ sig: null, part: '', from: from || '', to: from || '', gaps: false });
      paint(`.sm-plan[data-i="${M.v.plans.length - 1}"] .sm-p-name`);
    });
    f.querySelectorAll('.sm-p-del').forEach((b) => b.addEventListener('click', () => {
      read(); const i = Number(b.dataset.i), p = M.v.plans[i]; if (!p) return;
      if (p.sig) M.v.removed.push(p.sig); M.v.plans.splice(i, 1); M.err = ''; M.errAt = null; paint('.sm-p-add');
    }));
    f.addEventListener('input', () => { if (!M.err) return; M.err = ''; M.errAt = null; const p = f.querySelector('.sm-err'); if (p) p.textContent = ''; f.querySelectorAll('.bad').forEach((x) => x.classList.remove('bad')); });
  }

  // ---- 열기·닫기 ----
  function open(mode, name) {
    if (!canWrite() || !Life.data || !Life.data.study) return false;
    const st = root.PHStudyGantt && root.PHStudyGantt.St, el = st && st.el; if (!el) return false;
    M.mode = mode; M.err = ''; M.errAt = null; M.busy = false;
    if (mode === 'edit') {
      const list = rows(); if (!list.length) return false;
      M.name = name && list.some((r) => r.name === name) ? name : list[0].name; M.v = fromRow(M.name);
    } else { M.name = null; M.v = { name: '', start: today(), end: '', memo: '', plans: [], removed: [] }; }
    M.host = el.querySelector('.sm-host'); if (!M.host) { M.host = document.createElement('div'); M.host.className = 'sm-host'; el.appendChild(M.host); }
    M.on = true; paint(mode === 'edit' ? '.sm-name' : '.sm-name');
    return true;
  }
  function close(focus) {
    M.on = false; M.err = ''; M.errAt = null; if (M.host) M.host.innerHTML = '';
    const b = document.querySelector(focus || (M.mode === 'edit' ? '.st-mod' : '.st-add')); if (b) b.focus({ preventScroll: true });
  }

  // ---- 저장 ----
  const lastPick = {};
  function say(key, v) {
    const L = (root.PH_STUDY_LINES || {})[key]; if (!L || !L.length || !root.PHApp || !root.PHApp.sideSay) return;
    const c = L.length > 1 ? L.filter((t) => t !== lastPick[key]) : L, t = c[Math.floor(Math.random() * c.length)]; lastPick[key] = t;
    const text = Life.fill(t, Object.assign({ plan: LB() }, v || {})); M.said = { key, text }; root.PHApp.sideSay(text);
  }
  function errOf(code, x) {
    const P = PL(), E = P.err || {}, lab = LB();
    const t = (s) => Life.fill(s || '', { plan: lab, start: md(M.v.start), end: md(M.v.end), names: (x && (x.plans || [x.part]).filter(Boolean).join(', ')) || '' });
    if (code === 'usedName' && root.PH_HABIT_EDIT_USED) return root.PH_HABIT_EDIT_USED(x.usedName || M.v.name, x.lastDate, 'study').note;
    return t(E[code] || E.fail || '저장하지 못했어요.');
  }
  const md = (s) => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(s || ''); return m ? `${Number(m[1])}/${Number(m[2])}` : ''; };
  const FIELD = { badName: 'name', dupName: 'name', usedName: 'name', badStart: 'start', badEnd: 'end', badOrder: 'end' };
  function showErr(code, x) {
    M.err = errOf(code, x);
    let at = FIELD[code] || null;
    if (['planOut', 'planDate', 'badPart', 'dupPart'].includes(code)) { const nm = x && ((x.plans && x.plans[0]) || x.part); const i = M.v.plans.findIndex((p) => String(p.part).trim() === nm || (!nm && !String(p.part).trim())); if (i >= 0) at = 'plan:' + i; }
    M.errAt = at; paint(at && at.startsWith('plan:') ? `.sm-plan[data-i="${at.slice(5)}"] .sm-p-name` : at ? '.sm-' + at : null);
    say(code === 'planOut' ? 'planOut' : code === 'badOrder' ? 'periodBad' : code === 'badEnd' ? 'needEnd' : 'fail');
  }
  // 화면에서 먼저 (메인이 다시 검사): 끝일·기간 안·이름
  function check(v) {
    try { SW.checkName(v.name); } catch (e) { return ['badName']; }
    if (!SW.isDate(v.start)) return ['badStart']; if (!SW.isDate(v.end)) return ['badEnd']; if (v.end < v.start) return ['badOrder'];
    const seen = new Set();
    for (const p of v.plans) {
      const nm = String(p.part || '').trim();
      try { SP.checkPart(p.part || ''); } catch (e) { return ['badPart', { part: nm }]; }
      if (!SW.isDate(p.from) || !SW.isDate(p.to) || p.to < p.from) return ['planDate', { part: nm }];
      if (p.from < v.start || p.to > v.end) return ['planOut', { plans: [nm] }];
      if (seen.has(nm)) return ['dupPart', { part: nm }]; seen.add(nm);
    }
    return null;
  }
  async function save() {
    if (M.busy) return null;
    const v = read(), c = check(v); if (c) { showErr(c[0], c[1]); return null; }
    const q = { mode: M.mode, name: M.name || '', study: { name: v.name, start: v.start, end: v.end, memo: v.memo }, plans: v.plans.map((p) => ({ sig: p.sig || null, part: p.part, from: p.from, to: p.to })), removed: v.removed.slice() };
    M.busy = true; let res = null;
    try {
      res = await D().save(q, Life.lastModified);
      Life.data = Md.parse(res.text); Life.lastModified = res.lastModified; Life.readAt = Date.now();
      M.last = { ok: res.ok, code: res.code || null, conflict: !!res.conflict, steps: res.steps || null, name: res.name || null };
      if (res.conflict) { M.busy = false; if (M.mode === 'edit') { const nv = fromRow(M.name); if (!nv) { close(); repaintCard(); say('conflict'); return res; } } repaintCard(); paint(); say('conflict'); return res; }
      if (res.code) { M.busy = false; showErr(res.code, res); return res; }
    } catch (e) { M.busy = false; M.last = { error: String(e.message || e) }; M.err = errOf('fail'); paint(); say('fail'); return null; }
    M.busy = false;
    const G = root.PHStudyGantt; if (G) { G.St.sel = res.name || v.name; G.St.form = null; G.St.err = ''; G.St.renamed = res.oldName && res.name && res.oldName !== res.name ? { old: res.oldName, name: res.name } : null; } // 이름 바꾼 뒤 되돌리기 한 번 (2026-10-04 규칙 그대로)
    const mode = M.mode; close(mode === 'edit' ? '.st-mod' : '.st-add'); repaintCard();
    if (!res.unchanged) say(mode === 'add' ? 'added' : 'saved', { name: res.name || v.name });
    return res;
  }
  function repaintCard() { const G = root.PHStudyGantt; if (G && G.paint) G.paint(); }
  function state() { return { open: M.on, mode: M.mode, name: M.name, v: M.v && JSON.parse(JSON.stringify(M.v)), err: M.err, errAt: M.errAt, last: M.last, said: M.said }; }
  root.PHStudyModal = Object.assign(M, { open, close, save, read, paint, state, canWrite, isOpen: () => M.on });
})(typeof window !== 'undefined' ? window : globalThis);
