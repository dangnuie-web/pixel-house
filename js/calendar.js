// 약속 달력 (2026-10-03 비트, journal 브랜치). 약속 탭의 "오늘 약속" 바로 아래에 월 달력을 끼운다. 달력 자체는 그리기만
//   약속 적기·고치기·삭제는 js/meeting_edit_ui.js가 고른 날 목록(.cal-list)에 덧붙임 (2026-10-07)
//   약속 있는 날 = 점 + 작은 글자(시간 또는 내용 앞부분), 오늘 = 테두리 표시. ◀ ▶ 달 넘기기, "이번 달"로 돌아오기
//   날짜 누르기 -> 그날 약속이 달력 아래에. 지난 약속은 흐리게 (달력 칸도 흐린 점). 주는 월요일 시작 (공부 간트와 같음)
//   "오늘" = 하루 경계 6시 기준 날짜 (오늘 약속과 같음)
// life.js는 고치지 않음: Life.renderHooks로 약속 탭을 그린 뒤 덧붙임.
// 계산 함수(monthGrid, shift, byDate, timeKey, isPast)는 그림 없이 Node 시험(tests/test_journal.js)에서도 씀
(function (root) {
  'use strict';
  const Md = root.PHLifeMd || (typeof require !== 'undefined' ? require('./life_md.js') : null);
  const WD_MON = ['월', '화', '수', '목', '금', '토', '일'];
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (y, m0, d) => `${y}-${pad(m0 + 1)}-${pad(d)}`;

  // ---- 계산 (그림 없음) ----
  // y년 m0월(0부터)의 달력: 월요일 시작, 앞뒤 달 날짜로 채운 주 4~6줄. { y, m0, weeks: [[{ date, d, inMonth, dow(0=월) }]] }
  function monthGrid(y, m0) {
    const first = new Date(y, m0, 1, 12), lead = (first.getDay() + 6) % 7, days = new Date(y, m0 + 1, 0, 12).getDate();
    const n = Math.ceil((lead + days) / 7) * 7, weeks = [];
    for (let i = 0; i < n; i++) {
      const x = new Date(y, m0, 1 - lead + i, 12);
      if (i % 7 === 0) weeks.push([]);
      weeks[weeks.length - 1].push({ date: ymd(x.getFullYear(), x.getMonth(), x.getDate()), d: x.getDate(), inMonth: x.getMonth() === m0, dow: i % 7 });
    }
    return { y, m0, weeks };
  }
  // 달 넘기기: (2026, 11) + 1 -> (2027, 0)
  function shift(y, m0, n) { const x = new Date(y, m0 + n, 1, 12); return { y: x.getFullYear(), m0: x.getMonth() }; }
  // 시간 글 -> 정렬 값(분). "3pm" "11am" "14:30" "오후 2시" "19시" 등. 못 읽으면 null (파일 순서 뒤)
  function timeKey(s) {
    const t = String(s || '').trim().toLowerCase();
    let m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(t);
    if (m) { let h = Number(m[1]) % 12; if (m[3] === 'pm') h += 12; return h * 60 + Number(m[2] || 0); }
    m = /^(오전|오후)?\s*(\d{1,2})\s*(?::\s*(\d{2})|시(?:\s*(\d{1,2})\s*분?|\s*반)?)?$/.exec(t);
    if (m) { let h = Number(m[2]); if (m[1] === '오후' && h < 12) h += 12; if (m[1] === '오전' && h === 12) h = 0; if (h > 23) return null; const mm = m[3] != null ? Number(m[3]) : m[4] != null ? Number(m[4]) : /반$/.test(t) ? 30 : 0; return h * 60 + mm; }
    return null;
  }
  // 약속 -> { 'YYYY-MM-DD': [약속...] } (날짜 못 읽은 줄은 뺌). 한 날 안에서는 시간 순 (못 읽으면 뒤, 파일 순)
  function byDate(meetings) {
    const out = {};
    (meetings || []).forEach((m, i) => {
      const d = Md.dateOf(m.date); if (d == null) return;
      const x = new Date(d), k = ymd(x.getFullYear(), x.getMonth(), x.getDate());
      (out[k] = out[k] || []).push(Object.assign({ i, t: timeKey(m.time) }, m));
    });
    Object.keys(out).forEach((k) => out[k].sort((a, b) => (a.t == null ? 1e9 : a.t) - (b.t == null ? 1e9 : b.t) || a.i - b.i));
    return out;
  }
  const isPast = (date, today) => date < today;
  // ms -> 달력 오늘 'YYYY-MM-DD' (자정 기준)
  // 2026-10-03 제작자 "오늘 약속"과 같게: 하루 경계 startHour(settings.DAY_START_HOUR, 6시). 01~06시는 전날
  const todayOf = (ms, startHour) => { const x = new Date(ms - (Number.isFinite(startHour) ? startHour : 0) * 3600000); return ymd(x.getFullYear(), x.getMonth(), x.getDate()); };
  const DH = () => (root.PH_SETTINGS && root.PH_SETTINGS.DAY_START_HOUR);
  const calc = { monthGrid, shift, timeKey, byDate, isPast, todayOf, WD_MON };
  if (typeof document === 'undefined') { if (typeof module !== 'undefined' && module.exports) module.exports = calc; return; }

  // ---- 화면 ----
  const Life = root.PHLife; if (!Life) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const C = { y: null, m0: null, sel: null }; // 보는 달 (null = 이번 달), 고른 날 (null = 오늘)
  const UI = () => (root.PH_LINES && root.PH_LINES.ui && root.PH_LINES.ui.calendar) || {};
  const dayName = (s) => { const [y, m, d] = s.split('-').map(Number); return `${m}월 ${d}일 (${WD[new Date(y, m - 1, d, 12).getDay()]})`; };
  const chip = (m) => String(m.time || '').trim() || Array.from(String(m.text || '')).slice(0, 4).join('');

  function html(d) {
    const today = todayOf(Life.now(), DH()), [ty, tm] = today.split('-').map(Number);
    const y = C.y == null ? ty : C.y, m0 = C.m0 == null ? tm - 1 : C.m0, sel = C.sel || today;
    const G = monthGrid(y, m0), map = byDate(d.meetings), isNow = y === ty && m0 === tm - 1;
    let h = `<section class="cal" data-month="${y}-${pad(m0 + 1)}" aria-label="약속 달력"><div class="cal-head"><h3>${y}년 ${m0 + 1}월</h3>
      <span class="cal-nav" role="group" aria-label="달 넘기기"><button type="button" class="cal-prev" aria-label="지난달" data-focus="cal-prev">◀</button><button type="button" class="cal-now" ${isNow ? 'disabled' : ''} data-focus="cal-now">이번 달</button><button type="button" class="cal-next" aria-label="다음 달" data-focus="cal-next">▶</button></span></div>`;
    // 요일 머리는 판 밖 위 (무늬 기록기능디자인 v01 6절: 판 = 한 장의 표)
    h += '<div class="cal-row cal-wd" aria-hidden="true">' + WD_MON.map((w, i) => `<span class="${i === 5 ? 'sat' : i === 6 ? 'sun' : ''}">${w}</span>`).join('') + '</div><div class="cal-grid" role="grid" aria-readonly="true">';
    G.weeks.forEach((wk) => {
      h += '<div class="cal-row" role="row">' + wk.map((c) => {
        const list = map[c.date] || [], past = isPast(c.date, today);
        const cls = ['cal-day', c.inMonth ? '' : 'out', c.date === today ? 'today' : '', c.date === sel ? 'sel' : '', list.length ? 'has' : '', past ? 'past' : '', c.dow === 5 ? 'sat' : c.dow === 6 ? 'sun' : ''].filter(Boolean).join(' ');
        const label = `${dayName(c.date)}${c.date === today ? ', 오늘' : ''}${list.length ? `, 약속 ${list.length}개` : ''}`;
        const marks = list.length ? `<span class="cal-marks">${list.slice(0, 2).map((m) => `<span class="cal-mt"><i class="cal-dot" aria-hidden="true"></i><small>${esc(chip(m))}</small></span>`).join('')}${list.length > 2 ? `<small class="cal-more">+${list.length - 2}</small>` : ''}</span>` : '';
        return `<button type="button" role="gridcell" class="${cls}" data-date="${c.date}" aria-selected="${c.date === sel}" aria-label="${esc(label)}" tabindex="${c.date === sel ? 0 : -1}" data-focus="cal:${c.date}"><span class="cal-n">${c.d}</span>${marks}</button>`;
      }).join('') + '</div>';
    });
    h += '</div>';
    const list = map[sel] || [], past = isPast(sel, today);
    h += `<div class="cal-list" aria-live="polite" data-date="${sel}"><h4>${esc(dayName(sel))}${sel === today ? ' <small>오늘</small>' : ''}</h4>`;
    h += list.length ? '<ul class="cal-its">' + list.map((m) => `<li class="cal-it ${past ? 'past' : ''}" data-line="${m.line}"><span class="cal-it-time">${esc(m.time)}</span><span class="cal-it-text">${esc(m.text)}</span></li>`).join('') + '</ul>'
      : `<p class="cal-none">${esc(UI().none || '이날은 약속이 없어요.')}</p>`;
    return h + '</div></section>';
  }
  function go(el, y, m0, sel, focus) {
    const today = todayOf(Life.now(), DH()), [ty, tm] = today.split('-').map(Number);
    if (y === ty && m0 === tm - 1) { C.y = null; C.m0 = null; } else { C.y = y; C.m0 = m0; }
    C.sel = sel; Life.paint('meetings', el, focus);
  }
  function view() { const today = todayOf(Life.now(), DH()), [ty, tm] = today.split('-').map(Number); return { y: C.y == null ? ty : C.y, m0: C.m0 == null ? tm - 1 : C.m0, today }; }
  function bind(tab, el) {
    if (tab !== 'meetings' || !Life.data || !Life.data.meetings) return;
    // 자리: "오늘 약속" 섹션 바로 뒤 (없으면 머리 뒤). 2026-10-03 제작자: 오늘 약속 아래에 달력
    const up = [...el.querySelectorAll('section > h3')].find((h) => h.textContent.trim() === '오늘 약속');
    const tmp = document.createElement('div'); tmp.innerHTML = html(Life.data);
    const cal = tmp.firstElementChild;
    if (up) up.parentElement.after(cal); else { const hd = el.querySelector('.life-head'); if (hd) hd.after(cal); else el.prepend(cal); }
    const v = () => view();
    cal.querySelector('.cal-prev').addEventListener('click', () => { const x = v(), n = shift(x.y, x.m0, -1); go(el, n.y, n.m0, ymd(n.y, n.m0, 1), 'cal-prev'); });
    cal.querySelector('.cal-next').addEventListener('click', () => { const x = v(), n = shift(x.y, x.m0, 1); go(el, n.y, n.m0, ymd(n.y, n.m0, 1), 'cal-next'); });
    cal.querySelector('.cal-now').addEventListener('click', () => { const x = v(), [ty, tm] = x.today.split('-').map(Number); go(el, ty, tm - 1, null, 'cal:' + x.today); });
    cal.querySelectorAll('.cal-day').forEach((b) => {
      b.addEventListener('click', () => { const [y, m] = b.dataset.date.split('-').map(Number); go(el, y, m - 1, b.dataset.date, 'cal:' + b.dataset.date); });
      b.addEventListener('keydown', (e) => { // 방향키로 하루·한 주씩 (달을 넘어가면 그 달로)
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]; if (!step) return;
        e.preventDefault();
        const [y, m, d] = b.dataset.date.split('-').map(Number), x = new Date(y, m - 1, d + step, 12), nd = ymd(x.getFullYear(), x.getMonth(), x.getDate());
        go(el, x.getFullYear(), x.getMonth(), nd, 'cal:' + nd);
      });
    });
  }
  (Life.renderHooks = Life.renderHooks || []).push(bind);
  root.PHCalendar = Object.assign(C, calc, { html, view });
})(typeof window !== 'undefined' ? window : globalThis);
