// 임시 색: 무늬 아이콘 메모 팔레트 (처음 v01 기준. v01은 2026-10-06 정리 때 지움, 최신 판: (제작 문서))
// 새 색을 만들지 않는다. 임시 그림(placeholders.js)과 고양이 문자 맵이 이 글자를 쓴다.
(function (root) {
  'use strict';
  const PH_PAL = {
    A: '#29262F', // 외곽선
    D: '#34384A', // 밤하늘
    Y: '#F3CF6B', // 달, 조명 불빛
    y: '#E0A84A', // 달·갓 그늘
    H: '#F5DDB6', // 별, 반사
    W: '#B07A4F', // 나무 밝은 면
    w: '#7E5236', // 나무 그늘
    S: '#D9C19B', // 소파 패브릭 (오트밀 아이보리)
    s: '#BC9F78', // 소파 그늘, 솔기
    h: '#EBDCBE', // 소파 윗면 하이라이트
    C: '#F4F3EF', // 고양이 흰 털
    c: '#CFCCD3', // 고양이 연회색 그늘
    p: '#E9A9A0', // 귀 안, 코
    O: '#E08A3C', // 주황 (임시 그림의 목걸이 자리)
    o: '#B0622B', // 주황 그늘
    G: '#86B07E', // 잎 밝은
    g: '#5C8458', // 잎 그늘
  };
  root.PH_PAL = PH_PAL;
  if (typeof module !== 'undefined' && module.exports) module.exports = PH_PAL;
})(typeof window !== 'undefined' ? window : globalThis);
