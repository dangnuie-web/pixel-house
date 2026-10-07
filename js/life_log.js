// 생활 기록 쓰기 2 (두부 대화창): ## 수면 / ## 식사 / ## 한마디 표. 그림·파일 접근 없음: 글(text)을 받아 새 글을 돌려준다.
// Electron 메인(electron/life_log_ipc.js)과 화면(dialog_flow.js, life_log_view.js), Node 시험(tests/test_dialog.js)이 같이 쓴다.
// 원칙은 물컵(life_write.js)과 같다: "정해진 섹션 안 오늘 줄 하나만 바꾸거나 한 줄 더함". 섹션이 없으면 ## 버킷리스트 앞에 새로 만듦.
// 다른 줄은 한 글자도 안 바뀐다. 메인은 쓰기 직전에 onlyLogChanged로 다시 확인한다.
(function (root) {
  'use strict';
  const Md = root.PHLifeMd || (typeof require !== 'undefined' ? require('./life_md.js') : null);
  // ## 식사 표는 식사 일지(js/meal_log.js, logs 브랜치 2026-10-04)가 넓힌 표를 같이 씀: 읽기·쓰기·검사를 그쪽에 맡김 (부를 때 찾음)
  const ML = () => root.PHMealLog || (typeof require !== 'undefined' ? require('./meal_log.js') : null);

  // 섹션 이름·표 머리 (파일에 들어가는 글자. 바꾸면 여기만)
  const SECTIONS = {
    sleep: { name: '수면', head: ['날짜', '잔 시각', '깬 시각', '메모'] },
    meal: { name: '식사', head: ['날짜', '시각', '끼니', '메뉴', '만족도', '양%', '메모'] }, // 2026-10-04 식사 일지로 넓힘 (옛 머리 날짜|끼니|내용 줄도 읽음, js/meal_log.js)
    note: { name: '한마디', head: ['날짜', '내용', '기분'] }, // 기분 칸 = D 기분 4칸 (2026-10-03 interact). 맨 끝에 붙여서 옛 2칸 줄도 그대로 읽힘
    // 안전장치 주간 확인 (js/life_check.js). 날짜 칸 = 그 주 월요일, 한 주·한 항목 한 줄 (다시 고르면 그 줄을 고침)
    safety: { name: '안전장치 확인', head: ['주 시작일', '항목', '결과'] },
  };
  // 옛 표 머리 (이 머리로 된 표에 쓸 때는 머리·구분선 두 줄만 새 머리로 바꾸고, 옛 줄은 그대로 둠 = 기분 빈칸)
  const OLD_HEADS = { note: [['날짜', '내용']] };
  // 기분 칸에 적는 값 (부기 MVP 대사 v01 mood.label: 칸 이름만 적음). js/data/interactions.js MOODS의 label과 같아야 함 (시험으로 확인)
  const MOODS = ['반짝', '포근', '노곤', '까슬'];
  const isOldHead = (kind, head) => (OLD_HEADS[kind] || []).some((h) => h.join('|') === head.join('|'));
  const MEALS = ['아침', '점심', '저녁', '간식'];
  const MULTI_MEAL = '간식'; // 간식만 하루에 여러 줄 (아침·점심·저녁은 하루 한 줄, 다시 적으면 그 줄을 고침). 토리 결정 2026-10-03
  const BEFORE = '버킷리스트'; // 새 섹션은 이 섹션 바로 앞에 (없으면 파일 끝)
  const MAX_LEN = 100;         // 글자 수 제한 (내용·메모)

  const pad = (n) => String(n).padStart(2, '0');
  // 기록 날짜: 하루의 경계 = startHour시 (settings.DAY_START_HOUR, 기본 6). 01~06시에 적으면 전날 날짜. 함수는 life_md.js 하나 (물컵·습관 체크와 같음)
  const ymd = Md.ymd, logDay = Md.logDay;

  // ---- 값 다듬기·검사 ----
  // 표를 깨는 글자: | -> ｜(전각), 줄바꿈·탭·제어 문자 -> 띄어쓰기. 앞뒤 공백 정리, 겹친 공백 하나로
  function clean(s) {
    return String(s == null ? '' : s).replace(/\|/g, '｜').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const len = (s) => Array.from(s).length;
  function text(s, opt) { // 다듬은 글. 너무 길거나(필수인데) 비었으면 오류
    if (s != null && typeof s !== 'string') throw new Error('글 형식 오류');
    const t = clean(s), max = (opt && opt.max) || MAX_LEN;
    if (len(t) > max) throw new Error('글이 너무 김 (' + max + '자까지)');
    if (opt && opt.required && !t) throw new Error('빈 글');
    return t;
  }
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  function isTime(s) { return typeof s === 'string' && TIME_RE.test(s); }
  function isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

  // 사람이 적은 시각 -> 'HH:MM' 목록. "1:30", "01:30", "1시", "1시 30분", "0시 반", "오후 11시", "23시", "130"(숫자만 3~4자리)
  //   한 글에 시각이 둘이면 둘 다 ("0시 반에 자서 8시 10분에 깸" -> ['00:30', '08:10']). 못 읽으면 []
  function parseTimes(s) {
    const src = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(), out = [];
    const re = /(오전|오후|밤|새벽|아침)?\s*(\d{1,2})\s*(?::\s*(\d{2})|시(?:\s*(반)|\s*(\d{1,2})\s*분?)?)/g;
    let m;
    while ((m = re.exec(src))) {
      let h = Number(m[2]); const mm = m[3] != null ? Number(m[3]) : m[4] ? 30 : m[5] != null ? Number(m[5]) : 0;
      if ((m[1] === '오후' || m[1] === '밤') && h >= 1 && h < 12) h += 12;
      if ((m[1] === '오전' || m[1] === '새벽' || m[1] === '아침') && h === 12) h = 0;
      if (h === 24) h = 0;
      if (h > 23 || mm > 59) return [];
      out.push(pad(h) + ':' + pad(mm));
    }
    if (!out.length) { const d = /^(\d{1,2})(\d{2})$/.exec(src); if (d && Number(d[1]) < 24 && Number(d[2]) < 60) out.push(pad(Number(d[1])) + ':' + d[2]); }
    return out;
  }
  function parseTime(s) { const t = parseTimes(s); return t.length === 1 ? t[0] : null; }
  // 'HH:MM' -> 화면 글자 "0시", "1시 30분" (부기 원고 {bed} {wake} 규칙)
  function fmtTime(s) { if (!isTime(s)) return String(s || ''); const h = Number(s.slice(0, 2)), m = Number(s.slice(3)); return h + '시' + (m ? ' ' + m + '분' : ''); }

  // ---- 읽기 ----
  const cellsOf = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const isRow = (l) => /^\s*\|/.test(l);
  const isSep = (l) => /^\s*\|?\s*:?-{3,}/.test(l);
  // 섹션 한 곳 찾기 (같은 이름이 둘 이상이면 오류: 어느 쪽에 쓸지 모름)
  function findSection(lines, kind) {
    const all = Md.sections(lines).filter((s) => s.name === SECTIONS[kind].name);
    if (all.length > 1) throw new Error('같은 섹션이 둘: ' + SECTIONS[kind].name);
    return all[0] || null;
  }
  // 섹션 안 표 범위 { headLine, sepLine, rows: [{ line, cells }], endLine } 또는 null
  function tableOf(lines, sec) {
    const t = Md.table(lines, sec); if (!t) return null;
    let sep = t.line + 1; if (!(sep < sec.end && isSep(lines[sep]))) sep = null;
    let end = (sep == null ? t.line : sep) + 1;
    while (end < sec.end && isRow(lines[end])) end++;
    return { headLine: t.line, head: t.head, sepLine: sep, rows: t.rows.map((r) => ({ line: r.line, cells: r.raw })), endLine: end };
  }
  // 글 -> { sleep: [{ line, date, bed, wake, memo }], meal: [{ line, date, kind, text }], note: [{ line, date, text }] } (파일 순서)
  function parse(src) {
    const lines = Array.isArray(src) ? src : String(src).replace(/\r\n?/g, '\n').split('\n');
    const out = { sleep: [], meal: [], note: [], safety: [] };
    Object.keys(SECTIONS).forEach((k) => {
      if (k === 'meal') { // 식사 일지 표 (새 줄·옛 줄 둘 다). 대화창·모아 보기가 쓰는 모양 { line, date, kind, text } + 일지 칸
        ML().parse(lines).rows.forEach((r) => out.meal.push(Object.assign({ text: r.menu }, r)));
        return;
      }
      const sec = Md.sections(lines).find((s) => s.name === SECTIONS[k].name); if (!sec) return;
      const t = tableOf(lines, sec); if (!t) return;
      const col = (name) => t.head.indexOf(name);
      t.rows.forEach((r) => {
        const c = (name) => { const i = col(name); return i < 0 ? '' : (r.cells[i] || ''); };
        if (k === 'sleep') out.sleep.push({ line: r.line, date: c('날짜'), bed: c('잔 시각'), wake: c('깬 시각'), memo: c('메모') });
        if (k === 'meal') out.meal.push({ line: r.line, date: c('날짜'), kind: c('끼니'), text: c('내용') });
        if (k === 'note') out.note.push({ line: r.line, date: c('날짜'), text: c('내용'), mood: c('기분') });
        if (k === 'safety') out.safety.push({ line: r.line, week: c('주 시작일'), item: c('항목'), result: c('결과') });
      });
    });
    return out;
  }
  // 그날 기록만: { sleep(한 줄 또는 null), meals: { 아침: {...}, ... , 간식: [...] }, notes: [...] }
  function dayOf(parsed, date) {
    const D = Md.dateOf(date), same = (r) => Md.dateOf(r.date) === D;
    const meals = { 간식: [] };
    parsed.meal.filter(same).forEach((r) => { if (r.kind === MULTI_MEAL) meals[MULTI_MEAL].push(r); else meals[r.kind] = r; });
    const sl = parsed.sleep.filter(same);
    return { sleep: sl.length ? sl[sl.length - 1] : null, meals, notes: parsed.note.filter(same) };
  }
  // 날짜별 묶음 (최근 날짜 먼저, 기록 보관 탭): [{ date, day, sleep, meals: [...], notes: [...] }]
  function byDate(parsed) {
    const m = new Map(), get = (d) => { if (!m.has(d)) m.set(d, { date: d, day: Md.dateOf(d), sleep: null, meals: [], notes: [] }); return m.get(d); };
    parsed.sleep.forEach((r) => { get(r.date).sleep = r; });
    parsed.meal.forEach((r) => get(r.date).meals.push(r));
    parsed.note.forEach((r) => get(r.date).notes.push(r));
    const rank = (k) => { const i = MEALS.indexOf(k); return i < 0 ? 9 : i; };
    return [...m.values()].map((g) => { g.meals.sort((a, b) => rank(a.kind) - rank(b.kind) || a.line - b.line); return g; }).sort((a, b) => (b.day || 0) - (a.day || 0));
  }

  // ---- 쓰기 계획 ----
  const rowText = (cells) => '| ' + cells.join(' | ') + ' |';
  const sepText = (n) => '|' + Array(n).fill('---').join('|') + '|'; // 파일의 다른 표와 같은 모양 |---|---|
  // 표 순서: 날짜가 내려가면 desc(최신 위), 아니면 asc(최신 아래, 기본)
  function order(rows) {
    const ds = rows.map((r) => Md.dateOf(r.cells[0])).filter((d) => d != null);
    if (ds.length < 2) return 'asc';
    return ds[0] > ds[ds.length - 1] ? 'desc' : 'asc';
  }
  // kind 표에 cells 줄 쓰기. match(cells) = 바꿀 줄 고르기 (없으면 새 줄). pickLast = 맞는 줄이 여럿이면 파일상 마지막(asc)/처음(desc)
  //   cells가 함수면 cells(바꿀 줄의 옛 칸 또는 null) -> 새 칸 (고칠 때 옛 칸 값을 이어받기: 한마디 고치기의 기분)
  //   -> { text, changed, line, inserted, created(섹션 새로 만듦), upgraded(옛 머리를 새 머리로), before, after }
  function upsert(src, kind, cellsIn, match) {
    const nl = /\r\n/.test(src) ? '\r\n' : '\n';
    const lines = String(src).split(/\r?\n/), S = SECTIONS[kind];
    const cellsOf2 = (old) => (typeof cellsIn === 'function' ? cellsIn(old) : cellsIn);
    let row = rowText(cellsOf2(null));
    const sec = findSection(lines, kind);
    if (!sec) { // 섹션 새로: ## 버킷리스트 앞 (없으면 파일 끝)
      const block = ['## ' + S.name, rowText(S.head), sepText(S.head.length), row, ''];
      const bi = Md.sections(lines).find((s) => s.name === BEFORE);
      let at;
      if (bi) at = bi.line;
      else { at = lines.length; while (at > 0 && lines[at - 1] === '') at--; block.unshift(''); block.pop(); } // 끝: 빈 줄 하나 띄우고 붙임 (끝 빈 줄은 그대로)
      lines.splice(at, 0, ...block);
      return { text: lines.join(nl), changed: true, line: at + block.indexOf(row), inserted: true, created: true, before: null, after: row };
    }
    let t = tableOf(lines, sec), upgraded = false;
    if (t && isOldHead(kind, t.head)) { // 옛 머리: 머리·구분선만 새 모양으로 (옛 줄은 칸이 모자란 채 그대로 = 빈칸)
      lines[t.headLine] = rowText(S.head); if (t.sepLine != null) lines[t.sepLine] = sepText(S.head.length);
      t = tableOf(lines, sec); upgraded = true;
    }
    if (!t) { // 섹션은 있는데 표가 없음: 섹션 글 끝(빈 줄 앞)에 머리·구분선·줄
      let at = sec.end; while (at > sec.start && lines[at - 1].trim() === '') at--;
      lines.splice(at, 0, rowText(S.head), sepText(S.head.length), row);
      return { text: lines.join(nl), changed: true, line: at + 2, inserted: true, created: false, before: null, after: row };
    }
    if (t.head.join('|') !== S.head.join('|')) throw new Error('표 머리가 달라서 멈춤: ## ' + S.name);
    const desc = order(t.rows) === 'desc';
    const hits = match ? t.rows.filter((r) => match(r.cells)) : [];
    const hit = hits.length ? (desc ? hits[0] : hits[hits.length - 1]) : null;
    if (hit) {
      row = rowText(cellsOf2(hit.cells));
      if (lines[hit.line] === row && !upgraded) return { text: src, changed: false, line: hit.line };
      const before = lines[hit.line]; lines[hit.line] = row;
      return { text: lines.join(nl), changed: true, line: hit.line, inserted: false, created: false, upgraded, before, after: row };
    }
    // 새 줄: asc = 표 끝, desc = 구분선 바로 아래. desc에서 같은 날짜 줄이 이미 있으면 그 줄들 위(그날 안에서도 최신 위)
    const at = desc ? (t.sepLine != null ? t.sepLine + 1 : t.headLine + 1) : t.endLine;
    lines.splice(at, 0, row);
    return { text: lines.join(nl), changed: true, line: at, inserted: true, created: false, upgraded, before: null, after: row };
  }
  const sameDate = (date) => (c) => Md.dateOf(c[0]) === Md.dateOf(date);

  // 잠: 그날(깬 날) 한 줄. 잔·깬 시각은 'HH:MM' (둘 중 하나는 비어도 됨, 둘 다 비면 오류)
  function setSleep(src, o) {
    if (!isDate(o.date)) throw new Error('날짜 오류');
    const bed = o.bed == null ? '' : o.bed, wake = o.wake == null ? '' : o.wake;
    if ((bed !== '' && !isTime(bed)) || (wake !== '' && !isTime(wake))) throw new Error('시각 형식 오류 (HH:MM)');
    if (bed === '' && wake === '') throw new Error('시각이 비었음');
    const memo = text(o.memo);
    return upsert(src, 'sleep', [o.date, bed, wake, memo], sameDate(o.date));
  }
  // 식사: 아침·점심·저녁은 그날 그 끼니 한 줄(있으면 고침), 간식은 늘 한 줄 더함
  function addMeal(src, o) {
    if (!isDate(o.date)) throw new Error('날짜 오류');
    if (!MEALS.includes(o.kind)) throw new Error('끼니 오류');
    const body = text(o.text, { required: true });
    // 식사 일지 표에 씀 (js/meal_log.js dialogMeal): 아침·점심·저녁 = 그날 그 끼니 마지막 줄의 메뉴만 고침, 간식 = 더함. o.time = 적은 시각 'HH:MM'(없으면 빈칸)
    if (o.time != null && o.time !== '' && !isTime(o.time)) throw new Error('시각 형식 오류 (HH:MM)');
    return ML().dialogMeal(src, { date: o.date, kind: o.kind, text: body, time: o.time || '' });
  }
  // 한마디: 기본은 한 줄 더함(하루 여러 줄), fix = 그날 마지막 한마디를 고침 (없으면 더함)
  //   mood = 기분 칸 (MOODS 중 하나, 없으면 빈칸). 기분이 있으면 내용은 비어도 됨 (D: "한 줄 더 적을래요?"를 건너뜀)
  //   고칠 때 mood를 안 보내면 그 줄의 기분을 그대로 둠
  function setNote(src, o) {
    if (!isDate(o.date)) throw new Error('날짜 오류');
    if (o.mood != null && o.mood !== '' && !MOODS.includes(o.mood)) throw new Error('기분 값 오류');
    const mood = o.mood || '';
    const body = text(o.text, { required: !mood });
    const cells = (old) => [o.date, body, o.mood == null && old ? (old[2] || '') : mood];
    return upsert(src, 'note', cells, o.fix ? sameDate(o.date) : null);
  }

  // ---- 안전 검사 (메인이 쓰기 직전에) ----
  // 옛 글 -> 새 글이 "kind 섹션 표 안에서 date 줄 하나 바꿈 / date 줄 하나 더함 / (표 없던 섹션에) 머리+구분선+줄 / (섹션 없던 파일에) 새 섹션 한 덩이"인지.
  // 섹션 밖은 한 글자도 다르면 안 됨. 바뀌거나 더해진 줄은 표 줄이고, 칸 수 = 머리 칸 수, 날짜 칸 = date
  function onlyLogChanged(oldText, newText, kind, date) {
    try {
      const S = SECTIONS[kind]; if (!S || !isDate(date)) return false;
      if (kind === 'meal') return ML().onlyMealChanged(oldText, newText, 'upsert', { dialog: true, date }); // 식사 일지 표 규칙 (js/meal_log.js)
      const a = String(oldText).split(/\r?\n/), b = String(newText).split(/\r?\n/);
      const sa = findSection(a, kind), sb = findSection(b, kind);
      // 옛 머리 표(한마디 2칸)를 새 머리로 바꾼 쓰기: 옛 글의 머리·구분선을 새 모양으로 바꿔 놓고 나머지를 같은 규칙으로 봄
      if (sa) { const ta0 = tableOf(a, sa); if (ta0 && isOldHead(kind, ta0.head)) { a[ta0.headLine] = rowText(S.head); if (ta0.sepLine != null) a[ta0.sepLine] = sepText(S.head.length); } }
      if (!sb) return false;
      const outA = sa ? a.slice(0, sa.line).concat(a.slice(sa.end)) : a, outB = b.slice(0, sb.line).concat(b.slice(sb.end));
      // 파일 끝에 새 섹션을 붙일 때 앞에 띄운 빈 줄 하나는 허용 (원래 끝 줄이 빈 줄이 아니었을 때)
      const endPad = !sa && sb.end === b.length && outB.length === outA.length + 1 && outB[outB.length - 1] === '' && outA.length && outA[outA.length - 1] !== '';
      if (outA.join('\n') !== (endPad ? outB.slice(0, -1) : outB).join('\n')) return false;
      const tb = tableOf(b, sb); if (!tb || tb.head.join('|') !== S.head.join('|')) return false;
      const okRow = (i) => tb.rows.some((r) => r.line === i) && cellsOf(b[i]).length === S.head.length && cellsOf(b[i])[0] === date && !isSep(b[i]);
      const bodyA = sa ? a.slice(sa.line, sa.end) : [], bodyB = b.slice(sb.line, sb.end);
      if (!sa) { // 새 섹션: 정해진 모양 그대로 + 자리 = 버킷리스트 바로 앞 또는 파일 끝
        const next = Md.sections(b).find((s) => s.line === sb.end);
        if (!(sb.end === b.length || (next && next.name === BEFORE))) return false;
        const want = ['## ' + S.name, rowText(S.head), sepText(S.head.length)];
        if (bodyB.slice(0, 3).join('\n') !== want.join('\n')) return false;
        const rest = bodyB.slice(4); if (rest.some((l) => l.trim() !== '')) return false;
        return okRow(sb.line + 3);
      }
      if (bodyA[0] !== bodyB[0]) return false; // 제목 줄 그대로
      if (bodyA.length === bodyB.length) {
        const diff = bodyA.map((x, i) => (x === bodyB[i] ? -1 : i)).filter((i) => i >= 0);
        if (diff.length === 0) return true;
        if (diff.length !== 1) return false;
        const i = sb.line + diff[0], ta = tableOf(a, sa);
        if (!ta || !ta.rows.some((r) => r.line === sa.line + diff[0])) return false; // 옛 줄도 표 데이터 줄
        if (cellsOf(bodyA[diff[0]])[0] !== date) return false;                       // 옛 줄도 그날 줄
        if ((kind === 'meal' || kind === 'safety') && cellsOf(bodyA[diff[0]])[1] !== cellsOf(bodyB[diff[0]])[1]) return false; // 끼니·항목은 그대로
        return okRow(i);
      }
      const k = bodyB.length - bodyA.length;
      if (k !== 1 && k !== 3) return false;
      let p = 0; while (p < bodyA.length && bodyA[p] === bodyB[p]) p++;
      if (bodyA.slice(p).join('\n') !== bodyB.slice(p + k).join('\n')) return false;
      if (k === 1) return okRow(sb.line + p);
      // k = 3: 표가 없던 섹션에 머리+구분선+줄
      if (tableOf(a, sa)) return false;
      return b[sb.line + p] === rowText(S.head) && b[sb.line + p + 1] === sepText(S.head.length) && okRow(sb.line + p + 2);
    } catch (e) { return false; }
  }

  const LL = { SECTIONS, OLD_HEADS, MOODS, MEALS, MULTI_MEAL, MAX_LEN, ymd, logDay, clean, text, isTime, parseTimes, parseTime, fmtTime, parse, dayOf, byDate, setSleep, addMeal, setNote, onlyLogChanged, upsert };
  root.PHLifeLog = LL;
  if (typeof module !== 'undefined' && module.exports) module.exports = LL;
})(typeof window !== 'undefined' ? window : globalThis);
