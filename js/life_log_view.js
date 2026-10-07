// 기록 보관 탭에 붙는 "생활 기록" 표: 날짜별 잠·식사·한마디 (두부 대화창이 적은 ## 수면 / ## 식사 / ## 한마디). 읽기만.
// life.js archiveView가 PHLifeLogView.html(d.lines, { dayLabel, esc })를 불러 습관 기록 표 아래에 붙인다. 기록이 없으면 ''.
// 데이터는 PHLifeLog.byDate (나중에 그래프: 잠든 시각 추이, 끼니 1년 타일 등에 그대로 씀)
(function (root) {
  'use strict';
  const LL = root.PHLifeLog;
  function html(lines, h) {
    const P = LL.parse(lines || []), days = LL.byDate(P);
    if (!days.length) return '';
    const esc = h.esc, row = (g) => {
      const sl = g.sleep ? `<span class="lg-sleep">${esc(LL.fmtTime(g.sleep.bed) || '?')} ~ ${esc(LL.fmtTime(g.sleep.wake) || '?')}</span>${g.sleep.memo ? `<small>${esc(g.sleep.memo)}</small>` : ''}` : '';
      const ml = g.meals.map((m) => `<span class="lg-meal" data-kind="${esc(m.kind)}"><b>${esc(m.kind)}</b> ${esc(m.text)}</span>`).join('');
      const nt = g.notes.map((n) => `<span class="lg-note">${n.mood ? `<b class="lg-mood" data-mood="${esc(n.mood)}">${esc(n.mood)}</b> ` : ''}${esc(n.text)}</span>`).join(''); // 기분 칸 (interact D)
      return `<tr data-date="${esc(g.date)}"><td>${h.dayLabel(g.date)}</td><td>${sl}</td><td>${ml}</td><td>${nt}</td></tr>`;
    };
    return `<section class="records lifelog"><h3>생활 기록 <small>잠 · 식사 · 한마디</small></h3><table><thead><tr><th>날짜</th><th>잠</th><th>식사</th><th>한마디</th></tr></thead><tbody>` +
      days.map(row).join('') + '</tbody></table></section>';
  }
  root.PHLifeLogView = { html };
})(window);
