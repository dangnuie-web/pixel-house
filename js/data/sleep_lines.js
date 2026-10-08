// 잠 탭·잠 기록하기(칠하기) 창·침대·생활습관 기록 카드 잠 줄 문구 (2026-10-09). 원고 = 부기 기획/20261009_pixel-house_문구_잠기록_v01.md
//   P.ui.sleep = 펫 말 (냥~, 강아지면 멍~ 자동) / P.uiPlain.sleep = 화면 글 (냥~ 없음). 문구를 바꿀 땐 이 파일만
//   쓰는 곳: js/sleep_view.js (잠 탭·기록 카드), js/sleep_modal.js (칠하기 창), js/interact.js bedClose (침대 아침·낮)
//   배열 = 무작위 하나 (바로 앞 줄은 다시 안 고름). 채우는 자리: {pet} 펫 이름({pet|이} = 조사), {user}, {y} {m} {d} 깬 날, {wd} 요일, {pm} {pd} 전날,
//   {start} 가로 시작 시각(18), {n} 숫자, {dur} "7시간 30분", {a} {b} "23:30", {bed} 잔 시각, {date} "10/7"
//   하우스 규칙: 잔 시간이 길다·짧다·늦다 말하지 않음. 사용자 상태를 아는 척하지 않음. 펫 말에 "파일·표" 안 씀
(function (root) {
  'use strict';
  const P = root.PH_LINES = root.PH_LINES || {};
  P.ui = P.ui || {}; P.uiPlain = P.uiPlain || {};
  const pet = {
    // 1-3 빈 달 (펫 한마디 칸)
    empty: {
      now: ['이번 달 종이는 아직 비어 있어요. [기록하기]로 잔 만큼 그어 보세요냥~', '아직 그은 줄이 없어요. 생각날 때 한 줄이면 돼요냥~'],
      past: ['이 달엔 그어 둔 잠이 없어요냥~', '이 달 종이는 깨끗해요냥~'],
    },
    // 2-4 창 안 첫 줄
    say: {
      new: ['잔 만큼 끌어서 죽 그어 주세요냥~', '잠든 칸에서 깬 칸까지 쭉 그으면 돼요냥~'],
      edit: ['고칠 데만 다시 그으면 돼요냥~', '그어 둔 줄 위로 한 번 더 그으면 걷혀요냥~'],
      open: ['잔 시각은 받아 적어 뒀어요. 깬 데까지 이어 그어 주세요냥~'],
      bedMorning: ['(이불 위에서 기지개를 켠다) 어젯밤 잔 만큼 죽 그어 볼까요냥~?', '(이불을 앞발로 꾹꾹) 어젯밤 잠, 여기 그어 두면 돼요냥~'],
      bedDay: ['낮잠도 같은 줄에 그으면 돼요냥~', '(베개 옆에 동그랗게 눕는다) 누웠던 만큼만 그어 주세요냥~'],
      bedHas: ['오늘 줄에 그어 둔 게 있어요. 더할 데만 그으면 돼요냥~'],
      pen: { doze: ['선잠은 연하게 칠해져요냥~'], eraser: ['지울 데를 죽 그어 주세요냥~'], sleep: ['잔 데는 진하게예요냥~'] },
    },
    // 2-5 저장 뒤 (바뀐 게 없으면 말 없이 닫음)
    saved: ['잘 그어 뒀어요냥~', '{m}월 {d}일 줄에 그어 뒀어요냥~', '종이에 옮겨 뒀어요. 고마워요냥~'],
    edited: ['고친 대로 다시 그어 뒀어요냥~', '{m}월 {d}일 줄, 새로 맞춰 뒀어요냥~'],
    openDone: ['받아 적은 잔 시각은 칠한 잠으로 바꿔 뒀어요냥~'],
    cleared: ['그날 줄을 비워 뒀어요냥~'],
    bedSaved: ['그어 뒀어요. 이불은 제가 펴 둘게요냥~', '오늘 줄에 옮겨 뒀어요냥~'],
    // 2-6 오류 (펫 말)
    conflict: ['그사이 잠 기록이 바뀌어 다시 읽었어요. 한 번 더 그어 주세요냥~'],
    fail: ['이번 건 적지 못했어요. 죄송해요냥~'],
    browserOnly: ['잠 칠하기는 앱에서만 돼요냥~'],
    // 3 침대: 쓰기가 안 되는 화면에서 아침·낮에 눌렀을 때 = PH_INTERACT_LINES.close.day (js/data/interact_lines.js, 부기 bedNoWrite 두 줄 그대로. 한 곳에만 둠)
  };
  const plain = {
    // 1-1 머리
    head: { tab: '잠', sub: '줄을 누르면 그날 잠이 아래에 보여요', badge: '잠 적기 가능' },
    // 1-2 한 달 요약 ({n}·{dur}는 코드가 굵게)
    bar: { count: '{y}년 {m}월 잠 기록 {n}일', avg: ' · 적은 날 평균 {dur}', add: '기록하기' },
    // 1-4 모눈
    grid: { title: '{y}년 {m}월', prevAria: '지난달', this: '이번 달', nextAria: '다음 달', navAria: '달 넘기기', ariaLabel: '{m}월 잠 모눈',
      dayPrev: '전날', dayThis: '그날', hourMid: '0시', now: '지금', totHead: '잔 시간', totNone: '·', totOpen: '?' },
    // 1-5 줄 읽어 주기 (aria-label = label + 해당하는 것)
    row: { label: '{m}월 {d}일 ({wd})', today: ', 오늘', tot: ', 잔 시간 {dur}', open: ', 잔 시각만 적힘', openWake: ', 깬 시각만 적힘', none: ', 기록 없음', future: ', 아직 안 온 날' },
    // 1-6 "?" 설명 (title)
    open: { tip: '{bed}에 잠든 것까지 적혀 있어요. 깬 시각은 몰라요', tipWake: '{b}에 깬 것만 적혀 있어요. 잔 시각은 몰라요', totTip: '잔 시각만 있어서 합을 못 냈어요' },
    // 1-7 범례 (open = 그 달에 잔 시각만 줄이 있을 때만)
    legend: { sleep: '잠', doze: '선잠', open: '잔 시각만', note: '한 줄 = 전날 {start}시 ~ 그날 {start}시 · 칸 = 1시간' },
    // 1-8 고른 날 자세히
    day: { title: '{m}월 {d}일 ({wd})', today: '오늘', span: '{pm}/{pd} 저녁 {start}시 ~ {m}/{d} 저녁 {start}시', fix: '고치기', add: '기록하기', none: '이날은 잠 기록이 없어요.',
      kind: { night: '밤잠', nap: '낮잠', doze: '선잠', open: '잔 시각만', openWake: '깬 시각만' },
      time: '{a} ~ {b}', timeOpen: '{a} ~ ?', timeOpenWake: '? ~ {b}', durOpen: '깬 시각 모름', durOpenWake: '잔 시각 모름',
      fromDialog: '{pet|이} 대화로 받아 적은 기록이에요. [고치기]에서 낮잠·선잠도 칠할 수 있어요.' },
    // 2-1 창 글
    lm: { titleNew: '잠 기록하기', titleEdit: '잠 고치기', keys: 'Esc 닫기 · ⌘Enter 저장', date: '날짜', datePrev: '전날', dateNext: '다음 날', dateText: '{m}월 {d}일 ({wd})',
      dateHint: '{pm}/{pd} 저녁 {start}시부터 {m}/{d} 저녁 {start}시까지', pen: '펜', pens: { sleep: '잠', doze: '선잠', eraser: '지우개' }, pensAria: '펜 고르기',
      stripPrev: '← 전날 저녁', stripThis: '0시부터 그날',
      stripAria: '잔 구간 칠하기. 왼쪽 오른쪽 화살표로 칸 이동, 스페이스로 칠하기, 시프트와 화살표로 이어 칠하기, 1 2 3으로 펜 바꾸기',
      segs: '칠한 구간', segsNone: '아직 칠한 데가 없어요', segDel: '지우기', segStart: '시작 시각', segEnd: '끝 시각', memo: '메모', memoHolder: '한 줄, 없어도 돼요',
      cancel: '그만두기', save: '저장', saveEdit: '고치기',
      // 2-3 잔 시각만 줄
      open: { chip: '잔 시각만', chipWake: '깬 시각만', time: '{a} ~ ?', timeWake: '? ~ {b}', keep: '{pet|이} 받아 적은 시각이에요. 이어서 칠하면 바뀌어요', covered: '칠한 잠으로 바뀌어요. 저장하면 이 줄은 지워져요', del: '지우기' } },
    // 2-2 끌 때 말풍선
    tip: { paint: '{a} ~ {b}', erase: '{a} ~ {b} 지우기', future: '아직 안 온 시간' },
    // 2-6 화면 오류 글 (그만둘까요? 확인 창은 대변·식사 창에 없어 넣지 않음)
    err: { memoLong: '메모는 100자까지 적을 수 있어요.', bad: '이 칠하기는 적을 수 없어요. 한 번 더 그어 주세요.', timeOrder: '깬 시각이 잔 시각보다 뒤여야 해요.',
      timeOut: '이 줄은 {pm}/{pd} 저녁 {start}시부터 {m}/{d} 저녁 {start}시 안에서만 고칠 수 있어요.', future: '아직 안 온 시간은 칠할 수 없어요.' },
    // 4 생활 습관 "기록" 카드 잠 줄
    card: { name: '잠', target: '잔 만큼 칠하기', today: '오늘 {dur}', todayOpen: '오늘 {bed}~?', todayNone: '오늘 줄 비어 있음', last: '최근 {date}', lastNone: '아직 기록 없음', open: '기록하기' },
  };
  P.ui.sleep = Object.assign(pet, P.ui.sleep);
  P.uiPlain.sleep = Object.assign(plain, P.uiPlain.sleep);
  // {pet}·{user} 채우기: lines.js의 PH_LINES는 profile.js patch가 채우지만 이 파일은 그 뒤에 붙으므로 여기서 한 번 (logs_lines.js와 달리 {pet}이 있음)
  const PF = root.PHProfile;
  if (PF && PF.fillUser) { PF.fillUser(P.ui.sleep, PF.userName(), PF.catName()); PF.fillUser(P.uiPlain.sleep, PF.userName(), PF.catName()); }
  // 6 강아지 펫: 고양이 몸짓 두 줄만 덮음 (나머지는 냥~ -> 멍~ 자동). 배열은 통째로 바뀌므로 길이 그대로
  const PL = root.PH_PET_LINES;
  if (PL && PL.dog) {
    const D = PL.dog.PH_LINES = PL.dog.PH_LINES || {}; D.ui = D.ui || {};
    D.ui.sleep = Object.assign({}, D.ui.sleep, { say: {
      bedMorning: ['(이불 위에서 기지개를 켠다) 어젯밤 잔 만큼 죽 그어 볼까요멍~?', '(이불 위에서 꼬리를 탁탁) 어젯밤 잠, 여기 그어 두면 돼요멍~'],
      bedDay: ['낮잠도 같은 줄에 그으면 돼요멍~', '(베개 옆에 턱을 괴고 엎드린다) 누웠던 만큼만 그어 주세요멍~'],
    } });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
})(typeof window !== 'undefined' ? window : globalThis);
