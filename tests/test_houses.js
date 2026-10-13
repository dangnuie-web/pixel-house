// 공용 집 세 채 (원룸 v03·투룸·쓰리룸, 무늬 디자인/20261008_pixel-house_공용판투룸쓰리룸_v01.md 7절 8번): 현관에서 모든 방에 걸어갈 수 있는지, 벽을 뚫는 칸이 없는지
//   걷는 칸 = js/layout.js 규칙 그대로 (rows '.'·'d' + 물건 막힘). 시작 = 현관문(spawn.gate) 바로 위 칸
//   벽 뚫림 = 다른 방 바닥 칸끼리 맞닿았는데 둘 다 문 칸('d')이 아니고 현관(트인 마루)도 아닌 곳 (원룸 v02 욕실 동쪽 벽 버그 같은 것)
'use strict';
process.env.PH_PROFILE = process.env.PH_PROFILE || 'default'; // 공용 묶음 설정 (제작자 묶음이 ART_SETS를 덮지 않게)
const path = require('path');
let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  O ' + name); } else { fail++; console.log('  X ' + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); } }
require('../js/house_rooms.js');
const SETS = globalThis.PH_DATA_SETS, S = require('../js/data/settings.js');
const LAYOUT = path.join(__dirname, '..', 'js', 'layout.js');
const WANT = { room1: [256, 240], room2: [336, 256], room3: [384, 320] };
ok('공용 집 세 채 묶음 + 설정 ART_SETS (room1·room2·room3)', ['room1', 'room2', 'room3'].every((h) => SETS[h] && SETS[h].PH_LAYOUT_DATA && S.ART_SETS[h]), Object.keys(SETS));
require('../js/assets_rooms.js');
const ART = globalThis.PH_ASSET_SETS;
for (const h of Object.keys(WANT)) { const e = ART[h] && ART[h].entrance; ok(h + ': 입장 그림 entrance_' + h + ' (384x256, 2장, door_zone·button_zone·밤 팔레트)', !!e && e.file.includes('entrance_' + h + '_') && e.frames.length === 2 && e.frames[0][0].length === 384 && e.frames[0].length === 256 && !!e.door_zone && !!e.button_zone && !!e.palette_night, e && e.file); }
for (const h of Object.keys(WANT)) {
  globalThis.PH_LAYOUT_DATA = JSON.parse(JSON.stringify(SETS[h].PH_LAYOUT_DATA));
  delete require.cache[require.resolve(LAYOUT)];
  const L = require(LAYOUT);
  ok(h + ': 캔버스 ' + WANT[h].join('x') + ' (' + L.source + ')', L.W === WANT[h][0] && L.H === WANT[h][1], [L.W, L.H]);
  const blocked = new Set();
  L.objects.forEach((o) => { const b = o.block; if (!b) return; for (let y = b[1]; y < b[1] + b[3]; y++) for (let x = b[0]; x < b[0] + b[2]; x++) blocked.add(x + ',' + y); });
  const walk = (x, y) => y >= 0 && y < L.h && x >= 0 && x < L.w && L.WALKABLE.includes(L.rows[y][x]) && !blocked.has(x + ',' + y);
  const room = (x, y) => (L.roomGrid ? L.roomGrid[y][x] : null);
  const g = L.spawn.gate, start = [g.x, g.y - 1];
  ok(h + ': 시작 칸(현관문 위) = 걷는 칸·현관', walk(...start) && room(...start) === 'genkan', [start, room(...start)]);
  const seen = new Set([start.join()]), q = [start];
  while (q.length) { const [x, y] = q.shift(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const k = (x + dx) + ',' + (y + dy); if (!seen.has(k) && walk(x + dx, y + dy)) { seen.add(k); q.push([x + dx, y + dy]); } }); }
  const reached = new Set([...seen].map((k) => { const [x, y] = k.split(',').map(Number); return room(x, y); }));
  const ids = L.rooms.map((r) => r.id);
  ok(h + ': 현관에서 모든 방에 걸어감 (' + ids.join('·') + ', 닿는 칸 ' + seen.size + ')', ids.every((id) => reached.has(id)), { ids, reached: [...reached] });
  const leaks = [];
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    if (!L.WALKABLE.includes(L.rows[y][x])) continue;
    [[1, 0], [0, 1]].forEach(([dx, dy]) => {
      const x2 = x + dx, y2 = y + dy; if (y2 >= L.h || x2 >= L.w || !L.WALKABLE.includes(L.rows[y2][x2])) return;
      const a = room(x, y), b = room(x2, y2); if (!a || !b || a === b || a === 'genkan' || b === 'genkan') return;
      if (L.rows[y][x] === 'd' || L.rows[y2][x2] === 'd') return;
      leaks.push([x, y, a, x2, y2, b]);
    });
  }
  ok(h + ': 벽 뚫린 곳 없음 (다른 방 바닥이 문 없이 맞닿은 칸)', leaks.length === 0, leaks.slice(0, 5));
}
// 후보 바꿈 swap (무늬 공용판집다듬기 v01 3절, 2026-10-13): 투룸·쓰리룸 식탁 자리 둥근 식탁 <-> 둥근 탁자
//   둥근 탁자 = 의자(chair_a·b) 빼고 방석(cushion_table_a·b) 더함, 다시 둥근 식탁 = 의자만. 둘이 같이 안 나옴 + 걷는 칸 수 같음
const HSL = require('../js/house_slots.js');
for (const h of ['room2', 'room3']) {
  const at = (pick, noSwap) => {
    const D = JSON.parse(JSON.stringify(SETS[h].PH_LAYOUT_DATA));
    if (noSwap) D.slots.forEach((sl) => (sl.candidates || []).forEach((c) => { delete c.swap; }));
    HSL.apply(D, ART[h], { table: pick });
    globalThis.PH_LAYOUT_DATA = D; delete require.cache[require.resolve(LAYOUT)];
    const L = require(LAYOUT), types = L.objects.map((o) => o.type);
    const blocked = new Set();
    L.objects.forEach((o) => { const b = o.block; if (!b) return; for (let y = b[1]; y < b[1] + b[3]; y++) for (let x = b[0]; x < b[0] + b[2]; x++) blocked.add(x + ',' + y); });
    let walk = 0; for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.WALKABLE.includes(L.rows[y][x]) && !blocked.has(x + ',' + y)) walk++;
    const t = L.objects.find((o) => o.slot === 'table');
    return { chairs: types.filter((x) => /^chair_[ab]$/.test(x)).length, cushions: types.filter((x) => /^cushion_table_[ab]$/.test(x)).length, walk, table: t && t.sprite, cushionArt: L.objects.filter((o) => /^cushion_table_/.test(o.type)).every((o) => !!ART[h][o.sprite]) };
  };
  const big = at('roundtable_m'), small = at('roundtable'), back = at('roundtable_m'), smallOld = at('roundtable', true);
  ok(h + ': 둥근 식탁 = 의자 2·방석 0 / 둥근 탁자 = 의자 0·방석 2(그림 있음) / 다시 식탁 = 의자 2·방석 0', big.table === 'roundtable_m' && big.chairs === 2 && big.cushions === 0 && small.table === 'roundtable' && small.chairs === 0 && small.cushions === 2 && small.cushionArt && back.chairs === 2 && back.cushions === 0, { big, small, back });
  // 걷는 칸: 의자·방석은 둘 다 막지 않아 바꿈 전후 같음 (탁자 크기 차이로 생기는 칸 차이는 전부터 그대로). 다시 식탁 = 처음과 같음
  ok(h + ': 의자 -> 방석 바꿈으로 걷는 칸 수 안 바뀜 (둥근 탁자 ' + small.walk + ' = 바꿈 없던 때 ' + smallOld.walk + ', 식탁 ' + big.walk + ' -> 다시 ' + back.walk + ')', small.walk === smallOld.walk && big.walk === back.walk, { big: big.walk, small: small.walk, smallOld: smallOld.walk, back: back.walk });
}
console.log(`test_houses: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
