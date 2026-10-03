const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectDir = __dirname;
const distDir = path.join(projectDir, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));

const installers = fs.readdirSync(distDir)
  .filter(name => /\.exe$/i.test(name) && /Setup/i.test(name))
  .map(name => path.join(distDir, name));

if (!installers.length) throw new Error('No Nexus OS installer EXE found in dist/.');

const installer = installers.sort()[0];
const data = fs.readFileSync(installer);
const sha512 = crypto.createHash('sha512').update(data).digest('base64');
const size = data.length;
const fileName = path.basename(installer);
const releaseDate = new Date().toISOString();

const manifest = [
  `version: ${pkg.version}`,
  `files:`,
  `  - url: ${fileName}`,
  `    sha512: ${sha512}`,
  `    size: ${size}`,
  `path: ${fileName}`,
  `sha512: ${sha512}`,
  `releaseDate: ${releaseDate}`,
  ``
].join('\n');

fs.writeFileSync(path.join(distDir, 'latest.yml'), manifest, 'utf8');
console.log(`Created ${path.join(distDir, 'latest.yml')}`);
console.log(`Version: ${pkg.version}`);
console.log(`Installer: ${fileName}`);
console.log(`Size: ${size}`);
