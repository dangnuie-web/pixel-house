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
    // 3-1단계 (2026-10-08) 비트 임시 (부기가 다듬을 자리). {plan} = 세부 계획 이름표 (PH_STUDY_PLAIN.plan), {name} = 공부 이름
    saved: ['{name}, 고친 대로 적어 뒀어요냥~', '{name} 막대, 새 기간에 맞춰 놓았어요냥~', '고쳐 뒀어요. 간트도 같이 바뀌었어요냥~'], // 부기 문구_공용판2 v01 1-2
    planOut: ['{plan|은} 전체 기간 안에서만 그릴 수 있어요. 날짜를 안쪽으로 옮겨 주세요냥~', '그 날짜는 전체 기간 밖이에요. 안쪽으로 당겨 주세요냥~'],
    needEnd: ['끝일도 골라 주세요. 끝이 있어야 막대를 그릴 수 있어요냥~', '언제까지 할지만 정해 주세요. 나중에 언제든 바꿀 수 있어요냥~'],
    conflict: ['그사이 기록이 바뀌어 다시 읽었어요. 한 번 더 부탁해요냥~'],
    fail: ['이번 건 적지 못했어요. 죄송해요냥~'],
  };
  root.PH_STUDY_LINES = PH_STUDY_LINES;
  // 화면 글 (냥~ 없음, 부기 원고 2-6)
  // 3-1단계 (2026-10-08 제작자): 칠하기·쪼개기 없앰 -> [추가 | 수정] 창. plan = 하위 항목 이름표 (토리 제안 "세부 계획", 제작자 확인 대기 — 여기 한 곳만 바꾸면 화면·두부 말 모두 바뀜)
  root.PH_STUDY_PLAIN = { view: { week: '주', month: '월' }, now: { week: '이번 주', month: '이번 달' },
    plan: '세부 계획', add: '추가', edit: '수정', addTitle: '공부 추가', editTitle: '공부 수정', pick: '고칠 공부',
    name: '공부 이름', nameHolder: '예: 영어 회화, 자격증 준비', period: '전체 기간', start: '시작일', end: '끝일', memo: '메모', memoHolder: '비워 둬도 돼요',
    planNote: '{plan|은} 전체 기간 안에서만 정할 수 있어요', planHolder: '예: 1단원, 복습 주간', planAdd: '+ {plan} 추가', planEmpty: '아직 {plan|이} 없어요. 없으면 전체 기간이 막대 하나로 보여요',
    gapsNote: '예전에 칸을 칠해 둔 공부예요. 기간을 저장하면 막대 하나로 이어져요', del: '지우기', cancel: '그만두기', save: '저장',
    selHelp: '막대나 이름을 누르면 골라져요. 끌면 옮겨지고, 양끝을 끌면 기간이 바뀌어요. 나머지는 [수정]에서 고쳐요.',
    noEnd: '끝일 없음', noEndLong: '끝일 없음 ([수정]에서 정해 주세요)', noPlans: '없음 (전체 기간이 한 막대)',
    // 잔디 (생활일지 > 공부): 달마다
    grassEmptyMonth: '이 달엔 공부 계획이 없어요', grassLegend: '계획', grassMonth: '{m}월 {n}일', monthPick: '연월 고르기',
    err: {
      badName: '공부 이름을 적어 주세요 (| , / 같은 기호 없이, 숫자로 시작하지 않게, 30자까지).', dupName: '같은 이름의 공부나 습관이 있어요.',
      badStart: '시작일을 골라 주세요.', badEnd: '끝일도 골라 주세요. 전체 기간이 있어야 해요.', badOrder: '끝일이 시작일보다 앞이에요.',
      badPart: '{plan} 이름을 적어 주세요 (| , 없이 20자까지).', planDate: '{plan} 날짜를 다시 골라 주세요 ({names}: 끝이 시작보다 앞이에요).',
      planOut: '{plan|은} 전체 기간({start} ~ {end}) 안에서만 정할 수 있어요: {names}', dupPart: '같은 이름의 {plan|이} 있어요: {names}',
      planOutMove: '{plan} {names|이} 기간 밖으로 나가서 옮기지 않았어요. [수정]에서 {plan}부터 고쳐 주세요.', fail: '저장하지 못했어요.',
    } };
  if (typeof module !== 'undefined' && module.exports) module.exports = PH_STUDY_LINES;
})(typeof window !== 'undefined' ? window : globalThis);
