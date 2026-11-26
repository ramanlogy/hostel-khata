// Copies the web app (index.html, store.js, fonts) from the project root into desktop/web
// so the Windows app always ships the latest version of the page.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const out = path.join(__dirname, '..', 'web');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
for (const f of ['index.html', 'store.js']) fs.copyFileSync(path.join(root, f), path.join(out, f));
for (const f of fs.readdirSync(path.join(root, 'fonts'))) fs.copyFileSync(path.join(root, 'fonts', f), path.join(out, 'fonts', f));
console.log('Copied web app into', out);
