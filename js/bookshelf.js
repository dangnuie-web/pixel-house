// 독서 책꽂이 (2026-10-03 비트, journal 브랜치). 생활일지 > 독서 탭 안 (js/journal.js가 html·bind를 부름) + 집 책꽂이 모달 (js/book_modal.js, 같은 html·bind)
//   선반 여러 단(하우스 나무색)에 세로 책등이 왼쪽부터 읽은 날짜 순으로. 빈 선반 3단에서 시작, 넘치면 단이 늘어남
//   책등: 표지색, 세로 제목(길면 줄임), 위아래 띠 장식. 높이·두께·띠 모양은 제목+날짜로 정해짐 (다시 그려도 같은 모양)
//   "기록하기" -> 입력 창 (표지색 칩, 제목 필수, 읽은 날짜(안 고르면 오늘 = 메인이 6시 경계로 정함), 요약 여러 줄)
//   저장 -> 책이 위에서 내려와 꽂힘(짧게, 움직임 줄이기 설정이면 없음) -> 사이드바 두부 한 줄 (lines ui.book, js/data/journal_lines.js)
//   책 누르기 -> 상세 (제목, 날짜, 색, 요약) + 고치기 / 빼기(## 독서 보관으로) / 닫기. 보관함에서 되돌리기
//   (2026-10-08 뺌) 위쪽 "이번 달 읽은 쪽" 줄. 다 본 책만 제목·날짜·요약(+표지색)으로 꽂음
// 쓰기는 모두 메인 (electron/book_ipc.js, window.PHBookDesktop). 화면은 책 값·읽은 시각만 보냄
// 계산 함수(spine, shortTitle, hash)는 Node 시험에서도 씀
(function (root) {
  'use strict';
  const BW = root.PHBookWrite || (typeof require !== 'undefined' ? require('./book_write.js') : null);

  // ---- 계산 (그림 없음) ----
  function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  // 책등 모양: 높이 h(px), 두께 w(px), 띠 모양 band(0~3). 선반 한 칸 높이 안 (SPINE.maxH)
  const SPINE = { minH: 96, maxH: 126, minW: 26, maxW: 38 };
  function spine(b) {
    const k = hash((b.title || '') + '|' + (b.date || ''));
    return { h: SPINE.minH + (k % (SPINE.maxH - SPINE.minH + 1)), w: SPINE.minW + ((k >>> 8) % (SPINE.maxW - SPINE.minW + 1)), band: (k >>> 16) % 4 };
  }
  // 세로 제목: 책등 높이에 들어가는 글자 수까지, 넘치면 끝을 … (글자 하나 = 11px 글자 + 1px 자간 = 12px, 위아래 여백·테 22px. css/journal.css .bk-title과 같이 바꿈)
  function shortTitle(title, h) {
    const chars = Array.from(String(title || '')), n = Math.max(2, Math.floor((h - 22) / 12));
    return chars.length <= n ? chars.join('') : chars.slice(0, n - 1).join('') + '…';
  }
  // 표지색이 밝으면 먹색 글자, 어두우면 크림 글자
  function lightCover(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return false;
    const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b > 150;
  }
  const calc = { hash, spine, shortTitle, lightCover, SPINE };
  if (typeof document === 'undefined') { if (typeof module !== 'undefined' && module.exports) module.exports = calc; return; }

  // ---- 화면 ----
  const S = root.PH_SETTINGS, Md = root.PHLifeMd, Life = root.PHLife;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const dayName = (s) => { const d = Md.dateOf(s); if (d == null) return String(s || ''); const x = new Date(d); return `${x.getMonth() + 1}월 ${x.getDate()}일 (${WD[x.getDay()]})`; };
  const D = () => root.PHBookDesktop;
  const canWrite = () => !!(D() && D().add);
  const L = () => (root.PH_LINES && root.PH_LINES.ui && root.PH_LINES.ui.book) || {};
  const BF = () => (root.PH_LINES && root.PH_LINES.uiPlain && root.PH_LINES.uiPlain.bookForm) || {}; // 2026-10-08 부기 원고 화면 글
  const colors = () => (Array.isArray(S.BOOK_COLORS) && S.BOOK_COLORS.length ? S.BOOK_COLORS : BW.COLORS).filter((c) => BW.COLOR_NAMES.includes(c.name));
  const hexOf = (name) => { const c = colors().find((x) => x.name === name) || BW.COLORS.find((x) => x.name === name); return c ? c.hex : '#B07A4F'; };
  // 상태 (다시 그려도 유지): form = null | { mode: 'add' | 'edit', key }, draft = 입력 중인 값, detail = 고른 책 key, just = 방금 꽂힌 책 key
  const B = { form: null, draft: null, detail: null, just: null, err: '', busy: false, shelf: [], archive: [], said: null, now: () => Life.now() };
  const today = () => BW.logDay(B.now(), S.DAY_START_HOUR);
  const keyOf = (b) => ({ date: b.date, title: b.title });
  const sameKey = (a, b) => !!a && !!b && a.date === b.date && a.title === b.title;

  function dubuNote(text) { return `<div class="life-dubu"><canvas class="dubu-mini" width="16" height="20" aria-hidden="true"></canvas><p>${esc(text)}</p></div>`; }
  function bookHtml(b, i) {
    const sp = spine(b), hex = b.hex || hexOf(b.color), just = sameKey(B.just, b);
    return `<button type="button" class="bk-book${just ? ' just' : ''}" data-i="${i}" data-date="${esc(b.date)}" data-color="${esc(b.color)}" data-focus="bk:${i}"
      aria-label="${esc(b.title)}, ${esc(dayName(b.date))} 읽음. 눌러서 자세히" title="${esc(b.title)}"
      style="--c:${hex};--bh:${sp.h}px;--bw:${sp.w}px"><span class="bk-spine band${sp.band} ${lightCover(hex) ? 'light' : 'dark'}"><i class="bk-band t" aria-hidden="true"></i><span class="bk-title" aria-hidden="true">${esc(shortTitle(b.title, sp.h))}</span><i class="bk-band b" aria-hidden="true"></i></span></button>`;
  }
  function html(d) {
    const P = BW.parse(d.lines || []);
    B.shelf = P.shelf; B.archive = P.archive;
    // 2026-10-08 제작자: 독서 쪽수 칸 빼기 -> "이번 달 읽은 쪽" 줄 없앰. 다 본 책만 책꽂이에 (폼 안내 글)
    let h = '<div class="bookshelf">';
    h += `<div class="bk-bar"><p class="bk-count">꽂힌 책 <b>${P.shelf.length}</b>권</p>${canWrite() ? '<button type="button" class="bk-add" data-focus="bk-add">기록하기</button>' : ''}</div>`;
    if (P.error) h += `<p class="fmt">${esc(P.error)}</p>`;
    h += `<div class="bk-case" role="group" aria-label="책꽂이"><div class="bk-shelf">${P.shelf.map(bookHtml).join('')}</div>` +
      (P.shelf.length ? '' : `<p class="bk-empty">${esc(L().empty || '아직 꽂힌 책이 없어요냥~')}</p>`) + '</div>';
    if (P.archive.length) {
      h += `<details class="bk-arch" ${B.archOpen ? 'open' : ''}><summary>보관함 <small>${P.archive.length}</small></summary><ul>` +
        P.archive.map((b, i) => `<li data-i="${i}"><i class="bk-chip" style="--c:${b.hex || hexOf(b.color)}" aria-hidden="true"></i><b>${esc(b.title)}</b><span>${esc(dayName(b.date))}</span>${b.archived ? `<small>${esc(dayName(b.archived))}에 뺌</small>` : ''}` +
          (canWrite() ? `<button type="button" class="bk-restore" data-i="${i}" data-focus="bk-restore:${i}">되돌리기</button>` : '') + '</li>').join('') + '</ul></details>';
    }
    if (B.form) h += formHtml();
    else if (B.detail) h += detailHtml();
    return h + '</div>';
  }
  function formHtml() {
    const v = B.draft || {}, edit = B.form.mode === 'edit', t = today();
    const chips = colors().map((c) => `<button type="button" class="bk-color ${v.color === c.name ? 'on' : ''}" role="radio" aria-checked="${v.color === c.name}" data-color="${esc(c.name)}" data-focus="bk-color:${esc(c.name)}" aria-label="${esc(c.name)}" title="${esc(c.name)}" style="--c:${c.hex}"></button>`).join('');
    return `<div class="bk-overlay" data-kind="form"><form class="bk-dlg bk-form" role="dialog" aria-modal="true" aria-labelledby="bk-form-name" novalidate>
      <div class="bk-name" id="bk-form-name">${edit ? '책 기록 고치기' : '독서 기록하기'}</div>
      <div class="bk-row"><span class="bk-lab" id="bk-color-lab">표지색</span><span class="bk-colors" role="radiogroup" aria-labelledby="bk-color-lab">${chips}</span></div>
      <label class="bk-row"><span class="bk-lab">제목</span><input class="bk-in-title${B.err && /제목/.test(B.err) ? ' bad' : ''}" maxlength="${BW.TITLE_MAX}" autocomplete="off" placeholder="책 제목 (꼭 적어 주세요)" value="${esc(v.title || '')}" data-focus="bk-title"></label>
      <p class="bk-err rc-err" role="alert">${esc(B.err)}</p>
      <label class="bk-row"><span class="bk-lab">${esc(BF().date || '다 읽은 날')}</span><input class="bk-in-date" type="date" max="${t}" value="${esc(v.date || '')}" data-focus="bk-date"><small class="bk-hint">${v.date ? '' : '고르지 않으면 오늘로 적어요'}</small></label>
      <label class="bk-row top"><span class="bk-lab">요약·줄거리</span><textarea class="bk-in-sum" rows="5" maxlength="${BW.SUMMARY_MAX}" placeholder="${esc(BF().summaryHolder || '기억하고 싶은 줄거리, 느낌 (비워 둬도 돼요)')}" data-focus="bk-sum">${esc(v.summary || '')}</textarea></label>
      <p class="bk-note">${esc(BF().note || '다 읽은 책만 책꽂이에 꽂혀요')}</p>
      <div class="bk-btns"><button type="button" class="bk-cancel">그만두기</button><button type="submit" class="bk-save">${edit ? '고치기' : '저장'}</button></div>
    </form></div>`;
  }
  function detailHtml() {
    const b = B.shelf.find((x) => sameKey(x, B.detail)); if (!b) return '';
    const hex = b.hex || hexOf(b.color);
    return `<div class="bk-overlay" data-kind="detail"><div class="bk-dlg bk-detail" role="dialog" aria-modal="true" aria-labelledby="bk-d-title">
      <div class="bk-name">책 기록</div>
      <div class="bk-d-top"><span class="bk-d-spine" style="--c:${hex}" aria-hidden="true"></span><div><h3 id="bk-d-title">${esc(b.title)}</h3>
        <p class="bk-d-meta"><span class="bk-d-date">${esc(dayName(b.date))} 읽음</span> · <span class="bk-d-color"><i class="bk-chip" style="--c:${hex}"></i>${esc(b.color || '색 없음')}</span></p></div></div>
      ${b.summary ? `<div class="bk-d-sum">${esc(b.summary)}</div>` : `<p class="bk-d-none">${esc(L().noSummary || '요약은 비어 있어요.')}</p>`}
      <div class="bk-btns">${canWrite() ? '<button type="button" class="bk-edit" data-focus="bk-edit">고치기</button><button type="button" class="bk-archive">빼기 (보관함으로)</button>' : ''}<button type="button" class="bk-close" data-focus="bk-close">닫기</button></div>
    </div></div>`;
  }

  // ---- 연결 ----
  // 그리는 곳 두 군데 (2026-10-03 제작자): 생활일지 > 독서 탭(js/journal.js) / 집 책꽂이 모달(js/book_modal.js). 상태 B는 하나를 같이 씀
  //   bind(el) = 탭 (다시 그리기 = Life.paint), bind(el, paint) = 모달 (다시 그리기 = 모달이 준 paint(focus))
  let EL = null, PAINT = null;
  function repaint(focus) { if (!EL || !Life.data) return; if (PAINT) PAINT(focus); else Life.paint('archive', EL, focus); }
  function readDraft() {
    const f = EL && EL.querySelector('.bk-form'); if (!f) return B.draft;
    const on = f.querySelector('.bk-color.on');
    B.draft = { color: on ? on.dataset.color : (B.draft && B.draft.color), title: f.querySelector('.bk-in-title').value, date: f.querySelector('.bk-in-date').value, summary: f.querySelector('.bk-in-sum').value };
    return B.draft;
  }
  function openForm(mode, b) {
    B.detail = null; B.err = '';
    B.form = { mode, key: b ? keyOf(b) : null };
    B.draft = b ? { color: b.color, title: b.title, date: b.date, summary: b.summary } : { color: colors()[0].name, title: '', date: '', summary: '' };
    repaint('bk-title');
    if (mode === 'add') say('open'); // 2026-10-08 부기 book.open (기록 폼 열 때)
  }
  function closeAll(focus) { B.form = null; B.detail = null; B.draft = null; B.err = ''; repaint(focus); }
  function reset() { B.form = null; B.detail = null; B.draft = null; B.err = ''; } // 모달을 닫을 때: 열린 입력·상세 창만 접음 (다시 그리지 않음)
  function bind(el, paint) {
    EL = el; PAINT = typeof paint === 'function' ? paint : null;
    const box = el.querySelector('.bookshelf'); if (!box) return;
    const add = box.querySelector('.bk-add'); if (add) add.addEventListener('click', () => openForm('add'));
    box.querySelectorAll('.bk-book').forEach((b) => b.addEventListener('click', () => { const bk = B.shelf[Number(b.dataset.i)]; if (!bk) return; B.detail = keyOf(bk); B.form = null; repaint('bk-close'); }));
    const arch = box.querySelector('.bk-arch'); if (arch) arch.addEventListener('toggle', () => { B.archOpen = arch.open; });
    box.querySelectorAll('.bk-restore').forEach((b) => b.addEventListener('click', () => restore(B.archive[Number(b.dataset.i)])));
    const ov = box.querySelector('.bk-overlay');
    if (ov) {
      ov.addEventListener('mousedown', (e) => { if (e.target === ov) { readDraft(); ov.dataset.down = '1'; } });
      ov.addEventListener('click', (e) => { if (e.target === ov && ov.dataset.down === '1' && !B.busy) closeAll(); }); // 창 밖(어두운 곳)을 누르면 닫힘
      ov.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return; // 한글 조합 중 Enter·Esc는 받지 않음 (대화창과 같음)
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!B.busy) closeAll(B.form ? 'bk-add' : 'bk:' + shelfIndex(B.detail)); }
        else if (e.key === 'Tab') trapTab(e, ov);
        else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && B.form) { e.preventDefault(); save(); }
        else if (e.key === 'Enter' && e.target.classList.contains('bk-in-title')) { e.preventDefault(); const n = ov.querySelector('.bk-in-date'); if (n) n.focus(); }
      });
    }
    const f = box.querySelector('.bk-form');
    if (f) {
      f.addEventListener('submit', (e) => { e.preventDefault(); save(); });
      f.querySelector('.bk-cancel').addEventListener('click', () => closeAll(B.form.mode === 'edit' ? 'bk-close' : 'bk-add'));
      f.querySelectorAll('.bk-color').forEach((c) => c.addEventListener('click', () => {
        f.querySelectorAll('.bk-color').forEach((x) => { const on = x === c; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
        readDraft();
      }));
      f.querySelector('.bk-colors').addEventListener('keydown', (e) => { // 칩: ← → 로 고르기 (라디오 방식)
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const list = [...f.querySelectorAll('.bk-color')], i = list.indexOf(document.activeElement); if (i < 0) return;
        e.preventDefault(); const n = list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length]; n.click(); n.focus();
      });
      f.querySelector('.bk-in-title').addEventListener('input', (e) => { if (B.err && /제목/.test(B.err) && e.target.value.trim()) showErr(''); }); // 다시 적으면 오류 풀림 (영화·연극 폼과 같게)
      f.querySelector('.bk-in-date').addEventListener('input', (e) => { const h = f.querySelector('.bk-hint'); if (h) h.textContent = e.target.value ? '' : '고르지 않으면 오늘로 적어요'; });
    }
    const dt = box.querySelector('.bk-detail');
    if (dt) {
      dt.querySelector('.bk-close').addEventListener('click', () => closeAll('bk:' + shelfIndex(B.detail)));
      const ed = dt.querySelector('.bk-edit'); if (ed) ed.addEventListener('click', () => { const b = B.shelf.find((x) => sameKey(x, B.detail)); if (b) openForm('edit', b); });
      const ar = dt.querySelector('.bk-archive'); if (ar) ar.addEventListener('click', () => archive(B.shelf.find((x) => sameKey(x, B.detail))));
    }
    if (B.just) { const j = B.just; setTimeout(() => { if (sameKey(B.just, j)) B.just = null; }, 700); } // 꽂히는 움직임은 한 번만
  }
  const shelfIndex = (k) => Math.max(0, B.shelf.findIndex((x) => sameKey(x, k)));
  function trapTab(e, ov) { // 창 안에서만 Tab이 돎
    const f = [...ov.querySelectorAll('button, input, textarea, [tabindex="0"]')].filter((x) => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }

  // ---- 저장 (메인) ----
  const lastPick = {};
  function pick(list, k) { if (!Array.isArray(list)) return list || ''; if (list.length < 2) return list[0] || ''; const c = list.filter((t) => t !== lastPick[k]); const t = c[Math.floor(Math.random() * c.length)]; lastPick[k] = t; return t; }
  function say(k, v) {
    const text = Life.fill(pick(L()[k], k), v || {}); if (!text) return;
    B.said = { key: k, text };
    if (root.PHApp && root.PHApp.sideSay) root.PHApp.sideSay(text);
  }
  function showErr(msg) {
    B.err = msg; const p = EL && EL.querySelector('.bk-form .bk-err'); if (p) p.textContent = msg;
    const i = EL && EL.querySelector('.bk-in-title'); if (i) i.classList.toggle('bad', !!msg && /제목/.test(msg)); // 무늬 확인모음 v01 ③: 제목 칸 테 = 오류 색
  }
  // call(lastModified) -> 결과. 충돌이면 새 글로 다시 그리고 (입력 중인 값은 그대로) 두부가 한 번 더 부탁
  async function run(call, onOk) {
    if (B.busy) return null;
    B.busy = true; let res = null;
    try {
      res = await call(Life.lastModified);
      Life.data = Md.parse(res.text); Life.lastModified = res.lastModified; Life.readAt = Date.now();
      if (res.conflict) { B.busy = false; repaint(B.form ? 'bk-title' : null); say('conflict'); return res; }
      if (res.off) { B.busy = false; showErr('생활 습관에 독서 줄이 없어서 책을 꽂을 수 없어요. 기록 카드에서 다시 추가해 주세요.'); return res; } // 독서 줄을 지운 뒤 (2026-10-04, 화면에서는 들어올 곳이 없음)
      onOk(res);
    } catch (e) {
      B.lastError = String(e.message || e);
      if (B.form) showErr(errText(B.lastError)); else say('fail');
    }
    B.busy = false;
    return res;
  }
  // 메인 오류 글 -> 화면에 보일 말 (메인 글이 IPC 앞말을 달고 오므로 뒤쪽만)
  function errText(m) {
    if (/이미 있음/.test(m)) return '같은 날 같은 제목 책이 벌써 꽂혀 있어요.';
    if (/제목이 너무 김/.test(m)) return `제목은 ${BW.TITLE_MAX}자까지 적을 수 있어요.`;
    if (/요약이 너무 김/.test(m)) return `요약은 ${BW.SUMMARY_MAX}자까지 적을 수 있어요.`;
    if (/날짜 오류/.test(m)) return '날짜를 다시 골라 주세요.';
    return '저장하지 못했어요. 파일을 한번 봐 주세요.';
  }
  function save() {
    const v = readDraft() || {};
    const title = String(v.title || '').trim();
    if (!title) { showErr('제목을 적어 주세요.'); say('badTitle'); const i = EL.querySelector('.bk-in-title'); if (i) i.focus(); return null; }
    if (v.date && v.date > today()) { showErr('다 읽은 날은 오늘까지 고를 수 있어요.'); return null; }
    const mode = B.form.mode, key = B.form.key;
    const book = { date: v.date || '', title, color: v.color || colors()[0].name, summary: v.summary || '' };
    const call = mode === 'edit' ? (lm) => D().update(key, book, lm) : (lm) => D().add(book, lm);
    return run(call, (res) => {
      const b = res.book || book;
      B.form = null; B.draft = null; B.err = '';
      B.last = { op: mode, book: b, date: res.date };
      if (mode === 'edit') { B.detail = keyOf(b); repaint('bk-close'); say('edited', { title: b.title }); return; }
      B.just = keyOf(b); repaint('bk-add');
      say('saved', { title: b.title });
    });
  }
  function archive(b) {
    if (!b) return null;
    return run((lm) => D().archive(keyOf(b), lm), (res) => {
      B.detail = null; B.archOpen = true; B.last = { op: 'archive', book: keyOf(b), date: res.date };
      repaint('bk-restore:' + Math.max(0, BW.parse(Life.data.lines).archive.length - 1)); say('archived', { title: b.title });
    });
  }
  function restore(b) {
    if (!b) return null;
    return run((lm) => D().restore(keyOf(b), lm), () => {
      B.just = keyOf(b); B.last = { op: 'restore', book: keyOf(b) };
      repaint('bk-add'); say('restored', { title: b.title });
    });
  }

  root.PHBookshelf = Object.assign(B, calc, { html, bind, reset, canWrite, openForm, closeAll, save, archive, restore, colors });
})(typeof window !== 'undefined' ? window : globalThis);
