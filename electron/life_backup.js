// 생활 기록 쓰기 직전 사본 (메인 프로세스). 2026-10-04 main.js에서 떼어 냄: 두부 펫(~/dev/dubu-pet)도 같은 함수를 씀
//   사본 = <dir()>/<날짜시각_밀리초>_<파일이름>, 같은 파일 사본은 최근 keep개만 남김 (이 함수가 만든 이름만 정리)
//   dir은 함수: 부를 때 정함 (픽셀 하우스는 시험 때 userData를 나중에 바꿈)
// 쓰는 법: const backup = require('./life_backup.js')({ dir: () => path.join(app.getPath('userData'), 'backup'), file, keep: 10 })
//          backup(지금 글) -> 사본 폴더 경로
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function makeBackup(o) {
  const keep = Number.isInteger(o.keep) && o.keep > 0 ? o.keep : 10;
  const base = path.basename(o.file);
  return function backup(text) {
    const dir = o.dir();
    fs.mkdirSync(dir, { recursive: true });
    const n = new Date(), p2 = (x) => String(x).padStart(2, '0');
    const stamp = `${n.getFullYear()}${p2(n.getMonth() + 1)}${p2(n.getDate())}_${p2(n.getHours())}${p2(n.getMinutes())}${p2(n.getSeconds())}_${String(n.getMilliseconds()).padStart(3, '0')}`;
    fs.writeFileSync(path.join(dir, stamp + '_' + base), text);
    const old = fs.readdirSync(dir).filter((f) => f.endsWith('_' + base)).sort();
    old.slice(0, Math.max(0, old.length - keep)).forEach((f) => fs.unlinkSync(path.join(dir, f))); // 앱이 만든 사본만 정리
    return dir;
  };
};
