/*
 * Procedural pixel art. Every image in the game is drawn here in code.
 * Scenes are composed in color on a 280x160 canvas (Apple II hi-res width),
 * then reduced to 1-bit green phosphor with a 4x4 ordered dither,
 * the same way a monochrome monitor showed hi-res graphics.
 */
(function (root) {
  'use strict';
  const W = 280, H = 160;

  // A fixed 256-color-era palette, picked for this remake.
  const P = {
    ink: '#1b1a24', white: '#fbf8ef',
    skyTop: '#10141e', skyMid: '#2a3446', skyLow: '#465570',
    duskTop: '#3b3f7a', duskLow: '#e79c6b',
    stormTop: '#4b5568', stormLow: '#8d97a6',
    snowSky: '#aab6c8',
    grass1: '#6fa648', grass2: '#4f8a35', grass3: '#3a6b29',
    dry1: '#c9b06a', dry2: '#a88f4f', dry3: '#7d6a3a',
    sage: '#8f9f6a',
    rock1: '#a0644a', rock2: '#7c4936', rock3: '#5a3427',
    mtnFar: '#7f8fb0', mtnMid: '#5f6f8f', mtnNear: '#4a5770', snow: '#eef3f8',
    pine1: '#2f5a3a', pine2: '#244a30',
    water1: '#3d78b8', water2: '#2e5f99', water3: '#7fb2e0', foam: '#d8ecfa',
    canvas: '#efe6cc', canvasShade: '#cfc29f', wood: '#8a5a32', woodDark: '#5c3a1f',
    iron: '#3a3a44', ox: '#7a4a2c', oxDark: '#4e2e1a', horn: '#e8dcc0',
    fort: '#9a7048', fortDark: '#6b4a2c', flag: '#c8383a',
    sun: '#ffe58a', cloud: '#ffffff', cloudShade: '#dde6f0',
  };

  function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }

  // Deterministic noise so hills don't shimmer between frames.
  function hash(n) { n = (n << 13) ^ n; return 1.0 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824.0; }
  function ridge(x, seed, amp, freq) {
    const a = x * freq;
    const i = Math.floor(a), f = a - i;
    const s = f * f * (3 - 2 * f);
    return (hash(i + seed) * (1 - s) + hash(i + 1 + seed) * s) * amp;
  }

  // Sky drawn in hard color bands, like an 8-bit palette gradient.
  function bandedSky(ctx, top, low, horizon) {
    const steps = 8;
    const parse = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const a = parse(top), b = parse(low);
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const c = a.map((v, k) => Math.round(v + (b[k] - v) * t));
      const y0 = Math.floor((horizon * i) / steps), y1 = Math.floor((horizon * (i + 1)) / steps);
      px(ctx, 0, y0, W, y1 - y0, `rgb(${c[0]},${c[1]},${c[2]})`);
    }
  }

  function cloud(ctx, x, y, s) {
    px(ctx, x, y + 4 * s, 26 * s, 5 * s, P.cloudShade);
    px(ctx, x + 2 * s, y + 2 * s, 22 * s, 5 * s, P.cloud);
    px(ctx, x + 6 * s, y, 10 * s, 4 * s, P.cloud);
  }

  function sky(ctx, weather, offset) {
    const horizon = 92;
    if (weather && /snow/.test(weather.precip || '')) bandedSky(ctx, P.snowSky, '#dfe6ee', horizon);
    else if (weather && /rain/.test(weather.precip || '')) bandedSky(ctx, P.stormTop, P.stormLow, horizon);
    else bandedSky(ctx, P.skyTop, P.skyLow, horizon);
    if (!weather || !weather.precip) {
      px(ctx, 232, 14, 14, 14, P.sun); px(ctx, 229, 17, 20, 8, P.sun);
    }
    const o = (offset || 0) * 0.05;
    cloud(ctx, ((40 - o) % 380 + 380) % 380 - 40, 18, 1);
    cloud(ctx, ((190 - o) % 380 + 380) % 380 - 40, 30, 1);
  }

  function mountains(ctx, seed, base, amp, color, capColor, offset, freq) {
    ctx.fillStyle = color;
    for (let x = 0; x < W; x++) {
      const h = Math.abs(ridge(x + offset, seed, amp, freq || 0.02)) + amp * 0.2;
      ctx.fillRect(x, Math.round(base - h), 1, Math.round(h) + 1);
      if (capColor && h > amp * 0.85) ctx.fillStyle = capColor, ctx.fillRect(x, Math.round(base - h), 1, 3), ctx.fillStyle = color;
    }
  }

  function zonePalette(zone) {
    switch (zone) {
      case 'plains': return { g: [P.grass1, P.grass2, P.grass3], hills: null };
      case 'highplains': return { g: [P.dry1, P.grass1, P.grass2], hills: P.dry2 };
      case 'rockies': return { g: [P.sage, P.dry2, P.grass3], hills: P.mtnMid };
      case 'highdesert': return { g: [P.dry1, P.dry2, P.dry3], hills: P.rock2 };
      case 'snakeplain': return { g: [P.dry1, P.sage, P.dry3], hills: P.rock3 };
      case 'cascades': return { g: [P.grass2, P.grass3, P.pine2], hills: P.mtnNear };
      default: return { g: [P.grass1, P.grass2, P.grass3], hills: null };
    }
  }

  function ground(ctx, zone, offset, snowy) {
    const zp = zonePalette(zone);
    const g = snowy ? [P.snow, '#dbe4ee', '#c4cfdc'] : zp.g;
    px(ctx, 0, 92, W, 68, g[0]);
    px(ctx, 0, 112, W, 48, g[1]);
    px(ctx, 0, 138, W, 22, g[2]);
    // Tufts and stones scroll at foreground speed.
    for (let i = 0; i < 26; i++) {
      const x = ((i * 53 - offset) % (W + 20) + W + 20) % (W + 20) - 10;
      const y = 116 + ((i * 37) % 40);
      px(ctx, x, y, 3, 1, g[2]); px(ctx, x + 1, y - 1, 1, 1, g[2]);
    }
    // Trail ruts.
    px(ctx, 0, 127, W, 2, snowy ? '#b9c4d2' : P.dry3);
    px(ctx, 0, 133, W, 2, snowy ? '#b9c4d2' : P.dry3);
  }

  function pine(ctx, x, y, s) {
    px(ctx, x + 3 * s, y + 12 * s, 2 * s, 3 * s, P.woodDark);
    for (let i = 0; i < 4; i++) px(ctx, x + (3 - i) * s, y + i * 3 * s, (2 + i * 2) * s, 3 * s, i % 2 ? P.pine1 : P.pine2);
  }

  function backdrop(ctx, zone, offset) {
    const zp = zonePalette(zone);
    if (zone === 'rockies' || zone === 'cascades') {
      mountains(ctx, 11, 92, 46, P.mtnFar, P.snow, offset * 0.1, 0.03);
      mountains(ctx, 29, 94, 26, zp.hills, null, offset * 0.25, 0.04);
    } else if (zone === 'highplains' || zone === 'highdesert' || zone === 'snakeplain') {
      mountains(ctx, 7, 92, 14, P.mtnFar, null, offset * 0.1, 0.015);
      mountains(ctx, 17, 94, 8, zp.hills, null, offset * 0.25, 0.05);
    } else {
      mountains(ctx, 3, 93, 6, P.grass2, null, offset * 0.2, 0.02);
    }
    if (zone === 'cascades' || zone === 'rockies') {
      for (let i = 0; i < 9; i++) {
        const x = ((i * 41 - offset * 0.5) % (W + 30) + W + 30) % (W + 30) - 15;
        pine(ctx, x, 82 + (i % 3) * 4, 1);
      }
    }
  }

  function precipitation(ctx, weather, t) {
    if (!weather || !weather.precip) return;
    const snow = /snow/.test(weather.precip);
    const heavy = /heavy/.test(weather.precip);
    const n = heavy ? 140 : 70;
    for (let i = 0; i < n; i++) {
      const x = (i * 97 + t * (snow ? 0.4 : 1.5) * (i % 3 + 1)) % W;
      const y = (i * 61 + t * (snow ? 0.6 : 4)) % H;
      if (snow) px(ctx, x, y, 1, 1, P.white);
      else px(ctx, x, y, 1, 3, '#c9d7ea');
    }
  }

  // ---------- Wagon and oxen ----------
  function wheel(ctx, cx, cy, r, frame) {
    ctx.fillStyle = P.woodDark;
    for (let a = 0; a < Math.PI * 2; a += 0.15) ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
    const rot = frame * 0.25;
    for (let k = 0; k < 4; k++) {
      const a = rot + (k * Math.PI) / 4;
      for (let d = -r + 1; d < r; d++) px(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1, 1, P.wood);
    }
    px(ctx, cx - 1, cy - 1, 2, 2, P.iron);
  }

  function wagon(ctx, x, y, frame) {
    const bob = frame % 8 < 4 ? 0 : 1;
    // bed
    px(ctx, x, y - 10 + bob, 34, 7, P.wood);
    px(ctx, x, y - 4 + bob, 34, 1, P.woodDark);
    // bonnet hoops
    px(ctx, x + 2, y - 24 + bob, 30, 14, P.canvas);
    px(ctx, x + 4, y - 27 + bob, 26, 3, P.canvas);
    px(ctx, x + 2, y - 12 + bob, 30, 2, P.canvasShade);
    for (let i = 0; i < 3; i++) px(ctx, x + 8 + i * 9, y - 26 + bob, 1, 14, P.canvasShade);
    // tongue
    px(ctx, x + 34, y - 6 + bob, 12, 1, P.woodDark);
    wheel(ctx, x + 7, y, 6, frame);
    wheel(ctx, x + 27, y, 6, frame);
  }

  function ox(ctx, x, y, frame) {
    const step = frame % 8 < 4;
    px(ctx, x, y - 10, 16, 7, P.ox);
    px(ctx, x + 1, y - 4, 14, 1, P.oxDark);
    px(ctx, x + 14, y - 12, 6, 6, P.ox);
    px(ctx, x + 19, y - 9, 2, 2, P.oxDark);
    px(ctx, x + 14, y - 14, 1, 2, P.horn); px(ctx, x + 19, y - 14, 1, 2, P.horn);
    px(ctx, x - 1, y - 9, 1, 4, P.oxDark);
    const legs = step ? [1, 5, 10, 13] : [2, 4, 11, 12];
    legs.forEach((lx) => px(ctx, x + lx, y - 3, 2, 4, P.oxDark));
  }

  function team(ctx, x, y, frame, oxen) {
    wagon(ctx, x, y, frame);
    const yokes = Math.max(1, Math.min(2, Math.ceil(oxen / 2)));
    for (let i = 0; i < yokes; i++) ox(ctx, x + 46 + i * 22, y + 1, frame + i * 2);
  }

  // ---------- Landmarks ----------
  function fort(ctx, x, y) {
    px(ctx, x, y - 26, 70, 26, P.fort);
    for (let i = 0; i < 70; i += 4) px(ctx, x + i, y - 30, 3, 4, P.fort);
    for (let i = 0; i < 70; i += 4) px(ctx, x + i + 3, y - 26, 1, 26, P.fortDark);
    px(ctx, x - 6, y - 36, 14, 36, P.fortDark); px(ctx, x - 6, y - 40, 14, 4, P.fort);
    px(ctx, x + 62, y - 36, 14, 36, P.fortDark); px(ctx, x + 62, y - 40, 14, 4, P.fort);
    px(ctx, x + 28, y - 14, 14, 14, P.woodDark);
    px(ctx, x + 34, y - 56, 1, 26, P.iron);
    px(ctx, x + 35, y - 56, 10, 6, P.flag);
  }

  function chimney(ctx, x, y) {
    px(ctx, x - 30, y - 12, 80, 12, P.dry2);
    px(ctx, x - 18, y - 22, 56, 10, P.dry2);
    px(ctx, x - 6, y - 32, 32, 10, P.rock1);
    px(ctx, x + 4, y - 70, 12, 38, P.rock1);
    px(ctx, x + 6, y - 78, 8, 8, P.rock1);
    px(ctx, x + 12, y - 70, 4, 38, P.rock2);
  }

  function dome(ctx, x, y, w, h, c, shade) {
    for (let i = 0; i < w; i++) {
      const t = (i / w) * 2 - 1;
      const hh = Math.round(h * Math.sqrt(Math.max(0, 1 - t * t)));
      px(ctx, x + i, y - hh, 1, hh, i > w * 0.6 ? shade : c);
    }
  }

  function springs(ctx, x, y, t) {
    px(ctx, x, y - 6, 60, 6, P.rock1);
    px(ctx, x + 6, y - 5, 18, 3, P.water3);
    px(ctx, x + 32, y - 5, 20, 3, P.water3);
    const h = 8 + Math.round(Math.abs(Math.sin(t * 0.08)) * 14);
    px(ctx, x + 40, y - 5 - h, 3, h, P.foam);
  }

  function town(ctx, x, y) {
    const hs = [[0, 22, P.wood], [26, 30, P.fortDark], [60, 18, P.rock1], [82, 26, P.wood]];
    hs.forEach(([dx, h, c]) => {
      px(ctx, x + dx, y - h, 22, h, c);
      px(ctx, x + dx - 2, y - h - 4, 26, 4, P.woodDark);
      px(ctx, x + dx + 8, y - 10, 6, 10, P.ink);
    });
  }

  function landmark(ctx, id, type, t) {
    const gx = 170, gy = 112;
    if (type === 'fort') fort(ctx, gx, gy);
    else if (type === 'town' || type === 'dalles') town(ctx, gx - 10, gy);
    else if (id === 'chimney') chimney(ctx, gx + 30, gy);
    else if (id === 'indrock') dome(ctx, gx - 10, gy, 110, 34, P.rock1, P.rock2);
    else if (id === 'soda') springs(ctx, gx, gy, t);
    else if (id === 'southpass') { /* wide saddle: mountains already frame it */ }
    else if (id === 'bluemtns') { for (let i = 0; i < 12; i++) pine(ctx, 150 + i * 14, 84 + (i % 3) * 6, 2); }
    else if (type === 'end') {
      for (let i = 0; i < 8; i++) px(ctx, 120 + i * 24, 104, 16, 2, P.dry1);
      px(ctx, 230, 82, 26, 18, P.wood); px(ctx, 226, 76, 34, 6, P.woodDark);
    }
  }

  function riverBand(ctx, t, width) {
    const top = 100, h = 20 + Math.min(20, Math.round((width || 300) / 60));
    px(ctx, 0, top, W, h, P.water1);
    for (let i = 0; i < 30; i++) {
      const x = ((i * 37 + t * 0.7) % (W + 10)) - 5;
      px(ctx, x, top + 3 + (i * 7) % (h - 6), 6, 1, i % 2 ? P.water3 : P.water2);
    }
    px(ctx, 0, top + h, W, 2, P.dry3);
    return top + h;
  }

  // ---------- Composite scenes ----------
  function travelScene(ctx, o) {
    const zone = o.zone || 'plains';
    const snowy = o.weather && /snow/.test(o.weather.precip || '');
    sky(ctx, o.weather, o.offset);
    backdrop(ctx, zone, o.offset);
    ground(ctx, zone, o.offset, snowy);
    team(ctx, 128, 132, o.frame, o.oxen);
    precipitation(ctx, o.weather, o.frame);
  }

  function landmarkScene(ctx, o) {
    const lm = o.landmark;
    const snowy = o.weather && /snow/.test(o.weather.precip || '');
    sky(ctx, o.weather, o.frame);
    backdrop(ctx, lm.zone, 0);
    ground(ctx, lm.zone, 0, snowy);
    if (lm.type === 'river') {
      riverBand(ctx, o.frame, o.river && o.river.width);
      team(ctx, 40, 150, 0, o.oxen);
    } else {
      landmark(ctx, o.id, lm.type, o.frame);
      team(ctx, 40, 140, 0, o.oxen);
    }
    precipitation(ctx, o.weather, o.frame);
  }

  function crossingScene(ctx, o) {
    sky(ctx, null, o.frame);
    backdrop(ctx, o.zone, 0);
    ground(ctx, o.zone, 0, false);
    riverBand(ctx, o.frame, 600);
    const x = -60 + o.progress * 380;
    if (o.method === 'ferry') { px(ctx, x - 8, 116, 66, 5, P.woodDark); wagon(ctx, x, 114, 0); }
    else if (o.method === 'caulk') { wagon(ctx, x, 120 + Math.round(Math.sin(o.frame * 0.3) * 1.5), 0); }
    else if (o.method === 'guide') { px(ctx, x - 6, 118, 56, 4, P.wood); wagon(ctx, x, 116, 0); }
    else team(ctx, x, 124, o.frame, 4);
    // water line over the wheels
    for (let i = 0; i < 12; i++) px(ctx, ((i * 31 + o.frame) % W), 118, 5, 1, P.foam);
  }

  // ---------- Hunting ----------
  const ANIMAL_SHAPES = {
    bison: { w: 26, h: 16, c: '#4a3020', speed: 0.35 },
    elk: { w: 22, h: 18, c: '#8a6038', speed: 0.6 },
    bear: { w: 20, h: 14, c: '#2e2220', speed: 0.45 },
    deer: { w: 18, h: 16, c: '#a07040', speed: 0.85 },
    antelope: { w: 16, h: 14, c: '#c08848', speed: 1.1 },
    rabbit: { w: 6, h: 5, c: '#b8a890', speed: 1.4 },
    squirrel: { w: 5, h: 4, c: '#8a6a50', speed: 1.6 },
  };

  function animal(ctx, a, t) {
    const s = ANIMAL_SHAPES[a.kind];
    const x = a.x, y = a.y, w = s.w, h = s.h;
    if (a.dead) { px(ctx, x, y - 3, w, 3, s.c); return; }
    const dir = a.vx > 0 ? 1 : -1;
    px(ctx, x, y - h + h * 0.25, w * 0.8, h * 0.55, s.c);
    const hx = dir > 0 ? x + w * 0.7 : x - w * 0.15;
    px(ctx, hx, y - h, w * 0.35, h * 0.45, s.c);
    if (a.kind === 'bison') px(ctx, x + w * 0.35, y - h - 2, w * 0.4, h * 0.4, s.c);
    if (a.kind === 'elk' || a.kind === 'deer') { px(ctx, hx + 1, y - h - 4, 1, 4, '#d8c8a0'); px(ctx, hx + 4, y - h - 4, 1, 4, '#d8c8a0'); }
    const leg = Math.floor(t / 4 + a.x) % 2;
    px(ctx, x + 1 + leg, y - h * 0.25, 2, h * 0.25, s.c);
    px(ctx, x + w * 0.6 - leg, y - h * 0.25, 2, h * 0.25, s.c);
  }

  function huntScene(ctx, o) {
    sky(ctx, null, 0);
    backdrop(ctx, o.zone, 0);
    ground(ctx, o.zone, 0, false);
    for (const b of o.brush) {
      if (b.tree) pine(ctx, b.x, b.y - 30, 2);
      else { px(ctx, b.x, b.y - 6, 14, 6, P.grass3); px(ctx, b.x + 3, b.y - 9, 8, 3, P.grass3); }
    }
    for (const a of o.animals) animal(ctx, a, o.frame);
    for (const f of o.flashes) px(ctx, f.x - 1, f.y - 1, 3, 3, P.sun);
    // crosshair
    if (o.aim) {
      const { x, y } = o.aim;
      px(ctx, x - 6, y, 4, 1, P.white); px(ctx, x + 3, y, 4, 1, P.white);
      px(ctx, x, y - 6, 1, 4, P.white); px(ctx, x, y + 3, 1, 4, P.white);
      px(ctx, x - 6, y + 1, 4, 1, P.ink); px(ctx, x + 3, y + 1, 4, 1, P.ink);
    }
  }

  // ---------- Rafting ----------
  function raftScene(ctx, o) {
    px(ctx, 0, 0, W, H, P.water2);
    // canyon walls
    for (let y = 0; y < H; y++) {
      const off = Math.round(Math.sin((y + o.scroll) * 0.04) * 6);
      px(ctx, 0, y, 40 + off, 1, y % 4 ? P.rock2 : P.rock3);
      px(ctx, W - 40 + off, y, 40 - off, 1, y % 4 ? P.rock2 : P.rock3);
    }
    for (let i = 0; i < 40; i++) {
      const y = (i * 23 + o.scroll * 1.4) % H;
      px(ctx, 50 + (i * 53) % 220, y, 6, 1, P.water3);
    }
    for (const r of o.rocks) {
      px(ctx, r.x - r.r, r.y - r.r / 2, r.r * 2, r.r, P.rock3);
      px(ctx, r.x - r.r + 2, r.y - r.r / 2 - 2, r.r * 2 - 4, 3, P.rock1);
      px(ctx, r.x - r.r - 2, r.y + r.r / 2 - 1, r.r * 2 + 4, 2, P.foam);
    }
    const flash = o.hitFlash > 0 && o.frame % 4 < 2;
    px(ctx, o.raftX - 14, 132, 28, 14, flash ? P.flag : P.wood);
    for (let i = 0; i < 5; i++) px(ctx, o.raftX - 13 + i * 6, 132, 1, 14, P.woodDark);
    px(ctx, o.raftX - 9, 122, 18, 10, P.canvas);
  }

  // ---------- Map ----------
  function mapScene(ctx, o) {
    px(ctx, 0, 0, W, H, '#e9dcb8');
    for (let i = 0; i < 400; i++) px(ctx, (i * 73) % W, (i * 131) % H, 1, 1, '#d8c79e');
    // rough continent texture: mountains band
    for (let i = 0; i < 26; i++) {
      const x = 120 + (i * 13) % 80, y = 30 + (i * 29) % 100;
      px(ctx, x, y, 5, 1, '#a08860'); px(ctx, x + 1, y - 1, 3, 1, '#a08860'); px(ctx, x + 2, y - 2, 1, 1, '#a08860');
    }
    const L = o.landmarks;
    const pos = (id) => [Math.round(L[id].x * (W - 20) + 10), Math.round(L[id].y * (H - 20) + 10)];
    ctx.strokeStyle = '#8a7350'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
    for (const id in L) for (const n of L[id].next) { const a = pos(id), b = pos(n); ctx.beginPath(); ctx.moveTo(a[0] + 0.5, a[1] + 0.5); ctx.lineTo(b[0] + 0.5, b[1] + 0.5); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.strokeStyle = P.flag; ctx.lineWidth = 2;
    ctx.beginPath();
    o.path.forEach((id, i) => { const p = pos(id); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    if (o.next) {
      const a = pos(o.path[o.path.length - 1]), b = pos(o.next);
      const f = 1 - o.milesToNext / o.segmentLength;
      ctx.lineTo(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f);
    }
    ctx.stroke();
    for (const id in L) {
      const [x, y] = pos(id);
      const t = L[id].type;
      const c = t === 'fort' ? P.fortDark : t === 'river' ? P.water1 : P.ink;
      px(ctx, x - 2, y - 2, 4, 4, c);
    }
    if (o.next) {
      const a = pos(o.path[o.path.length - 1]), b = pos(o.next);
      const f = 1 - o.milesToNext / o.segmentLength;
      const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
      px(ctx, x - 3, y - 3, 6, 6, P.flag); px(ctx, x - 1, y - 1, 2, 2, P.white);
    }
  }

  // Title backdrop: dusk over the plains.
  function titleScene(ctx, t) {
    bandedSky(ctx, P.duskTop, P.duskLow, 100);
    px(ctx, 220, 70, 22, 22, '#ffcf7a'); px(ctx, 217, 74, 28, 14, '#ffcf7a');
    mountains(ctx, 11, 100, 40, '#5a4f7a', null, 0, 0.03);
    mountains(ctx, 29, 104, 20, '#3f3a5c', null, 0, 0.05);
    px(ctx, 0, 104, W, 56, '#2f3a2c');
    px(ctx, 0, 124, W, 2, '#4a4630');
    const x = ((t * 0.3) % (W + 120)) - 90;
    // silhouette team
    const save = { ...P };
    P.wood = P.woodDark = P.iron = P.ox = P.oxDark = '#141218'; P.canvas = '#2a2632'; P.canvasShade = '#1e1b26'; P.horn = '#2a2632';
    team(ctx, x, 124, t, 4);
    Object.assign(P, save);
  }

  // ---------- Phosphor output ----------
  // Monochrome hi-res look: shapes get a 1-pixel outline wherever brightness changes,
  // and areas are filled with one of four fixed patterns (black, sparse dots, checker, solid).
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const GREEN = [64, 255, 96];
  let lumBuf = null;
  function phosphor(ctx, opts) {
    opts = opts || {};
    const lo = opts.lo != null ? opts.lo : 0.42, hi = opts.hi != null ? opts.hi : 0.92, edge = opts.edge != null ? opts.edge : 0.07;
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    if (!lumBuf || lumBuf.length !== W * H) lumBuf = new Float32Array(W * H);
    for (let i = 0, j = 0; j < W * H; i += 4, j++) lumBuf[j] = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const j = y * W + x;
        const l = lumBuf[j];
        let on = false;
        if (opts.edge !== 0) {
          const r = x + 1 < W ? lumBuf[j + 1] : l;
          const b = y + 1 < H ? lumBuf[j + W] : l;
          if (Math.abs(l - r) > edge || Math.abs(l - b) > edge) on = true;
        }
        if (!on) {
          let t = (l - lo) / (hi - lo);
          t = t <= 0 ? 0 : t < 0.33 ? 0.19 : t < 0.7 ? 0.5 : 1;
          on = t > BAYER[(y & 3) * 4 + (x & 3)];
        }
        const i = j * 4;
        d[i] = on ? GREEN[0] : 0; d[i + 1] = on ? GREEN[1] : 0; d[i + 2] = on ? GREEN[2] : 0; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  root.Art = { W, H, P, phosphor, travelScene, landmarkScene, crossingScene, huntScene, raftScene, mapScene, titleScene, ANIMAL_SHAPES };
})(typeof window !== 'undefined' ? window : globalThis);
