// 앱 UI 작은 그림 (무늬 편집연동화면 v01, 2026-10-04): 자물쇠·계단 화살표·이름표 꼬리.
// 원본 = 무늬 에셋 JSON(assets/20261004_pixel-house_icon_lock·icon_arrow·tag_tail_v01, js/assets_data.js에 묶임). 1배(1칸 = 1 CSS px)
// 색을 바꾼 판을 캔버스로 그려 PNG data URL을 CSS 변수에 넣음 (--ic-*). CSS는 background-image: var(--ic-lock) 처럼 씀
//   자물쇠: 기본 k=#86593A / 고른 칸 위 k=#F7F0E1 (무늬 노트)
//   화살표: 위 / 아래(위아래 뒤집기) / 꺼짐 k=#CDBFA8
//   꼬리: 기본 / 고른 이름표 K=#86593A
// 살림 창 보기 토글·그리드 (무늬 인벤토리그리드 v01 목업 PX 문자 맵, 2026-10-05 비트): 에셋 JSON 대신 이 파일의 작은 문자 맵(1 = 칠함)
//   목록·칸 토글 8x8: 안 고름 #86593A(--dlg-sub) / 고름 #F7F0E1(--dlg-name-tx). 별 7x7 #C79A3E(--star). 플러스 7x7 #86593A
(function (root) {
  'use strict';
  function url(name, swap, flip) {
    const a = root.PH_ASSETS && root.PH_ASSETS[name]; if (!a || !a.frames || !a.frames[0]) return null;
    const f = a.frames[0], h = f.length, w = f[0].length, c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'), pal = Object.assign({}, a.palette, swap || {});
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const col = pal[f[flip ? h - 1 - y : y][x]]; if (!col) continue;
      ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1);
    }
    return c.toDataURL('image/png');
  }
  const PX = {
    view_list: ['11.11111', '11.11111', '........', '11.11111', '11.11111', '........', '11.11111', '11.11111'],
    view_grid: ['111..111', '111..111', '111..111', '........', '........', '111..111', '111..111', '111..111'],
    star_s: ['...1...', '..111..', '1111111', '.11111.', '..111..', '.11.11.', '.1...1.'],
    plus: ['...1...', '...1...', '...1...', '1111111', '...1...', '...1...', '...1...'],
  };
  function pxUrl(name, color) {
    const m = PX[name]; if (!m || typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = m[0].length; c.height = m.length;
    const ctx = c.getContext('2d'); ctx.fillStyle = color;
    m.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '1') ctx.fillRect(x, y, 1, 1); });
    return c.toDataURL('image/png');
  }
  const PX_ICONS = {
    'ic-view-list': ['view_list', '#86593A'], 'ic-view-list-on': ['view_list', '#F7F0E1'],
    'ic-view-grid': ['view_grid', '#86593A'], 'ic-view-grid-on': ['view_grid', '#F7F0E1'],
    'ic-star-s': ['star_s', '#C79A3E'], 'ic-plus': ['plus', '#86593A'],
  };
  const ICONS = {
    'ic-lock': ['icon_lock'], 'ic-lock-sel': ['icon_lock', { k: '#F7F0E1' }],
    'ic-up': ['icon_arrow'], 'ic-down': ['icon_arrow', null, true],
    'ic-up-off': ['icon_arrow', { k: '#CDBFA8' }], 'ic-down-off': ['icon_arrow', { k: '#CDBFA8' }, true],
    'ic-tail': ['tag_tail'], 'ic-tail-sel': ['tag_tail', { K: '#86593A' }],
  };
  function apply() {
    const st = document.documentElement.style, done = {};
    Object.entries(ICONS).forEach(([k, [n, sw, fl]]) => { const u = url(n, sw, fl); if (u) { st.setProperty('--' + k, `url("${u}")`); done[k] = true; } });
    Object.entries(PX_ICONS).forEach(([k, [n, col]]) => { const u = pxUrl(n, col); if (u) { st.setProperty('--' + k, `url("${u}")`); done[k] = true; } });
    return done;
  }
  root.PHUiIcons = { apply, url, pxUrl, PX, ICONS, PX_ICONS, made: apply() };
})(window);
