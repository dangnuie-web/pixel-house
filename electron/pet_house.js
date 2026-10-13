// 바탕화면 펫 <-> 생활 기록 (2026-10-13 비트, 두부 펫 lib/house.js를 하우스 앱 안으로 옮김)
// 원칙 (2026-10-04 제작자 결정 그대로): 하우스와 "같은 코드"로 쓴다.
//   - 쓰기: electron/water_ipc.js(물), life_log_ipc.js(잠·식사), logs_ipc.js(식사 만족도·양 고치기). 하우스 메인과 같은 기록 파일·같은 쓰기 전 사본(backup)·같은 features(꺼진 일지 기능)를 받음
//     이 모듈들은 "ipcMain.handle(이름, 함수)"로 등록하는 꼴이라, 가짜 ipcMain에 등록해서 함수만 받아 씀 (펫 창이 IPC로 쓰기를 부를 수 없음 = 펫 창은 고른 값만 보냄)
//     -> 읽은 시각 검사(conflict), 값 검사, 바뀐 줄 검사, 쓰기 직전 백업, 꺼진 식사 거절이 하우스와 한 글자도 다르지 않음
//   - 대사: electron/pet_lines.js (하우스 화면과 같은 대사 파일, 이름·강아지 적용)
// 다시 적용 (2026-10-04 토리 지시 "파일이 바뀌었으면 다시 읽고 동작 다시 적용", 두부 펫과 같음):
//   펫이 대화를 시작할 때 읽은 글과 지금 파일이 다르면 쓰기 모듈이 conflict로 돌려줌 -> 새 글로 한 번 다시 시도.
//   단, 고치려던 그 줄(오늘 잠 / 오늘 그 끼니)이 그 사이 다른 창(하우스 창 등)에서 바뀌었으면 덮지 않고 conflict 그대로 (두부가 "한 번 더 부탁")
//   물 +1은 새 글의 오늘 잔 수에 +1
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const R = (f) => require(path.join(ROOT, f));

// o: { file(기록 파일 전체 경로), backup(electron/life_backup.js 결과), features(furnish_ipc 결과 또는 { isSeen, markSeen }), settings(PH_SETTINGS),
//      lines(pet_lines.build 결과), guard?, fixedDay?() -> 'YYYY-MM-DD'|null, now?() }
function create(o) {
  const S = o.settings;
  const Md = R('js/life_md.js'), LL = R('js/life_log.js'), ML = R('js/meal_log.js'), FX = R('js/features.js'), Flow = R('js/dialog_flow.js');
  const now = o.now || Date.now;
  const file = o.file;
  const features = o.features;
  const H = {};
  const ipcMain = { handle: (ch, fn) => { H[ch] = fn; } };
  const common = { ipcMain, file, backup: o.backup, settings: S, guard: o.guard, features };
  const fixedDay = o.fixedDay || (() => null);
  R('electron/water_ipc.js')(Object.assign({ today: () => fixedDay() || Md.logDay(now(), S.DAY_START_HOUR) }, common));
  R('electron/life_log_ipc.js')(Object.assign({ fixedDay }, common));
  R('electron/logs_ipc.js')(Object.assign({ fixedDay }, common));
  const invoke = async (ch, req) => H[ch](null, req);

  function read() {
    try { return { text: fs.readFileSync(file, 'utf8'), lastModified: fs.statSync(file).mtimeMs }; } catch (e) { return null; }
  }
  function readSeen() { try { return features && features.read ? features.read().seen : []; } catch (e) { return []; } }
  // 꺼진 선택지 (하우스 js/dialog.js offTopics와 같은 계산): 지금은 식사뿐. 생활습관 표 이름 + seen(앱 설정 ∪ 지금 표에 있는 일지 기능)
  function offTopics(text) {
    let names = null;
    try { const d = Md.parse(text); if (d.habits) names = d.habits.rows.map((r) => r.name); } catch (e) { names = null; }
    if (!names) return [];
    const seen = Array.from(new Set(readSeen().concat(FX.seenFrom(names))));
    return FX.stateOf('meal', names, seen) === 'off' ? ['meal'] : [];
  }

  // ---- 다시 적용 판단: 대화가 본 글(old)과 새 글(fresh)에서 "고치려던 줄"이 같은지 ----
  const day = () => fixedDay() || LL.logDay(now(), S.DAY_START_HOUR);
  const todayOf = (text) => LL.dayOf(LL.parse(text), day());
  const pickSleep = (x) => (x ? [x.bed, x.wake, x.memo].join('|') : '');
  const pickMeal = (x) => (x ? [x.time, x.menu != null ? x.menu : x.text, x.rating, x.amount, x.memo].join('|') : '');
  function sameTarget(kind, oldText, freshText, args) {
    if (oldText == null || freshText == null) return false;
    try {
      const a = todayOf(oldText), b = todayOf(freshText);
      if (kind === 'sleep') return pickSleep(a.sleep) === pickSleep(b.sleep);
      if (kind === 'meal') return args.kind === LL.MULTI_MEAL || pickMeal(a.meals[args.kind]) === pickMeal(b.meals[args.kind]);
    } catch (e) { return false; }
    return false;
  }
  // 오늘 물 { n, of } (하우스 dialog_flow·interact와 같은 계산)
  function waterOf(text) {
    const d = Md.parse(text), habit = S.WATER_HABIT || '물';
    const row = d.habits && d.habits.rows.find((r) => r.name === habit && r.slots > 0); if (!row) return null;
    const t = fixedDay() ? new Date(fixedDay() + 'T12:00:00').getTime() : now();
    const last = Md.latestSlots(d.records, habit, t, S.DAY_START_HOUR);
    return { n: last && last.isToday ? last.value : 0, of: row.slots };
  }

  // 대화 흐름이 쓰는 저장 함수 (하우스 preload PHDesktop과 같은 모양). view() = 대화가 지금 보고 있는 글 { text, lastModified }
  //   hooks.mealExtra(kind) -> { rating, amount } | null : 식사 메뉴를 적은 뒤 만족도·양을 묻는 곳 (펫 화면). 저장 전에 물음
  function makeApi(view, hooks) {
    hooks = hooks || {};
    const log = (x) => { if (hooks.log) hooks.log(x); };
    async function once(kind, ch, req, args) {
      let res = await invoke(ch, req);
      if (res && res.conflict) {
        const v = view();
        if (sameTarget(kind, v && v.text, res.text, args || {})) { log('reapply:' + kind); res = await invoke(ch, Object.assign({}, req, { lastModified: res.lastModified })); res = Object.assign({ reapplied: true }, res); }
        else log('conflict:' + kind);
      }
      return res;
    }
    return {
      setSleep: (bed, wake, memo, lastModified) => once('sleep', 'ph:setSleep', { bed, wake, memo, lastModified }),
      setNote: async () => ({ ok: false, off: true }), // 2026-10-13 오늘 한마디 뺌 (흐름이 부르지 않음)
      setWater: async (value, lastModified) => {
        let res = await invoke('ph:setWater', { value, lastModified });
        if (res && res.conflict) { // 새 글의 오늘 잔 수에 +1 (이미 다 찼으면 그대로)
          const w = waterOf(res.text); log('reapply:water');
          if (w && w.n < w.of) res = Object.assign({ reapplied: true }, await invoke('ph:setWater', { value: w.n + 1, lastModified: res.lastModified }));
          else res = { ok: true, unchanged: true, reapplied: true, text: res.text, lastModified: res.lastModified };
        }
        return res;
      },
      addMeal: async (kind, text, lastModified) => {
        const extra = hooks.mealExtra ? await hooks.mealExtra(kind) : null;
        const res = await once('meal', 'ph:addMeal', { kind, text, lastModified }, { kind });
        if (!res || !res.ok || res.off || !extra || (extra.rating == null && extra.amount == null)) return res;
        // 방금 적은 줄 (그날·그 끼니·그 메뉴 마지막 줄)에 만족도·양만 고침 (식사 일지 창과 같은 ph:mealUpdate)
        const menu = LL.clean(text), rows = ML.parse(res.text).rows.filter((r) => r.date === res.date && r.kind === kind && r.menu === menu);
        const row = rows[rows.length - 1]; if (!row) return res;
        const patch = {}; if (extra.rating != null) patch.rating = extra.rating; if (extra.amount != null) patch.amount = extra.amount;
        let r2;
        try {
          r2 = await invoke('ph:mealUpdate', { key: { sig: row.sig }, patch, lastModified: res.lastModified });
          if (r2 && r2.conflict) { log('reapply:mealExtra'); r2 = await invoke('ph:mealUpdate', { key: { sig: row.sig }, patch, lastModified: r2.lastModified }); }
        } catch (e) { log('mealExtra fail ' + e.message); return Object.assign({ extraFailed: true }, res); }
        if (r2 && r2.ok && r2.text != null) return Object.assign({}, r2, { line: res.line, date: res.date, extra: patch });
        return Object.assign({ extraFailed: true }, res);
      },
    };
  }

  const L = o.lines;
  return { ok: true, file, settings: S, lines: L.D, moods: [], moreLines: L.IL, Flow, LL, ML, Md, FX, read, readSeen, offTopics, makeApi, invoke, waterOf, sameTarget, now, handlers: Object.keys(H) };
}

module.exports = { create };
