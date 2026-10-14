// 포커스 되돌리기 (D4 ⑤ 2026-10-14 비트): 창을 닫거나 다시 그린 뒤 버튼(기록하기 등)으로 포커스를 돌려줄 때, 주황 테(:focus-visible)는 키보드로 다닐 때만
//   원인: 마우스로 [기록하기] -> 창 -> Esc 로 닫으면, 크로미움이 Esc(키 입력) 뒤 script focus() 를 "키보드 포커스"로 봐 버튼에 주황 테가 남았음(다른 곳을 누를 때까지)
//   규칙: 마지막으로 다닌 방법을 기억 = 마우스 누름 'pointer' / Tab·화살표·(입력칸 밖) Enter·Space 'key'. Esc·글자 치기·⌘(Ctrl)Enter 는 바꾸지 않음
//   back(el) = el.focus({ preventScroll, focusVisible: 키보드로 다니던 중일 때만 })
(function (root) {
  'use strict';
  let mode = 'pointer';
  const typing = (t) => !!(t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]'));
  if (root.addEventListener) {
    root.addEventListener('pointerdown', () => { mode = 'pointer'; }, true);
    root.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k === 'Tab' || /^Arrow/.test(k)) { if (!(k.startsWith('Arrow') && typing(e.target))) mode = 'key'; return; }
      if ((k === 'Enter' || k === ' ') && !e.metaKey && !e.ctrlKey && !typing(e.target)) mode = 'key';
    }, true);
  }
  function back(el, opt) {
    if (!el || !el.focus) return;
    el.focus({ preventScroll: !(opt && opt.scroll), focusVisible: mode === 'key' });
  }
  root.PHFocusBack = { back, mode: () => mode };
})(typeof window !== 'undefined' ? window : globalThis);
