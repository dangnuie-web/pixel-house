// 살림 계산 (인벤토리·사야 할 것·청소 습관). 그림·파일 접근 없음: 글(text)을 받아 새 글을 돌려준다.
// Electron 메인(electron/household_ipc.js)과 화면(inventory.js·fridge_memo.js·household_card.js), Node 시험(tests/test_household.js)이 같이 쓴다.
//   ## 살림 물건 | 분류 | 알약 | 이름 | 수량 | 필수 | 메모 |   (화장품 색 = 메모 "색 코랄")
//   ## 사야 할 것 | 이름 | 더한 날 | 출처 |                    (출처 = 자동 / 직접)
//   청소 습관 = ## 생활습관 표 종류 "살림" 줄 (처음 체크할 때 기본 다섯 줄을 표 끝에 더함), 체크 = 습관 기록 오늘 줄 (life_check.js toggleWeekly와 같음)
// 쓰기 원칙: 정해진 섹션 안 줄만 바꾸고(한 줄 고침·더함·뺌), 섹션이 없으면 ## 버킷리스트 앞에 새로 만듦. 다른 줄은 한 글자도 안 바뀐다.
//   기본 아이템은 파일에 섹션이 없을 때 화면에만 보이고, 처음 바꿀 때 섹션을 만들며 기본 줄 + 바뀐 값을 같이 씀.
//   생활필수품 수량이 0이면 사야 할 것에 "자동" 줄이 생기고, 1 이상이거나 필수가 풀리면 "자동" 줄만 빠짐 (직접 적은 줄은 안 건드림)
(function (root) {
  'use strict';
  const req = (n) => (typeof require !== 'undefined' ? require(n) : null);
  const Md = root.PHLifeMd || req('./life_md.js');
  const LC = root.PHLifeCheck || req('./life_check.js');
  const LW = root.PHLifeWrite || req('./life_write.js');
  const HC = root.PHHabitCycle || req('./habit_cycle.js');
  const H = root.PH_HOUSEHOLD || req('./data/household.js');

  const SEC = {
    items: { name: '살림 물건', head: ['분류', '알약', '이름', '수량', '필수', '메모'] },
    shop: { name: '사야 할 것', head: ['이름', '더한 날', '출처'] },
  };
  const BEFORE = '버킷리스트';
  const MAX_ROW_CHANGES = 4; // 한 번 쓰기에서 바뀌는 표 줄 수 상한 (섹션을 새로 만들 때는 기본 줄 수만큼)

  const catById = (id) => H.CATS.find((c) => c.id === id) || null;
  const catByName = (n) => H.CATS.find((c) => c.name === n) || null;
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const cellsOf = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const isRow = (l) => /^\s*\|/.test(l);
  const isSep = (l) => /^\s*\|?\s*:?-{3,}/.test(l);
  const rowText = (cells) => '| ' + cells.join(' | ') + ' |';
  const sepText = (n) => '|' + Array(n).fill('---').join('|') + '|';
  const splitLines = (t) => String(t).split(/\r?\n/);
  const nlOf = (t) => (/\r\n/.test(t) ? '\r\n' : '\n');

  // ---- 이름 검사: 표를 깨는 글자(| 줄바꿈 탭 제어 문자)는 바꾸지 않고 막음. 앞뒤 공백·겹친 공백만 정리 ----
  function checkName(s) {
    if (typeof s !== 'string') throw new Error('이름 형식 오류');
    if (/[|｜\u0000-\u001f\u007f\u2028\u2029]/.test(s)) throw Object.assign(new Error('이름에 표 글자'), { code: 'badName' });
    const t = s.replace(/\s+/g, ' ').trim();
    if (!t) throw Object.assign(new Error('빈 이름'), { code: 'badName' });
    if (Array.from(t).length > H.MAX_NAME) throw Object.assign(new Error('이름이 너무 김'), { code: 'badName' });
    if (/^-{3,}$|^:?-+:?$/.test(t)) throw Object.assign(new Error('이름 모양 오류'), { code: 'badName' });
    return t;
  }

  // ---- 섹션·표 찾기 ----
  function findSec(lines, kind) {
    const all = Md.sections(lines).filter((s) => s.name === SEC[kind].name);
    if (all.length > 1) throw new Error('같은 섹션이 둘: ' + SEC[kind].name);
    return all[0] || null;
  }
  function tableOf(lines, sec) {
    const t = Md.table(lines, sec); if (!t) return null;
    let sep = t.line + 1; if (!(sep < sec.end && isSep(lines[sep]))) sep = null;
    let end = (sep == null ? t.line : sep) + 1;
    while (end < sec.end && isRow(lines[end])) end++;
    return { headLine: t.line, head: t.head, sepLine: sep, rows: t.rows.map((r) => ({ line: r.line, cells: r.raw })), endLine: end };
  }

  // ---- 읽기 ----
  function itemOf(cells, line) {
    const c = catByName(cells[0]); const q = Number(cells[3]);
    const memo = cells[5] || '';
    return { line, cat: c ? c.id : null, catName: cells[0], pill: cells[1] || '', name: cells[2] || '', qty: /^\d+$/.test(cells[3] || '') ? q : 0,
      need: (cells[4] || '') === H.ESSENTIAL_MARK, memo, color: colorOf(memo) };
  }
  function colorOf(memo) { const m = new RegExp('^' + H.COLOR_MEMO.trim() + '\\s*(\\S+)').exec(String(memo || '').trim()); return m ? m[1] : ''; }
  function defaultItems() {
    return H.DEFAULT_ITEMS.map(([cat, pill, name]) => ({ line: null, cat, catName: catById(cat).name, pill, name, qty: H.DEFAULT_QTY, need: H.DEFAULT_ESSENTIALS.includes(name), memo: '', color: '' }));
  }
  // 글 -> { items, itemsDefault(섹션 없음 = 기본값), shop, chores, choresDefault }
  function view(text, parsed) { // parsed = 이미 읽은 Md.parse(text) (화면이 다시 그릴 때 한 번 더 안 읽게)
    const lines = parsed && parsed.lines ? parsed.lines : splitLines(text);
    const out = { items: [], itemsDefault: false, shop: [], chores: [], choresDefault: false };
    const is = findSec(lines, 'items'), it = is && tableOf(lines, is);
    if (!is) { out.items = defaultItems(); out.itemsDefault = true; }
    else if (it) out.items = it.rows.map((r) => itemOf(r.cells, r.line)).filter((x) => x.cat && x.name);
    const ss = findSec(lines, 'shop'), st = ss && tableOf(lines, ss);
    if (st) out.shop = st.rows.map((r) => ({ line: r.line, name: r.cells[0] || '', date: r.cells[1] || '', src: r.cells[2] || '', auto: (r.cells[2] || '') === H.SHOP_SRC.auto })).filter((x) => x.name);
    const hab = (parsed || Md.parse(text)).habits, rows = hab ? hab.rows.filter((r) => r.kind === H.CHORE_KIND) : [];
    if (rows.length) out.chores = rows.map((r) => ({ name: r.name, cycle: r.cycle, target: r.target, line: r.line, key: (H.CHORES.find((c) => c.name === r.name) || {}).key || null }));
    else { out.chores = H.CHORES.map((c) => Object.assign({ line: null }, c)); out.choresDefault = true; }
    return out;
  }
  // 그 날(오늘) 기준 청소 습관 칸: 주 N회 = 이번 주 n/N, 매일 = 오늘 한 칸
  function choreState(text, today, parsed, v0) {
    const d = parsed || Md.parse(text), v = v0 || view(text, d), records = d.records || [];
    return v.chores.map((c) => {
      // 2026-10-04 습관 편집: 주기 = 매일 n회 / 주 n회 / 월 n회 (js/habit_cycle.js). 모르는 주기는 매일 1회처럼 (전과 같음)
      const k = HC.countFor(records, c, today) || HC.countFor(records, { name: c.name, cycle: '매일' }, today);
      return Object.assign({}, c, { daily: k.per === 'day', per: k.per, slots: k.slots, of: k.n, count: k.count, todayDone: k.todayDone });
    });
  }

  // ---- 섹션 만들기·줄 쓰기 ----
  function itemCells(i) { return [catById(i.cat).name, i.pill || '', i.name, String(i.qty), i.need ? H.ESSENTIAL_MARK : '', i.memo || '']; }
  // kind 섹션이 없으면 ## 버킷리스트 앞(없으면 파일 끝)에 머리 + rows. -> 새 lines (제자리)
  function ensureSec(lines, kind, rows) {
    if (findSec(lines, kind)) return false;
    const S = SEC[kind], block = ['## ' + S.name, rowText(S.head), sepText(S.head.length)].concat(rows.map(rowText), ['']);
    const bi = Md.sections(lines).find((s) => s.name === BEFORE);
    let at;
    if (bi) at = bi.line;
    else { at = lines.length; while (at > 0 && lines[at - 1] === '') at--; block.unshift(''); block.pop(); }
    lines.splice(at, 0, ...block);
    return true;
  }
  function itemsTable(lines) {
    const sec = findSec(lines, 'items'); if (!sec) return null;
    const t = tableOf(lines, sec);
    if (!t) { // 섹션만 있고 표가 없음: 섹션 글 끝에 머리·구분선
      let at = sec.end; while (at > sec.start && lines[at - 1].trim() === '') at--;
      lines.splice(at, 0, rowText(SEC.items.head), sepText(SEC.items.head.length));
      return itemsTable(lines);
    }
    if (t.head.join('|') !== SEC.items.head.join('|')) throw new Error('표 머리가 달라서 멈춤: ## ' + SEC.items.name);
    return t;
  }
  function shopTable(lines) {
    ensureSec(lines, 'shop', []);
    const sec = findSec(lines, 'shop'); let t = tableOf(lines, sec);
    if (!t) { let at = sec.end; while (at > sec.start && lines[at - 1].trim() === '') at--; lines.splice(at, 0, rowText(SEC.shop.head), sepText(SEC.shop.head.length)); t = tableOf(lines, findSec(lines, 'shop')); }
    if (t.head.join('|') !== SEC.shop.head.join('|')) throw new Error('표 머리가 달라서 멈춤: ## ' + SEC.shop.name);
    return t;
  }
  function findItem(t, cat, name) {
    const cn = catById(cat).name;
    return t.rows.find((r) => r.cells[0] === cn && r.cells[2] === name) || null;
  }
  // 필수품 0개 -> 자동 줄 / 아니면 자동 줄 빼기. -> 'added' | 'removed' | null
  //   이름이 같은 줄이 이미 있으면(직접 적은 것 포함) 자동 줄을 또 만들지 않음. 빼는 것은 "자동" 줄만
  function syncShop(lines, item, date) {
    const want = !!(item && item.need && item.qty === 0);
    const sec = findSec(lines, 'shop'), t = sec && tableOf(lines, sec);
    const same = t ? t.rows.filter((r) => r.cells[0] === item.name) : [];
    if (want) {
      if (same.length) return null;
      const st = shopTable(lines);
      lines.splice(st.endLine, 0, rowText([item.name, date, H.SHOP_SRC.auto]));
      return 'added';
    }
    const autos = same.filter((r) => r.cells[2] === H.SHOP_SRC.auto);
    if (!autos.length) return null;
    // 같은 이름 다른 분류에 필수품 0개가 또 있으면 남김
    autos.slice().reverse().forEach((r) => lines.splice(r.line, 1));
    return 'removed';
  }


  // 인벤토리 바꾸기. op = { type: 'qty'|'need'|'add'|'remove'|'restore'|'color', cat, name, ... }, date = 오늘(메인)
  //   -> { text, changed, item(바뀐 뒤 물건 또는 null), shop: 'added'|'removed'|null, created }
  function applyInv(text, op, date) {
    if (!op || typeof op !== 'object') throw new Error('요청 형식 오류');
    if (!isDate(date)) throw new Error('날짜 오류');
    const cat = catById(op.cat); if (!cat) throw new Error('분류 오류');
    const nl = nlOf(text), lines = splitLines(text);
    const created = ensureSec(lines, 'items', defaultItems().map(itemCells));
    let t = itemsTable(lines);
    const name = checkName(op.name);
    let hit = findItem(t, op.cat, name), item = hit ? itemOf(hit.cells, hit.line) : null;
    const put = (i) => { lines[hit.line] = rowText(itemCells(i)); };
    if (op.type === 'add' || op.type === 'restore') {
      if (hit) throw Object.assign(new Error('같은 이름이 있음'), { code: 'dupName' });
      const pill = String(op.pill || '');
      if (cat.pills.length ? !cat.pills.includes(pill) : pill !== '') throw new Error('알약 오류');
      const qty = op.type === 'restore' ? op.qty : H.DEFAULT_QTY;
      if (!Number.isInteger(qty) || qty < 0 || qty > H.MAX_QTY) throw new Error('수량 오류');
      const memo = op.type === 'restore' ? String(op.memo || '') : '';
      if (/[|\r\n]/.test(memo) || memo.length > 40) throw new Error('메모 오류');
      item = { cat: op.cat, catName: cat.name, pill, name, qty, need: op.type === 'restore' ? !!op.need : false, memo, color: colorOf(memo) };
      // 자리: 되돌리기 = 원래 다음 물건 앞(op.before), 아니면 같은 분류 끝, 없으면 표 끝
      const sameCat = t.rows.filter((r) => r.cells[0] === cat.name);
      const nextRow = op.type === 'restore' && op.before ? sameCat.find((r) => r.cells[2] === op.before) : null;
      const at = nextRow ? nextRow.line : sameCat.length ? sameCat[sameCat.length - 1].line + 1 : t.endLine;
      lines.splice(at, 0, rowText(itemCells(item)));
    } else {
      if (!hit) throw new Error('물건 없음: ' + name);
      if (op.type === 'qty') {
        if (!Number.isInteger(op.qty) || op.qty < 0 || op.qty > H.MAX_QTY) throw new Error('수량 오류');
        item.qty = op.qty; put(item);
      } else if (op.type === 'need') {
        if (typeof op.need !== 'boolean') throw new Error('필수 값 오류');
        item.need = op.need; put(item);
      } else if (op.type === 'color') {
        const kind = H.COLOR_ITEMS[name], list = kind ? H.COLORS[kind] : null;
        if (!list || !list.some((c) => c.name === op.color)) throw new Error('색 오류');
        item.memo = H.COLOR_MEMO + op.color; item.color = op.color; put(item);
      } else if (op.type === 'remove') {
        lines.splice(hit.line, 1);
        const left = { name, need: false, qty: 1 }; // 빠진 물건의 자동 줄도 뺌 (다른 분류에 같은 이름 필수 0개가 있으면 남김)
        const keep = itemsTable(lines).rows.some((r) => r.cells[2] === name && r.cells[4] === H.ESSENTIAL_MARK && r.cells[3] === '0');
        const shop = keep ? null : syncShop(lines, left, date);
        const out = lines.join(nl);
        return { text: out, changed: out !== text, item: null, removed: item, shop, created };
      } else throw new Error('모르는 바꾸기: ' + op.type);
    }
    // 같은 이름 다른 분류에 필수 0개가 있으면 자동 줄은 그대로
    const zeroElsewhere = itemsTable(lines).rows.some((r) => r.cells[2] === name && r.cells[0] !== cat.name && r.cells[4] === H.ESSENTIAL_MARK && r.cells[3] === '0');
    const shop = zeroElsewhere && !(item.need && item.qty === 0) ? null : syncShop(lines, item, date);
    const out = lines.join(nl);
    return { text: out, changed: out !== text, item, shop, created };
  }

  // 사야 할 것. op = { type: 'add', name } | { type: 'bought', name }
  //   bought: 인벤토리에 같은 이름이 있으면 그 물건 +1 (필수품 먼저, 섹션이 없으면 기본값으로 만들며) 그리고 줄을 뺌. 없으면 줄만 뺌
  function applyShop(text, op, date) {
    if (!op || typeof op !== 'object') throw new Error('요청 형식 오류');
    if (!isDate(date)) throw new Error('날짜 오류');
    const nl = nlOf(text), lines = splitLines(text), name = checkName(op.name);
    if (op.type === 'add') {
      const sec = findSec(lines, 'shop'), t = sec && tableOf(lines, sec);
      if (t && t.rows.some((r) => r.cells[0] === name)) throw Object.assign(new Error('같은 이름이 있음'), { code: 'dupName' });
      const st = shopTable(lines);
      lines.splice(st.endLine, 0, rowText([name, date, H.SHOP_SRC.manual]));
      const out = lines.join(nl);
      return { text: out, changed: true, name };
    }
    if (op.type !== 'bought') throw new Error('모르는 바꾸기: ' + op.type);
    const sec = findSec(lines, 'shop'), t = sec && tableOf(lines, sec), row = t && t.rows.find((r) => r.cells[0] === name);
    if (!row) throw new Error('사야 할 것에 없음: ' + name);
    lines.splice(row.line, 1);
    // 인벤토리 물건 (화면에 보이는 것과 같게: 섹션이 없으면 기본값)
    const v = view(text), match = v.items.filter((i) => i.name === name).sort((a, b) => (b.need ? 1 : 0) - (a.need ? 1 : 0))[0];
    let item = null, created = false;
    if (match) {
      created = ensureSec(lines, 'items', defaultItems().map(itemCells));
      const it = itemsTable(lines), hit = findItem(it, match.cat, name);
      item = itemOf(hit.cells, hit.line);
      item.qty = Math.min(H.MAX_QTY, item.qty + 1);
      lines[hit.line] = rowText(itemCells(item));
    }
    const out = lines.join(nl);
    return { text: out, changed: true, name, item, created };
  }

  // 청소 습관 기본 줄: ## 생활습관 표에 종류 "살림" 줄이 하나도 없으면 다섯 줄을 표 끝에 더함 (이름이 이미 있는 습관은 건너뜀)
  function ensureChores(text) {
    const nl = nlOf(text), lines = splitLines(text), d = Md.parse(text);
    if (!d.habits) throw new Error('## 생활습관 표 없음');
    if (d.habits.rows.some((r) => r.kind === H.CHORE_KIND)) return { text, changed: false };
    const sec = Md.sections(lines).find((s) => s.name === Md.NAMES.habits), t = Md.table(lines, sec);
    if (!t) throw new Error('## 생활습관 표 없음');
    let end = t.line + 1; while (end < sec.end && isRow(lines[end])) end++;
    const have = new Set(d.habits.rows.map((r) => r.name));
    const add = H.CHORES.filter((c) => !have.has(c.name)).map((c) => rowText([c.name, H.CHORE_KIND, c.target, c.cycle]));
    lines.splice(end, 0, ...add);
    return { text: lines.join(nl), changed: add.length > 0, added: add.length };
  }
  // 청소 습관 오늘 했음/안 했음 뒤집기 (주 N회·매일 모두 오늘 줄에 이름을 더하거나 뺌). -> { text, mid(기본 줄 더한 뒤), done, count, of, daily }
  function toggleChore(text, o) {
    const habit = String(o.habit || '');
    const base = ensureChores(text), d = Md.parse(base.text);
    const row = d.habits.rows.find((r) => r.name === habit && r.kind === H.CHORE_KIND);
    if (!row) throw new Error('살림 습관이 아님: ' + habit);
    if (HC.slotsOf(row.cycle)) throw new Error('매일 n회 살림은 칸 쓰기로: ' + habit); // "k/n" 칸 = ph:habitSetDaily
    const r = LC.toggleWeekly(base.text, { habit: row.name, date: o.date });
    const k = HC.countFor(Md.parse(r.text).records, row, o.date) || HC.countFor(Md.parse(r.text).records, { name: row.name, cycle: '매일' }, o.date);
    return Object.assign(r, { mid: base.text, choresAdded: base.changed, habit: row.name, done: r.done, daily: k.per === 'day', per: k.per, of: k.n, count: k.count, changed: r.changed || base.changed });
  }

  // ---- 안전 검사 (메인이 쓰기 직전에) ----
  // 옛 글 -> 새 글이 "## 살림 물건 / ## 사야 할 것 섹션 안 표 줄만 바뀜"인지. 섹션 밖은 한 글자도 같아야 함
  //   새로 생긴 섹션은 정해진 모양(제목·머리·구분선·줄·빈 줄)이고 자리는 ## 버킷리스트 바로 앞 또는 파일 끝
  //   바뀌거나 더해진 줄은 칸 수·값 검사(분류·알약·이름·수량·필수 / 이름·날짜·출처). 줄 수 변화는 MAX_ROW_CHANGES 이하(새 섹션은 기본 줄 수까지)
  function onlyHouseChanged(oldText, newText) {
    try {
      const a = splitLines(oldText), b = splitLines(newText);
      const cut = (lines) => {
        const keep = lines.slice(), secs = Md.sections(lines).filter((s) => s.name === SEC.items.name || s.name === SEC.shop.name);
        secs.slice().reverse().forEach((s) => keep.splice(s.line, s.end - s.line));
        return keep;
      };
      const ra = cut(a), rb = cut(b), trim = (x) => { const y = x.slice(); while (y.length && y[y.length - 1] === '') y.pop(); return y.join('\n'); };
      if (trim(ra) !== trim(rb)) return false; // 섹션 밖은 그대로 (파일 끝에 새 섹션을 붙일 때 띄운 빈 줄만 허용)
      for (const kind of ['items', 'shop']) {
        const sa = findSec(a, kind), sb = findSec(b, kind);
        if (!sb) { if (sa) return false; continue; }
        if (!sa) { // 새 섹션: 자리 + 모양
          const next = Md.sections(b).find((s) => s.line === sb.end);
          if (!(sb.end === b.length || (next && [BEFORE, SEC.items.name, SEC.shop.name].includes(next.name)))) return false;
          const body = b.slice(sb.line, sb.end);
          if (body[1] !== rowText(SEC[kind].head) || body[2] !== sepText(SEC[kind].head.length)) return false;
          let i = 3; while (i < body.length && isRow(body[i])) { if (!okRow(kind, cellsOf(body[i]))) return false; i++; }
          if (body.slice(i).some((l) => l.trim() !== '')) return false;
          const n = i - 3, limit = kind === 'items' ? H.DEFAULT_ITEMS.length + 1 : MAX_ROW_CHANGES;
          if (n > limit) return false;
          continue;
        }
        const ba = a.slice(sa.line, sa.end), bb = b.slice(sb.line, sb.end);
        if (ba[0] !== bb[0]) return false;
        // 표 아닌 글줄(설명)은 그대로
        const prose = (x) => x.slice(1).filter((l) => !isRow(l) && l.trim() !== '').join('\n');
        if (prose(ba) !== prose(bb)) return false;
        const ta = tableOf(a, sa), tb = tableOf(b, sb);
        if (!tb || tb.head.join('|') !== SEC[kind].head.join('|')) return false;
        if (ta && ta.head.join('|') !== tb.head.join('|')) return false;
        const rowsA = ta ? ta.rows.map((r) => a[r.line]) : [], rowsB = tb.rows.map((r) => b[r.line]);
        const left = rowsA.slice(); const added = [];
        rowsB.forEach((r) => { const i = left.indexOf(r); if (i >= 0) left.splice(i, 1); else added.push(r); });
        if (left.length + added.length > MAX_ROW_CHANGES) return false;
        if (added.some((r) => !okRow(kind, cellsOf(r)))) return false;
        // 표 밖 줄(빈 줄 등) 수는 그대로 (표 머리가 새로 생긴 경우만 2줄)
        const nonRow = (x) => x.filter((l) => !isRow(l)).length;
        if (nonRow(ba) !== nonRow(bb)) return false;
      }
      // 이름 겹침 없음 (물건 = 분류+이름, 사야 할 것 = 이름)
      const sb = findSec(b, 'items'), tb = sb && tableOf(b, sb);
      if (tb) { const k = tb.rows.map((r) => r.cells[0] + '|' + r.cells[2]); if (new Set(k).size !== k.length) return false; }
      const ss = findSec(b, 'shop'), ts = ss && tableOf(b, ss);
      if (ts) { const k = ts.rows.map((r) => r.cells[0]); if (new Set(k).size !== k.length) return false; }
      return true;
    } catch (e) { return false; }
  }
  function okRow(kind, c) {
    const nameOk = (s) => { try { return checkName(s) === s; } catch (e) { return false; } };
    if (kind === 'items') {
      if (c.length !== SEC.items.head.length) return false;
      const cat = catByName(c[0]); if (!cat) return false;
      if (cat.pills.length ? !cat.pills.includes(c[1]) : c[1] !== '') return false;
      if (!nameOk(c[2])) return false;
      if (!/^\d{1,3}$/.test(c[3]) || Number(c[3]) > H.MAX_QTY) return false;
      if (c[4] !== '' && c[4] !== H.ESSENTIAL_MARK) return false;
      return true;
    }
    if (c.length !== SEC.shop.head.length) return false;
    return nameOk(c[0]) && isDate(c[1]) && (c[2] === H.SHOP_SRC.auto || c[2] === H.SHOP_SRC.manual);
  }
  // ## 생활습관 표 끝에 "살림" 기본 줄만 더해졌는지 (청소 습관 처음 체크)
  function onlyChoreRowsAdded(oldText, newText) {
    try {
      const a = splitLines(oldText), b = splitLines(newText);
      if (a.join('\n') === b.join('\n')) return true;
      const k = b.length - a.length; if (k < 1 || k > H.CHORES.length) return false;
      const sec = Md.sections(a).find((s) => s.name === Md.NAMES.habits), t = Md.table(a, sec);
      let end = t.line + 1; while (end < sec.end && isRow(a[end])) end++;
      if (a.slice(0, end).join('\n') !== b.slice(0, end).join('\n') || a.slice(end).join('\n') !== b.slice(end + k).join('\n')) return false;
      if (Md.parse(oldText).habits.rows.some((r) => r.kind === H.CHORE_KIND)) return false;
      return b.slice(end, end + k).every((l) => { const c = cellsOf(l); return c.length === 4 && c[1] === H.CHORE_KIND && H.CHORES.some((x) => x.name === c[0] && x.cycle === c[3] && x.target === c[2]); });
    } catch (e) { return false; }
  }

  // 아이콘 그림 키 (무늬 item_<키>, 없으면 item_unknown)
  function iconKey(name) { return H.ICON_PREFIX + (H.ICONS[name] || H.UNKNOWN_ICON); }

  const HH = { SEC, MAX_ROW_CHANGES, catById, catByName, checkName, view, choreState, defaultItems, applyInv, applyShop, ensureChores, toggleChore, onlyHouseChanged, onlyChoreRowsAdded, okRow, iconKey, colorOf };
  root.PHHousehold = HH;
  if (typeof module !== 'undefined' && module.exports) module.exports = HH;
})(typeof window !== 'undefined' ? window : globalThis);
