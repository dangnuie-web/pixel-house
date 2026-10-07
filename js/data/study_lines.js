// 공부 간트 두부 대사 (사이드바 말풍선 한 줄). {name} = 공부 이름 (조사 없이 이어지게 쓴 원고라 그대로 끼움)
// 출처: (제작 문서) "9. 공부 (study.*)" (부기, 2026-10-03, 제작자 확인 전)
//   logged / added = 원고 그대로.
//   finished: 원고는 "(끝냄 → 보관)" 한 키. 앱은 끝냄(끝 날짜 = 오늘, 막대는 남음)과 지우기(보관함으로)가 따로라서 (토리 지시서)
//     보관 문장("보관함에 고이 넣어 둘게요")은 archived에, 둘 다 맞는 둘째 줄은 finished(끝냄)에 씀. 부기·토리 확인 필요
//   restored / conflict / fail / hint = 원고에 없어서 비트 임시 (부기가 다듬을 자리)
(function (root) {
  'use strict';
  const PH_STUDY_LINES = {
    // 2026-10-08 부기 기록기능 v01 2-6 반영: 공부했어요·끝냈어요 버튼이 없어져 logged·finished는 지움. {part} = 단원 이름
    added: ['{name}, 간트에 막대 하나 놓아 뒀어요냥~', '새 공부가 생겼어요. 자리 만들어 뒀어요냥~', '{name} 자리 마련했어요. 시작일·끝일도 정할 수 있어요냥~'],
    period: ['{name}, 기간 정해 뒀어요냥~', '{name} 시작일과 끝일, 달력에 표시해 뒀어요냥~', '기간 고쳐 뒀어요. 막대 길이도 따라갔어요냥~'],
    periodBad: ['끝일이 시작일보다 앞이에요. 다시 골라 주세요냥~'],
    partAdded: ['{name} 안에 {part}, 칸 하나 만들었어요냥~', '{part}, 따로 줄을 내 뒀어요냥~', '잘게 나눠 뒀어요. {part}부터 보여요냥~'],
    partRenamed: ['{part}, 새 이름 달았어요냥~'],
    partRemoved: ['{part}, 뺐어요. 바로 되돌릴 수 있어요냥~', '{part} 줄은 접어 뒀어요냥~'],
    partUndo: ['{part}, 제자리에 다시 놓아 뒀어요냥~'],
    barAdded: ['{name}, 오늘 칸 칠해 뒀어요냥~', '막대가 한 칸 늘었어요냥~', '칠해 뒀어요. 끊겨도 막대는 막대예요냥~', '{name} 칸에 색이 들었어요냥~'],
    barRemoved: ['칠한 칸 지웠어요. 다시 칠하면 돼요냥~', '그 칸은 비워 뒀어요냥~', '지웠어요. 필요하면 다시 칠해 주세요냥~'],
    grass: ['{name}, 칠한 칸들 모아 보여 드릴게요냥~', '{name} 잔디밭이에요. 천천히 보세요냥~', '칠한 날마다 칸이 물들어 있어요냥~'],
    grassEmpty: '아직 칠한 칸이 없어요. 막대를 칠하면 여기 물들어요냥~',
    archived: ['{name} 막대는 보관함에 고이 넣어 둘게요냥~', '{name}, 보관함에 넣어 뒀어요. 칠한 칸도 같이요냥~'],
    restored: ['{name}, 보관함에서 다시 꺼내 놓았어요냥~', '{name}, 간트로 돌아왔어요냥~'],
    conflict: ['그사이 기록이 바뀌어 다시 읽었어요. 한 번 더 부탁해요냥~'],
    fail: ['이번 건 적지 못했어요. 죄송해요냥~'],
  };
  root.PH_STUDY_LINES = PH_STUDY_LINES;
  // 화면 글 (냥~ 없음, 부기 원고 2-6)
  root.PH_STUDY_PLAIN = { view: { week: '주', month: '월' }, addSubject: '+ 과목', addPart: '+ 쪼개기', partHolder: '예: 1단원, 1단원 복습',
    start: '시작일', end: '끝일', hint: '칸을 눌러 칠하면 그날 공부한 거예요. 다시 누르면 지워져요', now: { week: '이번 주', month: '이번 달' } };
  if (typeof module !== 'undefined' && module.exports) module.exports = PH_STUDY_LINES;
})(typeof window !== 'undefined' ? window : globalThis);
