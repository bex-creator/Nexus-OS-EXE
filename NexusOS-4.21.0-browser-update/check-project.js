const fs = require('fs');
const path = require('path');

const projectDir = __dirname;

const required = [
  'index.html',
  'main.js',
  'preload.js',
  'guest-preload.js',
  'package.json'
];

for (const file of required) {
  if (!fs.existsSync(path.join(projectDir, file))) {
    throw new Error(`Missing required file: ${file}`);
  }
}

const pkgPath = path.join(projectDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

if (pkg.name !== 'nexus-os') throw new Error('Unexpected package name');
if (pkg.devDependencies?.electron !== '44.5.0') throw new Error('Unexpected Electron version');
if (pkg.devDependencies?.['electron-builder'] !== '26.15.3') throw new Error('Unexpected electron-builder version');
if (!Array.isArray(pkg.build?.files) || !pkg.build.files.includes('guest-preload.js')) {
  throw new Error('guest-preload.js is not packaged');
}

const preload = fs.readFileSync(path.join(projectDir, 'preload.js'), 'utf8');
if (
  preload.includes("require('electron').shell") ||
  preload.includes("{ contextBridge, ipcRenderer, shell }") ||
  preload.includes("{ contextBridge, shell, ipcRenderer }")
) {
  throw new Error('Sandbox-incompatible shell usage found in preload.js');
}

const guestPreload = fs.readFileSync(path.join(projectDir, 'guest-preload.js'), 'utf8');
if (!guestPreload.includes("require('electron')") || !guestPreload.includes('ipcRenderer.sendToHost')) {
  throw new Error('guest-preload.js is missing its Electron webview bridge');
}

const html = fs.readFileSync(path.join(projectDir, 'index.html'), 'utf8');
if (!html.includes("document.createElement('webview')")) {
  throw new Error('Nexus Browser webview is missing');
}
if (!html.includes("setAttribute('preload', new URL('guest-preload.js'")) {
  throw new Error('Nexus Browser guest preload is not wired');
}
if (!html.includes('nexus-login-btn') || !preload.includes('nexus-passwords-list') || !preload.includes('nexus-passwords-save') || !preload.includes('nexus-passwords-fill') || !preload.includes('nexus-open-downloads') || !preload.includes('nexus-browser-clear-data')) {
  throw new Error('Nexus password-manager integration is missing');
}

console.log('Nexus OS project checks passed.');
