// 다른 앱이 쓴 생활 기록 다시 읽기 (2026-10-04 비트). 두부 펫(~/dev/dubu-pet)도 같은 생활 기록 파일에 쓴다.
// 메인(electron/main.js watchLife)이 "파일 시각이 바뀜" 또는 "창이 앞으로 옴"을 알려 주면:
//   - 화면이 가진 글과 시각이 같으면 아무것도 안 함 (이 앱이 방금 쓴 것)
//   - 열린 창(대화창·물·일지·책꽂이·살림·옷장·메모지·가구 연결 목록 = role=dialog)·습관 편집 폼·약속 적기 칸·양 적기 칸·입력 중이면 기다렸다가 끝난 뒤 한 번
//     (그 사이 저장하면 메인이 시각 차이로 막고(conflict) 새 글을 돌려주므로 기록이 사라지지 않음)
//   - 아니면 다시 읽기: 보고 있는 탭이면 그 탭을 다시 그림(Life.render), 집이면 글만 새로(Life.load, 화분·물컵은 Life.data를 보고 바뀜)
// 읽기만 함. 쓰기 없음
(function (root) {
  'use strict';
  const SY = { count: 0, waiting: false, last: null, log: [], hold: false };
  const POLL_MS = 1500;

  function shown(el) { return !!el && !el.hidden && !el.closest('[hidden]') && el.getClientRects().length > 0; }
  // 지금 다시 그리면 안 되는 때
  function busy() {
    const d = document;
    if (Array.from(d.querySelectorAll('[role=dialog]')).some(shown)) return 'dialog';
    if (root.PHDialog && root.PHDialog.isOpen && root.PHDialog.isOpen()) return 'dubu';
    if (root.PHFurnishUI && root.PHFurnishUI.on) return 'furnish';
    const he = root.PHHabitEditUI; if (he && he.St && (he.St.form || he.St.busy)) return 'habitEdit';
    const me = root.PHMeetingEditUI; if (me && me.St && (me.St.busy || (me.St.form && shown(d.querySelector('#life-meetings .mte-form'))))) return 'meetingEdit'; // 약속 적기 칸이 보일 때 (2026-10-07, 다른 탭으로 가면 기다리지 않음)
    const L = root.PHLife; if (L && L.ui && (L.ui.amount || L.ui.ask)) return 'amount';
    const a = d.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return 'typing';
    return null;
  }
  async function refresh(info) {
    const Life = root.PHLife; if (!Life || !Life.load) return;
    if (info && Life.lastModified != null && Math.abs(info.lastModified - Life.lastModified) <= 1) return; // 이미 같은 글
    const why = SY.hold ? 'hold' : busy(); // hold = 시험이 잠깐 멈춤 (tools/shots.js 충돌 확인, 2026-10-04). 앱에서는 안 씀
    if (why) { SY.waiting = true; SY.log.push('wait:' + why); return; }
    SY.waiting = false;
    const App = root.PHApp, tab = App && App.tab;
    const el = tab && tab !== 'home' ? document.getElementById('life-' + tab) : null;
    if (el) await Life.render(tab, el);
    else { await Life.load(); if (Life.onLoad) Life.onLoad(Life.data); }
    SY.count++; SY.last = { at: Date.now(), why: info ? info.why : 'wait', lastModified: Life.lastModified, tab: tab || null };
    SY.log.push('read:' + (info ? info.why : 'wait'));
  }
  // 기다리는 중이면 POLL_MS마다 다시 봄
  setInterval(() => { if (SY.waiting && !SY.hold && !busy()) refresh(null); }, POLL_MS);
  if (root.PHDesktop && root.PHDesktop.onLifeChanged) root.PHDesktop.onLifeChanged((info) => { refresh(info); });

  SY.busy = busy; SY.refresh = refresh;
  root.PHLifeSync = SY;
})(window);
