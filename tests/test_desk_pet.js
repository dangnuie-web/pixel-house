// 바탕화면 펫 계산 시험 (창 없음, 2026-10-13 비트). 실행: node tests/test_desk_pet.js
//   대사(electron/pet_lines.js: 이름·강아지·제작자 글 없음), 그림(electron/pet_sprites.js), 기록 쓰기(electron/pet_house.js = 하우스 쓰기 모듈 그대로),
//   말풍선 메뉴 흐름(electron/pet_talk.js), 설정 값(electron/profile_main.js desktopPet), 앱에 넣을 파일(package.json build.files·내보내기 목록)
//   실제 생활 기록·사용자 폴더는 안 씀 (임시 폴더만, 끝나면 휴지통)
'use strict';
process.env.PH_PROFILE = 'default';
delete process.env.PH_PROFILE_USER;
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (label, cond, extra) => { if (cond) pass++; else { fail++; console.log('  X ' + label + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); } };
const left = [];
const tmp = (n) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-house-deskpet-' + n + '-')); left.push(d); return d; };

const S = require('../js/data/settings.js');
const LT = require('../js/life_template.js');
const PetLines = require('../electron/pet_lines.js');
const Sprites = require('../electron/pet_sprites.js');
const PetHouse = require('../electron/pet_house.js');
const Talk = require('../electron/pet_talk.js');
const BANDS = S.TIME_BANDS;

(async () => {
  // ---- 1. 대사 ----
  const boot = (user) => ({ id: 'default', bundle: {}, user: Object.assign({ name: '민지' }, user) });
  const cat = PetLines.build(boot({ cat: '나비', pet: 'cat_white' }));
  const dog = PetLines.build(boot({ cat: '콩떡', pet: 'dog_yellow' }));
  const none = PetLines.build({ id: 'default', bundle: {}, user: {} });
  ok('대사: 고양이 = 사용자가 지은 이름(나비)·말끝 냥~', cat.kind === 'cat' && cat.name === '나비' && /냥~/.test(cat.line('click')));
  ok('대사: 강아지 = 지은 이름(콩떡)·말끝 멍~ (하우스 창과 같은 applyPet), 식사 만족도 글도 멍~', dog.kind === 'dog' && dog.name === '콩떡' && /멍~/.test(dog.line('click')) && /멍~/.test(dog.talk.rating) && !/냥~/.test(JSON.stringify(dog.D.idle)));
  ok('대사: 강아지 식사 만족도·양 = 부기 강아지 줄 (말끝만 바뀐 고양이 줄 아님, 괄호 연출 뺌)', dog.talk.rating === '맛있었던 만큼 하트를 채워 주세요멍~' && dog.talk.amount === '얼마나 드셨어요멍~?', dog.talk);
  ok('대사: 고양이 식사 만족도·양 그대로', cat.talk.rating === '마음에 든 만큼 하트를 채워 주세요냥~' && cat.talk.amount === '얼마나 드셨어요냥~?', cat.talk);
  ok('대사: 이름을 안 지었으면 기본 두부', none.name === '두부' && none.kind === 'cat');
  // 모든 시간대·묶음을 여러 번 뽑아 봄: 제작자·토리·괄호 연출·채우지 않은 {user} 없음
  const seen = new Set();
  for (let h = 0; h < 24; h++) for (let i = 0; i < 6; i++) { const d = new Date(2026, 9, 13, h, 0, 0); seen.add(cat.greet(d, BANDS)); }
  for (let i = 0; i < 30; i++) ['lift', 'drop', 'click'].forEach((k) => seen.add(cat.line(k)));
  const all = Array.from(seen);
  ok('대사: 시작 인사·들기·놓기·누르기 다 나옴 (빈 줄 없음)', all.length > 10 && all.every((t) => typeof t === 'string' && t.length > 0), all.length);
  ok('대사: "플레이어"·토리·괄호 연출·{user} 그대로 남은 줄 없음, 이름 자리는 민지', !all.some((t) => /플레이어|토리|\(|\{user\}|\{cat|\{pet/.test(t)) && all.some((t) => t.includes('민지')), all.filter((t) => /플레이어|토리|\(|\{/.test(t)));
  ok('대사: "그냥 같이 있기" 끝 줄 = 하우스 펫 누르기 대사 (토리 줄 없음)', cat.clickLines().length >= 5 && !cat.clickLines().some((x) => typeof x !== 'string' || /토리/.test(x)));
  ok('대사: 메인 전역(PH_LINES)을 건드리지 않음', typeof globalThis.PH_PET_LINES === 'undefined' || !globalThis.PHProfile || globalThis.PHProfile.petApplied === undefined);

  // ---- 2. 그림 ----
  const pm = Sprites.loadPngManifest();
  ok('그림: pet/png 두부 4동작(서기·걷기·말하기·들기) 다 있음', !!pm.man, pm.why);
  const lay = Sprites.pngLayout(pm.man, 109);
  ok('그림: 서 있는 키 109pt에 맞춘 배치 (두부 펫과 같은 계산)', Math.abs(lay.headH - 109) < 0.01 && lay.W > 0 && lay.H >= 109, { headH: lay.headH, W: lay.W, H: lay.H });
  const ui = Sprites.uiSprites();
  ok('그림: 말풍선 아이콘 4개(잠·식사·물·발바닥) + 하트·위장 (공용 그림 묶음에서)', ['meal', 'sleep', 'water', 'idle', 'heart_full', 'heart_empty', 'stomach_25', 'stomach_100'].every((k) => ui[k] && ui[k].frames.length), Object.keys(ui));
  ok('그림: 말주머니 꼬리', !!Sprites.tail());
  // 고른 펫 외형: 4종 = 제작자 챗지피티 그림 pet/png/<펫 id> (2026-10-13, tools/make_pet_sprites.py). 두부와 같은 형식·4동작 다 있음(들어올리기 포함)
  const PETS = require('../js/data/pet_lines.js').PH_PETS;
  const zlib = require('zlib');
  // PNG 한 장을 풀어 알파 칸 수 세기 (RGBA 8비트, 필터 없는 칸만 보지 않고 바이트를 직접 풀어 봄)
  const pngAlpha = (file) => {
    const b = fs.readFileSync(file); let i = 8, w = 0, h = 0, type = 0; const idat = [];
    while (i < b.length) { const n = b.readUInt32BE(i), t = b.toString('latin1', i + 4, i + 8); if (t === 'IHDR') { w = b.readUInt32BE(i + 8); h = b.readUInt32BE(i + 12); type = b[i + 17]; } if (t === 'IDAT') idat.push(b.subarray(i + 8, i + 8 + n)); i += 12 + n; }
    const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = 4, stride = w * bpp, px = Buffer.alloc(h * stride);
    for (let y = 0; y < h; y++) {
      const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = px.subarray(y * stride, (y + 1) * stride), up = y ? px.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? row[x - bpp] : 0, u = up[x], c = x >= bpp ? up[x - bpp] : 0;
        let p = src[x];
        if (f === 1) p += a; else if (f === 2) p += u; else if (f === 3) p += (a + u) >> 1;
        else if (f === 4) { const q = a + u - c, pa = Math.abs(q - a), pb = Math.abs(q - u), pc = Math.abs(q - c); p += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
        row[x] = p & 255;
      }
    }
    let clear = 0, green = 0, mid = 0;
    for (let k = 0; k < px.length; k += 4) { const al = px[k + 3]; if (!al) clear++; else { if (al !== 255) mid++; if (px[k + 1] - Math.max(px[k], px[k + 2]) > 10) green++; } }
    return { w, h, type, clear, green, mid, total: w * h };
  };
  ['cat_cheese', 'cat_black', 'dog_white', 'dog_yellow'].forEach((id) => {
    const dir = Sprites.petDir(id), p = Sprites.loadPngManifest(dir);
    ok('그림: ' + id + ' = pet/png/' + id + ' 4동작(서기 2·걷기 4·말하기 2·들기 2) 다 있음', !!p.man && ['stand', 'walk', 'talk', 'lift'].map((k) => p.man.actions[k].frames.length).join() === '2,4,2,2', p.why);
    if (!p.man) return;
    const L = Sprites.pngLayout(p.man, 109);
    ok('그림: ' + id + ' 서 있는 키 109pt(장끼리 키 차이로 1pt 안), 창 폭 두부와 비슷 (100~160)', Math.abs(L.headH - 109) < 1 && L.W > 100 && L.W < 160, { W: L.W, H: L.H });
    const st = [].concat(...Object.values(p.man.actions).map((a) => a.frames)).map((f) => pngAlpha(path.join(dir, f)));
    ok('그림: ' + id + ' 배경 지움 = 모든 장 RGBA·투명 칸 있음·반투명 칸 0·초록 기운 칸 0', st.every((s) => s.type === 6 && s.clear > s.total * 0.2 && s.mid === 0 && s.green === 0), st.map((s) => [s.clear, s.mid, s.green]).filter((x, i) => !(st[i].clear > st[i].total * 0.2 && !x[1] && !x[2])));
  });
  // 그림을 못 읽을 때만 쓰는 하우스 픽셀 그림 5배 (2026-10-13 임시판, 남겨 둠)
  ok('그림: 픽셀 그림 대신판 그대로 (노란 강아지 5배, 들어올리기만 없음)', (() => { const px = Sprites.pixPet(PETS.dog_yellow.sprite, 109); return px && px.k === 5 && px.missing.join() === 'lift'; })());
  ok('그림: 이상한 펫 id 폴더는 안 읽음', Sprites.petDir('../x') === null && Sprites.loadPngManifest(Sprites.petDir('../x')).man === null);
  ok('그림: 모르는 그림 앞부분이면 null (두부 PNG로)', Sprites.pixPet('nopeM', 109) === null);

  // ---- 3. 기록 쓰기 (하우스 쓰기 모듈 그대로) ----
  const dir = tmp('house'), ud = tmp('userdata');
  const file = path.join(dir, S.LIFE_FILE);
  fs.writeFileSync(file, LT.build(['water']).text);
  const backup = require('../electron/life_backup.js')({ dir: () => path.join(ud, 'backup'), file, keep: 10 });
  const features = { read: () => ({ links: {}, seen: [] }), isSeen: () => false, markSeen: () => null };
  const DAY = '2026-10-13', NOW = new Date(DAY + 'T12:00:00').getTime();
  const H = PetHouse.create({ file, backup, features, settings: S, lines: cat, fixedDay: () => DAY, now: () => NOW });
  ok('기록: 쓰기 함수 = 하우스와 같은 모듈 (물·잠·식사·식사 고치기)', ['ph:setWater', 'ph:setSleep', 'ph:addMeal', 'ph:mealUpdate'].every((c) => H.handlers.includes(c)), H.handlers);
  const v0 = H.read();
  const api = H.makeApi(() => v0);
  const r1 = await api.setWater(1, v0.lastModified);
  ok('기록: 물 한 잔 = 오늘 줄 1/6, 쓰기 전 사본 1개', r1.ok && H.waterOf(fs.readFileSync(file, 'utf8')).n === 1 && fs.readdirSync(path.join(ud, 'backup')).length === 1, r1);
  // 다른 창(하우스)이 그 사이 한 잔 더 씀 -> 펫은 옛 시각으로 씀 -> 새 글의 잔 수에 +1 (두 잔이 아니라 세 잔)
  const other = PetHouse.create({ file, backup, features, settings: S, lines: cat, fixedDay: () => DAY, now: () => NOW });
  await new Promise((r) => setTimeout(r, 20));
  const v1 = other.read(); await other.makeApi(() => v1).setWater(2, v1.lastModified);
  const r2 = await api.setWater(2, r1.lastModified - 5000);
  ok('기록: 읽은 뒤 바뀌었으면 새 글에 +1 다시 적용 (2 -> 3잔)', r2.ok && r2.reapplied && H.waterOf(fs.readFileSync(file, 'utf8')).n === 3, r2);
  const r3 = await api.setSleep('23:30', '07:10', '', H.read().lastModified);
  ok('기록: 잠 적기 (하우스 ## 수면 줄)', r3.ok && /23:30/.test(fs.readFileSync(file, 'utf8')), r3);
  // 시험 안전장치 (guard): 실제 기록 보호
  const G = PetHouse.create({ file, backup, features, settings: S, lines: cat, fixedDay: () => DAY, now: () => NOW, guard: () => { throw new Error('막음'); } });
  let blocked = false; try { await G.makeApi(() => G.read()).setWater(4, G.read().lastModified); } catch (e) { blocked = /막음/.test(e.message); }
  ok('기록: guard가 막으면 쓰지 않음', blocked && H.waterOf(fs.readFileSync(file, 'utf8')).n === 3);

  // ---- 4. 말풍선 메뉴 흐름 (화면 대신 자동 답) ----
  const sent = [];
  let T = null;
  const send = (ch, d) => {
    sent.push([ch, d && d.mode, d && d.text, d && d.choices ? d.choices.map((c) => c.id) : null, d && d.kind, d && d.choices ? d.choices.map((c) => c.icon) : null]);
    if (ch !== 'pet:dlg') return;
    setTimeout(() => {
      if (d.mode === 'ask') { const w = d.choices.find((c) => c.id === 'water') || d.choices[0]; T.answer({ id: d.id, value: w.id }); }
      else T.answer({ id: d.id, value: true });
    }, 5);
  };
  T = Talk.create({ house: H, send, extra: cat.talk, clickLines: () => cat.clickLines(), tellMs: () => 10 });
  const before = H.waterOf(fs.readFileSync(file, 'utf8')).n;
  const out = await T.open({ footer: false });
  const first = sent.find((x) => x[0] === 'pet:dlg' && x[1] === 'ask');
  ok('메뉴: 첫 질문 = 잠·식사·물·그냥 같이 있기 (한마디 없음), 주제 아이콘', first && first[3].slice().sort().join() === 'idle,meal,sleep,water' && first[4] === 'menu' && first[5].every((ic) => ic && ui[ic]), first);
  ok('메뉴: 물 한 잔 고르면 기록 +1, 흐름 저장됨', out && out.saved && H.waterOf(fs.readFileSync(file, 'utf8')).n === before + 1, { out, n: H.waterOf(fs.readFileSync(file, 'utf8')).n });
  ok('메뉴: 펫 대사에 "플레이어" 없음', !sent.some((x) => /플레이어/.test(String(x[2]))));

  // ---- 5. 설정 값 (profile.json desktopPet) ----
  const pud = tmp('profile');
  const app = { getPath: () => pud };
  const Prof = require('../electron/profile_main.js')({ app, ROOT, env: { PH_PROFILE: 'default' } });
  Prof.write({ bundle: 'default', name: '민지', cat: '나비', avatar: 'avatar1', house: 'room1', dir, furniture: {} });
  ok('설정: 처음 = 꺼짐 (profile.json 에 없음)', Prof.read().desktopPet === undefined);
  const H2 = {}; Prof.registerSettings({ ipcMain: { handle: (c, f) => { H2[c] = f; } }, onChange: () => {} });
  const on = H2['ph:profileSet'](null, { key: 'desktopPet', value: true });
  ok('설정: 켜기 = profile.json desktopPet true, 화면에 돌려주는 값에도', on.ok && on.user.desktopPet === true && JSON.parse(fs.readFileSync(Prof.store(), 'utf8')).desktopPet === true, on);
  ok('설정: true/false 말고는 거절', H2['ph:profileSet'](null, { key: 'desktopPet', value: 'yes' }).code === 'bad');
  const offU = Prof.turnOffDesktopPet();
  ok('설정: 펫 메뉴 "바탕화면 펫 끄기" = profile.json 에서 지움, 다른 값 그대로', offU && offU.desktopPet === undefined && offU.cat === '나비' && !('desktopPet' in JSON.parse(fs.readFileSync(Prof.store(), 'utf8'))));
  Prof.write({ bundle: 'player' });
  ok('설정: 제작자 판은 켤 수 없음 (설정 칸 거절, 끄기 함수도 null)', H2['ph:profileSet'](null, { key: 'desktopPet', value: true }).code === 'profile' && Prof.turnOffDesktopPet() === null);

  // ---- 6. 앱에 넣을 파일 ----
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  ok('앱 만들기: build.files 에 pet/** (펫 화면·그림), electron/** (펫 메인 코드)', pkg.build.files.includes('pet/**') && pkg.build.files.includes('electron/**'));
  ok('앱 만들기: build.files 에 portraits/** (대화창 초상 5장, 2026-10-13)', pkg.build.files.includes('portraits/**'));
  ok('대화창 초상: 펫 5종마다 portraits/ 파일 있음 (384px PNG)', Object.values(PETS).every((p) => { const f = path.join(ROOT, 'portraits', p.portrait || ''); return p.portrait && fs.existsSync(f) && fs.readFileSync(f).readUInt32BE(16) === 384; }));
  const exF = path.join(ROOT, 'tools', 'export_public.js'); // 공개 저장소엔 내보내기 도구가 없음 -> 건너뜀 (2026-10-14)
  const ex = fs.existsSync(exF) ? fs.readFileSync(exF, 'utf8') : null;
  if (ex) ok('내보내기: pet·portraits 폴더와 바탕화면 펫 시험이 공개용 목록에 있음', /const DIRS = \[[^\]]*'pet'[^\]]*'portraits'/.test(ex) && ex.includes('tests/test_desk_pet.js') && ex.includes('tests/test_desk_pet_app.js') && ex.includes('tools/shots_deskpet.js'));
  const petFiles = ['pet/index.html', 'pet/pet.js', 'pet/pet.css', 'pet/pixel.js', 'electron/desk_pet.js', 'electron/pet_preload.js', 'electron/pet_lines.js', 'electron/pet_house.js', 'electron/pet_talk.js', 'electron/pet_sprites.js'];
  ok('펫 코드는 바깥 폴더(../dubu-pet·../pixel-office·플레이어오피스)를 읽지 않음', petFiles.every((f) => !/require\([^)]*\.\.\/(dubu-pet|pixel-office)|제작 폴더|PixelHouse|Tori Pet/.test(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')))); // 주석은 빼고 (원고 위치 주석은 내보내기가 바꿈)

  spawnSync('/usr/bin/trash', left, { encoding: 'utf8' });
  console.log(`test_desk_pet: ${pass} 통과, ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  X 시험 멈춤', e && e.stack); spawnSync('/usr/bin/trash', left); process.exit(1); });
