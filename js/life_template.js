// 공용판 첫 실행: 빈 생활 기록 파일 만들기 (2026-10-08 로드맵 4단계 온보딩). 그림·파일 접근 없음: 글을 만들어 돌려준다.
//   메인(electron/profile_main.js)이 고른 기록 폴더에 이 글로 settings.LIFE_FILE 을 만든다 (이미 있으면 안 건드림 = 이어 쓰기).
//   습관 줄은 습관 편집(js/habit_edit.js addHabit)을 그대로 거쳐 더한다 = 앱 안 "생활 습관 > 편집"으로 더한 것과 같은 글자.
//   표 모양은 제작자 판 생활기록 v01 과 같음 (js/life_md.js 가 읽는 섹션: 생활습관·공부·습관 기록·약속·버킷리스트). 나머지 섹션은 처음 쓸 때 앱이 만든다
(function (root) {
  'use strict';
  const req = (n) => (typeof require !== 'undefined' ? require(n) : null);
  const HE = root.PHHabitEdit || req('./habit_edit.js');

  const HEAD = [
    '# 생활 기록 (Pixel House)',
    'Pixel House 앱이 이 파일을 읽고 씁니다. 이 컴퓨터에만 있고, 앱이 인터넷으로 보내지 않습니다. 표 모양을 지키면 직접 고쳐도 됩니다.',
    '',
    '## 생활습관',
    '종류: 목표 = 매일·매주 체크 / 안전장치 = 평소엔 체크 안 함, 주 1회 "잘 챙겼다" 한 번만. "놓쳤다"면 2주 동안 목표로 바뀜 / 기록 = 할 때만 양을 적음, 못 해도 실패 표시 없음',
    '| 습관 | 종류 | 기준 | 주기 |',
    '|---|---|---|---|',
    '',
    '## 공부',
    '| 공부 | 시작 | 끝 | 메모 |',
    '|---|---|---|---|',
    '',
    '## 습관 기록',
    '| 날짜 | 한 습관 |',
    '|---|---|',
    '',
    '## 약속',
    '| 날짜 | 시간 | 내용 |',
    '|---|---|---|',
    '',
    '## 버킷리스트',
    '',
  ].join('\n');

  // 온보딩 추천 습관 (on = 처음부터 골라 둠). 물 = 정수기·물컵과 이어진 이름(settings.WATER_HABIT), 요가 = 러그, 독서 = 책꽂이
  const RECOMMEND = [
    { id: 'water', name: '물', kind: '목표', target: '1.5L (250ml × 6칸)', cycle: '매일', on: true },
    { id: 'stretch', name: '스트레칭', kind: '목표', target: '10분', cycle: '매일' },
    { id: 'yoga', name: '요가', kind: '목표', target: '20분', cycle: '주 3회' },
    { id: 'walk', name: '산책', kind: '목표', target: '20분', cycle: '주 3회' },
    { id: 'vitamin', name: '영양제', kind: '안전장치', target: '먹기', cycle: '매일' },
    { id: 'reading', name: '독서', kind: '기록', target: '쪽', cycle: '-' },
  ];
  const MAX_HABITS = 20;

  // habits = [{ name, kind?, target?, cycle? }] (추천 id 또는 직접 적은 이름). -> { text, added: [이름], skipped: [{ name, code }] }
  //   직접 적은 습관 = 목표, 기준 없음, 매일. 이름 검사·같은 이름 막기는 습관 편집 규칙 그대로
  function build(habits) {
    let text = HEAD;
    const added = [], skipped = [];
    (Array.isArray(habits) ? habits : []).slice(0, MAX_HABITS).forEach((h) => {
      const rec = typeof h === 'string' ? RECOMMEND.find((r) => r.id === h) : null;
      const o = rec || (h && typeof h === 'object' ? { name: h.name, kind: h.kind || '목표', target: h.target == null ? '' : h.target, cycle: h.cycle || '매일' } : null);
      if (!o || typeof o.name !== 'string') { skipped.push({ name: String(h && h.name || h), code: 'badName' }); return; }
      try { const r = HE.addHabit(text, { kind: o.kind, name: o.name, target: o.target, cycle: o.cycle }); text = r.text; added.push(r.name); }
      catch (e) { skipped.push({ name: o.name, code: e.code || 'error' }); }
    });
    return { text, added, skipped };
  }

  const LT = { HEAD, RECOMMEND, MAX_HABITS, build };
  root.PHLifeTemplate = LT;
  if (typeof module !== 'undefined' && module.exports) module.exports = LT;
})(typeof window !== 'undefined' ? window : globalThis);
