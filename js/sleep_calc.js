// 잠 탭·칠하기 창 계산 (그림 없음, Node 시험 tests/test_sleep.js에서도 씀). 2026-10-09 비트, 무늬 시안 v01(디자인/20261008_pixel-house_잠기록_v01.md)
//   줄 하나 = 깬 날 D: 전날 18시 ~ D 18시 (js/life_log.js sleepGrid의 date = 창 시작 날 → 이름표는 하루 더함)
//   구간 a·b = 줄(창) 시작부터 몇 분 (0~1440). 선잠 light. 잔 시각만·깬 시각만 줄(open) = 2시간짜리 사라지는 펜 + "?"
//   칠하기 창 = 분 단위 칸 1440개(0 없음 / 1 선잠 / 2 잠). 칠하기는 30분 칸 단위, 손대지 않은 곳의 분은 그대로
(function (root) {
  'use strict';
  const LL = root.PHLifeLog || (typeof require !== 'undefined' ? require('./life_log.js') : null);
  const H = LL.SLEEP_GRID_HOUR;  // 18 (무늬 추천 = 비트 기본값)
  const DAY = 1440, CELL = 30;   // 칠하기 칸 30분 (무늬 추천)
  const OPEN_LEN = 120;          // 잔 시각만 줄을 그리는 길이 (사라지는 펜)
  const NEAR = 60;               // 칠한 잠이 잔 시각 앞뒤 이만큼 안에서 시작하면 그 줄은 칠한 것으로 바뀐 것
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const pad = (n) => String(n).padStart(2, '0');
  function dIdx(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s)); return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : null; }
  function dStr(i) { const x = new Date(i * 864e5); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; }
  const addDays = (s, k) => dStr(dIdx(s) + k);
  const dow = (s) => new Date(dIdx(s) * 864e5).getUTCDay();
  const ymdOf = (ms) => { const x = new Date(ms); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
  // 깬 날 줄의 창 시작 'YYYY-MM-DD 18:00' (전날 18시)
  const fromOf = (date) => addDays(date, -1) + ' ' + pad(H) + ':00';
  // 지금 시각(ms, 이 컴퓨터 시계)이 들어 있는 줄 = 18시 전이면 오늘, 18시부터는 내일
  function rowOfMs(ms) { const x = new Date(ms), d = ymdOf(ms); return x.getHours() >= H ? addDays(d, 1) : d; }
  // 지금이 그 줄 창 시작부터 몇 분 (그 줄이 아니면 null)
  function nowIn(date, ms) { if (rowOfMs(ms) !== date) return null; const x = new Date(ms); return ((x.getHours() - H + 24) % 24) * 60 + x.getMinutes(); }
  // 창 안 분 -> 시계 'HH:MM'
  const clock = (m) => { const c = (((m + H * 60) % DAY) + DAY) % DAY; return pad(Math.floor(c / 60)) + ':' + pad(c % 60); };
  const clockToMin = (t) => { const m = /^(\d{2}):(\d{2})$/.exec(String(t)); if (!m) return null; return (((+m[1] * 60 + +m[2]) - H * 60) % DAY + DAY) % DAY; };
  const dur = (m) => { m = Math.max(0, Math.round(m)); const h = Math.floor(m / 60), r = m % 60; return h && r ? `${h}시간 ${r}분` : h ? `${h}시간` : `${r}분`; };
  const durShort = (m) => `${Math.floor(m / 60)}:${pad(m % 60)}`;

  // 한 줄(sleepWindow 결과) -> 그릴 조각 [{ a, b, light, cutStart, cutEnd, open: null|'bed'|'wake', at, start, end, memo }] (시작 순)
  function piecesOf(w) {
    const out = (w.merged || []).map((s) => ({ a: s.a, b: s.b, light: s.light, cutStart: s.cutStart, cutEnd: s.cutEnd, open: null, start: s.start, end: s.end, memo: s.memo || '' }));
    (w.open || []).forEach((o) => {
      const bed = o.side ? o.side === 'bed' : !!o.bed;
      out.push(bed ? { a: o.a, b: Math.min(DAY, o.a + OPEN_LEN), light: false, open: 'bed', at: o.at, memo: o.memo || '' }
        : { a: Math.max(0, o.a - OPEN_LEN), b: o.a, light: false, open: 'wake', at: o.at, memo: o.memo || '' });
    });
    return out.sort((x, y) => x.a - y.a || x.b - y.b);
  }
  // 잔 시간 = 보통 잠만 (선잠·잔 시각만 줄 빼고)
  const totalOf = (pieces) => pieces.filter((p) => !p.light && !p.open).reduce((s, p) => s + p.b - p.a, 0);
  // 밤잠/낮잠/선잠 (화면에서만 붙이는 이름, 파일엔 안 적음): 0시 전 2시간 ~ 6시 사이에 걸치면 밤잠. 창 안 0시 = (24-H)*60분
  function kindOf(p) {
    if (p.open) return p.open === 'bed' ? 'bedOnly' : 'wakeOnly';
    if (p.light) return 'light';
    const mid = (24 - H) * 60;
    return p.a < mid + 6 * 60 && p.b > mid - 2 * 60 ? 'night' : 'nap';
  }
  // 한 달 모눈: ym 'YYYY-MM', nowMs = 지금. -> { y, m, days, rows: [{ date, d, dow, future, nowAt, pieces, total, openOnly, memo, hasOpen }], count, avg }
  function month(src, ym, nowMs) {
    const P = src && Array.isArray(src.sleep) ? src : LL.parse(src);
    const [y, m] = ym.split('-').map(Number), n = new Date(Date.UTC(y, m, 0)).getUTCDate(), first = `${ym}-01`;
    const grid = LL.sleepGrid(P, { from: addDays(first, -1), days: n, startHour: H });
    const nowRow = rowOfMs(nowMs);
    const rows = grid.map((g) => {
      const date = addDays(g.date, 1), future = date > nowRow, pieces = future ? [] : piecesOf(g);
      const memos = [...new Set((g.segments || []).map((s) => s.memo).concat((g.open || []).map((o) => o.memo)).filter(Boolean))];
      return { date, d: Number(date.slice(8)), dow: dow(date), future, nowAt: future ? null : nowIn(date, nowMs), pieces, total: totalOf(pieces),
        openOnly: pieces.length > 0 && pieces.every((p) => p.open), hasOpen: pieces.some((p) => p.open), memo: memos.join(' · '), win: g };
    });
    const done = rows.filter((r) => r.pieces.length), nights = rows.filter((r) => r.total > 0);
    return { y, m, days: n, rows, count: done.length, avg: nights.length ? Math.round(nights.reduce((s, r) => s + r.total, 0) / nights.length) : 0 };
  }
  // 그 줄(깬 날) 하나만
  function day(src, date) {
    const P = src && Array.isArray(src.sleep) ? src : LL.parse(src);
    const w = LL.sleepWindow(P, fromOf(date), 24);
    return Object.assign({ date, from: fromOf(date) }, w, { pieces: piecesOf(w) });
  }

  // ---- 형광펜 흔들림 (구간마다 고정 씨앗: 다시 그려도 같은 모양) ----
  const seedOf = (p) => ((p.a * 7 + p.b * 13 + (p.light ? 5 : 0)) >>> 0) || 1;
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1103515245 + 12345) >>> 0; return (s >>> 8) / 16777216; }; }
  // 목업 .pen 변수 그대로 (wpx = 그려질 너비 px)
  function penVars(seed, wpx) {
    const r = rng(seed), sl = Math.max(0, Math.min(2.6, wpx / 6)), j = (lo, hi) => (lo + r() * (hi - lo)).toFixed(1) + 'px';
    return `--jy:${j(-1, 1)};--jh:${j(-1, 0.8)};--tl:${(sl * (0.7 + r() * 0.3)).toFixed(1)}px;--br:${(sl * (0.7 + r() * 0.3)).toFixed(1)}px;` +
      `--e1:${j(0, 1)};--e2:${j(0, 1.2)};--e3:${j(0, 0.8)};--e4:${j(0, 1)};--e5:${j(0, 1.2)};--e6:${j(0, 0.8)};--pool:${Math.min(8, wpx / 4).toFixed(1)}px`;
  }

  // ---- 칠하기 (분 칸 1440개) ----
  function arrFrom(merged) { const arr = new Uint8Array(DAY); (merged || []).forEach((s) => { for (let t = Math.max(0, s.a); t < Math.min(DAY, s.b); t++) arr[t] = Math.max(arr[t], s.light ? 1 : 2); }); return arr; }
  function runs(arr) { const out = []; let i = 0; while (i < DAY) { if (!arr[i]) { i++; continue; } let j = i; while (j < DAY && arr[j] === arr[i]) j++; out.push({ a: i, b: j, light: arr[i] === 1 }); i = j; } return out; }
  // 칸 c0~c1(30분 칸 번호)을 pen(0 지우개 / 1 선잠 / 2 잠)으로. limit = 이 분부터는 못 칠함(지금 뒤)
  function fill(arr, c0, c1, pen, limit) {
    const lo = Math.min(c0, c1) * CELL, hi = Math.min((Math.max(c0, c1) + 1) * CELL, limit == null ? DAY : limit);
    for (let t = lo; t < hi; t++) arr[t] = pen;
    return arr;
  }
  // 목록에서 시각 고치기: 구간 r(a,b)의 한쪽 끝을 시계 'HH:MM'으로. 잘못된 값이면 false
  function setEdge(arr, r, edge, hm, limit) {
    let x = clockToMin(hm); if (x == null) return false;
    if (edge === 'b' && x === 0) x = DAY;
    const a = edge === 'a' ? x : r.a, b = edge === 'b' ? x : r.b; if (a === b) return false;
    for (let t = r.a; t < r.b; t++) arr[t] = 0;
    const lo = Math.min(a, b), hi = Math.min(Math.max(a, b), limit == null ? DAY : limit);
    for (let t = lo; t < hi; t++) arr[t] = r.light ? 1 : 2;
    return true;
  }
  // 잔 시각만 줄(open 조각 또는 sleepWindow open)이 칠한 잠으로 덮였는지 (무늬 1절: 덮거나, 앞뒤 60분 안에서 시작하면. 깬 시각만 줄은 거꾸로 끝 기준)
  function covered(o, rs) {
    const bed = o.side ? o.side === 'bed' : o.open ? o.open === 'bed' : !!o.bed, t = o.t != null ? o.t : o.open === 'wake' ? o.b : o.a;
    return rs.some((r) => !r.light && (bed ? ((r.a <= t && r.b > t) || Math.abs(r.a - t) <= NEAR) : ((r.a < t && r.b >= t) || Math.abs(r.b - t) <= NEAR)));
  }
  // 저장할 구간: 칠한 덩어리 + 메모. 메모를 안 고쳤으면 원래 구간 메모를 가장 많이 겹치는 덩어리에 그대로, 고쳤으면 대표(가장 긴 보통 잠, 없으면 가장 긴 것) 하나에
  function segmentsOut(rs, orig, memo, memoInit) {
    const segs = rs.map((r) => ({ a: r.a, b: r.b, light: r.light, memo: '' }));
    if (!segs.length) return segs;
    if (memo === memoInit) {
      (orig || []).forEach((o) => {
        if (!o.memo) return;
        let best = null, bo = 0;
        segs.forEach((s) => { const ov = Math.min(s.b, o.b) - Math.max(s.a, o.a); if (ov > bo) { bo = ov; best = s; } });
        if (best && !best.memo.split(' · ').includes(o.memo)) best.memo = best.memo ? best.memo + ' · ' + o.memo : o.memo;
      });
    } else if (String(memo || '').trim()) {
      const pool = segs.some((s) => !s.light) ? segs.filter((s) => !s.light) : segs;
      pool.reduce((m, s) => (s.b - s.a > m.b - m.a ? s : m)).memo = String(memo).trim();
    }
    return segs;
  }
  // 생활 습관 기록 카드: 가장 최근 잠(보통 잠, 지금 전에 끝남) -> { date(깬 날), bed, wake, min } 또는 null
  function lastSleep(src, nowMs) {
    const P = src && Array.isArray(src.sleep) ? src : LL.parse(src);
    const x = new Date(nowMs), now = LL.toMin(`${ymdOf(nowMs)} ${pad(x.getHours())}:${pad(x.getMinutes())}`);
    // 밤잠 우선 (낮잠만 지나간 오후에도 "어젯밤" 잠이 보이게), 밤잠이 없으면 아무 보통 잠
    const isNight = (r) => { const w0 = LL.toMin(fromOf(LL.fromMin(r.end).slice(0, 10))); return kindOf({ a: r.start - w0, b: r.end - w0 }) === 'night'; };
    const pick = (list) => list.reduce((b, r) => (!b || r.end > b.end || (r.end === b.end && r.end - r.start > b.end - b.start) ? r : b), null);
    const all = P.sleep.filter((r) => r.start != null && !r.light && r.end <= now);
    const best = pick(all.filter(isNight)) || pick(all);
    if (!best) return null;
    const e = LL.fromMin(best.end), s = LL.fromMin(best.start);
    return { date: e.slice(0, 10), bed: s.slice(11), wake: e.slice(11), min: best.end - best.start, night: isNight(best) };
  }

  const SC = { H, DAY, CELL, OPEN_LEN, NEAR, WD, pad, dIdx, dStr, addDays, dow, fromOf, rowOfMs, nowIn, clock, clockToMin, dur, durShort, piecesOf, totalOf, kindOf, month, day,
    seedOf, penVars, arrFrom, runs, fill, setEdge, covered, segmentsOut, lastSleep };
  root.PHSleepCalc = SC;
  if (typeof module !== 'undefined' && module.exports) module.exports = SC;
})(typeof window !== 'undefined' ? window : globalThis);
