// 생활 탭들 (생활 습관 / 약속 / 버킷리스트 / 기록 보관). 읽기 전용이 기본: md를 읽어서 보여 준다.
// 쓰기 (생활 습관 탭): "오늘" 카드의 물 칸 (settings.WATER_HABIT, PHDesktop.setWater), 주 N회 칸(toggleWeekly), 기록 습관 양(addAmount),
//   안전장치 "이번 주 확인"(setSafetyCheck). 모두 메인이 정해진 섹션·오늘 줄만 바꿈. 계산은 js/life_check.js
//   하루 경계 = settings.DAY_START_HOUR (6시): 01~06시는 전날. 주는 월요일 시작
// 파일 경로 = settings.LIFE_FILE 한 줄 (PixelHouse 폴더 안 상대 경로). 읽기는 Electron PHDesktop.read (electron/main.js에서 경로 검사)
// 나중에 쓰기: life_md.js가 줄 번호를 남겨 두었으니, 화면 항목의 data-line 줄만 바꿔 쓰면 된다 (PHDesktop.write를 그때 추가)
(function (root) {
  'use strict';
  const S = root.PH_SETTINGS, Md = root.PHLifeMd, LC = root.PHLifeCheck, HC = root.PHHabitCycle, UI = Object.assign({}, root.PH_LINES && root.PH_LINES.ui, root.PH_LINES && root.PH_LINES.uiPlain);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  function dayLabel(s) { const d = Md.dateOf(s); if (d == null) return esc(s); const x = new Date(d); return `${x.getMonth() + 1}월 ${x.getDate()}일 (${WEEK[x.getDay()]})`; }
  const md = (d) => { const x = new Date(d); return `${x.getMonth() + 1}/${x.getDate()}`; };
  const TAB = (k) => (S.TAB_NAMES && S.TAB_NAMES[k]) || k;
  // 카드 (생활 습관 탭 위에서부터): 오늘(=파일 종류 "목표") > 공부(간트) > 안전장치 > 기록 > (비었으면) 버킷리스트
  //   제목만 바꿔 보임. 파일의 종류 이름은 그대로 (목표·안전장치·기록)
  const KIND_CARDS = [
    { kind: '목표', title: '오늘', cls: 'k-goal' },
    { kind: '안전장치', title: '안전장치', cls: 'k-safe' },
    { kind: '기록', title: '기록', cls: 'k-log' },
  ];

  const Life = { data: null, error: null, readAt: null, now: () => Date.now() };
  // 기록 날짜 (하루 경계 DAY_START_HOUR)
  const today = () => Md.logDay(Life.now(), S.DAY_START_HOUR);
  // 화면 상태 (다시 그려도 유지): 안전장치 확인 칸 열림, 양 적기 칸(습관 이름), 더할지 바꿀지 묻는 중 { habit, value, prev }
  Life.ui = { safetyOpen: false, amount: null, ask: null };
  // 대사 채우기: {habit} {amount} / {amount|으로} {amount|이에요} = 받침 따라 조사
  function josa(word, kind) {
    const c = String(word).slice(-1).charCodeAt(0), han = c >= 0xAC00 && c <= 0xD7A3, jong = han ? (c - 0xAC00) % 28 : 0;
    if (kind === '으로') return word + (jong && jong !== 8 ? '으로' : '로');
    if (kind === '이에요') return word + (jong ? '이에요' : '예요');
    if (kind === '은') return word + (jong ? '은' : '는'); // 2026-10-04 가구 연결 대사
    if (kind === '이') return word + (jong ? '이' : '가');
    return word;
  }
  function fill(t, v) { return String(t || '').replace(/\{(\w+)(?:\|([^}]+))?\}/g, (m, k, j) => (v && v[k] != null ? (j ? josa(String(v[k]), j) : String(v[k])) : m)); }
  const SAY = (k) => (root.PH_LINES && root.PH_LINES.ui && root.PH_LINES.ui[k]) || {};

  async function load() {
    Life.error = null;
    try {
      if (!root.PHDesktop || !root.PHDesktop.read) throw Object.assign(new Error('desktop'), { code: 'browser' });
      const r = await root.PHDesktop.read(S.LIFE_FILE);
      Life.data = Md.parse(r.text); Life.readAt = Date.now(); Life.lastModified = r.lastModified;
    } catch (e) { Life.data = null; Life.readAt = null; Life.error = e.code === 'browser' ? 'browser' : 'missing'; Life.errorText = String(e.message || e); }
    return Life.data;
  }
  // 버킷리스트를 탭으로 꺼낼지 (settings.BUCKET_TAB)
  function bucketItems(d) { return d && d.bucket ? d.bucket.filter((b) => !b.placeholder) : []; }
  function bucketAsTab(d) { return S.BUCKET_TAB === 'tab' || (S.BUCKET_TAB !== 'inline' && bucketItems(d).length > 0); }

  function dubuNote(text, cls) { return `<div class="life-dubu ${cls || ''}"><canvas class="dubu-mini" width="16" height="20" aria-hidden="true"></canvas><p>${esc(text)}</p></div>`; }
  function head(title, sub, badge) {
    const file = String(S.LIFE_FILE).split('/').pop();
    const at = Life.readAt ? new Date(Life.readAt) : null;
    const when = at ? `${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}에 읽음` : '';
    return `<header class="life-head"><div><h2>${esc(title)}</h2>${sub ? `<p class="life-sub">${esc(sub)}</p>` : ''}</div>
      <div class="life-src"><span class="ro ${badge ? 'rw' : ''}">${esc(badge || '읽기 전용')}</span><span title="${esc(S.LIFE_FILE)}">${esc(file)}</span><span>${esc(when)}</span><button class="life-reload" type="button">다시 읽기</button></div></header>`;
  }
  function errorView(title) {
    const msg = Life.error === 'browser' ? UI.browserOnly : UI.fileMissing;
    return head(title) + dubuNote(msg, 'warn') + `<p class="life-path">${esc(S.LIFE_FILE)}</p>`;
  }
  function slotNote(last) { return last ? (last.isToday ? `오늘 ${last.value}/${last.of}` : `오늘 기록 없음 · 마지막 ${dayLabel(last.date)} ${last.value}/${last.of}`) : '기록 없음'; }
  const canWrite = () => !!(root.PHDesktop && root.PHDesktop.setWater);
  // 누를 수 있는 컵 칸 (k번째 = k잔). 채워진 마지막 컵을 다시 누르면 한 잔 줄어듦
  function cupButtons(n, filled, name) {
    let h = '<span class="slots cups" role="group" aria-label="' + esc(name) + ' 칸 (눌러서 체크)">';
    for (let i = 1; i <= n; i++) h += `<button type="button" class="cup ${i <= filled ? 'on' : ''}" data-k="${i}" aria-pressed="${i <= filled}" aria-label="${esc(name)} ${i}잔${i === filled ? ' (다시 누르면 한 잔 줄어요)' : ''}"></button>`;
    return h + '</span>';
  }
  function slotCells(n, filled) { let h = '<span class="slots" aria-hidden="true">'; for (let i = 0; i < n; i++) h += `<i class="${i < filled ? 'on' : ''}"></i>`; return h + '</span>'; }

  // ---- 습관 카드 하나 (종류 하나) ----
  //   ctx = { today, safety(안전장치 확인 줄), up("오늘"로 올라온 안전장치 [{ name, until }]) }
  //   오늘(목표) 카드: 목표 습관 + 올라온 안전장치(2주). 안전장치 카드: 올라간 것은 빼고 + "이번 주 확인". 기록 카드: 양 적기
  function kindCard(d, k, desc, ctx) {
    const upNames = new Set(ctx.up.map((p) => p.name));
    let rows = d.habits.rows.filter((r) => r.kind === k.kind);
    if (k.kind === LC.KIND.safety) rows = rows.filter((r) => !upNames.has(r.name));
    if (k.kind === LC.KIND.goal) rows = rows.concat(d.habits.rows.filter((r) => r.kind === LC.KIND.safety && upNames.has(r.name)));
    const tools = k.kind === LC.KIND.safety && canCheck('setSafetyCheck') ? `<button type="button" class="chk-open" aria-expanded="${Life.ui.safetyOpen}" data-focus="chk-open">${esc(UI.checkWeek)}</button>` : '';
    return `<section class="card kind ${k.cls}" data-card="${esc(k.kind)}" data-kind="${esc(k.kind)}"><h3>${esc(k.title)} <small>${rows.length}</small>${tools}</h3>` +
      (desc ? `<p class="kind-desc">${esc(desc)}</p>` : '') +
      (k.kind === LC.KIND.safety && Life.ui.safetyOpen ? safetyPanel(d, ctx) : '') + '<ul>' +
      rows.map((r) => {
        let extra = '';
        const up = upNames.has(r.name) && k.kind === LC.KIND.goal ? ctx.up.find((p) => p.name === r.name) : null;
        if (r.slots && !HC.slotsOf(r.cycle)) { // 물 (기준 "6칸")
          const last = Md.latestSlots(d.records, r.name, Life.now(), S.DAY_START_HOUR);
          const filled = last && last.isToday ? last.value : 0;
          const note = slotNote(last);
          const writable = r.name === S.WATER_HABIT && canWrite();
          extra = `<div class="slot-row ${writable ? 'rw' : ''}" data-slots="${r.slots}" data-filled="${filled}" data-habit="${esc(r.name)}">${writable ? cupButtons(r.slots, filled, r.name) : slotCells(r.slots, filled)}<span class="slot-note">${esc(note)}</span></div>`;
        } else if (k.kind === LC.KIND.goal && r.kind === LC.KIND.goal && HC.slotsOf(r.cycle)) extra = dailyRow(d, r, ctx); // 매일 n회 = 오늘 n칸 (2026-10-04)
        else if (k.kind === LC.KIND.goal && (LC.weeklyOf(r.cycle) || (r.kind === LC.KIND.goal && HC.isToggle(r.cycle)))) extra = weekRow(d, r, ctx); // 주 n회·월 n회·매일 1회
        else if (k.kind === LC.KIND.log && LC.unitOf(r.target)) extra = amountRow(d, r, ctx);
        if (up) extra += `<p class="up-note">${esc(fill(UI.promotedNote, { until: md(Md.dateOf(up.until)) }))}</p>`;
        return `<li data-line="${r.line}" data-habit="${esc(r.name)}"${up ? ' class="up"' : ''}><b>${esc(r.name)}</b><span class="tgt">${esc(r.target)}</span><span class="cyc">${esc(r.cycle)}</span>${extra}</li>`;
      }).join('') + '</ul></section>';
  }
  const canCheck = (fn) => !!(root.PHDesktop && root.PHDesktop[fn]);
  // E: "이번 주 n/N" 칸. 누르면 오늘 했음/안 했음 (어느 칸이든 같음). 넘쳐도(3/2) 그대로 적고, 못 채운 표시는 없음
  //   2026-10-04: 같은 칸으로 "이번 달 n/N"(월 n회)과 "오늘"(매일 1회)도 (js/habit_cycle.js countFor)
  function weekRow(d, r, ctx) {
    const c = HC.countFor(d.records, r, ctx.today), N = c.n, w = c, on = Math.min(w.count, N), rw = canCheck('toggleWeekly');
    const P = { week: '이번 주', month: '이번 달', day: '오늘' }[c.per];
    let h = `<div class="week-row ${rw ? 'rw' : ''}" data-habit="${esc(r.name)}" data-per="${c.per}" data-n="${N}" data-count="${w.count}" data-today="${w.todayDone}">`;
    h += `<span class="wk-cells" role="group" aria-label="${esc(r.name)} ${P} 칸">`;
    for (let i = 1; i <= N; i++) {
      const lab = `${r.name} ${P}${c.per === 'day' ? '' : ' ' + i + '번째'} 칸${w.todayDone ? ' (누르면 오늘 기록을 빼요)' : ' (누르면 오늘 했다고 적어요)'}`;
      h += rw ? `<button type="button" class="wk ${i <= on ? 'on' : ''} ${w.todayDone && i === on ? 'today' : ''}" data-focus="wk:${esc(r.name)}:${i}" aria-pressed="${i <= on}" aria-label="${esc(lab)}"></button>`
        : `<i class="wk ${i <= on ? 'on' : ''}"></i>`;
    }
    return h + `</span><span class="slot-note">${esc(HC.note(c))}</span></div>`;
  }
  // 매일 n회: 오늘 n칸 (물 6칸처럼 k번째 칸 = k회, 채워진 마지막 칸을 다시 누르면 한 칸 줄어듦). 오늘 줄에 "습관 k/n"
  function dailyRow(d, r, ctx) {
    const c = HC.countFor(d.records, r, ctx.today), N = c.n, on = Math.min(c.count, N), rw = !!(root.PHHabitDesktop && root.PHHabitDesktop.setDaily);
    let h = `<div class="daily-row week-row ${rw ? 'rw' : ''}" data-habit="${esc(r.name)}" data-per="day" data-n="${N}" data-count="${c.count}">`;
    h += `<span class="wk-cells" role="group" aria-label="${esc(r.name)} 오늘 칸">`;
    for (let i = 1; i <= N; i++) {
      h += rw ? `<button type="button" class="wk dk ${i <= on ? 'on' : ''}" data-k="${i}" data-focus="dk:${esc(r.name)}:${i}" aria-pressed="${i <= on}" aria-label="${esc(`${r.name} 오늘 ${i}회${i === on ? ' (다시 누르면 한 칸 줄어요)' : ''}`)}"></button>`
        : `<i class="wk ${i <= on ? 'on' : ''}"></i>`;
    }
    return h + `</span><span class="slot-note">${esc(HC.note(c))}</span></div>`;
  }
  // 기록 습관 양: "+ 적기" -> 숫자 칸 -> (오늘 이미 있으면) 더하기 / 바꾸기
  function amountRow(d, r, ctx) {
    const unit = LC.unitOf(r.target), v = LC.todayAmount(d.records, r.name, unit, ctx.today), rw = canCheck('addAmount');
    const open = Life.ui.amount === r.name, ask = Life.ui.ask && Life.ui.ask.habit === r.name ? Life.ui.ask : null;
    let h = `<div class="amt-row ${rw ? 'rw' : ''}" data-habit="${esc(r.name)}" data-unit="${esc(unit)}" data-today="${v == null ? '' : v}">`;
    if (v != null && !ask) h += `<span class="slot-note amt-today">오늘 ${v}${esc(unit)}</span>`;
    if (rw && !open && !ask) h += `<button type="button" class="amt-open" data-focus="amt-open:${esc(r.name)}">${esc(UI.amountOpen)}</button>`;
    if (rw && open && !ask) h += `<form class="amt-form"><input class="amt-in" type="number" inputmode="numeric" min="1" max="${LC.MAX_AMOUNT}" step="1" aria-label="${esc(r.name)} 양 (${esc(unit)})" data-focus="amt-in:${esc(r.name)}"><span class="amt-unit">${esc(unit)}</span>` +
      `<button type="submit" class="amt-save">${esc(UI.amountSave)}</button><button type="button" class="amt-cancel">${esc(UI.amountCancel)}</button></form>`;
    if (rw && ask) h += `<div class="amt-ask" role="group" aria-label="${esc(r.name)} 더할지 바꿀지"><span>오늘 ${ask.prev}${esc(unit)} + ${ask.value}${esc(unit)}</span>` +
      `<button type="button" class="amt-mode" data-mode="add" data-focus="amt-add:${esc(r.name)}">${esc(UI.amountAdd)} → ${ask.prev + ask.value}${esc(unit)}</button>` +
      `<button type="button" class="amt-mode" data-mode="set">${esc(UI.amountSet)} → ${ask.value}${esc(unit)}</button><button type="button" class="amt-cancel">${esc(UI.amountCancel)}</button></div>`;
    return h + '</div>';
  }
  // I: 안전장치 이번 주 확인 칸. 항목마다 "잘 챙겼어 / 놓쳤어" (고른 것 표시, 다시 고르면 바꿈)
  function safetyPanel(d, ctx) {
    const week = Md.weekStart(ctx.today), res = LC.weekResults(ctx.safety, week);
    const items = d.habits.rows.filter((r) => r.kind === LC.KIND.safety);
    let h = `<div class="chk-panel" data-week="${week}" role="group" aria-label="안전장치 이번 주 확인"><p class="chk-week">이번 주 ${md(Md.dateOf(week))} ~ ${md(Md.dateOf(Md.addDays(week, 6)))}</p><ul>`;
    items.forEach((r) => {
      const v = res[r.name];
      h += `<li class="chk-item" data-item="${esc(r.name)}" data-result="${v || ''}"><b>${esc(r.name)}</b><span class="chk-btns">` +
        `<button type="button" class="chk good ${v === 'good' ? 'on' : ''}" data-result="good" aria-pressed="${v === 'good'}" data-focus="chk:${esc(r.name)}:good">${esc(UI.checkGood)}</button>` +
        `<button type="button" class="chk missed ${v === 'missed' ? 'on' : ''}" data-result="missed" aria-pressed="${v === 'missed'}" data-focus="chk:${esc(r.name)}:missed">${esc(UI.checkMissed)}</button></span></li>`;
    });
    return h + `</ul><button type="button" class="chk-close">${esc(UI.checkClose)}</button></div>`;
  }
  function checkCtx(d) {
    const t = today(), safety = LC.safetyRows(d.lines.join('\n'));
    return { today: t, safety, up: LC.promoted(d.habits.rows, safety, t) };
  }

  // ---- 공부 간트: 막대 하나 = 표 한 줄 (시작~끝), 오늘 세로선. 기간 = 이번 주 월요일부터 (settings.GANTT_WEEKS) ----
  function studyCard(d) {
    const st = d.study;
    let h = `<section class="card study" data-card="공부"><h3>공부 ${st ? `<small>${st.rows.length}</small>` : ''}</h3>`;
    if (!st) return h + dubuNote(UI.sectionMissing) + '</section>';
    if (st.target) h += `<p class="kind-desc">기준: <b>${esc(st.target)}</b></p>`;
    if (!st.rows.length) return h + dubuNote(UI.studyEmpty) + `<p class="fmt">${esc(UI.studyFormat)}</p></section>`;
    const G = S.GANTT_WEEKS || {}, range = Md.ganttRange(st.rows, Life.now(), G.min, G.max);
    const pct = (i) => (i / range.days * 100).toFixed(3) + '%';
    const todayIdx = Math.round((range.today - range.start) / 86400000);
    let weeks = '';
    for (let w = 0; w < range.weeks; w++) weeks += `<span style="left:${pct(w * 7)};width:${pct(7)}">${md(range.start + w * 7 * 86400000)}</span>`;
    const bad = [];
    h += `<div class="gantt" data-days="${range.days}" data-weeks="${range.weeks}" style="--wk:${range.weeks}"><div class="g-label"></div><div class="g-track g-weeks">${weeks}</div>`;
    st.rows.forEach((r) => {
      const b = Md.ganttBar(r, range);
      if (b && b.bad) { bad.push(r); return; }
      const bar = b ? `<i class="g-bar ${b.clipStart ? 'clip-s' : ''} ${b.clipEnd ? 'clip-e' : ''} ${b.open ? 'open' : ''}" style="left:${pct(b.from)};width:${pct(b.to - b.from + 1)}" title="${esc(r.start)} ~ ${esc(r.end || '진행 중')}"></i>` : '<span class="g-out">기간 밖</span>';
      h += `<div class="g-label" data-line="${r.line}"><b>${esc(r.name)}</b><small>${md(r.startDay)} ~ ${r.open ? '진행 중' : md(r.endDay)}${r.memo ? ' · ' + esc(r.memo) : ''}</small></div><div class="g-track g-row" data-line="${r.line}">${bar}</div>`;
    });
    h += `<div class="g-today" style="left:calc(var(--gl) + (100% - var(--gl)) * ${(todayIdx + 0.5) / range.days})" title="오늘"></div></div>`;
    if (bad.length) h += '<p class="fmt">날짜를 못 읽은 줄: ' + bad.map((r) => esc(r.name)).join(', ') + ' · ' + esc(UI.studyFormat) + '</p>';
    return h + '</section>';
  }

  function bucketList(items) { return '<ul class="bucket">' + items.map((b) => `<li class="${b.done ? 'done' : ''}" data-line="${b.line}"><span class="box" aria-hidden="true">${b.done ? '✓' : ''}</span>${esc(b.text)}</li>`).join('') + '</ul>'; }

  // ---- 생활 습관 탭: 한 줄에 카드 1개 ----
  function habitsView(d) {
    const H = d.habits; if (!H) return head(TAB('habits')) + dubuNote(UI.sectionMissing);
    const desc = {}; H.kinds.forEach((k) => { desc[k.name] = k.desc; });
    const ctx = checkCtx(d);
    let h = head(TAB('habits'), '종류마다 체크하는 방식이 달라요', canWrite() ? '눌러서 체크 · 오늘 줄에 적혀요' : null) + '<div class="cards">';
    h += kindCard(d, KIND_CARDS[0], desc['목표'], ctx);
    h += studyCard(d);
    h += kindCard(d, KIND_CARDS[1], desc['안전장치'], ctx);
    h += kindCard(d, KIND_CARDS[2], desc['기록'], ctx);
    if (!bucketAsTab(d)) { // 버킷리스트가 비었으면 (또는 설정 'inline') 맨 아래 칸
      const items = bucketItems(d);
      h += `<section class="card bucket-card" data-card="버킷리스트"><h3>${esc(TAB('bucket'))}</h3>` + (items.length ? bucketList(items) : dubuNote(UI.bucketEmpty)) + '</section>';
    }
    return h + '</div>';
  }

  // ---- 약속 (## 약속, 옛 이름 Meeting) ----
  //   제작자 2026-10-03: 맨 위 = "오늘 약속"(오늘만, 하루 경계 DAY_START_HOUR), 바로 아래 = 달력(js/calendar.js가 "오늘 약속" 섹션 뒤에 끼움).
  //   "다가오는 약속" 목록은 없앰(앞으로의 약속은 달력에서). "지난 약속"은 달력 아래에 접어 둠(details, 눌러서 펼침). 날짜 못 읽은 줄은 그대로 보임(고칠 수 있게)
  function meetingsView(d) {
    if (!d.meetings) return head(TAB('meetings')) + dubuNote(UI.sectionMissing);
    const today = Md.dateOf(Md.logDay(Life.now(), S.DAY_START_HOUR)), sp = Md.splitMeetings(d.meetings, today);
    const tk = (root.PHCalendar && root.PHCalendar.timeKey) || (() => null);
    const todays = sp.up.filter((m) => m.day === today).sort((a, b) => { const x = tk(a.time), y = tk(b.time); return (x == null ? 1e9 : x) - (y == null ? 1e9 : y); });
    let h = head(TAB('meetings'), '오늘 약속과 달력이에요');
    const card = (m, past, noDate) => `<li class="mt ${past ? 'past' : ''}" data-line="${m.line}">${noDate ? '' : `<span class="mt-date">${dayLabel(m.date)}</span>`}<span class="mt-time">${esc(m.time)}</span><span class="mt-text">${esc(m.text)}</span></li>`;
    h += '<section class="mt-today"><h3>오늘 약속</h3>' + (todays.length ? '<ul class="mts today">' + todays.map((m) => card(m, false, true)).join('') + '</ul>' : dubuNote(UI.meetingsTodayEmpty || UI.meetingsEmpty, 'small')) + '</section>';
    if (sp.unknown.length) h += '<section class="mt-unknown"><h3>날짜를 못 읽은 줄</h3><ul class="mts">' + sp.unknown.map((m) => card(m)).join('') + '</ul></section>';
    if (sp.past.length) h += `<details class="mt-past"><summary>지난 약속 <small>${sp.past.length}</small></summary><ul class="mts">` + sp.past.map((m) => card(m, true)).join('') + '</ul></details>';
    return h;
  }

  // ---- 버킷리스트 탭 (항목이 있을 때만 탭으로 나옴, settings.BUCKET_TAB) ----
  function bucketView(d) {
    if (!d.bucket) return head(TAB('bucket')) + dubuNote(UI.sectionMissing);
    const items = bucketItems(d);
    const h = head(TAB('bucket'), '언젠가 해 보고 싶은 일');
    return items.length ? h + bucketList(items) : h + dubuNote(UI.bucketEmpty, 'big');
  }

  // ---- 기록 보관: 습관 기록 표 (날짜별). 데이터는 entries(한 칸 = 한 날짜·한 습관) -> byDate / byHabit (나중의 분석·그래프) ----
  function archiveView(d) {
    let h = head(TAB('archive'), '습관 기록을 모아 둔 곳이에요');
    const days = Md.byDate(d.entries);
    const log = root.PHLifeLogView ? root.PHLifeLogView.html(d.lines, { dayLabel, esc }) : ''; // 잠·식사·한마디 (두부 대화창, js/life_log_view.js)
    if (!days.length) return h + (log || dubuNote(UI.recordsEmpty));
    h += `<section class="records"><table><thead><tr><th>날짜</th><th>한 습관</th></tr></thead><tbody>` + days.map((g) => `<tr data-line="${g.items[0].line}" data-date="${esc(g.date)}"><td>${dayLabel(g.date)}</td><td>` +
      g.items.map((it) => `<span class="rec" data-habit="${esc(it.habit)}">${it.of ? `${esc(it.habit)} ${slotCells(it.of, it.value)} ${it.value}/${it.of}` : esc(it.text)}</span>`).join('') + '</td></tr>').join('') + '</tbody></table></section>';
    return h + log;
  }

  const VIEWS = { habits: ['habits', habitsView], meetings: ['meetings', meetingsView], bucket: ['bucket', bucketView], archive: ['archive', archiveView] };
  // 탭 그리기. 들어올 때마다 파일을 새로 읽는다 (다른 곳에서 고쳤어도 최신)
  async function render(tab, el) {
    await load();
    paint(tab, el);
    if (Life.onLoad) Life.onLoad(Life.data);
    return Life.data;
  }
  // 읽은 글(Life.data)로 다시 그림 (파일은 안 읽음). focus = 그린 뒤 포커스를 둘 data-focus 값
  function paint(tab, el, focus) {
    const v = VIEWS[tab];
    el.innerHTML = Life.data ? v[1](Life.data) : errorView(TAB(v[0]));
    el.querySelectorAll('canvas.dubu-mini').forEach((c) => drawDubu(c));
    const btn = el.querySelector('.life-reload'); if (btn) btn.addEventListener('click', () => render(tab, el));
    el.querySelectorAll('.slot-row.rw').forEach((row) => row.addEventListener('click', (e) => { const b = e.target.closest('.cup'); if (b) onCup(tab, el, row, Number(b.dataset.k)); }));
    bindChecks(tab, el);
    (Life.renderHooks || []).forEach((f) => f(tab, el, Life.data)); // 탭을 그린 뒤 덧붙이는 모듈 (공부 간트 편집 js/study_gantt.js). 체크 뒤 다시 그릴 때도
    if (focus) { const f = Array.from(el.querySelectorAll('[data-focus]')).find((x) => x.dataset.focus === focus); if (f) f.focus(); }
  }

  // ---- 생활 습관 체크 (주 N회 칸·양 적기·안전장치 확인) ----
  //   저장은 메인. 파일이 바뀌었으면(conflict) 다시 읽고 두부가 한 번 더 부탁. 주가 바뀌었으면(stale) 새 주로 다시 그림
  function bindChecks(tab, el) {
    el.querySelectorAll('.week-row.rw:not(.daily-row) .wk').forEach((b) => b.addEventListener('click', () => onWeekly(tab, el, b.closest('.week-row').dataset.habit, b.dataset.focus)));
    el.querySelectorAll('.daily-row.rw .dk').forEach((b) => b.addEventListener('click', () => { const row = b.closest('.daily-row'), k = Number(b.dataset.k), cur = Number(row.dataset.count); onDaily(tab, el, row.dataset.habit, k === cur ? k - 1 : k, cur, b.dataset.focus); }));
    el.querySelectorAll('.chk-open').forEach((b) => b.addEventListener('click', () => {
      Life.ui.safetyOpen = !Life.ui.safetyOpen; paint(tab, el, Life.ui.safetyOpen ? firstCheckFocus(el) : 'chk-open');
      if (Life.ui.safetyOpen) sayNow(safetyAllDone() ? SAY('safety').already : fill(SAY('safety').item, { name: (firstUnchecked() || {}).name || '' }));
    }));
    el.querySelectorAll('.chk-close').forEach((b) => b.addEventListener('click', () => { Life.ui.safetyOpen = false; paint(tab, el, 'chk-open'); }));
    el.querySelectorAll('.chk-item .chk').forEach((b) => b.addEventListener('click', () => onSafety(tab, el, b.closest('.chk-panel').dataset.week, b.closest('.chk-item').dataset.item, b.dataset.result, b.dataset.focus)));
    el.querySelectorAll('.amt-open').forEach((b) => b.addEventListener('click', () => { const hb = b.closest('.amt-row').dataset.habit; Life.ui.amount = hb; Life.ui.ask = null; paint(tab, el, 'amt-in:' + hb); }));
    el.querySelectorAll('.amt-cancel').forEach((b) => b.addEventListener('click', () => { const hb = b.closest('.amt-row').dataset.habit; Life.ui.amount = null; Life.ui.ask = null; paint(tab, el, 'amt-open:' + hb); }));
    el.querySelectorAll('.amt-form').forEach((f) => {
      f.addEventListener('submit', (e) => { e.preventDefault(); onAmount(tab, el, f.closest('.amt-row'), f.querySelector('.amt-in').value); });
      f.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return; // 한글 조합 중 Enter·Esc는 받지 않음 (대화창과 같음)
        if (e.key === 'Escape') { e.preventDefault(); f.querySelector('.amt-cancel').click(); }
        else if (e.key === 'Enter' && e.target.classList.contains('amt-in')) { e.preventDefault(); onAmount(tab, el, f.closest('.amt-row'), e.target.value); }
      });
    });
    el.querySelectorAll('.amt-ask .amt-mode').forEach((b) => b.addEventListener('click', () => { const a = Life.ui.ask; if (a) saveAmount(tab, el, a.habit, a.value, b.dataset.mode); }));
  }
  function weekGot() { const d = Life.data; return d ? LC.weekResults(LC.safetyRows(d.lines.join('\n')), Md.weekStart(today())) : {}; }
  function firstUnchecked() { const d = Life.data, got = weekGot(); return d && d.habits ? d.habits.rows.find((r) => r.kind === LC.KIND.safety && !got[r.name]) : null; }
  function safetyAllDone() { const d = Life.data; if (!d || !d.habits) return false; const got = weekGot(); return d.habits.rows.filter((r) => r.kind === LC.KIND.safety).every((r) => got[r.name]); }
  function firstCheckFocus(el) { const d = Life.data, it = d && d.habits ? d.habits.rows.find((r) => r.kind === LC.KIND.safety) : null; return it ? 'chk:' + it.name + ':good' : 'chk-open'; }
  let checking = false;
  const queued = []; // 이번 반응 뒤에 이어서 할 말 (onOk가 넣음)
  // 저장 한 번: call(lastModified) -> 결과. 성공이면 onOk(res) -> 두부 한 줄. 화면은 새 글로 다시 그림
  async function check(tab, el, call, onOk, focus) {
    if (checking) return null;
    checking = true;
    const C = SAY('check');
    let res = null;
    try {
      res = await call(Life.lastModified);
      Life.data = Md.parse(res.text); Life.lastModified = res.lastModified; Life.readAt = Date.now();
      if (res.conflict) { checking = false; await render(tab, el); sayNow(C.conflict); return res; }
      const line = res.stale ? SAY('safety').stale : onOk(res);
      paint(tab, el, focus); sayNow(line);
      if (queued.length) later(queued.splice(0));
    } catch (e) { Life.lastError = String(e.message || e); say(C.fail); }
    checking = false;
    return res;
  }
  // 대사 고르기: 배열이면 무작위 하나(바로 앞 줄은 다시 안 고름), 글이면 그대로
  const lastPick = {};
  function pick(list, key) {
    if (!Array.isArray(list)) return list || '';
    if (list.length < 2) return list[0] || '';
    let c = list.filter((t) => t !== lastPick[key]); const t = c[Math.floor(Math.random() * c.length)];
    lastPick[key] = t; return t;
  }
  const habitKey = (h) => ((root.PH_LINES && root.PH_LINES.habitKeys) || {})[h];
  // 습관별 줄 (원고 키) 또는 *Any 줄
  function habitLine(group, name, any, habit, v) { const k = habitKey(habit), L = group || {}; return fill(pick(k && L[name] && L[name][k] ? L[name][k] : L[any], name + ':' + habit), v); }
  function weeklyLine(res, habit) {
    const L = SAY('weekly'), row = Life.data && Life.data.habits.rows.find((r) => r.name === habit), N = row ? (HC.countFor([], row, today()) || { n: 0 }).n : 0;
    if (!res.done) return fill(pick(L.undo, 'undo'), { habit });
    const per = row ? (HC.countFor([], row, today()) || {}).per : 'week'; // 2026-10-04: 이번 달 다 참 = month.full, 매일 1회 = 한 칸 줄(done)
    if (per === 'month' && res.value === N) return fill(pick(((root.PH_HABIT_EDIT_LINES || {}).month || {}).full, 'monthFull'), { name: habit });
    if (per === 'day') return habitLine(L, 'done', 'doneAny', habit, { habit });
    return res.value === N ? habitLine(L, 'full', 'fullAny', habit, { habit }) : habitLine(L, 'done', 'doneAny', habit, { habit });
  }
  function onWeekly(tab, el, habit, focus) {
    return check(tab, el, (lm) => root.PHDesktop.toggleWeekly(habit, lm), (res) => {
      Life.lastWrite = { kind: 'weekly', habit, done: res.done, count: res.value, date: res.date };
      return weeklyLine(res, habit);
    }, focus);
  }
  // 바깥(집 안 옷방 카펫 등)에서 부르는 E 체크: toggleWeekly(습관) -> { done, count, of, line(두부 한 줄), conflict } (말은 부른 쪽이 함)
  //   파일을 새로 읽고 뒤집음. 생활 습관 탭이 열려 있으면 다시 그림
  async function toggleWeekly(habit) {
    await load();
    const el = document.getElementById('life-habits'), open = el && !el.closest('.screen').hidden;
    if (!Life.data || !root.PHDesktop || !root.PHDesktop.toggleWeekly) return null;
    const res = await root.PHDesktop.toggleWeekly(habit, Life.lastModified);
    Life.data = Md.parse(res.text); Life.lastModified = res.lastModified; Life.readAt = Date.now();
    if (open) paint('habits', el);
    if (res.conflict) return { conflict: true, line: SAY('check').conflict };
    const row = Life.data.habits.rows.find((r) => r.name === habit);
    Life.lastWrite = { kind: 'weekly', habit, done: res.done, count: res.value, date: res.date };
    return { done: res.done, count: res.value, of: row ? (HC.countFor([], row, today()) || { n: 0 }).n : 0, line: weeklyLine(res, habit) };
  }
  // 매일 n회 칸 (2026-10-04): 오늘 value/n. 저장은 메인 ph:habitSetDaily. 대사 = PH_HABIT_EDIT_LINES.daily (비트 임시)
  function onDaily(tab, el, habit, value, prev, focus) {
    const D = (root.PH_HABIT_EDIT_LINES || {}).daily || {};
    return check(tab, el, (lm) => root.PHHabitDesktop.setDaily(habit, value, lm), (res) => {
      Life.lastWrite = { kind: 'daily', habit, value: res.value, of: res.of, prev: res.prev, date: res.date };
      const v = { name: habit, k: res.value, n: res.of };
      return fill(pick(res.value === res.of ? D.full : res.value > prev ? D.up : D.down, 'daily'), v);
    }, focus);
  }
  function onSafety(tab, el, week, item, result, focus) {
    const L = SAY('safety');
    return check(tab, el, (lm) => root.PHDesktop.setSafetyCheck(week, item, result, lm), (res) => {
      Life.lastWrite = { kind: 'safety', week: res.week, item, result, date: res.date };
      const items = Life.data.habits.rows.filter((r) => r.kind === LC.KIND.safety), got = LC.weekResults(LC.safetyRows(Life.data.lines.join('\n')), res.week);
      const all = items.every((r) => got[r.name]);
      // 놓쳤어 = 평가 없이 missed, 잠시 뒤 moved (그 항목이 2주 오늘 카드로). 다 고르면 마지막에 done
      if (result === 'missed') { queued.push(fill(pick(L.moved, 'moved'), { name: item })); if (all) queued.push(pick(L.done, 'done')); return pick(L.missed, 'missed'); }
      if (all) return pick(L.done, 'done');
      return pick(L.ok, 'ok');
    }, focus);
  }
  // 말풍선 차례로 (앞 줄이 사라질 즈음 다음 줄)
  let laterTimer = null;
  function later(list) { clearTimeout(laterTimer); const q = list.filter(Boolean); const step = () => { if (!q.length) return; laterTimer = setTimeout(() => { say(q.shift()); step(); }, S.BUBBLE_MS || 3200); }; step(); }
  // 양 적기: 숫자 확인 -> 오늘 이미 있으면 묻기, 없으면 바로 저장
  function onAmount(tab, el, row, raw) {
    const L = SAY('amount'), n = Number(String(raw).trim());
    if (!/^\d+$/.test(String(raw).trim()) || !Number.isInteger(n) || n < 1 || n > LC.MAX_AMOUNT) { sayNow(L.bad); const i = row.querySelector('.amt-in'); if (i) i.focus(); return null; }
    const prev = row.dataset.today === '' ? null : Number(row.dataset.today), habit = row.dataset.habit;
    if (prev != null) { Life.ui.ask = { habit, value: n, prev }; paint(tab, el, 'amt-add:' + habit); sayNow(fill(L.ask, { habit, prev: prev + row.dataset.unit })); return null; }
    return saveAmount(tab, el, habit, n, 'add');
  }
  function saveAmount(tab, el, habit, n, mode) {
    const L = SAY('amount');
    Life.ui.amount = null; Life.ui.ask = null;
    return check(tab, el, (lm) => root.PHDesktop.addAmount(habit, n, mode, lm), (res) => {
      const row = Life.data.habits.rows.find((r) => r.name === habit), unit = row ? LC.unitOf(row.target) : '';
      Life.lastWrite = { kind: 'amount', habit, value: res.value, prev: res.prev, mode, date: res.date };
      if (res.prev == null) return habitLine(L, 'saved', 'savedAny', habit, { habit, n: res.value, unit });
      return fill(mode === 'add' ? L.added : L.replaced, { habit, amount: res.value + unit });
    }, 'amt-open:' + habit);
  }
  // 입장 뒤 사이드바 두부 말 (js/main.js가 입장 연출 뒤 한 번 부름) -> [{ text, open: 누르면 안전장치 확인 칸 열기 }]
  //   1) 2주가 지나 안전장치로 돌아간 항목: safety.back (항목마다 한 번)
  //   2) 일요일 17시 이후 그 주 첫 입장 + 이번 주 확인이 안 끝났으면: safety.prompt (주마다 한 번)
  const NUDGE_KEY = 'pixel-house.safetyNudge', UP_KEY = 'pixel-house.safetyUp';
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 저장 못 해도 진행 */ } } };
  async function entryLines() {
    const out = [];
    if (!Life.data) await load();
    const d = Life.data; if (!d || !d.habits) return out;
    const L = SAY('safety'), t = today(), up = LC.promoted(d.habits.rows, LC.safetyRows(d.lines.join('\n')), t).map((p) => p.name);
    let before = []; try { before = JSON.parse(store.get(UP_KEY) || '[]'); } catch (e) { before = []; }
    const names = new Set(d.habits.rows.filter((r) => r.kind === LC.KIND.safety).map((r) => r.name));
    (Array.isArray(before) ? before : []).filter((n) => names.has(n) && !up.includes(n)).forEach((n) => out.push({ text: fill(L.back, { name: n }) }));
    store.set(UP_KEY, JSON.stringify(up));
    const n = new Date(Life.now()), week = Md.weekStart(t);
    if (n.getDay() === 0 && n.getHours() >= 17 && store.get(NUDGE_KEY) !== week && names.size && !safetyAllDone()) {
      store.set(NUDGE_KEY, week); out.push({ text: pick(L.prompt, 'prompt'), open: true });
    }
    return out;
  }

  // ---- 물 컵 누르기 ----
  //   k번째 컵: 지금 k잔이면 k-1 (되돌리기), 아니면 k. 화면은 바로 채우고, 저장은 메인(ph:setWater)
  //   파일이 앱이 읽은 뒤 바뀌었으면 메인이 안 쓰고 새 글을 줌 -> 다시 그리고 두부가 한 번 더 눌러 달라고 함
  let busy = false;
  function paintCups(row, v) { row.dataset.filled = v; row.querySelectorAll('.cup').forEach((c) => { const k = Number(c.dataset.k), on = k <= v; c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on)); }); }
  async function onCup(tab, el, row, k) {
    if (busy) return;
    const cur = Number(row.dataset.filled), next = k === cur ? k - 1 : k, n = Number(row.dataset.slots);
    busy = true; paintCups(row, next);
    const L = (root.PH_LINES && root.PH_LINES.ui && root.PH_LINES.ui.water) || {};
    try {
      const res = await root.PHDesktop.setWater(next, Life.lastModified);
      Life.data = Md.parse(res.text); Life.lastModified = res.lastModified; Life.readAt = Date.now();
      if (res.conflict) { busy = false; await render(tab, el); say(L.conflict); return; }
      const last = Md.latestSlots(Life.data.records, row.dataset.habit, Life.now(), S.DAY_START_HOUR);
      const note = row.querySelector('.slot-note'); if (note) note.textContent = slotNote(last);
      Life.lastWrite = { value: next, of: n, date: res.date, line: res.line, inserted: res.inserted };
      say(next === n ? L.full : next > cur ? L.up : next < cur ? L.down : null);
    } catch (e) {
      paintCups(row, cur); Life.lastError = String(e.message || e); say(L.fail);
    }
    busy = false;
  }
  function sayNow(text) { clearTimeout(laterTimer); say(text); } // 새 반응이면 기다리던 다음 줄(later)은 버림
  function say(text) { if (text && root.PHApp && root.PHApp.sideSay) root.PHApp.sideSay(text); }

  function drawDubu(c) {
    const Art = root.PHArt; if (!Art || !Art.has('dubu_sit')) return;
    const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(Art.frameCanvas('dubu_sit', 0), 0, 0);
  }

  Life.load = load; Life.render = render; Life.paint = paint; Life.today = today; Life.fill = fill; Life.entryLines = entryLines; Life.toggleWeekly = toggleWeekly; Life.NUDGE_KEY = NUDGE_KEY; Life.UP_KEY = UP_KEY; Life.drawDubu = drawDubu; Life.VIEWS = VIEWS; Life.bucketAsTab = bucketAsTab; Life.TAB = TAB;
  root.PHLife = Life;
})(window);
