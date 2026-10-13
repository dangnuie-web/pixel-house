// 바탕화면 펫 창 preload (2026-10-13, 두부 펫 preload.js를 옮겨 옴). 화면 쪽에 정해진 통로만 넘긴다 (Node 기능·파일 읽기는 넘기지 않음)
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// 말풍선 메뉴: dlgOpen·dlg·dlgError·dlgEnd·dlgFooter 받기, dlgAnswer(고른 값)·footer(숨기기·펫 끄기)·room(머리 위 자리) 보내기
const IN = ['pet:init', 'pet:pose', 'pet:say', 'pet:hideBubble', 'pet:view', 'pet:dlgOpen', 'pet:dlg', 'pet:dlgError', 'pet:dlgEnd', 'pet:dlgFooter', 'pet:hitReset'];
const OUT = ['pet:hit', 'pet:dragStart', 'pet:dragEnd', 'pet:menu', 'pet:bubbleDone', 'pet:dlgAnswer', 'pet:footer', 'pet:room'];
contextBridge.exposeInMainWorld('DP', {
  on: (ch, cb) => { if (IN.includes(ch)) ipcRenderer.on(ch, (e, d) => cb(d)); },
  send: (ch, d) => { if (OUT.includes(ch)) ipcRenderer.send(ch, d); },
});
