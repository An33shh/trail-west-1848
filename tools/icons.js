// Draws the app icons (a 1-bit green covered wagon) as PNGs with no dependencies.
// Used by tools/build.js. Output is deterministic, so rebuilding does not churn dist/.
const zlib = require('zlib');

// '#' bright phosphor, '+' dim phosphor, '.' glass.
const WAGON = [
  '....############....',
  '...#+++#++++#+++#...',
  '..#++++#++++#++++#..',
  '.#+++++#++++#+++++#.',
  '.#+++++#++++#+++++#.',
  '.#+++++#++++#+++++#.',
  '####################',
  '#..................#',
  '####################',
  '..###..........###..',
  '.#...#........#...#.',
  '.#.#.#........#.#.#.',
  '.#...#........#...#.',
  '..###..........###..',
];
const GLASS = [2, 6, 2];
const BRIGHT = [64, 255, 96];
const DIM = [14, 58, 23];

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

// size: icon edge in px. fill: share of the edge the wagon spans (maskable icons need a smaller one).
function icon(size, fill) {
  const cols = WAGON[0].length;
  const rows = WAGON.length;
  const scale = Math.max(1, Math.floor((size * fill) / cols));
  const x0 = Math.floor((size - cols * scale) / 2);
  const y0 = Math.floor((size - rows * scale) / 2);
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - x0) / scale);
      const gy = Math.floor((y - y0) / scale);
      const cell = gx >= 0 && gy >= 0 && gx < cols && gy < rows ? WAGON[gy][gx] : '.';
      let rgb = cell === '#' ? BRIGHT : cell === '+' ? DIM : GLASS;
      // Scanlines: darken the last pixel row of each art row when the art is big enough to show it.
      if (cell !== '.' && scale >= 6 && (y - y0) % scale === scale - 1) rgb = rgb.map((v) => Math.round(v * 0.55));
      raw.set(rgb, row + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Published path -> PNG bytes.
module.exports = () => ({
  'icons/icon-192.png': icon(192, 0.8),
  'icons/icon-512.png': icon(512, 0.8),
  'icons/icon-maskable-512.png': icon(512, 0.6),
  'icons/apple-touch-icon.png': icon(180, 0.72),
});
