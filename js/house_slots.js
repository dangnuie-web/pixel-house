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
  };
  // 배치표 기능 이름 -> js/features.js 기능 id (무늬 제안 이름 * 표시). TV = 이미 있는 영화·연극 기록(record)
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

  // D = 배치표, A = 그림 묶음, choice = { 자리 id: 그림 이름 } -> { links: { 물건 type: 기능 id }, slots: [{ id, label, type, sprite, candidates }] }
  function apply(D, A, choice) {
    const out = { links: {}, slots: [] };
    if (!D || !Array.isArray(D.slots)) return out;
    const ch = choice && typeof choice === 'object' ? choice : {};
    // 벽 메모지는 js/memo_wall.js 가 고른 자리에 그림 (배치표 물건으로 또 그리지 않음)
    D.objects = (D.objects || []).filter((o) => !o.wall_slot);
    D.slots.forEach((sl) => {
      const cands = (sl.candidates || []).filter((c) => !A || A[c.sprite]);
      if (!cands.length) return;
      const cand = cands.find((c) => c.sprite === ch[sl.id]) || cands[0];
      const o = D.objects.find((q) => q.slot === sl.id);
      if (!o) return;
      const fr = A && A[cand.sprite] && A[cand.sprite].frames[0], w = fr ? fr[0].length : cand.size[0], h = fr ? fr.length : cand.size[1];
      if (o.sprite !== cand.sprite) { const p = place(sl.box, sl.anchor, w, h); o.px = p[0]; o.py = p[1]; o.sprite = cand.sprite; o.file = cand.file; delete o.frame; }
      o.size = [w, h];
      const fid = featureOf(sl, cand);
      if (fid) out.links[o.type] = fid;
      out.slots.push({ id: sl.id, label: sl.label || sl.id, type: o.type, sprite: cand.sprite, featureKo: sl.feature_ko || '', candidates: cands.map((c) => ({ sprite: c.sprite, name: NAMES[c.sprite] || c.sprite, feature: featureOf(sl, c) })) });
    });
    return out;
  }

  const HS = { NAMES, FEATURE_ID, place, apply, slots: [], links: null };
  const D = root.PH_LAYOUT_DATA;
  if (D && Array.isArray(D.slots)) {
    const P = root.PHProfile, r = apply(D, root.PH_ASSETS, P && P.user && P.user.furniture);
    HS.slots = r.slots; HS.links = r.links;
    root.PH_HOUSE_LINKS = r.links; // js/features.js 가 기본 연결표로 씀
    root.PH_HOUSE_NAMES = {}; r.slots.forEach((s) => { root.PH_HOUSE_NAMES[s.type] = NAMES[s.sprite] || s.sprite; });
  }
  root.PHHouseSlots = HS;
  if (typeof module !== 'undefined' && module.exports) module.exports = HS;
})(typeof window !== 'undefined' ? window : globalThis);
