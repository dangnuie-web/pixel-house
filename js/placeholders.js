// 임시 그림 (무늬 진짜 에셋이 오기 전까지). 전개도(위에서 내려다본 모습) 기준. 색은 js/data/palette.js(무늬 아이콘 메모 팔레트, 최신 판 v02)만 쓴다.
// 같은 이름의 무늬 에셋이 assets_data.js에 들어오면 sprites.js가 그쪽을 먼저 쓰므로, 여기는 지우지 않아도 된다.
//   PH_TEMP_SPRITES: 문자 맵 (에셋과 같은 형식). 두부 고양이 (메모 "고양이 규칙" 1~8 따름)
//   PH_TEMP_DRAW: 가구·배경 그리기 함수 (ctx, X, Y, W, H, t) — X, Y, W, H는 차지 영역 px
(function (root) {
  'use strict';
  const P = root.PH_PAL;

  // ---------- 두부 (16 x 16) ----------
  // 정면: 귀 안·코 분홍, 눈 세로 1x2, 목걸이(임시 그림은 예전 주황 모양 5x3), 꼬리는 몸과 1칸 떼고 오른쪽
  const FRONT = [
    '................',
    '...A.......A....',
    '..ApA.....ApA...',
    '..ApCAAAAACpA...',
    '..ACCCCCCCCCA...',
    '..ACCACCCACCA...',
    '..ACCACpCACCA...',
    '..AcCCCCCCCcA...',
    '...AccCCCccA....',
    '...ACOCCCOCA..A.',
    '...ACOOoOOCA.ACA',
    '...ACOCCCOcA.ACA',
    '...ACCCCCCcA.ACA',
    '...ACCCCCCcAAcA.',
    '...ACCACCAcAAA..',
    '....AAAAAAAA....',
  ];
  const FRONT_TAIL2 = FRONT.slice(); // 꼬리 끝 살짝 내림 (대기 2번 장)
  FRONT_TAIL2[9] = '...ACOCCCOCA....';
  FRONT_TAIL2[10] = '...ACOOoOOCA..A.';
  const BACK = [
    '................',
    '...A.......A....',
    '..ACA.....ACA...',
    '..ACCAAAAACCA...',
    '..ACCCCCCCCCA...',
    '..ACCCCCCCCCA...',
    '..ACCCCCCCCCA...',
    '..AcCCCCCCCcA...',
    '...AcCCCCCcA....',
    '...ACCCACCcA....',
    '...ACCAcACcA....',
    '...ACCAcACcA....',
    '...ACCAcACcA....',
    '...ACCAcACcA....',
    '...ACCCACCcA....',
    '....AAAAAAAA....',
  ];
  // 옆(왼쪽 보기): 머리 7칸, 코는 보는 쪽 눈 아래, 꼬리는 머리와 떼어 세움
  const SIDE = [
    '................',
    '................',
    '..A..A..........',
    '.ApAApA.....A...',
    '.ACCCCCA...ACA..',
    'ACACCCCA...ACA..',
    'ApACCCCA...ACA..',
    '.AccCCcAAAAACA..',
    '..AOoOCCCCCCCA..',
    '..ACOCCCCCCCcA..',
    '..ACCCCCCCCCcA..',
    '..AcCCCCCCCccA..',
    '...ACAAAAACA....',
    '...ACA...ACA....',
    '...ACA...ACA....',
    '...AAA...AAA....',
  ];
  // 걷기 3장 = 0 한 발, 1 선 자세, 2 다른 발 (pixel-office 걷기 규칙과 같음)
  function legs(base, rows) { const f = base.slice(); Object.keys(rows).forEach((i) => { f[i] = rows[i]; }); return f; }
  const lift = (f) => f.slice(1).concat([f[f.length - 1]]).map((r, i, a) => (i === a.length - 1 ? '................' : r));
  const WALK_DOWN = [
    legs(lift(FRONT), { 14: '....AAAAAAA.....' }),
    FRONT,
    legs(lift(FRONT), { 14: '.....AAAAAAA....' }),
  ];
  const WALK_UP = [
    legs(lift(BACK), { 14: '....AAAAAAA.....' }),
    BACK,
    legs(lift(BACK), { 14: '.....AAAAAAA....' }),
  ];
  const WALK_LEFT = [
    legs(SIDE, { 13: '..ACA.....ACA...', 14: '.ACA.......ACA..', 15: '.AAA.......AAA..' }),
    SIDE,
    legs(SIDE, { 13: '....ACA.ACA.....', 14: '....ACA.ACA.....', 15: '....AAA.AAA.....' }),
  ];
  const TAIL = ['.A.', 'ACA', 'ACA', 'ACA', 'ACA', 'AcA'];
  const pal = Object.assign({ '.': null }, P);
  const sp = (frames) => ({ palette: pal, frames, temp: true });

  root.PH_TEMP_SPRITES = {
    dubu_idle: sp([FRONT, FRONT, FRONT_TAIL2, FRONT]),
    dubu_walk_down: sp(WALK_DOWN),
    dubu_walk_up: sp(WALK_UP),
    dubu_walk_left: sp(WALK_LEFT),
    dubu_tail: sp([TAIL]),
  };

  // ---------- 가구·바닥 (위에서 내려다본 모습) ----------
  // 함수 모양: (ctx, X, Y, W, H, t, frame). X, Y, W, H = 차지 영역 px
  function r(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function box(ctx, x, y, w, h, fill) { r(ctx, x, y, w, h, P.A); if (w > 2 && h > 2) r(ctx, x + 1, y + 1, w - 2, h - 2, fill); }
  function disc(ctx, cx, cy, rad, fill, line) { // 픽셀 원 (테두리 line, 생략 = 먹색)
    for (let dy = -rad; dy <= rad; dy++) {
      const half = Math.round(Math.sqrt(rad * rad - dy * dy));
      r(ctx, cx - half, cy + dy, half * 2, 1, line || P.A);
      const inner = Math.round(Math.sqrt(Math.max(0, (rad - 1) * (rad - 1) - dy * dy)));
      if (Math.abs(dy) < rad && inner > 0) r(ctx, cx - inner, cy + dy, inner * 2, 1, fill);
    }
  }
  function leaves(ctx, cx, cy, n, spread) { // 위에서 본 잎 덩어리
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4, lx = Math.round(cx + Math.cos(a) * spread), ly = Math.round(cy + Math.sin(a) * spread);
      disc(ctx, lx, ly, 3, i % 2 ? P.G : P.g);
    }
    disc(ctx, cx, cy, 3, P.G); r(ctx, cx - 1, cy - 1, 1, 1, P.H);
  }

  const D = {};
  // 바닥 칸 (16x16). 무늬가 같은 이름(16x16) 에셋을 주면 그것을 깐다
  D.floor_wood = function (ctx, X, Y) {
    r(ctx, X, Y, 16, 16, P.W);
    for (let y = 0; y < 16; y += 4) { r(ctx, X, Y + y + 3, 16, 1, P.w); r(ctx, X + ((y / 4) % 2 ? 4 : 12), Y + y, 1, 3, P.w); }
  };
  D.floor_bath = function (ctx, X, Y) { r(ctx, X, Y, 16, 16, P.C); r(ctx, X, Y + 7, 16, 1, P.c); r(ctx, X + 7, Y, 1, 16, P.c); r(ctx, X, Y + 15, 16, 1, P.c); r(ctx, X + 15, Y, 1, 16, P.c); };
  D.floor_kitchen = function (ctx, X, Y) { r(ctx, X, Y, 16, 16, P.h); r(ctx, X, Y, 8, 8, P.S); r(ctx, X + 8, Y + 8, 8, 8, P.S); };
  D.wall = function (ctx, X, Y) { r(ctx, X, Y, 16, 16, P.s); r(ctx, X, Y + 13, 16, 3, P.w); r(ctx, X, Y, 16, 1, P.S); };
  D.stairs = function (ctx, X, Y) { r(ctx, X, Y, 16, 16, P.W); for (let y = 0; y < 16; y += 4) { r(ctx, X, Y + y, 16, 1, P.A); r(ctx, X, Y + y + 1, 16, 1, P.S); } };
  D.door_we = function (ctx, X, Y) { r(ctx, X, Y, 16, 16, P.W); r(ctx, X, Y, 16, 2, P.w); r(ctx, X, Y + 14, 16, 2, P.w); r(ctx, X + 7, Y + 2, 2, 12, P.w); };
  D.door_ns = function (ctx, X, Y) { r(ctx, X, Y, 16, 16, P.W); r(ctx, X, Y, 2, 16, P.w); r(ctx, X + 14, Y, 2, 16, P.w); r(ctx, X + 2, Y + 7, 12, 2, P.w); };

  // 화장실
  D.bathtub = function (ctx, X, Y, W, H) { box(ctx, X + 1, Y + 1, W - 2, H - 2, P.C); box(ctx, X + 4, Y + 4, W - 8, H - 8, P.c); r(ctx, X + W / 2 - 2, Y + 2, 4, 3, P.A); r(ctx, X + 6, Y + 10, 2, 1, P.C); };
  D.basin = function (ctx, X, Y) { box(ctx, X + 1, Y, 14, 13, P.C); disc(ctx, X + 8, Y + 7, 4, P.c); r(ctx, X + 7, Y + 1, 2, 3, P.A); };
  D.toilet = function (ctx, X, Y) { box(ctx, X + 2, Y, 12, 5, P.C); disc(ctx, X + 8, Y + 10, 5, P.C); disc(ctx, X + 8, Y + 10, 3, P.c, P.c); };
  D.mat_bath = function (ctx, X, Y, W) { box(ctx, X + 2, Y + 3, W - 4, 10, P.p); for (let x = X + 4; x < X + W - 4; x += 3) r(ctx, x, Y + 4, 1, 8, P.C); };
  // 주방
  D.kitchen_shelf = function (ctx, X, Y, W) {
    r(ctx, X, Y + 10, W, 3, P.W); r(ctx, X, Y + 13, W, 1, P.A);
    for (let x = X + 2, i = 0; x < X + W - 5; x += 7, i++) { box(ctx, x, Y + 4, 5, 6, i % 2 ? P.C : P.y); r(ctx, x + 1, Y + 4, 3, 1, i % 3 ? P.O : P.G); }
  };
  D.fridge = function (ctx, X, Y, W, H) { box(ctx, X + 1, Y + 1, W - 2, H - 2, P.C); r(ctx, X + 2, Y + 12, W - 4, 1, P.c); r(ctx, X + 11, Y + 5, 1, 5, P.A); r(ctx, X + 11, Y + 16, 1, 8, P.A); r(ctx, X + 4, Y + 4, 3, 2, P.O); r(ctx, X + 5, Y + 18, 2, 2, P.G); };
  D.kitchen_table = function (ctx, X, Y, W, H) {
    for (const [cx, cy] of [[X + W / 2 - 4, Y], [X + W / 2 - 4, Y + H - 8]]) box(ctx, cx, cy, 8, 8, P.w);
    box(ctx, X + 3, Y + 6, W - 6, H - 12, P.W); r(ctx, X + 4, Y + 7, W - 8, 1, P.H);
    disc(ctx, X + 11, Y + 15, 3, P.C); disc(ctx, X + 21, Y + 16, 3, P.C); r(ctx, X + 20, Y + 15, 2, 2, P.O);
  };
  D.kitchen_counter = function (ctx, X, Y, W, H) {
    box(ctx, X, Y + 1, W, H - 1, P.S); r(ctx, X + 1, Y + 2, W - 2, 1, P.h); r(ctx, X, Y + H - 3, W, 3, P.W); r(ctx, X, Y + H - 3, W, 1, P.A);
    box(ctx, X + 4, Y + 3, 14, 9, P.c); r(ctx, X + 10, Y + 3, 2, 3, P.A); // 개수대
    box(ctx, X + 22, Y + 4, 8, 7, P.W); // 도마
    disc(ctx, X + 40, Y + 7, 3, P.w); disc(ctx, X + 52, Y + 7, 3, P.w); // 화구
  };
  // 거실
  D.window_night = function (ctx, X, Y, W) { box(ctx, X + 2, Y + 3, W - 4, 10, P.W); r(ctx, X + 4, Y + 5, W - 8, 6, P.D); r(ctx, X + W - 14, Y + 6, 3, 3, P.Y); r(ctx, X + 10, Y + 7, 1, 1, P.H); r(ctx, X + 22, Y + 6, 1, 1, P.H); r(ctx, X + W / 2 - 1, Y + 4, 2, 8, P.W); };
  D.frame_plant = function (ctx, X, Y) { box(ctx, X + 3, Y + 2, 10, 10, P.W); r(ctx, X + 4, Y + 3, 8, 8, P.H); r(ctx, X + 4, Y + 8, 8, 3, P.G); r(ctx, X + 9, Y + 4, 2, 2, P.Y); };
  D.rug_persian = function (ctx, X, Y, W, H) {
    for (let x = X + 3; x < X + W - 3; x += 2) { r(ctx, x, Y, 1, 2, P.H); r(ctx, x, Y + H - 2, 1, 2, P.H); }
    box(ctx, X + 1, Y + 2, W - 2, H - 4, P.o); r(ctx, X + 4, Y + 5, W - 8, H - 10, P.O);
    r(ctx, X + 6, Y + 7, W - 12, 1, P.Y); r(ctx, X + 6, Y + H - 8, W - 12, 1, P.Y); r(ctx, X + 6, Y + 7, 1, H - 14, P.Y); r(ctx, X + W - 7, Y + 7, 1, H - 14, P.Y);
    const cx = X + W / 2, cy = Y + H / 2;
    for (let i = 0; i < 9; i++) { const c = i % 3 === 0 ? P.D : P.o; r(ctx, cx - i, cy - 9 + i, 2 * i + 1, 1, c); r(ctx, cx - i, cy + 9 - i, 2 * i + 1, 1, c); } // 가운데 마름모 (탁자에 거의 가려짐)
    r(ctx, cx - 4, cy - 1, 9, 3, P.Y); r(ctx, cx - 1, cy - 4, 3, 9, P.Y); r(ctx, cx, cy, 1, 1, P.p);
    for (const [ex, ey] of [[X + 10, Y + 10], [X + W - 13, Y + 10], [X + 10, Y + H - 13], [X + W - 13, Y + H - 13]]) { r(ctx, ex, ey, 3, 3, P.p); r(ctx, ex + 1, ey + 1, 1, 1, P.D); }
  };
  D.mat_entrance = function (ctx, X, Y, W) { box(ctx, X + 2, Y + 3, W - 4, 11, P.S); for (let x = X + 5; x < X + W - 5; x += 4) r(ctx, x, Y + 5, 2, 7, P.s); };
  D.floor_lamp = function (ctx, X, Y) { disc(ctx, X + 8, Y + 11, 3, P.w); disc(ctx, X + 8, Y + 7, 6, P.Y); disc(ctx, X + 8, Y + 7, 3, P.y, P.y); r(ctx, X + 8, Y + 7, 1, 1, P.H); };
  D.sofa = function (ctx, X, Y, W, H) {
    box(ctx, X, Y + 2, W, H - 4, P.S);
    r(ctx, X + 1, Y + 3, W - 2, 7, P.s); r(ctx, X + 1, Y + 3, W - 2, 1, P.h); r(ctx, X + 1, Y + 10, W - 2, 1, P.A); // 등받이
    for (const ax of [X + 1, X + W - 7]) { r(ctx, ax, Y + 3, 6, H - 6, P.W); r(ctx, ax, Y + 3, 6, 1, P.H); } // 팔걸이 나무 덮개
    r(ctx, X + 7, Y + 3, 1, H - 6, P.A); r(ctx, X + W - 8, Y + 3, 1, H - 6, P.A);
    r(ctx, X + W / 2, Y + 11, 1, H - 14, P.s); r(ctx, X + 8, Y + 11, W - 16, 1, P.h); // 방석
    box(ctx, X + 10, Y + 12, 9, 8, P.O); r(ctx, X + 11, Y + 13, 7, 1, P.Y); // 쿠션
    r(ctx, X + 2, Y + H - 2, 2, 2, P.A); r(ctx, X + W - 4, Y + H - 2, 2, 2, P.A);
  };
  D.bookshelf = function (ctx, X, Y, W, H) {
    box(ctx, X, Y + 1, W, H - 2, P.W); r(ctx, X + 1, Y + 2, W - 2, 3, P.H);
    const cols = [P.O, P.G, P.S, P.p, P.D, P.y, P.g, P.C];
    for (let x = X + 2, i = 0; x < X + W - 3; i++) { const bw = 2 + (i % 3); r(ctx, x, Y + 6, bw, 7, cols[i % cols.length]); r(ctx, x + bw, Y + 6, 1, 7, P.A); x += bw + 1; }
  };
  D.coffee_table = function (ctx, X, Y, W, H) { box(ctx, X + 3, Y + 4, W - 6, H - 8, P.W); r(ctx, X + 4, Y + 5, W - 8, 1, P.H); disc(ctx, X + 14, Y + 15, 3, P.O); box(ctx, X + 24, Y + 11, 10, 8, P.C); r(ctx, X + 25, Y + 12, 8, 1, P.D); };
  // 옷방
  D.hanger = function (ctx, X, Y, W) {
    r(ctx, X, Y + 3, W, 2, P.w); r(ctx, X, Y + 5, W, 1, P.A);
    const cols = [P.S, P.O, P.G, P.p, P.D, P.h, P.s, P.y];
    for (let x = X + 2, i = 0; x < X + W - 5; x += 6, i++) { box(ctx, x, Y + 5, 6, 9 + (i % 2) * 2, cols[i % cols.length]); }
  };
  D.drawer = function (ctx, X, Y, W, H) { box(ctx, X + 1, Y + 1, W - 2, H - 2, P.W); for (let y = Y + 12; y < Y + H - 4; y += 11) r(ctx, X + 2, y, W - 4, 1, P.A); for (let y = Y + 6; y < Y + H - 2; y += 11) r(ctx, X + 7, y, 2, 2, P.Y); r(ctx, X + 4, Y + 2, 6, 3, P.C); };
  D.rug_small = function (ctx, X, Y, W, H) { box(ctx, X + 2, Y + 3, W - 4, H - 6, P.S); r(ctx, X + 5, Y + 6, W - 10, H - 12, P.h); r(ctx, X + 5, Y + H / 2, W - 10, 1, P.p); };
  // 침실
  D.tv_cabinet = function (ctx, X, Y, W, H) { box(ctx, X + 1, Y + 2, W - 2, H - 3, P.W); r(ctx, X + W / 2, Y + 3, 1, H - 5, P.A); box(ctx, X + 8, Y, W - 16, 6, P.A); r(ctx, X + 9, Y + 1, W - 18, 3, P.D); r(ctx, X + 4, Y + 8, 3, 3, P.G); };
  D.round_table = function (ctx, X, Y, W, H) { disc(ctx, X + W / 2, Y + H / 2, 11, P.W); disc(ctx, X + W / 2, Y + H / 2, 7, P.W, P.H); disc(ctx, X + W / 2 - 3, Y + H / 2 - 2, 2, P.C); };
  D.chair = function (ctx, X, Y, W, H, t, frame) {
    box(ctx, X + 4, Y + 4, 8, 8, P.W);
    const back = [[X + 4, Y + 2, 8, 3], [X + 4, Y + 11, 8, 3], [X + 11, Y + 4, 3, 8], [X + 2, Y + 4, 3, 8]][frame || 0];
    box(ctx, back[0], back[1], back[2], back[3], P.w);
  };
  D.bed = function (ctx, X, Y, W, H) {
    box(ctx, X, Y, W, H, P.W);
    box(ctx, X + 2, Y + 2, W - 4, H - 18, P.S); r(ctx, X + 3, Y + 3, W - 6, 2, P.h); // 이불
    for (let y = Y + 10; y < Y + H - 20; y += 8) r(ctx, X + 3, y, W - 6, 1, P.s);
    r(ctx, X + 3, Y + H - 22, W - 6, 4, P.h); r(ctx, X + 3, Y + H - 22, W - 6, 1, P.A); // 접힌 이불
    box(ctx, X + 3, Y + H - 15, W / 2 - 4, 10, P.C); box(ctx, X + W / 2 + 1, Y + H - 15, W / 2 - 4, 10, P.C); // 베개 (아래쪽)
    r(ctx, X, Y + H - 4, W, 4, P.w); r(ctx, X, Y + H - 4, W, 1, P.A);
  };
  D.nightstand = function (ctx, X, Y) { box(ctx, X + 2, Y + 2, 12, 12, P.W); disc(ctx, X + 8, Y + 7, 4, P.Y); r(ctx, X + 8, Y + 7, 1, 1, P.y); };
  // 식물 (위에서 본 화분 + 잎)
  D.plant_small = function (ctx, X, Y) { disc(ctx, X + 8, Y + 9, 4, P.o); leaves(ctx, X + 8, Y + 8, 4, 3); };
  D.plant_big = function (ctx, X, Y) { disc(ctx, X + 8, Y + 9, 5, P.o); leaves(ctx, X + 8, Y + 8, 6, 4); };
  D.plant_tall = function (ctx, X, Y) { disc(ctx, X + 8, Y + 9, 5, P.o); leaves(ctx, X + 8, Y + 7, 7, 5); };

  // 입장 화면 (384 x 256): 밤의 작은 집. 무늬가 cover 그림을 주면 그것을 씀
  D.cover = function (ctx) {
    r(ctx, 0, 0, 384, 256, P.D);
    for (const [sx, sy] of [[30, 20], [70, 50], [120, 14], [200, 30], [260, 18], [330, 64], [350, 12], [160, 60], [300, 70]]) r(ctx, sx, sy, 1, 1, P.H);
    disc(ctx, 320, 34, 10, P.Y, P.Y); disc(ctx, 315, 30, 8, P.D, P.D);
    r(ctx, 0, 206, 384, 50, P.g); r(ctx, 0, 206, 384, 1, P.A); r(ctx, 0, 222, 384, 34, P.s); r(ctx, 0, 222, 384, 1, P.A);
    const hx = 112, hy = 96, hw = 160, hh = 112;
    for (let i = 0; i < 40; i++) r(ctx, hx - 10 + i * 2, hy - i, hw + 20 - i * 4, 1, i === 39 ? P.A : (i % 4 === 0 ? P.w : P.o));
    r(ctx, hx - 12, hy, hw + 24, 2, P.A);
    box(ctx, hx, hy + 2, hw, hh - 2, P.h); for (let x = hx + 6; x < hx + hw; x += 8) r(ctx, x, hy + 3, 1, hh - 4, P.H);
    for (const wx of [hx + 14, hx + hw - 50]) { box(ctx, wx, hy + 22, 36, 30, P.W); r(ctx, wx + 3, hy + 25, 30, 24, P.Y); r(ctx, wx + 17, hy + 25, 2, 24, P.W); r(ctx, wx + 3, hy + 36, 30, 2, P.W); box(ctx, wx - 3, hy + 51, 42, 4, P.W); }
    box(ctx, hx + hw / 2 - 14, hy + 54, 28, hh - 54, P.W); r(ctx, hx + hw / 2 - 11, hy + 57, 22, hh - 60, P.w); r(ctx, hx + hw / 2 + 6, hy + 82, 3, 3, P.Y);
    box(ctx, hx + hw / 2 - 20, hy + hh - 4, 40, 6, P.s);
    for (const px of [hx - 22, hx + hw + 6]) { box(ctx, px + 4, hy + hh - 14, 14, 14, P.O); for (let k = 0; k < 6; k++) disc(ctx, px + 6 + (k % 3) * 5, hy + hh - 20 - Math.floor(k / 3) * 8, 4, k % 2 ? P.G : P.g); }
  };
  D.cover.size = { w: 384, h: 256 }; // 입장 그림이 없는 집에서 입장 화면 크기 (js/main.js coverSize)
  // 무늬 에셋 이름(처음 스타일가이드 v01 기준, 최신 판 v12)으로도 찾게 별칭. 에셋이 있으면 쓰이지 않는다
  const ALIAS = {
    washbasin: 'basin', bathmat: 'mat_bath', counter: 'kitchen_counter', shelf: 'kitchen_shelf', window: 'window_night',
    picture_sun: 'frame_plant', picture_portrait: 'frame_plant', mirror_round: 'frame_plant', clock: 'frame_plant',
    floorlamp: 'floor_lamp', coffeetable: 'coffee_table', mat: 'mat_entrance', mirror_stand: 'drawer', tvcabinet: 'tv_cabinet',
    roundtable: 'round_table', rug_round: 'rug_small', plant_pothos: 'plant_small', plant_fern: 'plant_big', plant_snake: 'plant_tall', plant_monstera: 'plant_tall',
    floor_wood: 'floor_wood', floor_brick: 'floor_kitchen', outside: 'floor_bath',
    // v02 새 이름
    kitchen_cabinet: 'kitchen_shelf', counter_v: 'drawer', wardrobe: 'hanger', shoe_cabinet: 'drawer', bench: 'coffee_table', stool: 'nightstand',
    tvcabinet_long: 'tv_cabinet', bed_wide: 'bed', window_bottom: 'window_night', window_bottom_s: 'window_night', mirror_long: 'frame_plant', bath_cabinet: 'frame_plant',
    // v03 새 이름
    floor_genkan: 'floor_bath', plant_snake_tall: 'plant_tall', fridge_tall: 'fridge', mirror_tall: 'drawer', wardrobe_big: 'hanger', monstera_m: 'plant_big',
    rug_big: 'rug_persian', coffeetable_m: 'coffee_table', floorlamp_m: 'floor_lamp', tvcabinet_wide: 'tv_cabinet', rug_round_big: 'rug_small',
    roundtable_m: 'round_table', chair_m: 'chair', bed_big: 'bed', window_bottom_w: 'window_night', window_ext: 'window_night', monstera_out: 'plant_big',
    // v04 새 이름
    bath_mirror: 'frame_plant', laundry_basket: 'plant_small', sink_v: 'drawer', plant_olive: 'plant_tall', window_inside: 'kitchen_shelf', frame_lemon: 'frame_plant',
    frame_cat: 'frame_plant', shelf_unit: 'bookshelf', tea_tray: 'coffee_table', cushion_a: 'mat_bath', cushion_b: 'mat_bath', shoe_cabinet_ivory: 'drawer',
    shoe_cabinet_wood: 'drawer', shoes: 'mat_entrance', gate: 'door_ns', doormat: 'mat_entrance', mirror_oval: 'drawer', wardrobe_top: 'hanger', wardrobe_side: 'drawer',
    plant_cactus: 'plant_tall', table_long: 'round_table', chair_side: 'chair', window_ext_kitchen: 'window_night', window_ext_bed: 'window_night',
    tree: 'plant_big', shrub: 'plant_small', flowers_a: 'plant_small', flowers_b: 'plant_small', flowers_c: 'plant_small',
    // v05 새 이름
    kitchen_cabinet: 'kitchen_counter', stand_cabinet: 'drawer', floorlamp_round: 'floor_lamp', table_two: 'round_table', chair_brown: 'chair', plant_bird: 'plant_tall',
  };
  Object.keys(ALIAS).forEach((k) => { if (!D[k]) D[k] = D[ALIAS[k]]; });
  root.PH_TEMP_DRAW = D;
})(typeof window !== 'undefined' ? window : globalThis);
