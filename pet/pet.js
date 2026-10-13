// 바탕화면 펫 창 화면 (픽셀 하우스 안, 2026-10-13 제작자 결정 "하우스 앱 안에 바탕화면 펫 켜기"): 두부 그리기, 말주머니, 마우스(누름·뗌·오른쪽 클릭·두부 위인지) 알리기.
//   위치·행동 결정은 electron/desk_pet.js. 원본 = 두부 펫(dubu-pet) pet/pet.js 를 옮겨 옴 (바뀐 곳: 아래 줄 글을 main이 pet:init foot 로 줌)
'use strict';
(function () {
  const el = document.getElementById('dubu');
  const ctx = el.getContext('2d');
  const wrap = document.getElementById('bwrap');
  const btext = document.getElementById('btext');
  const tail = document.getElementById('btail');
  // 그림 시간 (ms)
  const WALK_MS = 200;                   // 걷기 한 장. 4장 순환 (토리 170보다 느긋하게)
  const TALK_MS = 260;                   // 말하기 2장(입 벌림/다묾) 번갈아
  const LIFT_MS = 240;                   // 들어올리기 2장(다리 좌/우) 번갈아
  const BLINK_MIN = 3000, BLINK_MAX = 7000; // 서 있기 깜빡임(웃는 눈) 간격
  let BLINK_MS = 180;                    // 눈 감은 시간 (개발 확인 때만 __petBlinkNow로 늘림)
  let P = null;                          // {L: 배치, img: {동작: [Image]}, pixelated, dpr}
  let cssW = 150, cssH = 150, headH = 150, winW = 300;
  let nextBlink = 0;
  let pose = { mode: 'idle', dir: 'right' }, poseAt = performance.now();
  let view = { left: 0, right: 300 };
  let bubbleTimer = null, lastKey = '';
  const TAIL_K = 2;                      // 꼬리 배율 (무늬 tail v01 9x5 -> 18x10px)
  let UI = {};                           // 말풍선 메뉴 그림 { 이름: {palette, frames} } (main electron/pet_sprites.js uiSprites)
  let FOOT = [['hide', '잠깐 숨기기 (10분)'], ['quit', '바탕화면 펫 끄기']]; // 오른쪽 클릭 메뉴 아래 줄 (main이 pet:init foot 로 덮음)

  window.DP.on('pet:init', (d) => {
    winW = d.winW;
    const dpr = window.devicePixelRatio || 1;
    if (d.pix) { // 고른 펫이 흰 고양이가 아니면 하우스 픽셀 그림 (2026-10-13): 장마다 원래 크기 캔버스, 그릴 때 정수 배율·픽셀 그대로
      const L = d.pix.layout;
      P = { L, img: {}, pixelated: true, pix: true, dpr, ready: 0, total: 0 };
      Object.keys(d.pix.sprites).forEach((k) => { const sp = d.pix.sprites[k]; P.img[k] = sp.frames.map((f, i) => window.Pix.canvas(sp, i, 1)); P.total += sp.frames.length; P.ready = P.total; });
    } else {
      const L = d.png.layout;
      P = { L, img: {}, pixelated: !!d.png.pixelated, dpr, ready: 0, total: 0 };
      Object.keys(d.png.images).forEach((k) => {
        P.img[k] = d.png.images[k].map((url) => { const im = new Image(); P.total++; im.onload = () => { P.ready++; lastKey = ''; }; im.src = url; return im; });
      });
    }
    const L = P.L;
    cssW = L.W; cssH = L.H; headH = L.headH;
    el.width = Math.round(cssW * dpr); el.height = Math.round(cssH * dpr);
    el.style.imageRendering = 'auto';
    el.style.width = cssW + 'px'; el.style.height = cssH + 'px';
    el.style.left = petLeft() + 'px';
    nextBlink = performance.now() + rnd(BLINK_MIN, BLINK_MAX);
    if (d.tail) {
      const fr = d.tail.frames[0]; tail.width = fr[0].length; tail.height = fr.length;
      tail.style.width = tail.width * TAIL_K + 'px'; tail.style.height = tail.height * TAIL_K + 'px';
      window.Pix.draw(tail.getContext('2d'), d.tail, 0, 0, 0, false);
    }
    UI = d.ui || {};
    if (Array.isArray(d.foot) && d.foot.length) FOOT = d.foot.map((x) => [String(x[0]), String(x[1])]);
    lastKey = ''; requestAnimationFrame(loop);
  });
  window.DP.on('pet:pose', (p) => { if (p.mode !== pose.mode) poseAt = performance.now(); pose = p; });
  window.DP.on('pet:view', (v) => { view = v; el.style.left = petLeft() + 'px'; if (!wrap.hidden) placeBubble(); });
  window.addEventListener('resize', () => { if (!wrap.hidden) placeBubble(); }); // 말풍선 메뉴 때 창 높이가 바뀜
  window.DP.on('pet:say', (d) => { if (Dlg.open()) Dlg.end(); showBubble(d.text, d.ms); }); // 끌기로 메뉴가 닫히며 바로 들어올리기 대사
  window.DP.on('pet:hideBubble', () => hideBubble(false));

  const rnd = (a, b) => a + Math.random() * (b - a);
  // 돌려줌: {a: 동작, f: 장 번호, flip}. 원본이 보는 방향(facing)과 가야 할 방향(pose.dir)이 다르면 좌우 뒤집기
  function look(t, now) {
    const m = pose.mode;
    const pick = (a, f) => { const fc = P.L.place[a].facing; return { a, f, flip: fc !== 'front' && fc !== pose.dir }; };
    if (P.pix) { // 하우스 픽셀 그림: 하우스 js/sprites.js actorFrame 과 같은 시간 (걷기 130ms [0,1,2,1], 대기·말하기 500ms 반복). 들어올리기 그림은 없어 서기
      if (m === 'walk') return pick('walk_' + pose.dir, [0, 1, 2, 1][Math.floor(t / 130) % 4]);
      if (m === 'talk' && P.img.talk) return pick('talk', Math.floor(t / 500));
      return pick('stand', Math.floor(now / 500));
    }
    if (m === 'walk') return pick('walk', Math.floor(t / WALK_MS) % 4);
    if (m === 'talk') return pick('talk', Math.floor(t / TALK_MS) % 2);
    if (m === 'drag') return pick('lift', Math.floor(t / LIFT_MS) % 2);
    // 서 있기: 대부분 1장째(눈 뜸), 3~7초마다 0.18초 2장째(웃는 눈)
    if (now >= nextBlink + BLINK_MS) nextBlink = now + rnd(BLINK_MIN, BLINK_MAX);
    return pick('stand', now >= nextBlink ? 1 : 0);
  }
  function draw(now) {
    if (P.ready < P.total) return;
    const L = look(Math.max(0, now - poseAt), now); // rAF 시각이 poseAt보다 이를 수 있음 (토리 펫에서 고친 버그)
    const key = L.a + ':' + L.f + ':' + L.flip + ':' + P.pixelated;
    if (key === lastKey) return;
    lastKey = key;
    const list = P.img[L.a], n = list.length;
    const pl = P.L.place[L.a], im = list[((L.f % n) + n) % n];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.imageSmoothingEnabled = !P.pixelated;
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(P.dpr, 0, 0, P.dpr, 0, 0);
    if (L.flip) { ctx.translate(cssW, 0); ctx.scale(-1, 1); }
    ctx.drawImage(im, pl.x, pl.y, pl.w, pl.h);
  }
  function loop(now) { try { draw(now); } finally { requestAnimationFrame(loop); } }

  // ---------- 말주머니 ----------
  function petLeft() { return view.petX != null ? view.petX : Math.round((winW - cssW) / 2); }
  function placeBubble() {
    const bw = wrap.offsetWidth, bh = document.getElementById('bubble').offsetHeight;
    const cx = petLeft() + cssW / 2;
    const lo = Math.max(4, view.left + 4), hi = Math.min(winW - 4, view.right - 4);
    let x = Math.round(cx - bw / 2); x = Math.max(lo, Math.min(x, hi - bw));
    const tailH = tail.height * TAIL_K;
    const top = window.innerHeight - headH - tailH - bh + 6;
    wrap.style.left = x + 'px'; wrap.style.top = Math.max(0, top) + 'px';
    const tw = tail.width * TAIL_K;
    const tx = Math.max(6, Math.min(Math.round(cx - x - tw / 2), bw - tw - 6));
    tail.style.left = tx + 'px'; tail.style.top = (bh - 2) + 'px'; // 꼬리 맨 윗줄이 말풍선 아래 테두리 2px를 덮음
  }
  // 줄바꿈 때 "~"·"~?"만 다음 줄로 떨어지지 않게 앞 글자에 붙임 (WORD JOINER)
  const glue = (t) => t.replace(/(\S)(~\??)/g, '$1\u2060$2');
  function showBubble(text, ms) {
    btext.textContent = glue(text);
    wrap.hidden = false; wrap.classList.remove('pop'); void wrap.offsetWidth; wrap.classList.add('pop');
    placeBubble();
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => hideBubble(true), ms);
  }
  function hideBubble(tell) {
    clearTimeout(bubbleTimer);
    if (wrap.hidden) return;
    wrap.hidden = true;
    if (tell) window.DP.send('pet:bubbleDone');
  }

  // ---------- 마우스 ----------
  // 두부 그림의 칠해진 곳(둘레 약 1px 여유) 또는 말주머니 위일 때만 마우스를 받는다. 나머지는 아래 창으로 통과
  function onPet(x, y) {
    const r = el.getBoundingClientRect();
    const sx = el.width / r.width, sy = el.height / r.height;
    const px = Math.floor((x - r.left) * sx), py = Math.floor((y - r.top) * sy);
    const rx = Math.max(1, Math.round(sx)), ry = Math.max(1, Math.round(sy));
    if (px < -rx || py < -ry || px >= el.width + rx || py >= el.height + ry) return false;
    const x0 = Math.max(0, px - rx), y0 = Math.max(0, py - ry);
    const w = Math.min(el.width, px + rx + 1) - x0, h = Math.min(el.height, py + ry + 1) - y0;
    if (w <= 0 || h <= 0) return false;
    const d = ctx.getImageData(x0, y0, w, h).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 40) return true;
    return false;
  }
  function onBubble(x, y) {
    if (wrap.hidden) return false;
    const r = wrap.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  let hit = false, down = false;
  function setHit(h) { if (h !== hit) { hit = h; window.DP.send('pet:hit', h); } }
  let lastMove = null; // 진단 (윈도우 forward 확인): 마지막으로 받은 mousemove 창 안 좌표·시각
  window.addEventListener('mousemove', (e) => { lastMove = { x: e.clientX, y: e.clientY, at: Date.now(), on: onPet(e.clientX, e.clientY) }; if (!down) setHit(onPet(e.clientX, e.clientY) || onBubble(e.clientX, e.clientY)); });
  document.addEventListener('mouseleave', () => { if (!down) setHit(false); });
  window.DP.on('pet:hitReset', () => { hit = null; }); // main 커서 감시가 통과를 바꿈 -> 다음 mousemove 판단(true·false)을 꼭 보냄 (오피스 펫과 같음)
  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (onBubble(e.clientX, e.clientY)) { // 말주머니 클릭 = 바로 닫기. 말풍선 메뉴면 버튼·입력칸이 받음, 두부 한 줄(tell)은 누르면 다음
      if (Dlg.open()) { Dlg.poke(); if (Dlg.mode() === 'tell' && !e.target.closest('button, input')) Dlg.answer(true); return; }
      hideBubble(true); return;
    }
    if (!onPet(e.clientX, e.clientY)) return;
    down = true; el.setPointerCapture(e.pointerId);
    window.DP.send('pet:dragStart');
  });
  const up = () => { if (!down) return; down = false; window.DP.send('pet:dragEnd'); };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (onPet(e.clientX, e.clientY) || onBubble(e.clientX, e.clientY)) window.DP.send('pet:menu');
  });

  // ---------- 말풍선 메뉴 (두부 기능, 2026-10-04) ----------
  // main(lib/talk.js)이 보낸 질문 하나를 말주머니 안에 그림: 두부 한 줄 + 선택지 / 시각 칩 + 입력칸 / 입력칸 / (tell) 누르면 다음
  // 고른 값만 돌려보냄 { id, value }. 값 검사·저장은 main. Esc = 닫기, 숫자 키 = 선택지, Enter = 적기·다음
  // 오른쪽 클릭으로 열면 아래에 "잠깐 숨기기 (10분) · 바탕화면 펫 끄기" 줄 (FOOT)
  const Dlg = (function () {
    const menu = document.getElementById('bmenu');
    const IDLE_MS = 90000;
    const MORE = { palette: { '.': null, b: '#86593A' }, frames: [['bbbbb', '.bbb.', '..b..']] }; // 누르면 다음 (5x3 갈색 삼각형, 무늬 디자인 8장) // 아무것도 안 하고 1분 반 = 닫기 (바탕화면에 메뉴가 계속 떠 있지 않게)
    let d = null, cur = null, idleT = null, composing = false;
    const mk = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };
    function answer(value) { if (!cur) return; window.DP.send('pet:dlgAnswer', { id: cur.id, value }); }
    function poke() { clearTimeout(idleT); if (d) idleT = setTimeout(() => answer(null), IDLE_MS); }
    function footer() {
      if (!d || !d.footer || menu.querySelector('.bfoot')) return;
      const f = mk('div', 'bfoot');
      FOOT.forEach(([act, label], i) => {
        if (i) f.appendChild(mk('span', 'sep'));
        const b = mk('button', 'bf', label); b.type = 'button'; b.dataset.act = act;
        b.addEventListener('click', (e) => { e.stopPropagation(); window.DP.send('pet:footer', { act }); });
        f.appendChild(b);
      });
      menu.appendChild(f);
    }
    // 무늬 에셋 그림 하나 (정수 배율, 픽셀 그대로). 그림이 없으면 빈 칸
    function pic(name, k, cls) {
      const sp = UI[name];
      if (!sp || !window.Pix) { const e = mk('span', cls || ''); e.style.width = e.style.height = '16px'; e.style.display = 'block'; return e; }
      const c = window.Pix.canvas(sp, 0, k || 1); c.className = 'px' + (cls ? ' ' + cls : ''); return c;
    }
    function form(q, withSkip) { // 한 줄 입력칸 + (넘어가기) + 적기
      const fm = mk('form', 'df'); fm.autocomplete = 'off';
      const inp = mk('input', 'dfi'); inp.type = 'text'; inp.spellcheck = false; inp.maxLength = q.max || 100; inp.placeholder = q.placeholder || ''; inp.value = q.value || '';
      inp.addEventListener('compositionstart', () => { composing = true; });
      inp.addEventListener('compositionend', () => { composing = false; });
      fm.appendChild(inp);
      if (withSkip && q.skip) { const sk = mk('button', 'dtx dfs', q.skip); sk.type = 'button'; sk.addEventListener('click', (e) => { e.stopPropagation(); answer({ skip: true }); }); fm.appendChild(sk); }
      const ok = mk('button', 'dfo', q.submit || '적기'); ok.type = 'submit'; fm.appendChild(ok);
      // 입력칸이 비었으면 "적기"는 꺼짐 모양 (누르는 것은 그대로: 빈 글이면 두부가 알려 줌, 흐름 그대로)
      const empty = () => ok.classList.toggle('empty', !inp.value.trim());
      inp.addEventListener('input', () => { poke(); empty(); }); empty();
      fm.addEventListener('submit', (e) => { e.preventDefault(); if (composing) return; answer({ text: inp.value }); });
      return fm;
    }
    // ---- 키보드 커서 (고름). 마우스 올림은 커서를 옮기지 않음 (하우스 대화창 규칙). 처음은 1번 ----
    let items = [], at = -1, hov = -1, paint = null;
    function setCur(i) {
      if (!items.length) return;
      at = Math.max(0, Math.min(items.length - 1, i));
      items.forEach((b, j) => b.classList.toggle('cur', j === at));
      if (paint) paint();
    }
    // 폭: 화면마다 (디자인 2장). 한 줄(tell)은 글 길이대로
    const WIDTH = { menu: 214, mood: 252, rating: 232, amount: 268, '': 214 };
    function setWidth(w) {
      const bub = document.getElementById('bubble');
      if (w) { bub.classList.add('fixw'); bub.style.setProperty('--bw', w + 'px'); } else { bub.classList.remove('fixw'); bub.style.removeProperty('--bw'); }
    }
    function askList(q, g) { // 첫 메뉴·기분·그 밖의 고르기: 한 줄에 하나
      q.choices.forEach((c, i) => {
        const hasIc = q.kind === 'menu' || q.kind === 'mood';
        const b = mk('button', 'dc' + (hasIc ? '' : ' noic')); b.type = 'button'; b.dataset.id = c.id;
        if (hasIc) { const ic = pic(c.icon, 1, 'di'); b.appendChild(ic); }
        b.appendChild(mk('span', 'dl', c.label));
        if (c.desc) b.appendChild(mk('span', 'dd', c.desc));
        b.appendChild(mk('span', 'dn', String(i + 1)));
        g.appendChild(b); items.push(b);
      });
    }
    function askHearts(q, g) { // 식사 하트 5개 + 넘어가기. 올린 하트(마우스) 또는 커서 하트까지 채움
      g.classList.add('hearts');
      q.choices.forEach((c, i) => {
        let b;
        if (c.id === 'skip') { b = mk('button', 'dc dtx', c.label); }
        else {
          b = mk('button', 'dc dh'); b.setAttribute('aria-label', c.label);
          if (UI.heart_full && UI.heart_empty) { b.appendChild(pic('heart_full', 2, 'on')); b.appendChild(pic('heart_empty', 2, 'off')); } else b.textContent = '♥';
          b.addEventListener('pointerenter', () => { hov = i; paint(); });
          b.addEventListener('pointerleave', () => { if (hov === i) { hov = -1; paint(); } });
        }
        b.type = 'button'; b.dataset.id = c.id; g.appendChild(b); items.push(b);
      });
      const nh = q.choices.filter((c) => c.id !== 'skip').length;
      paint = () => { const k = hov >= 0 ? hov + 1 : (at >= 0 && at < nh ? at + 1 : 0); items.forEach((b, j) => b.classList.toggle('fill', j < k)); };
    }
    function askAmounts(q, g) { // 먹은 양 4칸(위장 + 퍼센트) + 5번째 칸 넘어가기
      g.classList.add('amounts');
      q.choices.forEach((c) => {
        let b;
        if (c.id === 'skip') b = mk('button', 'dc dtx', c.label);
        else { b = mk('button', 'dc'); b.appendChild(pic('stomach_' + c.id, 1)); b.appendChild(mk('span', 'dl', c.label)); }
        b.type = 'button'; b.dataset.id = c.id; g.appendChild(b); items.push(b);
      });
    }
    function show(q) {
      cur = q; composing = false; items = []; at = -1; hov = -1; paint = null;
      btext.textContent = glue(q.text || '');
      menu.textContent = ''; menu.hidden = false; menu.dataset.mode = q.mode; menu.dataset.kind = q.kind || '';
      if (q.mode === 'ask') {
        const g = mk('div', 'dc-grid'); g.dataset.kind = q.kind || '';
        if (q.kind === 'rating') askHearts(q, g); else if (q.kind === 'amount') askAmounts(q, g); else askList(q, g);
        items.forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); answer(b.dataset.id); }));
        menu.appendChild(g);
        setWidth(WIDTH[q.kind] || WIDTH['']);
        setCur(0);
      } else if (q.mode === 'time') {
        if (q.row === 'wake' && q.picked && q.picked.bed) { const r0 = mk('div', 'dt-done'); r0.appendChild(mk('span', 'dt-name', q.bedRow)); r0.appendChild(mk('span', 'chip picked', q.picked.bed)); menu.appendChild(r0); }
        menu.appendChild(mk('span', 'dt-name', q.row === 'wake' ? q.wakeRow : q.bedRow));
        const r = mk('div', 'dt-row'); r.style.setProperty('--n', String(q.hours.length || 6));
        q.hours.forEach((h) => {
          const b = mk('button', 'chip' + (q.dot === h ? ' dot' : ''), h + '시'); b.type = 'button';
          if (q.dot === h) b.title = '오늘 적어 둔 시각';
          b.addEventListener('click', (e) => { e.stopPropagation(); answer({ pick: String(h).padStart(2, '0') + ':00' }); });
          r.appendChild(b);
        });
        menu.appendChild(r); menu.appendChild(form(q, false));
        setWidth(268);
      } else if (q.mode === 'input') {
        menu.appendChild(form(q, true));
        setWidth(268);
      } else { // tell: (물이면 컵 줄) + 오른쪽 아래 다음 표시
        const row = mk('div', 'dmore-row');
        if (q.cups && q.cups.of > 0) {
          const cups = mk('div', 'cups'); cups.setAttribute('aria-label', '물 ' + q.cups.n + '/' + q.cups.of);
          for (let i = 0; i < q.cups.of; i++) cups.appendChild(pic('water', 1, i < q.cups.n ? 'full' : 'empty'));
          row.appendChild(cups);
        }
        row.appendChild(window.Pix ? Object.assign(window.Pix.canvas(MORE, 0, 1), { className: 'px dmore' }) : mk('div', 'dmore'));
        menu.appendChild(row);
        setWidth(0);
      }
      footer();
      wrap.hidden = false; wrap.classList.remove('pop'); void wrap.offsetWidth; wrap.classList.add('pop');
      placeBubble(); fit(); focusField(); poke();
    }
    function focusField() { const f = menu.querySelector('.dfi'); if (f && document.activeElement !== f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }
    function fit() { // 말주머니가 창보다 크면 main에 자리 늘려 달라고
      const need = wrap.offsetHeight + tail.height * TAIL_K + headH + 8;
      if (need > window.innerHeight) window.DP.send('pet:room', need);
    }
    window.DP.on('pet:dlgOpen', (o) => { clearTimeout(bubbleTimer); d = { footer: !!o.footer }; cur = null; wrap.classList.add('dlg'); });
    window.DP.on('pet:dlg', (q) => { if (!d) { d = { footer: false }; wrap.classList.add('dlg'); } show(q); });
    window.DP.on('pet:dlgError', (q) => { if (!cur || q.id !== cur.id) return; btext.textContent = glue(q.text); placeBubble(); fit(); focusField(); });
    window.DP.on('pet:dlgFooter', () => { if (d) { d.footer = true; footer(); placeBubble(); fit(); } });
    function end(hide) { d = null; cur = null; items = []; at = -1; paint = null; clearTimeout(idleT); menu.textContent = ''; menu.hidden = true; setWidth(0); wrap.classList.remove('dlg'); if (hide) wrap.hidden = true; }
    window.DP.on('pet:dlgEnd', () => { if (d) end(true); });
    window.addEventListener('focus', focusField); // main이 창에 키보드를 준 뒤
    window.addEventListener('keydown', (e) => {
      if (!d || !cur) return;
      poke();
      const inField = document.activeElement && document.activeElement.classList.contains('dfi');
      if (inField && (e.isComposing || e.keyCode === 229 || composing)) return; // 한글 조합 중
      if (e.key === 'Escape') { e.preventDefault(); answer(null); return; }
      if (inField) return; // Enter = form submit
      if (cur.mode === 'tell' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); answer(true); return; }
      if (cur.mode === 'ask' && /^[1-9]$/.test(e.key)) { const c = cur.choices[Number(e.key) - 1]; if (c) { e.preventDefault(); answer(c.id); } return; }
      if (cur.mode === 'ask' && items.length) { // 화살표 = 커서 옮기기, Enter·Space = 커서 줄 고르기
        const mv = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (mv) { e.preventDefault(); setCur(at + mv); return; }
        if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); setCur(e.key === 'Home' ? 0 : items.length - 1); return; }
        if ((e.key === 'Enter' || e.key === ' ') && at >= 0) { e.preventDefault(); answer(items[at].dataset.id); }
      }
    });
    return { open: () => !!d, mode: () => (cur ? cur.mode : null), answer, poke, end: () => end(false),
      state: () => ({ open: !!d, footer: !!(d && d.footer), mode: cur ? cur.mode : null, id: cur ? cur.id : null, text: btext.textContent, choices: cur && cur.mode === 'ask' ? cur.choices.map((c) => c.label) : [], cursor: at, icons: menu.querySelectorAll('.dc canvas.di').length,
        hearts: menu.querySelectorAll('.hearts .dh.fill').length, cups: menu.querySelector('.cups') ? { full: menu.querySelectorAll('.cups canvas.full').length, all: menu.querySelectorAll('.cups canvas').length } : null,
        bubbleW: document.getElementById('bubble').offsetWidth,
        chips: Array.from(menu.querySelectorAll('.chip')).map((x) => x.textContent), field: menu.querySelector('.dfi') ? { value: menu.querySelector('.dfi').value, focused: document.activeElement === menu.querySelector('.dfi') } : null,
        foot: Array.from(menu.querySelectorAll('.bf')).map((x) => x.textContent), wrapH: wrap.offsetHeight, winH: window.innerHeight, top: wrap.style.top }) };
  })();
  window.__petDlg = Dlg;

  // 개발 확인용 (main의 cmd.json js 명령으로 읽음)
  window.__petDebug = () => ({ pose, bubble: wrap.hidden ? null : btext.textContent, hit, lastMove, view, png: P ? { ready: P.ready, total: P.total, pixelated: P.pixelated, pix: !!P.pix, last: lastKey, cssW, cssH, headH, dpr: P.dpr } : null });
  window.__petOnPet = onPet;
  window.__petBlinkNow = (hold) => { BLINK_MS = hold || 180; nextBlink = performance.now(); lastKey = ''; };
})();
