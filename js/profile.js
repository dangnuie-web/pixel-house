// 설정 묶음 (profile). 2026-10-08 로드맵 4단계 "제작자 정보 분리" (기획/20261008_pixel-house_공용판기획_v01.md 2절)
//   코드는 하나. 집·캐릭터·대사 속 이름·기록 경로처럼 사람마다 다른 값은 묶음 파일 profiles/<id>/profile.json 이 덮는다.
//     { id, user: 기본 이름, houseDir: 기록 폴더(메인이 씀), patch: { 전역 이름(PH_SETTINGS, PH_LINES …): 덮을 값 } }
//   코드 기본값 = 공용판(원룸, 아바타, 이웃 없음). profiles/default 는 비어 있고, 사용자가 온보딩에서 고른 값(userData/profile.json)을 더함
//   덮는 법: 객체는 안쪽까지 합침, 배열·글은 통째로 바꿈, "키!" = 그 키를 통째로 바꿈.
//   대사 속 {user} = 사용자 이름 (이름을 아직 모르면 그대로 둠: 온보딩 전). 습관·공부 이름 자리 {name}과 겹치지 않게 따로 씀 (부기 3-1)
// 어느 묶음인지
//   화면: 메인(electron/profile_main.js)이 preload로 넘긴 window.PHProfileBoot = { id, bundle, user }
//   Node(메인 프로세스·시험·두부 펫): 환경변수 PH_PROFILE. 없으면 profiles/player 가 있으면 player, 없으면 default
//     (제작자 컴퓨터의 두부 펫·시험은 지금처럼 제작자 값을 그대로 씀. 공개 저장소에는 profiles/player 가 없어 공용값)
// 데이터 파일(settings.js, lines.js …)이 맨 끝에서 PHProfile.patch(이름, 값)를 부른다. 그래서 index.html 에서 settings.js 보다 먼저 읽는다
(function (root) {
  'use strict';
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  function merge(dst, src) {
    Object.keys(src || {}).forEach((k) => {
      const v = src[k];
      if (k.endsWith('!')) { dst[k.slice(0, -1)] = clone(v); return; }
      if (isObj(v) && isObj(dst[k])) merge(dst[k], v); else dst[k] = clone(v);
    });
    return dst;
  }
  // 모든 글 안 {user} -> 이름 (제자리에서 바꿈: 다른 파일이 이미 잡아 둔 객체도 같이 바뀜)
  //   {cat} = 고양이 이름 (2026-10-08 3-1단계: 공용판은 온보딩에서 사용자가 지음, 기본 두부). {cat|이} {cat|이에요} {cat|은} {cat|으로} = 받침 따라 조사
  const CAT_DEFAULT = '두부', CAT_RE = /\{cat(?:\|([^}]+))?\}/g;
  function josa(word, kind) {
    const c = String(word).slice(-1).charCodeAt(0), han = c >= 0xAC00 && c <= 0xD7A3, jong = han ? (c - 0xAC00) % 28 : 0;
    if (kind === '으로') return word + (jong && jong !== 8 ? '으로' : '로');
    if (kind === '이에요') return word + (jong ? '이에요' : '예요');
    if (kind === '은') return word + (jong ? '은' : '는');
    if (kind === '이') return word + (jong ? '이' : '가');
    return word;
  }
  const fillCat = (s, cat) => s.replace(CAT_RE, (m, j) => (j ? josa(cat, j) : cat));
  function fillUser(o, name, cat) {
    if (!name && !cat) return o;
    const f = (s) => { let t = cat ? fillCat(s, cat) : s; if (name) t = t.split('{user}').join(name); return t; };
    (function walk(x) {
      if (Array.isArray(x)) x.forEach((v, i) => { if (typeof v === 'string') x[i] = f(v); else if (v && typeof v === 'object') walk(v); });
      else if (isObj(x)) Object.keys(x).forEach((k) => { const v = x[k]; if (typeof v === 'string') x[k] = f(v); else if (v && typeof v === 'object') walk(v); });
    })(o);
    return o;
  }
  const AVATAR_RE = /^avatar\d{1,2}$/;
  const P = { id: 'default', bundle: {}, user: {}, boot: null, merge, fillUser, AVATAR_RE };
  P.userName = () => (P.user && typeof P.user.name === 'string' && P.user.name) || P.bundle.user || '';
  P.catName = () => (P.user && typeof P.user.cat === 'string' && P.user.cat.trim()) || P.bundle.cat || CAT_DEFAULT;
  P.fillCat = fillCat; P.josa = josa; P.CAT_DEFAULT = CAT_DEFAULT;
  P.isOnboard = () => !!(P.boot && P.boot.onboard);
  P.init = function (boot) {
    const b = boot || {};
    P.boot = b; P.id = typeof b.id === 'string' ? b.id : 'default';
    P.bundle = isObj(b.bundle) ? b.bundle : {}; P.user = isObj(b.user) ? b.user : {};
    return P;
  };
  // 공용판 사용자 값: 고른 집 = 그림 세트, 고른 아바타 = 집 안 내 캐릭터 그림
  function userSettings(S) {
    const u = P.user || {};
    if (typeof u.house === 'string' && S.ART_SETS && S.ART_SETS[u.house]) S.ART_SET_DEFAULT = u.house;
    if (typeof u.avatar === 'string' && AVATAR_RE.test(u.avatar)) {
      Object.keys(S.ART_SETS || {}).forEach((k) => { const c = S.ART_SETS[k].chars && S.ART_SETS[k].chars.player; if (c && AVATAR_RE.test(c.sprite || '')) c.sprite = u.avatar; });
    }
  }
  P.patch = function (name, obj) {
    if (!obj) return obj;
    const pt = P.bundle.patch && P.bundle.patch[name];
    if (pt) merge(obj, pt);
    if (name === 'PH_SETTINGS') userSettings(obj); else fillUser(obj, P.userName(), P.catName());
    return obj;
  };

  if (root.PHProfileBoot) P.init(root.PHProfileBoot); // 화면 (Electron preload)
  else if (typeof require === 'function' && typeof module !== 'undefined' && typeof process !== 'undefined' && process.versions && process.versions.node) { // Node (시험은 global.window = global 을 쓰기도 함)
    const fs = require('fs'), path = require('path');
    const ROOT = path.resolve(__dirname, '..');
    const file = (id) => path.join(ROOT, 'profiles', id, 'profile.json');
    P.ID_RE = /^[a-z][a-z0-9_-]{0,20}$/;
    P.has = (id) => P.ID_RE.test(String(id)) && fs.existsSync(file(id));
    P.load = (id) => { if (!P.ID_RE.test(String(id))) return null; try { const v = JSON.parse(fs.readFileSync(file(id), 'utf8')); return isObj(v) ? v : null; } catch (e) { return null; } };
    const want = P.ID_RE.test(process.env.PH_PROFILE || '') ? process.env.PH_PROFILE : (P.has('player') ? 'player' : 'default');
    let user = {};
    try { const u = process.env.PH_PROFILE_USER ? JSON.parse(process.env.PH_PROFILE_USER) : null; if (isObj(u)) user = u; } catch (e) { /* 시험 값이 깨졌으면 없음 */ }
    P.init({ id: want, bundle: P.load(want) || {}, user });
  }

  root.PHProfile = P;
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
})(typeof window !== 'undefined' ? window : globalThis);
