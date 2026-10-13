// 바탕화면 펫 커서 감시 한 걸음 (C2·D1, 2026-10-14 비트). 계산만 (화면 접근 없음). electron/desk_pet.js watchCursor 가 0.12초마다 부른다
// 투명한 펫 창은 평소 클릭 통과(ignore). 통과 중엔 창이 마우스를 못 받으니, 펫 위에 왔는지는 두 길로 앎:
//   (가) 화면 쪽(pet/pet.js)이 넘겨받은 mousemove(forward)로 판단해 hit 를 보냄
//   (나) main 이 커서 자리(screen.getCursorScreenPoint)가 펫 몸 상자 안이면 통과를 끔 → 그다음은 창이 진짜 마우스를 받아 화면 쪽이 정확한 그림 점으로 다시 판단
// (나)를 더한 까닭: 2026-10-14 윈도우 Actions 38453257327 — 커서를 펫 위에 놓아도 화면 쪽에 mousemove 가 안 옴(rendererHit false, 통과 그대로).
//   윈도우의 forward 는 저수준 마우스 훅으로 넘기는데 시험의 SetCursorPos 는 그 훅을 안 거침(추정). 진짜 마우스에선 오는지 확인 못 함 → forward 에만 기대지 않음
//   오피스 펫 tori-pet lib/cursor.js 와 같은 방식 (몸 상자 + 화면 쪽 판단 존중 said + 창 밖이면 main 이 다시 통과)
'use strict';
function inWin(p, b) { return !!p && !!b && p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height; }
// 펫 몸 상자: 가운데 cx, 발 by, 그림 tw x th (화면 좌표). 가운데 60% 폭, 발 위 10%~85% 높이 (투명한 귀·꼬리 끝은 화면 쪽이 가림)
function inBody(p, box) { return !!p && !!box && Math.abs(p.x - box.cx) <= box.tw * 0.3 && p.y >= box.by - box.th * 0.85 && p.y <= box.by - box.th * 0.1; }
// s = { ignore, drag, hidden, dialog, said }, said = 화면 쪽이 마지막에 알려 준 hit (true|false|null=모름)
// -> { ignore: 바꿀 값 | null, resetHit: 화면 쪽 hit 를 모름으로, clearSaid: said 를 null 로 }
//   화면 쪽이 "그 점은 펫 아님(false)"이라고 하면 커서가 몸 상자 안에 있는 동안은 다시 켜지 않음 (상자 안 투명한 점에서 깜빡이지 않게). 상자 밖으로 나가면 잊음 (2026-10-14 고침: 전엔 창 밖까지)
//   말풍선 메뉴가 열려 있으면(dialog) 창 안 어디든 클릭 받기 (메뉴 칸을 누를 수 있게)
function step(s, p, box, bounds) {
  const none = { ignore: null, resetHit: false, clearSaid: false };
  if (!s || s.hidden || s.drag) return none;
  const inside = inWin(p, bounds);
  if (s.ignore) {
    if (!inside) return s.said === null || s.said === undefined ? none : { ignore: null, resetHit: false, clearSaid: true };
    if (s.dialog) return { ignore: false, resetHit: true, clearSaid: false };
    if (inBody(p, box)) return s.said !== false ? { ignore: false, resetHit: true, clearSaid: false } : none;
    // 몸 상자 밖(창 안 빈 곳)에 있으면 "펫 아님"을 잊음 → 다시 몸 위로 오면 켬 (Actions 38454677265: 빈 곳에서 "펫 아님" 뒤 창을 안 나가고 몸 위로 옮기니 끝까지 안 켜졌음)
    return s.said === false ? { ignore: null, resetHit: false, clearSaid: true } : none;
  }
  return inside ? none : { ignore: true, resetHit: true, clearSaid: true };
}
module.exports = { step, inWin, inBody };
