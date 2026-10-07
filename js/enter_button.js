// "입장하기" 버튼 픽셀 글자 (제작자 시안 2026-10-05: ◀ 입장하기 ▶, 크림 글자 + 먹선 1u + 아래 그림자 1u, 바탕 없음)
//   글자는 한 칸씩 찍은 비트맵(12x12, 획 2u). 세 장(왼쪽 화살표·글자·오른쪽 화살표)으로 나눠 그려서 hover 때 화살표만 움직임.
//   전체 크기 77x15u = settings.js ENTER_BUTTON w·h
(function (root) {
  'use strict';
  const FILL = '#F4F3EF', LINE = '#29262F'; // 팔레트 C, A
  const H = 12; // 글자 줄 높이 (먹선·그림자 빼고)
  const ARROW = [
    '.....##',
    '....###',
    '...####',
    '..#####',
    '.######',
    '#######',
    '.######',
    '..#####',
    '...####',
    '....###',
    '.....##',
  ];
  const GLYPHS = {
    ip: [
      '..####....##',
      '.##..##...##',
      '##....##..##',
      '##....##..##',
      '.##..##...##',
      '..####....##',
      '..........##',
      '............',
      '.##......##.',
      '.##########.',
      '.##......##.',
      '.##########.',
    ],
    jang: [
      '######..##..',
      '######..##..',
      '..##....##..',
      '.####...####',
      '##..##..####',
      '#....#..##..',
      '........##..',
      '............',
      '...######...',
      '..##....##..',
      '..##....##..',
      '...######...',
    ],
    ha: [
      '........##..',
      '...##...##..',
      '.######.##..',
      '........##..',
      '..####..##..',
      '.##..##.####',
      '.##..##.####',
      '..####..##..',
      '........##..',
      '........##..',
      '........##..',
      '........##..',
    ],
    gi: [
      '######..##..',
      '######..##..',
      '....##..##..',
      '....##..##..',
      '...##...##..',
      '...##...##..',
      '..##....##..',
      '.##.....##..',
      '##......##..',
      '........##..',
      '........##..',
      '........##..',
    ],
  };
  const WORD = ['ip', 'jang', 'ha', 'gi'], LETTER_GAP = 1;

  // 줄 목록을 H줄 높이 가운데로 맞춘 칸 배열로
  function rows(lines) {
    const w = lines[0].length, top = Math.floor((H - lines.length) / 2), blank = '.'.repeat(w), out = [];
    for (let y = 0; y < H; y++) out.push(lines[y - top] || blank);
    return out;
  }
  function wordRows() {
    const gap = '.'.repeat(LETTER_GAP), gs = WORD.map((k) => rows(GLYPHS[k]));
    return gs[0].map((_, y) => gs.map((g) => g[y]).join(gap));
  }
  function mirror(lines) { return lines.map((r) => r.split('').reverse().join('')); }

  // 칸 배열 -> 캔버스 (먹선 1u 8방향 + 아래 그림자 1u)
  function draw(cv, lines) {
    const w = lines[0].length, W = w + 2, HH = H + 3;
    cv.width = W; cv.height = HH; cv.style.setProperty('--pw', W); cv.style.setProperty('--ph', HH);
    const x = cv.getContext('2d');
    x.clearRect(0, 0, W, HH);
    const on = (cx, cy) => lines[cy] && lines[cy][cx] === '#';
    x.fillStyle = LINE;
    for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < w; cx++) {
      if (!on(cx, cy)) continue;
      x.fillRect(cx, cy, 3, 3);        // 먹선 (주변 1u)
      x.fillRect(cx + 1, cy + 3, 1, 1); // 그림자 (아래 1u 더)
    }
    x.fillStyle = FILL;
    for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < w; cx++) if (on(cx, cy)) x.fillRect(cx + 1, cy + 1, 1, 1);
    return { w: W, h: HH };
  }

  function mount(btn) {
    if (!btn || btn.dataset.pixel) return;
    btn.dataset.pixel = '1';
    btn.setAttribute('aria-label', btn.textContent.trim() || '입장하기');
    btn.textContent = '';
    [['eb-l', rows(ARROW)], ['eb-word', wordRows()], ['eb-r', rows(mirror(ARROW))]].forEach(([cls, lines]) => {
      const cv = document.createElement('canvas');
      cv.className = 'eb ' + cls; cv.setAttribute('aria-hidden', 'true');
      draw(cv, lines);
      btn.appendChild(cv);
    });
  }

  // 전체 크기 (테스트·settings 확인용): 화살표 + 3 + 글자 + 3 + 화살표 (css gap 3u)
  function size() {
    const a = ARROW[0].length + 2, wd = wordRows()[0].length + 2;
    return { w: a + 3 + wd + 3 + a, h: H + 3 };
  }

  root.PHEnterButton = { mount, size };
})(typeof window !== 'undefined' ? window : globalThis);
