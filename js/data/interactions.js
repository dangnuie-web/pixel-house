// 물건별 반응 표 (F 집 안 상호작용). 물건 = 그림 세트 layout의 objects (type 이름) + 집 밖 구역(layout outside).
// 표에 없는 물건도 누를 수 있음: 대사(js/data/interact_lines.js obj.<type>) 한 줄 + 기본 움직임(shake).
// 2026-10-04 가구 연결: 어느 가구가 어떤 기능을 여는지(전의 go·cat·pill·say)는 js/features.js 연결표(DEFAULT_LINKS + 사용자 값)로 옮김.
//   이 표에는 가구 자체의 모습·반응만 남김 (fx, floor, part 자리, lampPart, open, spaceOverDubu). 아래 "go" 설명은 기능 목록(features.js FEATURES go)의 뜻
// 칸 뜻
//   go:    (features.js) 기능 입구. fridgeMemo(냉장고 메모지 창, 2026-10-03) / inventory(인벤토리 창, cat = 처음 탭) / meetings(약속 탭) / archive(생활일지 탭) / reading(생활일지 > 독서 책꽂이, journal 2026-10-03) / bookModal(집 위 독서 책꽂이 창, 2026-10-03 제작자: 책꽂이는 이제 이것) / close(C 하루 마감) / water(B 물 +1) / yoga(요가 묻기) / study(공부 간트 카드) / wardrobe(옷 갈아입기 창) / waterModal(정수기 물 기록 창) / poopLog·mealLog(대변 관찰·식사 일지 창, logs 2026-10-04)
//   spaceOverDubu: 두부가 그 위에 앉아 있어도 제작자이 두부 칸이 아닌 이 물건 칸을 마주 보고 Space를 누르면 물건이 먼저 (table_two)
//   fx:    작은 움직임. shake(흔들림) / hop(통 튐) / sparkle(반짝임 그림) / lamp(불 켜기·끄기) / tv(TV 켜짐 화면) / none
//   open:  기능 입구를 열 때 잠깐 바꿔 그리는 그림 (냉장고 문 열림 fridge_open)
//   floor: 바닥에 깔린 것(카펫·매트). 제작자이 그 위나 바로 옆일 때만 클릭이 반응 (멀리서 누르면 예전처럼 걸어감)
//   lines: 대사 키 (interact_lines.js 안 경로). 없으면 obj.<type> (묶음이면 obj.<type>.idle)
//   lampPart: 그림 안 불빛 글자(E) 둘레만 따로 누르는 곳(불 켜기·끄기). 책꽂이 위 작은 조명
//   part:  그림 아래쪽 일부만 따로 누르는 곳 { y0(그림 높이 비율, 그 아래 전부) }. 기능은 연결표 key "<가구>.part" (기본: 하단장·TV장 아래 장·거울 하단 서랍 = 인벤토리). 기능이 없으면 그 칸은 본체와 같음
//          세트마다 그림 크기가 달라 비율로 (v10·v12 줄 수 기준). 클릭은 그 칸이 먼저, Space도 마주 본 칸과 겹치면 그 칸이 먼저
// 그림(무늬 MVP 그림 v10, 2026-10-03): 그림 JSON 안 값(px·py·ms·anchor·lamp·replaces·overlay_on)을 그대로 씀.
//   그 세트에 그림이 없으면(v08·v09) 그림은 안 바꾸고 말풍선만
(function (root) {
  'use strict';
  const PH_INTERACTIONS = {
    objects: {
      fridge: { fx: 'none', open: 'fridge_open' }, // 기본 기능 = 약속 메모지 창(js/fridge_memo.js), 그 안 "냉장고 열기" = 식재료 인벤토리 + 문 열림 그림
      kitchen_cabinet: { fx: 'none' }, // 기본 기능 = 살림: 생활용품 주방 알약 (말 = inv.open.kitchen)
      shelf_unit: { fx: 'shake', part: { y0: 33 / 56 } }, // 거실 수납선반: 하단장(33/56 줄부터) 기본 = 생활용품, 위 선반 = 흔들림
      bookshelf: { fx: 'shake', lampPart: { lines: ['obj', 'bookshelf', 'idle'], onlyOn: true } }, // 기본 기능 = 독서 책꽂이 창
      bed: { fx: 'none' }, // 기본 기능 = 하루 마감
      toilet: { fx: 'none' }, // 기본 기능 = 대변 관찰 일지 (2026-10-04 logs)
      table_two: { fx: 'none', spaceOverDubu: true }, // 기본 기능 = 식사 일지. 두부 그림 위 클릭·두부 쪽 Space는 두부 대화창이 먼저, 테이블 나머지·다른 방향 Space = 붙은 기능 (기능이 없거나 꺼지면 두부 먼저)
      sink_v: { fx: 'none' },   // 기본 기능 = 물 한 잔 바로 +1 (창은 정수기)
      purifier: { fx: 'none' }, // v11·v12 주방 정수기, 기본 기능 = 물 기록 창. 자리·그리는 순서는 layout(px·py·draw_after·sort_y)
      rug_round: { fx: 'none', floor: true }, // 기본 기능 = 요가 묻기
      table_long: { fx: 'shake' }, // 기본 기능 = 공부 간트
      floorlamp: { fx: 'lamp' },
      floorlamp_round: { fx: 'lamp' },
      tv_cabinet: { fx: 'tv', part: { y0: 22 / 42 } }, // TV = 켜기·끄기, 아래 장(22/42 줄부터) 기본 = 잡화
      rug_persian: { fx: 'none', floor: true },
      bathmat: { fx: 'none', floor: true },
      doormat: { fx: 'none', floor: true },
      shoes: { fx: 'hop', floor: true },
      gate: { fx: 'shake' },
      clock: { fx: 'shake' },
      chair_brown: { fx: 'hop' },
      chair_side: { fx: 'hop' },
      flowers_a: { fx: 'sparkle', floor: false }, flowers_b: { fx: 'sparkle', floor: false }, flowers_c: { fx: 'sparkle', floor: false },
      shrub: { fx: 'shake' }, tree: { fx: 'shake' },
      mirror_oval: { fx: 'sparkle', part: { y0: 28 / 46 } }, // 기본: 거울 = 기능 없음(일반 반응, 2026-10-04 옷 갈아입기는 벽쪽 옷장 하나로), 하단 서랍(28/46 줄부터) = 화장품
      bath_mirror: { fx: 'sparkle' },
      wardrobe_top: { fx: 'none' }, wardrobe_side: { fx: 'none' }, // 기본 기능: 벽쪽 옷장 = 옷 갈아입기 창 (js/wardrobe.js), 위쪽 옷장 = 없음 (2026-10-04)
      // 공용 원룸 (2026-10-08, 무늬 공용판원룸 v01): 물건 type = 자리 이름. 기능은 자리마다 (js/house_slots.js)
      cup_water: { fx: 'none' }, calendar: { fx: 'shake' }, table_low: { fx: 'none' }, desk: { fx: 'shake' }, plant: { fx: 'shake' },
      rug: { fx: 'none', floor: true },
      // 집 밖 구역 (그림 없음, layout outside의 px 범위)
      stairs: { fx: 'none', area: true }, garden: { fx: 'none', area: true }, veranda: { fx: 'none', area: true },
    },
    DEFAULT: { fx: 'shake' },
    // 자리 후보 그림이 type과 다를 때 덮는 값 (js/interact_logic.js spots). 공용 원룸 스탠드 자리(type floorlamp)에 산세베리아 = 흔들림 + 일반 대사 (부기 공용판 v01 5절 2번)
    sprites: { plant_snake: { fx: 'shake' } },
    // B 물 화분 (토리 결정 2026-10-03: sink_v 그림 안 창가 화분. 무늬 waterplant_0/1/2를 sink_v 다음에 덮어 그림, 자리 = 그림 JSON px·py)
    //   단계: 오늘 물 칸 수 0~1 = base / 2~4 = grow / 5~6 = bloom. 시들기 없음. 그림이 없는 세트는 sink_v 그대로
    //   sparkleAt: 꽃 필 때·6칸이 될 때 반짝임 자리 (무늬 전달 "(27,145) 근처")
    WATER_PLANT: { on: 'sink_v', stages: [{ id: 'base', min: 0, sprite: 'waterplant_0' }, { id: 'grow', min: 2, sprite: 'waterplant_1' }, { id: 'bloom', min: 5, sprite: 'waterplant_2' }], sparkleAt: [27, 145] },
    MARK_SPRITE: 'hint',       // "누를 수 있음" 표시 (anchor = 꼬리 끝을 물건 윗변 가운데 2px 위, y<0이면 1)
    SPARKLE_SPRITE: 'sparkle', // 반짝임 (anchor = 가운데, 한 번 재생)
    TV_SPRITE: 'tv_on',        // TV 켜짐 화면 덮개 (반복)
    LAMP_STORE_KEY: 'pixel-house.lamps', // 켠·끈 스탠드 기억 (그날만, 하루 경계 settings.DAY_START_HOUR가 지나면 기본으로)
    OPEN_MS: 1200,             // 냉장고 문 열린 그림을 보여 주는 시간
    // C 하루 마감: 침대 발치 = 침대 그림의 어느 쪽인지 (v10 그림은 베개가 아래쪽 = 발치는 위쪽)
    BED_FOOT: 'top',
    CLOSE_BANDS: ['evening', 'night', 'dawn'], // 하루 마감을 하는 시간대 (settings.TIME_BANDS id)
    DIM_T: 0.75,                                // "잘 자요냥~" 뒤 밝기 (1 = 그대로, 무늬 fade 표 한 단계 = 0.25)
    // A 약속: 내일 약속도 말하는 시간대
    APPT_TOMORROW_BANDS: ['evening', 'night'],
    APPT_BUBBLE_MS: 6000,
    // D 기분 4칸 (두 축: 기분 좋음/별로 x 기운 있음/없음). 이름·설명 = 부기 원고 mood.label.*, 그림 = 무늬 mood_0~3. 파일에는 이름만 적음
    //   순서 = 2열 선택지: 위 줄(기운 있음) mood_0·mood_2, 아래 줄(기운 없음) mood_1·mood_3 (무늬 2x2 배치)
    MOODS: [
      { id: 'bright', label: '반짝', desc: '기분 좋고 기운 나요', axis: '좋음 · 기운 있음', sprite: 'mood_0' },
      { id: 'edgy', label: '까슬', desc: '마음이 예민해요', axis: '별로 · 기운 있음', sprite: 'mood_2' },
      { id: 'calm', label: '포근', desc: '기분 좋고 차분해요', axis: '좋음 · 기운 없음', sprite: 'mood_1' },
      { id: 'low', label: '노곤', desc: '기운이 없어요', axis: '별로 · 기운 없음', sprite: 'mood_3' },
    ],
    // 연타 막기: 같은 물건을 다시 눌러도 이 시간(ms) 안에는 반응 안 함 (불 켜기·끄기는 짧게)
    COOLDOWN_MS: 1600, LAMP_COOLDOWN_MS: 350,
  };
  root.PH_INTERACTIONS = PH_INTERACTIONS;
  if (typeof module !== 'undefined' && module.exports) module.exports = PH_INTERACTIONS;
})(typeof window !== 'undefined' ? window : globalThis);
