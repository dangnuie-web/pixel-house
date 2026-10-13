// 집 안 상호작용 (F 틀 + B 물 화분 + A 오늘 약속 한 줄 + C 하루 마감). D 기분 4칸·오늘 한마디는 2026-10-13 뺌.
// 계산은 js/interact_logic.js, 물건 표는 js/data/interactions.js, 대사는 js/data/interact_lines.js (부기 MVP 대사 v01)
// 누르기: 물건 클릭(그림이 칠해진 곳) 또는 제작자 캐릭터가 마주 본 칸의 물건에 Space.
//   걸을 수 있는 칸 위 그림(카펫·의자·가구 윗부분)은 제작자이 그 물건 위·바로 옆일 때만 클릭이 반응 (멀면 예전처럼 걸어감)
// 막는 때: 입장 연출·밝아지기, 대화창(두부 대화창·입장 대화), 다른 탭, 기능 입구가 진행 중일 때. 같은 물건 연타는 쉬는 시간(COOLDOWN_MS) 안에 무시
// game.js가 부르는 것: onClick(p, me) / onSpace(me) / hover(p, me) / tick(now) / draw(ctx, now) / afterIntro(kind)
// render.js가 부르는 것: PHObjFx(o, t) (흔들림·물 화분 단계·TV 화면), sprites.js가 부르는 것: PHArt.pixelHook (스탠드 하나씩 켜고 끄기)
(function (root) {
  'use strict';
  const S = root.PH_SETTINGS, L = root.PH_LAYOUT, T = L.T, Art = root.PHArt, World = root.PHWorld;
  const IL = root.PHInteractLogic, TB = root.PH_INTERACTIONS, LN = root.PH_INTERACT_LINES, DL = root.PH_DIALOG_LINES || {};
  const Md = root.PHLifeMd, LL = root.PHLifeLog;
  const Game = () => root.PHGame, G = () => root.PHGame.G;

  const IX = {
    now: () => Date.now(), // 시험에서 시각을 바꿈
    spotList: null, cool: {}, fx: {}, tv: false, busy: false, hoverId: null, faceId: null,
    closedDate: null, dim: false, water: null, sparkles: [], pendingSparkle: false, lastPick: {}, log: [], night: null,
  };

  // ---- 누르는 곳 ----
  const frameOf = (sprite) => { const a = Art.sprite(sprite); return a && a.frames ? a.frames[0] : null; };
  // 가구 ↔ 기능은 연결표(js/features.js 기본 + 앱 설정 사용자 값, js/furnish.js). 연결이 바뀌거나 연결 모드를 켜고 끄면 다시 만듦
  const FS = () => root.PHFurnish;
  function spots() { if (!IX.spotList) IX.spotList = IL.spots(L, TB, frameOf, (k) => (root.PH_ASSETS || {})[k] || null, { links: FS() ? FS().links : null, all: !!IX.connect }); return IX.spotList; }
  function refresh() { IX.spotList = null; IX.hoverId = null; }
  if (FS() && FS().onChange) FS().onChange(refresh);
  // 붙은 기능이 지금 열리는지: 기능 없음 / 습관 줄을 지워 꺼진 기능(대변·식사·요가) = null (일반 가구 반응)
  function activeGo(s) { const c = s.conf; if (!c.go) return null; if (c.fid && FS() && !FS().isOn(c.fid)) return null; return c.go; }
  const goLine = (s) => pick([s.conf.fnLines || ['obj', s.type, 'go']]); // 기능을 옮겨도 그 기능 대사 (없으면 그 가구의 go 대사)
  const byId = (id) => spots().find((s) => s.id === id) || null;
  function opaque(s, x, y) {
    const a = Art.sprite(s.o.sprite); if (!a) return true;
    const fr = a.frames[(s.o.frame || 0) % a.frames.length], fx = Math.floor(x - s.o.px), fy = Math.floor(y - s.o.py);
    if (fy < 0 || fy >= fr.length || fx < 0 || fx >= fr[0].length) return false;
    const v = (Art.paletteOf(a) || {})[fr[fy][fx]];
    return !(v == null || v === '' || v === 'transparent');
  }
  const dlgOpen = () => !!(root.PHDialog && root.PHDialog.isOpen());
  // 반응하지 않는 때 (대화창·입장 연출·밝아지기·다른 탭·기능 입구 진행 중)
  function blocked() { const g = G(); return !g || g.mode !== 'play' || !g.active || !!g.dialog || g.fadeT != null || dlgOpen() || IX.busy || modalOpen() || !!IX.connect; }
  // 집 위 창 (물·인벤토리·메모지·옷장)이 열려 있으면 집 물건은 반응 안 함 (창 뒤 판이 덮지만 Space·표시도 막음)
  function modalOpen() { return ['PHWaterModal', 'PHInventory', 'PHFridgeMemo', 'PHWardrobe', 'PHBookModal', 'PHRecordModal', 'PHBucketMemo', 'PHLogModal', 'PHSleepModal'].some((k) => root[k] && root[k].isOpen && root[k].isOpen()); }

  // ---- 대사 ----
  // 공용 집 가구 대사 (부기 공용판 v01 3절): 배치표에 자리(slots)가 있는 집이면 objRoom[지금 그림] -> objRoom[type] -> obj[type]
  //   지금 그림 = 그 type 물건의 sprite. type이 물건이 아니면(요가 obj.rug_round 등) 그 이름을 후보로 가진 자리의 지금 그림 (러그 자리 = 큰 타원 러그)
  function roomSprite(T) {
    const o = ((root.PH_LAYOUT && root.PH_LAYOUT.objects) || []).find((q) => q.type === T); if (o) return o.sprite;
    const HS = root.PHHouseSlots, sl = HS && HS.slots.find((x) => x.candidates.some((c) => c.sprite === T)); return sl ? sl.sprite : null;
  }
  function roomList(path) {
    const R = LN.objRoom; if (!R || !root.PHHouseSlots || !root.PHHouseSlots.slots.length || path[0] !== 'obj' || path.length < 2) return null;
    for (const k of [roomSprite(path[1]), path[1]]) {
      if (!k || !R[k]) continue;
      let v = path.slice(2).reduce((o, x) => (o && !Array.isArray(o) ? o[x] : null), R[k]);
      if (path.length === 2 || v != null) { if (v && !Array.isArray(v) && typeof v === 'object') v = v.idle || null; if (v) return Array.isArray(v) ? v : [v]; }
    }
    return null;
  }
  function list(path) {
    const rv = roomList(path); if (rv) return rv;
    let v = path.reduce((o, k) => (o ? o[k] : null), LN);
    if (v == null) v = path.reduce((o, k) => (o ? o[k] : null), DL);
    if (v && !Array.isArray(v) && typeof v === 'object') v = v.idle || null;
    return Array.isArray(v) ? v : v ? [v] : [];
  }
  function pick(paths, vars) { // 여러 묶음을 합쳐 한 줄 (바로 앞 줄 제외). 괄호 연출은 빼고 글만
    const all = [].concat(...paths.map(list)), key = paths.map((p) => p.join('.')).join('+');
    const i = World.pick(all, IX.lastPick[key], Math.random, () => true); if (i < 0) return '';
    IX.lastPick[key] = i;
    return IL.fill(World.parseLine(all[i]).say, vars);
  }
  function say(text, opt) { if (!text) return false; IX.log.push(text); return Game().bubble((opt && opt.who) || 'dubu', text, opt); }
  function sideSay(text) { if (text && root.PHApp && root.PHApp.sideSay) root.PHApp.sideSay(text); }

  // ---- 입력 (game.js) ----
  function onClick(p, me) {
    const s = IL.hitAt(spots(), p.x, p.y, opaque); if (!s) return false;
    // 걸을 수 있는 칸(카펫, 의자, 가구 그림 윗부분이 덮은 바닥)을 눌렀으면: 제작자이 그 물건 바로 옆·위일 때만 반응, 멀면 예전처럼 걸어감
    if (World.walkable(Game().grid(), Math.floor(p.x / T), Math.floor(p.y / T)) && !IL.nearFloor(s, me, T)) return false;
    wake();
    if (!blocked()) activate(s, 'click');
    return true;
  }
  function onSpace(me) {
    if (blocked() || G().ctrl === 'dubu') return false;
    const s = IL.faceTarget(spots(), Game().grid(), me, T); if (!s) return false;
    wake(); activate(s, 'space');
    return true;
  }
  // (logs 2026-10-04) game.js onSpace가 두부 옆일 때 먼저 부름: 마주 본 물건이 spaceOverDubu(table_two)이고 마주 본 칸이 두부 칸이 아니면 그 물건 -> true
  //   두부 칸 = 서 있는 칸, 테이블 위에 앉아 있으면 앉은 칸(perch.tile)과 그림이 놓인 칸
  function onSpaceOverDubu(me, d) {
    if (blocked() || G().ctrl === 'dubu') return false;
    const s = IL.faceTarget(spots(), Game().grid(), me, T); if (!s || !s.conf.spaceOverDubu || !activeGo(s)) return false; // 테이블에 기능이 없거나 꺼지면 두부 대화창이 먼저 (예전처럼)
    const dir = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[me.face] || [0, 1], fx = me.x + dir[0], fy = me.y + dir[1];
    const tiles = d.perch ? [d.perch.tile, { x: Math.floor((d.px + T / 2) / T), y: Math.floor((d.py + T / 2) / T) }] : [{ x: d.x, y: d.y }];
    if (tiles.some((t) => t && t.x === fx && t.y === fy)) return false;
    wake(); activate(s, 'space');
    return true;
  }
  function hover(p, me) {
    if (blocked()) { IX.hoverId = null; return false; }
    const s = IL.hitAt(spots(), p.x, p.y, opaque);
    IX.hoverId = s && !(World.walkable(Game().grid(), Math.floor(p.x / T), Math.floor(p.y / T)) && !IL.nearFloor(s, me, T)) ? s.id : null;
    return !!IX.hoverId;
  }

  // ---- 반응 ----
  function linesOf(s) { return s.conf.lines ? [s.conf.lines] : [['obj', s.type]]; }
  function activate(s, how) {
    // 아래 칸(하단장 등)의 기능이 꺼졌으면 본체를 누른 것과 같음
    if (s.kind === 'part' && s.conf.fid && !activeGo(s) && s.parent) { const p = byId(s.parent); if (p) return activate(p, how); }
    const now = performance.now(), g = G();
    const cd = s.conf.fx === 'lamp' ? TB.LAMP_COOLDOWN_MS : TB.COOLDOWN_MS;
    // 연타: 쉬는 시간 안이거나 그 물건 말풍선이 아직 떠 있으면 무시 (불 켜기·끄기는 짧게 쉬고 다시 됨)
    if (now < (IX.cool[s.id] || 0) || (s.conf.fx !== 'lamp' && g.bubble && g.bubble.tag === 'obj:' + s.id)) { IX.last = { id: s.id, ignored: true }; return; }
    IX.cool[s.id] = now + cd;
    IX.last = { id: s.id, type: s.type, how, at: now };
    IX.last.fid = s.conf.fid || null;
    const go = activeGo(s); // 기능이 없거나 꺼졌으면 null = 일반 가구 반응 (제작자 결정 2026-10-04)
    if (go === 'water') return sinkWater(s);
    if (go === 'close') return bedClose(s);
    if (go === 'yoga') return rugYoga(s);
    if (go === 'meetings' || go === 'archive' || go === 'study' || go === 'reading') return openTab(s, go);
    if (go === 'inventory' && root.PHInventory) { root.PHInventory.open(s.conf.cat, s.type, s.conf.pill, s.conf.say).then((ok) => { if (!ok) IX.cool[s.id] = 0; }); return; } // 인벤토리 창 (js/inventory.js)
    if (go === 'bucketMemo' && root.PHBucketMemo) { root.PHBucketMemo.open('wall').then((ok) => { if (!ok) IX.cool[s.id] = 0; }); return; } // 벽 메모지 = 버킷리스트 메모지 창 (js/bucket_memo.js, 2026-10-08 메모지를 가구처럼)
    if (go === 'fridgeMemo' && root.PHFridgeMemo) { root.PHFridgeMemo.open(s.type).then((ok) => { if (!ok) IX.cool[s.id] = 0; }); return; } // 냉장고 메모지 창 (js/fridge_memo.js)
    if ((go === 'poopLog' || go === 'mealLog') && root.PHLogModal) { root.PHLogModal.open(go === 'poopLog' ? 'poop' : 'meal', { from: s.type, line: goLine(s) }).then((ok) => { if (!ok) IX.cool[s.id] = 0; }); return; } // 대변·식사 일지 창 (js/log_modal.js, logs 2026-10-04)
    if (go === 'waterModal' && root.PHWaterModal) { root.PHWaterModal.open(s.type).then((ok) => { if (!ok) IX.cool[s.id] = 0; }); return; } // 정수기 물 기록 창 (js/water_modal.js)
    if (go === 'recordModal' && root.PHRecordModal) { // TV = 영화 기록 창 (js/record_modal.js, 2026-10-08). TV도 켜짐. 한 가구에 한 기능: TV = 영화 / 기록 칸(rk:, 연극 포함)을 붙인 가구 = 그 칸 하나
      const f = root.PHFeatures.get(s.conf.fid), group = f && f.rk ? [f.kind] : (FS() && FS().movieKinds ? FS().movieKinds() : ['영화']);
      if (s.conf.fx === 'tv') IX.tv = true;
      root.PHRecordModal.open(s.type, null, group[0], group).then((ok) => { if (!ok) IX.cool[s.id] = 0; }); return;
    }
    if (go === 'bookModal' && root.PHBookModal) { startFx(s, s.conf.fx); root.PHBookModal.open(s.type, goLine(s)).then((ok) => { if (!ok) IX.cool[s.id] = 0; }); return; } // 책꽂이 = 독서 책꽂이 창 (js/book_modal.js), 두부 한 줄은 사이드바
    if (go === 'wardrobe' && root.PHWardrobe) { if (!root.PHWardrobe.openFrom(s)) IX.cool[s.id] = 0; return; } // 옷 갈아입기 창 (js/wardrobe.js, v10만)
    if (s.conf.fx === 'lamp') return toggleLamp(s);
    if (s.conf.fx === 'tv') { IX.tv = !IX.tv; say(pick(linesOf(s)), { tag: 'obj:' + s.id }); return; }
    if (s.conf.plant) { say(pick([['waterplant', plantStage()]]), { tag: 'obj:' + s.id }); return; }
    startFx(s, s.conf.fx);
    say(pick(linesOf(s)), { tag: 'obj:' + s.id });
  }
  function startFx(s, kind) {
    if (!kind || kind === 'none') return;
    const id = s.parent || s.id, o = s.o;
    if (kind === 'sparkle') { addSparkle([s.rect[0] + s.rect[2] / 2, s.rect[1] + Math.min(6, s.rect[3] / 3)]); return; }
    if (o) IX.fx[o.id || id] = { kind, t0: performance.now() };
  }
  // 기능 입구: 말풍선 한 줄 -> 잠깐 뒤 탭 열기 (사이드바 두부가 같은 줄을 이어 말함)
  const TAB_OF = { meetings: 'meetings', archive: 'archive', study: 'habits', reading: 'archive' }; // reading = 생활일지 > 독서 (js/journal.js)
  function openTab(s, go) {
    const text = goLine(s);
    startFx(s, s.conf.fx); say(text, { tag: 'obj:' + s.id });
    if (s.conf.open && Art.has(s.conf.open) && s.o) IX.fx[s.o.id] = { kind: 'open', sprite: s.conf.open, t0: performance.now() }; // 냉장고 문 열림
    IX.busy = true;
    setTimeout(async () => {
      IX.busy = false;
      if (!root.PHApp || G().mode !== 'play') return;
      if (go === 'reading' && root.PHJournal) root.PHJournal.tab = 'reading'; // 생활일지 안 탭을 독서로 맞춘 뒤 열기
      await root.PHApp.selectTab(TAB_OF[go]);
      sideSay(text);
      if (go === 'study') flashIn('[data-card="공부"]');
    }, IX.goDelay != null ? IX.goDelay : 700);
  }
  function flashIn(sel) {
    const el = document.querySelector('#screen-habits:not([hidden]) ' + sel); if (!el) return null;
    if (el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'auto' });
    el.classList.add('ix-flash'); setTimeout(() => el.classList.remove('ix-flash'), 1600);
    return el;
  }

  // ---- 불 (스탠드 3개: 옷방 스탠드 floorlamp, 거실 장스탠드 floorlamp_round, 책꽂이 작은 조명 bookshelf) ----
  //   그리는 법 (무늬 MVP 그림 v10): 배경의 웅덩이 글자 Q는 늘 꺼진 색(F). 켜진 스탠드만 웅덩이 덮개 lamppool_<물건>을 배경 바로 다음에,
  //   등갓은 <물건>_on 그림으로 바꿔 그림. 끈 스탠드는 원래 그림 + 그 물건만 등갓 E -> S(꺼진 색)
  //   켜짐 기본 = 밤 켜짐 / 낮 꺼짐. 누르면 하나씩 바뀌고 그날 동안 기억 (하루 경계 DAY_START_HOUR가 지나면 기본으로)
  //   입장 연출: Art.lampOff(모두 꺼짐) 동안은 웅덩이·켜진 그림 없음, 밝아지기(lampLit)부터 켜진 스탠드가 먼저 다 밝은 색
  //   그 세트에 덮개 그림이 없으면(v08·v09) 그림은 안 바꾸고 말풍선만
  const assetsOf = () => root.PH_ASSETS || {};
  function poolOf(type) { const A = assetsOf(); return Object.keys(A).find((k) => A[k] && A[k].lamp === type && A[k].px != null) || null; }
  function onSpriteOf(type) { const A = assetsOf(); return Object.keys(A).find((k) => A[k] && A[k].replaces === type && /_on$/.test(k)) || null; }
  const lampTypes = () => Array.from(new Set(spots().filter((s) => s.lamp).map((s) => s.lamp)));
  const lampArt = () => lampTypes().some((t) => poolOf(t));
  function lampStore() {
    const date = IL.logDate(IX.now(), S.DAY_START_HOUR);
    if (!IX.lampMem || IX.lampMem.date !== date) {
      let m = null; try { m = JSON.parse(localStorage.getItem(TB.LAMP_STORE_KEY) || 'null'); } catch (e) { m = null; }
      IX.lampMem = m && m.date === date && m.on && typeof m.on === 'object' ? m : { date, on: {} };
    }
    return IX.lampMem;
  }
  function lampOn(type) { const v = lampStore().on[type]; return typeof v === 'boolean' ? v : !!(G() && G().night); }
  function lampLitNow(type) { return !Art.lampOff && lampOn(type); } // 그림으로 켜져 보이는지 (입장 어둠 중엔 모두 꺼짐)
  function toggleLamp(s) {
    if (!s.lamp) return;
    const on = !lampOn(s.lamp), m = lampStore(); m.on[s.lamp] = on;
    try { localStorage.setItem(TB.LAMP_STORE_KEY, JSON.stringify(m)); } catch (e) { /* 기억 못 해도 지금은 바뀜 */ }
    const key = s.kind === 'part' ? (on ? s.conf.lines : null) : ['obj', s.type, on ? 'on' : 'off'];
    if (key) say(pick([key]), { tag: 'obj:' + s.id });
  }
  // sprites.js: 배경 Q = 늘 꺼진 색, 끈 스탠드 그림 E = 꺼진 색(S). 다른 그림은 그대로
  function pixelHook(key, a) {
    if (!root.PHGame || !G() || G().mode === 'off' || Art.lampOff || !lampArt()) return null; // 입장 어둠 = 원래 규칙(모두 꺼짐)
    if (key === 'background') {
      if (!(a.palette && 'Q' in a.palette)) return null;
      return { tag: 'q0', at(x, y, ch, pal) { return ch === 'Q' ? (pal.F || Art.mix(Art.LAMP_OFF_COLOR.Q, Art.fadeT)) : null; } };
    }
    const type = lampTypes().find((t) => t === key); if (!type || lampOn(type)) return null;
    const P = root.PH_PALETTE || {}, offE = (Art.night ? (P.night || {}).S : (P.day || {}).S) || Art.LAMP_OFF_COLOR.E;
    return { tag: 'off', at(x, y, ch, pal) { return ch === 'E' ? (pal.S || Art.mix(offE, Art.fadeT)) : null; } };
  }
  function afterMap(ctx) { // 켜진 스탠드 웅덩이
    if (Art.lampOff || !lampArt()) return;
    lampTypes().forEach((t) => { const k = poolOf(t), a = k && assetsOf()[k]; if (a && lampLitNow(t)) ctx.drawImage(Art.frameCanvas(k, 0), a.px, a.py); });
  }

  // ---- 흔들림·다른 그림·덮개 (render.js) ----
  const SHAKE = [1, -1, 1, -1, 0], HOP = [-1, -2, -1, 0];
  function frameAt(key, t) { // 그림 JSON ms(장마다 시간)로 반복 장 번호
    const a = assetsOf()[key]; if (!a) return 0;
    const ms = a.ms || [], n = a.frames.length; if (n < 2 || !ms.length) return 0;
    const total = ms.reduce((x, y) => x + y, 0); let r = t % total, i = 0; while (i < n - 1 && r >= ms[i]) { r -= ms[i]; i++; } return i;
  }
  function objFx(o, t) {
    let out = null;
    const f = IX.fx[o.id];
    if (f) {
      const el = performance.now() - f.t0, i = Math.floor(el / 60);
      if (f.kind === 'shake' && i < SHAKE.length) out = { dx: SHAKE[i] };
      else if (f.kind === 'hop' && i < HOP.length) out = { dy: HOP[i] };
      else if (f.kind === 'open' && el < (TB.OPEN_MS || 1200)) out = { sprite: f.sprite };
      else delete IX.fx[o.id];
    }
    if (o.layer == null || o.layer !== 'floor') {
      if (lampTypes().includes(o.type) && lampLitNow(o.type)) { const k = onSpriteOf(o.type); if (k && Art.has(k)) out = Object.assign(out || {}, { sprite: k }); }
    }
    const wp = TB.WATER_PLANT;
    if (wp && o.type === wp.on) { // 물 화분 덮개 (sink_v 다음)
      const st = wp.stages.find((x) => x.id === plantStage()), a = st && assetsOf()[st.sprite];
      if (a && a.px != null && Art.has(st.sprite)) { const prev = out && out.after; out = Object.assign(out || {}, { after: (ctx) => { if (prev) prev(ctx); ctx.drawImage(Art.frameCanvas(st.sprite, 0), a.px + ((out && out.dx) || 0), a.py + ((out && out.dy) || 0)); } }); }
    }
    if (o.type === 'tv_cabinet' && IX.tv) { // TV 화면 덮개
      const k = TB.TV_SPRITE, a = assetsOf()[k];
      if (a && a.px != null && Art.has(k)) { const prev = out && out.after; out = Object.assign(out || {}, { after: (ctx) => { if (prev) prev(ctx); ctx.drawImage(Art.frameCanvas(k, frameAt(k, t)), a.px + ((out && out.dx) || 0), a.py + ((out && out.dy) || 0)); } }); }
    }
    return out;
  }
  objFx.afterMap = afterMap;

  // ---- B 물 화분 ----
  function waterNow() {
    const d = root.PHLife && root.PHLife.data; if (!d) return null;
    const habit = S.WATER_HABIT || '물', last = Md.latestSlots(d.records, habit, IX.now(), S.DAY_START_HOUR); // 물컵과 같은 "오늘" (main의 latestSlots는 넷째 값 = 하루 경계. 이 브랜치 옛 함수는 무시 = 자정)
    const row = d.habits && d.habits.rows.find((r) => r.name === habit && r.slots > 0);
    return { n: last && last.isToday ? last.value : 0, of: row ? row.slots : 6, row: !!row };
  }
  function plantStage() { const w = IX.water || waterNow(); return IL.waterStage(w ? w.n : 0, TB.WATER_PLANT.stages); }
  // 물 칸이 어디서 바뀌든(싱크대·사이드바 물컵·대화창) 같은 화분. 꽃이 피는 순간(5칸)·6칸이 되는 순간 반짝임 한 번 (집 화면이 안 보이면 돌아왔을 때)
  function watchWater() {
    const d = root.PHLife && root.PHLife.data; if (d === IX.waterData) return;
    IX.waterData = d; const w = waterNow(), prev = IX.water; IX.water = w;
    if (!prev || !w) return;
    const st = (n) => IL.waterStage(n, TB.WATER_PLANT.stages);
    if ((prev.n < w.of && w.n >= w.of) || (st(prev.n) !== 'bloom' && st(w.n) === 'bloom')) IX.pendingSparkle = true;
  }
  async function sinkWater(s) {
    IX.busy = true;
    try {
      const api = root.PHDesktop && root.PHDesktop.setWater ? root.PHDesktop : null, Life = root.PHLife;
      if (!api || !Life) { say(root.PH_LINES.ui.browserOnly); return; }
      if (!Life.data) await Life.load();
      const w = waterNow(); if (!w || !w.row) { say(root.PH_LINES.ui.water.fail); return; }
      if (w.n >= w.of) { say(pick([['water', 'over']])); return; }
      const before = IL.waterStage(w.n, TB.WATER_PLANT.stages), n = w.n + 1;
      const res = await api.setWater(n, Life.lastModified);
      Life.data = Md.parse(res.text); Life.lastModified = res.lastModified; Life.readAt = Date.now();
      if (res.conflict) { say(root.PH_LINES.ui.water.conflict); return; }
      watchWater();
      const after = IL.waterStage(n, TB.WATER_PLANT.stages);
      IX.lastWater = { n, of: w.of, date: res.date };
      // 말풍선 한 번에 한 줄: 6칸 = water.full / 화분 단계가 바뀌는 순간 = plant.grow·bloom (부기 권장) / 그 밖 = sink.water·water.up 묶음
      if (n >= w.of) say(pick([['water', 'full']], { n }));
      else if (after !== before) say(pick([['plant', after]]));
      else say(pick([['sink', 'water'], ['water', 'up'], ['ui', 'water', 'up']], { n }));
    } catch (e) { IX.lastError = String(e && e.message || e); say(root.PH_LINES.ui.water.fail); }
    finally { IX.busy = false; }
  }

  // ---- 반짝임 (무늬 sparkle: anchor 가운데, ms대로 한 번 재생). 그림이 없는 세트는 안 그림 ----
  function addSparkle(pt) {
    const k = TB.SPARKLE_SPRITE, a = assetsOf()[k]; if (!a || !Art.has(k)) return false;
    const ms = a.ms && a.ms.length ? a.ms : a.frames.map(() => 100);
    IX.sparkles.push({ x: pt[0], y: pt[1], t0: performance.now(), ms, total: ms.reduce((x, y) => x + y, 0) }); IX.sparkleCount = (IX.sparkleCount || 0) + 1;
    return true;
  }
  function drawSparkles(ctx, now) {
    const k = TB.SPARKLE_SPRITE, a = assetsOf()[k]; if (!a) { IX.sparkles = []; return; }
    const an = a.anchor || [Math.floor(a.size[0] / 2), Math.floor(a.size[1] / 2)];
    IX.sparkles = IX.sparkles.filter((p) => now < p.t0 + p.total);
    IX.sparkles.forEach((p) => { let r = now - p.t0, i = 0; while (i < p.ms.length - 1 && r >= p.ms[i]) { r -= p.ms[i]; i++; } ctx.drawImage(Art.frameCanvas(k, i), Math.round(p.x - an[0]), Math.round(p.y - an[1])); });
  }

  // ---- "누를 수 있음" 표시 (무늬 hint: 꼬리 끝 anchor를 물건 윗변 가운데 2px 위, y<0이면 1). 그림이 없는 세트는 손 모양 커서만 ----
  function drawMark(ctx, s, now) {
    const k = TB.MARK_SPRITE, a = assetsOf()[k]; if (!a || !Art.has(k)) return;
    const an = a.anchor || [Math.floor(a.size[0] / 2), a.size[1] - 1], r = s.rect;
    const x = Math.round(r[0] + r[2] / 2) - an[0]; let y = Math.round(r[1]) - 2 - an[1]; if (y < 0) y = 1;
    ctx.drawImage(Art.frameCanvas(k, frameAt(k, now)), x, y);
  }

  // ---- 매 프레임 ----
  function tick() {
    const g = G();
    watchWater();
    if (IX.pendingSparkle && g.active && g.mode === 'play') { IX.pendingSparkle = false; addSparkle(TB.WATER_PLANT.sparkleAt); IX.sparkleAt = performance.now(); }
    IX.faceId = null;
    if (!blocked() && g.ctrl !== 'dubu') { const s = IL.faceTarget(spots(), Game().grid(), Game().me(), T); IX.faceId = s ? s.id : null; }
    if (blocked()) IX.hoverId = null;
  }
  function draw(ctx, now) {
    drawSparkles(ctx, now);
    if (blocked()) return;
    const shown = new Set([IX.faceId, IX.hoverId].filter(Boolean));
    shown.forEach((id) => { const s = byId(id); if (s) drawMark(ctx, s, now); });
  }

  // ---- A 오늘 약속 한 줄 (입장 인사 다음) ----
  function band(now) { return World.timeBand(new Date(now).getHours(), S.TIME_BANDS || []); }
  async function afterIntro() {
    const Life = root.PHLife; if (!Life) return;
    const data = await Life.load(); if (!data) return;
    const now = IX.now(), date = IL.logDate(now, S.DAY_START_HOUR), M = IL.meetingsFor(data, date), q = [];
    const one = (m, day) => (String(m.time || '').trim() ? pick([['appt', day]], { time: m.time, what: m.text }) : pick([['appt', day + 'Notime']], { what: m.text }));
    // 그날 냉장고 메모지로 오늘 약속을 이미 봤으면 appt.today를 또 말하지 않음 (토리 결정 2026-10-03, js/fridge_memo.js)
    const seen = root.PHFridgeMemo && root.PHFridgeMemo.apptSeen && root.PHFridgeMemo.apptSeen(date);
    if (M.today.length && !seen) { q.push(one(M.today[0], 'today')); if (M.today.length > 1) q.push(pick([['appt', 'more']])); }
    if (M.tomorrow.length && TB.APPT_TOMORROW_BANDS.includes(band(now))) q.push(one(M.tomorrow[0], 'tomorrow'));
    IX.appt = { today: M.today.length, tomorrow: M.tomorrow.length, lines: q.slice() };
    // 입장 화면에 이웃가 나온 날: 두부가 약속 줄 앞에 한 번 (js/main.js takeGuestLine, 같은 날 다시 들어오면 null)
    const gl = root.PHApp && root.PHApp.takeGuestLine ? root.PHApp.takeGuestLine() : null;
    if (gl) q.unshift(gl);
    IX.guestLine = gl;
    const next = () => {
      const text = q.shift(); if (!text) return;
      const g = G(); if (g.mode !== 'play' || (g.bubble && g.bubble.tag !== 'appt')) return; // 다른 말이 끼어들면 그만
      say(text, { tag: 'appt', ms: TB.APPT_BUBBLE_MS, onClick: text === gl ? null : () => { q.length = 0; if (root.PHApp) root.PHApp.selectTab('meetings'); } });
      setTimeout(() => { if (G().bubble && G().bubble.tag === 'appt') Game().hideBubble(); next(); }, TB.APPT_BUBBLE_MS + 150);
    };
    setTimeout(next, IX.apptDelay != null ? IX.apptDelay : 500);
  }

  // ---- C 하루 마감 (침대) ----
  function footTile(s) {
    const o = s.o, b = o.block, grid = Game().grid(); if (!b) return null;
    const fy = TB.BED_FOOT === 'bottom' ? o.py + o.size[1] : o.py, fx = o.px + o.size[0] / 2, me = Game().me();
    let best = null;
    for (let y = b[1] - 1; y <= b[1] + b[3]; y++) for (let x = b[0] - 1; x <= b[0] + b[2]; x++) {
      if (x >= b[0] && x < b[0] + b[2] && y >= b[1] && y < b[1] + b[3]) continue;
      if (!World.walkable(grid, x, y) || (me && me.x === x && me.y === y) || Game().occupied(x, y, 'dubu')) continue;
      // 다른 그림(침대 윗부분·의자 등)이 덮는 칸은 빼서 두부가 가려지지 않게 (바닥 물건은 괜찮음)
      if (L.objects.some((q) => q.layer !== 'floor' && q.px != null && q.size && x * T + 8 >= q.px && x * T + 8 < q.px + q.size[0] && y * T + 15 >= q.py && y * T < q.py + q.size[1])) continue;
      const d = Math.hypot(x * T + 8 - fx, y * T + 8 - fy); if (!best || d < best.d) best = { x, y, d };
    }
    return best;
  }
  async function bedClose(s) {
    const now = IX.now(), date = IL.logDate(now, S.DAY_START_HOUR);
    if (!TB.CLOSE_BANDS.includes(band(now))) { // 아침·낮 = 잠 칠하기 창 (오늘 줄, js/sleep_modal.js). 제작자 2026-10-09: 저녁·밤(·새벽)은 하루 마감 그대로
      const SM = root.PHSleepModal;
      if (SM && root.PHDesktop && root.PHDesktop.setSleepWindow) { IX.lastBed = 'sleep'; SM.open({ from: 'bed', band: band(now), date }).then((ok) => { if (!ok) IX.cool[s.id] = 0; }); return; }
      IX.lastBed = 'noWrite'; say(pick([['close', 'day']]), { tag: 'obj:' + s.id }); return; // 쓰기가 안 되는 화면 (부기 잠기록 3절 bedNoWrite = close.day)
    }
    if (IX.closedDate === date) { say(pick([['obj', 'bed', 'after']]), { tag: 'obj:' + s.id }); return; }
    if (!root.PHDialog || !root.PHDialog.openFlow) return;
    IX.busy = true;
    let res = null;
    try {
      const d = Game().actor('dubu'), ft = footTile(s);
      if (d && ft) {
        const walk = Game().goTo('dubu', ft.x, ft.y);
        await Promise.race([walk, new Promise((r) => setTimeout(r, IX.walkLimit || 7000))]);
        d.face = 'down'; d.pose = 'sit'; d.wd = Object.assign(d.wd || {}, { next: performance.now() + 10 * 60000, doing: 'bed' }); // 발치에서 한동안 쉼
      }
      IX.busy = false; // 대화창이 열린 뒤에는 대화창이 입력을 막음
      res = await root.PHDialog.openFlow((ui, ctx) => closeFlow(ui, ctx, date));
    } finally { IX.busy = false; }
    IX.lastClose = res;
    if (res && res.closed) { IX.closedDate = date; setDim(true); }
  }
  async function closeFlow(ui, ctx, date) {
    const out = { closed: false, steps: [] };
    if (!ctx.data) { await ui.tell(pick([['common', 'browser']])); return out; }
    const data = Md.parse(ctx.data.text), log = LL.parse(ctx.data.text);
    const items = IL.dayCard(data, log, date, { waterHabit: S.WATER_HABIT });
    out.items = items;
    const start = pick([['close', 'start']]);
    if (items.length) { if ((await ui.tell(start, { card: { title: pick([['close', 'cardTitle']]), items } })) == null) return out; }
    else { if ((await ui.tell(start)) == null) return out; if ((await ui.tell(pick([['close', 'cardEmpty']]))) == null) return out; }
    out.steps.push('card');
    // 2026-10-13 제작자: "한마디 남길게 / 그냥 잘게" 묻기 뺌 (오늘 한마디·기분 뺌). 카드 다음 바로 잘 자요
    await ui.tell(pick([['close', 'goodnight']]));
    out.closed = true; out.steps.push('goodnight');
    return out;
  }
  // "잘 자요냥~" 뒤 한 단계 어둡게 (무늬 fade 표 한 단계). 제작자이 다시 움직이거나 무엇을 누르면 원래 밝기
  function setDim(on) {
    IX.dim = !!on; Art.fadeT = on ? TB.DIM_T : null;
    if (root.PHGame && root.PHGame.applyLight) root.PHGame.applyLight();
  }
  function wake() { if (IX.dim) setDim(false); }

  // ---- 옷방 카펫: 요가 묻기 ----
  //   "했어" = main의 PHLife.toggleWeekly('요가') -> { done, count, of, line, conflict } (말은 여기서: line을 두부 말풍선으로)
  //   그 함수가 없으면(이 브랜치 단독) 생활 습관 탭을 열어 요가 줄을 보여 줌. 오늘 이미 요가를 적었으면 묻지 않음 (뒤집기라 지워지지 않게)
  function weeklyFn() { return (root.PHLife && root.PHLife.toggleWeekly) || root.toggleWeekly || null; }
  async function rugYoga(s) {
    const Life = root.PHLife, data = Life && (Life.data || (await Life.load()));
    const w = data ? IL.weekly(data, IL.logDate(IX.now(), S.DAY_START_HOUR)).find((h) => h.name === '요가') : null;
    if (!w) { startFx(s, s.conf.fx); say(pick([['obj', 'rug_round', 'idle']]), { tag: 'obj:' + s.id }); return; }
    if (w.n >= w.of) { say(pick([['obj', 'rug_round', 'full']]), { tag: 'obj:' + s.id }); return; }
    const today = IL.logDate(IX.now(), S.DAY_START_HOUR), doneToday = (data.records || []).some((r) => Md.dateOf(r.date) === Md.dateOf(today) && r.items.some((i) => i.name === '요가'));
    if (doneToday) { say(pick([['obj', 'rug_round', 'idle']]), { tag: 'obj:' + s.id }); return; }
    if (!root.PHDialog || !root.PHDialog.openFlow) return;
    const r = await root.PHDialog.openFlow(async (ui) => {
      const a = await ui.ask(pick([['obj', 'rug_round', 'go']]), [{ id: 'yes', label: LN.btn.rugYes }, { id: 'no', label: LN.btn.rugNo }], { cols: 2 });
      if (a === 'no') await ui.tell(pick([['obj', 'rug_round', 'no']]));
      return { answer: a };
    });
    IX.lastYoga = r;
    if (r && r.answer === 'yes') {
      const fn = weeklyFn();
      if (fn) { const res = await fn('요가'); IX.lastWeekly = res; if (res && res.line) say(res.line); return; } // main E 기능
      if (root.PHApp) { await root.PHApp.selectTab('habits'); const li = Array.from(document.querySelectorAll('#screen-habits li[data-line]')).find((x) => (x.querySelector('b') || {}).textContent === '요가'); if (li) { li.scrollIntoView({ block: 'center' }); li.classList.add('ix-flash'); setTimeout(() => li.classList.remove('ix-flash'), 1600); } }
    }
  }

  // 제작자이 움직이면(방향키·바닥 클릭) 어두워진 집이 원래 밝기로
  document.addEventListener('keydown', (e) => { if (IX.dim && /^Arrow/.test(e.key) && !dlgOpen()) wake(); });
  const cv = document.getElementById('cv'); if (cv) { cv.addEventListener('mousedown', () => { if (!dlgOpen()) wake(); }); cv.addEventListener('mouseleave', () => { IX.hoverId = null; }); } // 마우스가 집 그림 밖으로 나가면 표시 끔

  // 시험·확인용
  function state() {
    const g = G();
    const lamps = {}; lampTypes().forEach((t) => { lamps[t] = lampOn(t); });
    return { spots: spots().length, hover: IX.hoverId, face: IX.faceId, busy: IX.busy, lamps, lampArt: lampArt(), tv: IX.tv, dim: IX.dim, fadeT: Art.fadeT,
      water: IX.water, stage: plantStage(), sparkles: IX.sparkles.length, sparkleCount: IX.sparkleCount || 0, fx: Object.keys(IX.fx), closedDate: IX.closedDate, last: IX.last || null, log: IX.log.slice(), appt: IX.appt || null, bubble: g && g.bubble ? { text: g.bubble.text, tag: g.bubble.tag, act: !!g.bubble.onClick } : null };
  }
  function activateType(type, kind) { const s = spots().find((x) => x.type === type && (!kind || x.kind === kind)); if (s && !blocked()) activate(s, 'test'); return !!s; }
  // 냉장고 문 열린 그림 잠깐 (메모지 "냉장고 열기")
  function openFx(type) { const sp = spots().find((x) => x.type === type && x.kind === 'obj'); if (sp && sp.conf.open && Art.has(sp.conf.open) && sp.o) { IX.fx[sp.o.id] = { kind: 'open', sprite: sp.conf.open, t0: performance.now() }; return true; } return false; }
  const stageOf = (n) => IL.waterStage(n, TB.WATER_PLANT.stages); // 물 칸 수 -> 화분 단계 (정수기 창이 씀)
  // 연결 모드(js/furnish_ui.js)가 부름: 그 자리 가구 (조명·화분 칸은 본체로, 집 밖 구역·바깥 물건은 빼고). 걸을 수 있는 칸 제한 없음
  function spotAt(p) {
    let s = IL.hitAt(spots().filter((x) => x.kind !== 'area' && !(x.o && x.o.room === 'out')), p.x, p.y, opaque);
    if (s && s.kind === 'part' && (s.lamp || s.conf.plant)) s = byId(s.parent) || s;
    return s;
  }
  function setConnect(on) { IX.connect = !!on; refresh(); }
  Object.assign(IX, { refresh, spotAt, setConnect, activeGo, onSpaceOverDubu, openFx, modalOpen, stageOf, onClick, onSpace, hover, tick, draw, afterIntro, spots, byId, state, activateType, footTile, setDim, plantStage, blocked, closeFlow });
  root.PHInteract = IX;
  root.PHObjFx = objFx;
  Art.pixelHook = pixelHook;
})(window);
