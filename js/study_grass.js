// 생활일지 > 공부 탭: 과목 고르기 -> 칠한 칸을 깃허브 잔디처럼 (2026-10-08 비트, 로드맵 3단계). 무늬 기록기능디자인 v01 5-3
//   판 = 세로 7칸(월~일, 위가 월) x 가로 최근 20주(오른쪽 끝 = 오늘이 든 주). 칸 12px, 사이 3px, 모서리 2px, 테두리 없음
//   단계 = 그날 칠한 단원 수 (0 / 1 / 2 / 3 이상). 색 = 그 과목 색 한 가지 (study_parts COLORS). 오늘 칸 = 안쪽 먹선 2px
//   과목 기간 밖(시작일 전·끝일 뒤) = 비움, 기간 안인데 안 한 날 = 0단 색 -> "빠진 날"과 "아직 아닌 날"이 갈림
//   옛 "이름 n시간" 습관 기록이 있는 날도 한 칸으로 셈 (지난 기록)
//   위 요약 줄 = 과목 이름 + "이번 달 n일". (디자인 시안의 "이어서 n일"은 하우스 규칙 "연속 기록 숫자 없음"과 맞지 않아 뺌 -> 무늬·제작자 확인)
//   읽기만 (칠하기는 생활 습관 탭 공부 카드에서)
(function (root) {
  'use strict';
  const SP = root.PHStudyParts, SW = root.PHStudyWrite, Md = root.PHLifeMd, Life = root.PHLife, S = root.PH_SETTINGS;
  if (!SP || !SW || !Life) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WEEKS = 20, WD = ['월', '화', '수', '목', '금', '토', '일'];
  const G = { subject: null, said: null };
  const today = () => SW.logDay(Life.now(), S.DAY_START_HOUR);
  function mix(hex, w, t) { // hex 색을 흰색(#FBFAF6)과 섞기 (t = 원색 비율)
    const a = parseInt(hex.slice(1), 16), b = parseInt(w.slice(1), 16), c = (s) => Math.round(((a >> s) & 255) * t + ((b >> s) & 255) * (1 - t));
    return '#' + [16, 8, 0].map((s) => c(s).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function levels(col) { return ['#EFE6D3', mix(col.bg, '#FBFAF6', 0.4), col.bg, col.deep]; }
  // 계산 (화면 없이도): subject 행 -> { cells: [{ date, n, lv, out, today, parts }], months: [{ col, label }], monthDays }
  function grid(d, name, t) {
    const row = d.study.rows.find((r) => r.name === name); if (!row) return null;
    const P = SP.parse(d.lines || []), m = SP.dayMap(P, name, SW.loggedDays(d.records, name));
    const mon = (s) => { const [y, mo, da] = s.split('-').map(Number), w = new Date(y, mo - 1, da, 12).getDay(); return SW.addDays(s, -((w + 6) % 7)); };
    const start = SW.addDays(mon(t), -(WEEKS - 1) * 7), cells = [], months = [];
    const s0 = SW.isDate(row.start) ? row.start : null, e0 = row.open ? null : (SW.isDate(row.end) ? row.end : null);
    for (let c = 0; c < WEEKS; c++) for (let r = 0; r < 7; r++) {
      const date = SW.addDays(start, c * 7 + r), parts = m[date] || [], n = parts.length;
      const out = date > t || (s0 && date < s0) || (e0 && date > e0);
      cells.push({ date, col: c, row: r, n, lv: SP.level(n), out: !!out && !n, today: date === t, parts });
      if (r === 0) { const lab = Number(date.slice(5, 7)) + '월'; if (!months.length || months[months.length - 1].label !== lab) months.push({ col: c, label: lab }); } // 그 주 월요일의 달이 바뀌는 열에 달 이름
    }
    const ym = t.slice(0, 7), monthDays = Object.keys(m).filter((k) => k.slice(0, 7) === ym && k <= t).length;
    return { cells, months, monthDays, row };
  }
  function html(d) {
    const rows = (d.study && d.study.rows) || [];
    const SL = root.PH_STUDY_LINES || {};
    if (!rows.length) return `<div class="life-dubu"><canvas class="dubu-mini" width="16" height="20" aria-hidden="true"></canvas><p>${esc((root.PH_LINES.ui || {}).studyEmpty || '')}</p></div>`;
    if (!G.subject || !rows.some((r) => r.name === G.subject)) G.subject = rows[0].name;
    const order = rows.map((r) => r.name), col = SP.colorOf(order.indexOf(G.subject)), lv = levels(col), t = today();
    let h = `<div class="grass" data-subject="${esc(G.subject)}"><div class="gr-pills" role="radiogroup" aria-label="과목 고르기">` + rows.map((r, i) => {
      const on = r.name === G.subject;
      return `<button type="button" role="radio" class="gr-pill ${on ? 'on' : ''}" data-name="${esc(r.name)}" aria-checked="${on}" data-focus="gr:${esc(r.name)}"><i style="background:${SP.colorOf(i).bg}" aria-hidden="true"></i>${esc(r.name)}</button>`;
    }).join('') + '</div>';
    const g = grid(d, G.subject, t);
    h += `<div class="gr-head"><h3>${esc(G.subject)}</h3><span>이번 달 ${g.monthDays}일</span></div>`;
    if (!g.cells.some((c) => c.n)) h += `<p class="gr-empty">${esc(SL.grassEmpty || '')}</p>`;
    h += `<div class="gr-board" style="--weeks:${WEEKS}"><div class="gr-months">` + g.months.map((m) => `<span style="grid-column:${m.col + 2}">${m.label}</span>`).join('') + '</div>';
    h += '<div class="gr-wd">' + WD.map((w, i) => `<span>${i % 2 === 0 && i < 6 ? w : ''}</span>`).join('') + '</div>';
    h += '<div class="gr-cells" role="grid" aria-label="칠한 날">' + g.cells.map((c) => {
      const [y, mo, da] = c.date.split('-').map(Number), lab = `${mo}월 ${da}일${c.n ? ' · ' + c.parts.join(', ') : c.out ? '' : ' · 안 칠함'}`;
      return `<i class="gr-c${c.out ? ' out' : ''}${c.today ? ' today' : ''}" data-date="${c.date}" data-lv="${c.out ? '' : c.lv}" style="grid-column:${c.col + 1};grid-row:${c.row + 1};${c.out ? '' : `background:${lv[c.lv]}`}" title="${esc(lab)}" aria-label="${esc(lab)}"></i>`;
    }).join('') + '</div></div>';
    h += `<div class="gr-legend"><span>적게</span>${lv.map((x) => `<i style="background:${x}"></i>`).join('')}<span>많이</span></div>`;
    return h + '</div>';
  }
  function bind(el) {
    const box = el.querySelector('.grass'); if (!box) return;
    box.querySelectorAll('.gr-pill').forEach((b) => b.addEventListener('click', () => {
      if (G.subject === b.dataset.name) return; G.subject = b.dataset.name; Life.paint('archive', el, 'gr:' + G.subject);
      const L = (root.PH_STUDY_LINES || {}).grass; if (L && L.length && root.PHApp && root.PHApp.sideSay) { const t = L[Math.floor(Math.random() * L.length)].replace(/\{name\}/g, G.subject); G.said = { key: 'grass', text: t }; root.PHApp.sideSay(t); }
    }));
  }
  root.PHStudyGrass = Object.assign(G, { html, bind, grid, levels, WEEKS });
})(typeof window !== 'undefined' ? window : globalThis);
