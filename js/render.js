// 전개도 그리기 (위에서 내려다본 한 장). 순서 (무늬 가이드 v01 7-2, v03 같음):
//   배경 -> floor 물건(러그) -> wall 물건(거울·창) -> 나머지 물건과 캐릭터를 그림 아랫변 y 순서로
// 그림은 모두 PHArt(sprites.js)를 거친다. 밝기(낮·밤·입장 밝아지기 단계)도 PHArt 팔레트로만 바꾼다 (반투명 막 없음).
(function (root) {
  'use strict';
  const L = root.PH_LAYOUT, T = L.T;
  const Art = root.PHArt, World = root.PHWorld;

  // 바닥·벽·현관·집 밖: 무늬 배경 한 장(background, 캔버스 크기)이 있으면 그것만, 없으면 칸마다 임시 그림
  function drawMap(ctx) {
    if (Art.has('background')) { ctx.drawImage(Art.frameCanvas('background', 0), 0, 0); return; }
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const ch = L.rows[y][x], X = x * T, Y = y * T;
      if (ch === '#' || ch === '=') Art.draw(ctx, 'wall', 0, X, Y, T, T);
      else if (ch === 'e') Art.draw(ctx, 'stairs', 0, X, Y, T, T);
      else if (ch === '-') Art.draw(ctx, 'outside', 0, X, Y, T, T);
      else if (ch === 'd') Art.draw(ctx, L.rows[y][x - 1] === '#' && L.rows[y][x + 1] === '#' ? 'door_ns' : 'door_we', 0, X, Y, T, T);
      else { const r = L.rooms.find((q) => q.id === World.roomAt(L, x, y)); Art.draw(ctx, 'floor_' + (r ? r.floor : 'wood'), 0, X, Y, T, T); }
    }
  }

  // 물건 그림: 배치표에 px, py(그림 왼쪽 위)가 있고 그림이 있으면 그 자리 (가이드 v03 4장 "가장 정확").
  // 없으면 오피스 식 (차지 칸 가로 가운데·아랫변 맞춤 + dx, dy)
  function objFrame(o, t) {
    const n = Art.has(o.sprite) ? Art.frameCount(o.sprite) : 1;
    return o.frame != null ? o.frame : (o.frameMs && n > 1 ? Math.floor(t / o.frameMs) % n : 0);
  }
  // (interact) root.PHObjFx(o, t) -> { dx, dy, sprite, after(ctx) } | null: 흔들림·통 튐(dx, dy), 다른 그림(물 화분 단계), 그림 바로 뒤에 덧그리기(임시 잎·꽃, TV 화면)
  function drawObject(ctx, o, t) {
    const fx = root.PHObjFx ? root.PHObjFx(o, t) : null;
    if (fx) {
      const sp = fx.sprite && Art.has(fx.sprite) ? fx.sprite : o.sprite;
      if (o.px != null && Art.has(sp)) { const sz = Art.size(o.sprite) || Art.size(sp), nz = Art.size(sp); ctx.drawImage(Art.frameCanvas(sp, sp === o.sprite ? objFrame(o, t) : 0, o.flip), Math.round(o.px + (sz.w - nz.w) / 2 + (fx.dx || 0)), Math.round(o.py + sz.h - nz.h + (fx.dy || 0))); }
      else Art.draw(ctx, o.sprite, objFrame(o, t), o.x * T, o.y * T, o.w * T, o.h * T, { dx: (o.dx || 0) + (fx.dx || 0), dy: (o.dy || 0) + (fx.dy || 0), flip: o.flip, t });
      if (fx.after) fx.after(ctx);
      return;
    }
    if (o.px != null && Art.has(o.sprite)) { ctx.drawImage(Art.frameCanvas(o.sprite, objFrame(o, t), o.flip), o.px, o.py); return; }
    Art.draw(ctx, o.sprite, objFrame(o, t), o.x * T, o.y * T, o.w * T, o.h * T, { dx: o.dx, dy: o.dy, flip: o.flip, t });
  }
  // 정렬 값 = 그림 아랫변 y
  function objBase(o) {
    if (o.sort_y != null) return o.sort_y; // 무늬가 정한 정렬 값 (v11 정수기: 주방장 위 물건이라 주방장 다음에 그림)
    if (o.px != null && Art.has(o.sprite)) return o.py + Art.size(o.sprite).h;
    return (o.y + o.h) * T + (o.dy || 0);
  }

  // 캐릭터 한 명. 발 = 칸 아랫변, 가로 가운데 (pixel-office drawFeetSprite와 같음). 그림자는 그리지 않음(반투명 금지, 그림에 발 먹선 있음)
  function drawActor(ctx, a, t, walkMs) {
    const f = Art.actorFrame(a.sprite, a.face, a.moving, t, walkMs, a.pose);
    if (!f) return;
    // 배율(a.scale, 정수): 그림을 그대로 정수 배 키움 (캔버스 imageSmoothingEnabled = false라 nearest-neighbor). 발바닥 = 칸 바닥, 가로 = 칸 가운데
    const sz = Art.size(f.key), s = a.scale || 1, w = sz.w * s, h = sz.h * s;
    const x = Math.round(a.px + (T - w) / 2), y = Math.round(a.py + T - h + (a.foot || 0) * s + (a.lift || 0)); // foot = 그림 맨 아래에서 발바닥 줄까지 (큰 판 그림용)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(Art.frameCanvas(f.key, f.frame, f.flip), x, y, w, h);
  }

  function sortItems(s) {
    const items = L.objects.filter((o) => !o.layer && !o.noDraw).map((o) => ({ base: objBase(o), kind: 'obj', o }));
    // 쉬는 자리(테이블 위)에 앉은 캐릭터 = 그 물건 바로 다음 (layout spawn draw_after, 무늬 v05 3장). 발 y로 정렬하면 테이블에 가려짐
    s.actors.filter((a) => a.visible !== false).forEach((a) => items.push({ base: a.perch && a.perch.base != null ? a.perch.base : a.py + T + 0.5 + (a.hop ? 0 : 0), kind: 'actor', a }));
    return items.sort((p, q) => p.base - q.base);
  }
  // 한 장면 전체. s = { actors, t, walkMs }
  function drawScene(ctx, s) {
    ctx.clearRect(0, 0, L.W, L.H);
    drawMap(ctx);
    if (root.PHObjFx && root.PHObjFx.afterMap) root.PHObjFx.afterMap(ctx, s.t); // (interact) 켜진 스탠드 불빛 웅덩이 (배경 바로 다음, 바닥 물건 전)
    L.objects.filter((o) => o.layer === 'floor').forEach((o) => drawObject(ctx, o, s.t));
    L.objects.filter((o) => o.layer === 'wall').forEach((o) => drawObject(ctx, o, s.t));
    sortItems(s).forEach((it) => { if (it.kind === 'obj') drawObject(ctx, it.o, s.t); else drawActor(ctx, it.a, s.t, s.walkMs); });
  }

  // 입장 화면: entrance 2장 (0 문 닫힘 / 1 문 열림). 없으면 임시 그림
  //   guest = 이웃 그림 장 번호 (null이면 안 그림). 자리 = 그림 파일 overlay.guest(px, py), 배경 다음에 그림
  //   입장 화면은 집 안 연출(스탠드 꺼짐·밝아지기)과 상관없이 늘 그 시각의 낮·밤 색 (lampOff·fadeT를 잠깐 끄고 그림)
  function drawCover(ctx, frame, guest) {
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    if (Art.has('entrance')) {
      const keep = [Art.lampOff, Art.fadeT, Art.lampLit]; Art.lampOff = false; Art.fadeT = null; Art.lampLit = false;
      try {
        ctx.clearRect(0, 0, cw, ch); ctx.drawImage(Art.frameCanvas('entrance', frame || 0), 0, 0);
        const e = Art.sprite('entrance'), ga = Art.sprite('entrance_guest'), g = (e && e.overlay && e.overlay.guest) || (ga && ga.place); // 자리 = 그림 파일에서
        if (guest != null && g && Art.has('entrance_guest')) ctx.drawImage(Art.frameCanvas('entrance_guest', guest), g.px, g.py);
      } finally { Art.lampOff = keep[0]; Art.fadeT = keep[1]; Art.lampLit = keep[2]; }
      return;
    }
    Art.draw(ctx, 'cover', 0, 0, 0, cw, ch);
  }

  root.PHRender = { drawScene, drawCover, drawActor, sortItems, objBase };
})(window);
