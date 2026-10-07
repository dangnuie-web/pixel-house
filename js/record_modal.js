// 집 TV 기록 창 (2026-10-08 제작자: TV 누르면 기록 폼 [영화|연극] 탭, 쌓인 기록은 리스트형). 비트. js/book_modal.js와 같은 틀 (같은 CSS .bm)
//   TV장(tv_cabinet)을 누르거나 앞에서 Space -> 집 화면 위 창. 사이드바 탭은 안 바뀜 (생활일지 > 영화·연극 탭에 같은 목록)
//   안 = js/record_list.js의 html·bind ([영화|연극] 알약, 달마다 리스트, + 기록하기 폼, 펼치기 -> 고치기·지우기, 되돌리기)
//   여는 말 = 부기 record.open (그 탭 것)
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
  const BS = () => root.PHRecordList, Life = () => root.PHLife;
  const PL = () => (root.PH_LINES && root.PH_LINES.uiPlain && root.PH_LINES.uiPlain.recordForm) || {};
  const q = (s) => el.querySelector(s);

  function build() {
    if (el) return el;
    const stage = $('stage'); if (!stage) return null;
    el = document.createElement('div');
    el.id = 'rm'; el.className = 'bm rm'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '영화·연극 기록');
    el.innerHTML = `<div class="bm-box" tabindex="-1">
      <div class="bm-head"><b class="bm-title"></b></div>
      <div class="bm-body life"></div>
      <div class="bm-esc" aria-hidden="true"></div></div>`;
    stage.appendChild(el);
    q('.bm-title').textContent = PL().windowTitle || '영화·연극';
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
    if (focus) { const f = [...el.querySelectorAll('[data-focus]')].find((x) => x.dataset.focus === focus); if (f) f.focus({ preventScroll: false }); }
  }

  function blockedNow() {
    const g = root.PHGame && root.PHGame.G;
    return !g || g.mode !== 'play' || !g.active || !!g.dialog || (root.PHDialog && root.PHDialog.isOpen()) ||
      ['PHWardrobe', 'PHWaterModal', 'PHInventory', 'PHFridgeMemo', 'PHBookModal', 'PHBucketMemo', 'PHMemoWall'].some((k) => root[k] && root[k].isOpen && root[k].isOpen());
  }
  // interact.js가 부름 (책꽂이). from = 누른 물건 type, line = 두부 한 줄(사이드바)
  //   kind = 처음 고를 탭 ('영화' | '연극'). line이 없으면 그 탭의 여는 말 (부기 record.open)
  async function open(from, line, kind) {
    if (st.open || blockedNow() || !BS()) return false;
    build(); if (!el) return false;
    const g = root.PHGame && root.PHGame.G; if (g) g.held = []; // 누르던 방향키가 남아 걷지 않게 (열린 동안 제작자은 멈춤)
    if (root.PHGame && root.PHGame.hideBubble) root.PHGame.hideBubble();
    st.open = true; st.from = from || null; st.opened++;
    if (Life() && !Life().data) { try { await Life().load(); } catch (e) { /* 아래에서 못 읽음 글 */ } }
    BS().set(['영화', '연극'], kind || BS().kind || '영화'); BS().reset();
    el.hidden = false; fit(); paint(BS().canWrite() ? 'rc-add' : null);
    el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
    if (!el.contains(document.activeElement)) q('.bm-box').focus({ preventScroll: true });
    if (line && root.PHApp && root.PHApp.sideSay) root.PHApp.sideSay(line); else BS().sayOpen();
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
    return { open: st.open, from: st.from, opened: st.opened, rows: body ? body.querySelectorAll('.rc-it').length : 0, pills: body ? [...body.querySelectorAll('.rc-bar .rc-pill')].map((b) => b.textContent) : [],
      overlay: body && body.querySelector('.bk-overlay') ? body.querySelector('.bk-overlay').dataset.kind : null, list: BS() ? BS().state() : null };
  }
  Object.assign(BM, { open, close, isOpen: () => st.open, state, build, fit, paint, blockedNow });
  root.PHRecordModal = BM;
})(window);
