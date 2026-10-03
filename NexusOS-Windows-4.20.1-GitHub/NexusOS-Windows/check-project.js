const fs = require('fs');
const path = require('path');

const required = [
  'index.html',
  'main.js',
  'preload.js',
  'guest-preload.js',
  'package.json',
  '.github/workflows/build-windows.yml'
];
for (const file of required) {
  if (!fs.existsSync(path.join(__dirname, file))) throw new Error(`Missing required file: ${file}`);
}
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
if (pkg.devDependencies.electron !== '44.5.0') throw new Error('Unexpected Electron version');
if (!pkg.build.files.includes('guest-preload.js')) throw new Error('guest-preload.js is not packaged');
const preload = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');
if (preload.includes("require('electron').shell") || preload.includes("{ contextBridge, ipcRenderer, shell }")) throw new Error('Sandbox-incompatible shell usage found in preload.js');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
if (!html.includes("document.createElement('webview')")) throw new Error('Nexus Browser webview is missing');
if (!html.includes("setAttribute('preload', new URL('guest-preload.js'")) throw new Error('Nexus Browser guest preload is not wired');
console.log('Nexus OS project checks passed.');
