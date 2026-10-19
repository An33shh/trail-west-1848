// Bundles src/ into:
//   dist/index.html            standalone page, open directly in a browser or install as an app (PWA)
//   dist/trail-west.html       same content without the document skeleton, for hosting as an artifact
//   dist/manifest.webmanifest  app name, colors and icons for installing
//   dist/icons/*.png           app icons, drawn by tools/icons.js
//   dist/sw.js                 service worker that caches everything for offline play
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const icons = require('./icons');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const read = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const BG = '#0d0f0c';

const head = [
  '<title>Trail West 1848</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=VT323&display=swap">',
  `<style>\n${read('style.css')}</style>`,
].join('\n');
const appHead = [
  '<meta name="description" content="Green-screen wagon trail game from 1848 Missouri to Oregon. Installs as an app and plays offline.">',
  `<meta name="theme-color" content="${BG}">`,
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">',
  '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black">',
  '<meta name="apple-mobile-web-app-title" content="Trail West">',
].join('\n');
const scripts = ['engine.js', 'art.js', 'audio.js', 'ui.js', 'fullscreen.js'].map((f) => `<script>\n${read(f)}</script>`).join('\n');
const fragment = `${head}\n${read('body.html')}\n${scripts}\n`;
const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n${appHead}\n</head>\n<body>\n${read('body.html')}\n${scripts}\n<script>\n${read('pwa.js')}</script>\n</body>\n</html>\n`;

const manifest = {
  id: './',
  name: 'Trail West 1848',
  short_name: 'Trail West',
  description: 'Green-screen wagon trail game. Plays offline.',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: BG,
  theme_color: BG,
  categories: ['games'],
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

const files = {
  'index.html': full,
  'trail-west.html': fragment,
  'manifest.webmanifest': JSON.stringify(manifest, null, 2) + '\n',
  ...icons(),
};

// Everything the installed app needs offline. './' is how the start URL is requested.
const offline = ['./', 'index.html', 'manifest.webmanifest', ...Object.keys(files).filter((f) => f.startsWith('icons/'))];
const hash = crypto.createHash('sha256');
for (const f of offline.slice(1)) hash.update(f).update(files[f]);
files['sw.js'] = read('sw.js')
  .replace("'__VERSION__'", JSON.stringify(hash.digest('hex').slice(0, 12)))
  .replace('__ASSETS__', JSON.stringify(offline));

for (const [name, data] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(path.join(dist, name)), { recursive: true });
  fs.writeFileSync(path.join(dist, name), data);
}
console.log('built', (full.length / 1024).toFixed(1) + ' KB', '+ PWA:', Object.keys(files).length - 2, 'files');
