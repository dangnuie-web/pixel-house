// 생활일지 탭 (2026-10-03 비트, journal 브랜치). 옛 "기록 보관" 탭(키 archive)을 그대로 쓰고 화면만 바꿔 끼운다.
//   안 탭: settings.JOURNAL_TABS (물 / 요가 / 러닝 / 독서 + 모아 보기). 탭 모양 = settings.JOURNAL_TAB_STYLE: 'folder' 겹친 폴더(기본, 제작자 결정) | 'pill' 알약 | 'dropdown'
//   물·요가·러닝: 습관 기록에서 그 습관이 있는 날만, 최신이 위. 한 줄 "10/3 (금) · 물 5/6". 빈 날(0/6, 0)은 안 보임
//   독서: 책꽂이 (js/bookshelf.js PHBookshelf.html / bind)
//   모아 보기: 옛 기록 보관 화면 그대로 (습관 기록 표 + 잠·식사·한마디). 대화창이 적은 기록이 앱에서 안 보이게 되지 않도록 남김 (열린 질문)
// life.js는 고치지 않음: Life.VIEWS.archive 의 그리기 함수만 바꾸고, 버튼 연결은 Life.renderHooks로.
// 계산 함수(habitLines, dayText)는 그림 없이 Node 시험(tests/test_journal.js)에서도 씀
(function (root) {
  'use strict';
  const Md = root.PHLifeMd || (typeof require !== 'undefined' ? require('./life_md.js') : null);
  const WD = ['일', '월', '화', '수', '목', '금', '토'];

  // ---- 계산 (그림 없음) ----
  // "2026-10-03" -> "10/3 (토)"
  function dayText(s) { const d = Md.dateOf(s); if (d == null) return String(s || ''); const x = new Date(d); return `${x.getMonth() + 1}/${x.getDate()} (${WD[x.getDay()]})`; }
  // 습관 기록에서 그 습관 줄만: [{ date, label, text, value, of, unit, line }] 최신 날짜 먼저. 같은 날 줄이 둘이면 둘 다(파일 아래 줄 먼저)
  //   빈 날 = 항목이 없거나 값이 0 (물 0/6, 독서 0쪽) -> 줄 없음. 날짜를 못 읽은 줄도 뺌
  function habitLines(records, habit) {
    const out = [];
    (records || []).forEach((r, i) => {
      const day = Md.dateOf(r.date); if (day == null) return;
      (r.items || []).forEach((it) => {
        if (it.name !== habit) return;
        if (it.value != null && !(it.value > 0)) return;
        out.push({ date: r.date, day, label: dayText(r.date), text: it.text, value: it.value, of: it.of || null, unit: it.unit || null, line: r.line, i });
      });
    });
    return out.sort((a, b) => b.day - a.day || b.i - a.i);
  }
  const STYLES = ['folder', 'pill', 'dropdown'];
  const calc = { dayText, habitLines, STYLES };
  if (typeof document === 'undefined') { if (typeof module !== 'undefined' && module.exports) module.exports = calc; return; }

  // ---- 화면 ----
  const S = root.PH_SETTINGS, Life = root.PHLife;
  if (!Life || !Life.VIEWS) return;
  const UI = () => Object.assign({}, root.PH_LINES && root.PH_LINES.ui);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DEFAULT_TABS = [{ id: 'water', label: '물', habit: '물' }, { id: 'yoga', label: '요가', habit: '요가' }, { id: 'run', label: '러닝', habit: '러닝' }, { id: 'reading', label: '독서', books: true }, { id: 'all', label: '모아 보기', all: true }];
  // 대변·식사 탭은 그 일지 기능이 꺼지면 숨김 (js/furnish.js tabHidden, 2026-10-04)
  // 2026-10-08: 생활습관에서 만든 기록 항목(## 기록 항목)마다 탭 하나 (영화·연극 탭 바로 뒤, 없으면 모아 보기 앞)
  function kindTabs() {
    const RW = root.PHRecordWrite; if (!RW || !Life.data || !Life.data.lines) return [];
    return RW.parse(Life.data.lines).kinds.filter((k) => k.custom).map((k) => ({ id: 'k:' + k.name, label: k.name, records: [k.name], custom: true }));
  }
  // 영화·연극 탭 (records): 남은 칸만, 다 지웠으면 탭 숨김 (2026-10-08 피드백 4: 영화·연극도 지울 수 있음). 이름 = 남은 칸 이름을 · 로
  function movieTab(t) {
    const RW = root.PHRecordWrite; if (!t.records || t.custom || !RW || !Life.data || !Life.data.lines) return t;
    const have = RW.parse(Life.data.lines).kinds.map((k) => k.name), rec = t.records.filter((n) => have.includes(n));
    if (!rec.length) return null;
    return rec.length === t.records.length ? t : Object.assign({}, t, { records: rec, label: rec.join('·') });
  }
  const tabs = () => {
    const base = (Array.isArray(S.JOURNAL_TABS) && S.JOURNAL_TABS.length ? S.JOURNAL_TABS : DEFAULT_TABS).filter((t) => !(root.PHFurnish && root.PHFurnish.tabHidden(t))).map(movieTab).filter(Boolean);
    const extra = kindTabs(); if (!extra.length) return base;
    let at = base.findIndex((t) => t.id === 'movie'); at = at >= 0 ? at + 1 : Math.max(0, base.findIndex((t) => t.all));
    return base.slice(0, at).concat(extra, base.slice(at));
  };
  const J = { tab: null, style: null, open: false };
  const style = () => { const s = J.style || S.JOURNAL_TAB_STYLE; return STYLES.includes(s) ? s : 'folder'; };
  const cur = () => tabs().find((t) => t.id === J.tab) || tabs()[0];
  const oldArchive = Life.VIEWS.archive[1]; // 옛 기록 보관 화면 (모아 보기 탭 안에 머리만 빼고 넣음)

  function dubuNote(text, cls) { return `<div class="life-dubu ${cls || ''}"><canvas class="dubu-mini" width="16" height="20" aria-hidden="true"></canvas><p>${esc(text)}</p></div>`; }
  // 머리 (life.js head와 같은 모양. 다시 읽기 버튼은 life.js paint가 연결)
  function head(title, sub, badge) {
    const file = String(S.LIFE_FILE).split('/').pop(), at = Life.readAt ? new Date(Life.readAt) : null;
    const when = at ? `${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}에 읽음` : '';
    return `<header class="life-head"><div><h2>${esc(title)}</h2>${sub ? `<p class="life-sub">${esc(sub)}</p>` : ''}</div>
      <div class="life-src"><span class="ro ${badge ? 'rw' : ''}">${esc(badge || '읽기 전용')}</span><span title="${esc(S.LIFE_FILE)}">${esc(file)}</span><span>${esc(when)}</span><button class="life-reload" type="button">다시 읽기</button></div></header>`;
  }

  // 안 탭 (모양 3가지). id = jn-tab-<id>, 패널 = jn-panel
  function tabBar() {
    const st = style(), c = cur();
    if (st === 'dropdown') {
      let h = `<div class="jn-tabs dropdown" data-style="dropdown"><button type="button" class="jn-drop" aria-haspopup="listbox" aria-expanded="${J.open}" aria-controls="jn-list" data-focus="jn-drop">` +
        `<span class="jn-drop-lab">${esc(c.label)}</span><i class="jn-caret" aria-hidden="true"></i></button>`;
      h += `<ul class="jn-menu" id="jn-list" role="listbox" aria-label="생활일지 보기 고르기" ${J.open ? '' : 'hidden'}>` +
        tabs().map((t) => `<li role="option" class="jn-opt ${t.id === c.id ? 'on' : ''}" data-tab="${esc(t.id)}" aria-selected="${t.id === c.id}" tabindex="-1" data-focus="jn-opt:${esc(t.id)}">${esc(t.label)}</li>`).join('') + '</ul></div>';
      return h;
    }
    return `<div class="jn-tabs ${st}" data-style="${st}" role="tablist" aria-label="생활일지 보기">` + tabs().map((t) => {
      const on = t.id === c.id;
      return `<button type="button" role="tab" class="jn-tab ${on ? 'on' : ''}" id="jn-tab-${esc(t.id)}" data-tab="${esc(t.id)}" aria-selected="${on}" aria-controls="jn-panel" tabindex="${on ? 0 : -1}" data-focus="jn:${esc(t.id)}">${esc(t.label)}</button>`;
    }).join('') + '</div>';
  }
  function habitPanel(d, t) {
    const list = habitLines(d.records, t.habit);
    if (!d.records) return dubuNote(UI().sectionMissing);
    if (!list.length) return dubuNote(Life.fill((UI().journal || {}).empty || '아직 {habit} 기록이 없어요냥~', { habit: t.habit }));
    return `<p class="jn-count">${esc(t.habit)} 기록한 날 <b>${new Set(list.map((x) => x.date)).size}</b>일</p><ul class="jn-list" data-habit="${esc(t.habit)}">` +
      list.map((x) => `<li data-date="${esc(x.date)}" data-line="${x.line}"><span class="jn-date">${esc(x.label)}</span><span class="jn-sep" aria-hidden="true">·</span><span class="jn-text">${esc(x.text)}</span></li>`).join('') + '</ul>';
  }
  function allPanel(d) {
    const tmp = document.createElement('div'); tmp.innerHTML = oldArchive(d);
    const h = tmp.querySelector('.life-head'); if (h) h.remove();
    return tmp.innerHTML;
  }
  function view(d) {
    const t = cur(), BS = root.PHBookshelf;
    const RL = root.PHRecordList, rw = t.books && BS && BS.canWrite(), rrw = t.records && RL && RL.canWrite();
    const JH = Object.assign({ sub: '지나온 기록을 탭마다 모아 뒀어요', badgeBook: '책 적기 가능', badgeRecord: '기록 적기 가능' }, ((root.PH_LINES || {}).uiPlain || {}).journalHead); // 부기 문구_공용판2 v01 2-1
    let h = head(Life.TAB('archive'), JH.sub, rw ? JH.badgeBook : rrw ? JH.badgeRecord : null);
    h += `<div class="journal" data-style="${style()}" data-tab="${esc(t.id)}">` + tabBar();
    const lab = style() === 'dropdown' ? `role="region" aria-label="${esc(t.label)}"` : `role="tabpanel" aria-labelledby="jn-tab-${esc(t.id)}"`;
    h += `<div class="jn-panel ${style()}" id="jn-panel" ${lab} data-tab="${esc(t.id)}">`;
    if (t.books) h += BS ? BS.html(d) : dubuNote(UI().sectionMissing);
    else if (t.records) { if (!RL) h += dubuNote(UI().sectionMissing); else { if (RL.group.join() !== t.records.join()) RL.set(t.records, t.records[0]); h += RL.html(d); } }
    else if (t.grass) h += root.PHStudyGrass ? root.PHStudyGrass.html(d) : dubuNote(UI().sectionMissing);
    else if (t.all) h += allPanel(d);
    else h += habitPanel(d, t);
    return h + '</div></div>';
  }
  Life.VIEWS.archive = ['archive', view];

  function setTab(id, el, focus) {
    if (!tabs().some((t) => t.id === id)) return false;
    J.tab = id; J.open = false;
    if (el && Life.data) Life.paint('archive', el, focus);
    return true;
  }
  function bind(tab, el) {
    if (tab !== 'archive' || !el.querySelector('.journal')) return;
    const ids = tabs().map((t) => t.id);
    el.querySelectorAll('.jn-tab').forEach((b) => {
      b.addEventListener('click', () => setTab(b.dataset.tab, el, 'jn:' + b.dataset.tab));
      b.addEventListener('keydown', (e) => { // 탭 줄: ← → Home End (WAI-ARIA 탭 방식)
        let i = ids.indexOf(b.dataset.tab);
        if (e.key === 'ArrowRight') i = (i + 1) % ids.length; else if (e.key === 'ArrowLeft') i = (i - 1 + ids.length) % ids.length;
        else if (e.key === 'Home') i = 0; else if (e.key === 'End') i = ids.length - 1; else return;
        e.preventDefault(); setTab(ids[i], el, 'jn:' + ids[i]);
      });
    });
    const drop = el.querySelector('.jn-drop');
    if (drop) {
      const openMenu = (focusId) => { J.open = true; Life.paint('archive', el, 'jn-opt:' + (focusId || cur().id)); };
      drop.addEventListener('click', () => { if (J.open) { J.open = false; Life.paint('archive', el, 'jn-drop'); } else openMenu(); });
      drop.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openMenu(); } });
      el.querySelectorAll('.jn-opt').forEach((o) => {
        o.addEventListener('click', () => setTab(o.dataset.tab, el, 'jn-drop'));
        o.addEventListener('keydown', (e) => {
          let i = ids.indexOf(o.dataset.tab);
          if (e.key === 'ArrowDown') i = Math.min(ids.length - 1, i + 1); else if (e.key === 'ArrowUp') i = Math.max(0, i - 1);
          else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTab(o.dataset.tab, el, 'jn-drop'); return; }
          else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); J.open = false; Life.paint('archive', el, 'jn-drop'); return; }
          else return;
          e.preventDefault(); const n = el.querySelector(`.jn-opt[data-tab="${ids[i]}"]`); if (n) n.focus();
        });
      });
      if (J.open) { // 메뉴 밖을 누르면 닫힘 (한 번만)
        const away = (e) => { if (!e.target.closest || !e.target.closest('.jn-tabs.dropdown')) { document.removeEventListener('mousedown', away, true); if (J.open) { J.open = false; if (!el.closest('.screen').hidden) Life.paint('archive', el); } } };
        setTimeout(() => document.addEventListener('mousedown', away, true), 0);
      }
    }
    if (cur().books && root.PHBookshelf) root.PHBookshelf.bind(el);
    if (cur().records && root.PHRecordList) root.PHRecordList.bind(el, null, 'archive');
    if (cur().grass && root.PHStudyGrass) root.PHStudyGrass.bind(el);
  }
  (Life.renderHooks = Life.renderHooks || []).push(bind);

  // 바깥(집 안 책꽂이 등)에서: 생활일지 탭의 그 안 탭으로 열기
  async function open(id) {
    if (id) J.tab = id;
    J.open = false;
    if (root.PHApp && root.PHApp.selectTab) await root.PHApp.selectTab('archive');
    return J.tab;
  }
  root.PHJournal = Object.assign(J, calc, { tabs, cur, style, setTab, open, view });
})(typeof window !== 'undefined' ? window : globalThis);
