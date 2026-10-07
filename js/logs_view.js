// 대변·식사 일지 화면 두 곳 (2026-10-04 비트, logs 브랜치). life.js·journal.js는 고치지 않음
//   1) 생활 습관 탭 "기록" 카드: "대변"·"식사" 줄에 오늘 몇 번 · 마지막 기록 시각 + "기록하기" (누르면 창 js/log_modal.js)
//      생활습관 표에 그 줄이 아직 없으면 화면에만 같은 모양으로 붙임 (첫 기록 때 메인이 표에 "기록" 줄을 더함)
//   2) 생활일지 > "대변"·"식사" 안 탭 (settings.JOURNAL_TABS의 poop·meal): 월 달력 (js/calendar.js monthGrid·shift 재사용, 월요일 시작)
//      대변 = 기록 있는 날 칸에 작은 그림(그날 마지막 형태) + 횟수 / 식사 = 그날 메뉴 이름이 기록한 순서대로 쌓임(넘치면 +n)
//      날짜 누르기 -> 아래에 그날 기록 자세히 + 고치기(창) · 지우기(되돌리기 한 번) / "기록하기"(고른 날로)
//   journal.js의 Life.VIEWS.archive 그리기 함수를 감싸서, 지금 안 탭이 대변·식사일 때만 패널 안을 바꿔 끼움. 버튼 연결은 Life.renderHooks
// 데이터 (나중의 분석): PHPoopLog / PHMealLog parse().rows -> byDate (날짜별) · entries (한 줄 = 한 번)
(function (root) {
  'use strict';
  const S = root.PH_SETTINGS, Life = root.PHLife, LT = root.PHLogTable, PL = root.PHPoopLog, ML = root.PHMealLog, CAL = root.PHCalendar, LM = () => root.PHLogModal;
  if (!Life || !Life.VIEWS || !CAL) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (y, m0, d) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
  const dayName = (s) => { const [y, m, d] = s.split('-').map(Number); return `${m}월 ${d}일 (${WD[new Date(y, m - 1, d, 12).getDay()]})`; };
  const md = (s) => { const [, m, d] = s.split('-').map(Number); return `${m}/${d}`; };
  const today = () => LT.logDay(Life.now(), S.DAY_START_HOUR);
  const UI = () => (root.PH_LINES && root.PH_LINES.ui && root.PH_LINES.ui.logs) || {};
  const KINDS = { poop: { mod: PL, label: '대변', habit: PL.HABIT }, meal: { mod: ML, label: '식사', habit: ML.HABIT } };
  const canWrite = () => !!root.PHLogsDesktop;
  // 상태: 보는 달·고른 날 (null = 이번 달·오늘), 되돌리기 { kind, entry } (한 번)
  const V = { poop: { y: null, m0: null, sel: null }, meal: { y: null, m0: null, sel: null }, undo: null, busy: false };
  const art = {};
  function img(key, label, cls) {
    const A = root.PHArt;
    if (art[key] == null) { try { art[key] = A && A.has(key) ? A.frameCanvas(key, 0).toDataURL() : ''; } catch (e) { art[key] = ''; } }
    return art[key] ? `<img class="lg-img ${cls || ''}" src="${art[key]}" alt="" aria-hidden="true">` : `<span class="lg-img lg-ph ${cls || ''}" aria-hidden="true">${esc(label)}</span>`;
  }
  const rowsOf = (kind, d) => KINDS[kind].mod.parse(d.lines || []);

  // ---- 1) 생활 습관 탭 기록 카드 ----
  function lastText(last) { if (!last) return '아직 기록 없음'; const t = last.time ? last.time : ''; return last.date === today() ? `마지막 ${t || '오늘'}` : `마지막 ${md(last.date)}${t ? ' ' + t : ''}`; }
  function habitsHook(tab, el, d) {
    if (tab !== 'habits' || !d) return;
    const card = el.querySelector('.card[data-card="기록"]'); if (!card) return;
    // 카드 바로 아래 목록만 (습관 편집 칸 .he-list도 ul이라, 그냥 'ul'이면 편집 칸 안에 붙음. main 합칠 때 고침 2026-10-04)
    let ul = card.querySelector(':scope > ul'); if (!ul) { ul = document.createElement('ul'); card.appendChild(ul); }
    let added = 0;
    ['poop', 'meal'].forEach((kind) => {
      if (root.PHFurnish && !root.PHFurnish.isOn(kind)) return; // 습관 줄을 지운 일지 기능 = 줄도 기록하기도 없음 (제작자 결정 2026-10-04)
      const K = KINDS[kind], sm = K.mod.summary(rowsOf(kind, d).rows, today());
      let li = ul.querySelector(`:scope > li[data-habit="${K.habit.name}"]`);
      if (!li) { // 표에 아직 없음: 화면에만 같은 모양으로
        li = document.createElement('li'); li.dataset.habit = K.habit.name; li.className = 'lg-virtual';
        li.innerHTML = `<b>${esc(K.habit.name)}</b><span class="tgt">${esc(K.habit.target)}</span>`; ul.appendChild(li); added++;
      }
      li.classList.add('lg-hab'); li.dataset.log = kind;
      const box = document.createElement('div'); box.className = 'lg-hab-row';
      box.innerHTML = `<span class="slot-note lg-today">오늘 ${sm.today}번</span><span class="slot-note lg-last">${esc(lastText(sm.last))}</span>` +
        (canWrite() ? `<button type="button" class="lg-open" data-kind="${kind}" data-focus="lg-open:${kind}">기록하기</button>` : '');
      li.appendChild(box);
      const b = box.querySelector('.lg-open'); if (b) b.addEventListener('click', (e) => { e.stopPropagation(); LM().open(kind, { from: 'habits' }); });
      li.addEventListener('click', (e) => { if (e.target.closest('button, a, input')) return; if (canWrite()) LM().open(kind, { from: 'habits' }); });
    });
    // 독서 (2026-10-04 제작자: 대변·식사와 같은 규칙): 표에 한 번도 없었으면 화면에만 줄 (첫 책을 꽂을 때 메인이 표에 더함). 지웠으면(off) 줄 없음
    const RF = root.PHFeatures && root.PHFeatures.get('reading');
    if (RF && root.PHFurnish && root.PHFurnish.state('reading') === 'virtual' && !ul.querySelector(`:scope > li[data-habit="${RF.habit}"]`)) {
      const li = document.createElement('li'); li.dataset.habit = RF.habit; li.className = 'lg-virtual';
      li.innerHTML = `<b>${esc(RF.habit)}</b><span class="tgt">${esc(RF.target)}</span>`; ul.appendChild(li); added++;
    }
    if (added) { const n = card.querySelector('h3 small'); if (n) n.textContent = String(Number(n.textContent || 0) + added); }
  }

  // ---- 2) 생활일지 대변·식사 탭 ----
  function view(kind) { const t = today(), [ty, tm] = t.split('-').map(Number), c = V[kind]; return { y: c.y == null ? ty : c.y, m0: c.m0 == null ? tm - 1 : c.m0, sel: c.sel || t, today: t }; }
  function cellMarks(kind, list) {
    if (!list || !list.length) return '';
    if (kind === 'poop') { const last = list[list.length - 1]; return `<span class="lg-marks poop">${last.form ? img('bristol_' + last.form, '●', 'mini') : '<i class="cal-dot" aria-hidden="true"></i>'}<small class="lg-n">${list.length}번</small></span>`; }
    const MAX = 3, more = list.length - MAX;
    return `<span class="lg-marks meal">${list.slice(0, more > 0 ? MAX - 1 : MAX).map((r) => `<small class="lg-menu">${esc(r.menu)}</small>`).join('')}${more > 0 ? `<small class="cal-more">+${list.length - (MAX - 1)}</small>` : ''}</span>`;
  }
  function itemHtml(kind, r, i) {
    const acts = canWrite() ? `<span class="lg-acts"><button type="button" class="lg-edit" data-i="${i}" data-focus="lg-edit:${i}">고치기</button><button type="button" class="lg-del" data-i="${i}" data-focus="lg-del:${i}">지우기</button></span>` : '';
    const memo = r.memo ? `<div class="lg-memo">${esc(r.memo)}</div>` : '';
    if (kind === 'poop') {
      const hex = PL.hexOf(r.color);
      return `<li class="lg-item" data-i="${i}" data-line="${r.line}"><div class="lg-top"><span class="lg-time">${esc(r.time || '')}</span>` +
        `<span class="lg-form">${r.form ? img('bristol_' + r.form, r.form + '형', 'item') : ''}<b>${esc(r.form ? LM().formName(r.form) : r.formText || '형태 없음')}</b></span>` +
        `${r.amount != null ? `<span class="lg-amt">${r.amount}g</span>` : ''}${r.color ? `<span class="lg-color"><i class="lm-chip" style="--c:${hex || '#ccc'}" aria-hidden="true"></i>${esc(r.color)}</span>` : ''}${acts}</div>${memo}</li>`;
    }
    const hearts = r.rating ? `<span class="lg-hearts" aria-label="만족도 ${r.rating}">${[1, 2, 3, 4, 5].map((k) => img(k <= r.rating ? 'heart_full' : 'heart_empty', k <= r.rating ? '♥' : '♡', 'heart')).join('')}</span>` : '';
    const amt = r.amount ? `<span class="lg-amt">${img('stomach_' + r.amount, '', 'stomach')}${r.amount}%</span>` : '';
    return `<li class="lg-item" data-i="${i}" data-line="${r.line}"><div class="lg-top">${r.time ? `<span class="lg-time">${esc(r.time)}</span>` : ''}<span class="lg-kind">${esc(r.kind)}</span><b class="lg-menu-name">${esc(r.menu)}</b>${hearts}${amt}${acts}</div>${memo}</li>`;
  }
  function panel(d, kind) {
    const K = KINDS[kind], P = rowsOf(kind, d), map = K.mod.byDate(P.rows), v = view(kind);
    const G = CAL.monthGrid(v.y, v.m0), isNow = ymd(v.y, v.m0, 1).slice(0, 7) === v.today.slice(0, 7), month = ymd(v.y, v.m0, 1).slice(0, 7);
    const monthN = P.rows.filter((r) => String(r.date).slice(0, 7) === month).length;
    let h = `<div class="lg-panel" data-kind="${kind}"><div class="lg-bar"><p class="lg-count">${v.y}년 ${v.m0 + 1}월 ${esc(K.label)} 기록 <b>${monthN}</b>번</p>` +
      (canWrite() ? `<button type="button" class="lg-add" data-focus="lg-add">기록하기</button>` : '') + '</div>';
    if (P.error) h += `<p class="fmt">${esc(P.error)}</p>`;
    if (V.undo && V.undo.kind === kind) h += `<div class="lg-undo" role="status"><span>${esc(V.undo.text)}</span><button type="button" class="lg-restore" data-focus="lg-restore">되돌리기</button></div>`;
    h += `<section class="cal lg-cal" data-month="${month}" aria-label="${esc(K.label)} 달력"><div class="cal-head"><h3>${v.y}년 ${v.m0 + 1}월</h3>
      <span class="cal-nav" role="group" aria-label="달 넘기기"><button type="button" class="cal-prev lg-prev" aria-label="지난달" data-focus="lg-prev">◀</button><button type="button" class="cal-now lg-now" ${isNow ? 'disabled' : ''} data-focus="lg-now">이번 달</button><button type="button" class="cal-next lg-next" aria-label="다음 달" data-focus="lg-next">▶</button></span></div>`;
    // 요일 머리는 판 밖 위 (무늬 기록기능디자인 v01 6절: 판 = 한 장의 표)
    h += '<div class="cal-row cal-wd" aria-hidden="true">' + CAL.WD_MON.map((w, i) => `<span class="${i === 5 ? 'sat' : i === 6 ? 'sun' : ''}">${w}</span>`).join('') + '</div><div class="cal-grid" role="grid" aria-readonly="true">';
    G.weeks.forEach((wk) => {
      h += '<div class="cal-row" role="row">' + wk.map((c) => {
        const list = map[c.date] || [];
        const cls = ['cal-day', 'lg-day-cell', c.inMonth ? '' : 'out', c.date === v.today ? 'today' : '', c.date === v.sel ? 'sel' : '', list.length ? 'has' : '', c.date > v.today ? 'future' : '', c.dow === 5 ? 'sat' : c.dow === 6 ? 'sun' : ''].filter(Boolean).join(' ');
        const label = `${dayName(c.date)}${c.date === v.today ? ', 오늘' : ''}${list.length ? `, ${K.label} 기록 ${list.length}개` : ''}`;
        return `<button type="button" role="gridcell" class="${cls}" data-date="${c.date}" data-n="${list.length}" aria-selected="${c.date === v.sel}" aria-label="${esc(label)}" tabindex="${c.date === v.sel ? 0 : -1}" data-focus="lg:${c.date}"><span class="cal-n">${c.d}</span>${cellMarks(kind, list)}</button>`;
      }).join('') + '</div>';
    });
    h += '</div>';
    const list = map[v.sel] || [];
    h += `<div class="lg-day" aria-live="polite" data-date="${v.sel}"><h4>${esc(dayName(v.sel))}${v.sel === v.today ? ' <small>오늘</small>' : ''}</h4>`;
    h += list.length ? `<ul class="lg-items">${list.map((r, i) => itemHtml(kind, r, i)).join('')}</ul>` : `<p class="cal-none">${esc(UI().emptyDay || '이날은 기록이 없어요.')}</p>`;
    return h + '</div></section></div>';
  }
  // journal.js 그리기 함수 감싸기: 대변·식사 안 탭이면 패널 안만 바꿔 끼움
  const orig = Life.VIEWS.archive[1];
  Life.VIEWS.archive = ['archive', (d) => {
    const J = root.PHJournal, t = J && J.cur ? J.cur() : null, kind = t && (t.poop ? 'poop' : t.meal ? 'meal' : null);
    const html = orig(d); if (!kind) return html;
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    const p = tmp.querySelector('#jn-panel'); if (p) p.innerHTML = panel(d, kind);
    const sub = tmp.querySelector('.life-sub'); if (sub) sub.textContent = '달력에서 날짜를 누르면 그날 기록이 보여요';
    const ro = tmp.querySelector('.life-src .ro'); if (ro && canWrite()) { ro.textContent = '기록 가능 · ' + KINDS[kind].label + ' 표에 적혀요'; ro.classList.add('rw'); }
    return tmp.innerHTML;
  }];

  function go(el, kind, y, m0, sel, focus) {
    const t = today(), [ty, tm] = t.split('-').map(Number), c = V[kind];
    if (y === ty && m0 === tm - 1) { c.y = null; c.m0 = null; } else { c.y = y; c.m0 = m0; }
    c.sel = sel; Life.paint('archive', el, focus);
  }
  async function act(el, kind, call, onOk) {
    if (V.busy) return null;
    V.busy = true; let res = null;
    try {
      res = await LM().write(call);
      if (res.conflict) { Life.paint('archive', el); LM().say(UI().conflict); return res; }
      onOk(res);
    } catch (e) { V.lastError = String(e && e.message || e); LM().say(UI().fail); }
    finally { V.busy = false; }
    return res;
  }
  function remove(el, kind, row) {
    const D = root.PHLogsDesktop;
    return act(el, kind, (lm) => (kind === 'poop' ? D.removePoop({ sig: row.sig }, lm) : D.removeMeal({ sig: row.sig }, lm)), (res) => {
      const text = LM().line(kind, 'removed', { menu: row.menu || '' });
      V.undo = { kind, entry: res.removed || row, text: '지웠어요 · ' + (kind === 'poop' ? `${md(row.date)} ${row.time}` : `${row.menu}`) };
      Life.paint('archive', el, 'lg-restore'); LM().say(text);
    });
  }
  function restore(el) {
    const u = V.undo; if (!u) return null;
    const D = root.PHLogsDesktop, e = u.entry;
    const entry = u.kind === 'poop' ? { date: e.date, time: e.time, form: e.form, amount: e.amount, color: e.color || '', memo: e.memo || '' }
      : { date: e.date, time: e.time || '', kind: e.kind, menu: e.menu, rating: e.rating, amount: e.amount, memo: e.memo || '' };
    return act(el, u.kind, (lm) => (u.kind === 'poop' ? D.addPoop(entry, lm) : D.addMeal2(entry, lm)), () => {
      V.undo = null; V[u.kind].sel = e.date; Life.paint('archive', el, 'lg:' + e.date); LM().say(LM().line(u.kind, 'restored', { menu: e.menu || '' }));
    });
  }
  function journalHook(tab, el, d) {
    if (tab !== 'archive' || !d) return;
    const p = el.querySelector('.lg-panel'); if (!p) return;
    const kind = p.dataset.kind, v = () => view(kind), rows = () => KINDS[kind].mod.byDate(rowsOf(kind, Life.data).rows)[view(kind).sel] || [];
    p.querySelector('.lg-prev').addEventListener('click', () => { const x = v(), n = CAL.shift(x.y, x.m0, -1); go(el, kind, n.y, n.m0, ymd(n.y, n.m0, 1), 'lg-prev'); });
    p.querySelector('.lg-next').addEventListener('click', () => { const x = v(), n = CAL.shift(x.y, x.m0, 1); go(el, kind, n.y, n.m0, ymd(n.y, n.m0, 1), 'lg-next'); });
    p.querySelector('.lg-now').addEventListener('click', () => { const t = today(), [ty, tm] = t.split('-').map(Number); go(el, kind, ty, tm - 1, null, 'lg:' + t); });
    p.querySelectorAll('.lg-day-cell').forEach((b) => {
      b.addEventListener('click', () => { const [y, m] = b.dataset.date.split('-').map(Number); go(el, kind, y, m - 1, b.dataset.date, 'lg:' + b.dataset.date); });
      b.addEventListener('keydown', (e) => {
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]; if (!step) return;
        e.preventDefault();
        const [y, m, dd] = b.dataset.date.split('-').map(Number), x = new Date(y, m - 1, dd + step, 12), nd = ymd(x.getFullYear(), x.getMonth(), x.getDate());
        go(el, kind, x.getFullYear(), x.getMonth(), nd, 'lg:' + nd);
      });
    });
    const add = p.querySelector('.lg-add'); if (add) add.addEventListener('click', () => LM().open(kind, { from: 'journal', date: v().sel }));
    p.querySelectorAll('.lg-edit').forEach((b) => b.addEventListener('click', () => { const r = rows()[Number(b.dataset.i)]; if (r) LM().open(kind, { from: 'journal', row: r }); }));
    p.querySelectorAll('.lg-del').forEach((b) => b.addEventListener('click', () => { const r = rows()[Number(b.dataset.i)]; if (r) remove(el, kind, r); }));
    const rs = p.querySelector('.lg-restore'); if (rs) rs.addEventListener('click', () => restore(el));
  }
  (Life.renderHooks = Life.renderHooks || []).push((tab, el, d) => { habitsHook(tab, el, d); journalHook(tab, el, d); });

  // 바깥(시험 등)에서: 생활일지의 대변·식사 탭 열기
  async function openTab(kind, date) {
    if (root.PHJournal) root.PHJournal.tab = kind;
    if (date) V[kind].sel = date;
    if (root.PHApp && root.PHApp.selectTab) await root.PHApp.selectTab('archive');
    return true;
  }
  root.PHLogsView = Object.assign(V, { openTab, panel, remove, restore, lastText });
})(window);
