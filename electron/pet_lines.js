// 바탕화면 펫 대사 (2026-10-13 비트). 하우스 화면과 "같은 대사 파일"을 화면과 같은 차례로 읽어 만든다
//   js/profile.js -> js/data/pet_lines.js -> js/data/lines.js -> js/data/dialog_lines.js -> js/data/interactions.js -> js/data/interact_lines.js, 끝에 PHProfile.applyPet
//   = 사용자 이름({user})·펫 이름({cat}/{pet}), 강아지면 말끝 멍~·강아지 줄 덮기가 하우스 창과 똑같이 들어감
//   메인 전역을 건드리지 않게 따로 된 판(vm)에서 읽음. 이름·펫을 바꾸면 다시 만들면 됨 (require 캐시와 상관없음)
// 쓰는 묶음: PH_LINES.time(시작 인사), PH_LINES.pet(들어올리기·내려놓기·누르기, 식사 만족도·양 묻기), PH_DIALOG_LINES(말풍선 메뉴 흐름), PH_INTERACT_LINES
//   두부 펫(dubu-pet)의 data/lines.json 대신. 그 파일의 "제작자" 인사·토리 줄은 공용판에 없음 (lines.js time은 {user}, needs 'tori' 줄은 고르지 않음)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const FILES = ['js/profile.js', 'js/data/pet_lines.js', 'js/data/lines.js', 'js/data/dialog_lines.js', 'js/data/interactions.js', 'js/data/interact_lines.js'];
const World = require(path.join(ROOT, 'js', 'world.js'));

// boot = 하우스 화면이 받는 것과 같은 값 (electron/main.js bootData): { id, bundle, user: { name, cat, pet, ... } }
function build(boot) {
  const c = { console }; c.window = c; c.PHProfileBoot = JSON.parse(JSON.stringify(boot || {}));
  vm.createContext(c);
  FILES.forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), c, { filename: f }));
  const P = c.PHProfile;
  if (P && P.applyPet) P.applyPet(c);
  const L = c.PH_LINES || {}, pet = L.pet || {};
  const kind = P ? P.petKind() : 'cat', name = P ? P.catName() : '두부';
  const usable = (list) => (Array.isArray(list) ? list : []).filter((x) => typeof x === 'string' || (x && typeof x === 'object' && !x.needs && !x.spare));
  const say = (x) => World.parseLine(x).say;
  const last = {};
  // 무작위 하나 (바로 앞 줄 빼고), 괄호 연출은 빼고 글만
  function pick(key, list) {
    const all = usable(list); if (!all.length) return '';
    const c2 = all.length > 1 ? all.filter((x) => say(x) !== last[key]) : all;
    const t = say(c2[Math.floor(Math.random() * c2.length) % c2.length]);
    last[key] = t; return t;
  }
  return {
    kind, name, user: P ? P.userName() : '',
    D: c.PH_DIALOG_LINES, IL: c.PH_INTERACT_LINES, IA: c.PH_INTERACTIONS, L,
    // 시작 인사: 하우스 시간대(settings TIME_BANDS) 인사 묶음
    greet: (date, bands) => pick('greet', (L.time || {})[World.timeBand((date || new Date()).getHours(), bands)] || []),
    line: (k) => pick(k, pet[k]), // lift · drop · click
    clickLines: () => usable(pet.click), // 말풍선 메뉴 "그냥 같이 있기" 끝 줄에 더함 (괄호 연출은 흐름이 뺌)
    talk: { rating: typeof pet.rating === 'string' ? say(pet.rating) : null, amount: typeof pet.amount === 'string' ? say(pet.amount) : null }, // 괄호 연출은 빼고 글만
  };
}

module.exports = { build, FILES };
