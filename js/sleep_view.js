// 생활일지 > "잠" 탭 (한 달 모눈) + 생활 습관 탭 "기록" 카드 잠 줄 (2026-10-09 비트, 무늬 시안 v01 = 제작자 2026-10-09 승인)
//   모눈: 그 달 1일~말일이 위에서 아래로. 한 줄 = 깬 날 (전날 18시 ~ 그날 18시). 선 = 1시간(0·6·12시 조금 진하게, 자정 2px). 막대 = 분 단위 자리
//   형광펜(손맛): 목업 .pen 그대로, 흔들림은 구간마다 고정 씨앗(js/sleep_calc.js penVars). 선잠 = 같은 펜 연하게. 잔 시각만 줄 = 사라지는 펜 + "?"
//   아직 안 온 날도 빈 줄로 그려 둠(누를 수 없음). "지금" 줄에 지금 선 + 오른쪽 빗금
//   줄 누르기 = 아래에 그날 자세히, 두 번 누르기·Enter·고치기·기록하기 = 칠하기 창(js/sleep_modal.js). ↑↓ = 날 옮기기(달 경계 넘으면 달도)
//   journal.js의 Life.VIEWS.archive 그리기 함수를 감싸서, 지금 안 탭이 잠일 때만 패널 안을 바꿔 끼움 (logs_view.js와 같은 방식). 버튼 연결은 Life.renderHooks
//   문구 = js/data/sleep_lines.js (PH_LINES.ui.sleep, 부기 원고 자리)
(function (root) {
  'use strict';
  const S = root.PH_SETTINGS, Life = root.PHLife, SC = root.PHSleepCalc, LL = root.PHLifeLog, LT = root.PHLogTable;
  if (!Life || !Life.VIEWS || !SC || !LL) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const U = () => (root.PH_LINES && root.PH_LINES.uiPlain && root.PH_LINES.uiPlain.sleep) || {};   // 화면 글
  const UP = () => (root.PH_LINES && root.PH_LINES.ui && root.PH_LINES.ui.sleep) || {};            // 펫 말
  const fill = (t, v) => String(t == null ? '' : t).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));
  const lastPick = {};
  function pick(list, k) { if (!Array.isArray(list)) return list || ''; if (list.length < 2) return list[0] || ''; const c = list.filter((t) => t !== lastPick[k]); const t = c[Math.floor(Math.random() * c.length)]; lastPick[k] = t; return t; }
  const SM = () => root.PHSleepModal;
  const canWrite = () => !!(root.PHDesktop && root.PHDesktop.setSleepWindow);
  const nowMs = () => (Life.now ? Life.now() : Date.now());
  const today = () => LT.logDay(nowMs(), S.DAY_START_HOUR);
  const nowRow = () => SC.rowOfMs(nowMs());
  const WD = SC.WD;
  // 상태: 보는 달(null = 이번 달), 고른 날(null = 오늘), 스크롤 자리
  const V = { ym: null, sel: null, scroll: null, scrollYm: null };
  const view = () => { const t = today(), nr = nowRow(); let sel = V.sel || t; if (sel > nr) sel = nr; return { ym: V.ym || t.slice(0, 7), sel, today: t, nowRow: nr }; };
  const shiftYm = (ym, k) => { const [y, m] = ym.split('-').map(Number), x = new Date(Date.UTC(y, m - 1 + k, 1)); return `${x.getUTCFullYear()}-${SC.pad(x.getUTCMonth() + 1)}`; };

  // ---- 그림 조각 ----
  // 펜 한 줄. 흔들림 변수는 그린 뒤 실제 너비로(dress)
  function pen(p, extra) {
    const cls = ['pen', p.light ? 'k1' : 'k2', p.cutStart ? 'cutL' : '', p.cutEnd ? 'cutR' : '', p.open === 'bed' ? 'fadeR' : '', p.open === 'wake' ? 'fadeL' : '', extra || ''].filter(Boolean).join(' ');
    return `<i class="${cls}" data-seed="${SC.seedOf(p)}" data-len="${p.b - p.a}" style="left:${(p.a / 14.4).toFixed(4)}%;width:${((p.b - p.a) / 14.4).toFixed(4)}%"></i>`;
  }
  const swatch = (light, seed) => `<span class="sw">${pen({ a: 0, b: 1440, light, seed })}</span>`;
  // 1시간 선 (unit = 60) 또는 30분 선(unit = 30, 칠하기 띠)
  function lines(unit) {
    let h = '';
    for (let m = unit; m < 1440; m += unit) {
      const c = (m + SC.H * 60) % 1440, cls = c === 0 ? 'mid' : c % 360 === 0 ? 'six' : c % 60 ? 'half' : '';
      h += `<i class="${cls}" style="left:${(m / 14.4).toFixed(4)}%"></i>`;
    }
    return `<div class="sl-lines" aria-hidden="true">${h}</div>`;
  }
  // 펜에 흔들림 변수 넣기 (줄 너비 px 기준). 다시 그려도 같은 모양
  function dress(box) {
    if (!box) return;
    box.querySelectorAll('.pen[data-seed]').forEach((e) => {
      const host = e.parentElement, w = host ? host.clientWidth : 0, wpx = w ? Number(e.dataset.len) * w / 1440 : 60;
      e.style.cssText = e.style.cssText.replace(/--[a-z0-9]+:[^;]*;?/g, '') + ';' + SC.penVars(Number(e.dataset.seed), wpx);
    });
  }
  const dv = (s) => { const p = SC.addDays(s, -1).split('-').map(Number), c = s.split('-').map(Number); return { y: c[0], m: c[1], d: c[2], wd: WD[SC.dow(s)], pm: p[1], pd: p[2], start: SC.H }; };
  const dayName = (s) => fill(U().day.title, dv(s));
  // key = 'day.span' (잠 탭) | 'lm.dateHint' (칠하기 창)
  function spanText(date, key) { const [a, b] = (key || 'day.span').split('.'); return fill(U()[a][b], dv(date)); }
  function timeText(p) {
    const D = U().day;
    if (p.open === 'bed') return fill(D.timeOpen, { a: SC.clock(p.a) });
    if (p.open === 'wake') return fill(D.timeOpenWake, { b: SC.clock(p.b) });
    return fill(D.time, { a: p.start ? p.start.slice(11) : SC.clock(p.a), b: p.end ? p.end.slice(11) : SC.clock(p.b) });
  }
  const KIND_KEY = { night: 'night', nap: 'nap', light: 'doze', bedOnly: 'open', wakeOnly: 'openWake' };
  const kindLabel = (p) => (U().day.kind || {})[KIND_KEY[SC.kindOf(p)]] || '';
  const openTip = (p) => (p.open === 'bed' ? fill(U().open.tip, { bed: SC.clock(p.a) }) : fill(U().open.tipWake, { b: SC.clock(p.b) }));

  // ---- 잠 탭 패널 ----
  function panel(d) {
    const v = view(), u = U(), G = u.grid, M = SC.month(d.lines || [], v.ym, nowMs());
    const thisM = v.today.slice(0, 7), lastM = v.nowRow.slice(0, 7), isNow = v.ym === thisM;
    let h = `<div class="sl-panel" data-ym="${v.ym}"><div class="lg-bar"><p class="lg-count">${fill(esc(u.bar.count), { y: M.y, m: M.m, n: `<b>${M.count}</b>` })}${M.avg ? fill(esc(u.bar.avg), { dur: `<b>${esc(SC.dur(M.avg))}</b>` }) : ''}</p>` +
      (canWrite() ? `<button type="button" class="lg-add sl-add" data-focus="sl-add">${esc(u.bar.add)}</button>` : '') + '</div>';
    if (!M.count) { if (V.emptyYm !== v.ym) { V.emptyYm = v.ym; V.emptyLine = pick(v.ym >= thisM ? UP().empty.now : UP().empty.past, 'empty'); }
      h += `<div class="life-dubu small sl-empty"><canvas class="dubu-mini" width="16" height="20" aria-hidden="true"></canvas><p>${esc(V.emptyLine)}</p></div>`; }
    h += `<section class="sl" aria-label="${esc(fill(G.ariaLabel, { m: M.m }))}"><div class="cal-head"><h3>${esc(fill(G.title, { y: M.y, m: M.m }))}</h3>` +
      `<span class="cal-nav" role="group" aria-label="${esc(G.navAria)}"><button type="button" class="cal-prev sl-prev" aria-label="${esc(G.prevAria)}" data-focus="sl-prev">◀</button>` +
      `<button type="button" class="cal-now sl-thism" ${isNow ? 'disabled' : ''} data-focus="sl-thism">${esc(G.this)}</button>` +
      `<button type="button" class="cal-next sl-next" aria-label="${esc(G.nextAria)}" ${v.ym >= lastM ? 'disabled' : ''} data-focus="sl-next">▶</button></span></div>`;
    h += '<div class="sl-sheet"><div class="sl-scroll"><div class="sl-inner">';
    // 머리: 18·21·0시·3·6·9·12·15·18 (좁은 창은 6시간마다 = .h3 숨김)
    const midAt = (24 - SC.H) * 60;
    let hl = '';
    for (let m = 0; m <= 1440; m += 180) {
      const c = ((m + SC.H * 60) % 1440) / 60, mid = c === 0, six = m % 360 === 0;
      hl += `<span class="hl ${mid ? 'mid' : ''} ${six ? '' : 'h3'} ${m === 0 ? 'edge' : ''} ${m === 1440 ? 'edge r' : ''}" style="left:${(m / 14.4).toFixed(4)}%">${mid ? esc(G.hourMid) : c}</span>`;
    }
    h += `<div class="sl-head sl-grid"><span class="corner"></span><div class="sl-hours"><span class="half prev">${esc(G.dayPrev)}</span>` +
      `<span class="half cur" style="left:${(midAt / 14.4).toFixed(4)}%">${esc(G.dayThis)}</span><i class="midtick" style="left:${(midAt / 14.4).toFixed(4)}%"></i>${hl}</div><span class="sl-tot-h">${esc(G.totHead)}</span></div>`;
    h += `<div class="sl-body" role="grid" aria-label="${esc(fill(G.ariaLabel, { m: M.m }))}" aria-readonly="true">${lines(60)}`;
    const R = u.row;
    M.rows.forEach((r) => {
      let track = r.pieces.map((p) => pen(p) + (p.open ? `<b class="sl-q" title="${esc(openTip(p))}" style="left:${(((p.open === 'bed' ? p.b + 12 : p.a - 12)) / 14.4).toFixed(3)}%">?</b>` : '')).join('');
      if (r.nowAt != null) track += `<b class="sl-yet" style="left:${(r.nowAt / 14.4).toFixed(4)}%"></b><b class="sl-now" style="left:${(r.nowAt / 14.4).toFixed(4)}%" data-label="${esc(G.now)}"></b>`;
      const sel = r.date === v.sel, cls = ['sl-row', 'sl-grid', r.date === v.today ? 'today' : '', sel ? 'sel' : '', r.future ? 'future' : '', r.dow === 0 ? 'wk-end' : ''].filter(Boolean).join(' ');
      const op = r.pieces.find((p) => p.open);
      const label = dayName(r.date) + (r.date === v.today ? R.today : '') + (r.future ? R.future : r.total ? fill(R.tot, { dur: SC.dur(r.total) }) : op ? (op.open === 'bed' ? R.open : R.openWake) : R.none);
      const tot = r.future ? '' : r.total ? SC.durShort(r.total) : r.openOnly ? G.totOpen : G.totNone;
      h += `<div class="${cls}" role="row" data-date="${r.date}" ${r.future ? 'aria-disabled="true"' : `tabindex="${sel ? 0 : -1}" data-focus="sl:${r.date}"`} aria-selected="${sel}" aria-label="${esc(label)}">` +
        `<span class="sl-date ${r.dow === 6 ? 'sat' : r.dow === 0 ? 'sun' : ''}" role="rowheader"><span class="n">${r.d}</span><small>${WD[r.dow]}</small></span>` +
        `<div class="sl-track" role="gridcell">${track}</div><span class="sl-tot ${r.total ? '' : 'none'}" ${!r.total && r.openOnly ? `title="${esc(u.open.totTip)}"` : ''}>${esc(tot)}</span></div>`;
    });
    h += '</div></div></div>'; // sl-body, sl-inner, sl-scroll (범례까지 sl-sheet 안)
    const L = u.legend, hasOpen = M.rows.some((r) => r.hasOpen);
    h += `<div class="sl-legend"><span>${swatch(false, 7)}${esc(L.sleep)}</span><span>${swatch(true, 9)}${esc(L.doze)}</span>` +
      (hasOpen ? `<span class="lg-open-sw"><span class="sw">${pen({ a: 0, b: 1440, open: 'bed', seed: 11 })}</span><b class="sl-q-sw" aria-hidden="true">?</b>${esc(L.open)}</span>` : '') +
      `<span class="note">${esc(fill(L.note, { start: SC.H }))}</span></div></div></section>`;
    return h + dayHtml(M, v) + '</div>';
  }
  function dayHtml(M, v) {
    const u = U(), D = u.day, r = M.rows.find((x) => x.date === v.sel);
    const ps = r ? r.pieces : [];
    const act = canWrite() ? `<span class="lg-acts"><button type="button" class="${ps.length ? 'sl-fix' : 'sl-dayadd'}" data-focus="${ps.length ? 'sl-fix' : 'sl-dayadd'}">${esc(ps.length ? D.fix : D.add)}</button></span>` : '';
    let h = `<div class="lg-day sl-day" aria-live="polite" data-date="${v.sel}"><h4>${esc(dayName(v.sel))}${v.sel === v.today ? ` <small class="today">${esc(D.today)}</small>` : ''}<span class="span">${esc(spanText(v.sel))}</span>${act}</h4>`;
    if (!ps.length) return h + `<p class="cal-none">${esc(D.none)}</p></div>`;
    h += '<ul class="lg-items">' + ps.map((p) => `<li class="lg-item sl-item" data-kind="${SC.kindOf(p)}"><div class="lg-top"><span class="sl-chip">${pen(Object.assign({}, p, { a: 0, b: 1440, cutStart: false, cutEnd: false }))}<span class="t">${esc(kindLabel(p))}</span></span>` +
      `<span class="lg-time">${esc(timeText(p))}</span><span class="lg-dur">${esc(p.open ? (p.open === 'bed' ? D.durOpen : D.durOpenWake) : SC.dur(p.b - p.a))}</span></div></li>`).join('') + '</ul>';
    if (r.memo) h += `<p class="lg-memo">${esc(r.memo)}</p>`;
    if (r.hasOpen) h += `<p class="lg-src">${esc(D.fromDialog)}</p>`;
    return h + '</div>';
  }

  // journal.js(그리고 logs_view.js가 감싼) 그리기 함수 감싸기: 잠 안 탭이면 패널 안만 바꿔 끼움
  const orig = Life.VIEWS.archive[1];
  Life.VIEWS.archive = ['archive', (d) => {
    const J = root.PHJournal, t = J && J.cur ? J.cur() : null;
    const html = orig(d); if (!t || !t.sleep) return html;
    const old = document.querySelector('#life-archive .sl-scroll'), oldYm = old && old.closest('.sl-panel') ? old.closest('.sl-panel').dataset.ym : null;
    V.scroll = old ? old.scrollTop : null; V.scrollYm = oldYm;
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    const p = tmp.querySelector('#jn-panel'); if (p) p.innerHTML = panel(d);
    const sub = tmp.querySelector('.life-sub'); if (sub) sub.textContent = U().head.sub;
    const ro = tmp.querySelector('.life-src .ro'); if (ro && canWrite()) { ro.textContent = U().head.badge; ro.classList.add('rw'); }
    return tmp.innerHTML;
  }];

  // 창 너비에 따라 좁은 모양 (무늬 3절 작은 창 표: 본문 760px 이하 narrow, 560px 이하 tiny)
  function fit(p) {
    const w = (p.closest('.jn-panel') || p).clientWidth;
    p.classList.toggle('narrow', w <= 760 - 44); p.classList.toggle('tiny', w <= 560 - 32);
    dress(p);
  }
  let ro = null;
  function go(el, ym, sel, focus) { V.ym = ym === today().slice(0, 7) ? null : ym; V.sel = sel; Life.paint('archive', el, focus); }
  function journalHook(tab, el, d) {
    if (tab !== 'archive' || !d) return;
    const p = el.querySelector('.sl-panel'); if (!p) return;
    const v = view();
    fit(p);
    if (ro) ro.disconnect();
    if (root.ResizeObserver) { let raf = 0; const host = p.closest('.jn-panel') || p; ro = new ResizeObserver(() => { if (!p.isConnected) { ro.disconnect(); return; } cancelAnimationFrame(raf); raf = requestAnimationFrame(() => fit(p)); }); ro.observe(host); } // 다음 그림 때 맞춤 (같은 그림 안에서 다시 재면 'ResizeObserver loop' 경고)
    const sc = p.querySelector('.sl-scroll');
    if (sc) { // 같은 달을 다시 그리면 스크롤 그대로, 이번 달 처음 = 고른 줄이 아래에서 세 줄쯤 위, 지난 달 = 맨 위부터
      if (V.scroll != null && V.scrollYm === v.ym) sc.scrollTop = V.scroll;
      else if (v.ym === v.nowRow.slice(0, 7) || v.ym === v.today.slice(0, 7) || V.ym === null) { const r = sc.querySelector('.sl-row.sel') || sc.querySelector('.sl-row.today'); if (r) sc.scrollTop = Math.max(0, r.offsetTop - sc.clientHeight + r.offsetHeight * 4 + 40); }
      else sc.scrollTop = 0;
      V.scroll = null;
    }
    const lastIn = (ym) => { const days = SC.month('', ym, nowMs()).rows.filter((r) => !r.future); return days.length ? days[days.length - 1].date : `${ym}-01`; };
    p.querySelector('.sl-prev').addEventListener('click', () => { const ym = shiftYm(v.ym, -1); go(el, ym, lastIn(ym), 'sl-prev'); });
    p.querySelector('.sl-next').addEventListener('click', () => { const ym = shiftYm(v.ym, 1); if (ym > v.nowRow.slice(0, 7)) return; go(el, ym, lastIn(ym), 'sl-next'); });
    p.querySelector(".sl-thism").addEventListener('click', () => { V.ym = null; V.sel = null; Life.paint('archive', el, 'sl:' + view().sel); });
    const open = (date) => { if (canWrite() && SM()) SM().open({ date, from: 'journal' }); };
    p.querySelectorAll('.sl-row:not(.future)').forEach((r) => {
      r.addEventListener('click', () => { if (V.sel === r.dataset.date) return; V.sel = r.dataset.date; Life.paint('archive', el, 'sl:' + r.dataset.date); });
      r.addEventListener('dblclick', () => open(r.dataset.date));
      r.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); open(r.dataset.date); return; }
        const k = { ArrowUp: -1, ArrowDown: 1 }[e.key]; if (!k) return;
        e.preventDefault();
        const nd = SC.addDays(r.dataset.date, k); if (nd > v.nowRow) return;
        go(el, nd.slice(0, 7), nd, 'sl:' + nd);
        const n = el.querySelector(`.sl-row[data-date="${nd}"]`); if (n) n.scrollIntoView({ block: 'nearest' });
      });
    });
    const add = p.querySelector('.sl-add'); if (add) add.addEventListener('click', () => open(v.sel));
    const fix = p.querySelector('.sl-fix, .sl-dayadd'); if (fix) fix.addEventListener('click', () => open(v.sel));
  }

  // ---- 생활 습관 탭 "기록" 카드: 잠 줄 (대변·식사 줄과 같은 모양, 제작자 2026-10-09) ----
  function habitsHook(tab, el, d) {
    if (tab !== 'habits' || !d) return;
    const card = el.querySelector('.card[data-card="기록"]'); if (!card) return;
    let ul = card.querySelector(':scope > ul'); if (!ul) { ul = document.createElement('ul'); card.appendChild(ul); }
    if (ul.querySelector(':scope > li[data-log="sleep"]')) return;
    const C = U().card, td = today(), last = SC.lastSleep(d.lines || [], nowMs());
    const row = SC.day(d.lines || [], td), tot = SC.totalOf(row.pieces), op = row.pieces.find((p) => p.open === 'bed');
    const li = document.createElement('li'); li.dataset.habit = C.name; li.dataset.log = 'sleep'; li.className = 'lg-virtual lg-hab sl-hab';
    li.innerHTML = `<b>${esc(C.name)}</b><span class="tgt">${esc(C.target)}</span>`;
    // 첫 칸 = 오늘 줄(깬 날 = 오늘) 잠 합, 오늘 줄이 비었을 때만 둘째 칸 = 최근 (부기 문구 4절)
    const first = tot ? fill(C.today, { dur: SC.dur(tot) }) : op ? fill(C.todayOpen, { bed: SC.clock(op.a) }) : C.todayNone;
    const second = tot || op ? '' : last ? fill(C.last, { date: `${Number(last.date.slice(5, 7))}/${Number(last.date.slice(8))}` }) : C.lastNone;
    const box = document.createElement('div'); box.className = 'lg-hab-row';
    box.innerHTML = `<span class="slot-note lg-today sl-today">${esc(first)}</span>` + (second ? `<span class="slot-note lg-last sl-last">${esc(second)}</span>` : '') +
      (canWrite() ? `<button type="button" class="lg-open" data-kind="sleep" data-focus="lg-open:sleep">${esc(C.open)}</button>` : '');
    li.appendChild(box);
    const meal = ul.querySelector(':scope > li[data-log="meal"]');
    if (meal && meal.nextSibling) ul.insertBefore(li, meal.nextSibling); else ul.appendChild(li);
    const b = box.querySelector('.lg-open'); if (b) b.addEventListener('click', (e) => { e.stopPropagation(); if (SM()) SM().open({ date: nowRow() > today() ? today() : nowRow(), from: 'habits' }); });
    li.addEventListener('click', (e) => { if (e.target.closest('button, a, input')) return; if (canWrite() && SM()) SM().open({ date: nowRow() > today() ? today() : nowRow(), from: 'habits' }); });
    const n = card.querySelector('h3 small'); if (n) n.textContent = String(Number(n.textContent || 0) + 1);
  }
  (Life.renderHooks = Life.renderHooks || []).push((tab, el, d) => { habitsHook(tab, el, d); journalHook(tab, el, d); });

  // 바깥(칠하기 창 저장 뒤·시험)에서: 생활일지 잠 탭을 그 날로
  function select(date) { if (!date) return; V.sel = date; V.ym = date.slice(0, 7) === today().slice(0, 7) ? null : date.slice(0, 7); }
  async function openTab(date) {
    if (root.PHJournal) root.PHJournal.tab = 'sleep';
    if (date) select(date);
    if (root.PHApp && root.PHApp.selectTab) await root.PHApp.selectTab('archive');
    return true;
  }
  root.PHSleepView = Object.assign(V, { panel, openTab, select, view, dress, pen, lines, swatch, kindLabel, spanText, dayName, pick, U, UP, fill, dv });
})(window);
