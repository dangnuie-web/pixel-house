// 옷 갈아입기: 차림 규칙 + 층 합성 (wardrobe 브랜치 2026-10-03, 비트). 창(화면)은 js/wardrobe.js
// 규칙 (기획 v01, Node 시험 tests/test_outfit.js)
//   - 칸: top, bottom, outer, bag, hat, onepiece. 값 = 번호 또는 null
//   - 한벌을 고르면 상의·하의는 그리지 않음 (값은 기억). 상의나 하의를 고르면 한벌은 꺼짐
//   - 외투·가방·모자는 없음(null) 가능. 상의·하의는 늘 하나 (한벌일 때만 안 그림)
// 그리기 (무늬 옷층 규격 v01): 32x36 캔버스, z 순서 바탕0 -> 하의10 -> 상의/한벌20 -> 외투30 -> 가방40 -> 머리카락50(늘) -> 모자60
//   집 안 플레이어(playerM_<anim>)를 그릴 때 PHArt.frameCanvas·size를 감싸서, 차림이 바뀌면 장마다 한 번 합성해 캐시
//   그림이 없으면: 바탕·고른 상의·하의가 다 있으면 층 합성 / 기본 차림(상의2+하의5)이면 원래 playerM 그림을 몸으로 쓰고 외투·가방·모자만 겹침 /
//   그 밖에는 원래 그림 그대로 (앱은 그대로 돌아감). 창에서는 그릴 수 없는 칸을 "준비 중"으로 막음
//   색: 캐릭터 규칙 그대로 = 낮 팔레트 + 입장 밝아지기(PHArt.fadeT). palette_night는 안 씀 (무늬 규격 7장 "앱이 캐릭터에도 밤 색을 쓸 때만")
(function (root) {
  'use strict';
  const SLOTS = ['top', 'bottom', 'outer', 'bag', 'hat', 'onepiece'];
  const OPTIONAL = ['outer', 'bag', 'hat'];
  const Z = { base: 0, bottom: 10, top: 20, onepiece: 20, outer: 30, bag: 40, hair: 50, hat: 60 };
  const conf = () => root.PH_WARDROBE || {};
  const data = () => root.PH_OUTFITS || { base: null, fixed: {}, items: {} };

  // ---- 규칙 (화면 없이) ----
  const isNum = (v) => Number.isInteger(v) && v >= 1 && v <= 99;
  function normalize(saved, def) {
    def = def || conf().DEFAULT || { top: 2, bottom: 5, outer: null, bag: null, hat: null, onepiece: null };
    const s = Object.assign({}, def), src = saved && typeof saved === 'object' ? saved : {};
    SLOTS.forEach((k) => {
      if (!(k in src)) return;
      const v = src[k];
      if (isNum(v)) s[k] = v;
      else if (v === null && k !== 'top' && k !== 'bottom') s[k] = null;
    });
    if (!isNum(s.top)) s.top = def.top; if (!isNum(s.bottom)) s.bottom = def.bottom;
    return s;
  }
  function choose(state, slot, num) {
    const s = Object.assign({}, state);
    if (!SLOTS.includes(slot)) return s;
    if (slot === 'top' || slot === 'bottom') { if (!isNum(num)) return s; s[slot] = num; s.onepiece = null; return s; }
    if (slot === 'onepiece') { if (!isNum(num)) return s; s.onepiece = num; return s; }
    s[slot] = isNum(num) ? num : null; // 외투·가방·모자 (null = 없음)
    return s;
  }
  // 지금 입는 칸들 (그리는 것만): 한벌이면 상의·하의 대신 한벌
  function worn(state) {
    const out = [];
    if (state.onepiece != null) out.push(['onepiece', state.onepiece]); else { out.push(['bottom', state.bottom]); out.push(['top', state.top]); }
    OPTIONAL.forEach((k) => { if (state[k] != null) out.push([k, state[k]]); });
    return out;
  }
  const isWorn = (state, slot, num) => worn(state).some(([k, n]) => k === slot && n === num);
  function isDefaultBody(state, def) { def = def || conf().DEFAULT || {}; return state.onepiece == null && state.top === def.top && state.bottom === def.bottom; }
  // 그리는 계획: null = 원래 그림 그대로 / { layers: [{ kind, id, z }], exact } (exact = 고른 것이 다 그려짐)
  function plan(state, D, def) {
    D = D || data();
    const items = D.items || {}, fixed = D.fixed || {};
    const ready = (id) => !!(items[id] && items[id].ready);
    const zOf = (id, slot) => (items[id] && typeof items[id].z === 'number' ? items[id].z : Z[slot]);
    const body = state.onepiece != null ? [['onepiece', state.onepiece]] : [['bottom', state.bottom], ['top', state.top]];
    const extras = OPTIONAL.filter((k) => state[k] != null).map((k) => [k, state[k]]);
    const hair = fixed.hair && fixed.hair.ready ? { kind: 'fixed', id: 'hair', z: typeof fixed.hair.z === 'number' ? fixed.hair.z : Z.hair } : null;
    const xs = extras.filter(([k, n]) => ready(k + '_' + n)).map(([k, n]) => ({ kind: 'item', id: k + '_' + n, z: zOf(k + '_' + n, k) }));
    const exactExtras = xs.length === extras.length;
    let layers;
    if (D.base && D.base.ready && body.every(([k, n]) => ready(k + '_' + n))) {
      layers = [{ kind: 'base', id: 'base', z: typeof D.base.z === 'number' ? D.base.z : Z.base }]
        .concat(body.map(([k, n]) => ({ kind: 'item', id: k + '_' + n, z: zOf(k + '_' + n, k) })), xs, hair ? [hair] : []);
    } else if (isDefaultBody(state, def)) {
      if (!xs.length) return { layers: null, exact: exactExtras }; // 원래 그림 = 기본 차림
      // 원래 그림(머리카락 포함)을 몸으로, 그 위에 외투·가방, 머리카락을 다시, 모자
      layers = [{ kind: 'orig', id: 'orig', z: Z.top + 0.5 }].concat(xs, hair ? [hair] : []);
    } else return { layers: null, exact: false };
    layers.sort((a, b) => a.z - b.z);
    return { layers, exact: exactExtras };
  }
  const drawable = (state, D, def) => plan(state, D, def).exact;
  // 칸 하나를 고를 수 있는지: 그 그림이 있고(기본 차림 칸은 원래 그림으로 대신), 고른 뒤 차림이 다 그려질 때
  function available(state, slot, num, D, def) {
    D = D || data(); def = def || conf().DEFAULT || {};
    if (num == null) return OPTIONAL.includes(slot) && drawable(choose(state, slot, null), D, def);
    const it = (D.items || {})[slot + '_' + num];
    const stand = (slot === 'top' || slot === 'bottom') && def[slot] === num; // 기본 차림 칸 = 원래 그림으로 그려짐
    if (!(it && it.ready) && !stand) return false;
    return drawable(choose(state, slot, num), D, def);
  }

  const Logic = { SLOTS, OPTIONAL, Z, normalize, choose, worn, isWorn, isDefaultBody, plan, drawable, available };
  if (typeof module !== 'undefined' && module.exports && typeof window === 'undefined') { module.exports = Logic; return; }

  // ---- 화면: 합성 ----
  const Art = root.PHArt;
  const O = Object.assign({ state: normalize(null), loaded: false, ver: 0, composed: 0 }, Logic);
  const cache = new Map();
  const origFrameCanvas = Art.frameCanvas, origSize = Art.size;
  const KEY_RE = new RegExp('^' + (conf().PREFIX || 'playerM') + '_(idle|walk_(?:up|down|left|right))$');

  // 이 세트에서 옷 갈아입기가 되는지 (v10 + 플레이어 그림이 playerM)
  O.enabled = function () {
    const c = conf(), ch = (root.PH_CHARS || {}).player;
    return (c.SETS || []).includes(root.PH_ART_SET) && !!ch && ch.sprite === c.PREFIX && !ch.fellBack;
  };
  O.size = function () { const b = data().base; return b && b.size ? { w: b.size[0], h: b.size[1] } : { w: 32, h: 36 }; };
  O.origin = function () { const b = data().base; return (b && b.origin) || conf().ORIGIN || [4, 6]; };
  O.plan = (st) => plan(st || O.state, data(), conf().DEFAULT);

  const sig = (st) => O.SLOTS.map((k) => k + (st[k] == null ? '-' : st[k])).join('.');
  function layerFrames(L, anim) { // -> { frames, palette, flip }
    if (L.kind === 'base') { const a = data().base.anims[anim]; return a ? { frames: a.frames, palette: a.palette, flip: false } : null; }
    const p = L.kind === 'fixed' ? data().fixed[L.id] : data().items[L.id]; if (!p) return null;
    if (p.anims[anim]) return { frames: p.anims[anim].frames, palette: p.anims[anim].palette, flip: false };
    const other = { walk_left: 'walk_right', walk_right: 'walk_left' }[anim]; // 한쪽만 있으면 뒤집어 씀
    return other && p.anims[other] ? { frames: p.anims[other].frames, palette: p.anims[other].palette, flip: true } : null;
  }
  function paint(img, W, lf, fi, ox, oy) {
    const fr = lf.frames[((fi % lf.frames.length) + lf.frames.length) % lf.frames.length]; if (!fr) return;
    const pal = {}, t = Art.fadeT;
    Object.keys(lf.palette || {}).forEach((k) => { const v = lf.palette[k]; pal[k] = v == null ? null : Art.hexToRgba(t != null ? Art.mix(v, t) : v); });
    const h = fr.length, w = fr[0].length;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = pal[fr[y][x]]; if (!p || !p[3]) continue;
      const X = (lf.flip ? w - 1 - x : x) + ox, Y = y + oy; if (X < 0 || Y < 0 || X >= W) continue;
      const i = (Y * W + X) * 4; img.data[i] = p[0]; img.data[i + 1] = p[1]; img.data[i + 2] = p[2]; img.data[i + 3] = p[3];
    }
  }
  // 한 장 합성 (1배 캔버스, W x H). st = 차림 (없으면 지금 차림). null = 원래 그림 그대로 쓰면 됨
  O.compose = function (anim, fi, flip, st) {
    st = st || O.state;
    const pl = O.plan(st); if (!pl.layers) return null;
    const ft = Art.fadeT == null ? '' : 'f' + Math.round(Art.fadeT * 1000);
    const ck = sig(st) + '|' + anim + '#' + fi + (flip ? 'f' : '') + '|' + ft;
    if (cache.has(ck)) return cache.get(ck);
    const { w: W, h: H } = O.size(), c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    let img = ctx.createImageData(W, H);
    for (const L of pl.layers) {
      if (L.kind === 'orig') { // 원래 playerM 그림을 (4, 6)에
        ctx.putImageData(img, 0, 0);
        const oc = origFrameCanvas.call(Art, (conf().PREFIX || 'playerM') + '_' + anim, fi, false); const o = O.origin();
        if (oc) ctx.drawImage(oc, o[0], o[1]);
        img = ctx.getImageData(0, 0, W, H);
        continue;
      }
      const lf = layerFrames(L, anim); if (lf) paint(img, W, lf, fi, 0, 0);
    }
    if (flip) { // 좌우 뒤집기 (원래 그림의 오른쪽 = 왼쪽 뒤집기 규칙과 같게)
      const out = ctx.createImageData(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = (y * W + x) * 4, b = (y * W + (W - 1 - x)) * 4; for (let k = 0; k < 4; k++) out.data[b + k] = img.data[a + k]; }
      img = out;
    }
    ctx.putImageData(img, 0, 0);
    if (cache.size > 400) cache.clear(); // 밝아지기 단계마다 쌓이지 않게
    cache.set(ck, c); O.composed++;
    return c;
  };
  // 옷 그림 하나 (칸 미리보기): idle 0번 장을 칠한 부분만 잘라서. 없으면 null
  O.thumb = function (slot, num) {
    const id = slot + '_' + num, p = (data().items || {})[id];
    if (!p || !p.ready || !p.anims.idle) return null;
    const { w: W, h: H } = O.size(), keep = Art.fadeT; Art.fadeT = null;
    try {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const ctx = c.getContext('2d'), img = ctx.createImageData(W, H);
      paint(img, W, { frames: p.anims.idle.frames, palette: p.anims.idle.palette, flip: false }, 0, 0, 0);
      let x1 = W, y1 = H, x2 = -1, y2 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (img.data[(y * W + x) * 4 + 3]) { x1 = Math.min(x1, x); x2 = Math.max(x2, x); y1 = Math.min(y1, y); y2 = Math.max(y2, y); }
      if (x2 < 0) return null;
      ctx.putImageData(img, 0, 0);
      const out = document.createElement('canvas'); out.width = x2 - x1 + 1; out.height = y2 - y1 + 1;
      out.getContext('2d').drawImage(c, x1, y1, out.width, out.height, 0, 0, out.width, out.height);
      return out;
    } finally { Art.fadeT = keep; }
  };
  // 미리보기 한 장 (창 왼쪽): 밝아지기·어둡게 없이 원래 색. 합성이 없으면 원래 그림을 같은 캔버스 자리에
  O.previewFrame = function (anim, fi, st) {
    const keep = Art.fadeT; Art.fadeT = null;
    try {
      const c = O.compose(anim, fi, false, st); if (c) return c;
      const { w: W, h: H } = O.size(), out = document.createElement('canvas'); out.width = W; out.height = H;
      const oc = origFrameCanvas.call(Art, (conf().PREFIX || 'playerM') + '_' + anim, fi, false), o = O.origin();
      if (oc) out.getContext('2d').drawImage(oc, o[0], o[1]);
      return out;
    } finally { Art.fadeT = keep; }
  };
  const frameCountOf = (anim) => { const b = data().base; if (b && b.anims[anim]) return b.anims[anim].frames.length; return Art.frameCount((conf().PREFIX || 'playerM') + '_' + anim) || 1; };
  O.frameCount = frameCountOf;

  // ---- PHArt 감싸기: 집 안 플레이어 그림만 ----
  const hit = (key) => (O.enabled() ? KEY_RE.exec(key) : null);
  Art.frameCanvas = function (key, frameIndex, flip) {
    const m = hit(key);
    if (m) { const c = O.compose(m[1], frameIndex || 0, flip); if (c) return c; }
    return origFrameCanvas.call(Art, key, frameIndex, flip);
  };
  Art.size = function (key) {
    const m = hit(key);
    if (m && O.plan().layers) return O.size(); // 합성 그림 = 32x36 (아래 가운데 맞춤이라 원래 24x30과 발 자리가 같음)
    return origSize.call(Art, key);
  };

  // 클릭 판정·자리 계산(game.js spriteSize)은 원래 그림 크기 그대로 (합성 캔버스의 투명 여백까지 누르지 않게)
  Art.hitSize = function (key) { return hit(key) ? origSize.call(Art, key) : null; };

  // ---- 차림 바꾸기·저장 ----
  const listeners = [];
  O.onChange = (fn) => listeners.push(fn);
  O.set = function (st, opt) {
    O.state = normalize(st); O.ver++;
    listeners.forEach((fn) => { try { fn(O.state); } catch (e) { /* 화면 갱신 실패는 무시 */ } });
    if (!(opt && opt.noSave)) return O.save();
    return Promise.resolve(true);
  };
  O.pick = (slot, num) => O.set(choose(O.state, slot, num));
  const api = () => (root.PHOutfitDesktop && root.PHOutfitDesktop.get ? root.PHOutfitDesktop : null);
  O.save = async function () {
    const st = Object.assign({}, O.state);
    try {
      if (api()) { const r = await api().set(st); O.lastSave = r; return !!(r && r.ok); }
      localStorage.setItem(conf().STORE_KEY || 'pixel-house.outfit', JSON.stringify(st)); O.lastSave = { ok: true, local: true }; return true;
    } catch (e) { O.lastSave = { ok: false, error: String(e && e.message || e) }; return false; }
  };
  O.load = async function () {
    let saved = null;
    try {
      if (api()) { const r = await api().get(); saved = r && r.outfit; }
      else saved = JSON.parse(localStorage.getItem(conf().STORE_KEY || 'pixel-house.outfit') || 'null');
    } catch (e) { saved = null; }
    O.loaded = true;
    return O.set(saved, { noSave: true }).then(() => O.state);
  };
  // 시험: 그림 묶음을 바꾼 뒤 (가짜 옷)
  O.reset = function () { cache.clear(); O.ver++; listeners.forEach((fn) => { try { fn(O.state); } catch (e) { /* */ } }); };
  O.cacheSize = () => cache.size;
  root.PHOutfit = O;
  O.ready = O.load();
})(typeof window !== 'undefined' ? window : globalThis);
