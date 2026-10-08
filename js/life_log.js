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
    sleep: { name: '수면', head: ['날짜', '잔 시각', '깬 시각', '메모'] }, // 대화창·두부 펫이 새로 만드는 머리. 선잠을 적으면 SLEEP_HEAD_WIDE (아래 "잠 구간")
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
  // 글 -> { sleep: [{ line, date, bed, wake, memo, kind, light, start, end }], meal: [{ line, date, kind, text }], note: [{ line, date, text }] } (파일 순서)
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
        if (k === 'sleep') out.sleep.push(sleepRow({ line: r.line, date: c('날짜'), bed: c('잔 시각'), wake: c('깬 시각'), memo: c('메모'), kind: c('종류') }));
        if (k === 'meal') out.meal.push({ line: r.line, date: c('날짜'), kind: c('끼니'), text: c('내용') });
        if (k === 'note') out.note.push({ line: r.line, date: c('날짜'), text: c('내용'), mood: c('기분') });
        if (k === 'safety') out.safety.push({ line: r.line, week: c('주 시작일'), item: c('항목'), result: c('결과') });
      });
    });
    return out;
  }
  // 그날 기록만: { sleep(대표 줄 또는 null, mainSleep), sleeps(그날 줄 전부), meals: { 아침: {...}, ... , 간식: [...] }, notes: [...] }
  function dayOf(parsed, date) {
    const D = Md.dateOf(date), same = (r) => Md.dateOf(r.date) === D;
    const meals = { 간식: [] };
    parsed.meal.filter(same).forEach((r) => { if (r.kind === MULTI_MEAL) meals[MULTI_MEAL].push(r); else meals[r.kind] = r; });
    const sl = parsed.sleep.filter(same);
    return { sleep: mainSleep(sl), sleeps: sl, meals, notes: parsed.note.filter(same) };
  }
  // 날짜별 묶음 (최근 날짜 먼저, 기록 보관 탭): [{ date, day, sleep, meals: [...], notes: [...] }]
  function byDate(parsed) {
    const m = new Map(), get = (d) => { if (!m.has(d)) m.set(d, { date: d, day: Md.dateOf(d), sleep: null, sleeps: [], meals: [], notes: [] }); return m.get(d); };
    parsed.sleep.forEach((r) => { const g = get(r.date); g.sleeps.push(r); g.sleep = mainSleep(g.sleeps); });
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
  // kind 표에 cells 줄 쓰기. match(cells, line) = 바꿀 줄 고르기 (없으면 새 줄). 칸이 표 머리보다 적으면 뒤를 빈칸으로 채움 (넓은 수면 표) pickLast = 맞는 줄이 여럿이면 파일상 마지막(asc)/처음(desc)
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
    if (!okHead(kind, t.head)) throw new Error('표 머리가 달라서 멈춤: ## ' + S.name);
    const n = t.head.length, fit = (c) => (c.length < n ? c.concat(Array(n - c.length).fill('')) : c);
    const desc = order(t.rows) === 'desc';
    const hits = match ? t.rows.filter((r) => match(r.cells, r.line)) : [];
    const hit = hits.length ? (desc ? hits[0] : hits[hits.length - 1]) : null;
    row = rowText(fit(cellsOf2(null)));
    if (hit) {
      row = rowText(fit(cellsOf2(hit.cells)));
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

  // 잠 (대화창·두부 펫): 그날(깬 날) 대표 줄 하나(mainSleep)를 고치거나, 없으면 한 줄 더함. 잔·깬 시각은 'HH:MM' (둘 중 하나는 비어도 됨, 둘 다 비면 오류)
  //   그날 줄이 하나뿐이던 옛 파일은 예전과 똑같이 그 줄을 고침. 칠하기로 구간이 여럿이면 대표 줄만 고치고 다른 구간(낮잠·선잠)은 그대로
  //   넓은 표(종류 칸)면 종류 칸은 빈칸(보통 잠)으로 씀
  function setSleep(src, o) {
    if (!isDate(o.date)) throw new Error('날짜 오류');
    const bed = o.bed == null ? '' : o.bed, wake = o.wake == null ? '' : o.wake;
    if ((bed !== '' && !isTime(bed)) || (wake !== '' && !isTime(wake))) throw new Error('시각 형식 오류 (HH:MM)');
    if (bed === '' && wake === '') throw new Error('시각이 비었음');
    const memo = text(o.memo);
    const main = mainSleep(parse(src).sleep.filter((r) => Md.dateOf(r.date) === Md.dateOf(o.date)));
    return upsert(src, 'sleep', [o.date, bed, wake, memo], main ? (c, line) => line === main.line : null);
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

  // ---- 잠 구간 (2026-10-08 잠 기록 살리기: 하루에 구간 여러 개 + 선잠) ----
  // ## 수면 표 한 줄 = 잠 구간 하나. 하루에 줄 여러 개(밤잠·낮잠·선잠)를 둘 수 있다. 시각은 분 단위 'HH:MM'
  //   날짜 = 깬 날. 잔 시각 > 깬 시각이면 전날 잔 것 (| 2026-10-08 | 23:30 | 07:00 | = 10-07 23:30 ~ 10-08 07:00)
  //   종류 칸 = '선잠'이면 선잠, 빈칸이면 보통 잠. 종류 칸은 선잠을 처음 적을 때 머리에 붙음(SLEEP_HEAD_WIDE). 옛 4칸 줄은 종류 빈칸으로 읽힘
  //   대화창·두부 펫(setSleep)은 지금처럼 4칸 표를 만들고, 넓은 표에선 5칸으로 씀
  // 시각 계산은 "1970-01-01 00:00부터 몇 분"(시간대·서머타임 없음, 달력 그대로). toMin / fromMin
  const SLEEP_HEAD_WIDE = ['날짜', '잔 시각', '깬 시각', '메모', '종류'];
  const LIGHT = '선잠';
  const SLEEP_GRID_HOUR = 18; // 모눈 한 줄 시작 시각 기본값 (제작자 2026-10-08 "저녁부터", 정확한 값은 무늬 시안에서. sleepGrid startHour로 바꿈)
  const MAX_SEGS = 96;        // 한 번에 쓰는 구간 수 상한 (15분 칸 24시간 = 96)
  const okHead = (kind, head) => (kind === 'sleep' ? [SECTIONS.sleep.head, SLEEP_HEAD_WIDE] : [SECTIONS[kind].head]).some((h) => h.join('|') === head.join('|'));
  function dayNum(date) { // 'YYYY-MM-DD' -> 1970-01-01부터 며칠 (없는 날짜면 null)
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date)); if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? Math.round(d.getTime() / 86400000) : null;
  }
  const hm = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  function toMin(s) { // 'YYYY-MM-DD HH:MM' -> 분, 못 읽으면 null
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/.exec(String(s == null ? '' : s).trim()); if (!m || !isTime(m[2])) return null;
    const d = dayNum(m[1]); return d == null ? null : d * 1440 + hm(m[2]);
  }
  function fromMin(n) { // 분 -> 'YYYY-MM-DD HH:MM'
    const d = Math.floor(n / 1440), r = n - d * 1440, t = new Date(d * 86400000);
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()) + ' ' + pad(Math.floor(r / 60)) + ':' + pad(r % 60);
  }
  // 표 한 줄 -> 구간 { start, end } (분). 잔·깬 시각이 다 있어야 함. 같은 시각(0분)이면 null
  function segOf(date, bed, wake) {
    const d = dayNum(date); if (d == null || !isTime(bed) || !isTime(wake)) return null;
    const end = d * 1440 + hm(wake); let start = d * 1440 + hm(bed);
    if (start > end) start -= 1440;
    return start === end ? null : { start, end };
  }
  function sleepRow(r) { // parse 한 줄에 light·start·end 붙임 (구간이 아니면 start·end = null: 잔 시각만·깬 시각만 적은 줄)
    const s = segOf(r.date, r.bed, r.wake);
    return Object.assign(r, { light: String(r.kind || '').includes(LIGHT), start: s ? s.start : null, end: s ? s.end : null });
  }
  // 그날 줄들 중 대표 줄 (대화창·두부 펫이 "오늘 잠"으로 보여 주고 고치는 줄): 선잠 아닌 줄 우선, 그중 가장 긴 것, 같으면 파일상 뒤
  //   줄이 하나면 그 줄 (옛 파일은 예전과 같음). 없으면 null
  function mainSleep(rows) {
    if (!rows || !rows.length) return null;
    const pool = rows.some((r) => !r.light) ? rows.filter((r) => !r.light) : rows;
    const span = (r) => (r.start != null ? r.end - r.start : 0);
    return pool.reduce((best, r) => (span(r) >= span(best) ? r : best));
  }
  // 구간들 -> 겹침·맞닿음 정리: 겹치면 보통 잠이 선잠보다 앞섬, 같은 종류로 맞닿으면 하나로. 메모는 다른 것끼리 ' · '로 이음(100자까지)
  //   segs = [{ start, end, light, memo }] (분) -> 같은 모양, 시작 순
  function normalize(segs) {
    const pts = [...new Set(segs.flatMap((s) => [s.start, s.end]))].sort((x, y) => x - y), out = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], cov = segs.filter((s) => s.start <= a && s.end >= b); if (!cov.length) continue;
      const deep = cov.filter((s) => !s.light), from = deep.length ? deep : cov, light = !deep.length;
      const memos = from.map((s) => s.memo || '').filter(Boolean), last = out[out.length - 1];
      if (last && last.end === a && last.light === light) { last.end = b; memos.forEach((m) => { if (!last.memos.includes(m)) last.memos.push(m); }); }
      else out.push({ start: a, end: b, light, memos: [...new Set(memos)] });
    }
    return out.map((s) => ({ start: s.start, end: s.end, light: s.light, memo: Array.from(s.memos.join(' · ')).slice(0, MAX_LEN).join('').trim() }));
  }
  // 창 { w0, w1 } (분). from = 'YYYY-MM-DD HH:MM', hours = 1~max (기본 24)
  function windowOf(from, hours, max) {
    const w0 = toMin(from); if (w0 == null) throw new Error('창 시작 형식 오류 (YYYY-MM-DD HH:MM)');
    const h = hours == null ? 24 : hours;
    if (!Number.isInteger(h) || h < 1 || h > (max || 48)) throw new Error('창 길이 오류 (1~' + (max || 48) + '시간)');
    return { w0, w1: w0 + h * 60 };
  }
  // 구간 하나를 화면에 넘기는 모양 (a·b = 창 시작부터 몇 분, 창 밖으로 나간 쪽은 잘라서. cutStart·cutEnd = 잘렸는지)
  function segView(s, W, row) {
    const o = { start: fromMin(s.start), end: fromMin(s.end), a: Math.max(s.start, W.w0) - W.w0, b: Math.min(s.end, W.w1) - W.w0, light: !!s.light, memo: s.memo || '', cutStart: s.start < W.w0, cutEnd: s.end > W.w1 };
    if (row) Object.assign(o, { line: row.line, date: row.date, bed: row.bed, wake: row.wake });
    return o;
  }
  // 읽기: 기준 시각 from부터 hours시간 창에 걸친 잠
  //   -> { from, to, segments: 표 줄 그대로(겹칠 수 있음, 줄 번호 포함), merged: 칠하기용으로 정리한 구간(겹침 없음), open: 잔 시각·깬 시각 하나만 적힌 줄(그 시각이 창 안) }
  //   src = 글 또는 parse() 결과
  function sleepWindow(src, from, hours) {
    const P = src && Array.isArray(src.sleep) ? src : parse(src), W = windowOf(from, hours, 48);
    const rows = P.sleep.filter((r) => r.start != null && r.start < W.w1 && r.end > W.w0).sort((x, y) => x.start - y.start || x.line - y.line);
    const merged = normalize(rows.map((r) => ({ start: r.start, end: r.end, light: r.light, memo: r.memo }))).filter((s) => s.start < W.w1 && s.end > W.w0);
    const open = openRowsIn(P, W).map(({ r, at }) => ({ line: r.line, date: r.date, bed: r.bed, wake: r.wake, memo: r.memo, at, a: toMin(at) - W.w0, side: isTime(r.bed) ? 'bed' : 'wake' }));
    return { from: fromMin(W.w0), to: fromMin(W.w1), segments: rows.map((r) => segView(r, W, r)), merged: merged.map((s) => segView(s, W)), open };
  }
  // 모눈용: firstDate부터 days줄. 줄 하나 = 그 날짜 startHour시부터 hours시간 (기본 18시 ~ 다음날 18시). 줄 이름 date = 창이 시작하는 날
  //   -> [{ date, from, to, segments, merged, open }]
  function sleepGrid(src, o) {
    o = o || {};
    const P = src && Array.isArray(src.sleep) ? src : parse(src);
    const d0 = dayNum(o.from); if (d0 == null) throw new Error('날짜 오류');
    const days = o.days == null ? 7 : o.days, h0 = o.startHour == null ? SLEEP_GRID_HOUR : o.startHour;
    if (!Number.isInteger(days) || days < 1 || days > 400) throw new Error('줄 수 오류 (1~400)');
    if (!Number.isInteger(h0) || h0 < 0 || h0 > 23) throw new Error('시작 시각 오류 (0~23)');
    const out = [];
    for (let i = 0; i < days; i++) {
      const date = fromMin((d0 + i) * 1440).slice(0, 10);
      out.push(Object.assign({ date }, sleepWindow(P, date + ' ' + pad(h0) + ':00', o.hours)));
    }
    return out;
  }
  // 그날(깬 날) 구간: dayOf(..).sleeps 와 같은 줄 + 분. 칠하기가 아니라 날짜 기준으로 볼 때
  function sleepDay(src, date) {
    const P = src && Array.isArray(src.sleep) ? src : parse(src), D = Md.dateOf(date);
    return P.sleep.filter((r) => Md.dateOf(r.date) === D);
  }

  // 쓰기에 들어온 구간 검사 -> [{ start, end, light, memo }] (분, 창 안)
  //   한 구간 = { start: 'YYYY-MM-DD HH:MM', end: '…' } 또는 { a, b } (창 시작부터 몇 분, 정수). light = true면 선잠. memo = 100자까지
  function cleanSegs(list, W) {
    if (!Array.isArray(list)) throw new Error('구간 목록 형식 오류');
    if (list.length > MAX_SEGS) throw new Error('구간이 너무 많음 (' + MAX_SEGS + '개까지)');
    return list.map((x) => {
      if (!x || typeof x !== 'object') throw new Error('구간 형식 오류');
      let s, e;
      if (x.a != null || x.b != null) {
        if (!Number.isInteger(x.a) || !Number.isInteger(x.b)) throw new Error('구간 분 형식 오류 (정수)');
        s = W.w0 + x.a; e = W.w0 + x.b;
      } else {
        if (typeof x.start !== 'string' || typeof x.end !== 'string') throw new Error('구간 시각 형식 오류');
        s = toMin(x.start); e = toMin(x.end);
        if (s == null || e == null) throw new Error('구간 시각 형식 오류 (YYYY-MM-DD HH:MM)');
      }
      if (!(s < e)) throw new Error('구간 끝이 시작보다 앞섬');
      if (s < W.w0 || e > W.w1) throw new Error('구간이 창 밖으로 나감');
      if (x.light != null && typeof x.light !== 'boolean') throw new Error('선잠 값 형식 오류');
      return { start: s, end: e, light: x.light === true, memo: text(x.memo) };
    });
  }
  // 잔 시각만·깬 시각만 적은 줄 중 그 시각이 창 안인 것: [{ r, at: 'YYYY-MM-DD HH:MM' }] (sleepWindow open과 같은 규칙)
  function openRowsIn(P, W) {
    const out = [];
    P.sleep.forEach((r) => {
      if (r.start != null) return;
      const d = dayNum(r.date), t = isTime(r.bed) ? r.bed : isTime(r.wake) ? r.wake : null; if (d == null || !t) return;
      const at = d * 1440 + hm(t); if (at >= W.w0 && at < W.w1) out.push({ r, at: fromMin(at) });
    });
    return out;
  }
  function cleanDrop(list) {
    if (list == null) return [];
    if (!Array.isArray(list) || list.length > MAX_SEGS || !list.every((x) => typeof x === 'string' && toMin(x) != null)) throw new Error('지울 줄 형식 오류');
    return list.map((x) => fromMin(toMin(x)));
  }
  // 한 줄에 못 적는 긴 구간(24시간 이상: 잔 시각 = 깬 시각이 됨)을 창 경계에서, 그래도 길면 반으로 나눔
  function splitLong(segs, W) {
    const out = [];
    const cut = (s) => {
      if (s.end - s.start < 1440) { out.push(s); return; }
      const at = [W.w0, W.w1].find((p) => p > s.start && p < s.end);
      const m = at != null ? at : s.start + Math.floor((s.end - s.start) / 2);
      cut(Object.assign({}, s, { end: m })); cut(Object.assign({}, s, { start: m }));
    };
    segs.forEach(cut);
    return out;
  }
  const segCells = (s, wide) => { const e = fromMin(s.end), b = fromMin(s.start); const c = [e.slice(0, 10), b.slice(11), e.slice(11), s.memo || '']; if (wide) c.push(s.light ? LIGHT : ''); return c; };

  // 쓰기: 창(from부터 hours시간, 1~24) 안 잠을 segments로 통째로 바꿈 (칠하기 "기록하기")
  //   - 창에 걸친 줄은 다 지우고, 창 밖으로 나가 있던 부분은 남김 (밤잠 17:00~19:00에서 18:00 창을 고치면 17:00~18:00은 그대로)
  //   - 남은 부분과 새 구간이 같은 종류로 맞닿으면 한 줄로 이음. 창에 안 걸친 줄(잔 시각만 적은 줄 포함)은 한 글자도 안 바뀜
  //   - 새 줄 자리 = 지운 줄 중 맨 위 자리 (없으면 날짜 순서에 맞는 자리). 선잠이 있으면 표 머리에 종류 칸을 붙임(머리·구분선 두 줄만 바뀜)
  //   - 섹션이 없으면 ## 버킷리스트 앞에 새로. segments = [] 이면 창 안 잠을 지움
  //   - dropOpen = 지울 "잔 시각만·깬 시각만" 줄의 시각 목록 ['YYYY-MM-DD HH:MM', …] (sleepWindow().open[].at). 창 안에 있는 것만 지움 (2026-10-09 칠하기 창: 칠한 잠이 덮었거나 [지우기])
  //   -> { text, changed, removed, added, created, widened, from, to, dropped }
  function setSleepWindow(src, o) {
    o = o || {};
    const W = windowOf(o.from, o.hours, 24), painted = cleanSegs(o.segments, W), drop = cleanDrop(o.dropOpen);
    const nl = /\r\n/.test(src) ? '\r\n' : '\n', lines = String(src).split(/\r?\n/), S = SECTIONS.sleep;
    const sec = findSection(lines, 'sleep'), t = sec ? tableOf(lines, sec) : null;
    if (t && !okHead('sleep', t.head)) throw new Error('표 머리가 달라서 멈춤: ## ' + S.name);
    const P = parse(lines);
    const hit = t ? P.sleep.filter((r) => r.start != null && r.start < W.w1 && r.end > W.w0) : [];
    const dropRows = t ? openRowsIn(P, W).filter((x) => drop.includes(x.at)).map((x) => x.r) : [];
    const rest = [];
    hit.forEach((r) => {
      if (r.start < W.w0) rest.push({ start: r.start, end: W.w0, light: r.light, memo: r.memo });
      if (r.end > W.w1) rest.push({ start: W.w1, end: r.end, light: r.light, memo: r.memo });
    });
    const segs = splitLong(normalize(rest.concat(painted)), W).sort((x, y) => x.start - y.start);
    const res = (text, x) => Object.assign({ text, from: fromMin(W.w0), to: fromMin(W.w1), removed: hit.length, added: segs.length, created: false, widened: false, dropped: x && x.changed ? dropRows.length : 0 }, x);
    const anyLight = segs.some((s) => s.light);
    if (!t && !segs.length) return res(src, { changed: false, removed: 0, added: 0 });
    const wide = t ? (t.head.length === SLEEP_HEAD_WIDE.length || anyLight) : anyLight, head = wide ? SLEEP_HEAD_WIDE : S.head;
    if (!sec) { // 섹션 새로: ## 버킷리스트 앞 (없으면 파일 끝) = upsert와 같은 자리
      const block = ['## ' + S.name, rowText(head), sepText(head.length)].concat(segs.map((s) => rowText(segCells(s, wide))), ['']);
      const bi = Md.sections(lines).find((s) => s.name === BEFORE);
      let at;
      if (bi) at = bi.line;
      else { at = lines.length; while (at > 0 && lines[at - 1] === '') at--; block.unshift(''); block.pop(); }
      lines.splice(at, 0, ...block);
      return res(lines.join(nl), { changed: true, created: true, widened: wide });
    }
    if (!t) { // 섹션은 있는데 표가 없음: 섹션 글 끝(빈 줄 앞)에 머리·구분선·줄
      let at = sec.end; while (at > sec.start && lines[at - 1].trim() === '') at--;
      lines.splice(at, 0, rowText(head), sepText(head.length), ...segs.map((s) => rowText(segCells(s, wide))));
      return res(lines.join(nl), { changed: true, widened: wide });
    }
    const newRows = segs.map((s) => rowText(segCells(s, wide)));
    const oldRows = hit.map((r) => lines[r.line]);
    const widen = wide && t.head.length !== SLEEP_HEAD_WIDE.length;
    if (!widen && !dropRows.length && newRows.slice().sort().join('\n') === oldRows.slice().sort().join('\n')) return res(src, { changed: false });
    const desc = order(t.rows) === 'desc';
    if (desc) newRows.reverse(); // 최신 위 표면 새 줄도 최신 위
    let at;
    if (hit.length) at = Math.min(...hit.map((r) => r.line));
    else if (segs.length) {
      const dOf = (s) => Md.dateOf(fromMin(s.end).slice(0, 10)), lo = Math.min(...segs.map(dOf)), hi = Math.max(...segs.map(dOf));
      const r = t.rows.find((x) => { const d = Md.dateOf(x.cells[0]); return d != null && (desc ? d < lo : d > hi); });
      at = r ? r.line : t.endLine;
    } else at = t.endLine;
    const gone = hit.concat(dropRows).map((r) => r.line);
    at -= gone.filter((i) => i < at).length; // 지운 줄이 새 자리보다 위에 있으면 그만큼 당김
    gone.sort((x, y) => y - x).forEach((i) => lines.splice(i, 1));
    lines.splice(at, 0, ...newRows);
    if (widen) { lines[t.headLine] = rowText(SLEEP_HEAD_WIDE); if (t.sepLine != null) lines[t.sepLine] = sepText(SLEEP_HEAD_WIDE.length); }
    return res(lines.join(nl), { changed: true, widened: widen });
  }

  // 안전 검사 (메인이 쓰기 직전에, setSleepWindow 결과): 옛 글 -> 새 글이
  //   ## 수면 밖 한 글자도 같음 / 섹션 안 표 밖 글 같음 / 표 머리는 그대로 또는 4칸 -> 5칸(종류)만 /
  //   창에 안 걸친 옛 줄은 순서·글자 그대로 다 남음 / 새로 생긴 줄은 모두 올바른 구간 줄 /
  //   창 밖 잠(보통·선잠)은 지운 줄과 새 줄이 똑같음 (창 밖 기록을 바꾸지 않음)
  //   dropOpen (setSleepWindow와 같은 값): 창 안 "잔 시각만·깬 시각만" 줄 중 이 목록에 든 것은 지워져도 됨 (그 밖의 옛 줄은 다 남아야 함)
  function onlySleepWindowChanged(oldText, newText, from, hours, dropOpen) {
    try {
      const W = windowOf(from, hours, 24), S = SECTIONS.sleep, drop = cleanDrop(dropOpen);
      const a = String(oldText).split(/\r?\n/), b = String(newText).split(/\r?\n/);
      const sa = findSection(a, 'sleep'), sb = findSection(b, 'sleep');
      if (!sb) return false;
      const outA = sa ? a.slice(0, sa.line).concat(a.slice(sa.end)) : a, outB = b.slice(0, sb.line).concat(b.slice(sb.end));
      const endPad = !sa && sb.end === b.length && outB.length === outA.length + 1 && outB[outB.length - 1] === '' && outA.length && outA[outA.length - 1] !== '';
      if (outA.join('\n') !== (endPad ? outB.slice(0, -1) : outB).join('\n')) return false;
      const tb = tableOf(b, sb); if (!tb || !okHead('sleep', tb.head)) return false;
      const ta = sa ? tableOf(a, sa) : null; if (ta && !okHead('sleep', ta.head)) return false;
      if (ta && ta.head.length > tb.head.length) return false;
      const strip = (L, s0, t0) => L.slice(s0.line, t0 ? t0.headLine : s0.end).concat(t0 ? L.slice(t0.endLine, s0.end) : []);
      if (sa) {
        if (strip(a, sa, ta).join('\n') !== strip(b, sb, tb).join('\n')) return false;
        if (ta && ta.headLine - sa.line !== tb.headLine - sb.line) return false;
      } else {
        const next = Md.sections(b).find((s) => s.line === sb.end);
        if (!(sb.end === b.length || (next && next.name === BEFORE))) return false;
        if (b[sb.line] !== '## ' + S.name || tb.headLine !== sb.line + 1) return false;
        if (b.slice(tb.endLine, sb.end).some((l) => l.trim() !== '')) return false;
      }
      if (ta && tb.head.length === ta.head.length) { // 머리 그대로: 머리·구분선 두 줄 글자 그대로
        if (b[tb.headLine] !== a[ta.headLine] || (ta.sepLine == null ? tb.sepLine != null : b[tb.sepLine] !== a[ta.sepLine])) return false;
      } else if (b[tb.headLine] !== rowText(tb.head) || tb.sepLine !== tb.headLine + 1 || b[tb.sepLine] !== sepText(tb.head.length)) return false; // 새 표·넓힌 머리 = 정해진 모양
      const PA = parse(a), hitLines = new Set(PA.sleep.filter((r) => r.start != null && r.start < W.w1 && r.end > W.w0).map((r) => r.line));
      const dropLines = new Set(openRowsIn(PA, W).filter((x) => drop.includes(x.at)).map((x) => x.r.line));
      const rowsA = ta ? ta.rows : [], kept = rowsA.filter((r) => !hitLines.has(r.line) && !dropLines.has(r.line)).map((r) => a[r.line]);
      const removed = PA.sleep.filter((r) => hitLines.has(r.line));
      let k = 0; const added = [];
      tb.rows.forEach((r) => { if (k < kept.length && b[r.line] === kept[k]) k++; else added.push(cellsOf(b[r.line])); });
      if (k !== kept.length) return false;
      const addSegs = [];
      for (const c of added) {
        if (c.length !== tb.head.length || !isDate(c[0])) return false;
        if (c.length === SLEEP_HEAD_WIDE.length && !['', LIGHT].includes(c[4])) return false;
        if (len(c[3]) > MAX_LEN) return false;
        const s = segOf(c[0], c[1], c[2]); if (!s) return false;
        addSegs.push({ start: s.start, end: s.end, light: c[4] === LIGHT });
      }
      const outside = (list) => normalize(list.flatMap((s) => [s.start < W.w0 ? { start: s.start, end: Math.min(s.end, W.w0), light: s.light } : null, s.end > W.w1 ? { start: Math.max(s.start, W.w1), end: s.end, light: s.light } : null].filter(Boolean)))
        .map((s) => [s.start, s.end, s.light].join()).join('|');
      return outside(removed) === outside(addSegs);
    } catch (e) { return false; }
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
      const tb = tableOf(b, sb); if (!tb || !okHead(kind, tb.head)) return false;
      const okRow = (i) => tb.rows.some((r) => r.line === i) && cellsOf(b[i]).length === tb.head.length && cellsOf(b[i])[0] === date && !isSep(b[i]);
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

  const LL = { SECTIONS, OLD_HEADS, MOODS, MEALS, MULTI_MEAL, MAX_LEN, ymd, logDay, clean, text, isTime, parseTimes, parseTime, fmtTime, parse, dayOf, byDate, setSleep, addMeal, setNote, onlyLogChanged, upsert,
    // 잠 구간 (2026-10-08): 칠하기 화면이 부르는 것
    SLEEP_HEAD_WIDE, LIGHT, SLEEP_GRID_HOUR, toMin, fromMin, mainSleep, sleepDay, sleepWindow, sleepGrid, setSleepWindow, onlySleepWindowChanged };
  root.PHLifeLog = LL;
  if (typeof module !== 'undefined' && module.exports) module.exports = LL;
})(typeof window !== 'undefined' ? window : globalThis);
