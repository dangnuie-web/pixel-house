// (비트 임시 -> 부기 다듬음 2026-10-04, 기획/20261004_pixel-house_오늘대사_v01.md) 대변 관찰 일지·식사 일지 두부 대사. 2026-10-04 logs 브랜치
//   쓰는 곳: PH_LINES.ui.logs (js/log_modal.js, js/logs_view.js), 집 물건 대사 PH_INTERACT_LINES.obj.toilet.go / table_two.go (js/interact.js)
//   lines.js·interact_lines.js를 고치지 않고 실행할 때 그 아래에 붙임 (합칠 때 충돌을 줄이려고). 부기 원고가 오면 옮겨도 됨
//   하우스 규칙: 평가·잔소리·연속 기록 숫자 없음. 대변 기록은 의학 판단 문구 없음 (모양·색·양에 대해 좋다/나쁘다 말하지 않음)
//   배열 = 무작위 하나 (바로 앞 줄은 다시 안 고름). {menu} = 메뉴 이름
(function (root) {
  'use strict';
  const P = root.PH_LINES = root.PH_LINES || {};
  P.ui = P.ui || {};
  P.ui.logs = Object.assign({
    poop: {
      saved: ['관찰 일지에 적어 뒀어요. 고마워요냥~', '한 줄 남겨 뒀어요. 알려 주셔서 고마워요냥~'],
      edited: ['고친 대로 적어 뒀어요냥~'],
      removed: ['지웠어요. 바로 아래에서 되돌릴 수 있어요냥~'],
      restored: ['되돌려 뒀어요냥~'],
    },
    meal: {
      saved: ['{menu}, 식사 일지에 적어 뒀어요냥~', '{menu}, 잘 받아 적었어요. 고마워요냥~'],
      edited: ['{menu} 기록, 고쳐 뒀어요냥~'],
      removed: ['지웠어요. 바로 아래에서 되돌릴 수 있어요냥~'],
      restored: ['{menu}, 되돌려 뒀어요냥~'],
    },
    conflict: '그사이 기록이 바뀌어 다시 읽었어요. 한 번 더 부탁해요냥~',
    fail: '이번 건 적지 못했어요. 죄송해요냥~',
    browserOnly: '앱에서만 적을 수 있어요냥~',
    emptyDay: '이날은 기록이 없어요.',
  }, P.ui.logs);
  // 집 물건 대사: 변기 = 대변 관찰 일지, 거실 2인 테이블 = 식사 일지 (제작자 2026-10-04). 원래 대사는 idle로 그대로
  const IL = root.PH_INTERACT_LINES;
  if (IL && IL.obj) {
    const wrap = (k, go) => { const v = IL.obj[k]; IL.obj[k] = Array.isArray(v) || typeof v === 'string' ? { idle: [].concat(v), go } : Object.assign({ go }, v || {}); };
    wrap('toilet', ['관찰 일지 펼쳐 둘게요. 저는 고개 돌리고 있을게요냥~']);
    wrap('table_two', ['식사 일지 펼쳐 둘게요. 뭐 드셨어요냥~?']);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
})(typeof window !== 'undefined' ? window : globalThis);
