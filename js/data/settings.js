// 바꾸기 쉬운 기준값을 한곳에 모은다. (토리 지시 2026-10-02: 시간대·"오랜만" 기준은 상수로)
// 대사 출처: (제작 문서) (부기 제안, 제작자 확인 필요)
(function (root) {
  'use strict';
  const PH_SETTINGS = {
    // 시간대 인사. from 이상 ~ to 미만(시). from > to 이면 자정을 넘는 구간(밤 21~1시)
    TIME_BANDS: [
      { id: 'morning', name: '아침', from: 6, to: 11 },
      { id: 'day', name: '낮', from: 11, to: 17 },
      { id: 'evening', name: '저녁', from: 17, to: 21 },
      { id: 'night', name: '밤', from: 21, to: 1 },
      { id: 'dawn', name: '새벽', from: 1, to: 6 },
    ],
    // 낮·밤 (제작자 확정 2026-10-02: 18~06시는 밤, 자동). 밤 = NIGHT_FROM시 ~ NIGHT_TO시 미만, 맥 시계 기준, 즉시 바꿈(페이드 없음)
    //   DAY_NIGHT: 'auto' = 시각대로 / 'day' = 늘 낮 / 'night' = 늘 밤
    DAY_NIGHT: 'auto',
    NIGHT_FROM: 18,
    NIGHT_TO: 6,
    // 입장할 때 천천히 밝아지기 (제작자 결정, 부기 원고 v02 1-5). 방법 = 무늬 가이드 v03 3장: 단계 팔레트(fade 표, 반투명 막 없음)
    //   2026-10-02 제작자: 낮에는 어둠 없이 바로 밝게. 밤에는 어둡지만 집 윤곽이 보이는 밝기(start)에서 인사 ->
    //   스탠드가 켜지며 은은하게 원래 밤 색까지. 뚝뚝 끊기지 않게 steps 단계로 잘게, ms 동안. 두부도 같은 밝기
    //   밝기 t: 0 = 먹색, 1 = 원래 색 (무늬 fade 표의 0~4단계 = t 0, .25, .5, .75, 1과 같은 식)
    INTRO_NIGHT: { start: 0.45, steps: 18, ms: 2400 },
    // 입장 순서: true = 다 밝아진 뒤 두부가 나타나 인사 (무늬 가이드 v03 3장, 토리 전달) / false = 부기 원고 순서(어둠 속 인사 -> 밝아짐)
    INTRO_DUBU_AFTER_FADE: false,
    // 입장 때 제작자 캐릭터가 계단을 올라오는 장면 (다음 판). 그림(player_*)은 다른 무늬가 그리는 중. 지금은 자리만 (game.js CUES.playerClimb)
    // 그림 세트 (제작자 2026-10-03: 판을 앱에 넣어 보고 정함 -> "중간 굵기" v10으로 결정, 화면의 토글 버튼은 없앰)
    //   바꾸기는 앱 메뉴 "보기 > 집 그림"만 (되돌리기용). 고른 값은 저장 (electron/main.js prefs.json). 메뉴 순서 = 아래 적은 순서
    //   기본 = ART_SET_DEFAULT (그 세트가 아직 없으면 있는 것 중 가장 새 판). 세트 = scripts/sync_assets.py SETS
    //   chars = 세트마다 캐릭터 그림 표 { 캐릭터 id: { sprite: 그림 이름 앞부분, scale: 정수 배율 } }
    //     sprite 그림이 아직 없으면 fallback으로 (예: 큰 판 플레이어 playerL이 오기 전에는 player를 2배)
    //     scale = 정수 배 nearest-neighbor, 발바닥 = 칸 바닥(foot = 그림 맨 아래에서 발바닥 줄까지 px), 가로 = 칸 가운데. 걷기 칸은 1칸 그대로
    //     표에 없는 캐릭터는 js/data/actors.js의 sprite, 배율 1
    //   모든 세트 확대 없이 1:1 (제작자 2026-10-03). 두부 클릭 판정·쉬는 자리도 그 세트 두부 그림 크기에서 읽음 (game.js spriteSize)
    //   2026-10-03 제작자: "중간" = v12 (v10 + 주방 정수기, 올리브 화분·빨래 바구니 뺌). v10은 되돌리기용으로 메뉴에 남김 (v11은 바로 v12로 바뀌어 안 묶음)
    //   2026-10-08 설정 묶음(js/profile.js, profiles/*): 아래는 공용 기본값 (원룸 room1). 제작자 판(v12 등 세트·캐릭터)은 profiles/player가 통째로 바꿈
    //   공용판 캐릭터 그림(chars.player.sprite)은 온보딩에서 고른 아바타로 바뀜 (js/profile.js)
    ART_SET_DEFAULT: 'room1',
    ROOM_PASS_QUIET: ['living'], // 다른 방 가는 길에 지나가기만 하면 공간 대사를 안 하는 공간 (부기 새 방 v01 4절: 투룸·쓰리룸 거실)
    ART_SETS: {
      room1: { label: '원룸', chars: { player: { sprite: 'avatar1' }, dubu: { sprite: 'dubuM', fallback: { sprite: 'dubu' } } } }, // 무늬 공용판원룸 v01 (256x240)
      room2: { label: '투룸', chars: { player: { sprite: 'avatar1' }, dubu: { sprite: 'dubuM', fallback: { sprite: 'dubu' } } } }, // 무늬 공용판투룸쓰리룸 v01 (336x256)
      room3: { label: '쓰리룸', chars: { player: { sprite: 'avatar1' }, dubu: { sprite: 'dubuM', fallback: { sprite: 'dubu' } } } }, // 같은 문서 (384x320)
    },
    INTRO_PLAYER: true, // 2026-10-03 토리 전달: 제작자 캐릭터 v02로 입장 장면 넣음
    // 입장 뒤 조작 (제작자 결정 2026-10-03: "입장 후 플레이어가 움직이고, 두부는 그냥 돌아다녀")
    //   방향키·바닥 클릭 = 제작자 캐릭터. 두부 = 스스로 돌아다님 (pixel-office 오리 걷기처럼 천천히, 사람 칸은 피함)
    //   idle/sit/rest = 멈춰 있는 시간 범위(ms), stepMs = 두부 한 칸 걷는 시간, weights = 다음에 할 일 고르는 비율
    WANDER: { on: true, idle: [3000, 8000], sit: [6000, 12000], rest: [15000, 30000], stepMs: 240, weights: { walk: 0.5, sit: 0.25, table: 0.25 } }, // 제작자 결정 2026-10-02: B안 = 부기 원고 순서 (어두운 현관에서 두부가 먼저 인사 -> 집이 밝아짐)
    // 생활 탭 자료 파일 (PixelHouse 폴더 안 상대 경로). 파일이 옮겨지면 이 한 줄만 고친다. 첫 판은 읽기만
    //   2026-10-02 토리가 만든 하우스 전용 기록 파일로 바꿈 (옛 파일 자료/20261002_계획판에서_옮긴_생활자료_v01.md는 그대로 둠)
    //   2026-10-08: 공용 기본 = 기록 폴더 맨 위 파일 하나 (온보딩이 빈 틀로 만듦). 제작자 판 경로는 profiles/player
    LIFE_FILE: 'PixelHouse_생활기록.md',
    BRAND: 'Pixel House', TITLE: 'Pixel House', // 사이드바 맨 위 이름·창 제목 (설정 묶음이 바꿈)
    // 설정 화면 (공용판 피드백 1, 2026-10-08 무늬 설정화면 v01): 사이드바 맨 아래 설정 버튼 + 펫·하우스 이름·내 모습·사이드바 탭. 제작자 판은 false (profiles/player)
    //   TABS_HIDDEN = 숨긴 사이드바 탭 (사용자 값, js/profile.js userSettings). 우리집(home)은 늘 보임
    SETTINGS_SCREEN: true, TABS_HIDDEN: [],
    // 사이드바 탭 이름. archive 탭 = 생활일지 (제작자 2026-10-03: 기록 보관 -> 생활일지. 안쪽 키 archive는 그대로)
    TAB_NAMES: { home: '우리집', habits: '생활 습관', meetings: '약속', bucket: '버킷리스트', archive: '생활일지' },
    // 생활일지 안 탭 (js/journal.js). habit = 습관 기록의 습관 이름(그 습관이 있는 날만 한 줄씩), books = 독서 책꽂이, all = 옛 기록 보관 화면(잠·식사·한마디 포함)
    //   모양: 'folder' 겹친 폴더 | 'pill' 알약 | 'dropdown' 드롭다운 (제작자 결정 2026-10-03: 겹친 폴더)
    JOURNAL_TAB_STYLE: 'folder',
    JOURNAL_TABS: [
      { id: 'water', label: '물', habit: '물' }, { id: 'yoga', label: '요가', habit: '요가' }, { id: 'run', label: '러닝', habit: '러닝' },
      { id: 'reading', label: '독서', books: true },
      { id: 'poop', label: '대변', poop: true }, { id: 'meal', label: '식사', meal: true }, // 2026-10-04 logs: 대변 관찰·식사 일지 달력 (js/logs_view.js)
      { id: 'sleep', label: '잠', sleep: true }, // 2026-10-09: 잠 한 달 모눈 + 칠하기 창 (js/sleep_view.js, 무늬 잠기록 v01)
      { id: 'movie', label: '영화·연극', records: ['영화', '연극'] }, // 2026-10-08: 영화·연극 리스트 (js/record_list.js). 사용자가 만든 기록 항목 탭은 이 뒤에 저절로 붙음
      { id: 'study', label: '공부', grass: true }, // 2026-10-08: 과목 고르기 -> 잔디 (js/study_grass.js)
      { id: 'all', label: '모아 보기', all: true },
    ],
    // 책 표지색 칩 (하우스 팔레트 css/app.css 값). 파일에는 이름만 적음. 이름은 js/book_write.js COLORS에 있는 것만 (거기서 검사)
    BOOK_COLORS: [
      { name: '벽돌', hex: '#A65446' }, { name: '주황', hex: '#E08A3C' }, { name: '겨자', hex: '#C99A4E' }, { name: '잎', hex: '#86B07E' }, { name: '숲', hex: '#5C8458' },
      { name: '민트', hex: '#C4DCD8' }, { name: '남색', hex: '#3E4B69' }, { name: '분홍', hex: '#E9A9A0' }, { name: '나무', hex: '#B07A4F' }, { name: '호두', hex: '#5A3B2A' },
    ],
    // 버킷리스트 자리: 'auto' = 항목이 있으면 탭, 비었으면 생활 습관 맨 아래 칸 / 'tab' = 늘 탭 / 'inline' = 늘 생활 습관 아래
    BUCKET_TAB: 'auto',
    STUDY_VIEW: 'month', // 공부 간트 처음 보기: 'month' 그달 / 'week' 월~일 (2026-10-08, js/study_gantt.js)
    // 벽 버킷리스트 메모지 붙일 자리 (그림 세트마다, 메모지 그림 왼쪽 위 집 px). 무늬 기록기능디자인 v01 2-1. 목록 첫 자리 = 처음 값. 자리가 없는 세트는 메모지 안 그림
    // 벽 메모지 자리 (세트마다, 설정 묶음이 채움). 2026-10-08 제작자: 자리 고르기 없앰, 메모지 = 가구 하나 (js/house_slots.js addMemo). 공용 집은 배치표 memo_bucket 물건 그대로
    MEMO_WALL_SLOTS: {},
    // 쓰기 (첫 판): 생활 습관 "오늘" 카드에서 이 습관의 칸만 눌러 체크 (LIFE_FILE ## 습관 기록 표 오늘 줄). 다른 것은 읽기 전용
    WATER_HABIT: '물',
    // 두부 대화창 (2026-10-03). 기록 날짜의 하루 경계 = DAY_START_HOUR시: 01~06시에 적은 식사·한마디·잠은 전날 날짜 (토리 결정)
    //   물컵(WATER_HABIT)의 "오늘"은 아직 자정 기준 그대로 (electron/main.js today). 맞출지는 제작자 결정 대기
    DAY_START_HOUR: 6,
    //   시각 칩: 잔 시각 / 깬 시각 (무늬 대화창 디자인 v01 4-5, 한 줄 6개). 그 밖의 시각은 입력창에 직접 적기
    DIALOG: { BED_HOURS: [22, 23, 0, 1, 2, 3], WAKE_HOURS: [6, 7, 8, 9, 10, 11], MAX_LEN: 100 },
    // 공부 간트 기간: 이번 주 월요일부터 MIN주, 막대 끝이 더 뒤면 MAX주까지 늘림
    GANTT_WEEKS: { min: 4, max: 12 },
    // 입장 화면 "입장하기" 버튼 (제작자 픽셀 시안 2026-10-05, 입장 그림 px). 크기 w·h = enter_button.js size(), 자리 = 그림의 button_zone 가운데 (entrance v04: x110 y245 76x19)
    //   button_zone이 없는 옛 그림이면 y, x 생략 = 가로 가운데
    ENTER_BUTTON: { y: 226, w: 77, h: 15 },
    // 입장 화면 v02 (2026-10-03): 벤치 이웃. 입장 화면을 열 때 GUEST_CHANCE 확률로 나옴, 같은 날(DAY_START_HOUR 경계)은 처음 정한 대로.
    //   GUEST_QUIET 시각(22시 ~ 6시 미만)에는 안 나옴. 한 장 ms·순서는 그림 파일 anim
    GUEST_CHANCE: 0, // 공용 기본 = 안 나옴 (그림도 없음). 제작자 판은 profiles/player
    GUEST_QUIET: { from: 22, to: 6 },
    GUEST_KEY: 'pixel-house.guest', // 이 컴퓨터 저장소: { date, show, told }
    // 입장 화면에서 누를 수 있는 곳 (그림 px). 말 = lines.js entrance.idle.<id>
    //   그림 파일에 spots([{ id, px, py, w, h }])가 있으면 그것을 씀. 없으면 아래 표에서 그림 판(version)으로 찾음. 둘 다 없으면 누를 곳 없음(틀린 자리를 쓰지 않게)
    //   2 = entrance_v02, 3 = entrance_v03, 4 = entrance_v04 (제작자 확정), 5 = entrance_v05 (지금 쓰는 판, 잔디). 확인판 버튼자리 x3에서 비트가 잼. 그림 판이 바뀌면 무늬가 spots를 넣거나 여기 한 판 추가
    ENTRANCE_SPOTS: {}, // 입장 그림 판마다 누를 곳 (설정 묶음이 채움. 공용판은 입장 그림이 없어 비어 있음)
    // "오랜만" = 마지막 방문에서 이만큼(일) 이상 지남
    LONG_ABSENCE_DAYS: 3,
    // 방문 기록을 두는 브라우저 저장소 키 (이 컴퓨터 안에만, 밖으로 보내지 않음)
    VISIT_KEY: 'pixel-house.lastVisit',
    // 걷기: 한 칸 가는 시간(ms), 걷기 그림 한 장 시간(ms). pixel-office와 같은 값
    STEP_MS: 140,
    WALK_FRAME_MS: 130,
    // 말풍선이 떠 있는 시간(ms), 대화창 글자 나오는 간격(ms)
    BUBBLE_MS: 3200,
    TYPE_MS: 35,
    // 되돌리기 띠("… 지웠어요 [되돌리기]")가 떠 있는 시간(ms). 지나면 저절로 사라짐. 창 닫기·탭 옮기기 때도 사라짐 (2026-10-08 제작자, js/undo_bar.js)
    UNDO_MS: 5000,
  };
  const PF = (root.PHProfile || (typeof module !== 'undefined' && typeof require === 'function' ? require('../profile.js') : null)); // 설정 묶음 (js/profile.js)
  if (PF) PF.patch('PH_SETTINGS', PH_SETTINGS);
  root.PH_SETTINGS = PH_SETTINGS;
  if (typeof module !== 'undefined' && module.exports) module.exports = PH_SETTINGS;
})(typeof window !== 'undefined' ? window : globalThis);
