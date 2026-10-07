// 이름 바꾸기 때 지난 기록 이름도 같이 바꾸기 (2026-10-04 비트, 제작자 결정 "습관 이름을 바꾸면 지난 기록의 이름도 같이 바뀐다").
// 그림·파일 접근 없음: 글(text)을 받아 새 글을 돌려준다. habit_edit.js(updateHabit)·study_write.js(updateStudy)와 메인 검사가 같이 쓴다.
//   ## 습관 기록 | 날짜 | 한 습관 |   칸 "물 3/6, 요가, 스트레칭 1/2, 독서 20쪽, 깃허브 1시간"에서 이름이 정확히 같은 항목만
//     ("요가"를 바꿀 때 "요가 매트"는 그대로. 항목 이름은 life_md.js recordItems로 읽음: "이름", "이름 k/n", "이름 20쪽")
//   ## 안전장치 확인 | 주 시작일 | 항목 | 결과 |   항목 칸이 정확히 같은 줄만
// 쓰기 원칙: 항목 글자 앞쪽 이름만 바꿈. 양·단위·구분자(쉼표, 띄어쓰기)·날짜·결과는 한 글자도 안 바뀐다.
(function (root) {
  'use strict';
  const req = (n) => (typeof require !== 'undefined' ? require(n) : null);
  const Md = root.PHLifeMd || req('./life_md.js');
  const LW = root.PHLifeWrite || req('./life_write.js');

  const SAFETY = '안전장치 확인'; // life_log.js SECTIONS.safety.name 과 같음 (시험으로 확인)
  const ROW_RE = /^(\s*\|[^|]*\|)([^|]*)(\|.*)$/; // | 날짜 | 한 습관 | ... -> 앞 / 한 습관 칸 / 뒤
  const isRow = (l) => /^\s*\|/.test(l);
  const isSep = (l) => /^\s*\|?\s*:?-{3,}/.test(l);
  const splitLines = (t) => String(t).split(/\r?\n/);
  const nlOf = (t) => (/\r\n/.test(t) ? '\r\n' : '\n');

  // 항목 글자(앞뒤 공백 없음)의 이름
  const itemName = (t) => { const it = Md.recordItems(t)[0]; return it ? it.name : t; };
  // 칸 글 -> 항목·구분자 (구분자는 원래 모양 그대로)
  function splitCell(core) {
    const parts = String(core).split(/(\s*[,，]\s*)/), items = [], seps = [];
    parts.forEach((p, i) => (i % 2 ? seps : items).push(p));
    return { items, seps };
  }
  function joinCell(c) { let s = ''; c.items.forEach((it, i) => { s += it; if (i < c.seps.length) s += c.seps[i]; }); return s; }
  // 항목 하나: 이름이 정확히 from이면 앞 이름만 to로 (앞뒤 공백 그대로). 아니면 null
  function renameItem(raw, from, to) {
    const lead = /^\s*/.exec(raw)[0], t = raw.trim(), trail = raw.slice(lead.length + t.length);
    if (!t || itemName(t) !== from || t.slice(0, from.length) !== from) return null;
    return lead + to + t.slice(from.length) + trail;
  }

  // 표 범위 (섹션이 없거나 표가 없으면 null): { rows: [줄 번호] }
  function recordRows(lines) { const T = LW.recordsTable(lines); return T ? T.rows.map((r) => r.line) : []; }
  function safetyRows(lines) {
    const secs = Md.sections(lines).filter((s) => s.name === SAFETY), out = [];
    secs.forEach((sec) => {
      const t = Md.table(lines, sec); if (!t || t.head[1] !== '항목') return;
      t.rows.forEach((r) => out.push(r.line));
    });
    return out;
  }
  // 안전장치 확인 한 줄: 셋째 조각(항목 칸)이 정확히 from이면 그 칸 이름만 to로
  function renameSafetyLine(l, from, to) {
    const seg = l.split('|'); if (seg.length < 4) return null;
    if (seg[2].trim() !== from) return null;
    const lead = /^\s*/.exec(seg[2])[0], trail = seg[2].slice(lead.length + from.length);
    seg[2] = lead + to + trail;
    return seg.join('|');
  }
  // 습관 기록 한 줄: 한 습관 칸에서 이름이 from인 항목만
  function renameRecordLine(l, from, to) {
    const m = ROW_RE.exec(l); if (!m) return null;
    const c = splitCell(m[2]); let hit = 0;
    c.items = c.items.map((it) => { const n = renameItem(it, from, to); if (n == null) return it; hit++; return n; });
    return hit ? { line: m[1] + joinCell(c) + m[3], hits: hit } : null;
  }

  // 이름 바꾸기: -> { text, changed, records(바뀐 기록 줄 수), items(바뀐 항목 수), safety(바뀐 안전장치 확인 줄 수) }
  function renameInRecords(text, from, to) {
    if (typeof from !== 'string' || typeof to !== 'string' || !from || !to || /[|,，\r\n]/.test(from + to)) throw new Error('이름 형식 오류');
    if (from === to) return { text, changed: false, records: 0, items: 0, safety: 0 };
    const lines = splitLines(text);
    let records = 0, items = 0, safety = 0;
    recordRows(lines).forEach((i) => { const r = renameRecordLine(lines[i], from, to); if (r) { lines[i] = r.line; records++; items += r.hits; } });
    safetyRows(lines).forEach((i) => { const r = renameSafetyLine(lines[i], from, to); if (r != null) { lines[i] = r; safety++; } });
    if (!records && !safety) return { text, changed: false, records: 0, items: 0, safety: 0 };
    return { text: lines.join(nlOf(text)), changed: true, records, items, safety };
  }
  // 지난 기록(습관 기록·안전장치 확인)에 이 이름이 쓰였는지 (지운 습관의 옛 기록 등)
  function usedInRecords(text, name) {
    const lines = splitLines(text);
    if (recordRows(lines).some((i) => { const m = ROW_RE.exec(lines[i]); return m && splitCell(m[2]).items.some((it) => it.trim() && itemName(it.trim()) === name); })) return true;
    return safetyRows(lines).some((i) => { const seg = lines[i].split('|'); return seg.length >= 4 && seg[2].trim() === name; });
  }

  // 그 이름이 지난 기록에 마지막으로 나온 날 (습관 기록 날짜, 안전장치 확인은 주 시작일). 없으면 null (2026-10-04 usedName 안내용)
  function lastUsed(text, name) {
    const lines = splitLines(text), day = (c) => { const m = /\d{4}-\d{2}-\d{2}/.exec(c || ''); return m ? m[0] : null; };
    let last = null; const see = (d) => { if (d && (!last || d > last)) last = d; };
    recordRows(lines).forEach((i) => { const m = ROW_RE.exec(lines[i]); if (m && splitCell(m[2]).items.some((it) => it.trim() && itemName(it.trim()) === name)) see(day(lines[i].split('|')[1])); });
    safetyRows(lines).forEach((i) => { const seg = lines[i].split('|'); if (seg.length >= 4 && seg[2].trim() === name) see(day(seg[1])); });
    return last;
  }
  // 막을 때 쓰는 오류 (code usedName + 마지막 날). kind = 'habit' | 'study'
  function usedErr(text, name, kind) {
    const e = new Error('지난 기록에 같은 이름이 있어서 섞일 수 있음: ' + name);
    return Object.assign(e, { code: 'usedName', usedName: name, lastDate: lastUsed(text, name), usedKind: kind || 'habit' });
  }

  // ---- 안전 검사 (메인이 쓰기 직전에): 옛 글 -> 새 글이 "기록 표 안 from 항목이 to로 바뀐 것"뿐인지 ----
  //   줄 수 같음. 바뀐 줄은 모두 습관 기록 표 줄 또는 안전장치 확인 표 줄. 그 줄 안에서도 날짜·양·구분자·결과는 그대로
  function onlyNamesRenamed(oldText, newText, from, to) {
    try {
      if (typeof from !== 'string' || typeof to !== 'string' || !from || !to || from === to || /[|,，\r\n]/.test(from + to)) return false;
      const a = splitLines(oldText), b = splitLines(newText);
      if (a.length !== b.length) return false;
      const rec = new Set(recordRows(a)), saf = new Set(safetyRows(a));
      for (let i = 0; i < a.length; i++) {
        if (a[i] === b[i]) continue;
        if (rec.has(i)) { if (!okRecordLine(a[i], b[i], from, to)) return false; }
        else if (saf.has(i)) { if (renameSafetyLine(a[i], from, to) !== b[i]) return false; }
        else return false;
      }
      return true;
    } catch (e) { return false; }
  }
  // 기록 한 줄: 앞(날짜)·뒤 그대로, 구분자 그대로, 항목은 같거나 from -> to (나머지 글자 그대로)
  function okRecordLine(x, y, from, to) {
    const m = ROW_RE.exec(x), n = ROW_RE.exec(y); if (!m || !n || m[1] !== n[1] || m[3] !== n[3]) return false;
    if (!isRow(y) || isSep(y)) return false;
    const c = splitCell(m[2]), d = splitCell(n[2]);
    if (c.items.length !== d.items.length || c.seps.join('\u0000') !== d.seps.join('\u0000')) return false;
    return c.items.every((it, k) => it === d.items[k] || renameItem(it, from, to) === d.items[k]);
  }

  const RR = { SAFETY, itemName, renameItem, renameInRecords, usedInRecords, lastUsed, usedErr, onlyNamesRenamed };
  root.PHRecordRename = RR;
  if (typeof module !== 'undefined' && module.exports) module.exports = RR;
})(typeof window !== 'undefined' ? window : globalThis);
