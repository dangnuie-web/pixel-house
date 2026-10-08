// 공용판 첫 실행 온보딩 대사. 출처: 기획/20261008_pixel-house_두부대사_기록기능_v01.md 3-2 (부기(시나리오) 2026-10-08)
// 원고 그대로 옮기고, 사용자 이름 자리만 {name} -> {user}로 바꿨다 (원고 3-1 주의: {name}은 습관·공부 이름 자리). 화면 = js/onboard.js
// 줄 앞 "(괄호)" = 연출, 말풍선에 띄우지 않음 (PHWorld.parseLine). 배열 = 무작위 하나. hello 두 줄은 차례로
(function (root) {
  'use strict';
  const PH_ONBOARD_LINES = {
    hello: [
      '(현관 마루 끝에 앞발을 모으고 앉아 있다) 처음 뵙겠어요. 이 집 집사 {cat|이에요}냥~', // {cat} = 고양이 이름 (여기선 아직 기본 두부)
      '들어오시기 전에 몇 가지만 여쭤볼게요냥~',
    ], // 두 줄을 차례로 (무작위 아님)
    name: {
      ask: ['뭐라고 불러 드릴까요냥~?'],
      ok: ['{user}님, 반가워요. 잘 기억해 둘게요냥~', '{user}님이군요. 이름이 예뻐요냥~', '{user}님, 이제 이 집 주인이에요냥~'],
      empty: ['한 글자만이라도 알려 주세요냥~'],
      tooLong: ['조금만 짧게 불러 드려도 될까요냥~?'],
      bad: ['못 쓰는 글자가 있어요. 글자만으로 적어 주세요냥~'],
    },
    // 고양이 이름 짓기 (2026-10-08 제작자 3-1단계: 공용판은 사용자가 직접). 부기 문구_공용판2 v01 1-1. {cat} = 지금 고른 이름
    cat: {
      ask: ['이번엔 제 차례예요. 저는 뭐라고 불러 주실래요냥~?', '제 이름도 지어 주세요. 지금은 {cat|이에요}. 그대로 둬도 좋아요냥~'],
      ok: ['{cat}, 좋아요. 오늘부터 저는 {cat|이에요}냥~', '제 이름이 생겼어요. {cat}, 마음에 쏙 들어요냥~', '(귀를 쫑긋) {cat}. 부르시면 바로 갈게요냥~'],
      keep: ['{cat} 그대로 갈게요. 저도 이 이름이 좋아요냥~', '그럼 저는 계속 {cat|이에요}. 익숙해서 좋아요냥~'],
      tooLong: ['조금만 짧게 지어 주실래요냥~?'],
      bad: ['못 쓰는 글자가 있어요. 글자만으로 적어 주세요냥~'],
    },
    avatar: {
      ask: ['{user}님 모습을 골라 주세요. 집 안에선 이 모습으로 다녀요냥~'],
      pick: ['잘 어울려요냥~', '이 모습이면 현관에서 바로 알아볼게요냥~', '오, 이 모습 좋아요냥~'],
    },
    house: { // 2026-10-08 집이 셋(원룸·투룸·쓰리룸)이 되어 ask "지금은 원룸 하나예요"를 바꾸고, 원룸 줄은 원룸을 골랐을 때만 (비트 임시, 부기 확인)
      ask: ['살 집을 골라 주세요. 들어가서 가구도 바꿀 수 있어요냥~'],
      pick: ['이 집으로 할게요. 가구는 제가 먼저 둘러볼게요냥~'],
      pick_room1: ['원룸이에요. 작아도 둘이 지내기엔 넉넉해요냥~'],
      pick_room2: ['투룸이에요. 문 하나 너머에 침실이 있어요냥~'],
      pick_room3: ['쓰리룸이에요. 방마다 둘러볼 데가 많아요냥~'],
    },
    folder: {
      ask: ['기록을 둘 폴더를 골라 주세요. 기록은 이 컴퓨터에만 남아요냥~'],
      ok: ['이 폴더에 기록을 모아 둘게요냥~', '자리 정했어요. 오늘부터 여기에 적을게요냥~'],
      found: ['여기 전에 쓰던 기록이 있어요. 이어서 쓸게요냥~'], // 고른 폴더에 기록 파일이 이미 있을 때
      fail: ['이 폴더엔 적을 수가 없어요. 다른 폴더를 골라 주세요냥~'],
    },
    habit: {
      ask: ['챙기고 싶은 습관을 골라 주세요. 안 골라도 괜찮아요냥~'],
      ok: ['골라 주신 것만 같이 챙길게요냥~', '좋아요. 더하고 빼는 건 나중에도 돼요냥~'],
      none: ['네, 그냥 편히 지내도 돼요냥~'],
      // 직접 더하기 (부기 기획/20261008_pixel-house_두부대사_공용판_v01.md 1-1, 2026-10-08)
      added: ['하나 더 넣었어요. 같이 챙길게요냥~', '새 습관, 목록 끝에 붙여 뒀어요냥~'],
      dup: ['벌써 목록에 있어요. 위에서 눌러 고르면 돼요냥~'],
      bad: ['이름에 못 쓰는 글자가 있어요. 기호나 숫자를 빼고 적어 주세요냥~'], // habit_edit badName과 같은 글
    },
    done: [
      '(꼬리를 천천히 흔든다) 다 됐어요. 이제 들어오세요냥~',
    ],
  };
  const PH_ONBOARD_PLAIN = {
    steps: ['이름', '고양이', '모습', '집', '기록 폴더', '습관'],
    next: '다음', back: '이전', skip: '건너뛰기', start: '들어가기',
    nameLabel: '부를 이름', nameHolder: '예: 민지', nameNote: '"님"은 집사가 알아서 붙여요',
    avatarTitle: '모습 고르기',
    catLabel: '고양이 이름', catHolder: '두부', catNote: '비워 두면 두부예요. 말풍선과 대화창 이름표에 쓰여요', // 부기 1-1 (설정 화면이 생기면 catNoteSettings)
    houseTitle: '집 고르기', oneRoom: '원룸', oneRoomNote: ['방 1칸 · 욕실 · 현관', '가구 자리 14곳', '들어가서 가구를 바꿀 수 있어요'], // 무늬 목업 예시 3줄 (부기 확인)
    stepsLabel: '처음 설정 {n}/{all}단계', fileNew: '만들 파일', fileFound: '이어 쓸 파일', // 무늬 공용판후속 v01 3-1 #2·#7 (비트 임시 글, 부기 확인)
    folderTitle: '기록 폴더', folderBtn: '폴더 고르기', folderNote: '고른 폴더에 생활 기록 파일이 하나 생겨요. 인터넷으로 보내지 않아요', // 파일 이름은 위 "만들 파일" 줄 (무늬 3-1 #7)
    habitTitle: '습관 고르기', habitNote: '생활 습관 탭에서 언제든 더하고 뺄 수 있어요',
    // (비트 임시, 부기 확인) 원고에 없는 칸 글: 직접 더하기 칸, 아바타 이름(무늬 임시 이름 보리·도토리·모래)
    habitAddHolder: '다른 습관 적기 (예: 일찍 자기)', habitAdd: '+ 추가', // 부기 2026-10-08 공용판 1-1
    avatarNames: { avatar1: '보리', avatar2: '도토리', avatar3: '모래' },
  };
  // 온보딩 직후 첫 입장: lines.js intro 3번 자리 (원고 3-2 intro.afterOnboard)
  const PH_INTRO_AFTER_ONBOARD = '이제 진짜 우리 집이에요. 어서 오세요, {user}님냥~';
  root.PH_ONBOARD_LINES = PH_ONBOARD_LINES;
  root.PH_ONBOARD_PLAIN = PH_ONBOARD_PLAIN;
  root.PH_INTRO_AFTER_ONBOARD = PH_INTRO_AFTER_ONBOARD;
  if (typeof module !== 'undefined' && module.exports) module.exports = { lines: PH_ONBOARD_LINES, plain: PH_ONBOARD_PLAIN, afterOnboard: PH_INTRO_AFTER_ONBOARD };
})(typeof window !== 'undefined' ? window : globalThis);
