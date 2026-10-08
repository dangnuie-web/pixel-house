// 가구 ↔ 기능 연결표 (2026-10-04 비트, 제작자 "가구에 기능을 직접 연결" + 집 짓기 2단계 토대). 그림·파일 접근 없음.
// 화면(js/interact.js·js/furnish_ui.js·js/logs_view.js), 메인(electron/furnish_ipc.js·logs_ipc.js·habit_ipc.js), Node 시험이 같이 쓴다.
//
// 1) 기능 목록 FEATURES: 집에서 가구를 눌러 여는 기능 하나 = id 하나. go = js/interact.js activate가 여는 입구 (전에는 interactions.js 물건마다 적었음)
//    habit = 그 기능이 딸린 생활습관 표 줄 이름. 줄이 없으면 기능이 꺼짐(가구는 일반 반응, 연결 목록에서 회색)
//    fnHabit = 일지 기능 습관(대변·식사·독서): 생활습관 표에 한 번도 없었으면 화면에 기본으로 보이고 첫 저장 때 한 번만 표에 더함.
//              한 번이라도 표에 있었으면(seen) 그 뒤로는 저절로 다시 생기지 않음 (제작자 결정 2026-10-04)
//    모든 기능은 가구 하나에만 (옮기면 원래 가구에서 빠짐). 2026-10-04 제작자: 옷 갈아입기도 하나로 ("여러 곳 가능" 없앰)
// 2) 가구 key: 그림 세트 배치표 물건 type (집에 하나뿐이면 type, 여럿이면 type#1, type#2 … 배치표 순서). 그림 아래쪽 칸(하단장·서랍) = key + '.part'
//    세트(v08·v09·v10·v12)마다 배치표 번호는 달라도 key는 같음 (정수기 purifier는 v12에만)
// 3) 기본 연결 DEFAULT_LINKS (key -> 기능 id) + 사용자 바꾼 것 overrides (key -> 기능 id | 'none'). 앱 설정(userData/features.json)에 저장, 생활 기록 파일 아님
(function (root) {
  'use strict';
  const FEATURES = [
    { id: 'poop', label: '대변 일지', short: '대변', go: 'poopLog', habit: '대변', fnHabit: true, target: '변기에서 기록', lines: ['obj', 'toilet', 'go'] },
    { id: 'meal', label: '식사 일지', short: '식사', go: 'mealLog', habit: '식사', fnHabit: true, target: '식탁에서 기록', lines: ['obj', 'table_two', 'go'] },
    { id: 'study', label: '공부', short: '공부', go: 'study', lines: ['obj', 'table_long', 'go'] },
    { id: 'reading', label: '독서 책꽂이', short: '독서', go: 'bookModal', habit: '독서', fnHabit: true, target: '책꽂이에 기록', oldTargets: ['쪽'], lines: ['obj', 'bookshelf', 'go'] }, // 2026-10-04 제작자: 독서 줄을 지우면 책꽂이도 꺼짐 (대변·식사와 같은 규칙). 2026-10-08 제작자: 쪽수 완전히 뺌 -> 기준 '쪽' -> '책꽂이에 기록' (옛 줄은 앱이 켤 때 옮김, js/habit_edit.js migrateFnRows)
    { id: 'record', label: '영화 기록', short: '영화', go: 'recordModal' }, // 2026-10-08 제작자: 한 가구에 한 기능 -> TV = 영화만. 연극은 rk:연극으로 따로 연동. 영화 칸을 지우면 꺼짐 (js/furnish.js state)
    { id: 'water', label: '물 기록 (정수기 창)', short: '물', go: 'waterModal' },
    { id: 'water_cup', label: '물 한 잔 (바로 +1)', short: '물 +1', go: 'water' },
    { id: 'yoga', label: '요가', short: '요가', go: 'yoga', habit: '요가' },
    { id: 'memo', label: '약속 (냉장고 메모)', short: '약속', go: 'fridgeMemo' },
    { id: 'inv_kitchen', label: '살림: 생활용품 주방', short: '주방', go: 'inventory', cat: 'living', pill: '주방', say: 'kitchen' },
    { id: 'inv_living', label: '살림: 생활용품', short: '생활', go: 'inventory', cat: 'living' },
    { id: 'inv_misc', label: '살림: 잡화', short: '잡화', go: 'inventory', cat: 'misc' },
    { id: 'inv_cosmetic', label: '살림: 화장품', short: '화장품', go: 'inventory', cat: 'cosmetic' },
    { id: 'wardrobe', label: '옷 갈아입기', short: '옷', go: 'wardrobe' },
    { id: 'close', label: '하루 마감 (잠자리)', short: '마감', go: 'close' },
    { id: 'calendar', label: '약속 달력', short: '달력', go: 'meetings', houseOnly: true }, // 2026-10-08 공용 원룸 벽 달력 (무늬 공용판원룸 v01 3절): 약속 탭 달력 열기. houseOnly = 가구 자리가 있는 집(공용)의 연동 목록에만 (제작자 집 목록은 그대로)
  ];
  const BY_ID = {}; FEATURES.forEach((f) => { BY_ID[f.id] = f; });
  const NONE = 'none';
  // 기록 칸 기능 (2026-10-08 피드백 4: 기록 편집 + 추가로 만든 칸도 가구 연동): id = 'rk:' + 칸 이름 (## 기록 항목). 누르면 그 칸 기록 창 (js/record_modal.js)
  //   목록이 정해지지 않아 FEATURES에 없고 get()이 만들어 줌. 켜짐 = 그 칸이 있을 때 (js/furnish.js state). 칸을 지워도 연결은 남음 (같은 이름을 다시 만들면 다시 열림)
  //   영화는 따로 칸 기능을 만들지 않고 record(TV)가 맡음. 연극은 다른 칸처럼 rk:연극
  const RK = 'rk:', RK_RE = /^rk:[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z ]{1,12}$/;
  const rkId = (name) => RK + String(name);
  function rkFeature(id) { const n = id.slice(RK.length); return { id, label: n + ' 기록', short: n, go: 'recordModal', kind: n, rk: true }; }
  const getF = (id) => BY_ID[id] || (typeof id === 'string' && RK_RE.test(id) && id.trim() === id ? rkFeature(id) : null);
  // 기본 연결 = 2026-10-04까지 interactions.js에 물건마다 적혀 있던 것 그대로
  //   공용 집(배치표에 가구 자리가 있는 집)은 자리마다 붙는 기능으로 바꿈 (js/house_slots.js PH_HOUSE_LINKS)
  const DEFAULT_LINKS = root.PH_HOUSE_LINKS ? Object.assign({}, root.PH_HOUSE_LINKS) : {
    toilet: 'poop', table_two: 'meal', table_long: 'study', bookshelf: 'reading',
    purifier: 'water', sink_v: 'water_cup', rug_round: 'yoga', fridge: 'memo', bed: 'close',
    kitchen_cabinet: 'inv_kitchen', 'shelf_unit.part': 'inv_living', 'tv_cabinet.part': 'inv_misc', 'mirror_oval.part': 'inv_cosmetic',
    wardrobe_side: 'wardrobe', tv_cabinet: 'record', // 옷 갈아입기 = 오른쪽 벽 세로 옷장 하나 (2026-10-04 임시 기본, 제작자 답 오면 바꿈). 긴 거울·위쪽 옷장은 일반 반응
  };
  // 연결 모드 목록에 보일 가구 이름 (없으면 type 그대로). 아래 칸 = "OO 아래 칸"
  const NAMES = {
    toilet: '변기', bath_cabinet: '욕실장', bath_mirror: '욕실 거울', bathmat: '욕실 매트', washbasin: '세면대', laundry_basket: '빨래 바구니',
    frame_lemon: '레몬 액자', kitchen_cabinet: '주방장', purifier: '정수기', sink_v: '싱크대', plant_olive: '올리브 화분', clock: '시계',
    rug_persian: '페르시안 러그', shelf_unit: '거실 수납선반', fridge: '냉장고', floorlamp_round: '둥근 스탠드', chair_brown: '갈색 의자',
    table_two: '거실 2인 테이블', shoe_cabinet_ivory: '아이보리 신발장', shoes: '신발', shoe_cabinet_wood: '나무 신발장', gate: '현관문',
    rug_round: '둥근 카펫', mirror_oval: '긴 거울', wardrobe_top: '위쪽 옷장', wardrobe_side: '벽쪽 옷장', floorlamp: '스탠드', frame_cat: '고양이 액자',
    bookshelf: '책꽂이', plant_bird: '극락조 화분', tv_cabinet: 'TV장', bed: '침대', chair_side: '침실 의자', table_long: '침실 긴 테이블',
  };
  const PART_NAMES = { shelf_unit: '하단장', tv_cabinet: 'TV장 아래 장', mirror_oval: '거울 아래 서랍' };
  function nameOf(key) {
    const k = String(key), part = /\.part$/.test(k), base = k.replace(/\.part$/, ''), m = base.match(/^(.*?)(?:#(\d+))?$/), t = m[1], n = m[2];
    const HN = root.PH_HOUSE_NAMES || {}; // 공용 집: 그 자리에 고른 후보 이름 (js/house_slots.js)
    if (part) return PART_NAMES[t] || (HN[t] || NAMES[t] || t) + ' 아래 칸';
    return (HN[t] || NAMES[t] || t) + (n ? ' ' + n : '');
  }
  const KEY_RE = /^[a-z][a-z0-9_]{0,40}(#\d{1,3})?(\.part)?$/;
  const MAX_LINKS = 300;

  // ---- 가구 key ----
  // objects = 배치표 물건 목록 (L.objects). -> 같은 순서의 key 배열
  function keysOf(objects) {
    const count = {}, seen = {};
    (objects || []).forEach((o) => { count[o.type] = (count[o.type] || 0) + 1; });
    return (objects || []).map((o) => { seen[o.type] = (seen[o.type] || 0) + 1; return count[o.type] > 1 ? o.type + '#' + seen[o.type] : o.type; });
  }
  const partKey = (k) => k + '.part';
  const baseKey = (k) => String(k).replace(/\.part$/, '');

  // ---- 저장 값 다듬기 (메인·화면 같이): 모양이 맞는 key, 아는 기능 id 또는 'none'만 ----
  function cleanLinks(o) {
    const out = {};
    if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    Object.keys(o).slice(0, MAX_LINKS).forEach((k) => { const v = o[k]; if (KEY_RE.test(k) && (v === NONE || getF(v))) out[k] = v; });
    return out;
  }
  function cleanSeen(a) { return Array.isArray(a) ? Array.from(new Set(a.filter((x) => BY_ID[x] && BY_ID[x].fnHabit))) : []; }

  // ---- 연결표 풀기: keys = 지금 집에 있는 key 목록(본체 + 아래 칸) -> { key: 기능 id } ----
  //   기본 연결 위에 사용자 바꾼 것. 한 기능이 둘 이상에 걸리면 사용자가 고른 쪽이 남음 (예전 여러 곳 저장 값도 여기서 하나로)
  function resolve(keys, overrides) {
    const has = new Set(keys || []), o = cleanLinks(overrides), map = {};
    Object.keys(DEFAULT_LINKS).forEach((k) => { if (has.has(k)) map[k] = DEFAULT_LINKS[k]; });
    Object.keys(o).forEach((k) => { if (!has.has(k)) return; if (o[k] === NONE) delete map[k]; else map[k] = o[k]; });
    Array.from(new Set(Object.values(map))).forEach((fid) => { // 정해진 기능 + 기록 칸 기능(rk:)
      const f = { id: fid };
      const ks = Object.keys(map).filter((k) => map[k] === f.id); if (ks.length <= 1) return;
      const keep = ks.find((k) => o[k] === f.id) || ks[0];
      ks.forEach((k) => { if (k !== keep) delete map[k]; });
    });
    return map;
  }
  // 한 가구에 기능 하나 붙이기 (fid = null | 'none' = 없음) -> 새 overrides. 기능은 원래 가구에서 빠짐
  function setLink(keys, overrides, key, fid) {
    if (!KEY_RE.test(String(key))) throw new Error('가구 key 오류');
    if (fid != null && fid !== NONE && !getF(fid)) throw new Error('모르는 기능: ' + fid);
    const cur = resolve(keys, overrides), o = cleanLinks(overrides), v = fid == null ? NONE : fid;
    o[key] = v;
    if (v !== NONE) Object.keys(cur).forEach((k) => { if (k !== key && cur[k] === v) o[k] = NONE; });
    Object.keys(o).forEach((k) => { if ((DEFAULT_LINKS[k] || NONE) === o[k]) delete o[k]; }); // 기본과 같으면 적지 않음
    return o;
  }
  // 기능 -> 붙은 key 목록
  function keysWith(map, fid) { return Object.keys(map).filter((k) => map[k] === fid); }

  // ---- 습관 줄에 따른 켜짐 ----
  // names = 생활습관 표 습관 이름들, seen = 표에 한 번이라도 있었던 일지 기능 id (앱 설정)
  //   -> 'on' (켜짐) | 'virtual' (일지 기능: 아직 표에 없고 한 번도 없었음 = 화면에 기본으로 보이고 첫 저장 때 표에 더함) | 'off' (꺼짐)
  function stateOf(fid, names, seen) {
    const f = getF(fid); if (!f) return 'off';
    if (!f.habit) return 'on'; // 기록 칸(rk:)·record 는 칸이 있는지 = js/furnish.js 가 생활 기록을 보고 정함
    const has = names instanceof Set ? names.has(f.habit) : (names || []).includes(f.habit);
    if (has) return 'on';
    if (f.fnHabit && !(seen || []).includes(f.id)) return 'virtual';
    return 'off';
  }
  const isOn = (fid, names, seen) => stateOf(fid, names, seen) !== 'off';
  function states(names, seen) { const out = {}; FEATURES.forEach((f) => { out[f.id] = stateOf(f.id, names, seen); }); return out; }
  // 생활습관 표에 있는 일지 기능 -> seen에 더할 것
  function seenFrom(names) { const n = names instanceof Set ? names : new Set(names || []); return FEATURES.filter((f) => f.fnHabit && n.has(f.habit)).map((f) => f.id); }
  const fnHabits = () => FEATURES.filter((f) => f.fnHabit);
  const byHabit = (name) => FEATURES.find((f) => f.fnHabit && f.habit === name) || null;

  const FX = { FEATURES, BY_ID, NONE, RK_RE, rkId, isRk: (id) => !!getF(id) && !!getF(id).rk, DEFAULT_LINKS, NAMES, nameOf, KEY_RE, keysOf, partKey, baseKey, cleanLinks, cleanSeen, resolve, setLink, keysWith, stateOf, isOn, states, seenFrom, fnHabits, byHabit, get: (id) => getF(id) };
  root.PHFeatures = FX;
  if (typeof module !== 'undefined' && module.exports) module.exports = FX;
})(typeof window !== 'undefined' ? window : globalThis);
