// 영화·연극·새 기록 항목 (2026-10-08 비트, 로드맵 3단계 "기록 폼"). 그림·파일 접근 없음. 메인(electron/record_ipc.js)·화면(js/record_list.js)·Node 시험이 같이 쓴다.
// 생활 기록 파일에 새 섹션 두 개 (기존 파서 js/life_md.js는 모르는 섹션을 건너뛰므로 안 깨짐):
//   ## 기록        | 항목 | 날짜 | 제목 | 요약 |   한 줄 = 본 것 하나. 항목 = 영화·연극·(사용자가 만든 항목 이름)
//   ## 기록 항목   | 항목 | 만든 날 |              기록 칸 목록. 생활 습관 > 기록 편집에서 더하고 지움
//   영화·연극 (2026-10-08 제작자 피드백 4: "기본이 아니야, 지울 수 있어야"): 다른 칸과 같이 지울 수 있음.
//     ## 기록 항목 섹션이 아직 없는 파일(이 기능 전 파일·공용판 새 파일)만 영화 한 칸이 있는 것으로 봄 (virtual. 2026-10-08 제작자: 공용판 기본은 영화만).
//     그 파일에서 처음 칸을 더하거나 지울 때 섹션을 만들며 영화를 실제 줄로 적음 (op 'seed'). 섹션이 생긴 뒤에는 적힌 줄만 칸
//   새로 만들 자리: ## 버킷리스트 바로 앞 (없으면 파일 끝). 독서(## 독서)와 같은 규칙
// 기록 항목을 지워도 ## 기록 줄은 남음 (같은 이름을 다시 만들면 다시 보임)
(function (root) {
  'use strict';
  const TS = root.PHTableSection || (typeof require !== 'undefined' ? require('./table_section.js') : null);

  const RECORD = { name: '기록', head: ['항목', '날짜', '제목', '요약'], before: ['버킷리스트'] };
  const KIND = { name: '기록 항목', head: ['항목', '만든 날'], before: ['기록', '버킷리스트'] };
  const DEFAULT_KINDS = [{ id: 'movie', name: '영화' }]; // 섹션 없는 파일에서만 보이는 처음 칸 (잠금 없음). 2026-10-08 제작자: 공용판 기본은 영화만
  const KNOWN_IDS = { 영화: 'movie', 연극: 'play' }; // 예전부터 있던 칸 id (연극은 기본에서 빠졌어도 적힌 파일에서는 그대로)
  const MOVIE_KINDS = ['영화', '연극']; // 생활일지 "영화·연극" 탭이 묶어 보이는 칸 이름
  const TV_KINDS = ['영화']; // TV(features.js record)가 여는 칸. 2026-10-08 제작자: 한 가구에 한 기능 -> 연극은 다른 기록 칸처럼 따로 연동 (rk:연극)
  const TITLE_MAX = 60, SUMMARY_MAX = 2000, KIND_MAX = 12;
  // 기존 생활일지 탭·습관 이름과 겹치면 헷갈려서 막는 이름
  const RESERVED = ['독서', '물', '대변', '식사', '모아 보기', '공부', '약속', '버킷리스트'];

  const len = (s) => Array.from(String(s)).length;
  function isDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number), x = new Date(y, m - 1, d);
    return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d;
  }
  const bad = (code, msg) => TS.err(code, msg);
  function checkTitle(s) {
    if (typeof s !== 'string') throw bad('badTitle', '제목 형식 오류');
    const t = s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) throw bad('badTitle', '제목이 비었음');
    if (len(t) > TITLE_MAX) throw bad('badTitle', '제목이 너무 김');
    return t;
  }
  function checkSummary(s) {
    if (s != null && typeof s !== 'string') throw bad('badText', '요약 형식 오류');
    const t = String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u2028\u2029]/g, '').trim();
    if (len(t) > SUMMARY_MAX) throw bad('badText', '요약이 너무 김');
    return t;
  }
  function checkDate(s) { if (!isDate(s)) throw bad('badDate', '날짜 오류'); return s; }
  // 항목 이름: 글자(한글·영문)와 띄어쓰기만, 1~12자 (부기 kindBad "기호나 숫자를 빼고")
  function cleanKind(s) {
    if (typeof s !== 'string') throw bad('kindBad', '이름 형식 오류');
    const t = s.replace(/\s+/g, ' ').trim();
    if (!t || len(t) > KIND_MAX || !/^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z ]+$/.test(t)) throw bad('kindBad', '이름 오류');
    return t;
  }

  // ---- 읽기 ----
  // -> { records: [{ kind, date, title, summary, sig, line, i }], kinds: [{ name, id, custom, virtual, sig, made }], seeded, error }
  //   custom = 영화·연극이 아닌 칸 (생활일지에서 따로 탭). virtual = 섹션이 없어 화면에만 있는 영화·연극 (지우기·더하기 때 실제 줄로 적힘)
  const idOf = (n) => KNOWN_IDS[n] || 'k:' + n;
  function parse(src) {
    const R = TS.read(src, RECORD), K = TS.read(src, KIND);
    const kinds = K.has ? [] : DEFAULT_KINDS.map((k) => ({ name: k.name, id: k.id, custom: false, virtual: true }));
    K.rows.forEach((r) => { const n = r.cells['항목'].trim(); if (n && !kinds.some((k) => k.name === n)) kinds.push({ name: n, id: idOf(n), custom: !MOVIE_KINDS.includes(n), sig: r.raw, made: r.cells['만든 날'] }); });
    const records = R.rows.map((r, i) => ({ kind: r.cells['항목'].trim(), date: r.cells['날짜'].trim(), title: r.cells['제목'], summary: r.cells['요약'], sig: r.raw, line: r.line, i }));
    return { records, kinds, seeded: !!K.has, error: R.error || K.error || null };
  }
  // 한 항목의 기록: 최신 날짜 먼저, 같은 날은 나중에 적은 것 먼저. 날짜 못 읽은 줄은 맨 뒤
  function listOf(P, kind) {
    return P.records.filter((r) => r.kind === kind).sort((a, b) => (isDate(b.date) ? b.date : '') .localeCompare(isDate(a.date) ? a.date : '') || b.i - a.i);
  }
  // 달마다 묶기: [{ month: '2026-10', items }]
  function byMonth(list) {
    const m = new Map();
    list.forEach((r) => { const k = isDate(r.date) ? r.date.slice(0, 7) : '?'; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    return [...m.entries()].map(([month, items]) => ({ month, items }));
  }
  const kindNames = (src) => parse(src).kinds.map((k) => k.name);

  // ---- 쓰기 ----
  function cellsOf(r) { return [TS.encode(r.kind), r.date, TS.encode(r.title), TS.encode(r.summary)]; }
  function cleanRecord(src, o) {
    o = o || {};
    const kind = String(o.kind || '').trim();
    if (!kindNames(src).includes(kind)) throw bad('badKind', '모르는 기록 항목: ' + kind);
    return { kind, date: checkDate(o.date), title: checkTitle(o.title), summary: checkSummary(o.summary) };
  }
  function addRecord(src, o, opt) {
    if (opt && opt.raw != null) { // 지우기 되돌리기: 원래 글자 그대로 (칸 검사는 안전 검사에서)
      return Object.assign(TS.addRow(src, RECORD, null, { before: opt.before, raw: opt.raw }), {});
    }
    const r = cleanRecord(src, o);
    return Object.assign(TS.addRow(src, RECORD, cellsOf(r)), { record: r });
  }
  function updateRecord(src, sig, o, opt) {
    if (opt && opt.raw != null) return TS.updateRow(src, RECORD, sig, null, { raw: opt.raw });
    const r = cleanRecord(src, o);
    return Object.assign(TS.updateRow(src, RECORD, sig, cellsOf(r)), { record: r });
  }
  function removeRecord(src, sig) { return TS.removeRow(src, RECORD, sig); }
  // 섹션이 없는 파일: 섹션을 만들며 화면에만 있던 칸(영화·연극) 중 keep 을 실제 줄로 적고, 끝에 extra(새 칸) 한 줄. op 'seed'
  function seed(src, keep, extra, date) {
    let text = src, row = null;
    keep.concat(extra ? [extra] : []).forEach((n) => { const r = TS.addRow(text, KIND, [TS.encode(n), date]); text = r.text; row = r.after; });
    if (!row) { const r = TS.addRow(text, KIND, [TS.encode(DEFAULT_KINDS[0].name), date]); text = TS.removeRow(r.text, KIND, r.after).text; } // 남는 칸 0개 (기본 영화 한 칸을 지움): 머리만 있는 빈 섹션 = 다시 virtual 안 됨
    return { text, changed: text !== src, op: 'seed', created: true, after: row };
  }
  function addKind(src, name, date, opt) {
    if (opt && opt.raw != null) return TS.addRow(src, KIND, null, { before: opt.before, raw: opt.raw });
    const n = cleanKind(name);
    if (RESERVED.includes(n)) throw bad('kindBad', '쓸 수 없는 이름');
    const P = parse(src);
    if (P.kinds.some((k) => k.name === n)) throw bad('kindDup', '같은 이름이 있음');
    if (!P.seeded) return Object.assign(seed(src, P.kinds.map((k) => k.name), n, checkDate(date)), { kind: n });
    return Object.assign(TS.addRow(src, KIND, [TS.encode(n), checkDate(date)]), { kind: n });
  }
  // 칸 지우기: ## 기록 항목 줄만 빠짐 (## 기록 줄은 남음). 화면에만 있던 칸(섹션 없음)이면 섹션을 만들며 나머지만 적음 (date = 만든 날)
  //   before = 지운 줄 글, next = 뒤 줄 글 -> 되돌리기 addKind(null, null, { before: next, raw: before })
  function removeKind(src, name, date) {
    const P = parse(src), k = P.kinds.find((x) => x.name === name);
    if (!k) throw bad('notFound', '기록 항목 없음');
    if (k.virtual) {
      const d = checkDate(date), rest = P.kinds.filter((x) => x.name !== name).map((x) => x.name), i = P.kinds.indexOf(k);
      const r = seed(src, rest, null, d), row = (n) => TS.rowText([TS.encode(n), d]);
      return Object.assign(r, { kind: name, before: row(name), next: P.kinds[i + 1] ? row(P.kinds[i + 1].name) : null });
    }
    return Object.assign(TS.removeRow(src, KIND, k.sig), { kind: name });
  }

  // ---- 안전 검사 ----
  const okRecord = (c) => !!c[0].trim() && isDate(c[1]) && !!c[2].trim() && !/\n/.test(c[2]) && len(c[2]) <= TITLE_MAX && len(c[3]) <= SUMMARY_MAX;
  const okKind = (c) => { try { return cleanKind(c[0]) === c[0] && isDate(c[1]); } catch (e) { return false; } };
  function onlyRecordChanged(oldText, newText, op) { return TS.onlyRowsChanged(oldText, newText, RECORD, op, okRecord); }
  function onlyKindChanged(oldText, newText, op) { return TS.onlyRowsChanged(oldText, newText, KIND, op, okKind); } // op 'seed' = 섹션 새로 + 줄 여러 개 (js/table_section.js)

  const RW = { RECORD, KIND, DEFAULT_KINDS, MOVIE_KINDS, TV_KINDS, TITLE_MAX, SUMMARY_MAX, KIND_MAX, RESERVED, isDate, checkTitle, checkSummary, cleanKind, parse, listOf, byMonth,
    addRecord, updateRecord, removeRecord, addKind, removeKind, onlyRecordChanged, onlyKindChanged };
  root.PHRecordWrite = RW;
  if (typeof module !== 'undefined' && module.exports) module.exports = RW;
})(typeof window !== 'undefined' ? window : globalThis);
