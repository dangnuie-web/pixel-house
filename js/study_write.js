// 공부 간트 쓰기 (2026-10-03 비트 B, study 브랜치). 그림·파일 접근 없음: 글(text)을 받아 새 글을 돌려준다.
// Electron 메인(electron/study_ipc.js), 화면(js/study_gantt.js: 미리 보기·검사), Node 시험(tests/test_study.js)이 같이 쓴다.
// 바꾸는 곳은 셋뿐: ## 공부 표, ## 공부 보관 표(없으면 ## 공부 바로 뒤에 만듦), ## 습관 기록 표의 오늘 줄.
// 이름 바꾸기만 ## 습관 기록 지난 줄의 그 공부 항목 이름도 같이 바꿈 (2026-10-04 제작자 결정, js/record_rename.js).
// 원칙은 물컵·대화창과 같다: 그 줄만 바꾸거나 한 줄 더하거나 한 줄 옮김. 다른 줄은 한 글자도 안 바뀐다.
// 메인은 쓰기 직전에 onlyStudyChanged / onlyStudyLogChanged로 다시 확인한다.
(function (root) {
  'use strict';
  const Md = root.PHLifeMd || (typeof require !== 'undefined' ? require('./life_md.js') : null);
  const RR = () => root.PHRecordRename || (typeof require !== 'undefined' ? require('./record_rename.js') : null); // 이름 바꾸기 때 지난 기록 이름도 (2026-10-04)

  const STUDY = '공부';
  const ARCHIVE = '공부 보관';
  const RECORDS = '습관 기록';
  const HEAD = ['공부', '시작', '끝', '메모'];
  const ARCHIVE_HEAD = ['공부', '시작', '끝', '메모', '보관한 날'];
  const NAME_MAX = 30, MEMO_MAX = 100, HOURS_MAX = 24;
  const UNIT = '시간'; // 습관 기록에 "깃허브 1시간"

  const pad = (n) => String(n).padStart(2, '0');
  function ymd(d) { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; }
  // 기록 날짜: 하루의 경계 = startHour시 (settings.DAY_START_HOUR, 기본 6). 01~06시는 전날. life_log.js logDay와 같은 식
  function logDay(ms, startHour) { const h = Number.isFinite(startHour) ? startHour : 6; return ymd(ms - h * 3600000); }
  // 'YYYY-MM-DD'이면서 실제로 있는 날짜 (2026-02-30 같은 것은 거름)
  function isDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number), x = new Date(y, m - 1, d);
    return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d;
  }
  // 날짜 더하기 (하루 단위, 기기 시간대. 서머타임에도 안전하게 정오 기준)
  function addDays(s, n) { const [y, m, d] = s.split('-').map(Number); return ymd(new Date(y, m - 1, d + n, 12)); }
  function diffDays(a, b) { const t = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((t(b) - t(a)) / 86400000); }

  // ---- 값 다듬기·검사 ----
  // 메모: 표를 깨는 글자만 바꿈 (| -> ｜, 줄바꿈·제어 문자 -> 띄어쓰기)
  function clean(s) { return String(s == null ? '' : s).replace(/\|/g, '｜').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  const len = (s) => Array.from(s).length;
  // 이름: 습관 기록 칸에 "이름 1시간"으로 들어가므로 쉼표·빗금도 막음. 바꾸지 않고 오류 (이름이 몰래 바뀌면 안 되니까)
  const NAME_BAD = /[|,，/\\`*#\[\]<>]/;
  function checkName(s) {
    if (typeof s !== 'string') throw new Error('이름 형식 오류');
    const t = s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) throw new Error('이름이 비었음');
    if (NAME_BAD.test(t)) throw new Error('이름에 쓸 수 없는 글자 (| , / \\ ` * # [ ] < >)');
    if (/^\d/.test(t)) throw new Error('이름은 숫자로 시작할 수 없음');
    if (len(t) > NAME_MAX) throw new Error('이름이 너무 김 (' + NAME_MAX + '자까지)');
    return t;
  }
  function checkMemo(s) {
    if (s != null && typeof s !== 'string') throw new Error('메모 형식 오류');
    const t = clean(s); if (len(t) > MEMO_MAX) throw new Error('메모가 너무 김 (' + MEMO_MAX + '자까지)');
    return t;
  }
  // 한 줄이 올바른지: 시작 = 날짜, 끝 = 비었거나 시작 이후 날짜
  function validDates(start, end) { return isDate(start) && (end === '' || (isDate(end) && end >= start)); }

  // ---- 읽기 ----
  const cellsOf = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const isRow = (l) => /^\s*\|/.test(l);
  const isSep = (l) => /^\s*\|?\s*:?-{3,}/.test(l);
  const rowText = (cells) => '| ' + cells.join(' | ') + ' |';
  const sepText = (n) => '|' + Array(n).fill('---').join('|') + '|';
  function splitLines(src) { return String(src).split(/\r?\n/); }
  function findSection(lines, name) {
    const all = Md.sections(lines).filter((s) => s.name === name);
    if (all.length > 1) throw new Error('같은 섹션이 둘: ## ' + name);
    return all[0] || null;
  }
  // 섹션 안 첫 표: { headLine, head, sepLine, rows: [{ line, cells }], endLine(표 다음 줄) } 또는 null
  function tableOf(lines, sec) {
    if (!sec) return null;
    const t = Md.table(lines, sec); if (!t) return null;
    let sep = t.line + 1; if (!(sep < sec.end && isSep(lines[sep]))) sep = null;
    let end = (sep == null ? t.line : sep) + 1;
    while (end < sec.end && isRow(lines[end])) end++;
    return { headLine: t.line, head: t.head, sepLine: sep, rows: t.rows.map((r) => ({ line: r.line, cells: r.raw })), endLine: end };
  }
  const obj = (c) => ({ name: c[0] || '', start: c[1] || '', end: c[2] || '', memo: c[3] || '', archived: c[4] || '' });
  // 글 -> { study: [{ line, name, start, end, memo }], archive: [... archived] }
  function parse(src) {
    const lines = Array.isArray(src) ? src : splitLines(src);
    const t = tableOf(lines, findSection(lines, STUDY)), a = tableOf(lines, findSection(lines, ARCHIVE));
    return { study: t ? t.rows.map((r) => Object.assign({ line: r.line }, obj(r.cells))) : [], archive: a ? a.rows.map((r) => Object.assign({ line: r.line }, obj(r.cells))) : [] };
  }
  // 습관 기록에서 공부 시간: { 'YYYY-MM-DD': 시간 } (그 공부 이름 항목만, 0보다 클 때)
  function loggedDays(records, name) {
    const out = {};
    (records || []).forEach((r) => (r.items || []).forEach((it) => {
      if (it.name === name && it.value > 0 && (!it.unit || it.unit === UNIT)) { const d = Md.dateOf(r.date); if (d != null) { const k = ymd(d); out[k] = (out[k] || 0) + it.value; } }
    }));
    return out;
  }

  // ---- 쓰기: ## 공부 / ## 공부 보관 ----
  function studyTable(lines) {
    const sec = findSection(lines, STUDY); if (!sec) throw new Error('## 공부 섹션 없음');
    const t = tableOf(lines, sec); if (!t) throw new Error('## 공부 표 없음');
    if (t.head.join('|') !== HEAD.join('|')) throw new Error('## 공부 표 머리가 달라서 멈춤');
    return { sec, t };
  }
  function findRow(t, name, what) {
    const hits = t.rows.filter((r) => r.cells[0] === name);
    if (!hits.length) throw new Error((what || '공부') + ' 없음: ' + name);
    if (hits.length > 1) throw new Error('같은 이름이 둘이라 멈춤: ' + name);
    return hits[0];
  }
  // 생활습관 습관 이름과 같으면 기록이 헷갈림 (예: 독서)
  function habitNames(src) { try { const d = Md.parse(src); return d.habits ? d.habits.rows.map((r) => r.name) : []; } catch (e) { return []; } }
  function nameFree(src, lines, t, name, except) {
    if (t.rows.some((r) => r.cells[0] === name && r.cells[0] !== except)) throw new Error('같은 이름의 공부가 이미 있음: ' + name);
    if (habitNames(src).includes(name)) throw new Error('생활습관 이름과 같아서 안 됨: ' + name);
  }
  const out = (src, lines, extra) => Object.assign({ text: lines.join(/\r\n/.test(src) ? '\r\n' : '\n'), changed: true }, extra);

  // 더하기: 표 끝에 | 이름 | 시작 | (빈칸) | 메모 |
  function addStudy(src, o) {
    o = o || {};
    const lines = splitLines(src), { t } = studyTable(lines);
    const name = checkName(o.name), memo = checkMemo(o.memo), start = o.start;
    if (!isDate(start)) throw new Error('시작 날짜 오류 (YYYY-MM-DD)');
    const end = o.end == null ? '' : o.end;
    if (end !== '' && !validDates(start, end)) throw new Error('끝 날짜 오류');
    nameFree(src, lines, t, name);
    // 지난 기록에만 남은 이름으로 새로 더하기도 막음 (제작자 결정 2026-10-04, 습관과 같은 규칙)
    if (RR() && RR().usedInRecords(src, name)) throw RR().usedErr(src, name, 'study');
    const row = rowText([name, start, end, memo]);
    lines.splice(t.endLine, 0, row);
    return out(src, lines, { op: 'add', line: t.endLine, name, after: row });
  }
  // 고치기: patch = { start, end, memo, newName } (없는 값 = 그대로, end '' = 진행 중으로)
  function updateStudy(src, name, patch) {
    const p = patch || {};
    const lines = splitLines(src), { t } = studyTable(lines), row = findRow(t, name);
    const c = row.cells.slice(0, 4); while (c.length < 4) c.push('');
    const next = c.slice();
    if (p.newName != null) { next[0] = checkName(p.newName); if (next[0] !== c[0]) nameFree(src, lines, t, next[0], c[0]); }
    if (p.start != null) { if (!isDate(p.start)) throw new Error('시작 날짜 오류 (YYYY-MM-DD)'); next[1] = p.start; }
    if (p.end != null) { if (p.end !== '' && !isDate(p.end)) throw new Error('끝 날짜 오류 (YYYY-MM-DD)'); next[2] = p.end; }
    if (p.memo != null) next[3] = checkMemo(p.memo);
    if (!validDates(next[1], next[2])) throw new Error('날짜 순서 오류 (시작 <= 끝)');
    const after = rowText(next);
    if (next.join('|') === c.join('|') && row.cells.length === 4) return { text: src, changed: false, op: 'update', line: row.line, name: next[0] };
    const renamed = next[0] !== c[0];
    // 지난 기록에만 남은 이름(지운 공부·습관의 옛 기록)으로는 안 바꿈: 섞이면 되돌릴 수 없어서
    if (renamed && RR().usedInRecords(src, next[0])) throw RR().usedErr(src, next[0], 'study');
    const before = lines[row.line]; lines[row.line] = after;
    // 1단계 = ## 공부 표 한 줄(mid), 2단계 = ## 습관 기록의 "옛 이름 n시간" -> "새 이름 n시간" (2026-10-04 제작자 결정). 메인이 단계마다 따로 검사
    const mid = out(src, lines, {}).text, rn = renamed ? RR().renameInRecords(mid, c[0], next[0]) : { text: mid, records: 0, items: 0 };
    return { text: rn.text, changed: true, mid, op: 'update', line: row.line, name: next[0], oldName: c[0], prev: obj(c), before, after, renamedRecords: { records: rn.records, items: rn.items } };
  }
  // 보관: ## 공부에서 그 줄을 빼고 ## 공부 보관 표 끝에 (보관한 날 = date). 보관 섹션이 없으면 ## 공부 바로 뒤에 만듦
  function archiveStudy(src, name, o) {
    const date = o && o.date; if (!isDate(date)) throw new Error('날짜 오류');
    const lines = splitLines(src), { sec, t } = studyTable(lines), row = findRow(t, name);
    const c = row.cells.slice(0, 4); while (c.length < 4) c.push('');
    const moved = rowText(c.concat([date])), before = lines[row.line];
    lines.splice(row.line, 1);
    const aSec = findSection(lines, ARCHIVE), at = tableOf(lines, aSec);
    let line, created = false;
    if (aSec && at) {
      if (at.head.join('|') !== ARCHIVE_HEAD.join('|')) throw new Error('## 공부 보관 표 머리가 달라서 멈춤');
      line = at.endLine; lines.splice(line, 0, moved);
    } else if (aSec) { // 섹션은 있는데 표가 없음: 섹션 글 끝에 머리·구분선·줄
      let p = aSec.end; while (p > aSec.start && lines[p - 1].trim() === '') p--;
      lines.splice(p, 0, rowText(ARCHIVE_HEAD), sepText(ARCHIVE_HEAD.length), moved); line = p + 2;
    } else { // ## 공부 섹션 바로 뒤 (그 끝 빈 줄 다음)
      const s2 = findSection(lines, STUDY);
      let p = s2.end; const atEnd = p === lines.length;
      let q = p; while (q > s2.start && lines[q - 1].trim() === '') q--;
      const block = ['## ' + ARCHIVE, rowText(ARCHIVE_HEAD), sepText(ARCHIVE_HEAD.length), moved];
      if (atEnd) { lines.splice(q, 0, '', ...block); line = q + 4; }
      else { if (q === p) { block.unshift(''); } block.push(''); lines.splice(p, 0, ...block); line = p + block.indexOf(moved); }
      created = true;
    }
    return out(src, lines, { op: 'archive', name, from: row.line, line, created, before, after: moved });
  }
  // 되돌리기: ## 공부 보관에서 그 이름의 마지막 줄을 빼고 ## 공부 표 끝에 (보관한 날 칸은 버림)
  function restoreStudy(src, name) {
    const lines = splitLines(src);
    const aSec = findSection(lines, ARCHIVE), at = tableOf(lines, aSec); if (!at) throw new Error('## 공부 보관 표 없음');
    const hits = at.rows.filter((r) => r.cells[0] === name); if (!hits.length) throw new Error('보관한 공부 없음: ' + name);
    const row = hits[hits.length - 1];
    const { t } = studyTable(lines);
    nameFree(src, lines, t, name);
    const c = row.cells.slice(0, 4); while (c.length < 4) c.push('');
    const before = lines[row.line], back = rowText(c);
    lines.splice(row.line, 1);
    const t2 = studyTable(lines).t;
    lines.splice(t2.endLine, 0, back);
    return out(src, lines, { op: 'restore', name, from: row.line, line: t2.endLine, before, after: back });
  }

  // ---- 쓰기: ## 습관 기록 오늘 줄 "이름 n시간" ----
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function itemRe(name) { return new RegExp('(^|[,，]\\s*)' + reEsc(name) + '\\s+(\\d+(?:\\.\\d+)?)\\s*' + UNIT + '(?=\\s*(?:[,，]|$))'); }
  function hoursIn(cell, name) { const m = itemRe(name).exec(cell || ''); return m ? Number(m[2]) : 0; }
  // 한 칸 글에서 그 공부 항목만 바꿈. 0시간 = 항목을 뺌 (앞뒤 쉼표 정리)
  function setHoursInCell(cell, name, hours) {
    const re = itemRe(name), core = String(cell || '').trim();
    if (re.test(core)) {
      if (hours > 0) return core.replace(re, (m, pre) => `${pre}${name} ${hours}${UNIT}`);
      return core.replace(re, '').replace(/^\s*[,，]\s*/, '').replace(/\s*[,，]\s*$/, '').trim();
    }
    if (hours <= 0) return core;
    return core ? `${core}, ${name} ${hours}${UNIT}` : `${name} ${hours}${UNIT}`;
  }
  function recordsTable(lines) {
    const sec = findSection(lines, RECORDS); if (!sec) throw new Error('## 습관 기록 섹션 없음');
    const t = tableOf(lines, sec); if (!t) throw new Error('## 습관 기록 표 없음');
    if (t.head[0] !== '날짜' || t.head[1] !== '한 습관' || t.head.length !== 2) throw new Error('## 습관 기록 표 머리가 달라서 멈춤');
    return t;
  }
  function recOrder(rows) { const ds = rows.map((r) => Md.dateOf(r.cells[0])).filter((d) => d != null); return ds.length >= 2 && ds[0] > ds[ds.length - 1] ? 'desc' : 'asc'; }
  // 오늘 그 공부를 add시간 더함 (add = 1 또는 -1). 이름은 ## 공부 표에 있어야 함. 결과 0~24시간
  function logStudyToday(src, name, o) {
    const date = o && o.date, add = o && o.add;
    if (!isDate(date)) throw new Error('날짜 오류');
    if (add !== 1 && add !== -1) throw new Error('시간 오류 (1 또는 -1)');
    const lines = splitLines(src);
    findRow(studyTable(lines).t, name); // 표에 있는 공부만
    const t = recordsTable(lines);
    const hits = t.rows.filter((r) => r.cells[0] === date);
    const hit = hits.length ? (recOrder(t.rows) === 'desc' ? hits[0] : hits[hits.length - 1]) : null;
    const cur = hit ? hoursIn(hit.cells[1], name) : 0;
    const hours = Math.max(0, Math.min(HOURS_MAX, cur + add));
    if (hours === cur) return { text: src, changed: false, op: 'log', name, hours, date };
    if (hit) {
      const m = /^(\s*\|[^|]*\|)([^|]*)(\|.*)$/.exec(lines[hit.line]); if (!m) throw new Error('줄 모양 오류');
      const before = lines[hit.line]; lines[hit.line] = m[1] + ' ' + setHoursInCell(m[2], name, hours) + ' ' + m[3];
      return out(src, lines, { op: 'log', name, hours, date, line: hit.line, inserted: false, before, after: lines[hit.line] });
    }
    const row = rowText([date, `${name} ${hours}${UNIT}`]);
    const at = recOrder(t.rows) === 'desc' ? (t.sepLine != null ? t.sepLine + 1 : t.headLine + 1) : t.endLine;
    lines.splice(at, 0, row);
    return out(src, lines, { op: 'log', name, hours, date, line: at, inserted: true, before: null, after: row });
  }

  // ---- 안전 검사 (메인이 쓰기 직전에) ----
  // 공부·공부 보관 섹션 밖은 한 글자도 같아야 함. 섹션 안 글 줄(기준 등)도 그대로. 데이터 줄은 op에 맞게 하나만 빠지고/더해짐
  function onlyStudyChanged(oldText, newText, op) {
    try {
      const a = splitLines(oldText), b = splitLines(newText);
      const pick = (L) => {
        const s = findSection(L, STUDY), x = findSection(L, ARCHIVE); if (!s) return null;
        const secs = [s, x].filter(Boolean).sort((p, q) => q.line - p.line);
        let rest = L.slice(); secs.forEach((z) => { rest = rest.slice(0, z.line).concat(rest.slice(z.end)); });
        const body = (z) => (z ? L.slice(z.line, z.end) : []);
        const t = tableOf(L, s), at = tableOf(L, x);
        return { s, x, rest, prose: (z, tt) => body(z).filter((l, i) => !(tt && z.line + i >= tt.headLine && z.line + i < tt.endLine)), t, at,
          rows: t ? t.rows.map((r) => lines(L, r)) : [], arows: at ? at.rows.map((r) => lines(L, r)) : [] };
      };
      const lines = (L, r) => L[r.line];
      const A = pick(a), B = pick(b); if (!A || !B || !B.t) return false;
      // 섹션 밖 그대로 (보관 섹션을 새로 만들 때 생긴 빈 줄 하나는 섹션 안으로 들어가므로 rest에 안 남음)
      const restB = B.rest.slice(), restA = A.rest.slice();
      if (restA.join('\n') !== restB.join('\n')) {
        // 파일 끝에 붙일 때 앞에 띄운 빈 줄 하나: ## 공부 섹션 안 끝 빈 줄로 들어감
        return false;
      }
      // 섹션 안 글 줄 (표 밖) 그대로. 공부 섹션은 끝 빈 줄 하나 차이까지 허용 (보관 섹션 앞 띄움)
      const trimEnd = (arr) => { const c = arr.slice(); while (c.length && c[c.length - 1].trim() === '') c.pop(); return c; };
      if (trimEnd(A.prose(A.s, A.t)).join('\n') !== trimEnd(B.prose(B.s, B.t)).join('\n')) return false;
      if (A.x && trimEnd(A.prose(A.x, A.at)).join('\n') !== trimEnd(B.prose(B.x, B.at)).join('\n')) return false;
      if (!A.x && B.x && trimEnd(B.prose(B.x, B.at)).join('\n') !== '## ' + ARCHIVE) return false;
      if (B.t.head.join('|') !== HEAD.join('|')) return false;
      if (B.at && B.at.head.join('|') !== ARCHIVE_HEAD.join('|')) return false;
      if (A.t && B.t.sepLine == null) return false;
      // 데이터 줄 비교 (여러 개 담는 묶음)
      const diff = (xs, ys) => { const m = new Map(); xs.forEach((v) => m.set(v, (m.get(v) || 0) + 1)); const extra = []; ys.forEach((v) => { if (m.get(v)) m.set(v, m.get(v) - 1); else extra.push(v); }); return extra; };
      const goneS = diff(B.rows, A.rows), newS = diff(A.rows, B.rows), goneA = diff(B.arows, A.arows), newA = diff(A.arows, B.arows);
      const okStudy = (l) => { const c = cellsOf(l); return c.length === 4 && !!c[0] && validDates(c[1], c[2]); };
      const sig = (l) => cellsOf(l).slice(0, 4).join('|');
      const want = { add: [0, 1, 0, 0], update: [1, 1, 0, 0], archive: [1, 0, 0, 1], restore: [0, 1, 1, 0] }[op];
      if (!want) return false;
      if (goneS.length !== want[0] || newS.length !== want[1] || goneA.length !== want[2] || newA.length !== want[3]) return false;
      const dup = (rows) => { const n = rows.map((l) => cellsOf(l)[0]); return new Set(n).size !== n.length; };
      if (dup(B.rows) && !dup(A.rows)) return false; // 이름이 겹치게 되면 멈춤 (원래 겹쳐 있던 파일은 그대로 둠)
      if (op === 'add') return okStudy(newS[0]);
      if (op === 'update') { // 같은 자리에서 바뀜 (줄 번호 같음)
        const ia = A.rows.indexOf(goneS[0]), ib = B.rows.indexOf(newS[0]);
        return ia === ib && okStudy(newS[0]);
      }
      if (op === 'archive') { const c = cellsOf(newA[0]); return c.length === 5 && isDate(c[4]) && sig(newA[0]) === (() => { const g = cellsOf(goneS[0]).slice(0, 4); while (g.length < 4) g.push(''); return g.join('|'); })(); }
      if (op === 'restore') { const c = cellsOf(newS[0]); return c.length === 4 && sig(newS[0]) === cellsOf(goneA[0]).slice(0, 4).join('|'); }
      return false;
    } catch (e) { return false; }
  }
  // 습관 기록: 오늘(date) 줄 하나만 바뀌거나(날짜 칸 그대로) 오늘 줄 하나 더해짐. 다른 줄은 그대로
  function onlyStudyLogChanged(oldText, newText, date) {
    try {
      const a = splitLines(oldText), b = splitLines(newText), t = recordsTable(a);
      const okRow = (l) => { const c = cellsOf(l); return isRow(l) && !isSep(l) && c.length === 2 && c[0] === date; };
      if (a.length === b.length) {
        const d = a.map((x, i) => (x === b[i] ? -1 : i)).filter((i) => i >= 0);
        if (d.length !== 1) return d.length === 0;
        return t.rows.some((r) => r.line === d[0]) && cellsOf(a[d[0]])[0] === date && okRow(b[d[0]]);
      }
      if (b.length !== a.length + 1) return false;
      let i = 0; while (i < a.length && a[i] === b[i]) i++;
      if (a.slice(i).join('\n') !== b.slice(i + 1).join('\n')) return false;
      const lo = t.sepLine != null ? t.sepLine + 1 : t.headLine + 1;
      return i >= lo && i <= t.endLine && okRow(b[i]);
    } catch (e) { return false; }
  }

  const SW = { STUDY, ARCHIVE, HEAD, ARCHIVE_HEAD, NAME_MAX, MEMO_MAX, HOURS_MAX, UNIT, ymd, logDay, isDate, addDays, diffDays, clean, checkName, checkMemo, validDates,
    parse, loggedDays, hoursIn, setHoursInCell, addStudy, updateStudy, archiveStudy, restoreStudy, logStudyToday, onlyStudyChanged, onlyStudyLogChanged };
  root.PHStudyWrite = SW;
  if (typeof module !== 'undefined' && module.exports) module.exports = SW;
})(typeof window !== 'undefined' ? window : globalThis);
