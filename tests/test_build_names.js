// 앱 안 파일 이름·앱 이름 ASCII 점검 (A5, 2026-10-14 비트). 그림·창 없음. 실행: node tests/test_build_names.js
//   까닭: 오피스 펫 v0.2.0 "손상되었기 때문에 열 수 없습니다" = 앱 안 한글 파일 이름이 Finder 복사 때 유니코드 정규화(NFC/NFD)가 바뀌어 서명이 깨짐.
//         앱 정보 CFBundleName(productName)이 한글이면 켜자마자 죽음(오피스 펫 SIGTRAP). 윈도우 실행 파일 이름도 영어로 (C3)
//   package.json build.files 에 드는 파일만 봄 (dmg·exe 안에 들어가는 것). 개발용 assets/·preview/·tools/ 는 앱에 안 들어감
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (label, cond, extra) => { if (cond) pass++; else { fail++; console.log('  X ' + label + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); } };

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const ASCII_NAME = /^[A-Za-z0-9._@\-/]+$/; // 영어·숫자·점·밑줄·하이픈·골뱅이(아이콘 2배 이름) 만. 공백도 뺌
const ASCII_TITLE = /^[\x20-\x7E]+$/;      // 앱 이름은 공백 허용 (Pixel House)

// build.files 패턴을 폴더 단위로 풀기 (이 앱이 쓰는 꼴: "폴더/**", "파일", "!**/.DS_Store")
function buildFiles(files, base) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(base, rel);
    if (!fs.existsSync(abs)) return;
    if (fs.statSync(abs).isDirectory()) fs.readdirSync(abs).forEach((n) => walk(path.posix.join(rel, n)));
    else if (!/(^|\/)\.DS_Store$/.test(rel)) out.push(rel);
  };
  files.filter((f) => !f.startsWith('!')).forEach((f) => walk(f.replace(/\/\*\*$/, '')));
  return out;
}
const files = buildFiles(pkg.build.files, ROOT);
ok('build.files 로 앱에 드는 파일을 찾음 (index.html·electron·js·pet·portraits)', files.length > 100 && ['index.html', 'electron/main.js', 'pet/png/sprites.json'].every((f) => files.includes(f)) && files.some((f) => f.startsWith('portraits/')), files.length);
const bad = files.filter((f) => !ASCII_NAME.test(f));
ok('앱 안 파일 이름 전부 ASCII (한글·공백 없음)', bad.length === 0, bad.slice(0, 10));
const nfc = files.filter((f) => f.normalize('NFC') !== f || f.normalize('NFD') !== f);
ok('앱 안 파일 이름이 정규화(NFC/NFD)로 안 바뀜', nfc.length === 0, nfc.slice(0, 10));
ok('앱 이름 productName·build.productName ASCII (CFBundleName 한글이면 켜자마자 죽음)', ASCII_TITLE.test(pkg.productName) && ASCII_TITLE.test(pkg.build.productName || pkg.productName), [pkg.productName, pkg.build.productName]);
ok('앱 id ASCII', /^[a-z0-9.\-]+$/i.test(pkg.build.appId), pkg.build.appId);
// 시험 자체 확인: 한글 이름을 걸러 내는지
ok('(시험 확인) 한글·공백 이름은 걸림', !ASCII_NAME.test('portraits/두부.png') && !ASCII_NAME.test('pet/a b.png') && ASCII_NAME.test('pet/png/dog_white/stand_1.png'));

// 공개용 내보내기 쪽: 펫 그림 폴더·초상 폴더 이름도 같은 규칙 (export_public.js 가 DIRS 를 그대로 싣음)
const expF = path.join(ROOT, 'tools', 'export_public.js'); // 공개 저장소엔 없음 -> 건너뜀
if (fs.existsSync(expF)) ok('공개 내보내기 검사에도 앱 안 이름 ASCII 확인이 있음', /앱 안 파일 이름 ASCII/.test(fs.readFileSync(expF, 'utf8')));

console.log(`test_build_names: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
