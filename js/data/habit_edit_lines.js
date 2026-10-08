// 습관 편집·매일 n회 칸·공부 완전 삭제 두부 대사 (사이드바 말풍선 한 줄). 2026-10-04 비트 임시 -> 부기 다듬음 (기획/20261004_pixel-house_오늘대사_v01.md)
//   {name} = 습관·공부 이름, {old} = 바꾸기 전 이름, {cycle} = 주기 글 ("주 2회"), {k} {n} = 칸 수
//   규칙 (하우스 CLAUDE.md): 존댓말 + 냥~, 잔소리·탓하는 말 없음, 버튼 글에는 냥~ 없음
(function (root) {
  'use strict';
  const L = {
    edit: {
      open: ['편집 칸 열었어요. 더하고 빼는 건 마음대로예요냥~'],
      added: ['{name}, 새 칸 만들어 뒀어요냥~', '{name} 자리 하나 생겼어요냥~'],
      updated: ['{name}, 고쳐 적어 뒀어요냥~'],
      same: ['바뀐 게 없어서 그대로 뒀어요냥~'], // 고치기를 눌렀는데 바뀐 게 없을 때 (부기 대사표 2026-10-04 확인 1)
      renamed: ['{old} 기록도 {name|으로} 바꿔 뒀어요냥~', '{name|으로} 바꿨어요. 지난 기록도 같이요냥~'],
      removed: ['{name}, 목록에서 뺐어요. 지난 기록은 남아 있어요냥~'],
      undo: ['{name}, 제자리에 다시 놓아 뒀어요냥~'],
      renameUndo: ['{name|으로} 다시 돌려 뒀어요. 지난 기록도요냥~'],
      fixUndo: ['{name}, 고치기 전으로 돌려 뒀어요냥~'],
      moved: ['순서 바꿔 뒀어요냥~'],
      edge: ['더 갈 자리가 없어요. 그대로 둘게요냥~'],
      badName: ['이름에 못 쓰는 글자가 있어요. 기호나 숫자를 빼고 적어 주세요냥~'],
      badTarget: ['기준은 30자 안으로, 기호 없이 적어 주세요냥~'],
      badUnit: ['단위는 "쪽", "장"처럼 짧게 적어 주세요냥~'],
      badCycle: ['주기를 다시 골라 주세요냥~'],
      dupName: ['습관·공부에 같은 이름이 있어요. 다른 이름으로 지어 주세요냥~'],
      usedName: ['지난 기록에 같은 이름이 남아 있어요. 섞이지 않게 다른 이름으로 지어 주세요냥~'],
      locked: ['가구와 이어진 습관이라 여기선 막아 뒀어요냥~'], // 물·대변·식사·독서 모두 (고치기·지우기)
      lastChore: ['살림은 하나는 남겨 둘게요. 다 비우면 기본 목록이 다시 나와요냥~'],
      conflict: ['그사이 기록이 바뀌어 다시 읽었어요. 한 번 더 부탁해요냥~'],
      fail: ['이번 건 적지 못했어요. 죄송해요냥~'],
    },
    daily: {
      up: ['{name} {k}/{n}, 한 칸 채웠어요냥~'],
      full: ['{name}, 오늘 칸이 다 찼어요냥~'],
      down: ['{name}, 한 칸 비워 뒀어요냥~'],
    },
    month: {
      full: ['이번 달 {name} 칸, 다 채우셨어요냥~'],
    },
    study: {
      askRemove: ['보관함에 넣을까요, 완전히 지울까요냥~?'],
      removed: ['{name}, 완전히 지웠어요. 바로 되돌릴 수 있어요냥~'],
      unremoved: ['{name}, 간트에 다시 놓아 뒀어요냥~'],
      renamed: ['{name}, 새 이름 달았어요. 지난 기록도 같이요냥~'], // 공부 줄은 {name}만 됨 (조사 자리 표시 없음)
      renameUndo: ['{name}, 원래 이름으로 돌려 뒀어요. 지난 기록도요냥~'],
      usedName: ['지난 기록에 같은 이름이 남아 있어요. 섞이지 않게 다른 이름으로 지어 주세요냥~'],
    },
  };
  // 화면 글 (버튼·안내, 냥~ 없음)
  const P = {
    edit: '편집', editDone: '편집 끝', add: '+ 추가', save: '저장', cancel: '그만두기', fix: '고치기', del: '지우기', up: '위로', down: '아래로', undo: '되돌리기',
    name: '이름', target: '기준', unit: '단위', cycle: '주기',
    // 기록 카드 + 추가: 기록 방식 고르기 (2026-10-08 제작자 3-1단계, 비트 임시 글). record = ## 기록 항목 (영화·연극처럼 제목·날짜·요약 폼)
    type: '기록 방식', types: { amount: '횟수로 세기', record: '한 줄씩 적기' }, recordType: '한 줄씩 기록', rkFixed: '기본', rkHolder: '예: 전시, 여행', // 부기 문구_공용판2 v01 1-3
    typeNote: { amount: '주 3회처럼 몇 번 했는지 칸을 채워요 (예: 요가, 산책)', record: '할 때마다 제목·날짜·요약을 한 줄씩 남겨요 (예: 전시, 여행)' },
    // 2026-10-08 피드백 4 (비트 임시 글): 제목·날짜·요약 기록 + 추가 때 가구 연동 고르기. rkFixed('기본' 잠금)는 이제 안 씀
    furn: '가구 연동', furnNone: '연동 안 함', furnNote: '고른 가구를 누르면 이 기록이 열려요',
    rkBad: '이름은 글자로만 12자까지 적을 수 있어요 (기호나 숫자 빼고).', rkDup: '같은 이름의 기록 칸이 있어요.', rkRemovedNote: '{name} 칸 뺐어요 (적은 기록은 남아요)',
    per: { day: '매일', week: '주', month: '월' }, times: '회',
    lockWater: '순서만 바꿀 수 있어요', lockWhy: '물은 정수기·물컵과 이어져 있어서 이름·기준·주기·지우기는 막아 두었어요',
    renameNote: '이름을 바꾸면 지난 기록의 이름도 같이 바뀌어요 (바꾼 뒤 바로 되돌릴 수 있어요)',
    removedNote: '{name} 뺐어요', updatedNote: '{name} 고쳤어요', renamedNote: '{old} → {name} 이름 바꿨어요 (지난 기록도)',
    studyRemove: '지우기', studyArchive: '보관함으로', studyDelete: '완전히 삭제', studyRemovedNote: '{name} 완전히 지웠어요', studyRenamedNote: '{old} → {name} 이름 바꿨어요 (지난 기록도)',
  };
  // 지난 기록에만 남은 이름 막기 안내 (제작자 결정 2026-10-04, 비트 임시 글). 바꾸기·새로 추가, 습관·공부 모두
  //   name = 막은 이름, date = 마지막 기록 날(YYYY-MM-DD, 없으면 null), kind = 'habit' | 'study'
  //   -> { note: 입력창 아래 안내 글, say: 두부 한마디 }. 조사는 이름 끝 글자 받침으로 ('러닝'은 / '요가'는)
  function usedText(name, date, kind) {
    const c = String(name).slice(-1).charCodeAt(0), jong = c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 > 0;
    const q = "'" + name + "'" + (jong ? '은' : '는'), what = kind === 'study' ? '이름' : '습관';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || ''), day = m ? `${Number(m[1])}년 ${Number(m[2])}월 ${Number(m[3])}일` : '';
    // note = 한 줄 글 (공부 칸 오류), noteMain + noteSub = 습관 편집 칸 2줄 (무늬 v01: 무엇이 문제 / 날짜·이유). 글은 같음 (noteMain + noteSub = note)
    const main = `${q} 예전에 쓰던 ${what}이에요.`, sub = ` 지난 기록이 남아 있어서 같은 이름은 쓸 수 없어요` + (day ? ` (마지막 기록 ${day})` : '');
    return {
      note: main + sub, noteMain: main, noteSub: sub,
      say: (day ? `${q} ${day}까지 쓰던 ${what}이에요. ` : `${q} 예전에 쓰던 ${what}이에요. `) + '다른 이름으로 지어 주세요냥~',
    };
  }
  const PF = (root.PHProfile || (typeof module !== 'undefined' && typeof require === 'function' ? require('../profile.js') : null)); // 설정 묶음 (js/profile.js)
  if (PF) PF.patch('PH_HABIT_EDIT_LINES', L);
  root.PH_HABIT_EDIT_LINES = L;
  root.PH_HABIT_EDIT_PLAIN = P;
  root.PH_HABIT_EDIT_USED = usedText;
  if (typeof module !== 'undefined' && module.exports) module.exports = { lines: L, plain: P };
})(typeof window !== 'undefined' ? window : globalThis);
