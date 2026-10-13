// 바탕화면 펫 커서 감시 한 걸음 (C2, 2026-10-14 비트). 계산만 (화면 접근 없음). electron/desk_pet.js watchCursor 가 0.15초마다 부른다
// 투명한 펫 창은 평소 클릭 통과(ignore). 화면 쪽(pet/pet.js)이 커서가 펫·말주머니 위에 오면 hit -> main 이 통과를 끔(클릭 받기)
// 오피스 펫 윈도우 버그(2026-10-13 Actions, tori-pet lib/cursor.js): 통과를 끈 채 커서가 순간 이동하거나 빨리 나가면 화면 쪽 mouseleave 가 안 와서
//   떠난 뒤에도 펫 창 자리(300x255)가 계속 클릭을 먹음 -> 커서가 창 밖이면 main 이 직접 통과를 다시 켜고, 화면 쪽 hit 를 false 로 되돌림(resetHit)
//   (하우스 펫은 통과를 끄는 것을 화면 쪽 hit 로만 해서 오피스 펫의 "몸 상자" 판단은 필요 없음)
'use strict';
function inWin(p, b) { return !!p && !!b && p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height; }
// s = { ignore, drag, hidden }, p = 커서 화면 좌표, bounds = 펫 창 { x, y, width, height }
// -> { ignore: true(다시 통과) | null(그대로), resetHit }
function step(s, p, bounds) {
  if (!s || s.hidden || s.drag || s.ignore) return { ignore: null, resetHit: false };
  return inWin(p, bounds) ? { ignore: null, resetHit: false } : { ignore: true, resetHit: true };
}
module.exports = { step, inWin };
