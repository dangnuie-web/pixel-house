// 집 책꽂이 모달 (2026-10-03 제작자: "책꽂이 누르면 생활일지로 바로 가지 말고, 독서 폴더 부분만 모달로"). 비트
//   침실 책꽂이(bookshelf)를 누르거나 앞에서 Space -> 집 화면 위 창. 사이드바 탭은 안 바뀜 (생활일지 > 독서 탭은 그대로 있음)
//   안 = 생활일지 독서 탭과 같은 내용: js/bookshelf.js의 html·bind를 그대로 씀 (꽂힌 책 n권, 기록하기, 나무 책꽂이, 빈 책꽂이 글, 이번 달 읽은 쪽,
//     책 누르기 -> 상세, 고치기·빼기·보관함 되돌리기). 물·요가·러닝·모아 보기 폴더 탭은 넣지 않음
//   모양 = 정수기 물 창·인벤토리와 같은 결 (둥근 베이지 박스, 먹색 테두리, du 단위). css/book_modal.css
// 키: Esc = 닫기 (입력·상세 창이 떠 있으면 그 창이 먼저 닫힘). 바깥(어두운 곳) 클릭 = 닫기
//   열려 있는 동안 집 조작(걷기·Space·물건)은 막음: 창 안 키는 창에서 멈추고(글자 입력은 그대로 됨), 창 밖 키는 window 잡기 단계에서 막음
(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const DU_BASE = 432;
  const st = { open: false, from: null, opened: 0 };
  const BM = {};
  let el = null;
  const BS = () => root.PHBookshelf, Life = () => root.PHLife;
  const PL = () => (root.PH_LINES && root.PH_LINES.uiPlain && root.PH_LINES.uiPlain.bookModal) || {};
  const q = (s) => el.querySelector(s);

  function build() {
    if (el) return el;
    const stage = $('stage'); if (!stage) return null;
    el = document.createElement('div');
    el.id = 'bm'; el.className = 'bm'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '독서 책꽂이');
    el.innerHTML = `<div class="bm-box" tabindex="-1">
      <div class="bm-head"><b class="bm-title"></b><span class="bm-esc" aria-hidden="true"></span></div>
      <div class="bm-body life"></div></div>`; // Esc 안내 = 머리 줄 오른쪽 (식사 기록 창과 같은 자리, D4 ⑥)
    stage.appendChild(el);
    q('.bm-title').textContent = PL().title || '독서';
    q('.bm-esc').textContent = PL().keys || 'Esc 닫기';
    el.addEventListener('mousedown', (e) => { if (e.target === el) { e.preventDefault(); close(); } });
    // 창 안 키: 집(document 듣기)으로 안 넘김. Esc는 안쪽 입력·상세 창이 먼저 받고(그 창이 멈춤), 남은 Esc만 여기서 닫기
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); close(); }
    });
    el.addEventListener('keyup', (e) => e.stopPropagation());
    const cv = $('cv');
    if (cv && root.ResizeObserver) new ResizeObserver(fit).observe(cv);
    root.addEventListener('resize', fit);
    return el;
  }
  function fit() { if (!el) return; const cv = $('cv'), h = cv ? cv.getBoundingClientRect().height : 0; if (h > 0) el.style.setProperty('--du', (h / DU_BASE) + 'px'); }

  // 책꽂이 그리기 (bookshelf.js가 저장·고르기 뒤에 이 함수로 다시 그림). focus = 그린 뒤 포커스를 둘 data-focus 값
  function paint(focus) {
    if (!el || !st.open) return;
    const body = q('.bm-body'), L = Life();
    body.innerHTML = L && L.data ? BS().html(L.data) : `<p class="fmt">${(root.PH_LINES && root.PH_LINES.ui && root.PH_LINES.ui.browserOnly) || '생활 기록을 읽지 못했어요.'}</p>`;
    if (L && L.data) BS().bind(body, paint);
    if (focus) { const f = [...el.querySelectorAll('[data-focus]')].find((x) => x.dataset.focus === focus); if (f) (root.PHFocusBack ? root.PHFocusBack.back(f, { scroll: true }) : f.focus({ preventScroll: false })); } // D4 ⑤
  }

  function blockedNow() {
    const g = root.PHGame && root.PHGame.G;
    return !g || g.mode !== 'play' || !g.active || !!g.dialog || (root.PHDialog && root.PHDialog.isOpen()) ||
      ['PHWardrobe', 'PHWaterModal', 'PHInventory', 'PHFridgeMemo', 'PHRecordModal', 'PHBucketMemo'].some((k) => root[k] && root[k].isOpen && root[k].isOpen());
  }
  // interact.js가 부름 (책꽂이). from = 누른 물건 type, line = 두부 한 줄(사이드바)
  async function open(from, line) {
    if (st.open || blockedNow() || !BS()) return false;
    build(); if (!el) return false;
    const g = root.PHGame && root.PHGame.G; if (g) g.held = []; // 누르던 방향키가 남아 걷지 않게 (열린 동안 제작자은 멈춤)
    if (root.PHGame && root.PHGame.hideBubble) root.PHGame.hideBubble();
    st.open = true; st.from = from || null; st.opened++;
    if (Life() && !Life().data) { try { await Life().load(); } catch (e) { /* 아래에서 못 읽음 글 */ } }
    BS().reset();
    el.hidden = false; fit(); paint(BS().canWrite() ? 'bk-add' : null);
    el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
    if (!el.contains(document.activeElement)) q('.bm-box').focus({ preventScroll: true });
    if (line && root.PHApp && root.PHApp.sideSay) root.PHApp.sideSay(line);
    return true;
  }
  function close() {
    if (!st.open) return;
    if (BS() && BS().busy) return; // 저장 중에는 안 닫음 (끝나면 닫을 수 있음)
    st.open = false; el.hidden = true;
    if (BS()) BS().reset();
    q('.bm-body').innerHTML = ''; // 탭 쪽은 탭을 열 때 새 글로 다시 그림
    const stage = $('stage'); if (stage) stage.focus({ preventScroll: true });
  }
  // 창 밖에 포커스가 있을 때 오는 키(드묾): 집으로 안 넘김, Esc = 닫기
  function onKey(e) {
    if (!st.open || (el && el.contains(e.target))) return;
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') e.preventDefault();
  }
  function onKeyUp(e) { if (st.open && !(el && el.contains(e.target))) e.stopPropagation(); }
  root.addEventListener('keydown', onKey, true);
  root.addEventListener('keyup', onKeyUp, true);

  function state() {
    const body = el && q('.bm-body');
    return { open: st.open, from: st.from, opened: st.opened, books: body ? body.querySelectorAll('.bk-book').length : 0,
      count: body && body.querySelector('.bk-count') ? body.querySelector('.bk-count').textContent : '', overlay: body && body.querySelector('.bk-overlay') ? body.querySelector('.bk-overlay').dataset.kind : null,
      folderTabs: el ? el.querySelectorAll('.jn-tab, .jn-tabs').length : 0 };
  }
  Object.assign(BM, { open, close, isOpen: () => st.open, state, build, fit, paint, blockedNow });
  root.PHBookModal = BM;
})(window);
