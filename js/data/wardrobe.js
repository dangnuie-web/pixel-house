// 옷 갈아입기 표 (wardrobe 브랜치 2026-10-03, 비트). 기획: 기획/20261003_pixel-house_옷갈아입기_v01.md, 그림 규격: 디자인/20261003_pixel-house_옷층규격_v01.md
// 그림은 js/outfit_data.js(PH_OUTFITS, scripts/outfit_bundle.py가 만듦). 이 파일은 탭·이름·기본 차림·쓰는 세트만
// 이름(name)은 칸에 보이는 짧은 이름 (기획서 목록을 줄임, 비트 임시). 그림 파일 label은 마우스를 올리면 보임
(function (root) {
  'use strict';
  const PH_WARDROBE = {
    SETS: ['v10', 'v12'],            // 옷 갈아입기가 되는 그림 세트 (v08·v09는 옷장을 눌러도 한 줄만)
    PREFIX: 'playerM',       // 옷을 입히는 캐릭터 그림 (settings ART_SETS.v10 chars.player.sprite)
    ORIGIN: [4, 6],           // 원래 24x30 그림을 32x36 층 캔버스에 놓는 자리 (무늬 규격 1장 origin_24x30, 파일에 있으면 그것)
    ANIMS: ['idle', 'walk_down', 'walk_up', 'walk_left', 'walk_right'],
    DEFAULT: { top: 2, bottom: 5, outer: null, bag: null, hat: null, onepiece: null }, // 기본 = 지금 입은 것 (상의 2 + 하의 5)
    STORE_KEY: 'pixel-house.outfit', // 브라우저로 열었을 때만 (앱은 userData/outfit.json, electron/outfit_ipc.js)
    // 탭 순서 = 화면 순서. none = "없음" 칸
    TABS: [
      { slot: 'top', label: '상의', none: false },
      { slot: 'bottom', label: '하의', none: false },
      { slot: 'outer', label: '외투', none: true },
      { slot: 'bag', label: '가방', none: true },
      { slot: 'hat', label: '모자', none: true },
      { slot: 'onepiece', label: '한벌', none: false },
    ],
    NONE_LABEL: '없음',
    NOT_READY: '준비 중',
    WEARING: '입는 중',
    FACES: { down: '앞', left: '왼쪽', up: '뒤', right: '오른쪽' },
    KEYS_HINT: 'Q·E 탭 · ↑↓ 고르기 · ←→ 돌려 보기 · Esc 닫기',
    ITEMS: {
      top: { 1: '연회색 오프숄더 니트', 2: '베이지 단가라', 3: '하늘 카라 회색 니트', 4: '핑크 카라 아이보리 니트' },
      bottom: { 1: '차콜 청치마', 2: '연청치마', 3: '베이지 플리츠 치마', 4: '갈색 바지', 5: '노란 요가바지' },
      outer: { 1: '청색 로브', 2: '검정 라이더 자켓', 3: '카키 야상' },
      bag: { 1: '갈색 자가드 숄더백', 2: '고동색 크로스백' },
      hat: { 1: '베이지 캡모자', 2: '아이보리 벙거지' },
      onepiece: { 1: '페이즐리 원피스', 2: '인디언핑크 잠옷' },
    },
  };
  root.PH_WARDROBE = PH_WARDROBE;
  if (typeof module !== 'undefined' && module.exports) module.exports = PH_WARDROBE;
})(typeof window !== 'undefined' ? window : globalThis);
