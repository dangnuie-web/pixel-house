// 공용 집 가구 자리 (2026-10-08 로드맵 4단계 "집 꾸미기 (가)": 정해진 자리마다 가구 후보 고르기. 자유 배치는 안 만듦)
//   배치표 slots (무늬 디자인/20261008_pixel-house_공용판원룸_v01.md 3절): 자리마다 box [x, y, 폭, 높이], anchor(기준점), candidates(첫째 = 기본), feature(붙는 기능)
//   고른 그림 = 설정 묶음 사용자 값 PHProfile.user.furniture { 자리 id: 그림 이름 } (앱 설정 profile.json, electron/profile_main.js)
//   여기서 하는 일 (artset.js 다음, layout.js 전에): 물건 그림·크기·자리를 고른 후보로 바꾸고, 자리마다 기본 기능 연결표를 만든다 (js/features.js DEFAULT_LINKS 대신)
//   제작자 집(v08~v12)은 배치표에 slots 가 없어 아무것도 안 함
(function (root) {
  'use strict';
  // 후보 이름 (무늬 문서 3절 표). 가구 기능 연동 목록·꾸미기 칸에 보임
  const NAMES = {
    bed_wide: '넓은 침대', sofa: '소파베드', kitchen_cabinet: '주방장', cup_water: '물컵', purifier: '정수기', fridge: '냉장고',
    calendar_wall: '벽 달력', clock: '시계', bookshelf: '책꽂이', tvcabinet_long: '긴 TV장', tvcabinet: '작은 TV장',
    roundtable: '둥근 탁자', coffeetable_m: '타원 탁자', tea_tray: '찻상', rug_round_big: '큰 타원 러그', rug_round: '둥근 카펫',
    coffeetable: '낮은 책상', drawer: '서랍장', toilet: '변기', washbasin: '세면대', floorlamp: '스탠드', floorlamp_round: '둥근 스탠드',
    plant_snake: '산세베리아', plant_monstera: '몬스테라', plant_cactus: '선인장', plant_fern: '고사리',
    memo_bucket_wall: '벽 메모지',
    kitchen_wood: '원목 주방장', fridge_retro: '분홍 냉장고', bookshelf_open: '낮은 책장', // 2026-10-08 무늬 공용판후속 v01 1-1 (배치표 v02 name과 같음)
  };
  // 배치표 기능 이름 -> js/features.js 기능 id (무늬 제안 이름 * 표시). TV = 영화 기록(record)
  const FEATURE_ID = { 'screen*': 'record', screen: 'record', 'calendar*': 'calendar', calendar: 'calendar' };
  // 후보에 따라 기능이 바뀌는 자리 (무늬 3절: 물컵 자리에 정수기를 두면 물 기록 창)
  const BY_SPRITE = { purifier: 'water' };

  function place(box, anchor, w, h) { // 무늬 그리기 코드 place()와 같은 계산
    const [x, y, bw, bh] = box;
    if (anchor === 'bottom-left') return [x, y + bh - h];
    if (anchor === 'bottom-right') return [x + bw - w, y + bh - h];
    if (anchor === 'bottom-center') return [x + Math.floor((bw - w) / 2), y + bh - h];
    if (anchor === 'top-left') return [x, y];
    return [x + Math.floor((bw - w) / 2), y + Math.floor((bh - h) / 2)]; // center
  }
  const featureOf = (slot, cand) => BY_SPRITE[cand.sprite] || (slot.feature ? FEATURE_ID[slot.feature] || slot.feature : null);

  function swapObjects(D, sw) {
    const hide = new Set(Array.isArray(sw.hide) ? sw.hide : []);
    if (hide.size) D.objects = D.objects.filter((q) => !hide.has(q.type));
    (Array.isArray(sw.add) ? sw.add : []).forEach((x) => {
      if (!x || !x.type || D.objects.some((q) => q.type === x.type)) return; // 같은 type이 이미 있으면 두 번 더하지 않음
      const o = Object.assign({}, x); o.size = Array.isArray(x.size) ? x.size.slice() : x.size; D.objects.push(o);
    });
  }

  // D = 배치표, A = 그림 묶음, choice = { 자리 id: 그림 이름 } -> { links: { 물건 type: 기능 id }, slots: [{ id, label, type, sprite, candidates }] }
  //   defaults = { 자리 id: 그림 이름 } (settings.SLOT_DEFAULTS[세트]): 고른 값이 없을 때 후보 첫째 대신 기본 (D4 ① 원룸 정수기)
  function apply(D, A, choice, defaults) {
    const out = { links: {}, slots: [] };
    if (!D || !Array.isArray(D.slots)) return out;
    const ch = choice && typeof choice === 'object' ? choice : {};
    // 벽 메모지 = 가구 하나 (2026-10-08 제작자 피드백 4: 자리 고르기 없앰). 배치표 물건 그대로(첫 벽 자리), 기본 기능 = 버킷리스트
    if ((D.objects || []).some((o) => o.type === 'memo_bucket')) out.links.memo_bucket = 'bucket';
    D.slots.forEach((sl) => {
      const cands = (sl.candidates || []).filter((c) => !A || A[c.sprite]);
      if (!cands.length) return;
      const def = defaults && cands.find((c) => c.sprite === defaults[sl.id]);
      const cand = cands.find((c) => c.sprite === ch[sl.id]) || def || cands[0];
      const o = D.objects.find((q) => q.slot === sl.id);
      if (!o) return;
      const fr = A && A[cand.sprite] && A[cand.sprite].frames[0], w = fr ? fr[0].length : cand.size[0], h = fr ? fr.length : cand.size[1];
      if (o.sprite !== cand.sprite) { const p = place(sl.box, sl.anchor, w, h); o.px = p[0]; o.py = p[1]; o.sprite = cand.sprite; o.file = cand.file; delete o.frame; }
      // 후보마다 자리 따로 (D4 ① 2026-10-14, 무늬 정수기바닥형 v01 2-2): at = 왼쪽 위, sort_y = 그리는 순서, on = 위에 놓인/붙은 가구(Space 마주 보기에서 먼저)
      //   바닥에 선 정수기(161,18)와 상판 위 물컵(166,32)은 자리 상자 가운데 맞추기로 둘 다 맞출 수 없어서
      if (Array.isArray(cand.at)) { o.px = cand.at[0]; o.py = cand.at[1]; }
      if (cand.sort_y != null) o.sort_y = cand.sort_y;
      if ('at' in cand || 'on' in cand) { if (cand.on) o.on = cand.on; else delete o.on; }
      o.size = [w, h];
      // 후보 바꿈 (무늬 공용판집다듬기 v01 3절, 2026-10-13): 후보에 swap이 있으면 hide type 물건을 빼고 add 물건을 더함 (낮은 둥근 탁자 = 의자 대신 방석).
      //   배치표는 창을 열 때마다 새로 읽으므로, 다른 후보로 바꾸면(다시 열면) 원래 물건 그대로 = 되돌리기. 저장 값은 자리 id -> 그림 이름 그대로
      if (cand.swap) swapObjects(D, cand.swap);
      const fid = featureOf(sl, cand);
      if (fid) out.links[o.type] = fid;
      out.slots.push({ id: sl.id, label: sl.label || sl.id, room: sl.room || null, type: o.type, sprite: cand.sprite, def: (def || cands[0]).sprite, featureKo: sl.feature_ko || '', candidates: cands.map((c) => ({ sprite: c.sprite, name: NAMES[c.sprite] || c.name || c.sprite, feature: featureOf(sl, c) })) });
    });
    return out;
  }

  // 제작자 집(배치표에 메모지 물건 없음): settings.MEMO_WALL_SLOTS[세트] 자리에 벽 메모지 물건을 끼워 넣음 (2026-10-08 메모지를 가구처럼)
  //   자리 = 예전에 자리 고르기로 고른 곳(앱 설정 localStorage pixel-house.bucketSlot)이 목록에 있으면 그곳, 아니면 첫 자리. 자리 고르기 기능은 없앰
  const MEMO = { type: 'memo_bucket', sprite: 'memo_bucket_wall', KEY: 'pixel-house.bucketSlot' };
  function addMemo(D, A, S, set) {
    if (!D || (D.objects || []).some((o) => o.type === MEMO.type)) return null;
    const list = ((S && S.MEMO_WALL_SLOTS) || {})[set] || [], a = A && A[MEMO.sprite]; if (!list.length || !a) return null;
    let id = null; try { id = typeof localStorage !== 'undefined' ? localStorage.getItem(MEMO.KEY) : null; } catch (e) { id = null; }
    const sl = list.find((x) => x.id === id) || list[0], fr = a.frames[0];
    const o = { type: MEMO.type, sprite: MEMO.sprite, file: a.file, px: sl.px, py: sl.py, size: [fr[0].length, fr.length], layer: 'wall', wall: true, block: false, wall_slot: sl.id };
    D.objects = (D.objects || []).concat(o);
    return o;
  }

  const HS = { NAMES, FEATURE_ID, place, apply, swapObjects, addMemo, slots: [], links: null };
  const D = root.PH_LAYOUT_DATA;
  HS.memo = addMemo(D, root.PH_ASSETS, root.PH_SETTINGS, root.PH_ART_SET);
  if (D && Array.isArray(D.slots)) {
    const P = root.PHProfile, S = root.PH_SETTINGS || {}, r = apply(D, root.PH_ASSETS, P && P.user && P.user.furniture, (S.SLOT_DEFAULTS || {})[root.PH_ART_SET]);
    HS.slots = r.slots; HS.links = r.links;
    root.PH_HOUSE_LINKS = r.links; // js/features.js 가 기본 연결표로 씀
    root.PH_HOUSE_NAMES = {}; r.slots.forEach((s) => { root.PH_HOUSE_NAMES[s.type] = NAMES[s.sprite] || s.sprite; });
    if (r.links.memo_bucket) root.PH_HOUSE_NAMES.memo_bucket = NAMES.memo_bucket_wall;
  }
  root.PHHouseSlots = HS;
  if (typeof module !== 'undefined' && module.exports) module.exports = HS;
})(typeof window !== 'undefined' ? window : globalThis);
