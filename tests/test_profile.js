// 설정 묶음·공용판 계산 시험 (그림·창 없음): js/profile.js 합치기, 빈 기록 파일(js/life_template.js), 묶음 고르기·이름 검사(electron/profile_main.js),
// 공용 원룸 가구 자리(js/house_slots.js). 실행: node tests/test_profile.js. 실제 생활 기록·사용자 폴더는 안 씀 (임시 폴더만)
'use strict';
process.env.PH_PROFILE = 'default'; // 이 시험은 공용 묶음 기준 (제작자 묶음이 있어도)
delete process.env.PH_PROFILE_USER;
const fs = require('fs');
const path = require('path');
const os = require('os');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (label, cond, extra) => { if (cond) pass++; else { fail++; console.log('  X ' + label + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); } };

const P = require('../js/profile.js');
const S = require('../js/data/settings.js');
const LINES = require('../js/data/lines.js');
ok('공용 묶음: 원룸 세트 기본 (집 = 원룸·투룸·쓰리룸), 기록 파일 = 폴더 맨 위 파일 하나, 이름표 Pixel House', P.id === 'default' && S.ART_SET_DEFAULT === 'room1' && Object.keys(S.ART_SETS).join() === 'room1,room2,room3' && S.LIFE_FILE === 'PixelHouse_생활기록.md' && S.BRAND === 'Pixel House', [P.id, S.ART_SET_DEFAULT, S.LIFE_FILE]);
ok('공용 묶음: 이웃 안 나옴, 입장 그림 누를 곳 없음, 벽 메모지 자리는 배치표에서', S.GUEST_CHANCE === 0 && Object.keys(S.ENTRANCE_SPOTS).length === 0 && Object.keys(S.MEMO_WALL_SLOTS).length === 0);
const all = JSON.stringify(LINES);
ok('공용 대사: 이름 자리 {user} (이름을 모르면 그대로), 토리·오피스·이웃 줄 없음', all.includes('{user}님') && !/토리|오피스|이웃/.test(all), all.match(/토리|오피스|이웃/));
ok('공용 공간 대사 = 원룸·투룸·쓰리룸 공간 id (genkan·bath·room + living·bedroom·study·dress, 부기 새 방 v01)', Object.keys(LINES.room).sort().join() === 'bath,bedroom,dress,genkan,living,room,study');

// 합치기 규칙
const o = { a: { b: 1, c: [1, 2] }, d: 'x', e: { f: 1, g: 2 } };
P.merge(o, { a: { c: [3] }, d: 'y', 'e!': { f: 9 } });
ok('합치기: 객체는 안쪽까지, 배열은 통째로, "키!"는 통째로', o.a.b === 1 && o.a.c.join() === '3' && o.d === 'y' && o.e.f === 9 && o.e.g === undefined, o);
const u = { x: ['{user}님 안녕', { y: '잘 자요, {user}님' }] };
P.fillUser(u, '민지');
ok('{user} 채우기 (배열·안쪽 객체까지)', u.x[0] === '민지님 안녕' && u.x[1].y === '잘 자요, 민지님', u);
const cu = { a: '{cat} 여기 있어요', b: ['집사 {cat|이에요}', '{cat|이} 기다린다', '{cat|은} 졸려요', '{cat|으로} 불러요'] };
P.fillUser(cu, '', '콩');
ok('{cat} 채우기 + 받침 조사 (콩: 이에요·이·은·으로)', cu.a === '콩 여기 있어요' && cu.b.join() === '집사 콩이에요,콩이 기다린다,콩은 졸려요,콩으로 불러요', cu);
const cu2 = { b: ['집사 {cat|이에요}', '{cat|이} 기다린다'] }; P.fillUser(cu2, '', '두부');
ok('{cat} 받침 없음 (두부: 예요·가)', cu2.b.join() === '집사 두부예요,두부가 기다린다', cu2);
P.init({ id: 'default', bundle: {}, user: { name: '민지' } });
ok('고양이 이름 없으면 기본 두부, 있으면 그 이름', P.catName() === '두부' && P.init({ id: 'default', bundle: {}, user: { name: '민지', cat: '콩이' } }).catName() === '콩이');
const LP = { intro: [{ say: '어서 오세요, {user}님. 집사 {cat|이에요}냥~' }] }; P.patch('PH_LINES', LP);
ok('patch = {user}·{cat} 같이 채움', LP.intro[0].say === '어서 오세요, 민지님. 집사 콩이예요냥~', LP);
P.init({ id: 'default', bundle: {}, user: {} });
const S2 = { ART_SET_DEFAULT: 'room1', ART_SETS: { room1: { chars: { player: { sprite: 'avatar1' } } } } };
P.init({ id: 'default', bundle: {}, user: { name: '민지', avatar: 'avatar3', house: 'room1' } });
P.patch('PH_SETTINGS', S2);
ok('사용자 값: 고른 아바타 = 내 캐릭터 그림', S2.ART_SETS.room1.chars.player.sprite === 'avatar3', S2);
P.init({ id: 'default', bundle: {}, user: { avatar: '../x' } }); const S3 = { ART_SETS: { room1: { chars: { player: { sprite: 'avatar1' } } } } }; P.patch('PH_SETTINGS', S3);
ok('이상한 아바타 값은 안 씀', S3.ART_SETS.room1.chars.player.sprite === 'avatar1');

// 빈 기록 파일
const LT = require('../js/life_template.js');
const Md = require('../js/life_md.js');
const t0 = LT.build([]), d0 = Md.parse(t0.text);
ok('빈 틀: 생활습관·공부·습관 기록·약속·버킷리스트 섹션, 습관 없음, 읽기 오류 없음', d0.habits && d0.habits.rows.length === 0 && d0.study && d0.meetingsSection && d0.records && !(d0.missing || []).length, d0.missing);
const t1 = LT.build(['water', 'yoga', 'reading', { name: '일기' }, { name: '물' }, { name: 'a|b' }, 'nope']);
ok('추천 + 직접: 물(6칸)·요가·일기 목표, 독서 기록 / 같은 이름·표 깨는 글자·모르는 id는 빠짐', Md.parse(t1.text).habits.rows.map((r) => r.name + ':' + r.kind + (r.slots ? r.slots : '')).join() === '물:목표6,요가:목표,일기:목표,독서:기록' && t1.skipped.length === 3, [t1.added, t1.skipped]);
ok('빈 틀 안내 글: 이 컴퓨터에만, 인터넷으로 안 보냄', /이 컴퓨터에만/.test(t0.text) && /인터넷으로 보내지 않습니다/.test(t0.text));
// 잠 기록 (2026-10-08 구간 여러 개 + 선잠): 빈 틀엔 ## 수면이 없고, 처음 쓸 때 버킷리스트 앞에 생김. 자세한 시험은 tests/test_sleep.js
const LL = require('../js/life_log.js');
const z1 = LL.setSleepWindow(t1.text, { from: '2026-10-02 18:00', segments: [{ a: 330, b: 670 }, { a: 670, b: 780, light: true }] });
ok('빈 틀에 잠 칠하기: ## 수면(종류 칸) 새로, 안전 검사 통과, 다시 읽으면 구간 둘', z1.created && z1.text.indexOf('## 수면') < z1.text.indexOf('## 버킷리스트') && LL.onlySleepWindowChanged(t1.text, z1.text, '2026-10-02 18:00', 24) && LL.sleepWindow(z1.text, '2026-10-02 18:00').merged.map((s) => s.light).join() === 'false,true');
const z2 = LL.setSleep(z1.text, { date: '2026-10-03', bed: '23:00', wake: '07:00' });
ok('빈 틀: 칠한 뒤 대화창 잠 쓰기 = 그날 대표 줄만 고침', LL.onlyLogChanged(z1.text, z2.text, 'sleep', '2026-10-03') && LL.dayOf(LL.parse(z2.text), '2026-10-03').sleeps.length === 2 && LL.dayOf(LL.parse(z2.text), '2026-10-03').sleep.bed === '23:00');

// 묶음 고르기 (electron/profile_main.js): 임시 사용자 폴더
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-house-profile-'));
const fakeApp = { getPath: (k) => (k === 'userData' ? path.join(tmp, 'ud') : path.join(tmp, k)) };
const PM = require('../electron/profile_main.js');
const pm = PM({ app: fakeApp, ROOT, env: { PH_PROFILE: 'default' } });
let c = pm.choose();
ok('첫 실행(공용 묶음, profile.json 없음) = 온보딩, 기록 폴더 없음', c.id === 'default' && c.onboard && c.dir === null, c);
ok('이름 검사: 앞뒤 빈칸 정리, 빈칸·12자 넘음·표 깨는 글자 막음', pm.cleanName('  민 지 ').name === '민 지' && pm.cleanName('').code === 'empty' && pm.cleanName('가나다라마바사아자차카타파').code === 'tooLong' && pm.cleanName('a|b').code === 'bad' && pm.cleanName('{user}').code === 'bad');
pm.write({ bundle: 'default', name: '민지', avatar: 'avatar2', house: 'room1', dir: path.join(tmp, 'rec'), furniture: { bed: 'sofa', '../x': 'y', water: 'Bad Name' } });
c = pm.choose();
ok('저장된 공용 사용자 -> 온보딩 없음, 기록 폴더 = 고른 폴더, 가구 값은 모양 맞는 것만', c.id === 'default' && !c.onboard && c.dir === path.join(tmp, 'rec') && c.user.name === '민지' && JSON.stringify(c.user.furniture) === '{"bed":"sofa"}', c.user);
pm.write({ bundle: 'default', name: '민지', avatar: 'avatar9', house: 'room1', dir: 'rel/path' });
ok('깨진 profile.json(모르는 아바타·상대 경로) = 다시 온보딩', pm.choose().onboard);
fs.rmSync(tmp, { recursive: true, force: true });

// 공용 원룸 가구 자리
const HS = require('../js/house_slots.js');
require('../js/house_rooms.js'); require('../js/assets_rooms.js');
const D = JSON.parse(JSON.stringify(globalThis.PH_DATA_SETS.room1.PH_LAYOUT_DATA)), A = globalThis.PH_ASSET_SETS.room1;
const r0 = HS.apply(JSON.parse(JSON.stringify(D)), A, {});
ok('원룸 자리 14곳, 기본 연결 = 무늬 자리 표 (TV = 영화 기록, 달력 = 약속 달력, 물 자리 = 정수기 물 기록 창 D4 ①)', r0.slots.length === 14 && r0.links.tv_cabinet === 'record' && r0.links.calendar === 'calendar' && r0.links.cup_water === 'water' && r0.links.bed === 'close' && r0.links.rug === 'yoga' && !('washbasin' in r0.links), r0.links);
const D1 = JSON.parse(JSON.stringify(D)), r1 = HS.apply(D1, A, { bed: 'sofa', water: 'purifier', table: 'coffeetable_m', rug: 'rug_round', plant: 'nope' });
const at = (t) => D1.objects.find((q) => q.type === t);
ok('후보 바꾸기: 기준점대로 자리 (소파 왼쪽 아래 195,72 / 타원 탁자 가운데 아래 129,136 / 둥근 카펫 가운데 129,120), 모르는 후보 = 기본', at('bed').sprite === 'sofa' && at('bed').px === 195 && at('bed').py === 72 && at('table_low').px === 129 && at('table_low').py === 136 && at('rug').px === 129 && at('rug').py === 120 && at('plant').sprite === 'plant_monstera', [at('bed'), at('table_low'), at('rug')].map((x) => [x.sprite, x.px, x.py]));
ok('물컵 자리에 정수기 = 물 기록 창 (무늬 3절)', r1.links.cup_water === 'water', r1.links);
// D4 ① (2026-10-14 제작자): 기본 원룸 물 자리 기본 = 정수기 (settings.SLOT_DEFAULTS). 고른 값이 있으면 그대로
{
  const SD = require('../js/data/settings.js').SLOT_DEFAULTS;
  ok('설정: 원룸 물 자리 기본 = 정수기 (SLOT_DEFAULTS.room1.water)', SD && SD.room1 && SD.room1.water === 'purifier', SD);
  const Dd = JSON.parse(JSON.stringify(D)), rd = HS.apply(Dd, A, {}, SD.room1), od = Dd.objects.find((q) => q.slot === 'water'), sl = D.slots.find((x) => x.id === 'water');
  const [bx, by, bw, bh] = sl.box;
  ok('새 집(고른 값 없음) = 정수기, 물 기록 창 연결, 자리 상자 안·바닥 맞춤 (가운데 아래)', od.sprite === 'purifier' && rd.links.cup_water === 'water' && od.px >= bx && od.px + od.size[0] <= bx + bw && od.py + od.size[1] === by + bh && rd.slots.find((x) => x.id === 'water').def === 'purifier', [od.sprite, od.px, od.py, od.size, sl.box]);
  const rows = D.rows, T = D.tile, tile = (x, y) => rows[Math.floor(y / T)][Math.floor(x / T)];
  ok('정수기 자리 = 원룸 안(벽 칸 아래쪽 줄이 바닥과 이어짐) 그리고 길을 막지 않음 (block false)', od.block === false && tile(od.px + 4, od.py + od.size[1] + 2) === '.', [tile(od.px + 4, od.py + od.size[1] + 2), od.block]);
  const Dc = JSON.parse(JSON.stringify(D)), rc = HS.apply(Dc, A, { water: 'cup_water' }, SD.room1);
  ok('이미 물컵을 고른 사용자(furniture.water = cup_water) = 물컵 그대로, 물 +1', Dc.objects.find((q) => q.slot === 'water').sprite === 'cup_water' && rc.links.cup_water === 'water_cup', rc.links.cup_water);
  const r2 = HS.apply(JSON.parse(JSON.stringify(D)), A, {}, null);
  ok('기본값 표가 없어도 정수기 (자리 덮기 LAYOUT_PATCH 에서 후보 첫째 = 정수기)', r2.links.cup_water === 'water' && D.slots.find((x) => x.id === 'water').candidates[0].sprite === 'purifier');
}
ok('벽 메모지 = 배치표 물건 그대로 (2026-10-08 메모지를 가구처럼), 기본 기능 = 버킷리스트', D1.objects.filter((q) => q.type === 'memo_bucket').length === 1 && r1.links.memo_bucket === 'bucket', r1.links);
ok('아바타 3명 x 5동작 그림 (32x36, 발바닥 줄 35), 밤 팔레트 없음(캐릭터 규칙)', [1, 2, 3].every((n) => ['idle', 'walk_down', 'walk_up', 'walk_left', 'walk_right'].every((k) => { const a = A['avatar' + n + '_' + k]; return a && a.frames[0].length === 36 && a.frames[0][0].length === 32 && a.foot_row === 35 && !a.palette_night; })));
// 입장 그림은 공용 집 것(entrance_roomN, 무늬 2026-10-08)만 들어감. 제작자 집 입장·이웃(entrance_guest)는 없음
ok('공용 그림 묶음 입장 그림 = 공용 원룸 것 (entrance_room1_v01)', !A.entrance || /^20261008_pixel-house_entrance_room\d+_v\d+\.json$/.test(A.entrance.file), A.entrance && A.entrance.file);
ok('공용 그림 묶음에 제작자 집·플레이어 캐릭터·제작자 집 입장·이웃 그림 없음', !Object.keys(A).some((k) => k !== 'entrance' && /^(player|entrance|lamppool|tv_on|waterplant|bed$|shelf_unit|rug_persian|table_two|table_long|wardrobe)/.test(k)), Object.keys(A).filter((k) => /^(player|entrance)/.test(k)));

console.log(`test_profile: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
