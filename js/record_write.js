// 영화·연극·새 기록 항목 (2026-10-08 비트, 로드맵 3단계 "기록 폼"). 그림·파일 접근 없음. 메인(electron/record_ipc.js)·화면(js/record_list.js)·Node 시험이 같이 쓴다.
// 생활 기록 파일에 새 섹션 두 개 (기존 파서 js/life_md.js는 모르는 섹션을 건너뛰므로 안 깨짐):
//   ## 기록        | 항목 | 날짜 | 제목 | 요약 |   한 줄 = 본 것 하나. 항목 = 영화·연극·(사용자가 만든 항목 이름)
//   ## 기록 항목   | 항목 | 만든 날 |              생활습관에서 "기록 항목 추가"로 만든 것 (영화·연극은 기본이라 적지 않음)
//   새로 만들 자리: ## 버킷리스트 바로 앞 (없으면 파일 끝). 독서(## 독서)와 같은 규칙
// 기록 항목을 지워도 ## 기록 줄은 남음 (같은 이름을 다시 만들면 다시 보임)
(function (root) {
  'use strict';
  const TS = root.PHTableSection || (typeof require !== 'undefined' ? require('./table_section.js') : null);

  const RECORD = { name: '기록', head: ['항목', '날짜', '제목', '요약'], before: ['버킷리스트'] };
  const KIND = { name: '기록 항목', head: ['항목', '만든 날'], before: ['기록', '버킷리스트'] };
  const DEFAULT_KINDS = [{ id: 'movie', name: '영화' }, { id: 'play', name: '연극' }];
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
  // -> { records: [{ kind, date, title, summary, sig, line, i }], kinds: [{ name, id, custom, sig, made }], error }
  function parse(src) {
    const R = TS.read(src, RECORD), K = TS.read(src, KIND);
    const kinds = DEFAULT_KINDS.map((k) => ({ name: k.name, id: k.id, custom: false }));
    K.rows.forEach((r) => { const n = r.cells['항목'].trim(); if (n && !kinds.some((k) => k.name === n)) kinds.push({ name: n, id: 'k:' + n, custom: true, sig: r.raw, made: r.cells['만든 날'] }); });
    const records = R.rows.map((r, i) => ({ kind: r.cells['항목'].trim(), date: r.cells['날짜'].trim(), title: r.cells['제목'], summary: r.cells['요약'], sig: r.raw, line: r.line, i }));
    return { records, kinds, error: R.error || K.error || null };
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
  function addKind(src, name, date, opt) {
    if (opt && opt.raw != null) return TS.addRow(src, KIND, null, { before: opt.before, raw: opt.raw });
    const n = cleanKind(name);
    if (RESERVED.includes(n)) throw bad('kindBad', '쓸 수 없는 이름');
    if (kindNames(src).includes(n)) throw bad('kindDup', '같은 이름이 있음');
    return Object.assign(TS.addRow(src, KIND, [TS.encode(n), checkDate(date)]), { kind: n });
  }
  function removeKind(src, name) {
    const k = parse(src).kinds.find((x) => x.name === name && x.custom);
    if (!k) throw bad('notFound', '기록 항목 없음');
    return Object.assign(TS.removeRow(src, KIND, k.sig), { kind: name });
  }

  // ---- 안전 검사 ----
  const okRecord = (c) => !!c[0].trim() && isDate(c[1]) && !!c[2].trim() && !/\n/.test(c[2]) && len(c[2]) <= TITLE_MAX && len(c[3]) <= SUMMARY_MAX;
  const okKind = (c) => { try { return cleanKind(c[0]) === c[0] && isDate(c[1]); } catch (e) { return false; } };
  function onlyRecordChanged(oldText, newText, op) { return TS.onlyRowsChanged(oldText, newText, RECORD, op, okRecord); }
  function onlyKindChanged(oldText, newText, op) { return TS.onlyRowsChanged(oldText, newText, KIND, op, okKind); }

  const RW = { RECORD, KIND, DEFAULT_KINDS, TITLE_MAX, SUMMARY_MAX, KIND_MAX, RESERVED, isDate, checkTitle, checkSummary, cleanKind, parse, listOf, byMonth,
    addRecord, updateRecord, removeRecord, addKind, removeKind, onlyRecordChanged, onlyKindChanged };
  root.PHRecordWrite = RW;
  if (typeof module !== 'undefined' && module.exports) module.exports = RW;
})(typeof window !== 'undefined' ? window : globalThis);
