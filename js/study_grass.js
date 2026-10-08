// 생활일지 > 공부 탭: 달마다 잔디 (2026-10-08 비트, 로드맵 3단계 -> 3-1단계 제작자 피드백으로 달별로 바꿈). 무늬 기록기능디자인 v01 5-3 칸 모양 그대로
//   위: 연월 고르기 [◀ 2026년 10월 ▼ ▶] (이전 달 보기). 그 아래 알약 = 그 달에 걸친 공부만 (기간이 그 달과 겹치거나 그 달에 잔디 날이 있음)
//   판 = 세로 7칸(월~일, 위가 월) x 가로 = 그 달이 걸친 주. 그 달 날만 칸, 오늘 뒤 칸은 그리지 않음. 칸 12px, 사이 3px, 모서리 2px
//   단계 = 그날 계획 막대 수 (0 / 1 / 2 / 3 이상). 3-1단계: 공부함 체크(칠하기) 없음 -> 계획을 쓴 것 = 공부한 것
//     세부 계획이 있으면 그 날들, 없으면 공부 전체 기간 (js/study_plan.js dayMap). 옛 "이름 n시간" 기록 날·옛 칠한 날도 그대로 셈
//   색 = 그 과목 색 한 가지 (study_parts COLORS), 1단 = 과목 바탕색 60%. 오늘 칸 = 안쪽 먹선 2px. 빈 칸은 모두 0단 색 (못 한 날 표시 없음)
//   위 요약 = 과목 이름 + "10월 n일". 범례 = "계획 0 · 1 · 2 · 3+". 읽기만
(function (root) {
  'use strict';
  const SP = root.PHStudyParts, SW = root.PHStudyWrite, SPL = root.PHStudyPlan, Life = root.PHLife, S = root.PH_SETTINGS;
  if (!SP || !SW || !SPL || !Life) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WD = ['월', '화', '수', '목', '금', '토', '일'];
  const PL = () => root.PH_STUDY_PLAIN || {};
  const G = { subject: null, ym: null, said: null };
  const today = () => SW.logDay(Life.now(), S.DAY_START_HOUR);
  const ymOf = (s) => s.slice(0, 7);
  function addMonth(ym, n) { const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1, 12); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
  const ymLabel = (ym) => `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월`;
  function mix(hex, w, t) { // hex 색을 흰색(#FBFAF6)과 섞기 (t = 원색 비율)
    const a = parseInt(hex.slice(1), 16), b = parseInt(w.slice(1), 16), c = (s) => Math.round(((a >> s) & 255) * t + ((b >> s) & 255) * (1 - t));
    return '#' + [16, 8, 0].map((s) => c(s).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function levels(col) { return ['#EFE6D3', mix(col.bg, '#FBFAF6', 0.6), col.bg, col.deep]; }
  const src = (d) => (d.lines || []).join('\n');
  // 고를 수 있는 달: 가장 이른 공부 시작(또는 잔디 날) 달 ~ 이번 달 (최근 것 먼저)
  function months(d, t) {
    const rows = (d.study && d.study.rows) || [], s = src(d);
    let first = ymOf(t);
    rows.forEach((r) => { if (SW.isDate(r.start) && ymOf(r.start) < first) first = ymOf(r.start); Object.keys(SPL.dayMap(s, r, d.records, t)).forEach((k) => { if (ymOf(k) < first) first = ymOf(k); }); });
    const out = []; for (let m = ymOf(t), i = 0; m >= first && i < 120; m = addMonth(m, -1), i++) out.push(m);
    return out;
  }
  // 계산 (화면 없이도): 그 달 판 -> { cells: [{ date, col, row, n, lv, today, parts }], weeks, monthDays }
  function grid(d, name, t, ym) {
    const row = d.study.rows.find((r) => r.name === name); if (!row) return null;
    ym = ym || ymOf(t);
    const m = SPL.dayMap(src(d), row, d.records, t);
    const first = ym + '-01', last = SW.addDays(addMonth(ym, 1) + '-01', -1);
    const mon = (s) => { const [y, mo, da] = s.split('-').map(Number), w = new Date(y, mo - 1, da, 12).getDay(); return SW.addDays(s, -((w + 6) % 7)); };
    const start = mon(first), weeks = Math.floor(SW.diffDays(start, mon(last)) / 7) + 1, cells = [];
    for (let c = 0; c < weeks; c++) for (let r = 0; r < 7; r++) {
      const date = SW.addDays(start, c * 7 + r); if (date < first || date > last || date > t) continue;
      const parts = m[date] || [], n = parts.length;
      cells.push({ date, col: c, row: r, n, lv: SP.level(n), today: date === t, parts });
    }
    const monthDays = Object.keys(m).filter((k) => ymOf(k) === ym && k <= t).length;
    return { cells, weeks, monthDays, row, ym };
  }
  function html(d) {
    const rows = (d.study && d.study.rows) || [], P = PL(), SL = root.PH_STUDY_LINES || {}, t = today();
    if (!rows.length) return `<div class="life-dubu"><canvas class="dubu-mini" width="16" height="20" aria-hidden="true"></canvas><p>${esc((root.PH_LINES.ui || {}).studyEmpty || '')}</p></div>`;
    const ms = months(d, t);
    if (!G.ym || !ms.includes(G.ym)) G.ym = ms[0];
    const s = src(d), here = rows.filter((r) => SPL.inMonth(s, r, d.records, G.ym, t)), order = rows.map((r) => r.name);
    let h = `<div class="grass" data-ym="${G.ym}"><div class="gr-month" role="group" aria-label="${esc(P.monthPick || '연월 고르기')}">` +
      `<button type="button" class="gr-prev" aria-label="이전 달" data-focus="gr-prev" ${G.ym === ms[ms.length - 1] ? 'disabled' : ''}>◀</button>` +
      `<select class="gr-ym" aria-label="${esc(P.monthPick || '연월 고르기')}" data-focus="gr-ym">${ms.map((m) => `<option value="${m}" ${m === G.ym ? 'selected' : ''}>${ymLabel(m)}</option>`).join('')}</select>` +
      `<button type="button" class="gr-next" aria-label="다음 달" data-focus="gr-next" ${G.ym === ms[0] ? 'disabled' : ''}>▶</button></div>`;
    if (!here.length) return h + `<p class="gr-empty">${esc(P.grassEmptyMonth || '이 달엔 공부 계획이 없어요')}</p></div>`;
    if (!G.subject || !here.some((r) => r.name === G.subject)) G.subject = here[0].name;
    const col = SP.colorOf(order.indexOf(G.subject)), lv = levels(col);
    h += `<div class="gr-pills" role="radiogroup" aria-label="과목 고르기">` + here.map((r) => {
      const on = r.name === G.subject;
      return `<button type="button" role="radio" class="gr-pill ${on ? 'on' : ''}" data-name="${esc(r.name)}" aria-checked="${on}" data-focus="gr:${esc(r.name)}"><i style="background:${SP.colorOf(order.indexOf(r.name)).bg}" aria-hidden="true"></i>${esc(r.name)}</button>`;
    }).join('') + '</div>';
    const g = grid(d, G.subject, t, G.ym);
    h += `<div class="gr-head"><h3>${esc(G.subject)}</h3><span>${esc(Life.fill(P.grassMonth || '{m}월 {n}일', { m: Number(G.ym.slice(5, 7)), n: g.monthDays }))}</span></div>`;
    if (!g.cells.some((c) => c.n)) h += `<p class="gr-empty">${esc(SL.grassEmpty || '')}</p>`;
    h += `<div class="gr-board" style="--weeks:${g.weeks}">`;
    h += '<div class="gr-wd">' + WD.map((w, i) => `<span>${i % 2 === 0 && i < 6 ? w : ''}</span>`).join('') + '</div>';
    h += '<div class="gr-cells" role="grid" aria-label="계획 막대가 있는 날">' + g.cells.map((c) => {
      const [, mo, da] = c.date.split('-').map(Number), lab = `${mo}월 ${da}일${c.n ? ' · ' + c.parts.join(', ') : ''}`;
      return `<i class="gr-c${c.today ? ' today' : ''}" data-date="${c.date}" data-lv="${c.lv}" style="grid-column:${c.col + 1};grid-row:${c.row + 1};background:${lv[c.lv]}" title="${esc(lab)}" aria-label="${esc(lab)}"></i>`;
    }).join('') + '</div></div>';
    h += `<div class="gr-legend" aria-label="칸 색 = 그날 계획 막대 수"><span>${esc(P.grassLegend || '그날 계획')}</span>${lv.map((x, i) => `<b>${i < 3 ? i : '3+'}</b><i style="background:${x}"${i ? '' : ' class="lv0"'}></i>`).join('')}</div>`;
    return h + '</div>';
  }
  function bind(el) {
    const box = el.querySelector('.grass'); if (!box) return;
    const go = (ym, focus) => { G.ym = ym; Life.paint('archive', el, focus); };
    const sel = box.querySelector('.gr-ym'); if (sel) sel.addEventListener('change', () => go(sel.value, 'gr-ym'));
    const pv = box.querySelector('.gr-prev'); if (pv) pv.addEventListener('click', () => go(addMonth(G.ym, -1), 'gr-prev'));
    const nx = box.querySelector('.gr-next'); if (nx) nx.addEventListener('click', () => go(addMonth(G.ym, 1), 'gr-next'));
    box.querySelectorAll('.gr-pill').forEach((b) => b.addEventListener('click', () => {
      if (G.subject === b.dataset.name) return; G.subject = b.dataset.name; Life.paint('archive', el, 'gr:' + G.subject);
      const L = (root.PH_STUDY_LINES || {}).grass; if (L && L.length && root.PHApp && root.PHApp.sideSay) { const t = L[Math.floor(Math.random() * L.length)].replace(/\{name\}/g, G.subject); G.said = { key: 'grass', text: t }; root.PHApp.sideSay(t); }
    }));
  }
  root.PHStudyGrass = Object.assign(G, { html, bind, grid, levels, months, addMonth });
})(typeof window !== 'undefined' ? window : globalThis);
