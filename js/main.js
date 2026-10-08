// 화면 전환: 입장 화면 -> 집. (pixel-office main.js와 같은 배율 계산)
// 입장 (무늬 가이드 v01 8장 제안 중 1~2만): 버튼이 사라지고 문이 열린 장(entrance 1번)으로 바뀐 뒤 집으로.
//   3~4(문간에 두부 + "어서 오세요냥~")는 부기 원고에 없는 대사라 넣지 않음. 움직임 줄이기 설정이면 바로 집으로
(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const App = { screen: 'start', door: 0, entering: false, tab: 'home', entered: false };
  const LIFE_TABS = ['habits', 'meetings', 'bucket', 'archive'];
  const DOOR_MS = 650;
  // 입장 화면 크기 = entrance 그림 크기 (없으면 전개도 크기). 버튼 자리 = settings.ENTER_BUTTON (u = 입장 그림 1px)
  // 입장 그림이 없는 집 = 임시 표지 그림 크기 (js/placeholders.js D.cover.size). 공용 원룸은 2026-10-08부터 무늬 entrance_room1 (배치표 entrance, scripts/sync_assets.py)
  function coverSize() { const sz = root.PHArt.size('entrance'), tmp = root.PH_TEMP_DRAW && root.PH_TEMP_DRAW.cover && root.PH_TEMP_DRAW.cover.size; return sz ? { w: sz.w, h: sz.h } : tmp ? { w: tmp.w, h: tmp.h } : { w: root.PH_LAYOUT.W, h: root.PH_LAYOUT.H }; }
  function layoutCover() {
    const c = coverSize(), b = root.PH_SETTINGS.ENTER_BUTTON, el = $('cover');
    $('cover-cv').width = c.w; $('cover-cv').height = c.h;
    el.style.setProperty('--cw', c.w); el.style.setProperty('--ch', c.h);
    const z = root.PH_ASSETS && root.PH_ASSETS.entrance && root.PH_ASSETS.entrance.button_zone; // v02: 버튼 자리 = button_zone 가운데
    // 가로 = 입장 화면 가운데 (제작자 2026-10-05), 세로 = button_zone 가운데. 정수 px (반 칸이면 위·왼쪽)
    if (z) { el.style.setProperty('--bx', Math.floor((c.w - b.w) / 2)); el.style.setProperty('--by', z.py + Math.floor((z.h - b.h) / 2)); }
    else { el.style.setProperty('--bx', b.x == null ? (c.w - b.w) / 2 : b.x); el.style.setProperty('--by', b.y); }
    el.style.setProperty('--bw', b.w); el.style.setProperty('--bh', b.h);
  }

  function show(name) {
    App.screen = name;
    $('screen-start').hidden = name !== 'start';
    if ($('screen-onboard')) $('screen-onboard').hidden = name !== 'onboard';
    $('screen-house').hidden = name !== 'house';
    LIFE_TABS.forEach((t) => { $('screen-' + t).hidden = name !== t; });
    syncBar();
  }
  // 창 맨 위 끌기 띠(본문 쪽) 색 = 지금 보이는 화면의 맨 위 색 (검은 줄로 안 보이게)
  function syncBar() {
    const scr = ['screen-start', 'screen-house'].concat(LIFE_TABS.map((t) => 'screen-' + t)).map($).find((e) => e && !e.hidden); if (!scr) return;
    const cs = getComputedStyle(scr), img = cs.backgroundImage;
    const m = img && img !== 'none' ? /rgba?\([^)]*\)/.exec(img) : null;
    $('dragbar').style.background = m ? m[0] : cs.backgroundColor;
  }
  // 탭 바꾸기 (pixel-office selectTab과 같은 방식). 우리집 = 입장 전이면 입장 화면, 입장 뒤면 집.
  // 집 상태(두부 자리·연출·대사 기록)는 탭을 바꿔도 그대로 두고, 우리집이 아닐 때만 사이드바에 두부가 앉아 있음
  // 우리집에서 다른 탭으로 가면 집 위에 열려 있던 창을 모두 닫음 (저장 안 한 글은 버림. 2026-10-08 제작자, 로드맵 3-1단계 피드백 3)
  //   메모지(버킷)·냉장고 메모지·물컵·옷장·살림·책꽂이·TV 기록·메모지 자리 고르기·두부 대화창·식사·대변 일지(집에서 연 것만). 저장 중인 창은 각 창이 닫기를 거절함
  const HOUSE_WINDOWS = ['PHBucketMemo', 'PHFridgeMemo', 'PHWaterModal', 'PHWardrobe', 'PHInventory', 'PHBookModal', 'PHRecordModal'];
  function closeHouseWindows() {
    HOUSE_WINDOWS.forEach((k) => { const m = root[k]; if (m && m.isOpen && m.isOpen()) m.close(); });
    const W = root.PHMemoWall; if (W && W.isOpen && W.isOpen()) W.finish();
    const LM = root.PHLogModal; if (LM && LM.isOpen() && !['habits', 'journal'].includes(LM.state().from)) LM.close();
    if (root.PHDialog && root.PHDialog.isOpen()) root.PHDialog.close();
  }
  async function selectTab(tab) {
    const prev = App.tab;
    if (prev !== tab) {
      if (prev === 'home') closeHouseWindows();
      if (root.PHUndoBar) root.PHUndoBar.clearAll(); // 탭 옮기기 = 되돌리기 띠 사라짐 (js/undo_bar.js)
    }
    App.tab = tab;
    document.querySelectorAll('#tabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    const home = tab === 'home';
    root.PHGame.setActive(home && App.entered);
    $('side-dubu').hidden = home; $('side-bubble').hidden = true;
    if (!home) root.PHLife.drawDubu($('side-dubu-cv'));
    if (home) { show(App.entered ? 'house' : 'start'); if (App.entered) root.PHGame.setActive(true); else $('btn-enter').focus(); return; }
    show(tab);
    await root.PHLife.render(tab, $('life-' + tab));
  }
  let sideTimer = null;
  function sideSay(text, ms) { // 사이드바 두부 말풍선 한 줄 (물 칸·습관 체크 반응 등)
    $('side-bubble').textContent = text || ''; $('side-bubble').hidden = !text;
    clearTimeout(sideTimer); sideTimer = setTimeout(() => { $('side-bubble').hidden = true; }, ms || root.PH_SETTINGS.BUBBLE_MS);
  }
  function sideTalk() { sideSay(root.PHGame.sayLine(['click'])); }
  function redrawCover() { root.PHRender.drawCover($('cover-cv').getContext('2d'), App.door, guestFrame()); paintCoverMargins(); }

  // ---- 입장 화면 v02: 벤치 이웃, 누를 수 있는 곳 (2026-10-03) ----
  //   이웃: 입장 화면을 열 때 settings.GUEST_CHANCE로 정하고 같은 날(DAY_START_HOUR 경계)은 그대로. 22~6시에는 안 나옴(그 시각에 정한 것은 저장 안 함)
  //   시험(PH_SHOTS): 메인이 ?guest=0|1을 붙여 고정 (기본 0, 다른 시험이 흔들리지 않게)
  const S0 = () => root.PH_SETTINGS;
  const pad2 = (n) => String(n).padStart(2, '0');
  const dayKey = (ms) => { const d = new Date(ms - (S0().DAY_START_HOUR || 6) * 3600000); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  function quietHour(ms) { const q = S0().GUEST_QUIET || { from: 22, to: 6 }, h = new Date(ms).getHours(); return q.from > q.to ? (h >= q.from || h < q.to) : (h >= q.from && h < q.to); }
  function readG() { try { const v = JSON.parse(localStorage.getItem(S0().GUEST_KEY) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } }
  function writeG(v) { try { localStorage.setItem(S0().GUEST_KEY, JSON.stringify(v)); } catch (e) { /* 저장 못 해도 진행 */ } }
  App.now = () => Date.now();
  function decideGuest(force) { // force: 시험용. undefined = 주소의 ?guest, null = 고정 없이 정하기
    const now = App.now(), date = dayKey(now), forced = force !== undefined ? force : new URLSearchParams(location.search).get('guest');
    if (!root.PHArt.has('entrance_guest')) return (App.guest = false);
    if (forced === '0' || forced === '1') return (App.guest = forced === '1' && !quietHour(now));
    if (quietHour(now)) return (App.guest = false);
    const v = readG();
    if (v && v.date === date) return (App.guest = !!v.show);
    const show = Math.random() < (S0().GUEST_CHANCE == null ? 0.35 : S0().GUEST_CHANCE);
    writeG({ date, show, told: false });
    return (App.guest = show);
  }
  // 이웃 그림 장 (anim.order를 ms마다). 안 나오면 null
  function guestFrame() {
    if (!App.guest) return null;
    const g = root.PH_ASSETS && root.PH_ASSETS.entrance_guest, an = (g && g.anim) || { order: [0], ms: 450 };
    const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return reduce ? an.order[0] : an.order[Math.floor(performance.now() / an.ms) % an.order.length];
  }
  let gTimer = null, gLast = null;
  function guestTick() { // 입장 화면이 보일 때만 바뀐 장이면 다시 그림
    clearInterval(gTimer); gTimer = null;
    if (!App.guest) return;
    gTimer = setInterval(() => { if (App.screen !== 'start' || App.entering) return; const f = guestFrame(); if (f !== gLast) { gLast = f; redrawCover(); } }, 100);
  }
  // 입장 인사 뒤 두부 한 줄 (이웃 나온 날, 그날 처음 한 번). 꺼내면 told로 저장 (interact afterIntro가 약속 줄 앞에 넣음)
  function takeGuestLine() {
    if (!App.guestSeen) return null;
    const v = readG(), date = dayKey(App.now());
    if (v && v.date === date && v.told) return null;
    writeG({ date, show: true, told: true });
    const L = (root.PH_LINES.entrance || {}).guest || {}, list = L.dubuAfter || [];
    return list[Math.floor(Math.random() * list.length)] || null;
  }
  // 그림 파일에서 읽는 것 (v03이 와도 파일만 바꾸면 됨): 누를 곳, 이웃 자리(entrance overlay.guest -> 없으면 이웃 파일 place)
  function coverSpots() {
    const e = root.PH_ASSETS && root.PH_ASSETS.entrance; if (!e) return [];
    if (Array.isArray(e.spots)) return e.spots;
    return ((S0().ENTRANCE_SPOTS || {})[e.version]) || [];
  }
  function guestPlace() {
    const e = root.PH_ASSETS && root.PH_ASSETS.entrance, ga = root.PH_ASSETS && root.PH_ASSETS.entrance_guest; if (!e || !ga) return null;
    const p = (e.overlay && e.overlay.guest) || ga.place; if (!p) return null;
    return { px: p.px, py: p.py, w: ga.frames[0][0].length, h: ga.frames[0].length };
  }
  // 누른 곳: 그림 px -> 'guest' | 'door' (입장 그림 door_zone = 눌러도 입장, 무늬 공용판후속 v01 2절) | spot id | null
  function coverHit(px, py) {
    const e = root.PH_ASSETS && root.PH_ASSETS.entrance, dz = e && e.door_zone;
    if (dz && px >= dz.px && px < dz.px + dz.w && py >= dz.py && py < dz.py + dz.h) return 'door';
    const g = guestPlace();
    if (App.guest && g && px >= g.px && px < g.px + g.w && py >= g.py && py < g.py + g.h) return 'guest';
    const sp = coverSpots().find((q) => px >= q.px && px < q.px + q.w && py >= q.py && py < q.py + q.h);
    if (!sp) return null;
    return sp.id === 'bench' && App.guest ? 'guest' : sp.id;
  }
  let cbTimer = null;
  function coverSay(text, at, plain) {
    const b = $('cover-bubble'); b.textContent = text; b.hidden = false; b.classList.toggle('plain', !!plain);
    b.style.setProperty('--qx', at.x); b.style.setProperty('--qy', at.y);
    clearTimeout(cbTimer); cbTimer = setTimeout(() => { b.hidden = true; }, S0().BUBBLE_MS || 3200);
  }
  function onCoverClick(e) {
    if (App.screen !== 'start' || App.entering) return;
    const cv = $('cover-cv'), r = cv.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * cv.width, py = (e.clientY - r.top) / r.height * cv.height;
    const hit = coverHit(px, py); App.lastCoverHit = hit; if (!hit) return;
    if (hit === 'door') { onEnter(); return; }
    const E = root.PH_LINES.entrance || {};
    if (hit === 'guest') {
      const g = guestPlace(), list = (E.guest && E.guest.click) || [];
      coverSay(list[Math.floor(Math.random() * list.length)], { x: g.px + g.w / 2, y: g.py - 2 }); return;
    }
    const sp = coverSpots().find((q) => q.id === hit), text = E.idle && E.idle[hit];
    if (text) coverSay(text, { x: Math.min(cv.width - 40, Math.max(40, sp.px + sp.w / 2)), y: Math.max(30, sp.py) }, true);
  }
  function onCoverMove(e) {
    const cv = $('cover-cv'), r = cv.getBoundingClientRect();
    cv.classList.toggle('spot', !!coverHit((e.clientX - r.left) / r.width * cv.width, (e.clientY - r.top) / r.height * cv.height));
  }
  async function onEnter() {
    if (App.screen !== 'start' || App.entering) return;
    App.entering = true;
    const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('btn-enter').hidden = true; $('cover-bubble').hidden = true;
    App.guestSeen = !!App.guest; // 이 입장에서 이웃를 봤음 -> 집에서 두부가 한 줄 (takeGuestLine)
    App.door = 1; redrawCover();
    if (!reduce) await new Promise((r) => setTimeout(r, DOOR_MS));
    show('house');
    root.PHGame.setActive(App.tab === 'home'); // 입장 전에 다른 탭을 열었다 돌아오면 active가 false로 남아 키·클릭이 안 먹던 문제 (journal 비트 발견 2026-10-03)
    App.entering = false; App.entered = true;
    const p = root.PHGame.enter();
    Promise.resolve(p).then(() => entryNudge()).catch(() => {});
    return p;
  }
  // 입장 연출 뒤 사이드바 두부 한마디 (안전장치: 2주 지나 돌아감 / 일요일 저녁 이번 주 확인 권하기). js/life.js entryLines
  //   우리집 탭에서도 사이드바 두부를 잠깐 보여 줌. 말풍선을 누르면(open) 생활 습관 탭 + 안전장치 확인 칸
  async function entryNudge() {
    const list = root.PHLife.entryLines ? await root.PHLife.entryLines() : [];
    const B = $('side-bubble'), D = $('side-dubu');
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (App.tab === 'home') { D.hidden = false; root.PHLife.drawDubu($('side-dubu-cv')); }
      sideSay(it.text, root.PH_SETTINGS.BUBBLE_MS * 2);
      B.classList.toggle('go', !!it.open); B.onclick = it.open ? () => { B.onclick = null; B.classList.remove('go'); root.PHLife.ui.safetyOpen = true; selectTab('habits'); } : null;
      await new Promise((r) => setTimeout(r, root.PH_SETTINGS.BUBBLE_MS * 2 + 200));
    }
    B.onclick = null; B.classList.remove('go');
    if (list.length && App.tab === 'home') D.hidden = true;
    App.nudged = list.map((x) => x.text);
  }
  function fitCover() {
    const c = coverSize(), m = $('main'), fit = Math.min(m.clientWidth / c.w, m.clientHeight / c.h);
    // 우리집 전개도와 같은 방식: 비율 지킨 채 최대한 크게 (소수 배율 허용, 그리기는 pixelated)
    $('cover').style.setProperty('--s', Math.abs(fit - Math.round(fit)) < 1e-6 ? Math.round(fit) : fit);
    paintCoverMargins();
  }
  // 입장 화면 여백 = 그림 가장자리 색을 이어 칠함: 위쪽 = 맨 윗줄 가운데 색(하늘), 아래쪽 = 맨 아랫줄 가운데 색(풀·길)
  function paintCoverMargins() {
    const Art = root.PHArt, e = root.PH_ASSETS && root.PH_ASSETS.entrance; if (!e || !Art.has('entrance')) return;
    const c = Art.frameCanvas('entrance', App.door), ctx = c.getContext('2d'), px = (x, y) => { const d = ctx.getImageData(x, y, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`; };
    const top = px(c.width >> 1, 0), bot = px(c.width >> 1, c.height - 1);
    $('screen-start').style.background = `linear-gradient(to bottom, ${top} 0, ${top} 50%, ${bot} 50%, ${bot} 100%)`;
    syncBar();
  }
  // ---- 그림 세트 (제작자 2026-10-03: 중간 v10 기본, 되돌리기용 자세히 v08 / 굵게 v09) ----
  //   메뉴에서 고르면 여기로. 지금 자리(입장 뒤면 제작자 공간·자리)와 탭을 넘기면 main이 저장하고 화면을 새 세트로 다시 엶 (js/artset.js)
  function switchArtSet(set) {
    if (!set || set === root.PH_ART_SET || !(root.PH_ART_SETS_HAVE || []).includes(set)) return false;
    const r = App.entered ? Object.assign({ entered: true }, root.PHGame.resumeState()) : { entered: false };
    r.tab = App.tab;
    if (root.PHDesktop && root.PHDesktop.setArtSet) { root.PHDesktop.setArtSet(set, r); return true; }
    location.search = '?set=' + encodeURIComponent(set) + '&resume=' + encodeURIComponent(JSON.stringify(r)); // 브라우저로 열었을 때 (저장 없음)
    return true;
  }
  function initArtSet() { // 바꾸는 곳 = 앱 메뉴 "보기 > 집 그림"만 (제작자 2026-10-03: 화면의 토글 버튼 없앰)
    if (root.PHDesktop && root.PHDesktop.onMenuArtSet) root.PHDesktop.onMenuArtSet((set) => { if (!switchArtSet(set) && root.PHDesktop.setArtSet) root.PHDesktop.setArtSet(set, null); });
  }
  // 세트를 바꾼 직후: 입장 화면을 건너뛰고(입장 뒤였으면) 그 자리에서 이어짐, 보던 탭도 그대로
  function resumeAfterSwitch(r) {
    if (r.entered) { App.entered = true; show('house'); root.PHGame.resume(r); }
    selectTab(r.tab || 'home');
  }
  function init() {
    // 이름표 (설정 묶음, 2026-10-08): 사이드바 맨 위·창 제목·집 화면 설명 (제작자 판 = Pixel House)
    const S1 = root.PH_SETTINGS;
    if (S1.BRAND) { document.querySelector('#tabs .brand').textContent = S1.BRAND; $('stage').setAttribute('aria-label', S1.BRAND + '. 방향키나 클릭으로 두부가 걸어요. 두부를 누르거나 Space를 누르면 말해요.'); }
    if (S1.TITLE) document.title = S1.TITLE;
    // 탭 이름은 settings.TAB_NAMES에서 (기록 보관 등 이름을 바꾸기 쉽게)
    document.querySelectorAll('#tabs [role=tab]').forEach((b) => { b.textContent = root.PHLife.TAB(b.dataset.tab); });
    // 버킷리스트 탭: 항목이 있을 때만 (settings.BUCKET_TAB). 파일을 읽을 때마다 다시 정함
    root.PHLife.onLoad = (d) => {
      const show = !!d && root.PHLife.bucketAsTab(d), b = document.querySelector('#tabs [data-tab="bucket"]');
      b.hidden = !show;
      if (!show && App.tab === 'bucket') selectTab('habits');
    };
    if (!(root.PHProfile && root.PHProfile.isOnboard())) root.PHLife.load().then((d) => root.PHLife.onLoad(d)); // 온보딩 중엔 기록 폴더가 아직 없음
    if (root.PHFurnish && !(root.PHProfile && root.PHProfile.isOnboard())) root.PHFurnish.load(); // 가구 연결·일지 기능 표시 (앱 설정 features.json, 2026-10-04). 온보딩 중엔 집이 아직 없음
    root.PHGame.init(); // 낮·밤을 먼저 정함 (입장 화면도 같은 팔레트)
    decideGuest(); guestTick();
    if (root.PHEnterButton) root.PHEnterButton.mount($('btn-enter')); // 픽셀 글자 버튼 (제작자 시안 2026-10-05)
    layoutCover(); redrawCover();
    $('btn-enter').addEventListener('click', onEnter);
    $('cover-cv').addEventListener('click', onCoverClick); $('cover-cv').addEventListener('mousemove', onCoverMove);
    document.querySelectorAll('#tabs [role=tab]').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
    $('tabs').addEventListener('keydown', (e) => { // 탭에서 위·아래 화살표로 옮기기 (pixel-office와 같음)
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const tabs = Array.from(document.querySelectorAll('#tabs [role=tab]')).filter((b) => !b.hidden), i = tabs.indexOf(document.activeElement); if (i < 0) return;
      e.preventDefault(); e.stopPropagation();
      const n = tabs[(i + (e.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length]; selectTab(n.dataset.tab); n.focus();
    });
    $('side-dubu-btn').addEventListener('click', sideTalk);
    document.addEventListener('keydown', (e) => {
      if (App.tab === 'home' && App.screen === 'start' && (e.key === ' ' || e.key === 'Enter') && document.activeElement !== $('btn-enter') && !(document.activeElement && document.activeElement.closest('#tabs'))) { e.preventDefault(); onEnter(); }
    });
    fitCover(); root.addEventListener('resize', fitCover);
    initArtSet();
    // 공용판 첫 실행: 입장 화면 대신 온보딩 (js/onboard.js). 끝나면 메인이 화면을 다시 엶
    if (root.PHProfile && root.PHProfile.isOnboard() && root.PHOnboard) { show('onboard'); root.PHOnboard.start(); return; }
    show('start');
    $('btn-enter').focus();
    if (root.PH_RESUME) resumeAfterSwitch(root.PH_RESUME);
  }
  App.onEnter = onEnter; App.show = show; App.redrawCover = redrawCover; App.selectTab = selectTab; App.sideTalk = sideTalk; App.sideSay = sideSay; App.syncBar = syncBar; App.switchArtSet = switchArtSet; App.entryNudge = entryNudge; App.takeGuestLine = takeGuestLine; App.decideGuest = decideGuest; App.coverHit = coverHit; App.coverSpots = coverSpots; App.guestPlace = guestPlace; App.guestFrame = guestFrame; App.guestTick = guestTick; App.dayKey = dayKey;
  root.PHApp = App;
  init();
})(window);
