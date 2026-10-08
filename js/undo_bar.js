// 되돌리기 띠 공통 규칙 (2026-10-08 제작자, 로드맵 3-1단계 피드백 3)
//   띠("… 지웠어요 [되돌리기]")가 처음 보인 뒤 settings.UNDO_MS(5초)가 지나면 저절로 사라짐. 창 닫기·탭 옮기기 때도 사라짐
//   쓰는 곳: 버킷(bucket_memo) · 습관 편집(habit_edit_ui) · 약속(meeting_edit_ui) · 기록 영화·연극(record_list) · 식사·대변 일지(logs_view) · 공부(study_gantt) · 살림(inventory)
//   각 모듈은 띠를 그릴 때 sync(key, 지금 되돌리기 값, 지우기 함수)를 부름. 같은 값이면 시계를 다시 맞추지 않음, null이면 시계를 멈춤
//   지우기 함수 = 그 모듈 상태를 비우고 띠만 떼어 냄 (화면 전체를 다시 그리지 않아 적던 글·포커스가 그대로)
(function (root) {
  'use strict';
  const live = new Map(); // key -> { obj, timer, clear }
  const ms = () => { const v = root.PH_SETTINGS && root.PH_SETTINGS.UNDO_MS; return typeof v === 'number' && v > 0 ? v : 5000; };
  function drop(key) { const x = live.get(key); if (x) { clearTimeout(x.timer); live.delete(key); } }
  function fire(key) { const x = live.get(key); if (!x) return; drop(key); try { x.clear(); } catch (e) { console.warn('undo bar', key, e); } }
  function sync(key, obj, clear) {
    if (!obj) { drop(key); return; }
    const x = live.get(key);
    if (x && x.obj === obj) { x.clear = clear; return; }
    drop(key);
    live.set(key, { obj, clear, timer: setTimeout(() => fire(key), ms()) });
  }
  // 창 닫기·탭 옮기기: 떠 있는 띠 모두 (또는 keys만) 바로 지움
  function clearAll(keys) { [...live.keys()].filter((k) => !keys || keys.includes(k)).forEach(fire); }
  const removeEls = (sel) => document.querySelectorAll(sel).forEach((e) => e.remove());
  root.PHUndoBar = { sync, drop, fire, clearAll, removeEls, ms, keys: () => [...live.keys()] };
})(window);
