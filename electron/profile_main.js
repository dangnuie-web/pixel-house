// 설정 묶음 고르기 + 첫 실행 온보딩 (메인 프로세스, 2026-10-08 로드맵 4단계). 규칙·묶음 합치기는 js/profile.js
//   저장: 앱 설정 폴더 userData/profile.json
//     제작자 판 = { bundle: 'player' }  /  공용판 = { bundle: 'default', name, avatar, house, dir, furniture: { 자리 id: 그림 이름 }, createdAt }
//   고르는 순서
//     1) 환경변수 PH_PROFILE (시험): 'player' | 'default'
//     2) userData/profile.json
//     3) 제작자 묶음(profiles/player)이 있고 그 기록 파일이 있으면(PH_HOUSE 또는 묶음 houseDir) 제작자 판 -> profile.json 에 적어 둠
//        = 제작자 컴퓨터는 지금처럼 바로 열림 (가장 중요한 시험). 공개 저장소에는 profiles/player 가 없음
//     4) 그 밖 = 공용판 온보딩 (이름 -> 아바타 -> 집 -> 기록 폴더 -> 습관)
//   기록 폴더는 사용자가 폴더 고르기 창에서 고른 곳 또는 기본(~/Documents/PixelHouse)만 받는다 (화면이 아무 경로나 보낼 수 없음)
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const NAME_MAX = 12;
const NAME_BAD = /[|｜\\/<>`*#{}\[\]\u0000-\u001f\u007f\u2028\u2029]/;
const HOUSES = ['room1', 'room2', 'room3']; // 집 목록 (목록형): 원룸·투룸·쓰리룸 (2026-10-08 무늬 공용판투룸쓰리룸 v01, 제작자 지시)
const AVATARS = ['avatar1', 'avatar2', 'avatar3'];
const CAT_DEFAULT = '두부'; // 고양이 이름 기본 (js/profile.js CAT_DEFAULT와 같음)
const SLOT_RE = /^[a-z][a-z0-9_]{0,30}$/, SPRITE_RE = /^[a-z][a-z0-9_]{0,40}$/;
// 설정 화면 (공용판, 2026-10-08 무늬 설정화면 v01 6절): 펫·하우스 이름·숨긴 사이드바 탭. 값 목록은 화면 js/data/pet_lines.js 와 같게
const PETS = ['cat_white', 'cat_cheese', 'cat_black', 'dog_white', 'dog_yellow'];
const PET_DEFAULT_NAME = { cat: '두부', dog: '콩떡' }; // 펫 이름을 비웠을 때 (js/data/pet_lines.js PH_PET_KIND 와 같음. 강아지 = 부기 제안, 제작자 확인 전)
const BRAND_MAX = 10; // 하우스 이름 (무늬 4-2: 사이드바 176px 칸, 부기 임시 20자와 다름 -> 제작자 확인)
const BRAND_DEFAULT = 'Pixel House';
const TAB_IDS = ['habits', 'meetings', 'bucket', 'archive']; // 우리집(home)은 늘 보임

function cleanName(s) {
  if (typeof s !== 'string') return { ok: false, code: 'empty' };
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return { ok: false, code: 'empty' };
  if (NAME_BAD.test(t)) return { ok: false, code: 'bad' };
  if (Array.from(t).length > NAME_MAX) return { ok: false, code: 'tooLong' };
  return { ok: true, name: t };
}
function cleanBrand(s) { // 하우스 이름: 이름과 같은 글자 규칙, BRAND_MAX자
  if (typeof s !== 'string') return { ok: false, code: 'empty' };
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return { ok: false, code: 'empty' };
  if (NAME_BAD.test(t)) return { ok: false, code: 'bad' };
  if (Array.from(t).length > BRAND_MAX) return { ok: false, code: 'tooLong' };
  return { ok: true, name: t };
}
const cleanTabs = (a) => (Array.isArray(a) ? TAB_IDS.filter((t) => a.includes(t)) : []);
function cleanFurniture(f) {
  const out = {};
  if (!f || typeof f !== 'object' || Array.isArray(f)) return out;
  Object.keys(f).slice(0, 40).forEach((k) => { if (SLOT_RE.test(k) && typeof f[k] === 'string' && SPRITE_RE.test(f[k])) out[k] = f[k]; });
  return out;
}
const expand = (p) => (typeof p === 'string' && p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p);

module.exports = function create(o) {
  const { app, ROOT, env } = o;
  const store = () => path.join(app.getPath('userData'), 'profile.json');
  const bundleFile = (id) => path.join(ROOT, 'profiles', id, 'profile.json');
  function loadBundle(id) { try { const v = JSON.parse(fs.readFileSync(bundleFile(id), 'utf8')); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } }
  function read() {
    try {
      const v = JSON.parse(fs.readFileSync(store(), 'utf8'));
      if (!v || typeof v !== 'object') return null;
      if (v.bundle === 'player') return { bundle: 'player' };
      if (v.bundle !== 'default') return null;
      const n = cleanName(v.name);
      if (!n.ok || !AVATARS.includes(v.avatar) || !HOUSES.includes(v.house) || typeof v.dir !== 'string' || !path.isAbsolute(v.dir)) return null;
      const c = cleanName(v.cat); // 고양이 이름 (2026-10-08 3-1단계, 없거나 이상하면 기본 두부 = 안 적음)
      const b = cleanBrand(v.brand), tabs = cleanTabs(v.tabsHidden); // 설정 화면 값 (없으면 안 적음 = 기본)
      return Object.assign({ bundle: 'default', name: n.name, avatar: v.avatar, house: v.house, dir: v.dir, furniture: cleanFurniture(v.furniture), createdAt: v.createdAt || null }, c.ok ? { cat: c.name } : {},
        PETS.includes(v.pet) ? { pet: v.pet } : {}, b.ok ? { brand: b.name } : {}, tabs.length ? { tabsHidden: tabs } : {});
    } catch (e) { return null; }
  }
  function write(v) {
    const f = store(), tmp = f + '.tmp';
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(v, null, 2));
    fs.renameSync(tmp, f);
    return v;
  }
  const lifeRel = (S) => String(S.LIFE_FILE || '').split('/').filter(Boolean);

  // -> { id, bundle, user, dir(기록 폴더, 온보딩이면 null), onboard }
  function choose() {
    const want = env.PH_PROFILE;
    const player = loadBundle('player');
    const asPlayer = () => ({ id: 'player', bundle: player, user: {}, dir: env.PH_HOUSE ? path.resolve(env.PH_HOUSE) : expand(player.houseDir), onboard: false });
    const asDefault = (u) => ({ id: 'default', bundle: loadBundle('default') || {}, user: u || {}, dir: env.PH_HOUSE ? path.resolve(env.PH_HOUSE) : (u && u.dir) || null, onboard: !u });
    if (want === 'player' && player) return asPlayer();
    const saved = read();
    if (want === 'default') return asDefault(saved && saved.bundle === 'default' ? saved : null);
    if (saved && saved.bundle === 'player' && player) return asPlayer();
    if (saved && saved.bundle === 'default') return asDefault(saved);
    if (player) {
      const dir = env.PH_HOUSE ? path.resolve(env.PH_HOUSE) : expand(player.houseDir);
      const life = (((player.patch || {}).PH_SETTINGS || {}).LIFE_FILE || '').split('/').filter(Boolean);
      if (dir && life.length && fs.existsSync(path.join(dir, ...life))) { try { write({ bundle: 'player', savedAt: new Date().toISOString() }); } catch (e) { /* 못 적어도 이번엔 제작자 판 */ } return asPlayer(); }
    }
    return asDefault(null);
  }

  // ---- 온보딩 (공용판 첫 실행) ----
  // onDone(user) = 메인이 집을 열기 (IPC 등록 + 화면 다시 열기). S = settings (LIFE_FILE)
  function registerOnboard({ ipcMain, dialog, getWin, S, onDone }) {
    const defaultDir = env.PH_DEFAULT_DIR ? path.resolve(env.PH_DEFAULT_DIR) : path.join(app.getPath('documents'), 'PixelHouse');
    const allowed = new Set([defaultDir]);
    function folderInfo(dir) {
      const file = path.join(dir, ...lifeRel(S));
      let exists = false; try { exists = fs.statSync(file).isFile(); } catch (e) { exists = false; }
      return { dir, file: path.basename(file), found: exists, isDefault: dir === defaultDir };
    }
    ipcMain.handle('ph:onboardInfo', () => ({ ok: true, defaultDir, folder: folderInfo(defaultDir), houses: HOUSES, avatars: AVATARS, nameMax: NAME_MAX }));
    ipcMain.handle('ph:onboardCheckName', (e, name) => cleanName(name));
    // 폴더 고르기 창 (시험은 PH_PICK_DIR 로 고른 것처럼)
    ipcMain.handle('ph:onboardPickFolder', async () => {
      let dir = null;
      if (env.PH_SHOTS === '1') dir = env.PH_PICK_DIR ? path.resolve(env.PH_PICK_DIR) : null;
      else {
        const r = await dialog.showOpenDialog(getWin(), { title: '기록 폴더 고르기', defaultPath: fs.existsSync(defaultDir) ? defaultDir : app.getPath('documents'), properties: ['openDirectory', 'createDirectory'] });
        dir = r.canceled || !r.filePaths || !r.filePaths[0] ? null : r.filePaths[0];
      }
      if (!dir) return { ok: false, canceled: true };
      allowed.add(dir);
      return Object.assign({ ok: true }, folderInfo(dir));
    });
    // 끝: 폴더 확인 -> (기록 파일이 없으면) 빈 틀 + 고른 습관 -> profile.json -> 집 열기
    ipcMain.handle('ph:onboardFinish', async (e, req) => {
      const r = req || {}, n = cleanName(r.name);
      if (!n.ok) return { ok: false, code: 'name:' + n.code };
      if (!AVATARS.includes(r.avatar)) return { ok: false, code: 'avatar' };
      if (!HOUSES.includes(r.house)) return { ok: false, code: 'house' };
      if (typeof r.dir !== 'string' || !allowed.has(r.dir)) return { ok: false, code: 'dir' };
      const dir = r.dir, file = path.join(dir, ...lifeRel(S));
      let made = false, added = [], skipped = [];
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        if (!fs.existsSync(file)) {
          const LT = require(path.join(ROOT, 'js', 'life_template.js'));
          const b = LT.build(Array.isArray(r.habits) ? r.habits : []);
          fs.writeFileSync(file, b.text, { flag: 'wx' }); // 없을 때만 (사이에 생겼으면 덮지 않음)
          made = true; added = b.added; skipped = b.skipped;
        }
        fs.accessSync(file, fs.constants.R_OK | fs.constants.W_OK);
      } catch (err) { return { ok: false, code: 'folder', message: String(err && err.message || err) }; }
      const c = r.cat == null || (typeof r.cat === 'string' && !r.cat.trim()) ? { ok: true, name: CAT_DEFAULT } : cleanName(r.cat); // 고양이 이름: 비우면 기본 두부 (같은 글자 규칙)
      if (!c.ok) return { ok: false, code: 'cat:' + c.code };
      const user = { bundle: 'default', name: n.name, cat: c.name, avatar: r.avatar, house: r.house, dir, furniture: {}, createdAt: new Date().toISOString() };
      write(user);
      setTimeout(() => onDone(read()), 30); // 답을 먼저 보내고 화면을 다시 엶
      return { ok: true, made, added, skipped, file: path.basename(file) };
    });
  }

  // ---- 집 꾸미기 (가): 정해진 자리마다 고른 그림 (공용판만) ----
  function registerFurniture({ ipcMain, onChange }) {
    ipcMain.handle('ph:furnitureSet', (e, req) => {
      const v = read(); if (!v || v.bundle !== 'default') return { ok: false, code: 'profile' };
      const slot = req && req.slot, sprite = req && req.sprite;
      if (!SLOT_RE.test(String(slot)) || !SPRITE_RE.test(String(sprite))) return { ok: false, code: 'bad' };
      v.furniture = Object.assign({}, v.furniture, { [slot]: sprite });
      write(v);
      if (onChange) onChange(read());
      return { ok: true, furniture: v.furniture };
    });
  }

  // ---- 설정 화면 (공용판만): 칸 하나씩 바로 저장 (무늬 설정화면 v01: 저장 버튼 없음) ----
  //   req = { key: 'pet' | 'cat' | 'brand' | 'avatar' | 'house' | 'tabsHidden', value }. 이름을 비우면 기본값(펫 이름 = 그 종류 기본, 하우스 = Pixel House)
  function registerSettings({ ipcMain, onChange }) {
    ipcMain.handle('ph:profileSet', (e, req) => {
      const v = read(); if (!v || v.bundle !== 'default') return { ok: false, code: 'profile' };
      const key = req && req.key, val = req && req.value;
      if (key === 'pet') { if (!PETS.includes(val)) return { ok: false, code: 'bad' }; v.pet = val; }
      else if (key === 'cat') {
        const kind = String(v.pet || 'cat_white').split('_')[0];
        const c = typeof val === 'string' && !val.trim() ? { ok: true, name: PET_DEFAULT_NAME[kind] || '두부' } : cleanName(val);
        if (!c.ok) return { ok: false, code: c.code, max: NAME_MAX }; v.cat = c.name;
      } else if (key === 'brand') {
        const b = typeof val === 'string' && !val.trim() ? { ok: true, name: BRAND_DEFAULT } : cleanBrand(val);
        if (!b.ok) return { ok: false, code: b.code, max: BRAND_MAX };
        if (b.name === BRAND_DEFAULT) delete v.brand; else v.brand = b.name;
      } else if (key === 'avatar') { if (!AVATARS.includes(val)) return { ok: false, code: 'bad' }; v.avatar = val; }
      else if (key === 'house') { if (!HOUSES.includes(val)) return { ok: false, code: 'bad' }; v.house = val; }
      else if (key === 'tabsHidden') { const t = cleanTabs(val); if (t.length) v.tabsHidden = t; else delete v.tabsHidden; }
      else return { ok: false, code: 'key' };
      write(v);
      const u = read();
      if (onChange) onChange(u);
      return { ok: true, user: { pet: u.pet || 'cat_white', cat: u.cat || '', brand: u.brand || BRAND_DEFAULT, avatar: u.avatar, house: u.house, tabsHidden: u.tabsHidden || [] } };
    });
  }

  return { choose, read, write, store, loadBundle, registerOnboard, registerFurniture, registerSettings, cleanName, cleanBrand, cleanFurniture, HOUSES, AVATARS, PETS, BRAND_MAX, NAME_MAX };
};
