// 화면에 나오는 캐릭터 표. 캐릭터를 더할 때는 여기 한 줄을 더한다.
//   sprite: 그림 이름 앞부분. 그림 키 = {sprite}_idle, {sprite}_walk_down/_up/_left/_right (오른쪽 없으면 왼쪽 뒤집기)
//   home: 자기 자리 {x, y} (칸, 전개도 한 장). 두부 = 주방(왼쪽 아래 쪽, v04 spawn.dubu_home), 토리 = 침실(오른쪽 아래, spawn.tori) (하우스 CLAUDE.md "화면")
//   brain: 움직임 방식. 'player' = 키보드·클릭으로 움직임, 'stay' = 자리에 있음.
//          나중에 'wander'(자기 구역 돌아다니기)를 game.js BRAINS에 더하면 된다. area = 돌아다닐 칸 범위
//   talk: 클릭했을 때 대사 묶음 (lines.js 키)
(function (root) {
  'use strict';
  const PH_ACTORS = [
    { id: 'dubu', name: '두부', sprite: 'dubu', home: { x: 6, y: 13 }, brain: 'wander', talk: 'click',
      area: { x1: 3, y1: 11, x2: 13, y2: 15 } }, // home = 무늬 v05 spawn.dubu_walk_start(주방, 걸어 다닐 때 시작 칸). 평소 쉬는 자리 = spawn.dubu_home(거실 테이블 위, game.js restSpot)
    // 제작자 (하우스판, 무늬 player_*_v02). 입장 때 계단을 올라와 현관 안쪽에 서 있음. 조작은 아직 두부만 (제작자께 여쭤볼 예정)
    //   home·자리는 입장 동선(layout entry_path)과 game.js PLAYER_STAND에서 정함
    { id: 'player', name: '플레이어', sprite: 'player', home: { x: 11, y: 18 }, brain: 'stay', talk: null, startHidden: true }, // 그림·배율은 세트마다 settings.ART_SETS[세트].chars (js/artset.js)
    // 다음 판 (이번 범위 아님): 토리. 그림(tori_*)과 대사 묶음이 생기면 주석을 풀고 brain을 'wander'로
    // { id: 'tori', name: '토리', sprite: 'tori', home: { x: 21, y: 17 }, brain: 'stay', talk: null,
    //   area: { x1: 17, y1: 16, x2: 27, y2: 22 } }, // 무늬 layout v04 spawn.tori (21,17) 침실, roam.tori
  ];
  root.PH_ACTORS = PH_ACTORS;
  if (typeof module !== 'undefined' && module.exports) module.exports = PH_ACTORS;
})(typeof window !== 'undefined' ? window : globalThis);
