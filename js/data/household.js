// 살림 (인벤토리·사야 할 것·청소 습관·냉장고 메모지) 설정 표 (2026-10-03 제작자 지시, 토리 기본값 = 기획/20261003_pixel-house_인벤토리_살림_v01.md)
//   파일에 들어가는 글자(분류·알약·출처·종류)는 여기서만 바꾼다. 계산은 js/household.js, 화면은 js/inventory.js·js/fridge_memo.js·js/household_card.js
(function (root) {
  'use strict';
  const H = {
    // 위쪽 큰 탭 4개 (제작자 2026-10-03: 큰 탭 "주방"을 없애고 생활용품 > 주방 알약으로 합침) (id = 화면·대사 키, name = 파일 "분류" 칸 글자). pills = 안쪽 알약 (파일 "알약" 칸). 알약 없는 탭은 알약 칸이 빈칸
    CATS: [
      { id: 'food', name: '식재료', pills: ['냉장고', '냉동실', '실온', '조미료'] }, // 조미료·약통 알약: 2026-10-04 제작자 물건 목록
      { id: 'living', name: '생활용품', pills: ['생활', '욕실', '주방', '청소', '약통'] },
      { id: 'cosmetic', name: '화장품', pills: [] },
      { id: 'misc', name: '잡화', pills: [] },
    ],
    // 비어 있으면 숨기는 알약 (없음. 생활용품 "주방"은 제작자 결정으로 퐁퐁·고무장갑·수세미가 들어감)
    HIDE_EMPTY_PILLS: {},
    // 가구 -> 처음 열리는 탭. part = 그림 안 일부만 누르는 곳 (y0 = 그림 높이에 대한 비율, 그 아래 전부). 세트마다 그림 크기가 달라 비율로
    //   거울(mirror_oval): 위쪽 거울 = 옷장 창(그대로), 하단 서랍(28/46 줄부터) = 화장품
    //   TV장(tv_cabinet): 위쪽 TV = 켜기·끄기(그대로), 아래 장(22/42) = 잡화
    //   거실 수납선반(shelf_unit): 위 선반 = 흔들림(그대로), 하단장(33/56) = 생활용품
    //   주방장(kitchen_cabinet): 전체 = 생활용품 탭의 주방 알약 (위 정수기는 따로 놓인 물건이라 그대로 물 창)
    //   냉장고(fridge): 메모지 창이 먼저 (js/fridge_memo.js), 그 안 "냉장고 열기" = 식재료
    FURNITURE: {
      shelf_unit: { cat: 'living', part: { y0: 33 / 56 } },
      tv_cabinet: { cat: 'misc', part: { y0: 22 / 42 } },
      mirror_oval: { cat: 'cosmetic', part: { y0: 28 / 46 } },
      kitchen_cabinet: { cat: 'living', pill: '주방' },
      fridge: { cat: 'food', memo: true },
    },
    // 기본 아이템 (제작자 원문 목록 전부, 수량 1). 파일에 ## 살림 물건이 없으면 화면에만 이것을 보여 주고, 처음 바꿀 때 섹션을 만들며 씀
    DEFAULT_ITEMS: [
      ['food', '냉장고', '달걀'], ['food', '냉장고', '김치'], ['food', '실온', '햇반'], ['food', '냉동실', '버터'], ['food', '냉동실', '명란'],
      ['living', '생활', '화장지'], ['living', '생활', '탈취제'], ['living', '생활', '세제'], ['living', '생활', '섬유유연제'],
      ['living', '욕실', '샴푸'], ['living', '욕실', '린스'], ['living', '욕실', '바디워시'], ['living', '욕실', '핸드워시'], ['living', '욕실', '가그린'], ['living', '욕실', '칫솔'], ['living', '욕실', '치약'],
      ['living', '청소', '정전기 청소포'], ['living', '청소', '물티슈 청소포'],
      ['living', '주방', '퐁퐁'], ['living', '주방', '고무장갑'], ['living', '주방', '수세미'],
      ['cosmetic', '', '립스틱'], ['cosmetic', '', '볼터치'],
      ['misc', '', '가위'], ['misc', '', '테이프'], ['misc', '', 'A4 용지 묶음'],
    ],
    DEFAULT_QTY: 1,
    // 생활필수품 기본 (토리 기본값, 제작자이 바꿀 수 있음)
    DEFAULT_ESSENTIALS: ['화장지', '세제', '샴푸', '치약', '칫솔', '퐁퐁', '햇반', '달걀'],
    ESSENTIAL_MARK: '예',   // 파일 "필수" 칸 글자 (아니면 빈칸)
    SHOP_SRC: { auto: '자동', manual: '직접' }, // 파일 "출처" 칸
    MAX_QTY: 999, MAX_NAME: 30,
    // 화장품 색 칩 = 무늬 item_lipstick·item_blush의 swap 6색 (X = 본색, 9 = 그늘). 두 물건이 같은 6색을 씀. 메모 칸에 "색 코랄"로 적음, 얼굴 반영은 나중
    //   메모가 비어 있으면 기본색(립스틱 코랄, 볼터치 피치)을 지금 색으로 보여 줌 (파일에는 안 씀)
    COLOR_ITEMS: { 립스틱: 'lip', 볼터치: 'blush' },
    SWAP: [
      { name: '코랄', X: '#E8806A', 9: '#B8604F' }, { name: '로즈', X: '#D6687E', 9: '#A84E62' }, { name: '누드', X: '#C9927C', 9: '#9B6E5D' },
      { name: '레드', X: '#C93B3F', 9: '#982B30' }, { name: '피치', X: '#F2A585', 9: '#C27F66' }, { name: '베리', X: '#A04A6B', 9: '#783751' },
    ],
    COLOR_DEFAULT: { lip: '코랄', blush: '피치' },
    COLOR_MEMO: '색 ', // 메모 칸 "색 코랄"
    // 청소 습관 (## 생활습관 표, 종류 "살림"). 파일에 살림 줄이 하나도 없으면 화면에만 이것을 보여 주고, 처음 체크할 때 다섯 줄을 표 끝에 더함
    //   key = 부기 대사 chore.done.<key> (토리 결정 2026-10-03)
    CHORE_KIND: '살림',
    CHORES: [
      { name: '청소기', key: 'vacuum', target: '-', cycle: '주 2회' },
      { name: '화장실 청소', key: 'bathroom', target: '-', cycle: '주 1회' },
      { name: '빨래', key: 'laundry', target: '-', cycle: '주 2회' },
      { name: '설거지', key: 'dishes', target: '-', cycle: '매일' },
      { name: '분리수거', key: 'recycle', target: '-', cycle: '주 1회' },
    ],
    // 아이템 아이콘: 이름 -> 무늬 그림 키 (디자인/에셋/20261003_pixel-house_item_<키>_v01.json, sync로 묶이면 바로 씀).
    //   2026-10-03 무늬 item_*_v01 파일 이름에 맞춤 (대응표 문서가 오기 전, 이름으로 맞춤. 대응표가 오면 다시 확인). 그림이 없으면 "알 수 없는 물건"(item_unknown, 그것도 없으면 화면 임시 그림)
    ICONS: {
      달걀: 'egg', 김치: 'kimchi', 햇반: 'rice', 버터: 'butter', 명란: 'myeongran',
      화장지: 'toilet_paper', 탈취제: 'deodorizer', 세제: 'detergent', 섬유유연제: 'softener',
      샴푸: 'shampoo', 린스: 'conditioner', 바디워시: 'bodywash', 핸드워시: 'handwash', 가그린: 'mouthwash', 칫솔: 'toothbrush', 치약: 'toothpaste',
      '정전기 청소포': 'dry_wipe', '물티슈 청소포': 'wet_wipe',
      퐁퐁: 'dish_soap', 고무장갑: 'rubber_gloves', 수세미: 'sponge',
      립스틱: 'lipstick', 볼터치: 'blush',
      가위: 'scissors', 테이프: 'tape', 'A4 용지 묶음': 'a4_paper',
      // 2026-10-04 제작자 물건 목록 84개 (크린백 = 롤 위생백, 지퍼백 따로: 제작자 결정. 대응표 = 기획/20261004_pixel-house_인벤토리아이콘_추가목록_v01.md, 무늬 item_*_v01)
      // 식재료: 실온 / 냉장고 / 조미료 / 냉동실
      생수: 'water_bottle', 컵라면: 'cup_ramen', 김: 'gim', 김가루: 'gim_flakes', 커피: 'coffee', 그래놀라: 'granola', '단백질 쉐이크': 'protein_shake',
      우유: 'milk', 미역: 'seaweed', 마요네즈: 'mayonnaise', 케챱: 'ketchup', 파슬리: 'parsley', 치즈: 'cheese', 두부: 'tofu', 맥주: 'beer', 소주: 'soju', 다진마늘: 'minced_garlic', 꿀: 'honey',
      양조간장: 'soy_brewed', 진간장: 'soy_dark', 국간장: 'soy_soup', 쯔유: 'tsuyu', 참기름: 'sesame_oil', 들기름: 'perilla_oil', 식초: 'vinegar', 사과식초: 'apple_vinegar',
      굴소스: 'oyster_sauce', 치킨스톡: 'chicken_stock', 코인육수: 'broth_coin', 알룰로오스: 'allulose', 설탕: 'sugar', 소금: 'salt', 핑크솔트: 'pink_salt', 후추: 'pepper',
      통아이스크림: 'ice_cream_tub', 하드: 'ice_bar', 쮸쮸바: 'tube_ice', 닭가슴살: 'chicken_breast', 만두: 'dumpling',
      // 생활용품: 생활 / 욕실 / 주방 / 청소 / 약통
      모기퇴치제: 'mosquito_repellent', 물티슈: 'wet_tissue', '소독 스프레이': 'sanitizer_spray', 마스크: 'mask', 수건: 'towel',
      '생리대(대형)': 'pad_large', '생리대(소형)': 'pad_small', '생리대(중형)': 'pad_medium', '초파리 퇴치제': 'fruitfly_trap', '브리타 필터': 'water_filter', 키친타올: 'kitchen_towel', 쓰레기봉투: 'trash_bag',
      비누: 'soap', 폼클랜징: 'foam_cleanser',
      크린백: 'roll_bag', 지퍼백: 'zip_bag', 비닐장갑: 'vinyl_gloves', '음식물쓰레기 봉투': 'food_waste_bag', 베이킹소다: 'baking_soda', 과탄산소다: 'oxygen_bleach',
      글라스클리너: 'glass_cleaner',
      소화제: 'digestive', 밴드: 'bandage', '오메가-3': 'omega3', '비타민-c': 'vitamin_c', '비타민-d': 'vitamin_d', 칼슘마그네슘: 'calcium_magnesium', 히알루론산: 'hyaluronic',
      // 화장품 (알약 없음, 색 바꾸기 없음)
      스킨: 'toner', 앰플: 'ampoule', 로션: 'lotion', 크림: 'cream', 아이라이너: 'eyeliner', 뷰러: 'eyelash_curler', 팩트: 'compact', 파운데이션: 'foundation',
      프라이머: 'primer', 아이쉐도우: 'eyeshadow', 아이브로우: 'eyebrow', 쉐딩: 'contour', 하이라이터: 'highlighter', 브러쉬: 'brush', 마스카라: 'mascara', 클렌징워터: 'cleansing_water', 클렌징오일: 'cleansing_oil',
    },
    ICON_PREFIX: 'item_', UNKNOWN_ICON: 'unknown',
  };
  H.COLORS = { lip: H.SWAP.map((c) => ({ name: c.name, hex: c.X })), blush: H.SWAP.map((c) => ({ name: c.name, hex: c.X })) };
  root.PH_HOUSEHOLD = H;
  if (typeof module !== 'undefined' && module.exports) module.exports = H;
})(typeof window !== 'undefined' ? window : globalThis);
