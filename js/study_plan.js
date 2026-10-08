// 공부 [추가 | 수정] 창 저장 + 세부 계획 (2026-10-08 비트, 로드맵 3-1단계 제작자 피드백). 그림·파일 접근 없음.
//   메인(electron/study_ipc.js ph:studySave)·화면(js/study_modal.js, js/study_gantt.js, js/study_grass.js)·Node 시험(tests/test_study_plan.js)이 같이 쓴다.
// 제작자 2026-10-08:
//   - 공부 = ## 공부 표 한 줄 (이름·시작일·끝일·메모). 추가할 때 끝일(전체 기간)도 정함
//   - 세부 계획 = ## 공부 단원 표 한 줄 (과목 = 공부 이름, 단원 = 세부 계획 이름, 한 날 = "시작~끝"). 파일 모양은 3단계 그대로 (옛 칠한 날도 그대로 읽힘)
//   - 세부 계획 기간은 상위 공부의 전체 기간 안에서만. 밖이면 막음 (code 'planOut')
//   - 공부함/안 함 체크 없음: 계획을 쓴 것 = 공부한 것. 잔디 = 계획 막대가 있는 날 (세부 계획이 있으면 세부 계획 날, 없으면 공부 전체 기간)
// 한 번 저장 = 여러 줄이 바뀌어도 쓰기 한 번 (사본 한 번). 바뀌는 단계마다 섹션 안전 검사를 따로 통과해야 함 (study_write onlyStudyChanged, study_parts onlyPartsChanged …)
(function (root) {
  'use strict';
  const req = (n) => (typeof require !== 'undefined' ? require(n) : null);
  const SW = root.PHStudyWrite || req('./study_write.js');
  const SP = root.PHStudyParts || req('./study_parts.js');
  const TS = root.PHTableSection || req('./table_section.js');
  const RR = () => root.PHRecordRename || req('./record_rename.js');
  const LABEL = () => ((root.PH_STUDY_PLAIN || {}).plan) || '세부 계획'; // 이름은 data/study_lines.js 한 곳 (제작자 확인 대기)
  const MAX_PLANS = 30;
  const bad = (code, msg, extra) => Object.assign(TS.err(code, msg), extra || {});

  // 옛 자료: 쪼개지 않은 과목의 빈 "전체" 줄(칠하기 때 생긴 것)은 세부 계획으로 안 봄
  const isPlan = (p) => !(p.part === SP.WHOLE && !p.days.length && !p.bad.length);
  // 세부 계획 목록: [{ sig, part, from, to, days, gaps(끊긴 날이 있는 옛 줄), line }]
  function plansOf(src, subject) {
    return SP.partsOf(SP.parse(src), subject).filter(isPlan).map((p) => ({ sig: p.sig, part: p.part, from: p.days[0] || '', to: p.days[p.days.length - 1] || '', days: p.days, gaps: SP.runs(p.days).length > 1, bad: p.bad.length > 0, line: p.line, review: p.review }));
  }
  const span = (from, to) => (from === to ? from : from + '~' + to);
  function checkPeriod(start, end) {
    if (!SW.isDate(start)) throw bad('badStart', '시작일 오류');
    if (!SW.isDate(end)) throw bad('badEnd', '끝일 오류');
    if (end < start) throw bad('badOrder', '끝일이 시작일보다 앞');
  }
  // 세부 계획이 상위 기간 [start, end] 안인지 (end 빈칸 = 끝 없음 옛 줄: 시작만 봄)
  function inside(days, start, end) { return days.every((d) => d >= start && (!end || d <= end)); }
  function checkInside(src, subject, start, end) {
    const out = plansOf(src, subject).filter((p) => !inside(p.days, start, end));
    if (out.length) throw bad('planOut', LABEL() + ' 기간이 공부 기간 밖: ' + out.map((p) => p.part).join(', '), { plans: out.map((p) => p.part) });
  }

  // ---- 세부 계획 한 줄 ----
  function addPlan(src, subject, part, from, to) {
    const n = SP.checkPart(part); checkPeriod(from, to);
    if (SP.partsOf(SP.parse(src), subject).some((p) => p.part === n)) throw bad('dupPart', '같은 이름이 있음', { part: n });
    return Object.assign(TS.addRow(src, SP.SPEC, [TS.encode(subject), TS.encode(n), span(from, to)]), { subject, part: n });
  }
  // 고치기: 이름·기간이 그대로면 줄도 그대로 (끊긴 날이 있는 옛 줄을 함부로 이어 붙이지 않음)
  function setPlan(src, sig, part, from, to) {
    const p = SP.parse(src).parts.find((x) => x.sig === String(sig).trim()); if (!p) throw bad('notFound', '줄 없음');
    const n = SP.checkPart(part); checkPeriod(from, to);
    if (n !== p.part && SP.partsOf(SP.parse(src), p.subject).some((x) => x.part === n)) throw bad('dupPart', '같은 이름이 있음', { part: n });
    const same = p.days.length && p.days[0] === from && p.days[p.days.length - 1] === to;
    const daysText = same ? p.daysText : span(from, to);
    return Object.assign(TS.updateRow(src, SP.SPEC, p.sig, [TS.encode(p.subject), TS.encode(n), daysText]), { subject: p.subject, part: n });
  }

  // ---- 한 번 저장 ----
  //   q = { mode: 'add' | 'edit', name(edit: 지금 이름), study: { name, start, end, memo }, plans: [{ sig?, part, from, to }], removed: [sig] }
  //   -> { text, changed, name, oldName, steps: [op...] }. 값이 틀리면 code 오류 (badStart·badEnd·badOrder·planOut·dupPart·badPart·planDate·usedName …)
  function save(src, q) {
    if (!q || typeof q !== 'object') throw new Error('요청 형식 오류');
    const st = q.study || {}, plans = Array.isArray(q.plans) ? q.plans : [], removed = Array.isArray(q.removed) ? q.removed : [];
    if (plans.length > MAX_PLANS || removed.length > MAX_PLANS) throw new Error('세부 계획이 너무 많음');
    let name; try { name = SW.checkName(st.name); } catch (e) { throw bad('badName', e.message); }
    let memo; try { memo = SW.checkMemo(st.memo || ''); } catch (e) { throw bad('badMemo', e.message); }
    checkPeriod(st.start, st.end);
    // 세부 계획 값 먼저 검사 (이름·날짜·기간 안·같은 이름)
    const seen = new Set();
    plans.forEach((p) => {
      if (!p || typeof p !== 'object') throw new Error('세부 계획 형식 오류');
      let n; try { n = SP.checkPart(String(p.part == null ? '' : p.part)); } catch (e) { throw bad('badPart', LABEL() + ' 이름 오류', { part: String(p.part || '') }); }
      if (!SW.isDate(p.from) || !SW.isDate(p.to) || p.to < p.from) throw bad('planDate', LABEL() + ' 날짜 오류', { part: n });
      if (p.from < st.start || p.to > st.end) throw bad('planOut', LABEL() + ' 기간이 공부 기간 밖: ' + n, { plans: [n] });
      if (seen.has(n)) throw bad('dupPart', '같은 이름이 있음', { part: n }); seen.add(n);
    });
    let t = src; const steps = [];
    const step = (r, ok, op) => { if (!r.changed) return; if (!ok(t, r)) throw new Error('정해진 섹션 밖이 바뀌려 해서 멈춤 (' + op + ')'); t = r.text; steps.push(op); };
    const partOk = (op) => (a, r) => SP.onlyPartsChanged(a, r.text, op);
    const applyPlans = (subject) => {
      removed.forEach((sig) => { if (typeof sig !== 'string') throw new Error('줄 고르기 형식 오류'); step(SP.removePart(t, sig), partOk('remove'), 'plan:remove'); });
      plans.filter((p) => p.sig).forEach((p) => step(setPlan(t, p.sig, p.part, p.from, p.to), partOk('update'), 'plan:update'));
      plans.filter((p) => !p.sig).forEach((p) => step(addPlan(t, subject, p.part, p.from, p.to), partOk('add'), 'plan:add'));
    };
    let oldName = null;
    // 공부 표 쓰기 오류(같은 이름 등)는 글만 있는 오류라 code를 달아 화면이 칸 오류로 보이게
    const named = (f) => { try { return f(); } catch (e) { if (!e.code) e.code = /같은 이름|이름과 같아서/.test(e.message) ? 'dupName' : /이름/.test(e.message) ? 'badName' : e.code; throw e; } };
    if (q.mode === 'add') {
      step(named(() => SW.addStudy(t, { name, start: st.start, end: st.end, memo })), (a, r) => SW.onlyStudyChanged(a, r.text, 'add'), 'study:add');
      applyPlans(name);
    } else if (q.mode === 'edit') {
      oldName = String(q.name || '');
      // 세부 계획 먼저 (지금 이름으로), 그다음 공부 줄 (이름이 바뀌면 지난 기록·세부 계획 과목 칸도 따라감)
      applyPlans(oldName);
      const r = named(() => SW.updateStudy(t, oldName, { newName: name, start: st.start, end: st.end, memo }));
      step(r, (a, x) => SW.onlyStudyChanged(a, x.mid, 'update') && (x.text === x.mid || (!!x.oldName && RR().onlyNamesRenamed(x.mid, x.text, x.oldName, x.name))), 'study:update');
      if (r.changed && r.oldName && r.oldName !== r.name) {
        const t3 = SP.renameSubject(t, r.oldName, r.name);
        step(t3, (a, x) => SP.onlySubjectRenamed(a, x.text, r.oldName, r.name), 'plan:subject');
      }
    } else throw new Error('모드 오류');
    checkInside(t, name, st.start, st.end); // 손대지 않은 옛 줄까지 모두 기간 안
    return { text: t, changed: t !== src, name, oldName, steps };
  }

  // ---- 잔디: 그날 계획 막대 수 ----
  //   { 'YYYY-MM-DD': [이름...] }. 세부 계획이 있으면 그 날들, 없으면 공부 전체 기간(끝 없음 = 오늘까지). 옛 "이름 n시간" 기록 날도 한 칸
  function dayMap(src, row, records, today) {
    const m = {}, add = (d, n) => { (m[d] = m[d] || []).push(n); };
    const ps = plansOf(src, row.name);
    if (ps.length) ps.forEach((p) => p.days.forEach((d) => add(d, p.part)));
    else if (SW.isDate(row.start)) {
      const end = SW.isDate(row.end) ? row.end : today;
      for (let d = row.start, i = 0; d <= end && i < 3700; d = SW.addDays(d, 1), i++) add(d, row.name);
    }
    const logged = SW.loggedDays(records, row.name);
    Object.keys(logged).forEach((d) => { if (logged[d] > 0 && !m[d]) m[d] = ['기록']; });
    return m;
  }
  // 그 달(YYYY-MM)에 걸친 공부만 (기간이 그 달과 겹치거나, 그 달에 잔디 날이 있음)
  function inMonth(src, row, records, ym, today) {
    const first = ym + '-01', last = SW.addDays(SW.ymd(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 1, 12).getTime()), -1);
    if (SW.isDate(row.start) && row.start <= last && (!SW.isDate(row.end) ? (row.end ? false : today >= first) : row.end >= first)) return true;
    return Object.keys(dayMap(src, row, records, today)).some((d) => d.slice(0, 7) === ym);
  }

  const SPL = { MAX_PLANS, isPlan, plansOf, span, checkPeriod, inside, checkInside, addPlan, setPlan, save, dayMap, inMonth, LABEL };
  root.PHStudyPlan = SPL;
  if (typeof module !== 'undefined' && module.exports) module.exports = SPL;
})(typeof window !== 'undefined' ? window : globalThis);
