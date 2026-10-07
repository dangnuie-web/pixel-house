// 생활 습관 탭 "살림" 카드 (2026-10-03 제작자: 안전장치와 기록 카드 사이). life.js는 고치지 않고 Life.renderHooks로 안전장치 카드 바로 뒤에 끼움
//   청소 습관: ## 생활습관 표 종류 "살림" 줄 (없으면 기본 5개를 화면에만, 처음 체크할 때 표에 더함). 주 N회 = "이번 주 n/N" 칸(요가·러닝과 같음), 매일 = 오늘 한 칸
//     누르면 오늘 했음/안 했음 뒤집기 (습관 기록 오늘 줄에 이름을 더하거나 뺌, life_check.js toggleWeekly와 같은 규칙). 말: chore.done.<키> / 칸이 다 차면 chore.full / 빼면 ui.weekly.undo
//   사야 할 것: ## 사야 할 것 표. "샀어요" 체크(인벤토리에 있으면 +1, 없으면 줄만 빠짐), "+ 적기"(직접), 자동으로 들어온 것은 "필수" 칩(수첩과 같은 .memo-need, 2026-10-03 제작자 결정)
//   저장 = PHHouse.save (메인 ph:choreToggle / ph:shopOp). 말 = 사이드바 두부(PHApp.sideSay)
(function (root) {
  'use strict';
  const Life = root.PHLife, H = root.PH_HOUSEHOLD, HU = root.PHHouse, HH = root.PHHousehold, esc = HU.esc;
  const P = () => root.PH_HOUSEHOLD_PLAIN || {};
  const st = { log: [] };

  function html(d) {
    const text = d.lines.join('\n'), v = HH.view(text, d), chores = HH.choreState(text, Life.today(), d, v), rw = HU.canWrite();
    let h = `<section class="card kind k-house" data-card="살림"><h3>${esc(P().cardTitle || '살림')}</h3>`;
    h += `<p class="kind-desc">청소 습관은 눌러서 체크 · 오늘 줄에 적혀요. 사야 할 것은 냉장고 메모지와 같아요</p>`;
    h += `<h4 class="hc-h">${esc(P().choreTitle || '청소 습관')}</h4><ul class="hc-chores">`;
    chores.forEach((c) => {
      const on = Math.min(c.count, c.of);
      let cells = '';
      for (let i = 1; i <= c.of; i++) {
        // 2026-10-04: 매일 n회(slots) = 오늘 n칸(k번째 = k회), 월 n회 = 이번 달 (js/habit_cycle.js)
        const lab = c.slots ? `${c.name} 오늘 ${i}회${i === on ? ' (다시 누르면 한 칸 줄어요)' : ''}` : `${c.name} ${c.daily ? '오늘' : (c.per === 'month' ? '이번 달 ' : '이번 주 ') + i + '번째'} 칸${c.todayDone ? ' (누르면 오늘 기록을 빼요)' : ' (누르면 오늘 했다고 적어요)'}`;
        cells += rw ? `<button type="button" class="wk hc-wk ${c.slots ? 'dk' : ''} ${i <= on ? 'on' : ''} ${!c.slots && c.todayDone && i === on ? 'today' : ''}" data-k="${i}" aria-pressed="${i <= on}" aria-label="${esc(lab)}" data-focus="hc:${esc(c.name)}:${i}"></button>` : `<i class="wk ${i <= on ? 'on' : ''}"></i>`;
      }
      const note = root.PHHabitCycle ? root.PHHabitCycle.note({ per: c.per, n: c.of, count: c.count, todayDone: c.todayDone, slots: c.slots }) : (c.daily ? (c.todayDone ? '오늘 했어요' : '오늘') : `이번 주 ${c.count}/${c.of}`);
      h += `<li data-chore="${esc(c.name)}" data-count="${c.count}" data-of="${c.of}" data-today="${c.todayDone}" data-per="${c.per || ''}"${c.slots ? ' data-slots="1"' : ''}><b>${esc(c.name)}</b><span class="cyc">${esc(c.cycle)}</span>` +
        `<div class="week-row hc-row ${rw ? 'rw' : ''}"><span class="wk-cells" role="group" aria-label="${esc(c.name)} 칸">${cells}</span><span class="slot-note">${esc(note)}</span></div></li>`;
    });
    h += `</ul><h4 class="hc-h">${esc(P().shopTitle || '사야 할 것')} <small>${v.shop.length}</small></h4><ul class="hc-shop">`;
    h += v.shop.map((r) => `<li class="hc-buy ${r.auto ? 'auto' : ''}" data-name="${esc(r.name)}">${rw ? `<button type="button" class="hc-chk" role="checkbox" aria-checked="false" aria-label="${esc(r.name)} ${esc(P().bought || '샀어요')}" data-focus="hcb:${esc(r.name)}"></button>` : ''}<span class="hc-name">${esc(r.name)}</span>${r.auto ? `<small class="memo-need hc-need">${esc(P().needTag || '필수')}</small>` : ''}<span class="hc-date">${esc(r.date)}</span></li>`).join('');
    h += '</ul>' + (v.shop.length ? '' : '<p class="slot-note hc-empty">비어 있어요</p>');
    if (rw) h += `<form class="hc-add"><input class="hc-in" type="text" maxlength="${H.MAX_NAME}" placeholder="사야 할 것" aria-label="사야 할 것 이름" data-focus="hc-in"><button type="submit" class="hc-add-b">${esc(P().shopAdd || '+ 적기')}</button></form>`;
    return h + '</section>';
  }
  function say(text) { if (!text) return; st.log.push(text); if (root.PHApp && root.PHApp.sideSay) root.PHApp.sideSay(text); }
  // 기본 5개 밖(편집으로 더한) 살림 습관이 한 칸 찼을 때: MVP 대사 ui.weekly.doneAny (2026-10-04, 전에는 chore.full로 가서 1/2인데 "다 채우셨어요"라고 했음)
  function anyDone(habit) { const u = root.PH_LINES && root.PH_LINES.ui && root.PH_LINES.ui.weekly && root.PH_LINES.ui.weekly.doneAny; const t = Array.isArray(u) ? u[Math.floor(Math.random() * u.length)] : u; return t ? Life.fill(t, { habit }) : HU.line('chore.full'); }
  function weeklyUndo(habit) { const u = root.PH_LINES && root.PH_LINES.ui && root.PH_LINES.ui.weekly && root.PH_LINES.ui.weekly.undo; const t = Array.isArray(u) ? u[Math.floor(Math.random() * u.length)] : u; return Life.fill(t, { habit }); }

  async function after(tab, el, res, focus) {
    if (res && res.conflict) { await Life.render(tab, el); say(HU.problemLine(res)); return true; }
    Life.paint(tab, el, focus);
    const bad = HU.problemLine(res); if (bad) { say(bad); return true; }
    return false;
  }
  async function onChore(tab, el, name, focus) {
    const res = await HU.save('chore', name); if (res.busy) return res;
    if (await after(tab, el, res, focus)) return res;
    const c = H.CHORES.find((x) => x.name === name);
    st.last = { name, done: res.done, count: res.count, of: res.of };
    const monthFull = () => Life.fill((((root.PH_HABIT_EDIT_LINES || {}).month || {}).full || [])[0] || '', { name });
    say(!res.done ? weeklyUndo(name) : res.per === 'month' && res.count >= res.of ? monthFull() : !res.daily && res.count >= res.of ? HU.line('chore.full') : c ? HU.line('chore.done.' + c.key) : anyDone(name));
    return res;
  }
  // 매일 n회 살림 (2026-10-04): 오늘 k/n. 저장 = 메인 ph:habitSetDaily (습관 편집과 같은 함수)
  let dBusy = false;
  async function onChoreDaily(tab, el, name, value, prev, focus) {
    if (dBusy || !root.PHHabitDesktop) return null;
    dBusy = true;
    let res = null;
    try {
      res = await root.PHHabitDesktop.setDaily(name, value, Life.lastModified);
      Life.data = root.PHLifeMd.parse(res.text); Life.lastModified = res.lastModified; Life.readAt = Date.now();
    } catch (e) { dBusy = false; Life.paint(tab, el, focus); say(HU.line('tmp.fail')); return null; }
    dBusy = false;
    if (await after(tab, el, res, focus)) return res;
    const c = H.CHORES.find((x) => x.name === name);
    st.last = { name, done: value > 0, count: res.value, of: res.of };
    say(value < prev ? weeklyUndo(name) : res.value >= res.of ? HU.line('chore.full') : c ? HU.line('chore.done.' + c.key) : anyDone(name));
    return res;
  }
  async function onBought(tab, el, name) {
    const res = await HU.save('shop', { type: 'bought', name }); if (res.busy) return res;
    if (await after(tab, el, res, 'hc-in')) return res;
    say(res.item ? HU.line('shop.bought', { item: name }) : HU.line('shop.done', { item: name }));
    return res;
  }
  async function onAdd(tab, el, raw) {
    if (!raw.trim()) return null;
    if (/[|｜]/.test(raw)) { say(HU.line('tmp.badName')); return null; }
    const res = await HU.save('shop', { type: 'add', name: raw.replace(/\s+/g, ' ').trim() }); if (res.busy) return res;
    if (await after(tab, el, res, 'hc-in')) return res;
    say(HU.line('shop.add'));
    return res;
  }

  // life.js가 탭을 그린 뒤 부름: 생활 습관 탭이면 안전장치 카드 뒤(없으면 기록 카드 앞, 그것도 없으면 카드 끝)에 끼움
  function mount(tab, el, d) {
    if (tab !== 'habits' || !d || !d.habits) return;
    const cards = el.querySelector('.cards'); if (!cards) return;
    const box = document.createElement('div'); box.innerHTML = html(d);
    const card = box.firstElementChild, safe = cards.querySelector('[data-card="안전장치"]'), log = cards.querySelector('[data-card="기록"]');
    if (safe) safe.after(card); else if (log) log.before(card); else cards.appendChild(card);
    card.querySelectorAll('.hc-wk').forEach((b) => b.addEventListener('click', () => {
      const li = b.closest('li');
      if (li.dataset.slots) { const k = Number(b.dataset.k), cur = Number(li.dataset.count); onChoreDaily(tab, el, li.dataset.chore, k === cur ? k - 1 : k, cur, b.dataset.focus); }
      else onChore(tab, el, li.dataset.chore, b.dataset.focus);
    }));
    card.querySelectorAll('.hc-chk').forEach((b) => b.addEventListener('click', () => { b.classList.add('on'); b.setAttribute('aria-checked', 'true'); onBought(tab, el, b.closest('li').dataset.name); }));
    const f = card.querySelector('.hc-add');
    if (f) {
      f.addEventListener('submit', (e) => { e.preventDefault(); onAdd(tab, el, f.querySelector('.hc-in').value); });
      f.addEventListener('keydown', (e) => { if (e.isComposing || e.keyCode === 229) return; if (e.key === 'Enter') { e.preventDefault(); onAdd(tab, el, f.querySelector('.hc-in').value); } });
    }
  }
  (Life.renderHooks = Life.renderHooks || []).push(mount);
  // 집에서(인벤토리·메모지) 바뀌면 생활 습관 탭이 열려 있을 때 다시 그림
  HU.on(() => { const el = document.getElementById('life-habits'); if (el && !el.closest('.screen').hidden && Life.data) Life.paint('habits', el); });
  root.PHHouseCard = { html, mount, state: () => ({ log: st.log.slice(), last: st.last || null }) };
})(window);
