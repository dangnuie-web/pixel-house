// 공부 간트 편집 (2026-10-03 비트 B, study 브랜치). 제작자 요청: "공부도 차트 이동하거나 추가 선택할 수 있게"
// 생활 습관 탭의 "공부" 카드를 편집 가능한 카드로 바꿔 끼운다 (life.js studyCard는 브라우저·읽기 전용일 때 그대로 남음).
//   고르기: 막대·이름 누르기 (테두리 강조) -> 카드 아래 정보(시작, 끝, 메모, 이번 주 한 날). Esc = 풀기
//   이동·늘이기: 막대 끌기 = 시작·끝 같이, 양끝 끌기 = 그 날짜만. 일 단위 snap. 진행 중(끝 빈칸) 막대 오른쪽 끝을 끌면 끝 날짜가 생김
//   키보드: 고른 막대 ←→ 하루씩 옮기기, Shift+←→ 끝만 (진행 중이면 오늘 기준으로 끝이 생김). 0.5초 멈추면 저장
//   ◀ ▶ = 한 주씩 넘기기, "이번 주" = 처음으로
//   + 공부 추가, 이름 바꾸기(지난 기록 "이름 n시간"도 같이, 되돌리기 한 번), 메모 고치기, 끝냄(끝 = 오늘), 진행 중으로(끝 비우기), 지우기(= ## 공부 보관으로, 되돌리기 가능)
//   (2026-10-08 제작자) "오늘 1시간 했어요"·"끝냄" 버튼 없앰. 막대 = 공부함(계획이자 기록), 끊겨도 됨:
//     과목 줄 = 기간 띠(얇게, 끌어서 시작·끝), 그 아래 단원 줄(과목 안 쪼개기, ## 공부 단원, js/study_parts.js) = 칸을 눌러 칠하기·지우기
//     쪼개지 않은 과목은 "전체" 한 줄. 과목 색 = 추가한 순서대로 6색 (무늬 기록기능디자인 v01 5절). 이름에 "복습"이면 사선 무늬
//   주 / 월 보기 (St.view): 주 = 월~일 7칸, 월 = 그달 날 수만큼. ◀ ▶ = 한 주·한 달씩
//   옛 "이름 n시간" 습관 기록 칸(g-done)은 과목 줄에 그대로 보임 (지난 기록)
//   (2026-10-08 3-1단계 제작자) 머리 버튼 = [추가 | 수정] -> 창(js/study_modal.js: 이름·시작일·끝일·메모·세부 계획). "진행 중으로"·"메모 고치기"·"쪼개기"·"이름 바꾸기" 버튼 없앰
//     칸 칠하기(공부함 체크) 없앰: 계획을 쓴 것 = 공부한 것. 과목 아래 줄 = 세부 계획 막대(읽기만, 고치기는 수정 창). 쪼개지 않은 과목은 아래 줄 없음
//     세부 계획은 과목 전체 기간 안에서만: 기간 띠를 끌어 세부 계획이 밖으로 나가면 메인이 막음(planOut) + 두부 안내
//   (2026-10-08 피드백 2 제작자) 세부 계획 막대도 끌기: 가운데 = 옮기기, 양끝 = 시작·끝. 상위 기간 밖이면 막음(planOut) + 두부 안내 (electron/study_ipc.js ph:planMove)
// 쓰기는 모두 메인(electron/study_ipc.js, window.PHStudyDesktop). 화면은 이름·값·읽은 시각만 보냄.
// 계산 함수(range, bar, dragResult, snapDays, weekDone)는 그림 없이 Node 시험(tests/test_study.js)에서도 씀
(function (root) {
  'use strict';
  // 을/를 (무늬 v01 공부 지우기 고르기 "OO를 어떻게 할까요?"). 한글이 아니면 받침 없음으로
  const objJosa = (w) => { const c = String(w).replace(/[\s)\]]+$/, '').slice(-1).charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? '을' : '를'; };
  const SW = root.PHStudyWrite || (typeof require !== 'undefined' ? require('./study_write.js') : null);
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const KEY_SAVE_MS = 500;

  // ---- 계산 (그림 없음) ----
  const ymdOf = (ms) => (ms == null ? null : SW.ymd(ms));
  function monday(s) { const [y, m, d] = s.split('-').map(Number), w = new Date(y, m - 1, d, 12).getDay(); return SW.addDays(s, -((w + 6) % 7)); }
  // 기간: 오늘이 든 주 월요일 + offset주부터 min주 (막대 끝이 더 뒤면 max주까지). life_md.ganttRange와 같은 규칙 (offset 0이면 같은 값)
  function range(rows, today, offset, min, max) {
    const start = SW.addDays(monday(today), (offset || 0) * 7);
    let weeks = min || 4;
    (rows || []).forEach((r) => { const s = ymdOf(r.startDay), e = ymdOf(r.endDay); if (s && e) { const need = Math.floor(SW.diffDays(start, e) / 7) + 1; if (need > weeks) weeks = need; } });
    weeks = Math.min(weeks, max || 12);
    const days = weeks * 7, ti = SW.diffDays(start, today);
    return { start, end: SW.addDays(start, days), last: SW.addDays(start, days - 1), days, weeks, today, todayIdx: ti >= 0 && ti < days ? ti : -1 };
  }
  // 막대 자리 { from, to(포함), clipStart, clipEnd, open } / 기간 밖 null / 날짜 못 읽음 { bad }
  function bar(row, R) {
    const s = ymdOf(row.startDay), e = ymdOf(row.endDay);
    if (!s) return { bad: true };
    if (!row.open && (!e || e < s)) return { bad: true };
    const a = SW.diffDays(R.start, s), b = row.open ? R.days - 1 : SW.diffDays(R.start, e);
    if (b < 0 || a >= R.days) return null;
    return { from: Math.max(0, a), to: Math.min(R.days - 1, b), clipStart: a < 0, clipEnd: !!row.open || b >= R.days, open: !!row.open };
  }
  // 끌기·키보드 결과: g = { start, end('' = 진행 중) }, mode = move | start | end, n = 움직인 날 수
  //   openEnd = 진행 중 막대의 끝을 처음 정할 때 기준 날짜 (끌기 = 보이는 마지막 날, 키보드 = 오늘)
  function dragResult(g, mode, n, openEnd) {
    let s = g.start, e = g.end || '';
    if (mode === 'move') { s = SW.addDays(s, n); if (e) e = SW.addDays(e, n); }
    else if (mode === 'start') { s = SW.addDays(s, n); if (e && s > e) s = e; }
    else if (mode === 'end') { e = SW.addDays(e || openEnd || s, n); if (e < s) e = s; }
    return { start: s, end: e };
  }
  // 보기별 기간 (2026-10-08): week = 오늘이 든 주 월요일 + offset주, 7일 / month = 오늘 달 + offset달, 그달 날 수
  function rangeView(view, today, offset) {
    let start, days;
    if (view === 'week') { start = SW.addDays(monday(today), (offset || 0) * 7); days = 7; }
    else { const [y, m] = today.split('-').map(Number), f = new Date(y, m - 1 + (offset || 0), 1, 12), n = new Date(f.getFullYear(), f.getMonth() + 1, 0, 12).getDate(); start = SW.ymd(f.getTime()); days = n; }
    const ti = SW.diffDays(start, today);
    return { view, start, end: SW.addDays(start, days), last: SW.addDays(start, days - 1), days, weeks: Math.ceil(days / 7), today, todayIdx: ti >= 0 && ti < days ? ti : -1 };
  }
  function snapDays(px, dayW) { const n = Math.round(px / dayW); return n || 0; }
  // 이번 주(월~일) 중 기록한 날만 [{ date, wd, hours }] (못 한 날은 보여 주지 않음)
  function weekDone(days, today) {
    const m = monday(today), out = [];
    for (let i = 0; i < 7; i++) { const d = SW.addDays(m, i); if (days[d] > 0) out.push({ date: d, wd: WD[(i + 1) % 7], hours: days[d] }); }
    return out;
  }
  const calc = { range, rangeView, bar, dragResult, snapDays, weekDone, monday };
  if (typeof document === 'undefined') { if (typeof module !== 'undefined' && module.exports) module.exports = calc; return; }

  // ---- 화면 ----
  const S = root.PH_SETTINGS, Md = root.PHLifeMd, Life = root.PHLife;
  const UI = Object.assign({}, root.PH_LINES && root.PH_LINES.ui, root.PH_LINES && root.PH_LINES.uiPlain);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const md = (s) => { if (!s) return ''; const [, m, d] = s.split('-').map(Number); return `${m}/${d}`; };
  const dayName = (s) => { const [y, m, d] = s.split('-').map(Number); return `${m}월 ${d}일 (${WD[new Date(y, m - 1, d, 12).getDay()]})`; };
  const D = () => root.PHStudyDesktop;
  const canWrite = () => !!(D() && D().update);
  const canMovePlan = () => !!(D() && D().movePlan); // 세부 계획 막대 끌기 (피드백 2)
  const HD = () => root.PHHabitDesktop, canRemove = () => !!(HD() && HD().removeStudy); // 완전 삭제 (electron/habit_ipc.js)
  const EP = () => root.PH_HABIT_EDIT_PLAIN || {};
  function sayEdit(key, name) { const L = ((root.PH_HABIT_EDIT_LINES || {}).study || {})[key]; if (!L || !L.length || !root.PHApp || !root.PHApp.sideSay) return; St.said = { key, text: L[Math.floor(Math.random() * L.length)].replace(/\{name\}/g, name || '') }; root.PHApp.sideSay(St.said.text); }
  const St = { view: null, sel: null, offset: 0, partForm: null, partErr: '', partUndo: null, form: null, err: '', busy: false, preview: {}, kb: null, kbTimer: null, drag: null, openArchive: false, el: null, lastLine: {}, now: () => Life.now() };
  const today = () => SW.logDay(St.now(), S.DAY_START_HOUR);

  function say(key, name) {
    const L = (root.PH_STUDY_LINES || {})[key]; if (!L || !L.length || !root.PHApp || !root.PHApp.sideSay) return;
    let i = Math.floor(Math.random() * L.length); if (L.length > 1 && i === St.lastLine[key]) i = (i + 1) % L.length; // 바로 앞 줄은 다시 안 고름
    St.lastLine[key] = i; St.said = { key, text: Life.fill(L[i], { name: name || '', plan: (root.PH_STUDY_PLAIN || {}).plan || '세부 계획' }) };
    root.PHApp.sideSay(St.said.text);
  }
  function dubuNote(text) { return `<div class="life-dubu"><canvas class="dubu-mini" width="16" height="20" aria-hidden="true"></canvas><p>${esc(text)}</p></div>`; }
  // 미리 보기(끌기·키보드 저장 전)를 덮은 줄
  function rowsOf(d) {
    return d.study.rows.map((r) => {
      const p = St.preview[r.name]; if (!p) return r;
      return Object.assign({}, r, { start: p.start, end: p.end, startDay: Md.dateOf(p.start), endDay: p.end ? Md.dateOf(p.end) : null, open: !p.end });
    });
  }
  const findRow = (d, name) => rowsOf(d).find((r) => r.name === name) || null;

  function card(d) {
    const st = d.study, rows = rowsOf(d), t = today(), G = S.GANTT_WEEKS || {};
    const view = St.view || S.STUDY_VIEW || 'month', R = rangeView(view, t, St.offset);
    St.R = R; St.view = view;
    const SP = root.PHStudyParts, PL = root.PHStudyPlan, src = (d.lines || []).join('\n'), SPL = root.PH_STUDY_PLAIN || {};
    let h = `<section class="card study st-edit" data-card="공부"><div class="st-head"><h3>공부 <small>${rows.length}</small></h3>
      <div class="st-tools"><span class="st-nav" role="group" aria-label="기간 넘기기"><span class="st-view" role="group" aria-label="보기">${['week', 'month'].map((v) => `<button type="button" class="st-v ${v === view ? 'on' : ''}" data-view="${v}" aria-pressed="${v === view}">${esc((SPL.view || {})[v] || (v === 'week' ? '주' : '월'))}</button>`).join('')}</span><button type="button" class="st-prev" aria-label="${view === 'week' ? '한 주' : '한 달'} 앞으로">◀</button><button type="button" class="st-now" ${St.offset ? '' : 'disabled'}>${esc((SPL.now || {})[view] || (view === 'week' ? '이번 주' : '이번 달'))}</button><button type="button" class="st-next" aria-label="${view === 'week' ? '한 주' : '한 달'} 뒤로">▶</button></span>
      <span class="st-am" role="group" aria-label="공부 추가·수정"><button type="button" class="st-add">${esc(SPL.add || '추가')}</button><button type="button" class="st-mod" ${rows.length ? '' : 'disabled'}>${esc(SPL.edit || '수정')}</button></span></div></div>`;
    if (st.target) h += `<p class="kind-desc">기준: <b>${esc(st.target)}</b></p>`;
    // 이름 바꾼 뒤 되돌리기 한 번 (지난 기록 "이름 n시간"도 원래대로, 2026-10-04)
    if (root.PHUndoBar) { // 되돌리기 띠: 5초 뒤·탭 옮기기 때 사라짐 (js/undo_bar.js)
      root.PHUndoBar.sync('studyRename', St.renamed, () => { St.renamed = null; root.PHUndoBar.removeEls('.st-undo-rename'); });
      root.PHUndoBar.sync('studyRemove', St.removed, () => { St.removed = null; root.PHUndoBar.removeEls('.st-undo:not(.st-undo-rename)'); });
    }
    if (St.renamed) h += `<div class="st-undo st-undo-rename" role="status"><span>${esc((EP().studyRenamedNote || '{old} → {name} 이름 바꿨어요').replace('{old}', St.renamed.old).replace('{name}', St.renamed.name))}</span><button type="button" class="st-unrename">${esc(EP().undo || '되돌리기')}</button></div>`;
    if (St.removed) h += `<div class="st-undo" role="status"><span>${esc((EP().studyRemovedNote || '{name} 완전히 지웠어요').replace('{name}', St.removed.row.name))}</span><button type="button" class="st-unremove">${esc(EP().undo || '되돌리기')}</button></div>`;
    if (St.err && !St.sel) h += `<p class="st-err" role="alert">${esc(St.err)}</p>`;
    if (!rows.length) return h + dubuNote((root.PH_STUDY_LINES || {}).empty || UI.studyEmpty) + archiveList(d) + '</section>';
    const pct = (i) => (i / R.days * 100).toFixed(3) + '%';
    // 칸 머리: 주 보기 = "월 6" 매일 (오늘 칸 빨강), 월 보기 = 월요일만 "10/6". 세로선 = 주 보기 매일 / 월 보기 주 경계
    let weeks = '', vlines = '';
    for (let i = 0; i < R.days; i++) {
      const dt = SW.addDays(R.start, i), wd = new Date(dt.slice(0, 4), Number(dt.slice(5, 7)) - 1, Number(dt.slice(8, 10)), 12).getDay();
      if (R.view === 'week') weeks += `<span class="${i === R.todayIdx ? 'today' : ''}" style="left:${pct(i)};width:${pct(1)}">${WD[wd]} ${Number(dt.slice(8, 10))}</span>`;
      else if (wd === 1) weeks += `<span style="left:${pct(i)}">${md(dt)}</span>`; // 월 보기 머리 = 월요일만 (1일 글 뺌, 무늬 캡처확인 v01 9번)
      if (i > 0 && (R.view === 'week' || wd === 1)) vlines += `<i class="g-vline" style="left:calc(var(--gl) + (100% - var(--gl)) * ${i / R.days})"></i>`;
    }
    const bad = [];
    h += `<div class="gantt v-${R.view}" data-view="${R.view}" data-days="${R.days}" data-weeks="${R.weeks}" data-start="${R.start}" style="--wk:${R.weeks}">${vlines}<div class="g-label"></div><div class="g-track g-weeks">${weeks}</div>`;
    const order = d.study.rows.map((x) => x.name);
    rows.forEach((r) => {
      const b = bar(r, R), col = SP ? SP.colorOf(Math.max(0, order.indexOf(r.name))) : { bg: '#8DB583', deep: '#5F8A5A' };
      if (b && b.bad) { bad.push(r); return; }
      const sel = r.name === St.sel ? ' sel' : '', nm = esc(r.name);
      const done = SW.loggedDays(d.records, r.name);
      let cells = '';
      Object.keys(done).forEach((k) => { const i = SW.diffDays(R.start, k); if (i >= 0 && i < R.days) cells += `<i class="g-done" style="left:${pct(i)};width:${pct(1)}" data-date="${k}" title="${md(k)} ${done[k]}시간"></i>`; });
      const label = `${r.start} ~ ${r.open ? '진행 중' : r.end}`;
      const barH = b ? `<i class="g-bar ${b.clipStart ? 'clip-s' : ''} ${b.clipEnd ? 'clip-e' : ''} ${b.open ? 'open' : ''}${sel}" data-name="${nm}" tabindex="0" role="button" aria-pressed="${!!sel}" aria-label="${nm}, ${esc(label)}. 눌러서 고르고, 왼쪽 오른쪽 화살표로 하루씩 옮겨요" style="left:${pct(b.from)};width:${pct(b.to - b.from + 1)}" title="${esc(label)}"><b class="g-h s" aria-hidden="true"></b><b class="g-h e" aria-hidden="true"></b></i>`
        : '<span class="g-out">기간 밖</span>';
      h += `<div class="g-label${sel}" data-line="${r.line}" data-name="${nm}" role="button" tabindex="${b ? -1 : 0}" style="--sc:${col.bg}"><b>${nm}</b><small>${md(r.start)} ~ ${r.open ? '진행 중' : md(r.end)}${r.memo ? ' · ' + esc(r.memo) : ''}</small></div><div class="g-track g-row" data-line="${r.line}" data-name="${nm}" style="--sc:${col.bg}">${barH}${cells}</div>`;
      // 세부 계획 줄 (막대 = 계획 기간). 쪼개지 않은 과목은 줄 없음 (2026-10-08 3-1단계)
      //   피드백 2 (제작자): 공부 막대처럼 끌어서 옮기기·양끝 늘리기/줄이기. 상위 공부 전체 기간 밖이면 막음 (planOut). 이름은 [수정] 창
      //   끊긴 옛 줄(칠하기 때 것)은 막대 아무거나 끌면 처음~끝이 한 막대로 (수정 창에서 기간을 바꿀 때와 같음)
      if (PL) PL.plansOf(src, r.name).forEach((p) => {
        let bars = '';
        const runs = SP.runs(p.days), mv = canMovePlan() && !p.bad && p.from && p.to;
        runs.forEach((run, k) => {
          const a = Math.max(0, SW.diffDays(R.start, run.from)), z = Math.min(R.days - 1, SW.diffDays(R.start, run.to)); if (z < 0 || a >= R.days) return;
          const hs = mv && k === 0 && run.from >= R.start ? '<b class="g-h s" aria-hidden="true"></b>' : '', he = mv && k === runs.length - 1 && run.to <= R.last ? '<b class="g-h e" aria-hidden="true"></b>' : '';
          bars += `<i class="g-pbar${p.review ? ' review' : ''}${mv ? ' mv' : ''}" style="left:${pct(a)};width:${pct(z - a + 1)}" data-name="${nm}" data-sig="${esc(p.sig)}" data-part="${esc(p.part)}" data-pfrom="${p.from}" data-pto="${p.to}" data-from="${run.from}" data-to="${run.to}" title="${esc(p.part)} ${md(run.from)} ~ ${md(run.to)}">${hs}${he}</i>`;
        });
        const pn = esc(p.part);
        h += `<div class="g-label g-plabel" data-name="${nm}" data-part="${pn}"><span><i class="g-dot" style="--sc:${col.bg}" aria-hidden="true"></i>${pn}</span></div>` +
          `<div class="g-track g-prow" data-name="${nm}" data-part="${pn}" style="--sc:${col.bg};--sd:${col.deep}" role="img" aria-label="${nm} ${esc(SPL.plan || '세부 계획')} ${pn}: ${esc(md(p.from))} ~ ${esc(md(p.to))}">${bars}</div>`;
      });
    });
    if (R.todayIdx >= 0) h += `<div class="g-today" style="left:calc(var(--gl) + (100% - var(--gl)) * ${(R.todayIdx + 0.5) / R.days})" title="오늘"></div>`;
    h += '</div>';
    if (bad.length) h += `<p class="fmt st-bad">${esc((UI.studyBadDate || '날짜를 읽지 못한 공부가 있어요: {names}. [수정]에서 시작일·끝일을 다시 골라 주세요').replace('{names}', bad.map((r) => r.name).join(', ')))}</p>`;
    h += `<div class="st-info" aria-live="polite">${info(d)}</div>`;
    return h + archiveList(d) + '</section>';
  }
  function info(d) {
    const r = St.sel && findRow(d, St.sel), SPL = root.PH_STUDY_PLAIN || {}, LB = SPL.plan || '세부 계획';
    if (!r) return `<p class="st-help">${esc(SPL.selHelp || '막대나 이름을 누르면 골라져요. 막대를 끌면 옮겨지고, 양끝을 끌면 시작·끝이 바뀌어요. 이름·기간·메모·세부 계획은 [수정]에서 고쳐요.')}</p>`;
    const t = today(), done = SW.loggedDays(d.records, r.name), wk = weekDone(done, t);
    const PL = root.PHStudyPlan, plans = PL ? PL.plansOf((d.lines || []).join('\n'), r.name) : [];
    const ok = SW.isDate(r.start);
    let h = `<div class="st-sel"><h4>${esc(r.name)}${r.open ? ` <span class="st-state">${esc(SPL.noEnd || '끝일 없음')}</span>` : ''}</h4><dl>
      <dt>시작</dt><dd class="st-v-start">${ok ? dayName(r.start) : esc(r.start)}</dd>
      <dt>끝</dt><dd class="st-v-end">${r.open ? esc(SPL.noEndLong || '끝일 없음 ([수정]에서 정해 주세요)') : dayName(r.end)}</dd>
      <dt>메모</dt><dd class="st-v-memo">${r.memo ? esc(r.memo) : '<span class="st-none">없음</span>'}</dd>
      ${wk.length ? `<dt>이번 주 지난 기록</dt><dd class="st-v-week">${wk.map((w) => `<span class="st-day">${w.wd} ${w.hours}시간</span>`).join(' ')}</dd>` : ''}
      <dt>${esc(LB)}</dt><dd class="st-v-parts">${plans.length ? plans.map((p) => `<span class="st-part" data-sig="${esc(p.sig)}"><b>${esc(p.part)}</b> <small>${md(p.from)} ~ ${md(p.to)}</small></span>`).join('') : `<span class="st-none">${esc(SPL.noPlans || '없음 (전체 기간이 한 막대)')}</span>`}</dd></dl>`;
    // 2026-10-04 제작자: 지우기 = "보관함으로 / 완전히 삭제" 고르기 (완전 삭제는 바로 되돌리기 한 번). 습관 편집 함수(PHHabitDesktop)가 없으면 전처럼 보관만
    h += `<div class="st-btns"><button type="button" class="st-edit-sel primary">${esc(SPL.edit || '수정')}</button>` + (canRemove() ? `<button type="button" class="st-remove" aria-expanded="${St.form === 'remove'}">${esc(EP().studyRemove || '지우기')}</button>` : '<button type="button" class="st-archive">지우기 (보관함으로)</button>') + '</div>';
    if (St.form === 'remove' && canRemove()) h += `<div class="st-rm" role="group" aria-label="${esc(r.name)} 지우기 고르기"><span class="st-rm-q"><b>${esc(r.name)}</b>${objJosa(r.name)} 어떻게 할까요?</span><button type="button" class="st-archive">${esc(EP().studyArchive || '보관함으로')}</button><button type="button" class="st-rm-del">${esc(EP().studyDelete || '완전히 삭제')}</button><button type="button" class="st-rm-cancel">그만두기</button></div>`;
    if (St.err) h += `<p class="st-err" role="alert">${esc(St.err)}</p>`;
    return h + '<p class="st-help">기간 띠: ←→ 하루씩 옮기기 · Shift+←→ 끝 날짜만 · Esc 고르기 풀기</p></div>';
  }
  function archiveList(d) {
    const a = SW.parse(d.lines).archive; if (!a.length) return '';
    return `<details class="st-arch" ${St.openArchive ? 'open' : ''}><summary>보관함 <small>${a.length}</small></summary><ul>` +
      a.map((x) => `<li data-name="${esc(x.name)}"><b>${esc(x.name)}</b><span>${esc(x.start)} ~ ${esc(x.end || '진행 중')}${x.memo ? ' · ' + esc(x.memo) : ''}</span><small>보관 ${esc(x.archived)}</small><button type="button" class="st-restore" data-name="${esc(x.name)}">되돌리기</button></li>`).join('') + '</ul></details>';
  }

  // ---- 그리기·연결 ----
  function paint(focusSel) {
    const el = St.el; if (!el || !Life.data || !Life.data.study) return;
    const old = el.querySelector('[data-card="공부"]'); if (!old) return;
    const wasFocus = focusSel || (document.activeElement && old.contains(document.activeElement) && document.activeElement.matches('.g-bar, .g-label'));
    const box = document.createElement('div'); box.innerHTML = card(Life.data);
    const neu = box.firstElementChild; old.replaceWith(neu);
    neu.querySelectorAll('canvas.dubu-mini').forEach((c) => Life.drawDubu(c));
    bind(neu);
    if (wasFocus && St.sel) { const b = selBar(neu); if (b) b.focus({ preventScroll: true }); }
    const f = neu.querySelector('.st-form input'); if (f && St.focusForm) { f.focus(); St.focusForm = false; if (f.type !== 'date') f.setSelectionRange(f.value.length, f.value.length); }
  }
  const cssName = (n) => (root.CSS && CSS.escape ? CSS.escape(n) : n.replace(/["\\]/g, '\\$&'));
  function selBar(c) { return St.sel ? (c.querySelector(`.g-bar[data-name="${cssName(St.sel)}"]`) || c.querySelector(`.g-label[data-name="${cssName(St.sel)}"]`)) : null; }
  // 고르기: 그리지 않고 표시만 바꿈 (끌기 중 요소가 바뀌지 않게) + 정보 칸만 다시
  function select(name) {
    const c = St.el && St.el.querySelector('[data-card="공부"]'); if (!c) return;
    if (St.sel !== name) { St.form = St.form === 'add' ? 'add' : null; St.err = ''; }
    St.sel = name;
    c.querySelectorAll('.g-bar, .g-label').forEach((e) => { const on = e.dataset.name === name; e.classList.toggle('sel', on); if (e.classList.contains('g-bar')) e.setAttribute('aria-pressed', String(on)); });
    const box = c.querySelector('.st-info'); if (box) { box.innerHTML = info(Life.data); bindInfo(c); }
  }
  function unselect() { St.sel = null; St.form = St.form === 'add' ? 'add' : null; St.err = ''; flushKb(); paint(); }

  function bind(c) {
    c.querySelector('.st-prev').addEventListener('click', () => { St.offset--; paint(); });
    c.querySelector('.st-next').addEventListener('click', () => { St.offset++; paint(); });
    c.querySelector('.st-now').addEventListener('click', () => { St.offset = 0; paint(); });
    c.querySelector('.st-add').addEventListener('click', () => { St.err = ''; if (root.PHStudyModal) root.PHStudyModal.open('add'); });
    c.querySelector('.st-mod').addEventListener('click', () => { St.err = ''; if (root.PHStudyModal) root.PHStudyModal.open('edit', St.sel); });
    c.querySelectorAll('.st-v').forEach((b) => b.addEventListener('click', () => { if (St.view === b.dataset.view) return; St.view = b.dataset.view; St.offset = 0; paint(); }));
    c.querySelectorAll('.g-plabel, .g-prow').forEach((l) => l.addEventListener('click', () => select(l.dataset.name))); // 세부 계획 줄 누르기 = 그 공부 고르기 (칠하기 없음)
    c.querySelectorAll('.g-label[data-name]').forEach((l) => {
      l.addEventListener('click', () => select(l.dataset.name));
      l.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(l.dataset.name); } });
    });
    c.querySelectorAll('.g-row').forEach((tr) => tr.addEventListener('pointerdown', (e) => { if (!e.target.closest('.g-bar')) select(tr.dataset.name); }));
    c.querySelectorAll('.g-pbar.mv').forEach((b) => b.addEventListener('pointerdown', (e) => pdragStart(e, b)));
    c.querySelectorAll('.g-bar').forEach((b) => {
      b.addEventListener('pointerdown', (e) => dragStart(e, b));
      b.addEventListener('focus', () => { if (St.sel !== b.dataset.name) select(b.dataset.name); });
    });
    const arch = c.querySelector('.st-arch'); if (arch) arch.addEventListener('toggle', () => { St.openArchive = arch.open; });
    c.querySelectorAll('.st-restore').forEach((b) => b.addEventListener('click', () => write('restore', b.dataset.name)));
    const un = c.querySelector('.st-unremove'); if (un) un.addEventListener('click', () => St.removed && write('unremove', St.removed.row.name));
    const ur = c.querySelector('.st-unrename'); if (ur) ur.addEventListener('click', () => St.renamed && write('update', St.renamed.name, { newName: St.renamed.old }, 'renameUndo'));
    bindInfo(c);
  }
  function bindInfo(c) {
    const box = c.querySelector('.st-info'); if (!box) return;
    const on = (cls, fn) => { const b = box.querySelector(cls); if (b) b.addEventListener('click', fn); };
    on('.st-edit-sel', () => { St.err = ''; if (root.PHStudyModal) root.PHStudyModal.open('edit', St.sel); });
    on('.st-archive', () => write('archive', St.sel));
    on('.st-remove', () => { const opening = St.form !== 'remove'; St.form = opening ? 'remove' : null; St.err = ''; paint(); const b = St.el && St.el.querySelector(opening ? '.st-rm .st-archive' : '.st-remove'); if (b) b.focus(); if (opening) sayEdit('askRemove'); });
    on('.st-rm-del', () => write('remove', St.sel));
    on('.st-rm-cancel', () => { St.form = null; paint(); const b = St.el && St.el.querySelector('.st-remove'); if (b) b.focus(); });
    bindForm(c, box.querySelector('.st-form'));
  }
  function bindForm(c, f) {
    if (!f) return;
    const submit = () => {
      St.err = '';
      try {
        if (f.dataset.form === 'add') {
          const name = SW.checkName(f.querySelector('.st-in-name').value), start = f.querySelector('.st-in-start').value || today();
          if (!SW.isDate(start)) throw new Error('시작 날짜를 골라 주세요');
          write('add', name, { start });
        } else if (f.dataset.form === 'part') writePart('add', { subject: St.sel, part: root.PHStudyParts.checkPart(f.querySelector('.st-in-part').value) });
        else if (f.dataset.form === 'partRename') writePart('rename', { sig: St.partSig, part: root.PHStudyParts.checkPart(f.querySelector('.st-in-part').value) });
        else if (f.dataset.form === 'rename') write('update', St.sel, { newName: SW.checkName(f.querySelector('.st-in-text').value) }, 'renamed');
        else write('update', St.sel, { memo: SW.checkMemo(f.querySelector('.st-in-text').value) });
      } catch (e) { St.err = e.message; St.focusForm = true; paint(); }
    };
    f.querySelector('.st-ok').addEventListener('click', submit);
    f.querySelector('.st-cancel').addEventListener('click', () => { St.form = null; St.err = ''; paint(); });
    f.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return; // 한글 조합 중 Enter는 글자 확정만
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); St.form = null; St.err = ''; paint(true); }
      e.stopPropagation(); // 입력창 안의 ←→는 글자 커서
    });
  }

  // ---- 끌기 ----
  function dragStart(e, b) {
    if (e.button !== 0 || St.busy) return;
    e.preventDefault();
    flushKb();
    const name = b.dataset.name, r = findRow(Life.data, name); if (!r || !SW.isDate(r.start)) return;
    const track = b.parentElement, w = track.getBoundingClientRect().width;
    const mode = e.target.closest('.g-h.s') ? 'start' : e.target.closest('.g-h.e') ? 'end' : 'move';
    St.drag = { name, mode, x0: e.clientX, dayW: w / St.R.days, orig: { start: r.start, end: r.open ? '' : r.end }, cur: null, moved: false, b, id: e.pointerId };
    select(name);
    b.focus({ preventScroll: true });
    try { b.setPointerCapture(e.pointerId); } catch (x) {}
    b.classList.add('dragging');
    b.addEventListener('pointermove', dragMove);
    b.addEventListener('pointerup', dragEnd);
    b.addEventListener('pointercancel', dragEnd);
  }
  function dragMove(e) {
    const g = St.drag; if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0; if (Math.abs(dx) > 3) g.moved = true;
    const n = snapDays(dx, g.dayW);
    g.cur = dragResult(g.orig, g.mode, n, St.R.last);
    // 막대 모양만 바로 바꿈 (일 단위)
    const row = Object.assign({}, findRow(Life.data, g.name), { start: g.cur.start, end: g.cur.end, startDay: Md.dateOf(g.cur.start), endDay: g.cur.end ? Md.dateOf(g.cur.end) : null, open: !g.cur.end });
    const bb = bar(row, St.R), pct = (i) => (i / St.R.days * 100).toFixed(3) + '%';
    if (bb && !bb.bad) { g.b.style.left = pct(bb.from); g.b.style.width = pct(bb.to - bb.from + 1); g.b.classList.toggle('open', bb.open); g.b.classList.toggle('clip-s', bb.clipStart); g.b.classList.toggle('clip-e', bb.clipEnd); }
    g.b.title = `${g.cur.start} ~ ${g.cur.end || '진행 중'}`;
    const lab = St.el.querySelector(`.g-label[data-name="${cssName(g.name)}"] small`); if (lab) lab.textContent = `${md(g.cur.start)} ~ ${g.cur.end ? md(g.cur.end) : '진행 중'}`;
  }
  function dragEnd(e) {
    const g = St.drag; if (!g || e.pointerId !== g.id) return;
    St.drag = null;
    g.b.removeEventListener('pointermove', dragMove); g.b.removeEventListener('pointerup', dragEnd); g.b.removeEventListener('pointercancel', dragEnd);
    g.b.classList.remove('dragging');
    if (e.type === 'pointercancel' || !g.moved || !g.cur || (g.cur.start === g.orig.start && g.cur.end === g.orig.end)) { paint(true); return; } // 누르기만 = 고르기
    St.preview[g.name] = g.cur; paint(true);
    write('update', g.name, { start: g.cur.start, end: g.cur.end }, 'moved');
  }

  // ---- 세부 계획 막대 끌기 (2026-10-08 3-1단계 피드백 2) ----
  //   공부 막대와 같은 손놀림: 가운데 = 옮기기, 양끝 = 시작·끝만. 일 단위. 상위 공부 기간 밖이면 막대가 빨갛게 보이고 놓으면 저장 안 함 + 두부 planOut
  const planBox = (name) => { const r = findRow(Life.data, name); return r && SW.isDate(r.start) ? { start: r.start, end: r.open || !SW.isDate(r.end) ? '' : r.end } : null; };
  const planIn = (box, cur) => !!box && cur.start >= box.start && (!box.end || cur.end <= box.end);
  function pdragStart(e, b) {
    if (e.button !== 0 || St.busy) return;
    e.preventDefault(); e.stopPropagation();
    flushKb();
    const name = b.dataset.name, track = b.parentElement, w = track.getBoundingClientRect().width;
    const mode = e.target.closest('.g-h.s') ? 'start' : e.target.closest('.g-h.e') ? 'end' : 'move';
    St.pdrag = { name, sig: b.dataset.sig, part: b.dataset.part, mode, x0: e.clientX, dayW: w / St.R.days, orig: { start: b.dataset.pfrom, end: b.dataset.pto }, cur: null, moved: false, b, track, id: e.pointerId };
    select(name);
    try { b.setPointerCapture(e.pointerId); } catch (x) {}
    b.classList.add('dragging');
    b.addEventListener('pointermove', pdragMove);
    b.addEventListener('pointerup', pdragEnd);
    b.addEventListener('pointercancel', pdragEnd);
  }
  function pdragMove(e) {
    const g = St.pdrag; if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0; if (Math.abs(dx) > 3) g.moved = true;
    if (!g.moved) return;
    g.cur = dragResult(g.orig, g.mode, snapDays(dx, g.dayW), g.orig.end);
    // 끊긴 옛 줄: 끄는 동안 한 막대로 (다른 조각은 숨김)
    g.track.querySelectorAll('.g-pbar').forEach((x) => { if (x !== g.b && x.dataset.sig === g.sig) x.hidden = true; });
    const R = St.R, a = SW.diffDays(R.start, g.cur.start), z = SW.diffDays(R.start, g.cur.end), pct = (i) => (i / R.days * 100).toFixed(3) + '%';
    const from = Math.max(0, a), to = Math.min(R.days - 1, z);
    g.b.hidden = to < 0 || from >= R.days;
    if (!g.b.hidden) { g.b.style.left = pct(from); g.b.style.width = pct(to - from + 1); }
    g.out = !planIn(planBox(g.name), g.cur);
    g.b.classList.toggle('out', g.out);
    g.b.title = `${g.part} ${md(g.cur.start)} ~ ${md(g.cur.end)}`;
  }
  function pdragEnd(e) {
    const g = St.pdrag; if (!g || e.pointerId !== g.id) return;
    St.pdrag = null;
    g.b.removeEventListener('pointermove', pdragMove); g.b.removeEventListener('pointerup', pdragEnd); g.b.removeEventListener('pointercancel', pdragEnd);
    g.b.classList.remove('dragging');
    if (e.type === 'pointercancel' || !g.moved || !g.cur || (g.cur.start === g.orig.start && g.cur.end === g.orig.end)) { paint(true); return null; } // 누르기만 = 고르기
    const box = planBox(g.name);
    if (!planIn(box, g.cur)) { // 막음: 저장 안 함 (메인도 한 번 더 막음)
      St.last = { op: 'plan:move', name: g.name, res: { ok: false, code: 'planOut' } };
      St.err = planOutText(g.part, box); paint(true); say('planOut'); return null;
    }
    return writePlanMove(g.name, g.sig, g.part, g.cur);
  }
  function planOutText(part, box) {
    const SPL = root.PH_STUDY_PLAIN || {}, E = SPL.err || {}, LB = SPL.plan || '세부 계획';
    return Life.fill(E.planOut || '{plan|은} 전체 기간({start} ~ {end}) 안에서만 정할 수 있어요: {names}', { plan: LB, start: box ? md(box.start) : '', end: box && box.end ? md(box.end) : '…', names: part });
  }
  async function writePlanMove(name, sig, part, cur) {
    if (St.busy || !canMovePlan()) return null;
    St.busy = true; St.err = '';
    let res = null;
    try {
      res = await D().movePlan(sig, cur.start, cur.end, Life.lastModified);
      Life.data = Md.parse(res.text); Life.lastModified = res.lastModified; Life.readAt = Date.now();
      St.last = { op: 'plan:move', name, res: { ok: res.ok, unchanged: !!res.unchanged, code: res.code || null, conflict: !!res.conflict } };
      if (res.conflict) { St.busy = false; if (St.sel && !findRow(Life.data, St.sel)) St.sel = null; paint(); say('conflict'); return res; }
      if (res.code) { St.busy = false; St.err = res.code === 'planOut' ? planOutText(part, planBox(name)) : (((root.PH_STUDY_PLAIN || {}).err || {}).fail || '저장하지 못했어요.'); paint(true); say(res.code === 'planOut' ? 'planOut' : 'fail'); return res; }
    } catch (e) { St.err = errText(e); Life.lastError = St.err; St.last = { op: 'plan:move', name, error: St.err }; say('fail'); }
    St.busy = false;
    paint(true);
    return res;
  }

  // ---- 키보드 ----
  function onKey(e) {
    if (!St.el || !St.el.offsetParent || !St.sel || St.busy) return;
    const a = document.activeElement;
    if (a && (a.closest('#tabs') || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
    if (e.key === 'Escape') { e.preventDefault(); if (St.form && St.form !== 'add') { St.form = null; St.err = ''; paint(true); } else unselect(); return; }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' || e.altKey || e.metaKey || e.ctrlKey) return;
    const r = findRow(Life.data, St.sel); if (!r || !SW.isDate(r.start)) return;
    e.preventDefault();
    const n = e.key === 'ArrowRight' ? 1 : -1;
    if (!St.kb || St.kb.name !== St.sel) St.kb = { name: St.sel, orig: { start: r.start, end: r.open ? '' : r.end } };
    const cur = St.preview[St.sel] || St.kb.orig;
    const next = dragResult(cur, e.shiftKey ? 'end' : 'move', n, today());
    St.preview[St.sel] = next;
    paint(true);
    clearTimeout(St.kbTimer); St.kbTimer = setTimeout(flushKb, KEY_SAVE_MS);
  }
  function flushKb() {
    clearTimeout(St.kbTimer); St.kbTimer = null;
    const k = St.kb; St.kb = null; if (!k) return null;
    const p = St.preview[k.name]; if (!p) return null;
    if (p.start === k.orig.start && p.end === k.orig.end) { delete St.preview[k.name]; paint(); return null; }
    return write('update', k.name, { start: p.start, end: p.end }, 'moved');
  }

  // ---- 저장 (메인) ----
  //   op: add(name, {start}) / update(name, patch, sayKey) / archive(name) / restore(name) / log(name, ±1)
  const errText = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  async function write(op, name, arg, sayKey) {
    if (St.busy || !canWrite() || !name) return null;
    St.busy = true; St.err = '';
    const lm = Life.lastModified, P = D();
    let res = null;
    try {
      if (op === 'add') res = await P.add(name, arg.start, '', lm);
      else if (op === 'update') res = await P.update(name, arg, lm);
      else if (op === 'archive') res = await P.archive(name, lm);
      else if (op === 'restore') res = await P.restore(name, lm);
      else if (op === 'log') res = await P.logToday(name, arg, lm);
      else if (op === 'remove') res = await HD().removeStudy(name, lm);
      else if (op === 'unremove') { const u = St.removed; res = await HD().unremoveStudy(u.row, u.before, u.raw, lm); }
      Life.data = Md.parse(res.text); Life.lastModified = res.lastModified; Life.readAt = Date.now();
      St.preview = {};
      if (res.conflict) { St.busy = false; St.form = null; if (St.sel && !findRow(Life.data, St.sel)) St.sel = null; paint(); say('conflict'); return res; }
      St.last = { op, name, res: { ok: res.ok, unchanged: !!res.unchanged, hours: res.hours, date: res.date, code: res.code || null } };
      if (res.code) {
        St.err = res.message || res.code; St.busy = false; St.focusForm = !!St.form;
        const u = res.code === 'usedName' && root.PH_HABIT_EDIT_USED ? root.PH_HABIT_EDIT_USED(res.usedName || name, res.lastDate, 'study') : null; // 이유 + 마지막 기록 날 (2026-10-04)
        if (u) { St.err = u.note; St.lastUsed = { name: res.usedName, lastDate: res.lastDate || null }; }
        if (res.code === 'planOut') St.err = ((root.PH_STUDY_PLAIN || {}).err || {}).planOutMove ? root.PHLife.fill(root.PH_STUDY_PLAIN.err.planOutMove, { plan: (root.PH_STUDY_PLAIN || {}).plan || '세부 계획', names: (res.plans || []).join(', ') }) : St.err;
        paint(true); if (u) { if (root.PHApp && root.PHApp.sideSay) { St.said = { key: 'usedName', text: u.say }; root.PHApp.sideSay(u.say); } } else say(res.code === 'planOut' ? 'planOut' : 'fail'); return res;
      } // 값 문제 (완전 삭제·되돌리기·옛 기록 이름): 안 씀
      if (op !== 'remove') St.removed = null; // 되돌리기는 바로 다음 한 번만
      St.renamed = null;
      if (op === 'add') { St.form = null; St.sel = res.name || name; say('added', St.sel); }
      else if (op === 'update') {
        if (arg.newName) St.sel = res.name || arg.newName; St.form = null;
        if (sayKey === 'finished') say('finished', St.sel);
        else if (sayKey === 'renamed' && !res.unchanged && res.oldName && res.oldName !== res.name) { St.renamed = { old: res.oldName, name: res.name }; sayEdit('renamed', res.name); }
        else if (sayKey === 'renameUndo' && !res.unchanged) sayEdit('renameUndo', res.name);
      }
      else if (op === 'archive') { St.sel = null; St.form = null; St.openArchive = true; say('archived', name); }
      else if (op === 'remove') { St.sel = null; St.form = null; St.removed = { row: res.removed, before: res.before, raw: res.removedText }; sayEdit('removed', name); }
      else if (op === 'unremove') { St.sel = name; sayEdit('unremoved', name); }
      else if (op === 'restore') { St.sel = name; say('restored', name); }
      else if (op === 'log' && arg > 0 && !res.unchanged) say('logged', name);
    } catch (e) {
      St.preview = {}; St.err = errText(e); Life.lastError = St.err; St.last = { op, name, error: St.err };
      if (!St.form) say('fail');
    }
    St.busy = false;
    St.focusForm = !!St.form;
    paint(true);
    return res;
  }

  // ---- 단원 쓰기 (2026-10-08, electron/record_ipc.js ph:part*) ----
  const PD = () => root.PHStudyPartDesktop;
  function canPaint() { return !!(PD() && PD().toggle && root.PHStudyParts); }
  function sayPart(key, v) {
    const L = (root.PH_STUDY_LINES || {})[key]; if (!L || !L.length || !root.PHApp || !root.PHApp.sideSay) return;
    let i = Math.floor(Math.random() * L.length); if (L.length > 1 && i === St.lastLine[key]) i = (i + 1) % L.length; St.lastLine[key] = i;
    St.said = { key, text: L[i].replace(/\{name\}/g, (v && v.name) || '').replace(/\{part\}/g, (v && v.part) || '') };
    root.PHApp.sideSay(St.said.text);
  }
  async function writePart(op, a) {
    if (St.busy || !canPaint()) return null;
    St.busy = true; St.err = '';
    const lm = Life.lastModified, P = PD(); let res = null;
    try {
      if (op === 'toggle') res = await P.toggle(a.subject, a.part, a.date, lm);
      else if (op === 'add') res = await P.add(a.subject, a.part, lm);
      else if (op === 'rename') res = await P.rename(a.sig, a.part, lm);
      else if (op === 'remove') res = await P.remove(a.sig, lm);
      else if (op === 'unremove') res = await P.add(null, null, lm, a.next, a.raw);
      Life.data = Md.parse(res.text); Life.lastModified = res.lastModified; Life.readAt = Date.now();
      St.last = { op: 'part:' + op, res: { ok: res.ok, on: res.on, date: res.date, code: res.code || null } };
      if (res.conflict) { St.busy = false; St.form = null; paint(); say('conflict'); return res; }
      if (res.code) { St.busy = false; St.err = res.code === 'dupPart' ? '같은 이름의 단원이 있어요.' : '단원 이름은 20자까지, | , 없이 적어 주세요.'; St.focusForm = true; paint(true); say('fail'); return res; }
      if (op === 'toggle') { if (!res.unchanged) sayPart(res.on ? 'barAdded' : 'barRemoved', { name: a.subject }); St.partUndo = null; }
      else if (op === 'add') { St.form = null; St.partUndo = null; sayPart('partAdded', { name: a.subject, part: a.part }); }
      else if (op === 'rename') { St.form = null; sayPart('partRenamed', { part: a.part }); }
      else if (op === 'remove') { const pp = (res.before || '').split('|'); St.partUndo = { raw: res.before, next: res.next, part: (pp[2] || '').trim() }; sayPart('partRemoved', { part: St.partUndo.part }); }
      else if (op === 'unremove') { sayPart('partUndo', { part: a.part }); St.partUndo = null; }
    } catch (e) { St.err = errText(e); Life.lastError = St.err; St.last = { op: 'part:' + op, error: St.err }; say('fail'); }
    St.busy = false; St.focusForm = !!St.form;
    paint(true);
    return res;
  }

  // life.js가 탭을 그린 뒤 부름 (Life.renderHooks). 생활 습관 탭 + 데스크톱 앱 + ## 공부 섹션이 있을 때만 바꿔 끼움
  function mount(tab, el, d) {
    if (tab !== 'habits' || !d || !d.study || !canWrite()) return;
    St.el = el; St.preview = {}; St.kb = null; clearTimeout(St.kbTimer);
    if (St.sel && !d.study.rows.some((r) => r.name === St.sel)) St.sel = null;
    paint();
    const M = root.PHStudyModal; if (M && M.on && M.host && !el.contains(M.host)) { el.appendChild(M.host); M.paint(); } // 탭을 다시 그려도 [추가|수정] 창은 그대로
    const ro = el.querySelector('.life-src .ro'); if (ro && !/공부/.test(ro.textContent)) ro.textContent = / · 나머지 읽기 전용/.test(ro.textContent) ? ro.textContent.replace(' · 나머지 읽기 전용', ' · 공부 편집 · 나머지 읽기 전용') : ro.textContent + ' · 공부 편집'; // main 합칠 때: 머리 글이 "눌러서 체크 · 오늘 줄에 적혀요"로 바뀜
  }
  Life.renderHooks = Life.renderHooks || [];
  Life.renderHooks.push(mount);
  document.addEventListener('keydown', onKey);
  root.PHStudyGantt = Object.assign({ St, mount, paint, select, unselect, write, writePart, writePlanMove, flushKb, today, canPaint }, calc);
})(typeof window !== 'undefined' ? window : globalThis);
