// 그림 세트 고르기 (제작자 2026-10-03: v08 "자세히" ↔ v09 "굵게").
// js/assets_data.js(PH_ASSET_SETS)와 js/house_data.js(PH_DATA_SETS)에 세트가 다 묶여 있고, 여기서 하나를 골라
// 예전 이름(PH_ASSETS, PH_LAYOUT_DATA, PH_FADE, PH_PALETTE)에 넣는다. layout.js·sprites.js 등은 그대로 그 이름을 읽음.
// 고르는 순서: 주소 ?set=vNN (electron/main.js가 저장된 값으로 붙임) > 시험용 PH_SET 환경 변수 > settings.ART_SET_DEFAULT > 있는 것 중 가장 새 판
// 바꿀 때는 main이 화면을 새 세트로 다시 연다 (?resume = 제작자이 있던 공간·자리, 탭). 입장 연출 없이 그 자리에서 이어짐
(function (root) {
  'use strict';
  const S = root.PH_SETTINGS || {}, A = root.PH_ASSET_SETS || {}, D = root.PH_DATA_SETS || {};
  // 2026-10-08 설정 묶음: 묶음의 settings.ART_SETS에 적힌 세트만 (제작자 판 = v08~v12, 공용판 = room1)
  const have = Object.keys(D).filter((k) => A[k] && D[k].PH_LAYOUT_DATA && (!S.ART_SETS || S.ART_SETS[k])).sort();
  const q = typeof location !== 'undefined' && location.search ? new URLSearchParams(location.search) : null;
  const env = typeof process !== 'undefined' && process.env ? process.env.PH_SET : null;
  const want = (q && q.get('set')) || env || S.ART_SET_DEFAULT;
  const name = have.includes(want) ? want : have[have.length - 1];
  if (!name) throw new Error('그림 세트 없음: python3 scripts/sync_assets.py 를 먼저 돌려 주세요');
  root.PH_ART_SET = name;
  root.PH_ART_SETS_HAVE = have;
  root.PH_ASSETS = A[name];
  Object.keys(D[name]).forEach((k) => { root[k] = D[name][k]; });
  // 캐릭터 그림 표: 그 세트의 sprite가 묶여 있으면 그것, 없으면 fallback
  const conf = (S.ART_SETS && S.ART_SETS[name]) || {};
  const hasFamily = (p) => Object.keys(A[name]).some((k) => k.indexOf(p + '_') === 0);
  const chars = {};
  Object.entries(conf.chars || {}).forEach(([id, c]) => {
    const use = hasFamily(c.sprite) || !c.fallback ? c : Object.assign({}, c.fallback, { fellBack: true });
    // 발바닥 줄: 그림 JSON의 foot_row(무늬, 맨 위 0부터)가 있으면 그것으로 (foot = 그림 맨 아래에서 발바닥 줄까지 px). 없으면 설정 foot
    const idle = A[name][use.sprite + '_idle'], h = idle && idle.frames && idle.frames[0].length;
    const foot = idle && Number.isInteger(idle.foot_row) && h ? h - 1 - idle.foot_row : (use.foot || 0);
    chars[id] = { sprite: use.sprite, scale: Math.max(1, Math.round(use.scale || 1)), foot, fellBack: !!use.fellBack };
  });
  root.PH_CHARS = chars;
  // 이어 보기 (세트를 바꾼 직후)
  let resume = null;
  try { resume = q && q.get('resume') ? JSON.parse(q.get('resume')) : null; } catch (e) { resume = null; }
  root.PH_RESUME = resume;
  if (typeof module !== 'undefined' && module.exports) module.exports = { name, have, chars };
})(typeof window !== 'undefined' ? window : globalThis);
