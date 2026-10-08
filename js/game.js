// 집 안 화면 (전개도 한 장): 캐릭터 움직임, 공간 들어가기 한마디, 입장 연출, 대화창·말풍선.
// 캐릭터는 js/data/actors.js 표에서 만들고, 움직임 방식(brain)은 아래 BRAINS에서 고른다.
(function (root) {
  'use strict';
  const L = root.PH_LAYOUT, T = L.T, W = L.W, H = L.H; // 캔버스 크기 = 배치표 칸 수 (layout.js)
  const S = root.PH_SETTINGS, LINES = root.PH_LINES, World = root.PHWorld;
  const $ = (id) => document.getElementById(id);

  const G = {
    mode: 'off', // 'off' | 'intro' | 'play'
    zone: L.start, actors: [], t: 0, scale: 2, // zone = 두부가 있는 공간 id (layout.rooms)
    held: [], // 누르고 있는 방향키 (마지막이 우선)
    dialog: null, bubble: null,
    night: false, fadeT: null, active: true, ctrl: 'dubu', wanderOn: true, // active: 우리집 탭을 보고 있음, fadeT: 입장 밝기 0~1 (null = 다 밝음)
    lastPick: {}, visitKind: null, skip: false, cues: [], acts: [], grid: null,
    els: {},
  };
  const gridOf = () => G.grid || (G.grid = World.grid(L));
  // 조작 대상 (방향키·바닥 클릭): 입장 뒤 제작자 캐릭터, 그림이 없으면 두부. G.ctrl = 캐릭터 id
  const me = () => actor(G.ctrl) || actor('dubu');
  // 칸 점유: 다른 캐릭터가 서 있거나 지금 들어가는 칸. 테이블 위에 있는 캐릭터(perch)와 안 보이는 캐릭터는 바닥 칸을 차지하지 않음
  function occupied(x, y, self) { return G.actors.some((o) => o !== self && o.visible && !o.perch && ((o.x === x && o.y === y) || (o.step && o.step.tx === x && o.step.ty === y))); }
  function pathAvoid(a, gx, gy) { // 다른 캐릭터 칸을 피해 길 찾기
    const g = gridOf().map((r) => r.slice());
    G.actors.forEach((o) => { if (o !== a && o.visible && !o.perch) { if (g[o.y]) g[o.y][o.x] = true; if (o.step && g[o.step.ty]) g[o.step.ty][o.step.tx] = true; } });
    return World.findPath(g, a.x, a.y, gx, gy);
  }
  // 좁은 길목 칸: 그 칸을 막으면 다른 칸끼리 끊기는 칸 (v09 침실 들어가는 외길 등). 두부는 여기서 멈추거나 앉지 않음 (지나가기만)
  let cutMemo = null;
  function isCut(x, y) {
    if (!cutMemo || cutMemo.g !== gridOf()) {
      const g = gridOf(), free = []; for (let yy = 0; yy < L.h; yy++) for (let xx = 0; xx < L.w; xx++) if (World.walkable(g, xx, yy)) free.push([xx, yy]);
      const reach = (gg, sx, sy) => { const seen = new Set([sx + ',' + sy]), q = [[sx, sy]]; while (q.length) { const [cx, cy] = q.pop(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny; if (!seen.has(k) && World.walkable(gg, nx, ny)) { seen.add(k); q.push([nx, ny]); } }); } return seen.size; };
      const set = new Set();
      free.forEach(([cx, cy]) => { const g2 = g.map((r) => r.slice()); g2[cy][cx] = true; const other = free.find(([fx, fy]) => fx !== cx || fy !== cy); if (other && reach(g2, other[0], other[1]) < free.length - 1) set.add(cx + ',' + cy); });
      cutMemo = { g, set };
    }
    return cutMemo.set.has(x + ',' + y);
  }
  const rnd = (r) => r[0] + Math.random() * (r[1] - r[0]);
  const actor = (id) => G.actors.find((a) => a.id === id);
  const dlgOpen = () => !!(root.PHDialog && root.PHDialog.isOpen()); // 두부 대화창(js/dialog.js)이 열려 있으면 게임 입력·두부 돌아다니기 멈춤

  // ---------- 캐릭터 ----------
  // 캐릭터 그림·배율 = 그림 세트의 캐릭터 표 (settings.ART_SETS[세트].chars -> js/artset.js PH_CHARS). 처음 자리 = 그 세트 배치표 spawn
  function makeActors() {
    const CH = root.PH_CHARS || {}, SP = L.spawn || {};
    G.actors = root.PH_ACTORS.map((d) => {
      const c = CH[d.id] || {}, sp = SP[d.id === 'dubu' ? 'dubu_walk_start' : d.id], home = sp && sp.x != null ? { x: sp.x, y: sp.y } : d.home;
      return {
        id: d.id, name: d.name, sprite: c.sprite || d.sprite, brain: d.brain, talk: d.talk, home, scale: c.scale || 1, foot: c.foot || 0,
        x: home.x, y: home.y, px: home.x * T, py: home.y * T, zone: World.roomAt(L, home.x, home.y),
        face: 'down', pose: null, moving: false, perch: null, hop: null, glide: null, wd: null, path: [], step: null, lift: 0, visible: !d.startHidden, arrive: null,
      };
    });
  }
  const spriteSize = (a) => { const sz = Art.hitSize ? Art.hitSize(a.sprite + '_idle') : null; return sz || Art.size(a.sprite + '_idle') || Art.size(a.sprite + '_walk_down') || { w: 16, h: 20 }; }; // hitSize: 옷 갈아입기(js/outfit.js) 합성 그림은 32x36이지만 클릭 판정은 원래 크기
  const hasChar = (id) => { const a = actor(id); return !!a && Art.has(a.sprite + '_walk_up'); };
  function place(a, x, y) { a.x = x; a.y = y; a.px = x * T; a.py = y * T; a.step = null; a.moving = false; }

  // 움직임 방식. tick(a)이 다음 칸 {x, y}을 돌려주면 그쪽으로 한 칸 간다. 'wander'는 다음 판에 여기 더한다
  const BRAINS = {
    player(a) {
      // 테이블 위에서 쉬다가 길(클릭)이나 방향키가 들어오면 먼저 폴짝 내려옴. 방향키는 내려온 뒤 그 방향으로 한 걸음
      if (a.perch && (a.path.length || (G.mode === 'play' && !G.dialog && G.held.length))) { leavePerch(a, G.held.length ? G.held[G.held.length - 1] : null); return null; }
      if (a.perch || a.hop) return null;
      if (a.path.length) return a.path.shift();
      if (G.mode !== 'play' || G.dialog || !G.held.length) return null;
      const d = World.DIRS[G.held[G.held.length - 1]];
      return { x: a.x + d[0], y: a.y + d[1], face: G.held[G.held.length - 1] };
    },
    stay(a) { return a.path.length ? a.path.shift() : null; },
    // 두부가 스스로 돌아다니기 (제작자 2026-10-03). 할 일 하나를 고르고, 끝나면 settings.WANDER 시간만큼 쉬었다가 다음 일
    //   walk = 돌아다닐 구역(layout roam.dubu) 안 빈칸으로 / sit = 그 자리에 앉아 쉬기 / table = dubu_hop 칸을 거쳐 테이블 위로 폴짝
    //   멈추는 때: 조작할 수 없을 때(연출·대화창·다른 탭), 두부가 말하는 중, 설정에서 끔
    wander(a, now) {
      const Wd = S.WANDER || {}, st = a.wd || (a.wd = { next: now + rnd(Wd.idle || [3000, 8000]) });
      a.stepMs = Wd.stepMs || S.STEP_MS;
      const paused = !G.wanderOn || G.mode !== 'play' || !G.active || G.dialog || dlgOpen() || (G.bubble && G.bubble.id === a.id);
      if (a.hop || a.glide) return null;
      if (a.path.length) return paused && !a.arrive ? null : a.path.shift();
      if (paused) { st.next = Math.max(st.next, now + 600); return null; }
      if (now < st.next) return null;
      if (a.perch) { // 쉬기 끝: 오르내리는 칸이 비어 있으면 내려옴
        if (occupied(a.x, a.y, a)) { st.next = now + 1500; return null; }
        leavePerch(a, null); st.next = now + rnd(Wd.idle || [3000, 8000]); st.doing = 'down'; return null;
      }
      const w = Wd.weights || { walk: 0.5, sit: 0.25, table: 0.25 }, r = Math.random() * (w.walk + w.sit + w.table);
      const what = G.wanderForce || (r < w.walk ? 'walk' : r < w.walk + w.sit ? 'sit' : 'table');
      G.wanderForce = null; st.doing = what;
      if (what === 'sit' && isCut(a.x, a.y)) { st.doing = 'walk'; st.next = 0; G.wanderForce = 'walk'; return null; } // 좁은 길목에는 앉지 않음
      if (what === 'sit') { a.pose = 'sit'; a.face = 'down'; st.next = now + rnd(Wd.sit || [6000, 12000]); return null; }
      if (what === 'table' && !restSpot()) { st.doing = 'walk'; st.next = 0; G.wanderForce = 'walk'; return null; } // 테이블 쉬는 자리 없는 집 = 걷기로
      if (what === 'table') {
        const land = restLanding();
        if (!land || occupied(land.x, land.y, a)) { st.next = now + 1500; return null; }
        a.path = (a.x === land.x && a.y === land.y) ? [] : (pathAvoid(a, land.x, land.y) || []);
        a.arrive = () => { a.arrive = null; if (a.x === land.x && a.y === land.y) sitOnRest(a); st.next = performance.now() + rnd(Wd.rest || [15000, 30000]); };
        if (!a.path.length) a.arrive();
        st.next = now + 60000; // 도착하면 arrive가 다시 정함
        return null;
      }
      // walk: 구역 안 무작위 빈칸 (길이 있고 다른 캐릭터 칸이 아닌 곳)
      const R = (L.roam && L.roam.dubu) || { x1: 1, y1: 1, x2: L.w - 2, y2: L.h - 2 }, g = gridOf(), cand = [];
      for (let y = R.y1; y <= R.y2; y++) for (let x = R.x1; x <= R.x2; x++) if (World.walkable(g, x, y) && !occupied(x, y, a) && !(x === a.x && y === a.y) && !isCut(x, y)) cand.push([x, y]);
      for (let tries = 0; tries < 6 && cand.length; tries++) {
        const [tx, ty] = cand.splice(Math.floor(Math.random() * cand.length), 1)[0], p = pathAvoid(a, tx, ty);
        if (p && p.length) { a.path = p; a.arrive = () => { a.arrive = null; st.next = performance.now() + rnd(Wd.idle || [3000, 8000]); }; st.next = now + 60000; return a.path.shift(); }
      }
      st.next = now + 2000; return null;
    },
  };

  function update(now) {
    G.actors.forEach((a) => {
      if (a.glide) { // px 단위로 점을 따라 걷기 (입장 계단·베란다처럼 칸으로 걸을 수 없는 곳)
        const gl = a.glide, el = G.skip ? 1e9 : (now - gl.t0) / 1000 * gl.speed;
        let i = 0; while (i < gl.seg.length - 1 && el > gl.seg[i].end) i++;
        const sg = gl.seg[i], p = Math.min(1, Math.max(0, (el - sg.start) / (sg.len || 1)));
        a.px = sg.a.x + (sg.b.x - sg.a.x) * p; a.py = sg.a.y + (sg.b.y - sg.a.y) * p;
        a.face = World.faceOf(Math.round(sg.b.x - sg.a.x), Math.round(sg.b.y - sg.a.y)); a.moving = true;
        if (el < gl.total) return;
        a.glide = null; a.moving = false; const last = gl.seg[gl.seg.length - 1].b; a.px = last.x; a.py = last.y;
        if (gl.done) gl.done();
        return;
      }
      if (a.hop) { // 폴짝 (테이블 위로·아래로): px를 옮기며 위로 볼록한 호
        const h = a.hop, p = Math.min(1, (now - h.t0) / h.ms);
        a.px = h.fx + (h.tx - h.fx) * p; a.py = h.fy + (h.ty - h.fy) * p; a.lift = -Math.round(10 * Math.sin(Math.PI * p));
        if (p < 1) return;
        a.hop = null; a.lift = 0; a.px = h.tx; a.py = h.ty;
        if (h.done) h.done();
        return;
      }
      if (a.step) {
        const p = Math.min(1, (now - a.step.t0) / (a.stepMs || S.STEP_MS));
        a.px = (a.step.fx + (a.step.tx - a.step.fx) * p) * T; a.py = (a.step.fy + (a.step.ty - a.step.fy) * p) * T;
        if (p < 1) return;
        place(a, a.step.tx, a.step.ty); a.moving = true; // 이어서 걸으면 걷기 그림 유지
        onArrive(a);
      }
      const brain = a.id === G.ctrl ? BRAINS.player : (BRAINS[a.brain] || BRAINS.stay);
      const next = !a.step && brain(a, now);
      if (next) {
        const dx = Math.sign(next.x - a.x), dy = Math.sign(next.y - a.y);
        a.face = next.face || World.faceOf(dx, dy);
        const free = World.walkable(gridOf(), next.x, next.y);
        if (free && !occupied(next.x, next.y, a)) { a.step = { fx: a.x, fy: a.y, tx: next.x, ty: next.y, t0: now }; a.moving = true; a.pose = null; return; }
        if (free && a.path.length) { // 다른 캐릭터가 길을 막음: 그 칸을 피해 끝 칸까지 길을 다시 찾음 (끝 칸이 막혔으면 그만)
          const goal = a.path[a.path.length - 1];
          a.path = occupied(goal.x, goal.y, a) ? [] : (pathAvoid(a, goal.x, goal.y) || []);
        } else a.path = [];
      }
      if (!a.step) {
        a.moving = false;
        if (a.arrive && !a.path.length) { const f = a.arrive; a.arrive = null; f(); }
      }
    });
  }
  // 다른 공간에 들어가면 한마디 (lines.room[공간 id], 비어 있으면 말 없음). 문 칸은 공간이 아니라 그대로
  function onArrive(a) {
    const z = World.roomAt(L, a.x, a.y);
    if (!z || z === a.zone) return;
    a.zone = z;
    if (a.id !== G.ctrl) return;
    G.zone = z; renderRoomName();
    const d = actor('dubu'); // 공간 한마디는 두부 목소리 (집사가 안내)
    // 지나가기만 하는 공간(투룸·쓰리룸 거실 = 다른 방 가는 길)은 말 없음: 걷는 길 끝이 다른 공간이면 건너뜀 (부기 새 방 v01 4절, 2026-10-08)
    const goal = a.path && a.path.length ? a.path[a.path.length - 1] : null;
    if (goal && World.roomAt(L, goal.x, goal.y) && World.roomAt(L, goal.x, goal.y) !== z && (S.ROOM_PASS_QUIET || []).includes(z)) return;
    if (G.mode === 'play' && d && d.visible) sayBubble(d, pickLine(['room', z]));
  }
  function walkTo(a, x, y) {
    const path = World.findPath(gridOf(), a.x, a.y, x, y);
    a.path = path || [];
    return path;
  }

  // ---------- 대사 ----------
  // 묶음 찾기. 공간 대사는 그 공간 줄 + 다른 공간의 shared 표시 줄 (원고 v02: hall은 living의 (공용) 줄도 씀)
  function group(path) {
    const g = path.reduce((o, k) => (o ? o[k] : null), LINES) || [];
    if (path[0] !== 'room' || !LINES.room) return g;
    const shared = [];
    Object.keys(LINES.room).forEach((k) => { if (k !== path[1]) (LINES.room[k] || []).forEach((it) => { if (it && it.shared === path[1]) shared.push(it); }); });
    return g.concat(shared);
  }
  // 묶음에서 한 줄 고르기 (바로 앞 대사 제외). 연출(괄호)은 acts에 남기고 글만 돌려준다
  function pickLine(path) {
    const list = group(path), key = path.join('.');
    const i = World.pick(list, G.lastPick[key], Math.random, (it) => !(it && ((it.needs === 'tori' && !actor('tori')) || (it.needs === 'night' && !G.night) || (it.needs === 'day' && G.night))));  // needs 'day' = 낮 화면만 (부기 새 방 v01, 2026-10-08)
    if (i < 0) return '';
    G.lastPick[key] = i;
    const line = World.parseLine(list[i]);
    if (line.act) G.acts.push(line.act);
    return line.say;
  }

  // 대화창: 언제나 하단 고정 (제작자 2026-10-03, 말하는 캐릭터 자리와 상관없음). 닫히면 끝나는 약속을 돌려준다
  function openDialog(name, pages, who) {
    return new Promise((resolve) => {
      if (G.skip || !pages.length) { resolve(); return; }
      G.dialog = { name, pages, idx: 0, t0: performance.now(), done: false, resolve };
      G.els.dlg.classList.remove('top'); // 하단 고정
      G.els.dlg.hidden = false;
      G.els.dlg.querySelector('.dl-name').textContent = name;
      G.els.dlg.querySelector('.dl-sr').textContent = pages[0];
    });
  }
  function advanceDialog() {
    const d = G.dialog; if (!d) return;
    if (!d.done) { d.done = true; return; } // 글자 다 보이기
    d.idx++;
    if (d.idx >= d.pages.length) { closeDialog(); return; }
    d.t0 = performance.now(); d.done = false;
    G.els.dlg.querySelector('.dl-sr').textContent = d.pages[d.idx];
  }
  function closeDialog() {
    const d = G.dialog; if (!d) return;
    G.dialog = null; G.els.dlg.hidden = true; d.resolve();
  }
  function drawDialog(now) {
    const d = G.dialog; if (!d) return;
    const text = d.pages[d.idx], n = d.done ? text.length : Math.floor((now - d.t0) / S.TYPE_MS);
    if (n >= text.length) d.done = true;
    G.els.dlg.querySelector('.dl-vis').textContent = text.slice(0, Math.min(n, text.length));
    G.els.dlg.querySelector('.dl-more').textContent = d.done ? (d.idx < d.pages.length - 1 ? '▼' : '■') : '';
  }

  // 말풍선 (캐릭터 머리 위, 잠깐). opt = { ms: 떠 있는 시간, onClick: 누르면 할 일(interact: 약속 한 줄 -> 약속 탭) }
  function sayBubble(a, text, opt) {
    if (!text) return;
    const o = opt || {};
    G.bubble = { id: a.id, text, until: performance.now() + (o.ms || S.BUBBLE_MS), onClick: o.onClick || null, tag: o.tag || null };
    G.els.bubble.textContent = text; G.els.bubble.hidden = false; G.els.bubble.classList.toggle('act', !!o.onClick);
  }
  function hideBubble() { G.bubble = null; G.els.bubble.hidden = true; G.els.bubble.classList.remove('act'); }
  function drawBubble(now) {
    const b = G.bubble; if (!b) return;
    const a = actor(b.id);
    if (now > b.until || !a) { if (a && a.pose === 'greet') a.pose = a.perch ? 'sit' : null; hideBubble(); return; }
    const hx = a.px + T / 2, hy = a.py - 2 + (a.lift || 0);
    G.els.bubble.style.left = Math.round(hx * G.scale) + 'px';
    G.els.bubble.style.top = Math.round(hy * G.scale) + 'px';
  }
  // 두부를 눌렀을 때 (클릭·두부 옆 Space): 하단 대화창 + 선택지 (js/dialog.js). 대화창이 없으면 예전처럼 말풍선 한마디
  function onDubuClick(a) {
    if (!a) return;
    if (root.PHDialog && root.PHDialog.openDubu) { a.face = 'down'; root.PHDialog.openDubu(); } else talk(a);
  }
  // Space: 제작자 캐릭터가 두부 옆 칸(가로·세로·대각선 1칸, 테이블 위면 그 자리 기준도)이면 대화창, 아니면 예전처럼 말풍선 한마디
  function nearDubu(m, d) {
    const near = (x, y) => Math.max(Math.abs(m.x - x), Math.abs(m.y - y)) <= 1;
    return near(d.x, d.y) || !!(d.perch && d.perch.tile && near(d.perch.tile.x, d.perch.tile.y));
  }
  // (interact) 두부 옆이면 예전처럼 두부 대화창이 먼저. 아니면 마주 본 물건(js/interact.js), 없으면 예전처럼 말풍선
  function onSpace() {
    const d = actor('dubu'), m = me(); if (!d || !d.visible) return;
    // (logs 2026-10-04) 두부 옆이어도, 두부 칸이 아닌 "두부보다 먼저" 물건(spaceOverDubu = 거실 2인 테이블 식사 일지)을 마주 보면 그 물건이 먼저
    if (m !== d && nearDubu(m, d) && root.PHInteract && root.PHInteract.onSpaceOverDubu && root.PHInteract.onSpaceOverDubu(m, d)) return;
    if (m === d || nearDubu(m, d)) { onDubuClick(d); return; }
    if (root.PHInteract && root.PHInteract.onSpace(m)) return;
    talk(d);
  }
  function talk(a) {
    if (!a.talk) return;
    a.face = 'down'; if (!a.moving) a.pose = 'greet';
    sayBubble(a, pickLine([a.talk]));
  }

  // ---------- 입장 연출 ----------
  const wait = (ms) => new Promise((r) => (G.skip ? r() : setTimeout(r, ms)));
  function tween(ms, fn) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = () => { const p = G.skip ? 1 : Math.min(1, (performance.now() - t0) / ms); fn(p); if (p >= 1) resolve(); else requestAnimationFrame(step); };
      step();
    });
  }
  function walkAndWait(a, x, y) {
    return new Promise((resolve) => {
      if (G.skip || !walkTo(a, x, y) || !a.path.length) { place(a, x, y); a.path = []; resolve(); return; }
      a.arrive = resolve;
    });
  }
  // 연출 이름 -> 하는 일 (lines.js intro의 cue). short = 다시 온 경우 짧게
  // 입장 밝기 (제작자 2026-10-02: "낮에는 바로 밝고, 밤에는 어둡지만 보이긴 했다가 은은한 조명 켜지듯")
  //   낮: 어둠 없이 바로 밝은 집. 밤: settings.INTRO_NIGHT.start(어둡지만 윤곽이 보이는 밝기)에서 시작 -> 인사 ->
  //   스탠드가 먼저 켜지고(불빛 웅덩이가 시작점) 집 전체가 잘게 나눈 단계로 은은하게 원래 밤 색까지. 두부도 같은 밝기
  //   움직임 줄이기 설정이면 바로 밝음. Esc = 건너뜀
  const Art = root.PHArt;
  function setFade(t) { Art.fadeT = t; G.fadeT = t; if (t == null) Art.lampLit = false; paintMargins(); }
  const reduceMotion = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const CUES = {
    // 입장 동선 (layout v04 entry_path): 계단 5칸을 올라 베란다 -> 회색 대문 열림(gate 장 0 -> 1) -> 현관에서 두부 인사
    //   제작자 모습(아바타)은 없어서 계단 오르기는 발소리 쉼으로만 둠. 대문은 연출이 끝나면 다시 닫힘(장 0)
    async door(short) {
      // 자리만 비워 둠 (2026-10-03 토리 전달): 제작자 캐릭터(하우스판, player_*)가 완성되면 여기서 계단 5칸 -> 베란다 -> 대문 앞까지 걸어오는 장면.
      //   settings.INTRO_PLAYER = true + 그림이 있을 때만 CUES.playerClimb를 부름. 지금은 false라 발소리 쉼만
      if (S.INTRO_PLAYER && hasChar('player')) { await CUES.playerClimb(short); return; } // 대문 여는 것까지 함
      await wait(short ? 250 : 650); // 계단 오르는 발소리
      setGate(1);                    // 대문 열림
      await wait(short ? 200 : 450);
    },
    async dubuAppear() { // 현관 마루 끝(인사 자리)에 앞발 모으고 앉아 있음
      const a = actor('dubu'), sp = L.spawn.dubu_greet;
      place(a, sp.x, sp.y); a.visible = true; a.face = 'down'; a.pose = 'sit';
      a.zone = World.roomAt(L, a.x, a.y);
    },
    // 제작자 입장 (layout entry_path, px = 발 가운데): 계단 아래 -> 계단 5칸 -> 베란다 -> 대문 앞 -> (대문 열림) -> 현관 -> 안쪽에 섬
    //   마지막 서는 자리는 entry_path "현관"(200,296)에서 왼쪽으로 반 칸 비킴(PLAYER_STAND): 그대로 서면 인사 자리(12,17) 두부를 12px 가림
    async playerClimb(short) {
      const d = actor('player'), P = entryPoints(); if (!d) return;
      if (P.length < 5) { // 입장 길(entry_path)이 없는 집 (공용 원룸, 무늬 v01 6절 "현관문 칸에서 바로 시작"): 현관문 칸에 나타나 문 열고 한 칸 들어와 섬
        const gt = L.spawn && L.spawn.gate; if (!gt) return;
        d.visible = true; d.glide = null; d.px = gt.x * T; d.py = gt.y * T; d.face = 'up';
        await wait(short ? 120 : 300);
        setGate(1);
        await wait(short ? 150 : 420);
        await glide(d, [{ x: gt.x * T, y: gt.y * T }, { x: gt.x * T, y: (gt.y - 1) * T }, PLAYER_STAND()], short ? 120 : 70);
        d.face = 'up'; d.moving = false;
        return;
      }
      const speed = short ? 120 : 70; // px/초 (계단은 천천히)
      d.visible = true; d.glide = null; d.px = P[0].x; d.py = P[0].y; d.face = 'up';
      await glide(d, P.slice(0, 4), speed); // 계단 -> 베란다 -> 대문 앞
      d.face = 'up'; d.moving = false;
      await wait(short ? 120 : 300);
      setGate(1);                           // 대문 열림 (gate 장 1)
      await wait(short ? 150 : 420);
      await glide(d, [P[3], P[4], PLAYER_STAND()], speed); // 현관으로 들어와 안쪽에 섬
      d.face = 'up'; d.moving = false;
    },
    async tailWag() { await wait(450); /* 꼬리 흔들기 그림이 생기면 여기서 바꿈. 지금은 앉은 그림 꼬리 움직임 그대로 */ },
    async fade(short) {
      if (G.fadeT == null || reduceMotion()) { setFade(null); Art.lampOff = false; return; } // 낮: 할 것 없음
      const N = S.INTRO_NIGHT || { steps: 18, ms: 2400 }, steps = Math.max(1, N.steps), ms = short ? Math.round(N.ms / 2) : N.ms;
      const t0 = G.fadeT;
      Art.lampOff = false; Art.lampLit = true; setFade(t0); // 딸깍: 스탠드 불빛부터
      await wait(Math.round(ms / steps) * 2);
      for (let i = 1; i <= steps && !G.skip; i++) { setFade(t0 + (1 - t0) * i / steps); await wait(Math.round(ms / steps)); }
      setFade(null); Art.lampOff = false;
    },
  };
  // entry_path px(발 가운데) -> 캐릭터 그리기 좌표(a.px, a.py = 칸 왼쪽 위 기준)
  const footToActor = (x, y) => ({ x: x - T / 2, y: y - T });
  // 점: px가 있으면 그 점, tile만 있으면 칸 가운데 (v09 "현관"은 tile). "두부 인사" 줄(두부 자리)은 걷는 점이 아님
  function entryFeet() { return (L.entryPath || []).filter((s) => (s.px || s.tile) && !/두부/.test(s.step || '')).map((s) => (s.px ? { x: s.px[0], y: s.px[1] } : { x: s.tile[0] * T + T / 2, y: s.tile[1] * T + T / 2 })); }
  function entryPoints() { return entryFeet().map((p) => footToActor(p.x, p.y)); }
  // 제작자이 서는 칸: entry_path "현관" 점의 왼쪽 칸 (현관 점 그대로면 인사 자리 (12,17) 두부와 겹침). 칸 단위라 바로 걸을 수 있음
  //   배율이 크면 그림 폭도 넓어져서, 인사 자리 두부와 가로로 안 겹치게 그만큼 더 왼쪽 칸 (1배 = 1칸, 2배 = 2칸)
  //   그림이 넓으면(큰 판·배율) 그만큼 더 왼쪽 칸 (폭 16 = 1칸, 32 = 2칸)
  //   그 칸이 걸을 수 없거나 현관 밖이면(v10: 24px 플레이어 -> 벽 칸) 현관 안 걸을 칸 중 가장 가까운 칸 (같으면 아래쪽 = 앞쪽), 인사 칸은 빼고
  function PLAYER_TILE() {
    const P = entryFeet(), gt = L.spawn && L.spawn.gate, d = actor('player'), w = d ? spriteSize(d).w * (d.scale || 1) : 16;
    const g = P.length ? P[P.length - 1] : gt ? { x: gt.x * T + T / 2, y: (gt.y - 1) * T + T / 2 } : { x: T * 1.5, y: T * 1.5 }; // 입장 길이 없으면 현관문 바로 안쪽 칸
    const want = { x: Math.floor(g.x / T) - Math.ceil((w / 2 + 8) / T), y: Math.floor(g.y / T) };
    const grid = gridOf(), room = World.roomAt(L, Math.floor(g.x / T), Math.floor(g.y / T)), gr = L.spawn.dubu_greet || {};
    const fine = (x, y) => World.walkable(grid, x, y) && World.roomAt(L, x, y) === room && !(x === gr.x && y === gr.y);
    if (fine(want.x, want.y)) return want;
    let best = null;
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (fine(x, y)) { const dd = Math.abs(x - want.x) + Math.abs(y - want.y); if (!best || dd < best.d || (dd === best.d && y > best.y)) best = { x, y, d: dd }; }
    return best ? { x: best.x, y: best.y } : want;
  }
  function PLAYER_STAND() { const t = PLAYER_TILE(); return { x: t.x * T, y: t.y * T }; }
  function glide(a, pts, speed) {
    return new Promise((resolve) => {
      const seg = []; let acc = 0;
      for (let i = 0; i < pts.length - 1; i++) { const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y); seg.push({ a: pts[i], b: pts[i + 1], len, start: acc, end: acc + len }); acc += len; }
      if (!seg.length) { resolve(); return; }
      a.glide = { seg, total: acc, speed, t0: performance.now(), done: resolve };
    });
  }
  function setGate(f) { L.objects.filter((o) => o.type === 'gate').forEach((o) => { o.frame = f; }); G.gate = f; }
  async function runIntro(kind) {
    setGate(0);
    const first = kind === 'first';
    G.mode = 'intro'; G.skip = false; G.cues = [];
    const a = actor('dubu'); a.visible = false; a.path = []; G.zone = L.start; renderRoomName();
    // 밤이면 어둡지만 윤곽이 보이는 밝기에서 시작 (스탠드 꺼짐). 낮이면 바로 밝음
    if (G.night && !reduceMotion()) { Art.lampOff = true; setFade((S.INTRO_NIGHT || { start: 0.45 }).start); } else { Art.lampOff = false; setFade(null); }
    // 단계: 처음 = lines.intro / 다시 온 경우 = 짧은 연출 + 인사 한 줄 ('@greet' 자리). 순서는 settings.INTRO_DUBU_AFTER_FADE
    const greet = first ? null : pickLine(World.greetGroup(kind, new Date().getHours(), S));
    const raw = first ? introFirst() : LINES.introShort.map((c) => (c === '@greet' ? { say: greet } : { cue: c }));
    const steps = World.orderIntro(raw, S.INTRO_DUBU_AFTER_FADE);
    let pages = [];
    const flush = async () => {
      if (!pages.length) return;
      const p = pages; pages = []; const was = a.pose;
      if (a.visible) a.pose = 'greet';
      await openDialog(a.name, p, a);
      a.pose = was;
    };
    for (const st of steps) {
      if (st.cue) { await flush(); G.cues.push(st.cue); if (st.act) G.acts.push(st.act); await CUES[st.cue](!first); }
      if (st.say) { const line = World.parseLine(st.say); if (line.act) G.acts.push(line.act); pages.push(line.say); }
    }
    await flush();
    // 건너뛰기(Esc)·정상 끝 모두 같은 마무리
    // 인사가 끝나면 대문을 닫고(제작자 "문 닫아"), 두부는 평소 자리 = 거실 2인 테이블 위(layout spawn.dubu_home)로:
    //   테이블 옆 가장 가까운 빈칸까지 걸어가서 폴짝 올라가 앉음. Esc로 건너뛰었으면 바로 테이블 위에 놓음
    const skipped = G.skip;
    setFade(null); Art.lampOff = false; a.visible = true; a.lift = 0; setGate(0);
    const dn = actor('player'); // 제작자은 현관 안쪽 칸에 서 있음 (건너뛰었어도 같은 자리). 입장 뒤 조작 대상 = 제작자
    if (dn && S.INTRO_PLAYER && hasChar('player')) {
      const st = PLAYER_TILE(); dn.glide = null; dn.visible = true; place(dn, st.x, st.y); dn.face = 'down'; dn.zone = World.roomAt(L, st.x, st.y);
      G.ctrl = 'player'; G.zone = dn.zone; renderRoomName();
    } else G.ctrl = 'dubu';
    const sp = L.spawn.dubu_greet;
    if (!a.step) place(a, sp.x, sp.y);
    a.zone = World.roomAt(L, a.x, a.y); G.zone = a.zone; renderRoomName();
    a.face = 'down'; a.pose = null; G.mode = 'play'; G.skip = false;
    if (G.ctrl !== 'dubu') { a.zone = World.roomAt(L, a.x, a.y); } else { G.zone = a.zone; renderRoomName(); }
    goRest(a, skipped);
    if (root.PHInteract && root.PHInteract.afterIntro) root.PHInteract.afterIntro(kind); // (interact) A 오늘 약속 한 줄
  }
  // 처음 입장 대사: 공용판은 온보딩에서 이미 "집사 두부예요" 인사를 했으므로 첫 인사 줄을 부기 원고 intro.afterOnboard로 (두부대사_기록기능 v01 3-2)
  function introFirst() {
    const P = root.PHProfile, after = root.PH_INTRO_AFTER_ONBOARD;
    if (!P || P.id !== 'default' || !after) return LINES.intro;
    let done = false;
    return LINES.intro.map((st) => { if (done || !st.say) return st; done = true; return { say: after.split('{user}').join(P.userName()) }; });
  }
  // ---- 테이블 위 자리 (layout spawn.dubu_home: px·py = dubu_sit 그림 왼쪽 위, on = 올라앉는 물건, draw_after = 그 물건 바로 다음에 그림) ----
  function restSpot() {
    const sp = L.spawn.dubu_home; if (!sp || sp.px == null) return null;
    const d = actor('dubu'), sz = Art.size(((d && d.sprite) || 'dubu') + '_sit') || (d && spriteSize(d)) || { w: 16, h: 20 }, on = L.objects.find((o) => o.type === (sp.draw_after || sp.on));
    // 무늬 v10: foot_px(엉덩이 바닥 가로 가운데)가 있으면 실제 두부 크기로 그림 왼쪽 위 = (foot x - 폭/2, foot y - 높이 + 1)
    const gx = sp.foot_px ? sp.foot_px[0] - sz.w / 2 : sp.px, gy = sp.foot_px ? sp.foot_px[1] - sz.h + 1 : sp.py;
    return { px: gx - (T - sz.w) / 2, py: gy - T + sz.h, base: on ? on.py + on.size[1] + 1 : null, tile: { x: sp.x, y: sp.y } }; // 정렬 값 = 물건 아랫변 + 1
  }
  // 올라가고 내려오는 칸: 쉬는 자리에 가장 가까운, 걸을 수 있고 다른 그림(의자 등) 밑이 아닌 칸
  function restLanding() {
    if (!restSpot()) return null; // 테이블 위 쉬는 자리가 없는 집 (공용 원룸: dubu_home = 바닥 칸)
    const hop = L.spawn.dubu_hop; if (hop && World.walkable(gridOf(), hop.x, hop.y)) return { x: hop.x, y: hop.y }; // 무늬 v06: 오르내리는 칸 (테이블 바로 아래)
    const r = restSpot(), g = gridOf(), sp = L.spawn.dubu_greet; let best = null;
    const under = (x, y) => L.objects.some((o) => o.layer !== 'floor' && o.px != null && x * T + 8 >= o.px && x * T + 8 < o.px + o.size[0] && y * T + 8 >= o.py && y * T + 8 < o.py + o.size[1]);
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      if (!World.walkable(g, x, y) || under(x, y) || !World.findPath(g, sp.x, sp.y, x, y)) continue;
      const d = Math.hypot(x * T - r.px, y * T - r.py);
      if (!best || d < best.d) best = { x, y, d };
    }
    return best;
  }
  function hopTo(a, tx, ty, ms, done) { a.hop = { fx: a.px, fy: a.py, tx, ty, t0: performance.now(), ms: ms || 260, done }; a.moving = false; a.pose = null; }
  function sitOnRest(a) {
    const r = restSpot(); if (!r) return;
    a.face = 'down';
    hopTo(a, r.px, r.py, 280, () => { a.perch = r; a.pose = 'sit'; a.face = 'down'; });
  }
  function goRest(a, instant) {
    const r = restSpot(), land = r && restLanding();
    if (!r || !land) { // 쉬는 자리가 바닥 칸(공용 원룸 spawn.dubu_home)이면 거기까지 걸어가 앉음
      const h = L.spawn.dubu_home;
      if (h && h.x != null && World.walkable(gridOf(), h.x, h.y) && !(a.x === h.x && a.y === h.y)) {
        if (instant) { place(a, h.x, h.y); a.pose = 'sit'; a.face = 'down'; return; }
        walkTo(a, h.x, h.y); a.arrive = () => { a.arrive = null; a.pose = 'sit'; a.face = 'down'; };
        if (a.wd || S.WANDER) a.wd = { next: performance.now() + rnd((S.WANDER && S.WANDER.rest) || [15000, 30000]) };
        if (!a.path.length) a.arrive();
        return;
      }
      a.pose = 'sit'; return;
    }
    if (instant) { place(a, land.x, land.y); a.px = r.px; a.py = r.py; a.perch = r; a.pose = 'sit'; a.face = 'down'; return; }
    walkTo(a, land.x, land.y);
    a.arrive = () => { if (a.x === land.x && a.y === land.y) sitOnRest(a); };
    if (a.wd || S.WANDER) a.wd = { next: performance.now() + rnd((S.WANDER && S.WANDER.rest) || [15000, 30000]) }; // 올라가서 한동안 쉼
    if (!a.path.length) a.arrive();
  }
  // 테이블에서 내려오기 -> 올라갔던 칸(a.x, a.y)으로 폴짝. 방향키로 시작했으면 내려온 뒤 그 방향으로 한 걸음
  function leavePerch(a, dir) {
    a.perch = null; a.arrive = null;
    hopTo(a, a.x * T, a.y * T, 220, () => {
      a.pose = null;
      if (dir && !a.path.length) { const d = World.DIRS[dir]; a.path.push({ x: a.x + d[0], y: a.y + d[1] }); a.face = dir; }
    });
  }
  // 그림 세트를 바꾼 직후 (js/artset.js PH_RESUME): 입장 연출 없이 그 자리에서 이어짐.
  //   제작자 = 있던 공간(zone) 안에서, 있던 자리(fx, fy = 전개도 안 비율)에 가장 가까운 빈칸. 공간이 없거나 칸이 없으면 현관 서는 칸
  //   두부 = 그 세트의 dubu_home (테이블 위). 낮·밤은 지금 시각대로, 밝아지기 없음
  function resume(r) {
    if (!started) { started = true; resize(); requestAnimationFrame(frame); }
    resize(); G.els.stage.focus();
    makeActors(); G.dialog = null; hideBubble(); G.els.dlg.hidden = true;
    G.wanderOn = !(S.WANDER && S.WANDER.on === false); G.visitKind = 'resume';
    setFade(null); Art.lampOff = false; setGate(0); G.mode = 'play'; G.skip = false;
    const a = actor('dubu'); a.visible = true; a.pose = null; a.face = 'down';
    const dn = actor('player');
    if (dn && hasChar('player')) {
      const t = resumeTile(r || {}); dn.visible = true; place(dn, t.x, t.y); dn.face = (r && r.face) || 'down'; dn.zone = World.roomAt(L, t.x, t.y);
      G.ctrl = 'player'; G.zone = dn.zone;
    } else { G.ctrl = 'dubu'; G.zone = L.start; }
    const land = restLanding(); if (land) place(a, land.x, land.y);
    goRest(a, true); a.zone = World.roomAt(L, a.x, a.y);
    if (G.ctrl === 'dubu') G.zone = a.zone;
    renderRoomName();
  }
  function resumeTile(r) {
    const g = gridOf(), room = L.rooms.find((q) => q.id === r.zone), st = PLAYER_TILE();
    const fx = Number.isFinite(r.fx) ? r.fx : null, fy = Number.isFinite(r.fy) ? r.fy : null;
    const tx = fx == null ? st.x : fx * L.w - 0.5, ty = fy == null ? st.y : fy * L.h - 0.5;
    const hop = L.spawn.dubu_hop;
    let best = null;
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      if (!World.walkable(g, x, y) || (hop && hop.x === x && hop.y === y)) continue; // 두부 오르내리는 칸은 비워 둠
      if (room && World.roomAt(L, x, y) !== room.id) continue;
      if (!World.findPath(g, x, y, st.x, st.y)) continue; // 갇힌 칸 말고
      const d = Math.hypot(x - tx, y - ty);
      if (!best || d < best.d) best = { x, y, d };
    }
    return best || st;
  }
  function skipIntro() { if (G.mode !== 'intro') return; G.skip = true; if (G.dialog) closeDialog(); const a = actor('dubu'); if (a.arrive) { a.path = []; const f = a.arrive; a.arrive = null; f(); } }

  // ---------- 입력 ----------
  const KEYDIR = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  function onKeyDown(e) {
    if (G.mode === 'off' || !G.active || dlgOpen()) return; // 다른 탭을 보는 동안·대화창이 열려 있는 동안은 집 조작 안 함
    if (KEYDIR[e.key]) { e.preventDefault(); const d = KEYDIR[e.key]; G.held = G.held.filter((x) => x !== d).concat([d]); return; }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault(); if (e.repeat) return;
      if (G.dialog) advanceDialog(); else if (G.mode === 'play') onSpace();
      return;
    }
    if (e.key === 'Escape') { if (G.mode === 'intro') skipIntro(); else { closeDialog(); hideBubble(); } }
  }
  function onKeyUp(e) { if (KEYDIR[e.key]) G.held = G.held.filter((x) => x !== KEYDIR[e.key]); }
  function toStage(e) { const r = G.els.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / G.scale, y: (e.clientY - r.top) / G.scale }; }
  // 클릭 판정 = 그려진 그림 범위 (배율 포함, 발바닥 = 칸 바닥, 가로 = 칸 가운데). 앞에(아래에) 그려진 캐릭터를 먼저
  function actorBox(a) {
    const s = a.scale || 1, sz = spriteSize(a), w = sz.w * s, h = sz.h * s, f = (a.foot || 0) * s;
    return { x1: a.px + (T - w) / 2 + s, x2: a.px + (T + w) / 2 - s, y1: a.py + (a.lift || 0) + T - h + f, y2: a.py + (a.lift || 0) + T + f };
  }
  function actorAt(x, y) {
    return G.actors.filter((a) => a.visible).sort((p, q) => (q.py - p.py)).find((a) => { const b = actorBox(a); return x >= b.x1 && x < b.x2 && y >= b.y1 && y < b.y2; });
  }
  function onClick(e) {
    if (G.mode === 'off' || dlgOpen()) return;
    G.els.stage.focus();
    if (G.dialog) { advanceDialog(); return; }
    if (G.mode !== 'play') return;
    const p = toStage(e), hit = actorAt(p.x, p.y);
    if (root.PHFurnishUI && root.PHFurnishUI.onClick(p)) return; // (2026-10-04) 가구 연결 모드: 클릭은 가구 고르기만 (두부·걷기보다 먼저)
    if (hit && hit.id === 'dubu') { onDubuClick(hit); return; }
    if (hit && hit === me()) return; // 내 캐릭터 클릭은 아무것도 안 함
    if (!hit && root.PHInteract && root.PHInteract.onClick(p, me())) return; // (interact) 물건 누르기
    const m = me(), tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
    m.arrive = null;
    if (occupied(tx, ty, m)) return; // 다른 캐릭터가 서 있는 칸으로는 안 감
    m.path = pathAvoid(m, tx, ty) || [];
  }
  function onMove(e) {
    if (G.mode !== 'play') return;
    const p = toStage(e), ob = !actorAt(p.x, p.y) && root.PHInteract ? root.PHInteract.hover(p, me()) : false; // (interact) 물건 위 = 누를 수 있음 표시
    G.els.cv.style.cursor = actorAt(p.x, p.y) || ob ? 'pointer' : '';
  }

  // ---------- 크기·그리기 ----------
  function resize() {
    if (G.els.screen.hidden) return; // 안 보이는 동안 크기 0으로 재지 않게
    // 2026-10-02 제작자: 창에 맞춰 비율을 지킨 채 최대한 크게 (가로나 세로 한쪽은 꽉 참). 소수 배율 허용,
    // 그리기는 nearest-neighbor(canvas image-rendering: pixelated)라 흐려지지 않음. 딱 맞으면 정수 그대로 (무늬 v01 "정수만"을 바꿈)
    const box = G.els.screen, fit = Math.min(box.clientWidth / W, box.clientHeight / H);
    const s = Math.abs(fit - Math.round(fit)) < 1e-6 ? Math.round(fit) : fit;
    G.scale = s;
    G.els.cv.style.width = W * s + 'px'; G.els.cv.style.height = H * s + 'px';
    G.els.stage.style.setProperty('--u', s);
  }
  // 남는 여백 = 바깥 잔디색 C (무늬 가이드 v04 5장, 이전 v03까지는 벽 K). 낮·밤·입장 밝기를 따라감
  function paintMargins() {
    if (!G.els || !G.els.screen) return;
    const b = root.PH_ASSETS && root.PH_ASSETS.background;
    G.els.screen.style.background = (b && (root.PHArt.paletteOf(b).C || root.PHArt.paletteOf(b).K)) || root.PH_PAL.h; // 무늬 v04 5장: 바깥 잔디색 C
    if (root.PHApp && root.PHApp.syncBar) root.PHApp.syncBar();
  }
  function renderRoomName() { const r = L.rooms.find((q) => q.id === G.zone); G.els.roomName.textContent = r ? r.name : ''; }
  function frame(now) {
    G.t = now;
    update(now);
    if (root.PHInteract) root.PHInteract.tick(now); // (interact) 흔들림·불·화분 상태
    root.PHRender.drawScene(G.ctx, { actors: G.actors, t: now, walkMs: S.WALK_FRAME_MS });
    if (root.PHInteract) root.PHInteract.draw(G.ctx, now); // (interact) 누를 수 있음 표시·반짝임
    drawDialog(now); drawBubble(now);
    requestAnimationFrame(frame);
  }

  // 방문 기록 (이 컴퓨터 브라우저 저장소에만). 읽기 실패는 처음 방문으로
  function visit() {
    let last = null;
    try { last = Number(localStorage.getItem(S.VISIT_KEY)) || null; } catch (e) { last = null; }
    const now = Date.now(), kind = World.visitKind(now, last, S);
    try { localStorage.setItem(S.VISIT_KEY, String(now)); } catch (e) { /* 저장 못 해도 진행 */ }
    return kind;
  }

  // 낮·밤: settings 기준으로 정하고 1분마다 다시 봄. 바뀌면 즉시 (페이드 없음)
  function applyLight() {
    const n = World.isNight(new Date().getHours(), S);
    const changed = n !== G.night;
    G.night = n; root.PHArt.night = n;
    document.documentElement.classList.toggle('night', n);
    paintMargins();
    if (changed && root.PHApp && root.PHApp.redrawCover) root.PHApp.redrawCover();
    return n;
  }
  function setDayNight(mode) { S.DAY_NIGHT = mode; G.night = null; return applyLight(); }

  let started = false;
  function init() {
    G.els = { screen: $('screen-house'), stage: $('stage'), cv: $('cv'), dlg: $('dlg'), bubble: $('bubble'), roomName: $('room-name') };
    G.els.cv.width = W; G.els.cv.height = H;
    G.ctx = G.els.cv.getContext('2d'); G.ctx.imageSmoothingEnabled = false;
    makeActors();
    document.addEventListener('keydown', onKeyDown); document.addEventListener('keyup', onKeyUp);
    root.addEventListener('blur', () => { G.held = []; });
    G.els.cv.addEventListener('click', onClick); G.els.cv.addEventListener('mousemove', onMove);
    G.els.dlg.addEventListener('click', (e) => { e.stopPropagation(); advanceDialog(); });
    G.els.bubble.addEventListener('click', (e) => { const b = G.bubble; if (!b || !b.onClick) return; e.stopPropagation(); const f = b.onClick; hideBubble(); f(); }); // (interact) 누를 수 있는 말풍선
    root.addEventListener('resize', resize);
    applyLight(); setInterval(applyLight, 60000);
  }
  // 입장: 집 화면을 보이게 한 뒤 연출 시작
  function enter() {
    if (!started) { started = true; resize(); requestAnimationFrame(frame); }
    resize(); G.els.stage.focus();
    makeActors(); G.zone = L.start; G.dialog = null; hideBubble(); G.els.dlg.hidden = true;
    G.ctrl = 'dubu'; G.wanderOn = !(S.WANDER && S.WANDER.on === false); // 입장 연출이 끝나면 조작 대상이 정해짐
    G.visitKind = visit();
    return runIntro(G.visitKind);
  }

  // 시험·확인용 상태 (tests, tools/shots.js)
  function snapshot() {
    const a = actor('dubu');
    return {
      artSet: root.PH_ART_SET, cols: L.w, rows: L.h, W, H,
      mode: G.mode, zone: G.zone, visitKind: G.visitKind, scale: G.scale, cues: G.cues.slice(), acts: G.acts.slice(),
      player: (() => { const d = actor('player'); return d ? { visible: d.visible, x: d.x, y: d.y, px: d.px, py: d.py, face: d.face, moving: d.moving || !!d.glide || d.path.length > 0, zone: d.zone } : null; })(),
      ctrl: G.ctrl, me: (() => { const m = me(); return { id: m.id, x: m.x, y: m.y, px: m.px, py: m.py, face: m.face, moving: m.moving || !!m.hop || !!m.glide || m.path.length > 0, zone: m.zone, perch: !!m.perch }; })(),
      wander: (() => { const d = actor('dubu'); return d && d.wd ? { doing: d.wd.doing || null, wait: Math.round(d.wd.next - performance.now()) } : null; })(),
      gate: G.gate, night: G.night, lampOff: root.PHArt.lampOff, lampLit: root.PHArt.lampLit, fadeT: G.fadeT, active: G.active,
      dubu: { x: a.x, y: a.y, px: a.px, py: a.py, face: a.face, pose: a.pose, moving: a.moving || !!a.hop || a.path.length > 0, visible: a.visible, zone: a.zone, perch: !!a.perch },
      dialog: G.dialog ? { name: G.dialog.name, text: G.dialog.pages[G.dialog.idx], shown: G.els.dlg.querySelector('.dl-vis').textContent, done: G.dialog.done, idx: G.dialog.idx, count: G.dialog.pages.length } : null,
      bubble: G.bubble ? G.bubble.text : null,
      dlgHidden: G.els.dlg.hidden, dlgTop: G.els.dlg.classList.contains('top'),
    };
  }
  // 칸 (x, y)의 화면 좌표(창 기준 px, 칸 가운데)
  function tileToClient(x, y) { const r = G.els.cv.getBoundingClientRect(); return { x: Math.round(r.left + (x * T + T / 2) * G.scale), y: Math.round(r.top + (y * T + T / 2) * G.scale) }; }
  function pathDirs(x, y) {
    const a = me(), p = pathAvoid(a, x, y);
    if (!p) return null;
    let cx = a.x, cy = a.y;
    return p.map((s) => { const d = World.faceOf(s.x - cx, s.y - cy); cx = s.x; cy = s.y; return d; });
  }

  // 탭 전환 (main.js). 우리집 탭이 아니면 멈춤: 누르고 있던 키를 놓고 말풍선을 숨김. 연출·대화·두부 자리·대사 기록은 그대로
  function setActive(on) {
    G.active = !!on;
    if (!on) { G.held = []; hideBubble(); return; }
    resize(); if (G.els.stage) G.els.stage.focus();
  }
  // 사이드바 두부 한마디: 집 안 클릭 대사와 같은 묶음·같은 "바로 앞 제외" 기록을 씀
  function sayLine(path) { return pickLine(path || ['click']); }
  function setWander(on) { G.wanderOn = !!on; }
  function wanderNow(what) { const d = actor('dubu'); if (!d) return; d.wd = d.wd || {}; d.wd.next = 0; G.wanderForce = what || null; } // 시험·확인용: 바로 다음 일 하기
  function hitTest(x, y) { const a = actorAt(x, y); return a ? a.id : null; } // 시험용: 캔버스 px -> 캐릭터 id
  // 세트를 바꿀 때 넘기는 지금 자리 (공간 + 전개도 안 비율 + 바라보는 쪽)
  function resumeState() { const m = me(); return { zone: World.roomAt(L, m.x, m.y) || G.zone, fx: (m.x + 0.5) / L.w, fy: (m.y + 0.5) / L.h, face: m.face }; }
  // (interact) 다른 모듈이 캐릭터를 움직이고 말하게: goTo = 그 칸까지 걸어감(테이블 위면 먼저 내려옴) -> 도착하면 true
  function goTo(id, x, y) {
    const a = actor(id);
    return new Promise((resolve) => {
      if (!a) { resolve(false); return; }
      const start = () => {
        if (a.x === x && a.y === y) { resolve(true); return; }
        const p = pathAvoid(a, x, y); if (!p || !p.length) { resolve(false); return; }
        a.path = p; a.arrive = () => { a.arrive = null; resolve(a.x === x && a.y === y); };
      };
      a.arrive = null; a.path = [];
      if (a.perch) { a.perch = null; hopTo(a, a.x * T, a.y * T, 220, () => { a.pose = null; start(); }); } else if (a.hop) { const h = a.hop, f = h.done; h.done = () => { if (f) f(); a.perch = null; start(); }; } else start();
    });
  }
  function bubble(id, text, opt) { const a = actor(id); if (a && a.visible) sayBubble(a, text, opt); return !!(a && a.visible); }
  root.PHGame = { G, init, me, actor, goTo, bubble, hideBubble, occupied: (x, y, id) => occupied(x, y, actor(id)), grid: () => gridOf(), enter, resume, resumeState, isCut, snapshot, hitTest, actorBox: (id) => actorBox(actor(id)), playerTile: () => PLAYER_TILE(), setActive, sayLine, restSpot, restLanding, setWander, wanderNow, onDubuClick: (a) => onDubuClick(a || actor('dubu')), tileToClient, pathDirs, skipIntro, setDayNight, applyLight, BRAINS, CUES };
})(window);
