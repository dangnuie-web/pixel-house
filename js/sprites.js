// 그림 로더. 화면은 그림 이름(key)만 알고, 실제 그림이 어디서 오는지는 여기서만 정한다.
//   1순위: 무늬 에셋 window.PH_ASSETS (js/assets_data.js, scripts/sync_assets.py가 만듦)
//   2순위: 임시 문자 맵 window.PH_TEMP_SPRITES (placeholders.js, 고양이 등)
//   3순위: 임시 그리기 함수 window.PH_TEMP_DRAW (placeholders.js, 가구·배경)
//   없으면 회색 상자 + 이름 (빠진 그림이 눈에 띄게)
// 에셋 형식은 pixel-office와 같다: { palette: {글자: 색}, frames: [[줄, ...], ...] }. 팔레트는 파일마다 따로 읽는다.
(function (root) {
  'use strict';
  const cache = {};
  const BAD = [255, 0, 255, 255]; // 팔레트 밖 글자·읽을 수 없는 색 = 자홍

  function hexToRgba(h) {
    if (h == null || h === '' || h === 'transparent') return [0, 0, 0, 0];
    let v = String(h).trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map((c) => c + c).join('');
    if (/^[0-9a-f]{6}$/i.test(v)) v += 'ff';
    if (!/^[0-9a-f]{8}$/i.test(v)) return null;
    return [0, 2, 4, 6].map((i) => parseInt(v.slice(i, i + 2), 16));
  }

  const Art = {
    useReal: true, // false = 임시 그림만 (비교용. 개발자 도구에서 PHArt.useReal = false)
    real(key) { return Art.useReal && root.PH_ASSETS && root.PH_ASSETS[key] ? root.PH_ASSETS[key] : null; },
    sprite(key) { return Art.real(key) || (root.PH_TEMP_SPRITES && root.PH_TEMP_SPRITES[key]) || null; },
    has(key) { return !!(key && Art.sprite(key)); },
    isReal(key) { return !!Art.real(key); },
    frameCount(key) { const a = Art.sprite(key); return a ? a.frames.length : 0; },
    size(key) { const a = Art.sprite(key); if (!a) return null; const f = a.frames[0]; return { w: f[0].length, h: f.length }; },
    // 빛: 밤이면 공간 파일의 palette 위에 palette_night를 덮어 칠함 (무늬 가이드 4장. 반투명 막은 안 씀)
    //   lampOff = 밤에 스탠드가 꺼진 상태 (입장 연출). 불빛 글자 l(벽)·Q(마루)·E(등갓)를 같은 밝기의 꺼진 재질 색으로
    //   fadeT = 입장 밝아지기 정도 0(먹색)~1(원래 색), null = 안 함. 색 = 먹색 + (원래 색 - 먹색) x t
    //     (무늬 fade 표 5단계가 정확히 이 식의 t = 0, .25, .5, .75, 1. 시험으로 확인) -> 단계를 더 잘게 나눠도 무늬 색 체계 그대로
    //   2026-10-02 제작자 결정: 캐릭터(두부)도 집과 같은 밝기로 어두워짐 (무늬 v03 "캐릭터는 밝아지기에 안 넣음"을 바꿈)
    //   lampLit = 밝아지는 동안 스탠드 불빛 글자만 먼저 다 켜진 색 (불빛 웅덩이가 밝아지는 시작점)
    night: false, lampOff: false, fadeT: null, lampLit: false,
    INK: '#29262F',
    // 꺼진 불: 불빛 글자를 꺼진 재질 글자 색으로 (벽 l -> i, 마루 Q -> F, 등갓 E -> S. 가이드 v01 3-1)
    LAMP_OFF: { l: 'i', Q: 'F', E: 'S' },
    LAMP_OFF_COLOR: { l: '#A39582', Q: '#93704E', E: '#B5A283' }, // 파일에 그 재질 글자가 없을 때 (밤 값)
    mix(hex, t) {
      if (hex == null || hex === '' || hex === 'transparent' || t == null || t >= 1) return hex;
      const v = String(hex).replace('#', ''); if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)) return hex;
      const k = Art.INK.slice(1), out = [0, 2, 4].map((i) => { const a = parseInt(k.slice(i, i + 2), 16), b = parseInt(v.slice(i, i + 2), 16); return Math.round(a + (b - a) * Math.max(0, t)).toString(16).padStart(2, '0'); });
      return '#' + out.join('') + (v.length === 8 ? v.slice(6) : '');
    },
    paletteOf(a) {
      const pal = Object.assign({}, a.palette), t = Art.fadeT;
      if (!a.palette_night) { // 캐릭터: 밤에도 그대로, 밝아지는 동안만 같은 밝기
        if (t != null) Object.keys(pal).forEach((k) => { pal[k] = Art.mix(pal[k], t); });
        return pal;
      }
      if (Art.night) Object.assign(pal, a.palette_night);
      const full = Object.assign({}, pal);
      if (t != null) Object.keys(pal).forEach((k) => { pal[k] = Art.mix(pal[k], t); });
      if (Art.night && Art.lampOff) {
        Object.keys(Art.LAMP_OFF).forEach((k) => { if (k in pal) { const m = Art.LAMP_OFF[k]; pal[k] = pal[m] || Art.mix(a.palette_night[m] || Art.LAMP_OFF_COLOR[k], t); } });
      } else if (Art.night && Art.lampLit && t != null) {
        Object.keys(Art.LAMP_OFF).forEach((k) => { if (k in pal) pal[k] = full[k]; }); // 스탠드 불빛은 먼저 다 켜짐
      }
      return pal;
    },
    // 한 프레임을 1배 오프스크린 캔버스로 (한 번만 만든다). flip = 좌우 뒤집기
    frameCanvas(key, frameIndex, flip) {
      const a = Art.sprite(key); if (!a) return null;
      const fi = ((frameIndex || 0) % a.frames.length + a.frames.length) % a.frames.length;
      const ft = Art.fadeT == null ? '' : 'f' + Math.round(Art.fadeT * 1000) + (Art.lampLit ? 'L' : '') + ':';
      const lit = (a.palette_night ? (Art.night ? (Art.lampOff ? 'n0:' : 'n:') : 'd:') : 'c:') + ft;
      // (interact) Art.pixelHook(key, a) -> { tag, at(x, y, 글자, 팔레트) -> 색 | null } | null: 스탠드 하나씩 켜고 끄기 (그 불빛 둘레 글자만 다른 색)
      const hook = Art.pixelHook ? Art.pixelHook(key, a) : null;
      const ck = (Art.isReal(key) ? 'r:' : 't:') + lit + (hook ? hook.tag + ':' : '') + key + '#' + fi + (flip ? '#f' : '');
      if (cache[ck]) return cache[ck];
      const fr = a.frames[fi], h = fr.length, w = fr[0].length;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
      const src = Art.paletteOf(a), pal = {}; Object.keys(src).forEach((k) => { pal[k] = hexToRgba(src[k]) || BAD; });
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const hx = hook ? hook.at(x, y, fr[y][x], src) : null;
        const p = (hx && hexToRgba(hx)) || pal[fr[y][x]] || BAD, i = (y * w + (flip ? w - 1 - x : x)) * 4;
        img.data[i] = p[0]; img.data[i + 1] = p[1]; img.data[i + 2] = p[2]; img.data[i + 3] = p[3];
      }
      ctx.putImageData(img, 0, 0);
      return (cache[ck] = c);
    },
    // 물건 그리기: 차지 영역(px) 안에 가로 가운데·아랫변 맞춤. 영역보다 큰 그림은 위로 솟는다 (pixel-office와 같음)
    draw(ctx, key, frame, X, Y, Wpx, Hpx, opt) {
      opt = opt || {};
      if (Art.has(key)) {
        const sz = Art.size(key);
        const x = X + Math.floor((Wpx - sz.w) / 2) + (opt.dx || 0), y = Y + Hpx - sz.h + (opt.dy || 0);
        ctx.drawImage(Art.frameCanvas(key, frame, opt.flip), x, y);
        return 'sprite';
      }
      const fn = root.PH_TEMP_DRAW && root.PH_TEMP_DRAW[key];
      if (fn) { fn(ctx, X + (opt.dx || 0), Y + (opt.dy || 0), Wpx, Hpx, opt.t || 0, frame || 0); return 'temp'; }
      ctx.fillStyle = '#888'; ctx.fillRect(X, Y, Wpx, Hpx);
      ctx.fillStyle = '#fff'; ctx.font = '6px sans-serif'; ctx.fillText(String(key), X + 1, Y + 7);
      return 'missing';
    },
    // 한 캐릭터(prefix)의 그림이 무늬 에셋으로 하나라도 있으면 에셋만 쓴다 (임시 그림과 크기·모양이 섞이지 않게)
    familyReal(prefix) { return !!(Art.useReal && root.PH_ASSETS && Object.keys(root.PH_ASSETS).some((k) => k.indexOf(prefix + '_') === 0)); },
    pickKey(prefix, name) { const k = prefix + '_' + name; return (Art.familyReal(prefix) ? Art.isReal(k) : Art.has(k)) ? k : null; },
    // 캐릭터 그림 고르기 -> { key, flip, frame } 또는 null
    //   걷기: {prefix}_walk_{방향} 3장(0 한 발, 1 선 자세, 2 다른 발, [0,1,2,1] 순서). 오른쪽·왼쪽은 반대쪽 뒤집기로 대신
    //   위·아래 걷기 그림이 없으면 대기 그림을 빠르게 넘김
    //   서 있음: pose(예: greet, sit) 그림이 있으면 그것, 아래 보기면 {prefix}_idle, 아니면 걷기 1번 장
    actorFrame(prefix, face, moving, t, walkMs, pose) {
      const idle = Art.pickKey(prefix, 'idle');
      const loop = (k, ms) => Math.floor(t / ms) % Art.frameCount(k);
      if (!moving && pose) { const k = Art.pickKey(prefix, pose); if (k) return { key: k, flip: false, frame: loop(k, 500) }; }
      let key = Art.pickKey(prefix, 'walk_' + face), flip = false;
      if (!key && (face === 'left' || face === 'right')) { key = Art.pickKey(prefix, 'walk_' + (face === 'left' ? 'right' : 'left')); flip = !!key; }
      if (moving) {
        if (key) { const n = Art.frameCount(key); return { key, flip, frame: n >= 3 ? [0, 1, 2, 1][Math.floor(t / walkMs) % 4] : loop(key, walkMs) }; }
        if (idle) return { key: idle, flip: false, frame: loop(idle, walkMs * 2) };
        return null;
      }
      if (face === 'down' && idle) return { key: idle, flip: false, frame: loop(idle, 500) };
      if (key) return { key, flip, frame: Art.frameCount(key) >= 3 ? 1 : 0 };
      if (idle) return { key: idle, flip: false, frame: loop(idle, 500) };
      return null;
    },
    clearCache() { Object.keys(cache).forEach((k) => delete cache[k]); },
    hexToRgba,
  };
  root.PHArt = Art;
})(typeof window !== 'undefined' ? window : globalThis);
