// 그림 없는 계산만: 막힌 칸, 길 찾기, 문, 대사 고르기, 시간대, 방문 종류. Node 시험(tests/test_world.js)에서도 쓴다.
(function (root) {
  'use strict';

  // 막힌 칸 표 (true = 못 감). 걸을 수 있는 글자(L.WALKABLE, 기본 '.d') 밖은 모두 막힘 ('#' '=' 'e' '-')
  // 물건: block = [x, y, w, h] 막는 칸 (layout.js가 정함) / false = 안 막음 / 생략 = 차지 칸 (오피스 기본)
  function grid(L) {
    const ok = L.WALKABLE || '.d';
    const g = L.rows.map((r) => r.split('').map((ch) => ok.indexOf(ch) < 0));
    L.objects.forEach((o) => {
      if (o.layer || o.block === false) return;
      const b = Array.isArray(o.block) ? o.block : [o.x, o.y, o.w, o.h];
      for (let y = b[1]; y < b[1] + b[3]; y++) for (let x = b[0]; x < b[0] + b[2]; x++) if (g[y] && x >= 0 && x < g[y].length) g[y][x] = true;
    });
    return g;
  }
  // 입장 단계 순서. afterFade = 두부가 다 밝아진 뒤 나타남(무늬 가이드 v03 3장): 'fade' 단계를 두부 등장 앞으로 옮긴다
  //   false = 부기 원고 v02 순서 그대로 (어둠 속 인사 -> 밝아짐)
  function orderIntro(steps, afterFade) {
    if (!afterFade) return steps.slice();
    const fade = steps.filter((s) => s.cue === 'fade'), rest = steps.filter((s) => s.cue !== 'fade');
    const at = rest.findIndex((s) => s.cue === 'dubuAppear');
    return at < 0 ? fade.concat(rest) : rest.slice(0, at).concat(fade, rest.slice(at));
  }
  function walkable(g, x, y) { return y >= 0 && y < g.length && x >= 0 && x < g[0].length && !g[y][x]; }
  // 칸이 속한 공간 id (문·벽 칸은 null)
  function roomAt(L, x, y) {
    if (L.roomGrid) return (L.roomGrid[y] && L.roomGrid[y][x]) || null; // 공용 집: 칸 지도 (layout.js, 방이 px 상자로 옴)
    const r = L.rooms.find((q) => x >= q.x1 && x <= q.x2 && y >= q.y1 && y <= q.y2); return r ? r.id : null;
  }

  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  // 너비 우선 길 찾기. 칸 목록(시작 칸 제외)을 돌려준다. 못 가면 null
  function findPath(g, sx, sy, tx, ty) {
    if (!walkable(g, tx, ty)) return null;
    if (sx === tx && sy === ty) return [];
    const key = (x, y) => y * 1000 + x;
    const prev = new Map([[key(sx, sy), null]]);
    const q = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const d of ['up', 'down', 'left', 'right']) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (!walkable(g, nx, ny) || prev.has(key(nx, ny))) continue;
        prev.set(key(nx, ny), [x, y]);
        if (nx === tx && ny === ty) {
          const out = []; let c = [nx, ny];
          while (c && !(c[0] === sx && c[1] === sy)) { out.unshift({ x: c[0], y: c[1] }); c = prev.get(key(c[0], c[1])); }
          return out;
        }
        q.push([nx, ny]);
      }
    }
    return null;
  }
  function faceOf(dx, dy) { return dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down'; }

  // 대사 한 줄: "(연출) 말" -> { act, say }. 괄호는 화면에 띄우지 않는다 (부기 원고 "쓰는 법")
  function parseLine(item) {
    const raw = typeof item === 'string' ? item : (item.text || item.say || '');
    let act = (item && typeof item === 'object' && item.act) || '';
    const say = String(raw).replace(/\(([^)]*)\)/g, (m, a) => { act = act ? act + ' / ' + a.trim() : a.trim(); return ''; }).replace(/\s+/g, ' ').trim();
    return { act, say, needs: (item && item.needs) || null };
  }
  // 묶음에서 무작위 하나. 바로 앞에 나온 것(lastIdx)은 다시 고르지 않음. ok(item) = 쓸 수 있는지
  function pick(list, lastIdx, rnd, ok) {
    const idx = list.map((_, i) => i).filter((i) => (!ok || ok(list[i])) && !(list[i] && list[i].spare));
    const pool = idx.length > 1 ? idx.filter((i) => i !== lastIdx) : idx;
    if (!pool.length) return -1;
    return pool[Math.floor((rnd || Math.random)() * pool.length)];
  }

  // 시간대 (settings.TIME_BANDS). from > to 이면 자정을 넘는 구간
  function timeBand(hour, bands) {
    for (const b of bands) {
      if (b.from <= b.to ? (hour >= b.from && hour < b.to) : (hour >= b.from || hour < b.to)) return b.id;
    }
    return bands[0].id;
  }
  function sameLocalDay(a, b) {
    const x = new Date(a), y = new Date(b);
    return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
  }
  // 밤인지 (settings.DAY_NIGHT, NIGHT_FROM, NIGHT_TO)
  function isNight(hour, settings) {
    if (settings.DAY_NIGHT === 'day') return false;
    if (settings.DAY_NIGHT === 'night') return true;
    const a = settings.NIGHT_FROM, b = settings.NIGHT_TO;
    return a <= b ? (hour >= a && hour < b) : (hour >= a || hour < b);
  }
  // 방문 종류: 'first'(처음) / 'sameDay'(오늘 이미 옴) / 'long'(오랜만) / 'normal'(시간대 인사)
  function visitKind(now, last, settings) {
    if (!last || !isFinite(last)) return 'first';
    if (sameLocalDay(now, last)) return 'sameDay';
    if (now - last >= settings.LONG_ABSENCE_DAYS * 86400000) return 'long';
    return 'normal';
  }
  // 다시 왔을 때 인사 묶음 고르기 -> lines 안 경로
  function greetGroup(kind, hour, settings) {
    if (kind === 'sameDay') return ['back', 'sameDay'];
    if (kind === 'long') return ['back', 'long'];
    return ['time', timeBand(hour, settings.TIME_BANDS)];
  }

  root.PHWorld = { grid, walkable, roomAt, orderIntro, findPath, faceOf, DIRS, parseLine, pick, timeBand, isNight, sameLocalDay, visitKind, greetGroup };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PHWorld;
})(typeof window !== 'undefined' ? window : globalThis);
