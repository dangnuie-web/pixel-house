// 두부 대화창 흐름 (화면 없음, Node 시험에서도 돌림). 대사 = js/data/dialog_lines.js, 화면 = js/dialog.js
// run(ui, ctx): ui는 화면이 주는 네 가지 (모두 약속을 돌려줌. Esc = null)
//   ui.ask(text, choices[{ id, label }], { cols })       -> 고른 id
//   ui.time(text, { row: 'bed'|'wake', hours, picked, dots, placeholder, validate }) -> { time } | { times: [잔, 깬] }
//   ui.input(text, { placeholder, value, skip, validate }) -> 적은 글 | { skip: true }
//   ui.tell(text)                                         -> true (다음) / null (Esc)
// ctx: { lines, clickLines, settings, now(), data: { text, lastModified } | null, api, onWrite(res), pick(key, list) }
//   (interact) ctx.topic = 첫 인사·선택지 없이 그 주제로 바로 (하루 마감의 "한마디 남길게" = 'note')
//   (interact) ctx.moods = 기분 4칸 [{ id, label, desc, icon }], ctx.more = 대사 묶음 하나 더 (js/data/interact_lines.js: mood.*)
//     moods가 있으면 오늘 한마디 앞에 기분 고르기 -> "한 줄 더 적어 볼래요?" (여기까지 = 기분만 저장)
//   api = PHDesktop (setSleep, addMeal, setNote, setWater). 날짜·파일은 메인이 정함. 화면은 "오늘 이미 있는지" 보여 주려고 같은 날짜 규칙(DAY_START_HOUR)을 씀
// 규칙 (부기 원고 v01, 토리 결정 2026-10-03): 잔소리·평가 없음, 흐름 중간에 그만두면 아무것도 저장하지 않음,
//   간식은 확인 없이 한 줄 더함, 아침·점심·저녁은 그날 이미 있으면 "고칠까요?" 먼저
// 꺼진 기능 (2026-10-04 제작자): ctx.off = 꺼진 선택지 id 목록 (지금은 'meal'뿐: 식사 일지 습관 줄을 지우면 js/dialog.js가 넣음)
//   -> 선택지에서 빠지고, 시간대 첫 권하는 선택지가 꺼졌으면 ALT로 바꾸고 인사도 greet.alt.<바뀐 선택지> (dialog_lines.js, 비트 임시)
//   잠·한마디·그냥 같이 있기는 습관 줄이 없어 늘 켜짐. 물은 "물" 줄을 지울 수 없어 늘 켜짐 (줄이 없으면 원래대로 fail 한 줄)
//   메인도 꺼진 식사 쓰기를 거절 { off: true } -> common.fail
(function (root) {
  'use strict';
  const req = (n) => (typeof require !== 'undefined' ? require(n) : null);
  const LL = root.PHLifeLog || req('./life_log.js');
  const Md = root.PHLifeMd || req('./life_md.js');
  const World = root.PHWorld || req('./world.js');

  const MENU = ['sleep', 'meal', 'water', 'note', 'idle'];
  // 시간대별 권하는 선택지 (부기 원고 1장: 아침 = 잠, 낮·저녁 = 식사, 밤·새벽 = 오늘 한마디)
  const FIRST = { morning: 'sleep', day: 'meal', evening: 'meal', night: 'note', dawn: 'note' };
  const MEAL_IDS = ['breakfast', 'lunch', 'dinner', 'snack'];

  // 첫 권하는 선택지가 꺼졌을 때 대신 권할 것 (낮 = 물 한 잔, 저녁 = 오늘 한마디). 그것도 꺼졌으면 MENU 순서로 처음 켜진 것
  const ALT = { morning: 'note', day: 'water', evening: 'note', night: 'sleep', dawn: 'sleep' };
  const offSet = (off) => new Set((off || []).filter((k) => MENU.includes(k) && k !== 'idle'));
  function firstOf(band, off) {
    const o = offSet(off), f = FIRST[band] || 'meal';
    if (!o.has(f)) return f;
    const a = ALT[band]; if (a && !o.has(a)) return a;
    return MENU.find((k) => !o.has(k));
  }
  function menuOrder(band, off) { const o = offSet(off), f = firstOf(band, off); return [f].concat(MENU.filter((k) => k !== f && !o.has(k))); }
  function shorten(t, n) { const a = Array.from(String(t || '')); return a.length > (n || 12) ? a.slice(0, n || 12).join('') + '…' : a.join(''); }
  // 채우기. 조사 하나만 맞춤: "{wake}로"에 "8시 10분"이 오면 "8시 10분으로" (원고 문장은 그대로)
  function fill(s, v) { return String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)).replace(/(\d+분)로/g, '$1으로'); }

  async function run(ui, ctx) {
    const D = ctx.lines, S = ctx.settings || {}, C = S.DIALOG || {};
    const out = { topic: null, saved: false, cancelled: false, steps: [], acts: [] };
    const last = ctx.lastPick || (ctx.lastPick = {});
    // 대사 한 줄 고르기 (바로 앞 줄 제외) + 채우기. 괄호 연출은 acts에 남기고 글만
    function line(key, vars, extra) {
      const get = (src) => key.split('.').reduce((o, k) => (o ? o[k] : null), src);
      const list = get(D) || (ctx.more ? get(ctx.more) : null);
      const all = (Array.isArray(list) ? list : list ? [list] : []).concat(extra || []);
      const i = World.pick(all, last[key], ctx.random || Math.random, (it) => !(it && it.needs));
      if (i < 0) return '';
      last[key] = i;
      const p = World.parseLine(all[i]);
      if (p.act) out.acts.push(p.act);
      return fill(p.say, vars);
    }
    const step = (s) => out.steps.push(s);
    const day = () => LL.logDay(ctx.now(), S.DAY_START_HOUR);
    const today = () => (ctx.data && ctx.data.text != null ? LL.dayOf(LL.parse(ctx.data.text), day()) : { sleep: null, meals: { 간식: [] }, notes: [] });
    async function cancel() { out.cancelled = true; step('cancel'); await ui.tell(line('common.cancel')); return out; }
    async function done(key, vars) { out.saved = true; step('saved'); await ui.tell(line(key, vars)); return out; }
    // 저장 한 번. 충돌이면 새 글을 받아 두고 "한 번 더 부탁" (자동으로 다시 쓰지 않음: 그사이 바뀐 줄을 덮지 않게)
    async function save(call) {
      if (!ctx.api || !ctx.data) { step('browser'); await ui.tell(line(ctx.api ? 'common.fail' : 'common.browser')); return false; }
      let res;
      try { res = await call(ctx.data.lastModified); } catch (e) { out.error = String(e && e.message || e); step('fail'); await ui.tell(line('common.fail')); return false; }
      if (res && res.text != null) { ctx.data = { text: res.text, lastModified: res.lastModified }; if (ctx.onWrite) ctx.onWrite(res); }
      if (res && res.off) { step('off'); await ui.tell(line('common.fail')); return false; } // 꺼진 기능 (메인이 거절)
      if (!res || res.conflict) { step('conflict'); await ui.tell(line('common.conflict')); return false; }
      return true;
    }
    const maxLen = C.MAX_LEN || LL.MAX_LEN;
    const checkText = (required) => (v) => {
      const t = LL.clean(v);
      if (required && !t) return line('common.empty');
      if (Array.from(t).length > maxLen) return line('common.too_long');
      return null;
    };

    // ---- 첫 인사 + 선택지 ----
    const band = World.timeBand(new Date(ctx.now()).getHours(), S.TIME_BANDS || []);
    out.band = band;
    const order = menuOrder(band, ctx.off), moved = order[0] !== (FIRST[band] || 'meal');
    out.menu = order;
    const greetKey = moved && D.greet && D.greet.alt && D.greet.alt[order[0]] ? 'greet.alt.' + order[0] : 'greet.' + band;
    const topic = ctx.topic && MENU.includes(ctx.topic) ? ctx.topic : await ui.ask(line(greetKey), order.map((k) => ({ id: k, label: D.menu[k] })), { cols: 2 });
    if (topic == null) return cancel();
    out.topic = topic; step('menu:' + topic);

    // ---- 잠 ----
    if (topic === 'sleep') {
      const ex = today().sleep;
      if (ex && (ex.bed || ex.wake)) {
        const a = await ui.ask(line('sleep.exists', { bed: LL.fmtTime(ex.bed) || '?', wake: LL.fmtTime(ex.wake) || '?' }), [{ id: 'fix', label: D.btn.fix }, { id: 'keep', label: D.btn.keep }], { cols: 2 });
        if (a == null) return cancel();
        if (a === 'keep') { step('keep'); await ui.tell(line('common.keep')); return out; }
      }
      const dots = { bed: ex && ex.bed, wake: ex && ex.wake };
      const badTime = (v) => (!LL.clean(v) ? line('common.empty') : LL.parseTimes(v).length ? null : line('common.bad_time'));
      let bed = null, wake = null;
      const r1 = await ui.time(line('sleep.ask_bed'), { row: 'bed', hours: C.BED_HOURS || [22, 23, 0, 1, 2, 3], picked: {}, dots, placeholder: D.ui.timePlaceholder, validate: badTime });
      if (r1 == null) return cancel();
      if (r1.times && r1.times.length >= 2) { bed = r1.times[0]; wake = r1.times[1]; } else bed = r1.time || (r1.times && r1.times[0]);
      step('bed:' + bed);
      if (!wake) {
        const r2 = await ui.time(line('sleep.ask_wake'), { row: 'wake', hours: C.WAKE_HOURS || [6, 7, 8, 9, 10, 11], picked: { bed }, dots, placeholder: D.ui.timePlaceholder, validate: badTime });
        if (r2 == null) return cancel();
        wake = r2.time || (r2.times && r2.times[0]);
      }
      step('wake:' + wake);
      const m = await ui.input(line('sleep.ask_memo'), { placeholder: D.ui.memoPlaceholder, value: ex ? ex.memo || '' : '', skip: D.btn.skip, validate: checkText(false) });
      if (m == null) return cancel();
      const memo = m && m.skip ? '' : LL.clean(m);
      step('memo:' + memo);
      if (!(await save((lm) => ctx.api.setSleep(bed, wake, memo, lm)))) return out;
      return done('sleep.saved', { bed: LL.fmtTime(bed), wake: LL.fmtTime(wake) });
    }

    // ---- 식사 ----
    if (topic === 'meal') {
      const k = await ui.ask(line('meal.ask_kind'), MEAL_IDS.map((id) => ({ id, label: D.meal.kind[id] })), { cols: 2 });
      if (k == null) return cancel();
      const kind = D.meal.kind[k]; step('kind:' + kind);
      const ex = kind === LL.MULTI_MEAL ? null : today().meals[kind];
      if (ex) {
        const a = await ui.ask(line('meal.exists', { meal: kind, text: shorten(ex.text) }), [{ id: 'fix', label: D.btn.fix }, { id: 'keep', label: D.btn.keep }], { cols: 2 });
        if (a == null) return cancel();
        if (a === 'keep') { step('keep'); await ui.tell(line('common.keep')); return out; }
      }
      const v = await ui.input(line('meal.ask_what', { meal: kind }), { placeholder: D.ui.mealPlaceholder, value: ex ? ex.text : '', validate: checkText(true) });
      if (v == null || (v && v.skip)) return cancel();
      const text = LL.clean(v); step('what:' + text);
      if (!(await save((lm) => ctx.api.addMeal(kind, text, lm)))) return out;
      return done('meal.saved', { meal: kind });
    }

    // ---- 물: 묻지 않고 바로 +1 (물컵과 같은 저장 ph:setWater, 날짜 = 물컵 규칙) ----
    if (topic === 'water') {
      if (!ctx.api || !ctx.data) { step('browser'); await ui.tell(line('common.browser')); return out; }
      const d = Md.parse(ctx.data.text), habit = S.WATER_HABIT || '물';
      const row = d.habits && d.habits.rows.find((r) => r.name === habit && r.slots > 0);
      if (!row) { step('fail'); await ui.tell(line('common.fail')); return out; }
      const lastW = Md.latestSlots(d.records, habit, ctx.now(), S.DAY_START_HOUR), cur = lastW && lastW.isToday ? lastW.value : 0;
      if (cur >= row.slots) { step('over'); await ui.tell(line('water.over')); return out; }
      const n = cur + 1;
      if (!(await save((lm) => ctx.api.setWater(n, lm)))) return out;
      out.water = n;
      return done(n === row.slots ? 'water.full' : 'water.up', { n, goal: row.slots });
    }

    // ---- 오늘 한마디 ----
    if (topic === 'note') {
      const notes = today().notes, lastNote = notes.length ? notes[notes.length - 1] : null;
      let fix = false;
      if (lastNote) {
        const a = await ui.ask(line('note.exists'), [{ id: 'more', label: D.btn.more }, { id: 'fix', label: D.btn.fix }, { id: 'keep', label: D.btn.keep }], { cols: 2 });
        if (a == null) return cancel();
        if (a === 'keep') { step('keep'); await ui.tell(line('common.keep')); return out; }
        fix = a === 'fix';
      }
      // D 기분 4칸 (새 한마디일 때만. 고칠 때는 그 줄 기분 그대로)
      let mood = null;
      if (!fix && ctx.moods && ctx.moods.length) {
        const m = await ui.ask(line('mood.ask'), ctx.moods.map((x) => ({ id: x.id, label: x.label, desc: x.desc, icon: x.icon || null })), { cols: 2, kind: 'mood' });
        if (m == null) return cancel();
        const pick = ctx.moods.find((x) => x.id === m); mood = pick.label; out.mood = mood; step('mood:' + mood);
        await ui.tell(line('mood.after.' + pick.id));
        const w = await ui.ask(line('mood.more'), [{ id: 'write', label: line('mood.btn.write') }, { id: 'skip', label: line('mood.btn.skip') }], { cols: 2 });
        if (w == null) return cancel();
        if (w === 'skip') {
          step('mood-only');
          if (!(await save((lm) => ctx.api.setNote('', lm, false, mood)))) return out;
          out.noteSaved = true;
          return done('mood.end');
        }
      }
      const v = await ui.input(line('note.ask'), { placeholder: D.ui.notePlaceholder, value: fix ? lastNote.text : '', validate: checkText(true) });
      if (v == null || (v && v.skip)) return cancel();
      const text = LL.clean(v); step((fix ? 'fix:' : 'note:') + text);
      if (!(await save((lm) => (mood ? ctx.api.setNote(text, lm, fix, mood) : ctx.api.setNote(text, lm, fix))))) return out;
      out.noteSaved = true;
      return done('note.saved');
    }

    // ---- 그냥 같이 있기: 새 3줄 + lines.js click 12줄 중 무작위 ----
    step('idle');
    await ui.tell(line('idle', null, ctx.clickLines || []));
    return out;
  }

  const Flow = { run, menuOrder, firstOf, FIRST, ALT, MENU, MEAL_IDS, shorten, fill };
  root.PHDialogFlow = Flow;
  if (typeof module !== 'undefined' && module.exports) module.exports = Flow;
})(typeof window !== 'undefined' ? window : globalThis);
