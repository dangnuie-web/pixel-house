// 습관 주기 읽기·세기 (2026-10-04 비트, 습관 편집). 그림·파일 접근 없음. 메인·화면·Node 시험이 같이 쓴다.
//   주기 칸 글: "매일" (= 매일 1회) / "매일 3회" / "주 2회" / "월 4회" / "-" (기록 습관, 주기 없음)
//   체크 칸:
//     매일 1회     = 오늘 한 칸. 오늘 줄에 이름만 ("설거지"), 누르면 뒤집기 (주 N회와 같은 쓰기)
//     매일 n회(n>=2) = 오늘 n칸. 오늘 줄에 "습관 k/n" (물 6칸과 같은 방식)
//     주 n회       = 이번 주(월요일 시작) n칸, "이번 주 k/n". 하루에 한 번 = 한 칸
//     월 n회       = 이번 달 n칸, "이번 달 k/n". 하루에 한 번 = 한 칸
//   물(settings.WATER_HABIT)은 주기가 "매일"이어도 기준 칸 "6칸"으로 6칸 (지금 그대로)
(function (root) {
  'use strict';
  const Md = root.PHLifeMd || (typeof require !== 'undefined' ? require('./life_md.js') : null);
  const LC = root.PHLifeCheck || (typeof require !== 'undefined' ? require('./life_check.js') : null);

  const MAX = { day: 12, week: 7, month: 31 }; // n 상한 (매일 12칸, 주 7회, 월 31회)
  const PER_NAME = { day: '매일', week: '주', month: '월' };

  // "매일 3회" -> { per: 'day', n: 3 } / "주 2회" -> { per: 'week', n: 2 } / "월 4회" -> { per: 'month', n: 4 } / "매일" -> { per: 'day', n: 1 } / 그 밖 null
  function parseCycle(s) {
    const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    let m = /^매일(?:\s*(\d{1,2})\s*회)?$/.exec(t);
    if (m) { const n = m[1] ? Number(m[1]) : 1; return n >= 1 && n <= MAX.day ? { per: 'day', n } : null; }
    m = /^주\s*(\d{1,2})\s*회$/.exec(t);
    if (m) { const n = Number(m[1]); return n >= 1 && n <= MAX.week ? { per: 'week', n } : null; }
    m = /^월\s*(\d{1,2})\s*회$/.exec(t);
    if (m) { const n = Number(m[1]); return n >= 1 && n <= MAX.month ? { per: 'month', n } : null; }
    return null;
  }
  // { per, n } -> 주기 칸 글. 매일 1회는 지금 파일처럼 "매일"
  function formatCycle(per, n) {
    if (!MAX[per] || !Number.isInteger(n) || n < 1 || n > MAX[per]) throw new Error('주기 오류');
    if (per === 'day') return n === 1 ? '매일' : `매일 ${n}회`;
    return `${PER_NAME[per]} ${n}회`;
  }

  function monthStart(date) { return String(date).slice(0, 8) + '01'; }
  function nextMonth(date) { const d = new Date(Md.dateOf(monthStart(date))); d.setMonth(d.getMonth() + 1); return Md.ymd(d); }
  // 그 칸 항목이 "했음"인지: 이름이 같고, "습관 0/n"이 아님
  const did = (it, habit) => it.name === habit && !(it.of && it.value === 0);

  // [from, to) 안에서 이 습관을 한 날 수 + 오늘 했는지
  function daysIn(records, habit, from, to, today) {
    const a = Md.dateOf(from), b = Md.dateOf(to), t = Md.dateOf(today), days = new Set(); let todayDone = false;
    (records || []).forEach((r) => {
      const d = Md.dateOf(r.date); if (d == null || d < a || d >= b) return;
      if (!r.items.some((it) => did(it, habit))) return;
      days.add(d); if (d === t) todayDone = true;
    });
    return { count: days.size, todayDone };
  }
  // 이번 달 한 날 수 (기록 날짜 기준 달, 1일부터)
  function monthCount(records, habit, today) { return Object.assign(daysIn(records, habit, monthStart(today), nextMonth(today), today), { month: monthStart(today) }); }
  // 오늘 "습관 k/n"의 k (없으면 0)
  function todaySlots(records, habit, today) {
    const t = Md.dateOf(today); let v = 0;
    (records || []).forEach((r) => { if (Md.dateOf(r.date) !== t) return; r.items.forEach((it) => { if (it.name === habit && it.of) v = it.value; else if (it.name === habit && !it.of && it.value == null && !v) v = 1; }); });
    return v;
  }
  // 이 습관의 칸 상태 { per, n(칸 수), count(찬 칸 수, 넘칠 수 있음), todayDone, slots(true = "k/n" 칸) } / 칸 없는 주기면 null
  function countFor(records, row, today) {
    const cy = parseCycle(row && row.cycle); if (!cy) return null;
    if (cy.per === 'day' && cy.n > 1) { const k = todaySlots(records, row.name, today); return { per: 'day', n: cy.n, count: k, todayDone: k > 0, slots: true }; }
    if (cy.per === 'day') { const w = daysIn(records, row.name, today, Md.addDays(today, 1), today); return { per: 'day', n: 1, count: w.count, todayDone: w.todayDone, slots: false }; }
    const w = cy.per === 'week' ? LC.weekCount(records, row.name, today) : monthCount(records, row.name, today);
    return { per: cy.per, n: cy.n, count: w.count, todayDone: w.todayDone, slots: false };
  }
  // 오늘 이름을 더하고 빼는(뒤집기) 주기인지: 매일 1회 / 주 n회 / 월 n회
  function isToggle(cycle) { const cy = parseCycle(cycle); return !!cy && !(cy.per === 'day' && cy.n > 1); }
  // "k/n" 칸 주기인지: 매일 n회 (n >= 2)
  function slotsOf(cycle) { const cy = parseCycle(cycle); return cy && cy.per === 'day' && cy.n > 1 ? cy.n : 0; }
  // 칸 옆 글: "오늘 2/3" / "이번 주 1/2" / "이번 달 3/4" / "오늘"(매일 1회)
  function note(c) {
    if (!c) return '';
    if (c.per === 'day') return c.slots ? `오늘 ${c.count}/${c.n}` : (c.todayDone ? '오늘 했어요' : '오늘');
    return `${c.per === 'week' ? '이번 주' : '이번 달'} ${c.count}/${c.n}`;
  }

  const HC = { MAX, parseCycle, formatCycle, monthStart, monthCount, todaySlots, countFor, isToggle, slotsOf, note };
  root.PHHabitCycle = HC;
  if (typeof module !== 'undefined' && module.exports) module.exports = HC;
})(typeof window !== 'undefined' ? window : globalThis);
