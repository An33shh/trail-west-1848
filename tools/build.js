// Bundles src/ into two files:
//   dist/index.html        standalone page, open directly in a browser
//   dist/trail-west.html   same content without the document skeleton, for hosting as an artifact
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const head = [
  '<title>Trail West 1848</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=VT323&display=swap">',
  `<style>\n${read('style.css')}</style>`,
].join('\n');
const scripts = ['engine.js', 'art.js', 'audio.js', 'ui.js'].map((f) => `<script>\n${read(f)}</script>`).join('\n');
const fragment = `${head}\n${read('body.html')}\n${scripts}\n`;
const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${read('body.html')}\n${scripts}\n</body>\n</html>\n`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'trail-west.html'), fragment);
fs.writeFileSync(path.join(root, 'dist', 'index.html'), full);
console.log('built', (full.length / 1024).toFixed(1) + ' KB');
