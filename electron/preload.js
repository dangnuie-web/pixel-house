// 화면 쪽에 함수 몇 개만 넘긴다 (Node 기능은 넘기지 않음). 경로 검사·쓰기 제한은 main.js
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// 설정 묶음 (2026-10-08, electron/profile_main.js bootData): 화면 스크립트보다 먼저 동기로 받아 둠 -> js/profile.js
//   { id: 'player' | 'default', bundle: 묶음 대사·설정, onboard: 첫 실행인지, user: { name, avatar, house, furniture } } (기록 폴더 경로는 안 넘김)
//   주소에 pb=1이 있을 때만 묻는다: 이 묶음 코드 전의 메인(이미 떠 있던 앱)에는 받는 곳이 없어 sendSync가 화면을 멈추게 함 (2026-10-08 확인)
let boot = {};
try { if (/[?&]pb=1(&|$)/.test(location.search)) boot = ipcRenderer.sendSync('ph:profileSync') || {}; } catch (e) { boot = {}; }
contextBridge.exposeInMainWorld('PHProfileBoot', boot);
// 첫 실행 온보딩·집 꾸미기 (electron/profile_main.js). 폴더는 고르기 창에서 고른 것·기본 폴더만 받음
contextBridge.exposeInMainWorld('PHOnboardDesktop', {
  info: () => ipcRenderer.invoke('ph:onboardInfo'),
  checkName: (name) => ipcRenderer.invoke('ph:onboardCheckName', name),
  pickFolder: () => ipcRenderer.invoke('ph:onboardPickFolder'),
  finish: (req) => ipcRenderer.invoke('ph:onboardFinish', req), // req = { name, cat(고양이 이름, 2026-10-08), avatar, house, dir, habits }
  setFurniture: (slot, sprite) => ipcRenderer.invoke('ph:furnitureSet', { slot, sprite }),
  setProfile: (key, value) => ipcRenderer.invoke('ph:profileSet', { key, value }), // 설정 화면 (공용판): pet·cat·brand·avatar·house·tabsHidden 하나씩
});
contextBridge.exposeInMainWorld('PHDesktop', {
  read: (rel) => ipcRenderer.invoke('ph:read', rel), // 하우스 폴더 안 .md -> { text, lastModified }
  // 물 칸 쓰기: 오늘 물을 value잔으로. 경로를 보낼 수 없음 (파일 = settings.LIFE_FILE, 날짜 = 오늘, 메인이 정함)
  //   lastModified = 화면이 읽은 시각. 그 뒤 파일이 바뀌었으면 { conflict: true, text } (쓰지 않음)
  setWater: (value, lastModified) => ipcRenderer.invoke('ph:setWater', { value, lastModified }),
  // 생활 기록 파일이 바뀜(다른 앱 = 두부 펫이 씀, 또는 창이 앞으로 옴) 알림 { lastModified, why }. 받는 곳 js/life_sync.js (2026-10-04)
  onLifeChanged: (cb) => { ipcRenderer.on('ph:lifeChanged', (e, d) => cb({ lastModified: Number(d && d.lastModified), why: String(d && d.why) })); },
  // 그림 세트 (v10 중간 / v08 자세히 / v09 굵게): 목록·지금 값, 바꾸기(resume = 지금 자리), 메뉴에서 고른 값 받기
  artSets: () => ipcRenderer.invoke('ph:artSets'),
  setArtSet: (set, resume) => ipcRenderer.invoke('ph:setArtSet', { set, resume }),
  onMenuArtSet: (cb) => { ipcRenderer.on('ph:menuArtSet', (e, set) => cb(String(set))); },
  // 두부 대화창 쓰기 (electron/life_log_ipc.js). 파일·섹션·날짜는 메인이 정함. 값과 읽은 시각만 보냄
  setSleep: (bed, wake, memo, lastModified) => ipcRenderer.invoke('ph:setSleep', { bed, wake, memo, lastModified }),
  // 잠 칠하기: from('YYYY-MM-DD HH:MM')부터 hours시간 창 안 잠을 segments로 통째로 바꿈 (js/life_log.js setSleepWindow, 창 밖·다른 줄은 그대로)
  //   dropOpen = 같이 지울 "잔 시각만" 줄의 시각 목록 (없어도 됨, 2026-10-09)
  setSleepWindow: (from, hours, segments, lastModified, dropOpen) => ipcRenderer.invoke('ph:setSleepWindow', { from, hours, segments, lastModified, dropOpen }),
  addMeal: (kind, text, lastModified) => ipcRenderer.invoke('ph:addMeal', { kind, text, lastModified }),
  setNote: (text, lastModified, fix, mood) => ipcRenderer.invoke('ph:setNote', { text, lastModified, fix: fix === true, mood: typeof mood === 'string' ? mood : null }), // mood = 기분 4칸 (interact)
  // 생활 습관 체크 (electron/life_check_ipc.js). 파일·날짜·주는 메인이 정함
  //   toggleWeekly: 주 N회 습관 오늘 했음/안 했음 뒤집기 / addAmount: 기록 습관 양 (mode 'add' 더하기 | 'set' 바꾸기)
  //   setSafetyCheck: 안전장치 이번 주 확인 (week = 화면이 본 주 월요일, result 'good' | 'missed')
  toggleWeekly: (habit, lastModified) => ipcRenderer.invoke('ph:toggleWeekly', { habit, lastModified }),
  addAmount: (habit, value, mode, lastModified) => ipcRenderer.invoke('ph:addAmount', { habit, value, mode, lastModified }),
  setSafetyCheck: (week, item, result, lastModified) => ipcRenderer.invoke('ph:setSafetyCheck', { week, item, result, lastModified }),
});
// 공부 간트 쓰기 (study 브랜치 2026-10-03, electron/study_ipc.js). 파일·섹션·오늘 날짜는 메인이 정함. 이름·값·읽은 시각만 보냄
contextBridge.exposeInMainWorld('PHStudyDesktop', {
  add: (name, start, memo, lastModified) => ipcRenderer.invoke('ph:studyAdd', { name, start, memo, lastModified }),
  update: (name, patch, lastModified) => ipcRenderer.invoke('ph:studyUpdate', { name, patch, lastModified }), // patch = { start, end, memo, newName }
  archive: (name, lastModified) => ipcRenderer.invoke('ph:studyArchive', { name, lastModified }),           // ## 공부 보관으로 옮김
  restore: (name, lastModified) => ipcRenderer.invoke('ph:studyRestore', { name, lastModified }),           // 보관에서 되돌리기
  logToday: (name, add, lastModified) => ipcRenderer.invoke('ph:studyLog', { name, add, lastModified }),    // 오늘 add(1 / -1)시간
  // [추가 | 수정] 창 한 번 저장 (2026-10-08 3-1단계): q = { mode: add|edit, name(edit: 지금 이름), study: { name, start, end, memo }, plans: [{ sig?, part, from, to }], removed: [sig] }
  save: (q, lastModified) => ipcRenderer.invoke('ph:studySave', Object.assign({}, q, { lastModified })),
  movePlan: (sig, from, to, lastModified) => ipcRenderer.invoke('ph:planMove', { sig, from, to, lastModified }), // 세부 계획 막대 끌기 (피드백 2): 그 줄 기간만
});
// 옷 갈아입기 차림 (wardrobe 브랜치 2026-10-03, electron/outfit_ipc.js). 파일 = 앱 설정 폴더 outfit.json (메인이 정함). 차림 값만 보냄
contextBridge.exposeInMainWorld('PHOutfitDesktop', {
  get: () => ipcRenderer.invoke('ph:outfitGet'),       // -> { ok, outfit: { top, bottom, outer, bag, hat, onepiece } | null }
  set: (outfit) => ipcRenderer.invoke('ph:outfitSet', outfit),
});
// 독서 책꽂이 쓰기 (journal 브랜치 2026-10-03, electron/book_ipc.js). 파일·섹션·오늘 날짜는 메인이 정함. 책 값·읽은 시각만 보냄
//   key = { date, title } (책 하나 = 같은 날 같은 제목은 하나), book/patch = { date, title, color, summary }
contextBridge.exposeInMainWorld('PHBookDesktop', {
  add: (book, lastModified) => ipcRenderer.invoke('ph:bookAdd', { book, lastModified }),
  update: (key, patch, lastModified) => ipcRenderer.invoke('ph:bookUpdate', { key, patch, lastModified }),
  archive: (key, lastModified) => ipcRenderer.invoke('ph:bookArchive', { key, lastModified }),  // ## 독서 보관으로 옮김
  restore: (key, lastModified) => ipcRenderer.invoke('ph:bookRestore', { key, lastModified }),  // 보관에서 되돌리기
});
// 살림 쓰기 (2026-10-03, electron/household_ipc.js). 파일·섹션·오늘 날짜는 메인이 정함. 바꾸기 값·읽은 시각만 보냄
//   inv: { type: qty|need|add|remove|restore|color, cat, name, ... } / shop: { type: add|bought, name } / chore: 청소 습관 이름 (오늘 했음/안 했음 뒤집기)
contextBridge.exposeInMainWorld('PHHouseDesktop', {
  inv: (op, lastModified) => ipcRenderer.invoke('ph:invOp', { op, lastModified }),
  shop: (op, lastModified) => ipcRenderer.invoke('ph:shopOp', { op, lastModified }),
  chore: (habit, lastModified) => ipcRenderer.invoke('ph:choreToggle', { habit, lastModified }),
});
// 습관 편집·공부 완전 삭제 (2026-10-04, electron/habit_ipc.js). 파일·섹션·오늘 날짜는 메인이 정함. 이름·값·읽은 시각만 보냄
//   habit = { kind, name, target, cycle: { per: day|week|month, n } }, patch = { newName, target, cycle }, before·raw = 되돌리기 때 원래 자리·글자
contextBridge.exposeInMainWorld('PHHabitDesktop', {
  addHabit: (habit, lastModified, before, raw) => ipcRenderer.invoke('ph:habitAdd', { habit, lastModified, before, raw }),
  updateHabit: (name, patch, lastModified) => ipcRenderer.invoke('ph:habitUpdate', { name, patch, lastModified }),
  removeHabit: (name, lastModified) => ipcRenderer.invoke('ph:habitRemove', { name, lastModified }),
  moveHabit: (name, dir, lastModified) => ipcRenderer.invoke('ph:habitMove', { name, dir, lastModified }), // dir -1 위로, 1 아래로 (같은 종류 안)
  removeStudy: (name, lastModified) => ipcRenderer.invoke('ph:studyRemove', { name, lastModified }),       // ## 공부에서 완전히 빼기 (보관함 아님)
  unremoveStudy: (row, before, raw, lastModified) => ipcRenderer.invoke('ph:studyUnremove', { row, before, raw, lastModified }), // 완전 삭제 되돌리기
  setDaily: (habit, value, lastModified) => ipcRenderer.invoke('ph:habitSetDaily', { habit, value, lastModified }), // 매일 n회 습관 오늘 value/n
});
// 약속 쓰기 (2026-10-07, electron/meeting_ipc.js). 파일·섹션은 메인이 정함. 약속 값·고를 줄 글·읽은 시각만 보냄
//   meeting/patch = { date: 'YYYY-MM-DD', time: '7pm' | '', text }, key = { sig: 읽은 그 줄 글 }, before·raw = 되돌리기 때 원래 자리·글자
contextBridge.exposeInMainWorld('PHMeetingDesktop', {
  add: (meeting, lastModified, before, raw) => ipcRenderer.invoke('ph:meetingAdd', { meeting, lastModified, before, raw }),
  update: (key, patch, lastModified, raw) => ipcRenderer.invoke('ph:meetingUpdate', { key, patch, lastModified, raw }),
  remove: (key, lastModified) => ipcRenderer.invoke('ph:meetingRemove', { key, lastModified }),
});
// 기록 넓히기 (2026-10-08, electron/record_ipc.js). 파일·섹션·오늘 날짜는 메인이 정함. 값·고를 줄 글(sig)·읽은 시각만 보냄
//   before·raw = 지우기·고치기 되돌리기 때 원래 자리·글자
contextBridge.exposeInMainWorld('PHRecordDesktop', {
  add: (record, lastModified, before, raw) => ipcRenderer.invoke('ph:recordAdd', { record, lastModified, before, raw }), // record = { kind, date, title, summary }
  update: (sig, record, lastModified, raw) => ipcRenderer.invoke('ph:recordUpdate', { sig, record, lastModified, raw }),
  remove: (sig, lastModified) => ipcRenderer.invoke('ph:recordRemove', { sig, lastModified }),
  kindAdd: (name, lastModified, before, raw) => ipcRenderer.invoke('ph:recordKindAdd', { name, lastModified, before, raw }),
  kindRemove: (name, lastModified) => ipcRenderer.invoke('ph:recordKindRemove', { name, lastModified }),
});
contextBridge.exposeInMainWorld('PHBucketDesktop', {
  add: (text, lastModified, before, raw) => ipcRenderer.invoke('ph:bucketAdd', { text, lastModified, before, raw }),
  done: (sig, done, lastModified) => ipcRenderer.invoke('ph:bucketDone', { sig, done, lastModified }),
  edit: (sig, text, lastModified, raw) => ipcRenderer.invoke('ph:bucketEdit', { sig, text, lastModified, raw }),
  remove: (sig, lastModified) => ipcRenderer.invoke('ph:bucketRemove', { sig, lastModified }),
});
contextBridge.exposeInMainWorld('PHStudyPartDesktop', {
  add: (subject, part, lastModified, before, raw) => ipcRenderer.invoke('ph:partAdd', { subject, part, lastModified, before, raw }),
  rename: (sig, part, lastModified) => ipcRenderer.invoke('ph:partRename', { sig, part, lastModified }),
  remove: (sig, lastModified) => ipcRenderer.invoke('ph:partRemove', { sig, lastModified }),
  toggle: (subject, part, date, lastModified) => ipcRenderer.invoke('ph:partToggle', { subject, part, date, lastModified }),
});
// 대변 관찰 일지·식사 일지 (logs 브랜치 2026-10-04, electron/logs_ipc.js). 파일·섹션·오늘 날짜는 메인이 정함. 기록 값·읽은 시각만 보냄
//   entry/patch: 대변 { date, time, form, amount, color, memo } / 식사 { date, time, kind, menu, rating, amount, memo }. key = { sig: 읽은 그 줄 글 }
// 가구 연결·일지 기능 표시 (2026-10-04, electron/furnish_ipc.js). 파일 = 앱 설정 폴더 features.json (메인이 정함). 가구 key·기능 id만 보냄
contextBridge.exposeInMainWorld('PHFurnishDesktop', {
  get: () => ipcRenderer.invoke('ph:featuresGet'),                          // -> { links, seen }
  setLinks: (links) => ipcRenderer.invoke('ph:featuresSetLinks', { links }), // 사용자 연결표 통째로 (js/features.js setLink로 만든 것)
  reset: () => ipcRenderer.invoke('ph:featuresReset'),                      // 기본으로 되돌리기
  hide: (id) => ipcRenderer.invoke('ph:featuresHide', { id }),              // 화면에만 보이던 일지 기능 줄 끄기
});
contextBridge.exposeInMainWorld('PHLogsDesktop', {
  addPoop: (entry, lastModified) => ipcRenderer.invoke('ph:poopAdd', { entry, lastModified }),
  updatePoop: (key, patch, lastModified) => ipcRenderer.invoke('ph:poopUpdate', { key, patch, lastModified }),
  removePoop: (key, lastModified) => ipcRenderer.invoke('ph:poopRemove', { key, lastModified }),
  addMeal2: (entry, lastModified) => ipcRenderer.invoke('ph:mealAdd', { entry, lastModified }),
  updateMeal: (key, patch, lastModified) => ipcRenderer.invoke('ph:mealUpdate', { key, patch, lastModified }),
  removeMeal: (key, lastModified) => ipcRenderer.invoke('ph:mealRemove', { key, lastModified }),
});
