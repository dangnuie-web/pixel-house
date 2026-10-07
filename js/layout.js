// 배치 표 (위에서 내려다본 전개도 한 장). pixel-office layout.js와 같은 역할.
// 정본 = 무늬 배치표 (디자인/에셋/..._layout_vNN.json). scripts/sync_assets.py가 최신판을 js/house_data.js(PH_LAYOUT_DATA)로 옮긴다.
// 이 파일은 그 위에 비트 규칙만 얹는다. 무늬 배치가 바뀌면 sync만 다시 돌리면 되고, 여기는 규칙이 안 맞을 때만 고친다.
//   캔버스 크기 = rows 칸 수 x 16 (지금 v04 30 x 27 = 480 x 432)
//   v04 형식: 물건마다 px, py(그림 왼쪽 위), size [w, h], file, room, layer('floor'·'wall'·'outside'면 안 막음), frame(여러 장)
(function (root) {
  'use strict';
  const D = root.PH_LAYOUT_DATA;
  if (!D) throw new Error('PH_LAYOUT_DATA 없음: python3 scripts/sync_assets.py 를 먼저 돌려 주세요');
  const T = D.tile || 16;
  // legend (무늬): '#' 벽, '.' 바닥, 'd' 문턱, 'e' 대문(못 걸음, 입장 때 열림), '-' 집 밖(그림만, 못 걸음). (옛 '='도 벽처럼)
  const WALKABLE = '.d';

  // 막힘 규칙 (비트, 시험으로 확인: tests/test_world.js)
  //   1. layer(floor·wall·outside) = 안 막음. 의자(chair*) = 안 막음 (오피스 cafechair처럼 막힘은 테이블이 줌)
  //   2. 나머지 물건 = 칸 가운데가 그림의 아래쪽 2/3 안이면 막힘 (무늬 v04 blocked_check와 같은 기준. 위쪽 1/3은 벽에 기대 솟은 부분)
  //      무늬 blocked_check와 다른 칸은 의자 자리뿐 (가이드 v04 7장 "다르면 앱 쪽을 따름")
  const PASS = (o) => !!(o.layer || o.floor || o.wall || o.outside || o.block === false || /^chair/.test(o.type));
  function blockRect(o) {
    const s = o.size; if (!s || o.px == null) return null;
    const top = o.py + Math.floor(s[1] / 3), bot = o.py + s[1]; // 무늬 blocked_check와 같게 1/3을 정수로 내림
    const x1 = Math.ceil((o.px - 8) / T), x2 = Math.ceil((o.px + s[0] - 8) / T) - 1; // 칸 가운데(x*16+8)가 [px, px+w) 안
    const y1 = Math.ceil((top - 8) / T), y2 = Math.ceil((bot - 8) / T) - 1;           // 칸 가운데가 [top, bottom) 안
    return x2 >= x1 && y2 >= y1 ? [x1, y1, x2 - x1 + 1, y2 - y1 + 1] : null;
  }
  const objects = D.objects.map((src, i) => {
    const o = Object.assign({}, src, { id: src.type + '_' + i });
    if (!o.layer) o.layer = o.floor ? 'floor' : o.wall ? 'wall' : o.outside ? 'outside' : null;
    if (o.layer === 'outside') o.layer = null; // 그리기: 집 밖 물건(나무·꽃)은 캐릭터와 같이 아랫변 순서로 (가이드 7장)
    o.block = PASS(src) ? false : (blockRect(o) || false);
    return o;
  });

  // 공용 집(2026-10-08 원룸): 방이 칸 범위(x1..y2)가 아니라 px 상자 [x1, y1, x2, y2]로 옴 -> 칸 가운데가 든 방 (뒤에 적힌 방이 이김: 방이 현관과 겹치는 마루 끝)
  //   칸 지도 roomGrid (world.js roomAt이 먼저 봄). 방 범위 x1..y2도 채워 둠 (방 이름표·시험용, 겹치는 칸은 roomGrid가 정함)
  let roomGrid = null;
  const rooms = (D.rooms || []).map((r) => {
    if (!Array.isArray(r.px)) return r;
    const [a, b, c, d] = r.px, cx = (x) => x * T + T / 2;
    let x1 = Infinity, y1 = Infinity, x2 = -1, y2 = -1;
    for (let y = 0; y < D.rows.length; y++) for (let x = 0; x < D.rows[0].length; x++) if (cx(x) >= a && cx(x) <= c && cx(y) >= b && cx(y) <= d) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
    return Object.assign({}, r, { x1, y1, x2, y2 });
  });
  if (rooms.some((r, i) => Array.isArray((D.rooms[i] || {}).px))) {
    roomGrid = D.rows.map((row, y) => row.split('').map((ch, x) => {
      let id = null; rooms.forEach((r, i) => { const p = D.rooms[i].px; if (p && x * T + T / 2 >= p[0] && x * T + T / 2 <= p[2] && y * T + T / 2 >= p[1] && y * T + T / 2 <= p[3]) id = r.id; });
      return id;
    }));
  }

  root.PH_LAYOUT = {
    T, rows: D.rows, legend: D.legend, rooms, roomGrid, outside: D.outside, objects, WALKABLE,
    wallSlots: D.wall_slots || null, slots: D.slots || null, // 공용 집: 벽 메모지 자리(js/memo_wall.js), 가구 자리(js/house_slots.js)
    w: D.rows[0].length, h: D.rows.length, W: D.rows[0].length * T, H: D.rows.length * T, // 캔버스 크기는 여기 한 곳
    roam: D.roam, spawn: D.spawn, lights: D.lights, entryPath: D.entry_path, blockedCheck: D.blocked_check, source: D._file,
    start: 'genkan',
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PH_LAYOUT;
})(typeof window !== 'undefined' ? window : globalThis);
