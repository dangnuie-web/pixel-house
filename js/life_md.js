// 생활 자료 md 읽기 (그림 없음, Node 시험에서도 씀). 원본: settings.LIFE_FILE (PixelHouse 폴더 안 상대 경로)
// 첫 판은 읽기만. 나중에 쓰기를 붙이기 쉽게 모든 줄 번호(line, 0부터)를 남긴다:
//   쓰기 = "바뀐 줄만 lines[line]에 바꿔 끼우고 join" (pixel-office priority_md와 같은 방식). 모르는 줄·섹션은 그대로 둔다
(function (root) {
  'use strict';

  // '## 이름' 단위로 나눔. { name, line(제목 줄), start(본문 첫 줄), end(다음 제목 줄, 없으면 끝) }
  function sections(lines) {
    const out = [];
    lines.forEach((l, i) => { const m = /^##\s+(.+?)\s*$/.exec(l); if (m) out.push({ name: m[1], line: i, start: i + 1, end: lines.length }); });
    out.forEach((s, i) => { if (out[i + 1]) s.end = out[i + 1].line; });
    return out;
  }
  function cells(l) { return l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()); }
  const isTable = (l) => /^\s*\|/.test(l);
  const isSep = (l) => /^\s*\|?\s*:?-{3,}/.test(l);
  // 섹션 안 첫 표: { head: [...], rows: [{ line, cells: {머리: 값}, raw: [...] }] }
  function table(lines, sec) {
    let i = sec.start;
    while (i < sec.end && !isTable(lines[i])) i++;
    if (i >= sec.end) return null;
    const head = cells(lines[i]); const rows = [];
    for (let j = i + 1; j < sec.end && isTable(lines[j]); j++) {
      if (isSep(lines[j])) continue;
      const raw = cells(lines[j]), c = {};
      head.forEach((h, k) => { c[h] = raw[k] == null ? '' : raw[k]; });
      rows.push({ line: j, cells: c, raw });
    }
    return { line: i, head, rows };
  }
  // 섹션 안 표 아닌 글줄 (설명)
  function prose(lines, sec) { const out = []; for (let i = sec.start; i < sec.end; i++) if (lines[i].trim() && !isTable(lines[i])) out.push({ line: i, text: lines[i].trim() }); return out; }

  // "물 3/6, 독서 20쪽, 요가" -> [{ name: '물', value: 3, of: 6 }, { name: '독서', value: 20, unit: '쪽' }, { name: '요가' }] (모두 text 포함)
  function recordItems(s) {
    return String(s || '').split(/[,，]\s*/).map((t) => t.trim()).filter(Boolean).map((t) => {
      let m = /^(.+?)\s+(\d+)\s*\/\s*(\d+)$/.exec(t);
      if (m) return { name: m[1], value: Number(m[2]), of: Number(m[3]), text: t };
      m = /^(.+?)\s+(\d+(?:\.\d+)?)\s*([^\d\s/,]+)$/.exec(t);
      if (m) return { name: m[1], value: Number(m[2]), unit: m[3], text: t };
      return { name: t, text: t };
    });
  }
  // 습관 기록을 "한 칸 = 한 날짜의 한 습관"으로 펼친 목록 (기록 보관·나중의 분석·그래프용)
  //   { date, day(그날 0시 ms 또는 null), habit, value, of, unit, done(true), text, line }
  function entries(records) {
    const out = [];
    (records || []).forEach((r) => r.items.forEach((it) => out.push({ date: r.date, day: dateOf(r.date), habit: it.name, value: it.value == null ? null : it.value,
      of: it.of || null, unit: it.unit || null, done: true, text: it.text, line: r.line })));
    return out;
  }
  // 날짜별 묶음 (최근 날짜 먼저): [{ date, day, items: [...] }]
  function byDate(list) {
    const m = new Map();
    (list || []).forEach((e) => { if (!m.has(e.date)) m.set(e.date, { date: e.date, day: e.day, items: [] }); m.get(e.date).items.push(e); });
    return [...m.values()].sort((a, b) => (b.day || 0) - (a.day || 0));
  }
  // 습관별 묶음 (습관 표 순서, 표에 없는 습관은 뒤에): [{ habit, count, total, unit, of, items: [...] }]
  function byHabit(list, habitRows) {
    const order = (habitRows || []).map((r) => r.name), m = new Map();
    (list || []).forEach((e) => {
      if (!m.has(e.habit)) m.set(e.habit, { habit: e.habit, count: 0, total: 0, unit: e.unit, of: e.of, items: [] });
      const g = m.get(e.habit); g.count++; if (e.value != null) g.total += e.value; g.items.push(e);
    });
    const rank = (h) => { const i = order.indexOf(h); return i < 0 ? 1e6 : i; };
    return [...m.values()].sort((a, b) => rank(a.habit) - rank(b.habit) || a.habit.localeCompare(b.habit));
  }
  // 종류 설명 줄: "종류: 목표 = ... / 안전장치 = ... / 기록 = ..." -> [{ name, desc }]
  function kinds(text) {
    const m = /^종류\s*[:：]\s*(.+)$/.exec(text || ''); if (!m) return [];
    return m[1].split(/\s+\/\s+/).map((p) => { const k = /^(.+?)\s*=\s*(.+)$/.exec(p.trim()); return k ? { name: k[1].trim(), desc: k[2].trim() } : null; }).filter(Boolean);
  }
  // 기준에서 칸 수: "1.5L (250ml × 6칸)" -> 6
  function slotsOf(s) { const m = /(\d+)\s*칸/.exec(s || ''); return m ? Number(m[1]) : 0; }

  // 섹션 이름 (파일에 맞춘 것. 이름이 바뀌면 여기만)
  //   약속은 새 이름 '약속', 옛 파일의 'Meeting'도 읽음. 공부는 생활기록 v01에 새로 생긴 섹션
  const NAMES = { habits: '생활습관', study: '공부', records: '습관 기록', meetings: ['약속', 'Meeting'], bucket: '버킷리스트' };
  const first = (n) => (Array.isArray(n) ? n[0] : n);

  function parse(text) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    const secs = sections(lines), sec = (n) => secs.find((s) => (Array.isArray(n) ? n.includes(s.name) : s.name === n)) || null;
    const out = { lines, sections: secs, missing: [] };
    // 생활습관
    const hs = sec(NAMES.habits);
    if (hs) {
      const t = table(lines, hs), desc = prose(lines, hs).find((p) => /^종류\s*[:：]/.test(p.text));
      out.habits = {
        kinds: desc ? kinds(desc.text) : [], kindsLine: desc ? desc.line : null,
        rows: t ? t.rows.map((r) => ({ line: r.line, name: r.cells['습관'], kind: r.cells['종류'], target: r.cells['기준'], cycle: r.cells['주기'], slots: slotsOf(r.cells['기준']) })) : [],
      };
    } else out.missing.push(NAMES.habits);
    // 공부: "기준: 매일 1시간" 줄 + | 공부 | 시작 | 끝 | 메모 | 표 (간트 막대 하나 = 한 줄)
    const ss = sec(NAMES.study);
    if (ss) {
      const t = table(lines, ss), crit = prose(lines, ss).find((p) => /^기준\s*[:：]/.test(p.text));
      out.study = {
        target: crit ? crit.text.replace(/^기준\s*[:：]\s*/, '') : '', targetLine: crit ? crit.line : null, tableLine: t ? t.line : null,
        rows: t ? t.rows.map((r) => ({ line: r.line, name: r.cells['공부'], start: r.cells['시작'], end: r.cells['끝'], memo: r.cells['메모'] || '',
          startDay: dateOf(r.cells['시작']), endDay: dateOf(r.cells['끝']), open: !String(r.cells['끝'] || '').trim() })) : [], // open = 끝 날짜 비어 있음(미정)
      };
    } else out.missing.push(NAMES.study);
    // 습관 기록 (+ 펼친 목록 entries: 날짜별·습관별로 묶기 쉽게)
    const rs = sec(NAMES.records);
    if (rs) { const t = table(lines, rs); out.records = t ? t.rows.map((r) => ({ line: r.line, date: r.cells['날짜'], text: r.cells['한 습관'], items: recordItems(r.cells['한 습관']) })) : []; out.entries = entries(out.records); }
    else { out.missing.push(NAMES.records); out.entries = []; }
    // 약속 (옛 이름 Meeting)
    const ms = sec(NAMES.meetings);
    if (ms) { const t = table(lines, ms); out.meetings = t ? t.rows.map((r) => ({ line: r.line, date: r.cells['날짜'], time: r.cells['시간'], text: r.cells['내용'] })) : []; out.meetingsSection = ms.name; }
    else out.missing.push(first(NAMES.meetings));
    // 버킷리스트: "- [ ] 할 일" / "- [x] 한 일". "(…채우기)"처럼 괄호만 있는 줄은 자리 표시
    const bs = sec(NAMES.bucket);
    if (bs) {
      out.bucket = [];
      for (let i = bs.start; i < bs.end; i++) {
        const m = /^\s*[-*]\s+\[([ xX])\]\s*(.*)$/.exec(lines[i]); if (!m) continue;
        let t = m[2].trim(), doneDate = null;
        const dd = /\s*\(완료 (\d{4}-\d{2}-\d{2})\)\s*$/.exec(t); // 2026-10-08: 체크할 때 적는 끝낸 날 (js/bucket_write.js). 글에서는 뺌
        if (dd && m[1] !== ' ') { doneDate = dd[1]; t = t.slice(0, dd.index).trim(); }
        out.bucket.push({ line: i, done: m[1] !== ' ', text: t, doneDate, placeholder: /^\(.*\)$/.test(t) || !t });
      }
    } else out.missing.push(NAMES.bucket);
    return out;
  }
  // 날짜 문자열 "2026-10-02" -> 그날 0시 (기기 시간). 못 읽으면 null
  function dateOf(s) { const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(s || '').trim()); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null; }
  // 약속 나누기: 오늘 이후(가까운 순) / 지난 것(최근 순) / 날짜 모름
  function splitMeetings(list, now) {
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const t0 = today.getTime(), up = [], past = [], unknown = [];
    (list || []).forEach((m) => { const d = dateOf(m.date); (d == null ? unknown : d >= t0 ? up : past).push(Object.assign({ day: d }, m)); });
    up.sort((a, b) => a.day - b.day); past.sort((a, b) => b.day - a.day);
    return { up, past, unknown };
  }
  // ---- 하루 경계 (settings.DAY_START_HOUR, 기본 6시): 01~06시는 전날. 물컵·대화창·습관 체크가 모두 이 함수를 씀 ----
  const pad2 = (n) => String(n).padStart(2, '0');
  function ymd(d) { const x = new Date(d); return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`; }
  const hourOf = (h) => (Number.isFinite(h) ? h : 6);
  // 기록 날짜 문자열 "2026-10-02"
  function logDay(ms, startHour) { return ymd(ms - hourOf(startHour) * 3600000); }
  // 기록 날짜의 0시 (기기 시간, ms)
  function logDayMs(ms, startHour) { return dateOf(logDay(ms, startHour)); }
  // 그 날짜가 든 주의 월요일 "2026-09-28" (주는 월요일 시작, 간트와 같음)
  function weekStart(date) { const d = new Date(dateOf(date)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); }
  function addDays(date, n) { const d = new Date(dateOf(date)); d.setDate(d.getDate() + n); return ymd(d); }

  // 칸 습관(물 6칸)의 기록: 오늘 기록이 있으면 오늘, 없으면 가장 최근 날짜 { date, value, of, isToday } / 없으면 null
  //   startHour = 하루 경계(settings.DAY_START_HOUR). 생략하면 0(자정, 옛 동작)
  function latestSlots(records, name, now, startHour) {
    const today = new Date(logDayMs(now, Number.isFinite(startHour) ? startHour : 0));
    const hits = (records || []).map((r) => ({ r, it: r.items.find((x) => x.name === name && x.of) })).filter((h) => h.it && dateOf(h.r.date) != null);
    if (!hits.length) return null;
    hits.sort((a, b) => dateOf(b.r.date) - dateOf(a.r.date));
    const h = hits[0];
    return { date: h.r.date, value: h.it.value, of: h.it.of, isToday: dateOf(h.r.date) === today.getTime() };
  }

  // 간트 기간: 이번 주 월요일부터 weeks주 (기본 minWeeks, 막대 끝이 더 뒤면 maxWeeks까지 늘림). { start, end(마지막 날 다음 0시), days, weeks }
  function ganttRange(rows, now, minWeeks, maxWeeks) {
    const t = new Date(now); t.setHours(0, 0, 0, 0);
    const mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    const start = mon.getTime(), DAY = 86400000;
    let weeks = minWeeks || 4;
    // 날짜 못 읽은 줄(시작 없음)·진행 중(끝 없음)은 기간을 늘리지 않음
    (rows || []).forEach((r) => { if (r.endDay != null && r.startDay != null) { const need = Math.floor((r.endDay - start) / DAY / 7) + 1; if (need > weeks) weeks = need; } });
    weeks = Math.min(weeks, maxWeeks || 12);
    const end = new Date(mon); end.setDate(mon.getDate() + weeks * 7);
    return { start, end: end.getTime(), days: weeks * 7, weeks, today: t.getTime() };
  }
  // 막대 자리 (기간 안 날짜 칸, 0부터): { from, to(포함), clipStart, clipEnd, open } / 기간 밖이면 null, 날짜 못 읽으면 { bad: true }
  //   끝이 비어 있으면(open, "끝 날짜 미정") 기간 끝까지 열린 막대
  function ganttBar(row, range) {
    if (row.startDay == null) return { bad: true };
    if (!row.open && (row.endDay == null || row.endDay < row.startDay)) return { bad: true };
    const DAY = 86400000, idx = (d) => Math.round((new Date(d).setHours(12) - new Date(range.start).setHours(12)) / DAY);
    const a = idx(row.startDay), b = row.open ? range.days - 1 : idx(row.endDay);
    if (b < 0 || a >= range.days) return null;
    return { from: Math.max(0, a), to: Math.min(range.days - 1, b), clipStart: a < 0, clipEnd: row.open || b >= range.days, open: !!row.open };
  }

  root.PHLifeMd = { ymd, logDay, logDayMs, weekStart, addDays, parse, sections, table, recordItems, entries, byDate, byHabit, kinds, slotsOf, dateOf, splitMeetings, latestSlots, ganttRange, ganttBar, NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PHLifeMd;
})(typeof window !== 'undefined' ? window : globalThis);
