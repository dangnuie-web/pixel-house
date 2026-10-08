// 가구 연결·일지 기능 켜짐 상태 (화면 쪽, 2026-10-04 비트). 계산은 js/features.js, 저장은 메인(electron/furnish_ipc.js, window.PHFurnishDesktop)
//   links = 사용자가 바꾼 연결 (기본과 다른 것만), seen = 생활습관 표에 한 번이라도 있었던 일지 기능(대변·식사·독서)
//   기능 켜짐 = 생활습관 표(PHLife.data)의 습관 이름 + seen (features.js stateOf). 표에 줄이 보이면 seen에 바로 더함(메인도 따로 더함)
//   쓰는 곳: interact.js(가구 누르기), furnish_ui.js(연결 모드), habit_edit_ui.js(기록 카드 추가 목록·화면 줄 지우기), logs_view.js(기록 카드 줄), journal.js(대변·식사·독서 안 탭), dialog.js(두부 대화창 식사 선택지)
(function (root) {
  'use strict';
  const FX = root.PHFeatures;
  const D = () => root.PHFurnishDesktop;
  const F = { links: {}, seen: [], loaded: false, rev: 0, listeners: [] };

  function names() { const d = root.PHLife && root.PHLife.data; return new Set(d && d.habits ? d.habits.rows.map((r) => r.name) : []); }
  function syncSeen(n) { FX.seenFrom(n).forEach((id) => { if (!F.seen.includes(id)) F.seen.push(id); }); }
  // 기록 칸 이름들 (## 기록 항목, js/record_write.js). 생활 기록을 아직 못 읽었으면 null
  let kcache = { d: null, v: null };
  function kinds() {
    const d = root.PHLife && root.PHLife.data, RW = root.PHRecordWrite; if (!d || !d.lines || !RW) return null;
    if (kcache.d !== d) kcache = { d, v: RW.parse(d.lines).kinds.map((k) => k.name) };
    return kcache.v.slice();
  }
  // TV(record)가 여는 칸: 영화 (2026-10-08 제작자: 한 가구에 한 기능. 연극은 rk:연극으로 따로). 영화 칸을 지웠으면 빈 목록 = 꺼짐
  function movieKinds() { const RW = root.PHRecordWrite, M = RW ? RW.TV_KINDS : ['영화'], k = kinds(); return k ? M.filter((n) => k.includes(n)) : M.slice(); }
  // 생활 기록을 아직 못 읽었으면(입장 직후 등) 켜짐으로 봄 (전과 같은 반응)
  //   record = 영화 칸이 있으면 켜짐, 기록 칸(rk:) = 그 칸이 있으면 켜짐 (2026-10-08 피드백 4)
  function state(fid) {
    const f = FX.get(fid); if (!f) return 'off';
    if (f.rk || f.id === 'record') { const k = kinds(); if (!k) return 'on'; return (f.rk ? k.includes(f.kind) : movieKinds().length > 0) ? 'on' : 'off'; }
    const d = root.PHLife && root.PHLife.data; if (!d || !d.habits) return 'on'; const n = names(); syncSeen(n); return FX.stateOf(fid, n, F.seen);
  }
  // 가구 기능 연동 목록에 보일 기능: 정해진 것 + 영화 밖 기록 칸마다 하나 (record 바로 뒤. 연극도 여기)
  function features() {
    const RW = root.PHRecordWrite, M = RW ? RW.TV_KINDS : [], extra = (kinds() || []).filter((n) => !M.includes(n)).map((n) => FX.get(FX.rkId(n))).filter(Boolean);
    const at = FX.FEATURES.findIndex((f) => f.id === 'record') + 1;
    return FX.FEATURES.slice(0, at).concat(extra, FX.FEATURES.slice(at));
  }
  // 기록 칸 하나를 여는 기능 id: 영화 = TV(record), 나머지(연극 포함) = rk:이름
  const kindFeature = (name) => { const RW = root.PHRecordWrite; return RW && RW.TV_KINDS.includes(name) ? 'record' : FX.rkId(name); };
  const isOn = (fid) => state(fid) !== 'off';
  // 생활일지 안 탭: 대변·식사·독서 탭은 그 기능이 꺼지면 숨김 (독서 = 2026-10-04 제작자)
  //   물·요가·러닝처럼 habit 탭은 생활습관 표에 그 줄이 없으면 숨김 (2026-10-04 제작자 "러닝 탭 안 빠짐"). 기록을 아직 못 읽었으면 보임
  function habitGone(name) { const d = root.PHLife && root.PHLife.data; return !!(d && d.habits) && !names().has(name); }
  function tabHidden(t) { return !!t && ((t.poop && !isOn('poop')) || (t.meal && !isOn('meal')) || (t.books && !isOn('reading')) || (!!t.habit && habitGone(t.habit))); }

  function changed() { F.rev++; F.listeners.forEach((fn) => { try { fn(); } catch (e) { /* 다른 화면 오류가 여기로 번지지 않게 */ } }); }
  const onChange = (fn) => { F.listeners.push(fn); };
  async function load() {
    const d = D();
    if (d && d.get) { try { const r = await d.get(); F.links = FX.cleanLinks(r && r.links); F.seen = FX.cleanSeen(r && r.seen); } catch (e) { F.error = String(e && e.message || e); } }
    F.loaded = true; changed(); return F;
  }
  async function setLinks(links) {
    const v = FX.cleanLinks(links), d = D();
    if (d && d.setLinks) { const r = await d.setLinks(v); F.links = FX.cleanLinks(r && r.links); } else F.links = v; // 브라우저(앱 밖)에서는 이 창에만
    changed(); return F.links;
  }
  async function reset() {
    const d = D();
    if (d && d.reset) { const r = await d.reset(); F.links = FX.cleanLinks(r && r.links); } else F.links = {};
    changed(); return F.links;
  }
  // 화면에만 보이던 일지 기능 줄 지우기 = 꺼짐 표시 (생활 기록 파일은 그대로)
  async function hide(fid) {
    const d = D();
    if (d && d.hide) { const r = await d.hide(fid); F.seen = FX.cleanSeen(r && r.seen); } else if (!F.seen.includes(fid)) F.seen.push(fid);
    changed(); return F.seen;
  }

  Object.assign(F, { load, setLinks, reset, hide, state, isOn, tabHidden, names, onChange, changed, kinds, movieKinds, features, kindFeature });
  root.PHFurnish = F;
})(window);
