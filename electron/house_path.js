// 기록 폴더 안 .md 경로 검사 (C1 윈도우판 2026-10-14 비트: electron/main.js resolveSafe 에서 떼어 냄 — 윈도우 경로(path.win32)로도 시험하려고)
// 하우스 폴더 안쪽 상대 경로만, .md만. 상위 폴더(..)·숨김 이름(.)·비밀 파일·_to_delete 는 막는다 (pixel-office resolveSafe·fence.js 와 같은 방식)
// 윈도우: \ 구분자·드라이브(C:)·널 글자는 통째로 거절 (\ 가 섞이면 / 로만 나눈 숨김·상위 검사를 지나칠 수 있음)
'use strict';
const nodePath = require('path');
const SECRET = /^\.env|\.(pem|key)$|^id_rsa/i;
// house = 기록 폴더 절대 경로, rel = 화면이 보낸 상대 경로('/' 구분), P = path 모듈(시험에서 path.win32)
function safeMd(house, rel, P) {
  P = P || nodePath;
  if (!house) throw new Error('기록 폴더 없음 (온보딩 중)');
  if (typeof rel !== 'string' || !rel) throw new Error('경로 오류');
  if (/[\\:\0]/.test(rel)) throw new Error('허용 안 됨: ' + rel);
  const segs = rel.split('/').filter((s) => s !== '');
  if (!segs.length || segs.some((s) => s === '..' || s.startsWith('.') || SECRET.test(s) || s === '_to_delete')) throw new Error('허용 안 됨: ' + rel);
  if (!/\.md$/i.test(segs[segs.length - 1])) throw new Error('md만 읽음: ' + rel);
  const base = P.resolve(house);
  const full = P.join(base, ...segs);
  if (!full.startsWith(base + P.sep)) throw new Error('허용 안 됨: ' + rel);
  return full;
}
module.exports = { safeMd, SECRET };
