// 생활 습관 탭 "기록" 카드에서 바로 기록하기 (2026-10-08 비트, 로드맵 3-1단계 제작자 피드백).
//   독서·영화·연극·새 기록 항목(## 기록 항목)이 기록 카드 안 한 줄씩 + "기록하기" 버튼 (대변·식사 줄과 같은 모양, js/logs_view.js)
//   독서 = 생활습관 표 줄(또는 화면에만 있는 줄)에 버튼만 붙임. 영화·연극·새 항목 = 표 줄이 아니라 ## 기록 항목에서 온 줄 (화면에만)
//   누르면 그 자리(생활 습관 탭)에 폼 막: 독서 = 책꽂이 폼(js/bookshelf.js), 나머지 = 제목·날짜·요약 폼(js/record_list.js). 생활일지로 넘어가지 않음
//   폼 상태는 책꽂이·기록 목록과 같은 것을 씀 (B.form / R.form). 숨은 칸(.rq-host)에 그리고 폼 막만 보이게 (css/records.css)
// 쓰기는 모두 책꽂이·기록 목록의 저장(메인 ph:bookAdd / ph:recordAdd)을 그대로 씀
(function (root) {
  'use strict';
  const Life = root.PHLife, RW = root.PHRecordWrite;
  if (!Life || !RW) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BS = () => root.PHBookshelf, RL = () => root.PHRecordList, BW = () => root.PHBookWrite;
  const PL = () => (root.PH_LINES && root.PH_LINES.uiPlain && root.PH_LINES.uiPlain.recordQuick) || {};
  const md = (s) => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(s || ''); return m ? `${Number(m[1])}/${Number(m[2])}` : ''; };
  const Q = { open: null, el: null }; // open = { type: 'book' | 'record', kind }
  const readingOn = () => !root.PHFurnish || root.PHFurnish.isOn('reading');

  // 기록 항목 줄 글: "n개 · 마지막 10/3"
  function recordNote(P, kind) {
    const list = RW.listOf(P, kind); if (!list.length) return PL().none || '아직 기록 없음';
    const last = list.find((r) => RW.isDate(r.date));
    return (PL().count || '{n}개').replace('{n}', list.length) + (last ? ' · ' + (PL().last || '마지막 {date}').replace('{date}', md(last.date)) : '');
  }
  function bookNote(d) {
    let n = 0; try { n = BW() ? BW().parse(d.lines || []).books.length : 0; } catch (e) { n = 0; }
    return n ? (PL().books || '꽂힌 책 {n}권').replace('{n}', n) : (PL().none || '아직 기록 없음');
  }
  function button(type, kind) {
    return `<button type="button" class="lg-open rq-open" data-type="${type}" data-kind="${esc(kind)}" data-focus="rq-open:${esc(kind)}">${esc(PL().open || '기록하기')}</button>`;
  }
  function rowBox(note, type, kind, canW) {
    const box = document.createElement('div'); box.className = 'lg-hab-row rq-row';
    box.innerHTML = `<span class="slot-note rq-note">${esc(note)}</span>` + (canW ? button(type, kind) : '');
    return box;
  }

  // ---- 생활 습관 탭을 그린 뒤 (logs_view 다음): 기록 카드에 줄·버튼 ----
  function mount(tab, el, d) {
    if (tab !== 'habits' || !d) return;
    const card = el.querySelector('.card[data-card="기록"]'); if (!card) return;
    let ul = card.querySelector(':scope > ul'); if (!ul) { ul = document.createElement('ul'); card.appendChild(ul); }
    Q.el = el;
    let added = 0;
    // 독서: 표 줄(또는 logs_view가 화면에만 붙인 줄)에 버튼
    const RF = root.PHFeatures && root.PHFeatures.get('reading');
    const rli = RF && readingOn() ? ul.querySelector(`:scope > li[data-habit="${RF.habit}"]`) : null;
    if (rli && !rli.querySelector('.rq-row')) { rli.classList.add('lg-hab', 'rq-hab'); rli.dataset.rq = 'book'; rli.appendChild(rowBox(bookNote(d), 'book', RF.habit, !!(BS() && BS().canWrite()))); }
    // 영화·연극·새 항목: ## 기록 항목에서 (표 줄 아님 = 화면에만)
    const P = RW.parse(d.lines || []), canR = !!(RL() && RL().canWrite());
    P.kinds.forEach((k) => {
      if (ul.querySelector(`:scope > li[data-record="${CSS.escape(k.name)}"]`)) return;
      const li = document.createElement('li'); li.className = 'lg-hab rq-hab rq-kind'; li.dataset.record = k.name; li.dataset.rq = 'record';
      li.innerHTML = `<b>${esc(k.name)}</b><span class="tgt">${esc(PL().target || '제목·날짜·요약')}</span>`;
      li.appendChild(rowBox(recordNote(P, k.name), 'record', k.name, canR));
      ul.appendChild(li); added++;
    });
    if (added) { const n = card.querySelector('h3 small'); if (n) n.textContent = String(Number(n.textContent || 0) + added); }
    ul.querySelectorAll('.rq-hab').forEach((li) => {
      const b = li.querySelector('.rq-open'); if (!b) return;
      b.addEventListener('click', (e) => { e.stopPropagation(); open(b.dataset.type, b.dataset.kind); });
      li.addEventListener('click', (e) => { if (e.target.closest('button, a, input')) return; open(b.dataset.type, b.dataset.kind); });
    });
    // 폼이 열린 채 다시 그려짐(저장 충돌 등) -> 폼 다시 띄움
    if (Q.open && ((Q.open.type === 'book' && BS() && BS().form) || (Q.open.type === 'record' && RL() && RL().form))) paintForm();
    else Q.open = null;
  }

  // ---- 폼 막 (숨은 칸에 그리고 막만 보임) ----
  function host() {
    let h = Q.el && Q.el.querySelector('.rq-host');
    if (!h && Q.el) { h = document.createElement('div'); h.className = 'rq-host'; Q.el.appendChild(h); }
    return h;
  }
  function paintForm(focus) {
    const h = host(); if (!h || !Life.data || !Q.open) return;
    const isBook = Q.open.type === 'book', M = isBook ? BS() : RL();
    if (!M || !M.form) { // 저장·그만두기 뒤 = 폼 닫힘 -> 탭 다시 그림 (줄 글이 새 기록으로)
      Q.open = null; h.innerHTML = '';
      Life.paint('habits', Q.el);
      const b = Q.last && Q.el.querySelector(`.rq-open[data-kind="${CSS.escape(Q.last)}"]`); if (b) (root.PHFocusBack ? root.PHFocusBack.back(b) : b.focus({ preventScroll: true })); // D4 ⑤ js/focus_back.js
      return;
    }
    h.innerHTML = M.html(Life.data);
    M.bind(h, paintForm);
    const f = focus && [...h.querySelectorAll('[data-focus]')].find((x) => x.dataset.focus === focus);
    if (f) f.focus(); else { const t = h.querySelector(isBook ? '.bk-in-title' : '.rc-in-title'); if (t) t.focus(); }
  }
  function open(type, kind) {
    if (!Q.el) return false;
    Q.last = kind;
    if (type === 'book') {
      const B = BS(); if (!B || !B.canWrite()) return false;
      Q.open = { type, kind }; B.reset(); B.bind(host() || document.createElement('div'), paintForm);
      B.openForm('add'); // 부르면 repaint -> paintForm
      return true;
    }
    const R = RL(); if (!R || !R.canWrite()) return false;
    Q.open = { type, kind }; R.reset(); R.set([kind], kind); R.bind(host() || document.createElement('div'), paintForm);
    R.openForm('add'); R.sayOpen();
    return true;
  }
  function state() { const h = Q.el && Q.el.querySelector('.rq-host'); return { open: Q.open && Object.assign({}, Q.open), form: !!(h && h.querySelector('.bk-overlay')), rows: Q.el ? [...Q.el.querySelectorAll('[data-card="기록"] .rq-hab')].map((li) => (li.dataset.record || li.dataset.habit) + ':' + ((li.querySelector('.rq-note') || {}).textContent || '')) : [] }; }

  (Life.renderHooks = Life.renderHooks || []).push(mount);
  root.PHRecordQuick = Object.assign(Q, { mount, open, state, paintForm });
})(typeof window !== 'undefined' ? window : globalThis);
