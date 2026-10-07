// 살림 화면 공용 (인벤토리 창·냉장고 메모지·생활 습관 살림 카드가 같이 씀). 계산은 js/household.js, 저장은 메인(PHHouseDesktop)
//   읽기 = PHLife.data (생활 기록 파일 한 개, 다른 탭과 같은 읽기). 쓰기 뒤 새 글로 PHLife.data를 바꾸고, 듣는 화면(on)에 알림
//   충돌(앱이 읽은 뒤 파일이 바뀜) = 메인이 안 쓰고 새 글을 줌 -> 다시 그리고 tmp.conflict 한 줄
(function (root) {
  'use strict';
  const HH = root.PHHousehold, Md = root.PHLifeMd;
  const HL = () => root.PH_HOUSEHOLD_LINES || {};
  const H = () => root.PH_HOUSEHOLD;
  const listeners = [];
  const last = {};
  const S = { busy: false, log: [], lastWrite: null, lastError: null };

  const text = () => (root.PHLife && root.PHLife.data ? root.PHLife.data.lines.join('\n') : null);
  async function ensure() { if (root.PHLife && !root.PHLife.data) await root.PHLife.load(); return text(); }
  function view() { const t = text(); return t == null ? null : HH.view(t); }
  const canWrite = () => !!(root.PHHouseDesktop && root.PHHouseDesktop.inv);
  function today() { return Md.logDay(root.PHLife ? root.PHLife.now() : Date.now(), root.PH_SETTINGS.DAY_START_HOUR); }

  // 대사 한 줄 (배열이면 무작위, 바로 앞 줄 빼기). path = 'inv.plus' 같은 점 경로, vars = { item, color }
  function line(path, vars) {
    let v = path.split('.').reduce((o, k) => (o ? o[k] : null), HL());
    if (!Array.isArray(v)) v = v ? [v] : [];
    if (!v.length) return '';
    let c = v.length > 1 ? v.filter((t) => t !== last[path]) : v;
    const t = c[Math.floor(Math.random() * c.length)]; last[path] = t;
    return String(t).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
  }

  // 저장 한 번. kind = 'inv' | 'shop' | 'chore', arg = op 또는 습관 이름. -> 결과 (conflict·code·error면 화면이 tmp 줄)
  async function save(kind, arg) {
    if (S.busy) return { busy: true };
    if (!canWrite()) return { ok: false, browser: true };
    S.busy = true;
    try {
      await ensure();
      const Life = root.PHLife;
      const res = await root.PHHouseDesktop[kind](arg, Life.lastModified);
      Life.data = Md.parse(res.text); Life.lastModified = res.lastModified; Life.readAt = Date.now();
      if (!res.conflict && !res.code) S.lastWrite = Object.assign({ kind, arg }, res, { text: undefined });
      notify(kind);
      return res;
    } catch (e) { S.lastError = String(e && e.message || e); return { ok: false, error: S.lastError }; }
    finally { S.busy = false; }
  }
  // 저장 결과에 맞는 문제 줄 (없으면 '')
  function problemLine(res) {
    const T = HL().tmp || {};
    if (!res) return T.fail;
    if (res.browser) return (root.PH_LINES && root.PH_LINES.ui && root.PH_LINES.ui.browserOnly) || T.fail;
    if (res.conflict) return T.conflict;
    if (res.code === 'badName') return T.badName;
    if (res.code === 'dupName') return T.dupName;
    if (res.error || res.ok === false) return T.fail;
    return '';
  }
  function on(fn) { listeners.push(fn); }
  function notify(kind) { listeners.forEach((f) => { try { f(kind); } catch (e) { S.lastError = String(e.message || e); } }); }

  // 아이콘 (16x16 칸). 무늬 item_<키> 그림이 있으면 그것, 없으면 item_unknown, 그것도 없으면 화면 임시 그림(분류 색 상자 + 물음표)
  const TMP_COLORS = { food: '#E9C35C', living: '#AFD2E2', cosmetic: '#EAB8B6', misc: '#D4A06E' };
  const Q = ['................', '................', '....kkkkkkkk....', '...kccccccccK...', '..kccccccccccK..', '..kcccckkcccck..', '..kccckcckccck..', '..kccccccKccck..', '..kcccccKcccck..', '..kccccKccccck..', '..kccccccccccK..', '..kccccKccccck..', '..kccccccccccK..', '...kKKKKKKKKK...', '................', '................'];
  function drawIcon(cv, item) {
    const Art = root.PHArt, ctx = cv.getContext('2d'); cv.width = 16; cv.height = 16; ctx.clearRect(0, 0, 16, 16);
    const keys = [HH.iconKey(item.name), 'item_unknown'];
    const k = Art && keys.find((x) => Art.has(x));
    const kind = H().COLOR_ITEMS[item.name], sw = kind && k && H().SWAP.find((c) => c.name === (item.color || H().COLOR_DEFAULT[kind]));
    if (sw && k !== 'item_unknown') { // 화장품: 무늬 그림의 X(본색)·9(그늘)만 고른 색으로
      const a = Art.sprite(k), pal = Object.assign({}, Art.paletteOf(a), { X: sw.X, 9: sw[9] }), fr = a.frames[0];
      fr.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const c = pal[r[x]]; if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); } } });
      cv.dataset.icon = k; cv.dataset.color = sw.name; return k;
    }
    if (k) { const fc = Art.frameCanvas(k, 0); ctx.drawImage(fc, Math.floor((16 - fc.width) / 2), Math.floor((16 - fc.height) / 2)); cv.dataset.icon = k; return k; }
    const col = { k: '#29262F', K: '#5C3E2B', c: TMP_COLORS[item.cat] || '#DDCFB4' };
    Q.forEach((r, y) => { for (let x = 0; x < 16; x++) { const ch = r[x]; if (col[ch]) { ctx.fillStyle = col[ch]; ctx.fillRect(x, y, 1, 1); } } });
    cv.dataset.icon = 'tmp'; return 'tmp';
  }
  // 탭 아이콘 (무늬 tab_<id>, 없으면 안 그림)
  function drawTab(cv, id) { const Art = root.PHArt, k = 'tab_' + id; if (!Art || !Art.has(k)) return false; const ctx = cv.getContext('2d'); cv.width = 16; cv.height = 16; ctx.clearRect(0, 0, 16, 16); ctx.drawImage(Art.frameCanvas(k, 0), 0, 0); return true; }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  root.PHHouse = { S, text, view, ensure, canWrite, today, line, save, problemLine, on, notify, drawIcon, drawTab, esc };
})(window);
