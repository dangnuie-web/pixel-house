// 집 안 상호작용 계산 (화면 없음, Node 시험에서도 돌림). 화면·연출은 js/interact.js
//   누르는 곳 만들기(spots), 클릭 판정(hitAt), 제작자이 마주 본 물건(faceTarget), 물 화분 단계, 이번 주 칸 습관 수,
//   오늘·내일 약속, 하루 마감 카드 줄("한 것만")
(function (root) {
  'use strict';
  const req = (n) => (typeof require !== 'undefined' ? require(n) : null);
  const Md = root.PHLifeMd || req('./life_md.js');
  const LL = root.PHLifeLog || req('./life_log.js');
  const FX = root.PHFeatures || req('./features.js');
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const LAMP = 'E'; // 불빛 글자 (등갓). 무늬 layout lamp_letters

  // ---- 누르는 곳 ----
  // spot = { id, type, kind: 'obj' | 'part' | 'area', rect: [x, y, w, h], o(물건), layer, conf, lamp(불 이름 = 스탠드 물건 type) }
  //   frameOf(sprite) = 그림 첫 장 글자 줄 (없으면 null) -> 책꽂이 작은 조명처럼 그림 안 불빛 둘레를 따로 누르는 곳
  //   assetOf(name) = 그림 JSON (px·py·size가 있으면 물 화분 덮개 자리 = 화분만 따로 누르는 곳)
  function nearestLight(L, cx, cy) {
    let best = -1, bd = Infinity;
    (L.lights || []).forEach((l, i) => { const d = Math.hypot(l.x - cx, l.y - cy); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function letterBox(rows, ch) {
    let x1 = Infinity, y1 = Infinity, x2 = -1, y2 = -1;
    (rows || []).forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === ch) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); } });
    return x2 < 0 ? null : [x1, y1, x2 - x1 + 1, y2 - y1 + 1];
  }
  // 가구 ↔ 기능 (2026-10-04): 물건마다 key(features.js keysOf), 기능은 연결표 map(key -> 기능 id)에서. 기능 칸 = conf.go·cat·pill·say + fid(기능 id)·fnLines(기능 대사)
  //   opt = { links: 사용자 연결(앱 설정), all: true면 기능 없는 아래 칸도 남김(연결 모드) }. opt 없으면 기본 연결
  function fnConf(f) { return f ? { go: f.go, cat: f.cat || null, pill: f.pill || null, say: f.say || null, fid: f.id, fnLines: f.lines || null } : { go: null, cat: null, pill: null, say: null, fid: null, fnLines: null }; }
  function linkKeys(L, T) {
    const keys = FX.keysOf(L.objects || []), all = keys.slice();
    (L.objects || []).forEach((o, i) => { const c = (T.objects || {})[o.type]; if (c && c.part) all.push(FX.partKey(keys[i])); });
    return { keys, all };
  }
  function spots(L, table, frameOf, assetOf, opt) {
    const T = table || {}, out = [], O = opt || {};
    const K = linkKeys(L, T), map = FX.resolve(K.all, O.links);
    (L.objects || []).forEach((o, i) => {
      if (o.px == null || !o.size) return;
      const key = K.keys[i];
      const conf = Object.assign({}, T.DEFAULT || {}, (T.objects || {})[o.type] || {}, fnConf(FX.get(map[key])));
      const rect = [o.px, o.py, o.size[0], o.size[1]];
      const s = { id: o.id || o.type + '_' + i, key, type: o.type, kind: 'obj', rect, o, layer: o.layer || null, conf, lamp: conf.fx === 'lamp' ? o.type : null };
      out.push(s);
      const wp = T.WATER_PLANT, pa = wp && wp.on === o.type && assetOf ? assetOf(wp.stages[0].sprite) : null;
      if (pa && pa.px != null && pa.size) // 물 화분 (sink_v 안): 클릭만 (Space는 싱크대 = 물 +1)
        out.push({ id: s.id + '_plant', type: 'waterplant', kind: 'part', rect: [pa.px, pa.py, pa.size[0], pa.size[1]], o, layer: o.layer || null, conf: { fx: 'none', plant: true, clickOnly: true }, lamp: null, parent: s.id });
      const pk = FX.partKey(key), pf = FX.get(map[pk]);
      if (conf.part && conf.part.y0 > 0 && conf.part.y0 < 1 && (pf || O.all)) { // 그림 아래쪽 일부 (기본: 하단장·서랍 = 인벤토리). 클릭·Space 모두 이 칸이 먼저. 기능이 없으면 본체와 같음(칸 안 만듦)
        const y = o.py + Math.round(o.size[1] * conf.part.y0);
        out.push({ id: s.id + '_part', key: pk, type: o.type, kind: 'part', rect: [o.px, y, o.size[0], o.py + o.size[1] - y], o, layer: o.layer || null,
          conf: Object.assign({}, conf, { fx: conf.part.fx || 'none', part: null, lampPart: null, lines: null, spaceOverDubu: false }, fnConf(pf)), lamp: null, parent: s.id });
      }
      if (conf.lampPart && frameOf) {
        const b = letterBox(frameOf(o.sprite), LAMP);
        if (b) {
          const r = [o.px + b[0] - 2, o.py + b[1] - 2, b[2] + 4, b[3] + 4];
          out.push({ id: s.id + '_lamp', type: o.type, kind: 'part', rect: r, o, layer: o.layer || null, conf: Object.assign({}, conf, fnConf(null), { fx: 'lamp', lines: conf.lampPart.lines, onlyOn: conf.lampPart.onlyOn }), lamp: o.type, parent: s.id });
        }
      }
    });
    Object.keys(L.outside || {}).forEach((k) => {
      const a = L.outside[k], p = a && a.px; if (!p) return;
      const conf = Object.assign({}, T.DEFAULT || {}, (T.objects || {})[k] || {}, fnConf(null));
      out.push({ id: 'area_' + k, type: k, kind: 'area', rect: [p[0], p[1], p[2] - p[0], p[3] - p[1]], o: null, layer: 'area', conf, lamp: null });
    });
    return out;
  }
  const inRect = (r, x, y) => x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3];
  function overlap(r, q) {
    const w = Math.min(r[0] + r[2], q[0] + q[2]) - Math.max(r[0], q[0]), h = Math.min(r[1] + r[3], q[1] + q[3]) - Math.max(r[1], q[1]);
    return w > 0 && h > 0 ? w * h : 0;
  }
  // 그리는 순서의 반대 (앞에 그려진 것 먼저): 조명 부분 > 일반 물건(아랫변 큰 것 먼저) > 벽 물건 > 바닥 물건 > 집 밖 구역
  function rank(s) { return s.kind === 'part' ? 0 : s.kind === 'area' ? 4 : s.layer === 'floor' ? 3 : s.layer === 'wall' ? 2 : 1; }
  // 클릭 판정 (캔버스 px). opaque(spot, x, y) = 그 자리에 그림이 칠해져 있는지 (투명한 테두리는 안 누름). 구역은 범위만
  function hitAt(list, x, y, opaque) {
    const c = list.filter((s) => inRect(s.rect, x, y) && (s.kind !== 'obj' || !opaque || opaque(s, x, y)));
    c.sort((a, b) => rank(a) - rank(b) || (b.rect[1] + b.rect[3]) - (a.rect[1] + a.rect[3]));
    return c[0] || null;
  }
  // 제작자이 마주 본 물건 (Space): 바라보는 칸(16x16)과 겹치는 물건. 그 칸이 벽(못 걷는 칸)이고 겹치는 게 없으면 한 칸 더 (벽에 걸린 액자·시계)
  //   바닥 물건(카펫)은 서 있는 칸과 겹쳐도 됨. 고르기: 조명 부분 > 겹친 넓이 큰 것 > 작은 물건
  function faceTarget(list, grid, me, T) {
    const t = T || 16, d = DIRS[me.face] || DIRS.down, walk = (x, y) => y >= 0 && y < grid.length && x >= 0 && x < grid[0].length && !grid[y][x];
    const tileRect = (x, y) => [x * t, y * t, t, t];
    const usable = list.filter((s) => s.kind !== 'area' && !s.conf.clickOnly);
    const best = (rect, filter) => {
      const c = usable.filter(filter || (() => true)).map((s) => ({ s, a: overlap(s.rect, rect) })).filter((h) => h.a > 0);
      // 순서: 부분(조명 등) > 다른 물건 위에 놓인 것(layout on, 예: 주방장 위 정수기 v11~) > 겹친 넓이 > 작은 것
      const onTop = (s) => (s.o && s.o.on ? 0 : 1);
      // (logs 2026-10-04) 바닥에 깔린 것(카펫, layer floor)은 가구 뒤로: 2인 테이블 아래 칸을 보고 Space를 누르면 페르시안 러그가 아니라 테이블
      const floorLast = (s) => (s.layer === 'floor' ? 1 : 0);
      c.sort((p, q) => (p.s.kind === 'part' ? 0 : 1) - (q.s.kind === 'part' ? 0 : 1) || floorLast(p.s) - floorLast(q.s) || onTop(p.s) - onTop(q.s) || q.a - p.a || p.s.rect[2] * p.s.rect[3] - q.s.rect[2] * q.s.rect[3]);
      return c.length ? c[0].s : null;
    };
    const fx = me.x + d[0], fy = me.y + d[1];
    let hit = best(tileRect(fx, fy));
    if (!hit && !walk(fx, fy)) hit = best(tileRect(fx + d[0], fy + d[1]), (s) => s.layer === 'wall');
    if (!hit) hit = best(tileRect(me.x, me.y), (s) => s.layer === 'floor');
    return hit;
  }
  // 바닥 물건 클릭이 반응하는 때: 제작자 칸이 그 물건과 겹치거나 바로 옆(대각선 포함)
  function nearFloor(s, me, T) {
    const t = T || 16;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (overlap(s.rect, [(me.x + dx) * t, (me.y + dy) * t, t, t]) > 0) return true;
    return false;
  }

  // ---- 날짜 ----
  const DAY = 86400000;
  const logDate = (now, startHour) => LL.logDay(now, startHour);
  function addDays(ymd, n) { const d = Md.dateOf(ymd); return LL.ymd(new Date(d + n * DAY + 12 * 3600000).setHours(0, 0, 0, 0)); }
  function weekStart(ymd) { const d = new Date(Md.dateOf(ymd)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return LL.ymd(d.getTime()); }

  // ---- B 물 화분 ----
  function waterStage(n, stages) {
    const st = (stages || []).slice().sort((a, b) => b.min - a.min).find((s) => (n || 0) >= s.min);
    return st ? st.id : 'base';
  }
  // 오늘 물 칸 수: 습관 기록 표에서 date 줄의 물 n/6 (없으면 0)
  function waterOn(data, habit, date) {
    const r = ((data && data.records) || []).find((x) => Md.dateOf(x.date) === Md.dateOf(date));
    const it = r && r.items.find((i) => i.name === habit && i.of);
    return { n: it ? it.value : 0, of: it ? it.of : (slotsOf(data, habit) || 6) };
  }
  function slotsOf(data, habit) { const h = data && data.habits && data.habits.rows.find((r) => r.name === habit); return h ? h.slots : 0; }

  // ---- 이번 주 칸 습관 (생활습관 표의 목표 중 주기 "주 N회") ----
  //   [{ name, n(이번 주 한 날 수), of(N) }]. 주 = 월요일부터 (간트와 같음), 날짜 = 하루 경계 적용한 오늘
  function weekly(data, date) {
    const rows = ((data && data.habits && data.habits.rows) || []).filter((r) => r.kind === '목표').map((r) => ({ name: r.name, m: /주\s*(\d+)\s*회/.exec(r.cycle || '') })).filter((r) => r.m); // 안전장치(주 1회 확인)는 빼고
    const ws = Md.dateOf(weekStart(date)), we = ws + 7 * DAY;
    return rows.map((r) => {
      const days = new Set();
      ((data && data.records) || []).forEach((rec) => { const d = Md.dateOf(rec.date); if (d != null && d >= ws && d < we && rec.items.some((i) => i.name === r.name)) days.add(d); });
      return { name: r.name, n: days.size, of: Number(r.m[1]) };
    });
  }

  // ---- A 약속 ----
  // 오늘(하루 경계 적용)·내일 약속. 시간 순 (시각을 못 읽으면 적힌 순서대로 뒤에)
  function timeKey(s) {
    const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|시)?/i.exec(String(s || '')); if (!m) return 9999;
    let h = Number(m[1]); const ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
    if (/오후|저녁|밤/.test(s) && h < 12) h += 12;
    return h * 60 + Number(m[2] || 0);
  }
  function meetingsFor(data, date) {
    const list = (data && data.meetings) || [];
    const on = (ymd) => list.filter((m) => Md.dateOf(m.date) === Md.dateOf(ymd) && String(m.text || '').trim()).map((m, i) => Object.assign({ i }, m)).sort((a, b) => timeKey(a.time) - timeKey(b.time) || a.i - b.i);
    return { today: on(date), tomorrow: on(addDays(date, 1)) };
  }

  // ---- C 하루 마감 카드: 한 것만 ----
  //   data = PHLifeMd.parse 결과, log = PHLifeLog.parse 결과(잠·식사·한마디). 줄 = [{ key, label, text }]
  function dayCard(data, log, date, opt) {
    const o = opt || {}, out = [];
    const w = waterOn(data, o.waterHabit || '물', date);
    if (w.n > 0) out.push({ key: 'water', label: o.waterHabit || '물', text: w.n + '/' + w.of });
    weekly(data, date).forEach((h) => { if (h.n > 0) out.push({ key: 'weekly', label: h.name, text: '이번 주 ' + h.n + '/' + h.of }); });
    const day = log ? LL.dayOf(log, date) : null;
    if (day && day.sleep && (day.sleep.bed || day.sleep.wake)) out.push({ key: 'sleep', label: '잠', text: (LL.fmtTime(day.sleep.bed) || '?') + ' ~ ' + (LL.fmtTime(day.sleep.wake) || '?') });
    if (day) {
      const kinds = LL.MEALS.filter((k) => (k === LL.MULTI_MEAL ? day.meals[k].length : day.meals[k]));
      if (kinds.length) out.push({ key: 'meal', label: '식사', text: kinds.join(' · ') });
      const moods = day.notes.map((n) => n.mood).filter(Boolean), texts = day.notes.filter((n) => n.text);
      if (moods.length) out.push({ key: 'mood', label: '기분', text: moods.join(' · ') });
      if (texts.length) out.push({ key: 'note', label: '한마디', text: texts[texts.length - 1].text + (texts.length > 1 ? ' 외 ' + (texts.length - 1) : '') });
    }
    return out;
  }
  // 오늘 한마디나 기분이 있는지 (하루 마감에서 "한마디 남길게 / 그냥 잘게"를 물을지)
  function hasNote(log, date) { const day = log ? LL.dayOf(log, date) : null; return !!(day && day.notes.length); }

  function fill(s, v) { return String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)); }

  const IL = { linkKeys, fnConf, spots, hitAt, faceTarget, nearFloor, overlap, letterBox, nearestLight, logDate, addDays, weekStart, waterStage, waterOn, weekly, meetingsFor, timeKey, dayCard, hasNote, fill, DIRS };
  root.PHInteractLogic = IL;
  if (typeof module !== 'undefined' && module.exports) module.exports = IL;
})(typeof window !== 'undefined' ? window : globalThis);
