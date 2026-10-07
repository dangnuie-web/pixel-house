// (비트 임시, 부기가 다듬을 자리) 생활일지·독서 책꽂이·약속 달력 두부 대사. 2026-10-03 journal 브랜치
//   쓰는 곳: PH_LINES.ui.book (js/bookshelf.js), ui.journal (js/journal.js), ui.calendar (js/calendar.js), ui.meeting (js/meeting_edit_ui.js)
//   lines.js를 고치지 않고 여기서 PH_LINES.ui 아래에 붙임 (합칠 때 lines.js 충돌을 줄이려고). 부기 원고가 오면 lines.js로 옮겨도 됨
//   배열 = 무작위 하나 (바로 앞 줄은 다시 안 고름). {title} = 책 제목
//   하우스 규칙: 평가·잔소리·연속 기록 숫자 없음
(function (root) {
  'use strict';
  const P = root.PH_LINES = root.PH_LINES || {};
  P.ui = P.ui || {};
  P.ui.book = Object.assign({
    saved: ['{title}, 책꽂이에 꽂아 뒀어요냥~', '한 권 더 꽂혔어요. 책꽂이가 조금 든든해졌어요냥~'],
    edited: ['{title} 기록, 고쳐 뒀어요냥~'],
    archived: ['{title}, 보관함에 넣어 뒀어요. 언제든 되돌릴 수 있어요냥~'],
    restored: ['{title}, 다시 책꽂이에 꽂았어요냥~'],
    conflict: '파일이 바뀌어서 다시 읽었어요. 한 번 더 눌러 주세요냥~',
    fail: '저장하지 못했어요. 파일을 한번 봐 주세요냥~',
    empty: '아직 꽂힌 책이 없어요. 다 읽은 책이 생기면 "기록하기"를 눌러 주세요냥~',
    noSummary: '요약은 비어 있어요.',
  }, P.ui.book);
  P.ui.journal = Object.assign({ empty: '아직 {habit} 기록이 없어요. 적으면 여기 한 줄씩 쌓여요냥~' }, P.ui.journal);
  P.ui.calendar = Object.assign({ none: '이날은 약속이 없어요.' }, P.ui.calendar);
  // 약속 쓰기 (2026-10-07 비트 임시, 부기가 다듬을 자리. js/meeting_edit_ui.js). {day} = "10월 9일", {text} = 약속 내용
  //   대사 = 두부 한 줄(냥~), plain = 버튼·안내 글(냥~ 없음). 잔소리·평가 없음
  P.ui.meeting = Object.assign({
    added: ['{day} 약속, 적어 뒀어요냥~'],
    updated: ['{text}, 고쳐 적어 뒀어요냥~'],
    same: ['바뀐 게 없어서 그대로 뒀어요냥~'],
    removed: ['{text}, 지웠어요. 바로 되돌릴 수 있어요냥~'],
    undo: ['{text}, 제자리에 다시 적어 뒀어요냥~'],
    badTime: ['시간은 10am, 7:30pm처럼 적어 주세요냥~'],
    badText: ['내용을 한 번 봐 주세요. 비었거나 못 쓰는 글자가 있어요냥~'],
    badDate: ['날짜를 다시 골라 주세요냥~'],
    conflict: ['그사이 기록이 바뀌어 다시 읽었어요. 한 번 더 부탁해요냥~'],
    fail: ['이번 건 적지 못했어요. 죄송해요냥~'],
    plain: {
      add: '+ 약속 적기', date: '날짜', time: '시간', text: '내용', timeHolder: '예: 7pm', textHolder: '예: 친구랑 저녁',
      note: '시간은 10am, 7:30pm처럼 (비워 두면 시간 없이)', badge: '약속 적기 가능 · 약속 표에 적혀요',
      removedNote: '{text} 지웠어요', updatedNote: '{text} 고쳤어요',
    },
  }, P.ui.meeting);
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
})(typeof window !== 'undefined' ? window : globalThis);
