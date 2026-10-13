// 데스크톱 앱 (Electron). 네트워크 없음. 파일은 PixelHouse 폴더 안의 .md를 읽는다 (생활 탭, ph:read).
// 쓰기: settings.LIFE_FILE 한 파일만. 물 칸(ph:setWater), 대화창(life_log_ipc.js), 습관 체크(life_check_ipc.js). 모두 정해진 섹션·오늘 줄만, 쓰기 전 백업.
// 실행: npm start / 개발(코드 고치면 창 새로고침): npm run dev / 화면 확인 캡처: npm run shots
// Electron: 2026-10-08부터 이 폴더 node_modules (devDependency). 없으면 package.json scripts가 ~/dev/pixel-office 것을 빌려 씀
// 설정 묶음 (2026-10-08 로드맵 4단계): 제작자 판(profiles/player) / 공용판(온보딩). 고르기는 electron/profile_main.js, 합치기는 js/profile.js
'use strict';
const { app, BrowserWindow, shell, ipcMain, screen, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const DEV = process.env.PH_DEV === '1';
const SHOTS = process.env.PH_SHOTS === '1';
const SMOKE_HIDE = process.env.PH_SMOKE_HIDE === '1'; // 연기 시험(tools/smoke_win.js)을 맥에서 돌릴 때만: 창을 투명도 0·마우스 통과로 (시험 창과 같음)

app.setName('Pixel House');

// 확인 캡처는 따로 만든 임시 저장소로 (제작자 실제 방문 기록을 건드리지 않게). 끝나면 지운다. 설정 묶음(profile.json)도 사용자 폴더에서 읽으므로 맨 먼저
let shotData = null;
// 폴더 이름에 시험 표시(PH_SHOTS_TAG, 시험 프로세스마다 다름)를 넣어, 시험이 끝난 뒤 자기 폴더만 지우게 함 (tests/cleanup_tmp.js)
const SHOTS_TAG = /^[A-Za-z0-9]{1,24}$/.test(process.env.PH_SHOTS_TAG || '') ? process.env.PH_SHOTS_TAG : 'x';
if (SHOTS) { shotData = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-house-shots-' + SHOTS_TAG + '-')); app.setPath('userData', shotData); }
// 시험: 이미 온보딩을 마친 공용판 사용자로 시작 (PH_SHOTS_PROFILE = profile.json 내용, 시험 임시 사용자 폴더에만 씀. tests/test_settings_app.js)
if (SHOTS && process.env.PH_SHOTS_PROFILE) { try { fs.writeFileSync(path.join(shotData, 'profile.json'), process.env.PH_SHOTS_PROFILE); } catch (e) { /* 없으면 온보딩부터 */ } }
else if (process.env.PH_USERDATA) app.setPath('userData', path.resolve(process.env.PH_USERDATA)); // 시험(test_instance)용: 실제 사용자 폴더를 안 건드림

// ---- 설정 묶음 고르기 (js/*.js 를 require 하기 전에: js/profile.js 가 PH_PROFILE 을 읽음) ----
const Prof = require(path.join(__dirname, 'profile_main.js'))({ app, ROOT, env: process.env });
let PROFILE = Prof.choose();
function setProfileEnv() {
  process.env.PH_PROFILE = PROFILE.id;
  if (PROFILE.id === 'default' && PROFILE.user && PROFILE.user.name) process.env.PH_PROFILE_USER = JSON.stringify({ name: PROFILE.user.name, cat: PROFILE.user.cat, avatar: PROFILE.user.avatar, house: PROFILE.user.house, pet: PROFILE.user.pet, brand: PROFILE.user.brand, tabsHidden: PROFILE.user.tabsHidden });
}
setProfileEnv();
// 화면이 처음 읽는 값 (preload가 동기로 받아 window.PHProfileBoot). 묶음 대사·설정 + 사용자 값. 기록 폴더 경로는 넘기지 않음
function bootData() {
  const u = PROFILE.user || {};
  return { id: PROFILE.id, bundle: PROFILE.bundle || {}, onboard: !!PROFILE.onboard,
    user: PROFILE.id === 'default' ? { name: u.name || '', cat: u.cat || '', avatar: u.avatar || '', house: u.house || '', furniture: u.furniture || {}, pet: u.pet || '', brand: u.brand || '', tabsHidden: u.tabsHidden || [], desktopPet: u.desktopPet === true } : {} };
}
ipcMain.on('ph:profileSync', (e) => { e.returnValue = bootData(); });

// ---- 읽기 (생활 탭) ----
// 하우스 폴더 안쪽 상대 경로만, .md만, 읽기만. 상위 폴더(..)·숨김 이름(.)·비밀 파일·_to_delete는 막는다 (pixel-office resolveSafe와 같은 방식)
// 시험은 PH_HOUSE로 가짜 폴더(tests/fixtures/house)를 가리킨다. 쓰기는 기능이 정해지면 ph:write로 따로 (원본 백업 후)
//   기록 폴더 = 설정 묶음이 정함 (제작자 판 = 묶음 houseDir 또는 PH_HOUSE, 공용판 = 온보딩에서 고른 폴더). 온보딩 중엔 null (읽기·쓰기 없음)
let HOUSE = PROFILE.dir ? path.resolve(PROFILE.dir) : null;
const HousePath = require('./house_path'); // 경로 검사 (C1 2026-10-14 떼어 냄, 윈도우 \·드라이브 거절)
function resolveSafe(rel) { return HousePath.safeMd(HOUSE, rel); }
ipcMain.handle('ph:read', (e, rel) => {
  const full = resolveSafe(rel);
  return { text: fs.readFileSync(full, 'utf8'), lastModified: fs.statSync(full).mtimeMs };
});

// ---- 쓰기: 물 칸 하나 ----
// 대상 파일·습관 이름·칸 수·오늘 날짜는 모두 메인이 정한다 (화면은 "몇 잔"과 "읽은 시각"만 보냄 = 경로를 보낼 수 없음)
require(path.join(ROOT, 'js', 'data', 'settings.js'));
require(path.join(ROOT, 'js', 'life_md.js'));
const S = globalThis.PH_SETTINGS;
let LIFE_FULL = null, backup = null, FEAT = null, houseOn = false;
const BACKUP_KEEP = 10;
function today() { // 기록 날짜 = 하루 경계 settings.DAY_START_HOUR(6시, 대화창·습관 체크와 같음). 시험(PH_SHOTS)에서만 PH_TODAY로 고정
  if (process.env.PH_SHOTS === '1' && /^\d{4}-\d{2}-\d{2}$/.test(process.env.PH_TODAY || '')) return process.env.PH_TODAY;
  return globalThis.PHLifeMd.logDay(Date.now(), S.DAY_START_HOUR);
}
// 옷 갈아입기 차림 저장 (wardrobe 브랜치 2026-10-03): userData/outfit.json 한 파일 (생활 기록 아님). 코드는 electron/outfit_ipc.js. 기록 폴더와 상관없어 온보딩 중에도 등록
require(path.join(__dirname, 'outfit_ipc.js'))({ ipcMain, app });
// 집 열기: 기록 파일 쓰기 IPC 등록 (한 번만). 제작자 판·온보딩 끝난 공용판은 시작할 때, 온보딩 중이면 끝난 뒤
function startHouse() {
  if (houseOn) return; houseOn = true;
  LIFE_FULL = resolveSafe(S.LIFE_FILE);
  // 쓰기 직전 사본: userData/backup/<날짜시각>_<파일이름>, 최근 BACKUP_KEEP개만. 코드는 electron/life_backup.js (두부 펫과 같이 씀, 2026-10-04)
  backup = require(path.join(__dirname, 'life_backup.js'))({ dir: () => path.join(app.getPath('userData'), 'backup'), file: LIFE_FULL, keep: BACKUP_KEEP });
  // 물 칸 하나 (ph:setWater). 코드는 electron/water_ipc.js (두부 펫과 같이 씀, 2026-10-04)
  require(path.join(__dirname, 'water_ipc.js'))({
    ipcMain, file: LIFE_FULL, backup, settings: S, today,
    guard: () => { if (SHOTS && !process.env.PH_HOUSE) throw new Error('시험 실행 중에는 실제 생활 기록에 쓰지 않음'); }, // 실제 자료 캡처(shots:real)에서 안전장치
  });
  // 가구 연결·일지 기능 표시 (2026-10-04): 앱 설정 userData/features.json (생활 기록 파일은 읽기만). 코드는 electron/furnish_ipc.js
  //   logs_ipc·habit_ipc가 "표에 한 번이라도 있었던 일지 기능(seen)"을 보고 씀 (지운 대변·식사·독서 줄을 다시 만들지 않게).
  //   book_ipc(독서)·life_log_ipc(대화창 식사)도 씀. 그래서 이들보다 먼저 만듦 (2026-10-04)
  FEAT = require(path.join(__dirname, 'furnish_ipc.js'))({ ipcMain, app, file: LIFE_FULL });
  // 두부 대화창 쓰기: 수면·식사·한마디 (ph:setSleep, ph:addMeal, ph:setNote). 규칙은 물컵과 같음, 코드는 electron/life_log_ipc.js
  require(path.join(__dirname, 'life_log_ipc.js'))({
    ipcMain, file: LIFE_FULL, backup, settings: S, features: FEAT,
    fixedDay: () => (SHOTS && /^\d{4}-\d{2}-\d{2}$/.test(process.env.PH_TODAY || '') ? process.env.PH_TODAY : null),
    guard: () => { if (SHOTS && !process.env.PH_HOUSE) throw new Error('시험 실행 중에는 실제 생활 기록에 쓰지 않음'); },
  });
  // 생활 습관 체크 쓰기: 주 N회 칸·기록 습관 양·안전장치 주간 확인 (ph:toggleWeekly, ph:addAmount, ph:setSafetyCheck). 코드는 electron/life_check_ipc.js
  require(path.join(__dirname, 'life_check_ipc.js'))({
    ipcMain, file: LIFE_FULL, backup, settings: S, fixedDay: () => (SHOTS && /^\d{4}-\d{2}-\d{2}$/.test(process.env.PH_TODAY || '') ? process.env.PH_TODAY : null),
    guard: () => { if (SHOTS && !process.env.PH_HOUSE) throw new Error('시험 실행 중에는 실제 생활 기록에 쓰지 않음'); },
  });
  // 공부 간트 쓰기 (study 브랜치 2026-10-03): ## 공부·## 공부 보관·습관 기록 오늘 줄. 규칙은 위와 같음, 코드는 electron/study_ipc.js
  require(path.join(__dirname, 'study_ipc.js'))({
    ipcMain, file: LIFE_FULL, backup, settings: S,
    fixedDay: () => (SHOTS && /^\d{4}-\d{2}-\d{2}$/.test(process.env.PH_TODAY || '') ? process.env.PH_TODAY : null),
    guard: () => { if (SHOTS && !process.env.PH_HOUSE) throw new Error('시험 실행 중에는 실제 생활 기록에 쓰지 않음'); },
  });
  // 독서 책꽂이 쓰기 (journal 브랜치 2026-10-03): ## 독서·## 독서 보관만. 규칙은 위와 같음, 코드는 electron/book_ipc.js
  require(path.join(__dirname, 'book_ipc.js'))({
    ipcMain, file: LIFE_FULL, backup, settings: S, features: FEAT,
    fixedDay: () => (SHOTS && /^\d{4}-\d{2}-\d{2}$/.test(process.env.PH_TODAY || '') ? process.env.PH_TODAY : null),
    guard: () => { if (SHOTS && !process.env.PH_HOUSE) throw new Error('시험 실행 중에는 실제 생활 기록에 쓰지 않음'); },
  });
  // 살림 쓰기 (2026-10-03): ## 살림 물건·## 사야 할 것·청소 습관(## 생활습관 "살림" 줄 + 습관 기록 오늘 줄). 규칙은 위와 같음, 코드는 electron/household_ipc.js
  require(path.join(__dirname, 'household_ipc.js'))({
    ipcMain, file: LIFE_FULL, backup, settings: S,
    fixedDay: () => (SHOTS && /^\d{4}-\d{2}-\d{2}$/.test(process.env.PH_TODAY || '') ? process.env.PH_TODAY : null),
    guard: () => { if (SHOTS && !process.env.PH_HOUSE) throw new Error('시험 실행 중에는 실제 생활 기록에 쓰지 않음'); },
  });
  // 습관 편집·공부 완전 삭제 (2026-10-04): ## 생활습관 표 줄·## 공부 표 줄·매일 n회 오늘 줄. 규칙은 위와 같음, 코드는 electron/habit_ipc.js
  const habitIpc = require(path.join(__dirname, 'habit_ipc.js'))({
    ipcMain, file: LIFE_FULL, backup, settings: S, features: FEAT,
    fixedDay: () => (SHOTS && /^\d{4}-\d{2}-\d{2}$/.test(process.env.PH_TODAY || '') ? process.env.PH_TODAY : null),
    guard: () => { if (SHOTS && !process.env.PH_HOUSE) throw new Error('시험 실행 중에는 실제 생활 기록에 쓰지 않음'); },
  });
  if (!(SHOTS || process.env.PH_USERDATA) || process.env.PH_HOUSE) habitIpc.migrate(); // 시험 실행(임시 사용자 폴더·캡처)이 실제 기록 폴더를 볼 때는 안 씀 (2026-10-08 test_instance가 실제 파일을 옮긴 일 뒤 막음). 2026-10-08 옛 독서 줄 "| 독서 | 기록 | 쪽 | - |" -> "책꽂이에 기록" (쓰기 전 사본, 한 번 옮기면 다음부턴 바뀔 것 없음)
  // 약속 쓰기 (2026-10-07 제작자 결정): ## 약속 표 줄 더하기·고치기·지우기. 규칙은 위와 같음, 코드는 electron/meeting_ipc.js
  require(path.join(__dirname, 'meeting_ipc.js'))({
    ipcMain, file: LIFE_FULL, backup,
    guard: () => { if (SHOTS && !process.env.PH_HOUSE) throw new Error('시험 실행 중에는 실제 생활 기록에 쓰지 않음'); },
  });
  // 기록 넓히기 (2026-10-08 로드맵 3단계): ## 기록·## 기록 항목(영화·연극·새 항목), ## 버킷리스트 줄, ## 공부 단원. 규칙은 위와 같음, 코드는 electron/record_ipc.js
  require(path.join(__dirname, 'record_ipc.js'))({
    ipcMain, file: LIFE_FULL, backup, settings: S,
    fixedDay: () => (SHOTS && /^\d{4}-\d{2}-\d{2}$/.test(process.env.PH_TODAY || '') ? process.env.PH_TODAY : null),
    guard: () => { if (SHOTS && !process.env.PH_HOUSE) throw new Error('시험 실행 중에는 실제 생활 기록에 쓰지 않음'); },
  });
  // 대변 관찰 일지·식사 일지 쓰기 (logs 브랜치 2026-10-04): ## 대변·## 식사 표 + (처음 더할 때) 생활습관 "기록" 줄. 규칙은 위와 같음, 코드는 electron/logs_ipc.js
  require(path.join(__dirname, 'logs_ipc.js'))({
    ipcMain, file: LIFE_FULL, backup, settings: S, features: FEAT,
    fixedDay: () => (SHOTS && /^\d{4}-\d{2}-\d{2}$/.test(process.env.PH_TODAY || '') ? process.env.PH_TODAY : null),
    guard: () => { if (SHOTS && !process.env.PH_HOUSE) throw new Error('시험 실행 중에는 실제 생활 기록에 쓰지 않음'); },
  });
}

// ---- 그림 세트 (제작자 2026-10-03: v08 "자세히" ↔ v09 "굵게") ----
// 고른 값 = userData/prefs.json { artSet } (다음에 열 때도 그대로). 처음 = settings.ART_SET_DEFAULT (없으면 있는 것 중 가장 새 판)
// 바꾸기: 사이드바 버튼(ph:setArtSet) 또는 메뉴 "보기 > 집 그림" -> 저장하고 화면을 ?set=으로 다시 엶 (?resume = 있던 자리, js/artset.js)
let SETTINGS = {}, DATA_SETS = {};
try { SETTINGS = require(path.join(ROOT, 'js', 'data', 'settings.js')); } catch (e) {}
// 묶음 파일: house_data.js = 제작자 집 세트(v08~v12), house_rooms.js = 공용 집(원룸 room1). 공개 저장소에는 house_rooms.js만 (scripts/sync_assets.py)
['house_data.js', 'house_rooms.js'].forEach((f) => { try { require(path.join(ROOT, 'js', f)); } catch (e) {} });
DATA_SETS = globalThis.PH_DATA_SETS || {};
// 메뉴 = 설정 묶음의 settings.ART_SETS에 적은 세트만, 적은 순서대로 (2026-10-08: 묶음에 없는 세트는 안 보임)
const SET_NAMES = (() => { const have = Object.keys(DATA_SETS).filter((k) => DATA_SETS[k] && DATA_SETS[k].PH_LAYOUT_DATA).sort(), order = Object.keys(SETTINGS.ART_SETS || {}); return order.filter((k) => have.includes(k)); })();
const NEWEST = Object.keys(DATA_SETS).filter((k) => SET_NAMES.includes(k)).sort().pop();
const setLabel = (k) => ((SETTINGS.ART_SETS || {})[k] || {}).label || k;
const prefsPath = () => path.join(app.getPath('userData'), 'prefs.json');
function readPrefs() { try { const p = JSON.parse(fs.readFileSync(prefsPath(), 'utf8')); return p && typeof p === 'object' ? p : {}; } catch (e) { return {}; } }
function writePrefs(p) { try { fs.writeFileSync(prefsPath(), JSON.stringify(p, null, 2)); return true; } catch (e) { return false; } }
function chooseSet() {
  const ok = (k) => typeof k === 'string' && SET_NAMES.includes(k);
  if (ok(process.env.PH_SET)) return process.env.PH_SET; // 시험용 (저장 안 함)
  // 공용판: 온보딩에서 고른 집 (profile.json house = room1·room2·room3, 2026-10-08 투룸·쓰리룸)
  if (PROFILE && PROFILE.id === 'default' && PROFILE.user && ok(PROFILE.user.house)) return PROFILE.user.house;
  const p = readPrefs().artSet; if (ok(p)) return p;
  if (ok(SETTINGS.ART_SET_DEFAULT)) return SETTINGS.ART_SET_DEFAULT;
  return NEWEST || null;
}
let currentSet = null, opens = 0; // opens = 화면을 연 횟수 (메뉴 대기 타이머가 그 사이 바뀐 것을 알아보게)
const DIRS = ['up', 'down', 'left', 'right'], TABS = ['home', 'habits', 'meetings', 'bucket', 'archive'];
function cleanResume(r) { // 화면이 보낸 이어 보기 값: 정해진 꼴만 통과
  if (!r || typeof r !== 'object') return null;
  const n = (v) => (typeof v === 'number' && isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined);
  return { entered: r.entered === true, zone: typeof r.zone === 'string' && /^[a-z_]{1,20}$/.test(r.zone) ? r.zone : undefined,
    fx: n(r.fx), fy: n(r.fy), face: DIRS.includes(r.face) ? r.face : undefined, tab: TABS.includes(r.tab) ? r.tab : undefined,
    settings: ['pet', 'house', 'avatar', 'side'].includes(r.settings) ? r.settings : undefined }; // 설정 화면에서 펫·이름을 바꿔 다시 연 뒤 설정 창 그 탭 다시 열기 (js/settings_ui.js)
}
function openPage(win, set, resume) {
  const query = { pb: '1' }; if (set) query.set = set; if (resume) query.resume = JSON.stringify(resume); // pb = 설정 묶음을 넘겨 줄 수 있는 메인 (electron/preload.js)
  if (SHOTS) query.guest = /^[01]$/.test(process.env.PH_GUEST || '') ? process.env.PH_GUEST : '0'; // 시험: 입장 화면 이웃 고정 (기본 안 나옴)
  if (process.env.PH_LOG === '1') console.log('PH openPage', set, JSON.stringify(resume), new Error().stack.split('\n').slice(2, 5).join(' | '));
  currentSet = set; opens++; buildMenu();
  return win.loadFile(path.join(ROOT, 'index.html'), { query });
}
function switchSet(set, resume) {
  if (!SET_NAMES.includes(set) || !mainWin || mainWin.isDestroyed()) return false;
  const p = readPrefs(); p.artSet = set; writePrefs(p);
  openPage(mainWin, set, cleanResume(resume));
  return true;
}
ipcMain.handle('ph:setArtSet', (e, req) => switchSet(req && req.set, req && req.resume));
ipcMain.handle('ph:artSets', () => ({ current: currentSet, sets: SET_NAMES.map((k) => ({ id: k, label: setLabel(k) })) }));
// 메뉴 "보기 > 집 그림". 누르면 화면에 물어서(지금 자리를 받아) 바꿈. 화면이 1초 안에 답하지 않으면 자리 없이 바꿈
function menuPick(set) {
  if (set === currentSet || !mainWin || mainWin.isDestroyed()) { buildMenu(); return; }
  const wc = mainWin.webContents, n0 = opens;
  wc.send('ph:menuArtSet', set);
  // 화면이 답해서 이미 다시 열었으면(opens가 늘었으면) 아무것도 안 함. 2026-10-03: currentSet 비교로 했다가 1초 안에 두 번 바꾸면 되돌아가는 문제가 있었음
  setTimeout(() => { if (opens === n0 && mainWin && !mainWin.isDestroyed()) switchSet(set, null); }, 1000);
}
function buildMenu() {
  const view = [
    { label: '집 그림', submenu: SET_NAMES.map((k) => ({ label: `${setLabel(k)}(${k})`, type: 'radio', checked: k === currentSet, click: () => menuPick(k) })) },
    { type: 'separator' }, { role: 'togglefullscreen', label: '전체 화면' },
  ];
  if (DEV) view.push({ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' });
  const tpl = [];
  if (process.platform === 'darwin') tpl.push({ role: 'appMenu' });
  tpl.push({ role: 'editMenu' }, { label: '보기', submenu: view }, { role: 'windowMenu' });
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

// 창 크기: 전개도(배치표 칸 수 x 16)를 2배로 보이는 크기 + 여백. 세트 중 가장 큰 전개도 기준 (세트를 바꿔도 창은 그대로, 그림은 소수 배율로 맞춤)
function windowSize() {
  let W = 480, H = 432; // 배치표를 못 읽을 때만 쓰는 기본값
  try { const ds = SET_NAMES.map((k) => DATA_SETS[k].PH_LAYOUT_DATA); if (ds.length) { W = Math.max(...ds.map((d) => d.rows[0].length * 16)); H = Math.max(...ds.map((d) => d.rows.length * 16)); } } catch (e) {}
  const SIDE = 200, BAR = 28, PAD = 40; // 사이드바 너비·맨 위 끌기 띠 높이 (css/app.css --side, --bar와 같게)
  // 처음 창: 전개도 2배가 기본. 화면(작업 영역)보다 크면 화면에 들어가는 배율로 줄임 (v04 480x432는 2배면 화면보다 큼)
  let s = 2;
  try { const wa = screen.getPrimaryDisplay().workAreaSize; s = Math.min(2, (wa.width - SIDE - PAD) / W, (wa.height - BAR - PAD - 30) / H); } catch (e) {}
  s = Math.max(1, s >= 1.95 ? 2 : s);
  return { width: Math.round(W * s) + PAD + SIDE, height: Math.round(H * s) + PAD + BAR, minWidth: Math.round(W * 0.75) + SIDE, minHeight: Math.round(H * 0.75) + BAR };
}
let shotsRan = false;
function createWindow() {
  const sz = windowSize();
  const win = new BrowserWindow({
    width: sz.width, height: sz.height, minWidth: sz.minWidth, minHeight: sz.minHeight, useContentSize: true,
    title: 'Pixel House', backgroundColor: '#34384A',
    titleBarStyle: 'hiddenInset', show: !SHOTS && !SMOKE_HIDE,
    autoHideMenuBar: process.platform !== 'darwin', // 윈도우: 메뉴 막대(편집·보기·창)는 Alt 로만 (C1). 맥은 맨 위 메뉴 막대 그대로
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: !SHOTS },
  });
  mainWin = win;
  if (SMOKE_HIDE && !SHOTS) { win.setOpacity(0); win.setIgnoreMouseEvents(true); win.setFocusable(false); win.once('ready-to-show', () => win.showInactive()); } // 맥에서 연기 시험을 돌릴 때 화면을 가리지 않게 (tools/smoke_win.js --hide)
  dockFor(true); // 집 창이 있으면 Dock 아이콘 보임 (A4)
  win.on('closed', () => { if (mainWin === win) mainWin = null; dockFor(false); quitIfNothingVisible(); });
  openPage(win, chooseSet(), null);
  if (houseOn) watchLife(win); // 온보딩 중이면 끝난 뒤 (houseReady)
  // 앱 안에서 다른 페이지로 가거나 새 창을 열지 않는다
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  if (DEV) {
    let t = null;
    ['js', 'css', 'assets', 'index.html'].forEach((p) => {
      try { watchers.push(fs.watch(path.join(ROOT, p), { recursive: true }, () => { clearTimeout(t); t = setTimeout(() => win.webContents.reload(), 150); })); } catch (e) {}
    });
  }
  if (SHOTS) {
    // 시험 창은 안 보이게 그림 (2026-10-08 제작자 공용판 피드백 1: 시험 창이 쓰던 창 위로 떠서 가림).
    //   창 투명도 0 = 화면에 띄워 둔 채(그리기·캡처는 그대로, capturePage는 창이 아니라 화면 내용을 찍음) 눈에는 안 보임.
    //   마우스는 아래 setIgnoreMouseEvents로 뒤 창에 그대로 감, 포커스도 안 뺏음(showInactive·setFocusable false).
    //   화면 밖으로 옮기는 방법은 macOS가 제목 막대를 화면 안으로 당겨 놓을 수 있어 안 씀. 눈으로 보며 고칠 때만 PH_SHOTS_SHOW=1
    if (process.env.PH_SHOTS_SHOW !== '1') win.setOpacity(0);
    win.once('ready-to-show', () => win.showInactive()); // 포커스를 뺏지 않고 띄움 (그려야 캡처됨)
    // 새로고침·다시 열기 뒤에는 backgroundThrottling: false가 풀릴 때가 있어, 시험 창이 다른 창 뒤에 있으면 requestAnimationFrame이 안 돎
    //   -> 입장 연출이 문(제작자 계단 걷기 glide)에서 멈춤 (2026-10-08 test_app 18~19개·test_furnish_app 흔들림). 페이지를 읽을 때마다 다시 끔. 시험에서만
    const keepFrames = () => { if (!win.isDestroyed()) win.webContents.setBackgroundThrottling(false); };
    win.webContents.on('did-start-loading', keepFrames); win.webContents.on('dom-ready', keepFrames);
    // 시험 창은 사람 마우스·키를 받지 않음 (2026-10-03: 시험 중 화면에 뜬 창을 누르면 그림 세트가 바뀌거나 키가 눌린 채로 남아 시험이 흔들림).
    // 시험 입력은 webContents.sendInputEvent로 화면에 직접 넣으므로 그대로 들어감
    win.setIgnoreMouseEvents(true); win.setFocusable(false);
    if (shotsRan) return; // 시험 도중 집 창을 닫았다 다시 연 경우(A4 시험): 새 창도 안 보이게만 하고 시험은 한 번만
    shotsRan = true;
    // PH_SHOTS_SCRIPT = tools 안 시험 파일 이름 (shots.js = v08 전체 흐름, shots_sets.js = v09·세트 바꾸기, shots_dialog.js = 두부 대화창)
    const script = /^shots(_[a-z0-9]+)?\.js$/.test(process.env.PH_SHOTS_SCRIPT || '') ? process.env.PH_SHOTS_SCRIPT : 'shots.js';
    require(path.join(ROOT, 'tools', script))(win, ROOT, { chooseSet, prefsPath, readPrefs, menuPick, setNames: SET_NAMES, menu: () => Menu.getApplicationMenu(),
      reopen: () => openPage(win, chooseSet(), null), // 시험용: 다시 연 것처럼 (저장된 값으로)
      profile: () => PROFILE, profileStore: Prof.store, deskPet: () => deskPetCtl(),
      dock: () => ({ hidden: dockHidden, visible: app.dock ? app.dock.isVisible() : null, mainWin: !!(mainWin && !mainWin.isDestroyed()) }) }) // dock = A4 Dock 아이콘 (tools/shots_deskpet.js) // deskPet = 바탕화면 펫 (tools/shots_deskpet.js)
      .then((ok) => finish(ok ? 0 : 1), (e) => { console.error('SHOTS ERROR', e && e.stack || e); finish(1); });
  }
}
// ---- 다른 앱이 쓴 생활 기록 다시 읽기 (2026-10-04, 두부 펫도 같은 파일에 씀) ----
// 파일 시각이 바뀌면(1.5초마다 확인) + 창이 앞으로 올 때 화면에 알림 -> js/life_sync.js가 열린 창·입력 중이 아니면 다시 읽고 다시 그림
//   읽기만. 이 앱이 쓴 것도 알림이 가지만 화면이 이미 같은 시각을 갖고 있어 그냥 넘어감
const LIFE_POLL_MS = 1500;
function watchLife(win) {
  const tell = (why) => {
    if (!win || win.isDestroyed()) return;
    let m; try { m = fs.statSync(LIFE_FULL).mtimeMs; } catch (e) { return; }
    win.webContents.send('ph:lifeChanged', { lastModified: m, why });
  };
  fs.watchFile(LIFE_FULL, { interval: LIFE_POLL_MS }, (cur, prev) => { if (cur.mtimeMs !== prev.mtimeMs) tell('file'); });
  watchers.push({ close: () => fs.unwatchFile(LIFE_FULL) });
  win.on('focus', () => tell('focus'));
}
// ---- 바탕화면 펫 (2026-10-13 제작자 결정: 하우스 앱 안에 "바탕화면 펫 켜기", 공용판만, 처음 꺼짐). 코드는 electron/desk_pet.js ----
//   켜짐 = 공용판(PROFILE default) + 온보딩 끝 + profile.json desktopPet true. 제작자 판은 켜지 않음 (설정 화면도 없음, 제작자은 따로 두부 펫 앱을 씀)
//   펫 창이 떠 있으면 집 창을 닫아도 앱이 남음 (펫이 바탕화면에 그대로). 그동안 Dock 아이콘은 숨김 (아래 dockFor, A4 2026-10-14)
let deskPet = null;
// Dock 아이콘 (A4, 2026-10-14 제작자 정함: 집 창을 닫아도 펫 유지, 펫만 떠 있을 땐 Dock 아이콘 숨김). 맥만. 윈도우는 펫 창이 작업 표시줄에 안 나옴(skipTaskbar)이라 할 일 없음
//   집 창이 열리면 보임, 닫혔는데 펫이 떠 있으면 숨김. 숨긴 동안 집 창 다시 열기 = 앱을 한 번 더 열기(Finder·Launchpad·Spotlight -> activate), 끝내기 = 펫 메뉴 "바탕화면 펫 끄기"
//   (Dock이 숨으면 맨 위 메뉴 막대도 안 보여 Cmd+Q가 없음. 펫을 끄면 창이 하나도 없어 앱이 끝남)
let dockHidden = false;
function dockFor(houseOpen) {
  if (process.platform !== 'darwin' || !app.dock) return;
  const petOnly = !houseOpen && !!(deskPet && deskPet.isOn());
  if (petOnly && !dockHidden) { dockHidden = true; app.dock.hide(); }
  else if (!petOnly && dockHidden) { dockHidden = false; Promise.resolve(app.dock.show()).then(() => { if (!SHOTS && mainWin && !mainWin.isDestroyed()) mainWin.focus(); }).catch(() => {}); } // 숨었다 나온 앱은 새 창이 뒤에 뜰 수 있어 앞으로
}
// 보이는 창(집·펫)이 하나도 없으면 앱을 끝냄 (A8 2026-10-14 제작자: 창도 Dock 아이콘도 없이 앱만 남아 있었음).
//   그런 때 = 집 창 없이 펫을 "잠깐 숨기기" / 펫이 숨은 채 집 창 닫기 → 숨은 펫 창이 남아 window-all-closed 가 안 오고, Dock 도 숨어(A4) 끝낼 길이 없었음
//   펫 설정(desktopPet)은 그대로라 다음에 앱을 열면 펫도 다시 나옴
function quitIfNothingVisible() {
  setTimeout(() => { if (!BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && (w.isVisible() || w.isMinimized()))) app.quit(); }, 0); // Dock 으로 내린 집 창도 있는 것으로
}
function petWanted() { return !!(PROFILE && PROFILE.id === 'default' && !PROFILE.onboard && houseOn && PROFILE.user && PROFILE.user.desktopPet === true); }
function deskPetCtl() {
  if (deskPet) return deskPet;
  const fixed = () => (SHOTS && /^\d{4}-\d{2}-\d{2}$/.test(process.env.PH_TODAY || '') ? process.env.PH_TODAY : null);
  deskPet = require(path.join(__dirname, 'desk_pet.js'))({
    app, BrowserWindow, ipcMain, screen, shots: SHOTS, show: process.env.PH_SHOTS_SHOW === '1', hide: SMOKE_HIDE,
    boot: bootData,
    parts: () => (houseOn ? { file: LIFE_FULL, backup, features: FEAT, settings: S, fixedDay: fixed,
      guard: () => { if (SHOTS && !process.env.PH_HOUSE) throw new Error('시험 실행 중에는 실제 생활 기록에 쓰지 않음'); } } : null),
    now: fixed() ? () => new Date(fixed() + 'T12:00:00').getTime() : undefined, // 시험: 기록 날짜를 PH_TODAY로 고정할 때 펫 대화도 그날 낮
    onHidden: () => quitIfNothingVisible(), // 펫 "잠깐 숨기기" (A8)
    onTurnOff: () => { // 펫 메뉴 "바탕화면 펫 끄기" = 설정에서 끈 것과 같음 (profile.json 에서 지움, 열린 집 창 설정 화면에도 알림)
      const u = Prof.turnOffDesktopPet(); if (u) PROFILE.user = u;
      if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('ph:deskPet', { on: false });
      dockFor(!!(mainWin && !mainWin.isDestroyed()));
      quitIfNothingVisible();
    },
  });
  return deskPet;
}
function syncDeskPet(prev) {
  const want = petWanted(), ctl = deskPetCtl();
  if (want && !ctl.isOn()) ctl.start();
  else if (!want && ctl.isOn()) ctl.stop();
  else if (want && prev && prev.pet !== PROFILE.user.pet) ctl.restart(); // 펫을 바꿈 -> 새 그림으로 다시 띄움 (대사도 새로)
  else if (want && prev && (prev.cat !== PROFILE.user.cat || prev.name !== PROFILE.user.name)) ctl.refresh(); // 이름을 바꿈 -> 대사 다시
}
// 온보딩 끝 (electron/profile_main.js): 고른 값으로 설정 묶음을 다시 정하고, 기록 폴더 쓰기 IPC를 열고, 화면을 집으로 다시 엶
function houseReady() {
  PROFILE = Prof.choose(); setProfileEnv();
  HOUSE = PROFILE.dir ? path.resolve(PROFILE.dir) : null;
  if (!HOUSE || PROFILE.onboard) return;
  startHouse();
  if (mainWin && !mainWin.isDestroyed()) { watchLife(mainWin); openPage(mainWin, chooseSet(), null); }
}
// 연기 시험 상태 쓰기 (C5 윈도우 Actions, tools/smoke_win.js): PH_SMOKE_STATE=<파일> 로 켰을 때만 0.3초마다 창·펫 상태를 JSON 으로. 읽기만, 화면·기록엔 손대지 않음
function smokeState() {
  const f = process.env.PH_SMOKE_STATE; if (!f) return;
  const t = setInterval(() => {
    try {
      const wins = BrowserWindow.getAllWindows().map((w) => ({ title: w.getTitle(), visible: w.isVisible(), bounds: w.getBounds() }));
      const st = { at: Date.now(), platform: process.platform, userData: app.getPath('userData'), house: HOUSE, life: LIFE_FULL, houseOn, onboard: !!PROFILE.onboard,
        main: !!(mainWin && !mainWin.isDestroyed()), wins, pet: deskPet && deskPet.isOn() ? deskPet.state() : null, dockHidden };
      fs.writeFileSync(f + '.tmp', JSON.stringify(st)); fs.renameSync(f + '.tmp', f);
    } catch (e) { /* 다음 번에 */ }
  }, 300);
  t.unref();
}
function finish(code) {
  try { if (shotData) fs.rmSync(shotData, { recursive: true, force: true }); } catch (e) {}
  app.exit(code);
}

// ---- 한 번만 실행 (2026-10-02 토리 요청) ----
// 앱과 npm start를 같이 열면 같은 사용자 폴더(방문 기록·사본)를 둘이 쓰게 되고, 물컵 쓰기가 겹칠 수 있음.
// 두 번째로 열면 바로 끄고, 이미 떠 있는 창을 앞으로. (확인 캡처 shots는 따로 만든 임시 사용자 폴더라 서로 안 막음)
let mainWin = null;
const watchers = [];
// 윈도우: 작업 표시줄·알림이 설치한 앱(시작 메뉴 바로 가기)과 같은 앱으로 묶이게 (C1 2026-10-14). 값 = package.json build.appId (NSIS 바로 가기와 같음)
if (process.platform === 'win32') app.setAppUserModelId('app.pixelhouse.desktop');
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.exit(0);
} else {
  app.on('second-instance', () => {
    if (process.env.PH_LOG === '1') console.log('PH second-instance');
    if (!mainWin || mainWin.isDestroyed()) { if (app.isReady()) createWindow(); return; } // 바탕화면 펫만 떠 있을 때 (2026-10-13)
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show(); mainWin.focus(); app.focus({ steal: true });
  });
  // 설정 묶음: 온보딩이 끝났거나 제작자 판이면 바로 집 (쓰기 IPC), 아니면 온보딩 IPC만 -> 끝나면 houseReady
  if (!PROFILE.onboard) startHouse();
  else Prof.registerOnboard({ ipcMain, dialog, getWin: () => mainWin, S, onDone: houseReady });
  Prof.registerFurniture({ ipcMain, onChange: (u) => { if (u && PROFILE.id === 'default') PROFILE.user = u; } }); // 집 꾸미기 (공용판만)
  Prof.registerSettings({ ipcMain, onChange: (u) => { if (u && PROFILE.id === 'default') { const prev = PROFILE.user; PROFILE.user = u; setProfileEnv(); syncDeskPet(prev); } } }); // 설정 화면 (공용판만, 2026-10-08). 바탕화면 펫 켜고 끄기도 (2026-10-13)
  app.whenReady().then(() => { createWindow(); syncDeskPet(null); smokeState(); });
  // 집 창을 닫고 바탕화면 펫만 남았을 때 앱을 한 번 더 열면(Dock 아이콘은 숨어 있음 -> Finder·Launchpad) = 집 창 다시 열기
  app.on('activate', () => { if (app.isReady() && (!mainWin || mainWin.isDestroyed())) createWindow(); });
}
app.on('window-all-closed', () => app.quit()); // 바탕화면 펫 창이 떠 있으면 집 창을 닫아도 여기 안 옴 (펫을 끄면 그때 종료)

// ---- 바로 꺼지기 (2026-10-02 토리 전달: SIGTERM에 몇십 초 걸렸다는 보고) ----
// 지금 코드에서는 재현 안 됨(앱 SIGTERM 0.3초, 앱 종료 요청 0.5초, npm start 0.3초, 둘을 같이 띄운 경우 0.3초).
// 그래도 다시 생기지 않게: 신호를 받으면 정상 종료(app.quit)로 넘기고, 종료가 시작되면 감시 타이머 3초 뒤 강제 종료.
// 파일 감시(개발 모드)는 종료 때 닫는다. 파일 쓰기는 동기식(writeFileSync)이라 쓰는 도중에 끊기지 않음
const QUIT_GRACE_MS = 3000;
let quitTimer = null;
function closeAll() { watchers.splice(0).forEach((w) => { try { w.close(); } catch (e) {} }); }
['SIGTERM', 'SIGINT', 'SIGHUP'].forEach((sig) => process.on(sig, () => app.quit()));
app.on('before-quit', () => {
  closeAll();
  if (!quitTimer) { quitTimer = setTimeout(() => app.exit(0), QUIT_GRACE_MS); quitTimer.unref(); }
});
