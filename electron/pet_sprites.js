// 바탕화면 펫 그림 (2026-10-13, 두부 펫 lib/sprites.js를 옮겨 옴): pet/png (sprites.json + <동작>_<번호>.png) 읽기와 화면 배치 계산
//   흰 고양이(두부) PNG = pet/png 맨 위 11개. 이 자리 하나만 있음 (2026-10-14 A3): 제작자 두부 펫(~/dev/dubu-pet)도 여기서 읽고, 두부 그림 다시 만들기(dubu-pet npm run sprites)도 여기에 씀. 4종은 pet/png/<펫> (tools/make_pet_sprites.py)
//   그림: 흰 고양이 = pet/png (두부), 4종 = pet/png/<펫 id> (같은 형식, tools/make_pet_sprites.py 2026-10-13)
//   말풍선 그림: 펫 아이콘 4개·꼬리 = pet/ui (무늬 두부 펫 말풍선메뉴 디자인 v01), 하트·위장 = 공용 집 그림 묶음 js/assets_rooms.js (앱에 들어가는 파일, 읽기만)
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const PNG_DIR = path.join(ROOT, 'pet', 'png');
const UI_DIR = path.join(ROOT, 'pet', 'ui');
const PNG_NEED = ['stand', 'walk', 'talk', 'lift'];

// sprites.json 읽고 파일이 다 있는지 확인. 하나라도 없거나 깨졌으면 man: null + 이유
// 펫 id 그림 폴더 (cat_cheese 같은 영어 소문자·밑줄만)
const petDir = (id) => (/^[a-z]+_[a-z]+$/.test(String(id)) ? path.join(PNG_DIR, id) : null);
function loadPngManifest(dir) {
  if (dir === null) return { man: null, why: '펫 id 이상함' };
  dir = dir || PNG_DIR;
  let man;
  try { man = JSON.parse(fs.readFileSync(path.join(dir, 'sprites.json'), 'utf8')); } catch (e) { return { man: null, why: 'sprites.json 없음' }; }
  for (const k of PNG_NEED) {
    const a = man.actions && man.actions[k];
    if (!a || !Array.isArray(a.frames) || !a.frames.length) return { man: null, why: k + ' 없음' };
    for (const f of a.frames) if (!/^[a-z]+_\d+\.png$/.test(f) || !fs.existsSync(path.join(dir, f))) return { man: null, why: f + ' 없음' };
  }
  return { man, why: null };
}
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
// 화면 배치 (CSS px). 서 있기 키(가운데값)를 standPt에 맞춘 배율 k 하나를 모든 동작에 쓴다 (시트 해상도 보정 norm만 곱함)
// 돌려줌: { k, W, H, headH, place: {동작: {s, x, y, w, h, facing}} }  - 그림 캔버스 왼쪽 위를 (x, y)에 s배로
function pngLayout(man, standPt) {
  const st = man.actions.stand;
  const k = standPt / median(st.heights);
  const A = man.actions;
  const place = {};
  let W = 0, H = 0;
  for (const name of Object.keys(A)) {
    const a = A[name]; const s = k * (a.norm || 1);
    W = Math.max(W, a.contentW * s);
    if (a.anchor === 'foot') H = Math.max(H, (a.line - a.top) * s);
    else H = Math.max(H, (a.bottom - a.line) * s); // 머리 위 기준(들어올리기)도 캔버스 안에 다 들어가게 (2026-10-13: 강아지 들기 그림이 서기보다 커서 위가 17px 잘렸음. 두부는 캔버스 1px 커짐, 발 자리 그대로)
  }
  W = Math.ceil(W) + 2; H = Math.ceil(H) + 1;
  const headH = (st.line - st.top) * k;     // 서 있기 머리 위 ~ 발바닥
  for (const name of Object.keys(A)) {
    const a = A[name]; const s = k * (a.norm || 1);
    const x = W / 2 - a.cx * s;
    let y;
    if (a.anchor === 'foot') y = H - a.line * s;
    else { // 머리 위 기준: 서 있기 머리 위와 같은 높이. 아래가 칸 밖으로 나가면 올림
      y = (H - headH) - a.line * s;
      const bottom = y + a.bottom * s;
      if (bottom > H) y -= bottom - H;
    }
    place[name] = { s, x, y, w: a.w * s, h: a.h * s, facing: a.facing, n: a.frames.length };
  }
  return { k, W, H, headH, place };
}
// 그림 파일을 data URL로 (화면 쪽은 파일을 직접 못 읽게 두고, 캔버스가 오염되지 않게)
function pngData(man, dir) {
  dir = dir || PNG_DIR;
  const out = {};
  for (const name of Object.keys(man.actions)) out[name] = man.actions[name].frames.map((f) => 'data:image/png;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64'));
  return out;
}
const okSprite = (a) => (a && a.palette && Array.isArray(a.frames) && a.frames.length ? { palette: a.palette, frames: a.frames } : null);
function readSprite(file) { try { return okSprite(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (e) { return null; } }
// 말주머니 꼬리: 무늬 두부 펫 꼬리 v01 (9x5, 2배, 크림 + 먹선)
function tail() { return readSprite(path.join(UI_DIR, '20261004_dubu-pet_tail_v01.json')); }
const PET_UI = { meal: 'icon_meal', sleep: 'icon_sleep', water: 'icon_water', idle: 'icon_paw' }; // 2026-10-13 오늘 한마디(note) 뺌
const HOUSE_UI = ['heart_full', 'heart_empty', 'stomach_25', 'stomach_50', 'stomach_75', 'stomach_100'];
// 공용 집 그림 묶음(js/assets_rooms.js room1: 앱에 들어가는 파일). 화면처럼 따로 된 판에서 읽어 메인 전역을 건드리지 않음
let roomSet = null;
function houseSet() {
  if (roomSet) return roomSet;
  try {
    const c = {}; c.window = c; vm.createContext(c);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'assets_rooms.js'), 'utf8'), c, { filename: 'assets_rooms.js' });
    const sets = c.PH_ASSET_SETS || {};
    roomSet = JSON.parse(JSON.stringify(sets.room1 || sets[Object.keys(sets)[0]] || {}));
  } catch (e) { roomSet = {}; }
  return roomSet;
}
// 하트·위장
function houseUi() {
  const set = houseSet(), out = {};
  HOUSE_UI.forEach((k) => { const s = okSprite(set[k]); if (s) out[k] = s; });
  return out;
}

// ---- 고른 펫 외형 (2026-10-13 토리 정정: 바탕화면 펫도 사용자가 고른 펫을 따름) ----
//   (2026-10-13 4종 PNG가 들어와 이건 그림을 못 읽을 때만 씀) 흰 고양이(cat_white) = 두부 PNG 그림 (pet/png). 나머지 4종 = 하우스 픽셀 그림 {앞부분}_* (20x22, 무늬 2026-10-08 v01)
//   하우스 그림에 있는 것만 씀 (억지로 만들지 않음):
//     서기 = {p}_idle (2장, 500ms 반복: 하우스 대기와 같음) / 걷기 = {p}_walk_left·walk_right (3장 [0,1,2,1], 하우스와 같음)
//     말하기 = {p}_greet (하우스도 펫이 말주머니를 띄울 때 greet 자세, js/game.js talk) / 들어올리기 = 없음 -> 서기 그림 (무늬에게 넘길 목록)
//   크기: 정수 배율 (서 있는 키가 STAND_PT에 가장 가깝게, 픽셀 그대로)
const PIX_ACTIONS = { stand: 'idle', walk_left: 'walk_left', walk_right: 'walk_right', talk: 'greet', lift: null };
const PIX_MISSING = Object.keys(PIX_ACTIONS).filter((k) => !PIX_ACTIONS[k]); // ['lift']
function pixPet(prefix, standPt) {
  const set = houseSet(), out = {};
  for (const [a, n] of Object.entries(PIX_ACTIONS)) { if (!n) continue; const sp = okSprite(set[prefix + '_' + n]); if (sp) out[a] = sp; }
  if (!out.stand || !out.walk_left || !out.walk_right) return null;
  const fr = out.stand.frames[0], pal = out.stand.palette, w = fr[0].length, h = fr.length;
  const solid = (row) => Array.from(row).some((ch) => pal[ch] != null && pal[ch] !== 'transparent');
  let top = 0, bot = 0; // top = 서기 첫 장 머리 위 줄, bot = 모든 장 중 가장 아래 칠한 줄 (발바닥 = 창 아래)
  while (top < h - 1 && !solid(fr[top])) top++;
  for (const a of Object.keys(out)) for (const f of out[a].frames) f.forEach((row, y) => { if (solid(row)) bot = Math.max(bot, y); });
  const k = Math.max(1, Math.round(standPt / (bot - top + 1)));
  const W = w * k + 2, H = (bot + 1) * k, headH = (bot - top + 1) * k;
  const place = {};
  for (const a of Object.keys(out)) place[a] = { s: k, x: 1, y: 0, w: w * k, h: h * k, facing: a === 'walk_left' ? 'left' : a === 'walk_right' ? 'right' : 'front', n: out[a].frames.length };
  return { prefix, k, layout: { k, W, H, headH, place }, sprites: out, missing: PIX_MISSING.slice() };
}
// 돌려줌 { 이름: { palette, frames } } (읽은 것만. 없는 그림은 화면에서 글자만)
function uiSprites() {
  const out = {};
  for (const [k, n] of Object.entries(PET_UI)) { const s = readSprite(path.join(UI_DIR, '20261004_dubu-pet_' + n + '_v01.json')); if (s) out[k] = s; }
  return Object.assign(out, houseUi());
}

module.exports = { petDir, pixPet, PIX_ACTIONS, PIX_MISSING, loadPngManifest, pngLayout, pngData, tail, uiSprites, PET_UI, HOUSE_UI, PNG_DIR, PNG_NEED, median };
