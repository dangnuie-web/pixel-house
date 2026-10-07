// 시험이 띄울 Electron: 이 폴더 node_modules (2026-10-08 devDependency) -> 없으면 ~/dev/pixel-office 것 (그 전 방식)
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const local = path.join(__dirname, '..', 'node_modules', '.bin', 'electron');
module.exports = fs.existsSync(local) ? local : path.join(os.homedir(), 'dev', 'pixel-office', 'node_modules', '.bin', 'electron');
