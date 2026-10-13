// 바탕화면 펫 말풍선 메뉴 = 하우스 두부 대화창과 같은 흐름(js/dialog_flow.js run)을 펫 말풍선으로 보여 주는 다리. Electron 없이도 돌아감 (Node 시험)
//   2026-10-13 두부 펫 lib/talk.js를 하우스 앱 안으로 옮김 (바뀐 곳: house = electron/pet_house.js, 지금 시각 = house.now, 식사 만족도·양 글 = extra)
// 흐름은 메인 프로세스에서 돈다. 흐름이 묻는 것(ui.ask / time / input / tell)을 화면(pet/pet.js)에 보내고, 화면이 고른 값을 answer()로 받는다.
//   화면은 "몇 번째 질문(id)에 무엇을 골랐는지"만 보냄. 값 검사(시각 형식·빈 글·100자)는 여기서 흐름이 준 validate로 다시 함
//   보내는 것: pet:dlgOpen { footer } / pet:dlg { id, mode, text, ... } / pet:dlgError { id, text } / pet:dlgEnd
// 펫에만 있는 것
//   - 식사: 메뉴를 적은 뒤 만족도(하트 1~5)·먹은 양(25·50·75·100%)을 묻고 각각 "넘어가기" 가능 (house.js makeApi mealExtra). Esc·두부 누름 = 만족도·양 없이 메뉴만 저장
//   - tell(두부 한 줄): 누르면 다음, 안 누르면 글 길이만큼 기다렸다가 다음 (말주머니와 같은 시간)
//   - cancel(quiet): 두부를 다시 누름(quiet=false: 흐름이 "필요하면 또 불러 주세요" 한 줄) / 끌기·숨기기(quiet=true: 아무 말 없이 닫음)
'use strict';

function tellMs(text) { return Math.min(8000, Math.max(3500, 2500 + Array.from(String(text || '')).length * 110)); }

// o: { house(electron/pet_house.js create 결과), send(ch, data), clickLines() -> [대사], extra({ rating, amount } 펫 대사), onLine(text, mode), onWrite(res), tellMs? }
function create(o) {
  const H = o.house, LL = H.LL, D = H.lines;
  const X = o.extra || {};
  const st = { open: false, id: 0, wait: null, quiet: false, lastPick: {}, last: null, log: [], footer: false };
  const log = (x) => { st.log.push(x); if (st.log.length > 200) st.log.shift(); };

  function step(mode, text, data, extra) {
    return new Promise((resolve) => {
      const id = ++st.id;
      st.wait = { id, mode, resolve, extra: extra || {}, text };
      log(mode + ':' + text);
      if (st.quiet) { done(null); return; }
      o.send('pet:dlg', Object.assign({ id, mode, text }, data));
      if (o.onLine) o.onLine(text, mode);
      if (mode === 'tell') st.wait.timer = setTimeout(() => { if (st.wait && st.wait.id === id) done(true); }, (o.tellMs || tellMs)(text));
    });
  }
  const str = (v) => (v == null ? '' : String(v));
  // 말풍선 그림 이름 (무늬 말풍선메뉴 디자인 v01): 첫 메뉴 = 주제별 16px 아이콘, 기분 = 하우스 기분 얼굴. 화면은 이름으로 pet:init ui 그림을 찾음
  const TOPICS = ['sleep', 'meal', 'water', 'idle']; // 2026-10-13 오늘 한마디(note) 뺌
  const moodIcon = {}; (H.moods || []).forEach((m) => { if (m.sprite) moodIcon[m.id] = m.sprite; });
  function iconOf(kind, id) { return kind === 'mood' ? moodIcon[id] || null : kind === 'menu' ? id : null; }
  const ui = {
    ask: (text, choices, opt) => {
      let kind = (opt && opt.kind) || '';
      if (!kind && choices.length && choices.every((c) => TOPICS.includes(String(c.id)))) kind = 'menu'; // 첫 메뉴 (흐름은 kind 없이 부름)
      return step('ask', text, {
        choices: choices.map((c) => ({ id: str(c.id), label: str(c.label), desc: c.desc ? str(c.desc) : null, icon: iconOf(kind, String(c.id)) })), cols: (opt && opt.cols) || 2, kind,
      }, { ids: choices.map((c) => c.id) });
    },
    time: (text, opt) => step('time', text, {
      row: opt.row, hours: (opt.hours || []).slice(0, 8), picked: opt.picked && opt.picked.bed ? { bed: LL.fmtTime(opt.picked.bed) } : {},
      dot: opt.dots && opt.dots[opt.row] ? Number(String(opt.dots[opt.row]).slice(0, 2)) : null,
      placeholder: str(opt.placeholder), submit: D.ui.submit, bedRow: D.ui.bedRow, wakeRow: D.ui.wakeRow,
    }, { validate: opt.validate, row: opt.row }),
    input: (text, opt) => step('input', text, {
      placeholder: str(opt && opt.placeholder), value: str(opt && opt.value), skip: opt && opt.skip ? str(opt.skip) : null, submit: D.ui.submit,
      max: (H.settings.DIALOG && H.settings.DIALOG.MAX_LEN) || LL.MAX_LEN,
    }, { validate: opt && opt.validate, skip: !!(opt && opt.skip) }),
    // 물 저장 뒤 한 줄이면 컵 줄(오늘 n / 6잔)을 같이 (무늬 디자인 v01 8장 "저장 뒤 대답", 제작자 2026-10-04 넣기로)
    tell: (text) => { const cups = st.cups; st.cups = null; return step('tell', text, cups ? { cups } : {}, {}); },
  };

  function done(v) {
    const w = st.wait; if (!w) return false;
    st.wait = null; clearTimeout(w.timer); log('answer:' + JSON.stringify(v));
    w.resolve(v); return true;
  }
  // 화면이 보낸 답: { id, value }. value null = Esc(닫기)
  function answer(a) {
    const w = st.wait; if (!w || !a || a.id !== w.id) return false;
    const v = a.value;
    if (v == null) return done(null);
    if (w.mode === 'tell') return done(true);
    if (w.mode === 'ask') { const hit = w.extra.ids.find((x) => String(x) === String(v)); return hit === undefined ? false : done(hit); }
    const bad = (t) => { const err = w.extra.validate ? w.extra.validate(t) : null; if (err) { log('error:' + err); o.send('pet:dlgError', { id: w.id, text: err }); } return err; };
    if (w.mode === 'time') {
      if (v && typeof v.pick === 'string') return /^([01]\d|2[0-3]):[0-5]\d$/.test(v.pick) ? done({ time: v.pick }) : false;
      const t = v && typeof v.text === 'string' ? v.text.slice(0, 200) : null; if (t == null) return false;
      if (bad(t)) return false;
      const ts = LL.parseTimes(t); if (!ts.length) return false;
      return done(ts.length >= 2 && w.extra.row === 'bed' ? { times: ts.slice(0, 2) } : { time: ts[0] });
    }
    if (w.mode === 'input') {
      if (v && v.skip === true) return w.extra.skip ? done({ skip: true }) : false;
      const t = v && typeof v.text === 'string' ? v.text.slice(0, 1000) : null; if (t == null) return false;
      if (bad(t)) return false;
      return done(t);
    }
    return false;
  }
  // 식사 만족도·양 (펫에만. 문장은 js/data/lines.js pet.rating·amount, 부기 다듬음 2026-10-04. 아래 기본값은 그 줄이 없을 때만, 같은 글)
  async function mealExtra() {
    const skip = (D.btn && D.btn.skip) || '넘어가기';
    const hearts = [1, 2, 3, 4, 5].map((k) => ({ id: k, label: '♥'.repeat(k) }));
    const r = await ui.ask(X.rating || '마음에 든 만큼 하트를 채워 주세요냥~', hearts.concat([{ id: 'skip', label: skip }]), { cols: 3, kind: 'rating' });
    if (r == null) return null;
    const a = await ui.ask(X.amount || '얼마나 드셨어요냥~?', [25, 50, 75, 100].map((v) => ({ id: v, label: v + '%' })).concat([{ id: 'skip', label: skip }]), { cols: 3, kind: 'amount' });
    return { rating: r === 'skip' ? null : r, amount: a == null || a === 'skip' ? null : a };
  }

  async function open(opt) {
    if (st.open) return null;
    st.open = true; st.quiet = false; st.footer = !!(opt && opt.footer);
    const data = H.read();
    const ctx = {
      lines: D, clickLines: (o.clickLines && o.clickLines()) || [], settings: H.settings, now: H.now || Date.now, lastPick: st.lastPick,
      data, api: null, off: data ? H.offTopics(data.text) : [], moods: H.moods, more: H.moreLines,
      onWrite: (res) => { st.lastWrite = { ok: res.ok, conflict: !!res.conflict, reapplied: !!res.reapplied, date: res.date, extra: res.extra || null }; if (o.onWrite) o.onWrite(res); },
    };
    ctx.api = H.makeApi(() => ctx.data, { mealExtra, log });
    // 물 +1이 저장되면 새 글의 오늘 잔 수를 기억 -> 바로 다음 한 줄(water.up/full)에 컵 줄로. 흐름은 그대로 (저장 결과만 엿봄)
    const setWater = ctx.api.setWater;
    ctx.api.setWater = async (value, lm) => {
      const res = await setWater(value, lm);
      if (res && res.ok && !res.conflict && !res.off && res.text != null) { const w = H.waterOf(res.text); if (w && w.of > 0) st.cups = { n: Math.min(w.n, w.of), of: Math.min(w.of, 12) }; }
      return res;
    };
    st.cups = null;
    st.ctx = ctx;
    o.send('pet:dlgOpen', { footer: st.footer });
    let out;
    try { out = await H.Flow.run(ui, ctx); } catch (e) { out = { error: String(e && e.message || e) }; log('flow error ' + out.error); }
    if (st.wait) done(null);
    st.open = false; st.ctx = null; st.last = out;
    o.send('pet:dlgEnd', {});
    return out;
  }
  function cancel(quiet) {
    if (!st.open) return false;
    if (quiet) st.quiet = true;
    if (st.wait) done(null);
    return true;
  }
  function state() {
    return { open: st.open, wait: st.wait ? { id: st.wait.id, mode: st.wait.mode, text: st.wait.text } : null, off: st.ctx ? st.ctx.off : null,
      last: st.last, lastWrite: st.lastWrite || null, log: st.log.slice(-40), footer: st.footer };
  }
  return { open, answer, cancel, state, isOpen: () => st.open, current: () => (st.wait ? { id: st.wait.id, mode: st.wait.mode } : null), tellMs };
}

module.exports = { create, tellMs };
