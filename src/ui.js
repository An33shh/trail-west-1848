/*
 * Green-screen front end: a 40-column terminal under a hi-res picture.
 * Choices are typed (a number, a name, BANG) or tapped. Depends on OT, Art, Sound.
 */
(function () {
  'use strict';
  const OT = window.OT, Art = window.Art, Sound = window.Sound;
  const COLS = 40;
  const FAST = !!window.__TW_FAST;
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = Art.W; canvas.height = Art.H;
  const termEl = document.getElementById('term');
  const coarse = matchMedia('(pointer: coarse)').matches;

  let G = null;
  let frame = 0;
  let anim = null;
  let travelOffset = 0;

  // ---------- storage, per-viewer convenience only ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('tw1848g:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('tw1848g:' + k, JSON.stringify(v)); } catch (e) { /* unavailable */ } },
    del(k) { try { localStorage.removeItem('tw1848g:' + k); } catch (e) { /* unavailable */ } },
  };
  const autosave = () => { if (G && G.status !== 'won' && G.status !== 'dead') store.set('save', G); };

  // ---------- picture ----------
  function loop() {
    requestAnimationFrame(loop);
    frame++;
    if (!anim) return;
    try { anim(frame); Art.phosphor(ctx); } catch (e) { console.error(e); anim = null; }
  }
  requestAnimationFrame(loop);
  function picture(fn) { anim = fn; canvas.hidden = !fn; }

  function landmarkPicture(id) {
    const lm = OT.LANDMARKS[id];
    picture((f) => Art.landmarkScene(ctx, { id, landmark: lm, weather: G.weather, frame: f, oxen: G.oxen, river: G.river }));
  }

  // ---------- terminal ----------
  // Size the font so exactly 40 columns fit the glass, whatever face loaded.
  function fitTerm() {
    const probe = document.createElement('span');
    probe.textContent = 'M'.repeat(COLS);
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-size:100px;font-family:inherit';
    termEl.append(probe);
    const per100 = probe.offsetWidth; // layout width, so the desktop 2x stretch doesn't skew it
    probe.remove();
    const avail = termEl.clientWidth;
    if (per100 > 0 && avail > 0) termEl.style.fontSize = Math.floor((avail / per100) * 100 * 0.995 * 10) / 10 + 'px';
  }
  fitTerm();
  window.addEventListener('resize', fitTerm);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTerm);

  function wrap(text, width) {
    const out = [];
    for (const para of String(text).split('\n')) {
      if (!para) { out.push(''); continue; }
      let line = '';
      for (const word of para.split(' ')) {
        if (!line) line = word;
        else if ((line + ' ' + word).length <= width) line += ' ' + word;
        else { out.push(line); line = word; }
      }
      out.push(line);
    }
    return out;
  }

  const T = {
    clear() { termEl.replaceChildren(); },
    line(text, cls) {
      const d = document.createElement('div');
      d.className = 'line' + (cls ? ' ' + cls : '');
      d.textContent = text;
      termEl.append(d);
      return d;
    },
    say(text, cls) { for (const l of wrap(text, COLS)) T.line(l, cls); },
    blank() { T.line(''); },
    art(text) {
      const d = document.createElement('div');
      d.className = 'line art';
      d.textContent = text.replace(/^\n/, '').replace(/\s+$/, '');
      termEl.append(d);
    },
    center(text, cls) { T.line(' '.repeat(Math.max(0, Math.floor((COLS - text.length) / 2))) + text, cls); },
    rule() { T.line('-'.repeat(COLS), 'dim'); },
    pair(label, value) { T.line(`${label}`.padEnd(20) + `${value}`); },
  };

  let pending = null; // the one active prompt
  function cancelPending() { if (pending) { pending.cleanup(); pending = null; } }

  // Free-text prompt. Resolves with the typed string.
  function ask(promptText, opts) {
    opts = opts || {};
    cancelPending();
    return new Promise((resolve) => {
      const row = document.createElement('div');
      row.className = 'prompt';
      const label = document.createElement('span');
      label.textContent = promptText;
      const input = document.createElement('input');
      input.id = 'term-input';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('autocapitalize', 'characters');
      input.setAttribute('aria-label', promptText.trim());
      if (opts.maxLength) input.maxLength = opts.maxLength;
      if (opts.numeric) input.inputMode = 'numeric';
      if (opts.placeholder) input.placeholder = opts.placeholder;
      row.append(label, input);
      termEl.append(row);
      const focusIt = () => input.focus({ preventScroll: true });
      if (!coarse || opts.forceFocus) focusIt();
      row.scrollIntoView({ block: 'nearest' });
      const done = (val) => { cleanup(); pending = null; row.replaceWith(Object.assign(document.createElement('div'), { className: 'line', textContent: promptText + val })); resolve(val); };
      const onKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); Sound.unlock(); done(input.value.trim()); }
        else if (opts.instant && /^[0-9]$/.test(e.key) && !input.value) {
          const n = Number(e.key);
          if (opts.instant(n)) { e.preventDefault(); e.stopPropagation(); Sound.unlock(); done(e.key); }
        }
      };
      const onTermClick = () => focusIt();
      input.addEventListener('keydown', onKey);
      termEl.addEventListener('click', onTermClick);
      function cleanup() { input.removeEventListener('keydown', onKey); termEl.removeEventListener('click', onTermClick); }
      pending = { cleanup, submit: done };
    });
  }

  // A tappable terminal line that submits a number to the active prompt.
  function option(text, n) {
    const el = T.line(text, 'opt');
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    const go = () => { if (pending) { Sound.unlock(); Sound.click(); pending.submit(String(n)); } };
    el.addEventListener('click', (e) => { e.stopPropagation(); go(); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); go(); } });
    return el;
  }

  // Prompt until one of nums is typed or tapped.
  async function pick(nums, promptText) {
    for (;;) {
      const v = await ask(promptText || 'What is your choice? ', { maxLength: 2, numeric: true, instant: nums.length < 10 ? (n) => nums.includes(n) : null });
      const n = parseInt(v, 10);
      if (nums.includes(n)) { Sound.click(); return n; }
      Sound.bad();
    }
  }

  // Numbered menu. Null entries are skipped but keep their number. Resolves with the index.
  async function choose(options, promptText) {
    const nums = [];
    options.forEach((o, i) => { if (o != null) { nums.push(i + 1); option(`  ${i + 1}. ${o}`, i + 1); } });
    T.blank();
    return (await pick(nums, promptText)) - 1;
  }

  // Wait for Enter, Space, or a tap.
  function pause(text) {
    cancelPending();
    return new Promise((resolve) => {
      const el = T.line('', 'opt');
      el.append(document.createTextNode(text || 'Press ENTER to continue'), Object.assign(document.createElement('span'), { className: 'cursor', textContent: ' ' }));
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.scrollIntoView({ block: 'nearest' });
      const finish = () => { cleanup(); pending = null; el.remove(); Sound.unlock(); resolve(); };
      const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); } };
      const onClick = () => finish();
      window.addEventListener('keydown', onKey);
      termEl.addEventListener('click', onClick);
      canvas.addEventListener('click', onClick);
      function cleanup() { window.removeEventListener('keydown', onKey); termEl.removeEventListener('click', onClick); canvas.removeEventListener('click', onClick); }
      pending = { cleanup, submit: finish };
    });
  }

  async function yesNo(q) {
    for (;;) {
      const v = (await ask(q + ' ', { maxLength: 3 })).toUpperCase();
      if (v.startsWith('Y')) return true;
      if (v.startsWith('N')) return false;
      Sound.bad();
    }
  }

  async function number(q, max) {
    for (;;) {
      const v = await ask(q, { maxLength: 5, numeric: true, forceFocus: true });
      if (v === '') return 0;
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n >= 0 && n <= max) return n;
      Sound.bad();
      T.say(`Enter a number from 0 to ${max}.`, 'dim');
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, FAST ? 0 : ms));
  const money = (n) => '$' + n.toFixed(2);
  const rounds = (boxes) => Math.floor(boxes * 20);
  const paceName = () => OT.PACES.find((p) => p.id === G.pace).name.toLowerCase();
  const ratName = () => OT.RATIONS.find((r) => r.id === G.rations).name.toLowerCase();

  // ---------- ASCII art (drawn for this remake) ----------
  const BANNER = String.raw`
 _____  ___    _    ___  _
|_   _|| _ \  /_\  |_ _|| |
  | |  |   / / _ \  | | | |__
  |_|  |_|_\/_/ \_\|___||____|
 __      __ ___  ___  _____
 \ \    / /| __|/ __||_   _|
  \ \/\/ / | _| \__ \  | |
   \_/\_/  |___||___/  |_|    1848`;

  const WAGON = String.raw`
        ___________
      /'           '\
     /   _   _   _   \__   ___  ___
    |___________________|=|o__||o__|
     (_)           (_)     "" ""  ""`;

  function tombstone(name, epitaph, date) {
    const inner = 24;
    const c = (t) => { t = String(t).slice(0, inner); const l = Math.floor((inner - t.length) / 2); return '|' + ' '.repeat(l) + t + ' '.repeat(inner - t.length - l) + '|'; };
    return [
      '       ' + '_'.repeat(inner - 6),
      '     /' + ' '.repeat(inner - 2) + '\\',
      '    ' + c(''),
      '    ' + c('HERE LIES'),
      '    ' + c(name.toUpperCase()),
      '    ' + c(''),
      '    ' + c(epitaph || ''),
      '    ' + c(''),
      '    ' + c(date),
      ' ' + '"'.repeat(inner + 8),
    ].join('\n');
  }

  function progressBar() {
    const total = 1907;
    const width = 30;
    const f = Math.min(1, G.milesTraveled / total);
    const n = Math.round(f * width);
    return '[' + '='.repeat(Math.max(0, n - 1)) + (n ? '>' : '') + ' '.repeat(width - n) + ']';
  }

  // Route as a vertical ASCII chart: past, current, and the road ahead.
  function routeLines() {
    const lines = [];
    const visited = new Set(G.path);
    let id = 'independence';
    let miles = 0;
    const seen = new Set();
    while (id && !seen.has(id)) {
      seen.add(id);
      const lm = OT.LANDMARKS[id];
      const here = !G.next && G.at === id;
      const mark = here ? '@' : visited.has(id) ? '*' : '.';
      lines.push(` ${mark} ${lm.name.replace(' Crossing', '').replace(', Missouri', '').replace(', Oregon', '').padEnd(24)}${String(miles).padStart(5)}`);
      if (G.next && G.path[G.path.length - 1] === id) lines.push(`   :  ${G.segmentLength - G.milesToNext} of ${G.segmentLength} miles  <- you`);
      if (!lm.next.length) break;
      // Follow the branch actually taken, otherwise the first branch.
      let idx = lm.next.findIndex((n) => visited.has(n) || n === G.next);
      if (idx < 0) idx = 0;
      if (lm.next.length > 1 && !visited.has(lm.next[idx]) && G.next !== lm.next[idx]) lines.push(`   :  (fork: ${lm.next.map((n) => OT.LANDMARKS[n].name.split(' ').slice(-2).join(' ')).join(' / ')})`);
      miles += lm.dist[idx];
      id = lm.next[idx];
    }
    return lines;
  }

  // ---------- Title ----------
  async function title() {
    cancelPending();
    G = null;
    for (;;) {
      picture((f) => Art.titleScene(ctx, f));
      T.clear();
      T.art(BANNER);
      T.blank();
      T.say('You may:');
      const saved = store.get('save', null);
      const opts = [
        'Travel the trail',
        'Learn about the trail',
        'See the Oregon Top Ten',
        `Turn sound ${Sound.muted ? 'on' : 'off'}`,
        saved ? `Continue ${saved.party[0].name}'s journey` : null,
      ];
      const c = await choose(opts);
      if (c === 0) { Sound.title(); return setup(); }
      if (c === 1) await learn();
      if (c === 2) await topTen();
      if (c === 3) toggleSound();
      if (c === 4) { G = saved; return resume(); }
    }
  }

  function toggleSound() {
    const m = Sound.toggle();
    document.getElementById('mute').textContent = m ? 'SOUND OFF' : 'SOUND ON';
  }

  async function learn() {
    const pages = [
      'Try taking a journey by covered wagon across 2000 miles of plains, rivers, and mountains. Try! On the plains, will you slosh your oxen through mud and water-filled ruts or will you plod through dust six inches deep?',
      'You will need to buy oxen, food, clothing, bullets and spare parts before you leave Independence, Missouri. Prices rise at every fort along the way.',
      'Pace and rations decide how fast you go and how fast your party wears out. Rest when health turns poor. Rivers can be forded, floated, or crossed by ferry if you can pay.',
      'Riders may block the trail. When told, type the word on the screen as fast as you can and press ENTER. Speed decides the outcome.',
      'You score points for every survivor, for supplies and money left over. A carpenter earns double points and a farmer earns triple.',
    ];
    picture(null);
    for (const p of pages) {
      T.clear();
      T.center('THE TRAIL WEST');
      T.rule();
      T.say(p);
      T.blank();
      await pause();
    }
  }

  const LEGENDS = [
    ['Narcissa W.', 7650], ['Jesse A.', 6200], ['Tabitha B.', 5400], ['Peter B.', 4100], ['Marcus W.', 3200],
    ['Ezra M.', 2600], ['Nancy H.', 1900], ['Elijah W.', 1300], ['Lucy T.', 800], ['Jason L.', 400],
  ];
  const rating = (sc) => (sc >= 7000 ? 'Trail guide' : sc >= 3000 ? 'Adventurer' : sc >= 1000 ? 'Settler' : 'Greenhorn');

  async function topTen() {
    const mine = store.get('top', []);
    const list = LEGENDS.map(([name, score]) => ({ name, score })).concat(mine).sort((a, b) => b.score - a.score).slice(0, 10);
    picture(null);
    T.clear();
    T.center('THE OREGON TOP TEN');
    T.blank();
    T.line('Name'.padEnd(16) + 'Points'.padStart(8) + '  Rating', 'dim');
    T.rule();
    for (const r of list) T.line(r.name.slice(0, 15).padEnd(16) + String(r.score).padStart(8) + '  ' + rating(r.score));
    T.blank();
    T.say('Scores are kept in this browser.', 'dim');
    await pause();
  }

  // ---------- Setup ----------
  async function setup() {
    picture((f) => Art.titleScene(ctx, f));
    let occ;
    for (;;) {
      T.clear();
      T.say('Many kinds of people made the trip to Oregon.');
      T.blank();
      T.say('You may:');
      const c = await choose(['Be a banker from Boston', 'Be a carpenter from Ohio', 'Be a farmer from Illinois', 'Find out the differences between these choices']);
      if (c < 3) { occ = OT.OCCUPATIONS[c]; break; }
      T.clear();
      T.say('Traveling to Oregon isn\'t easy! But if you\'re a banker, you\'ll have more money for supplies and services than a carpenter or a farmer.');
      T.blank();
      T.say('However, the harder you have to try, the more points you deserve! The farmer earns triple points and the carpenter earns double.');
      T.blank();
      await pause();
    }

    const defaults = ['Abigail', 'Thomas', 'Ruth', 'Samuel', 'Clara'];
    let names;
    for (;;) {
      T.clear();
      names = [];
      const first = await ask('Name of the wagon leader? ', { maxLength: 12, placeholder: defaults[0], forceFocus: true });
      names.push(first || defaults[0]);
      T.blank();
      T.say('What are the first names of the four other members in your party?');
      for (let i = 1; i < 5; i++) {
        const n = await ask(`  ${i + 1}. `, { maxLength: 12, placeholder: defaults[i], forceFocus: true });
        names.push(n || defaults[i]);
      }
      names = names.map((n) => n.charAt(0).toUpperCase() + n.slice(1).toLowerCase());
      T.blank();
      if (await yesNo('Are these names correct? (Y/N)')) break;
    }

    let month;
    for (;;) {
      T.clear();
      T.say('It is 1848. Your jumping off place for Oregon is Independence, Missouri. You must decide which month to leave Independence.');
      T.blank();
      const c = await choose(['March', 'April', 'May', 'June', 'July', 'Ask for advice']);
      if (c < 5) { month = OT.START_MONTHS[c]; break; }
      T.clear();
      T.say('You attend a public meeting held for "folks with the California - Oregon fever." You\'re told:');
      T.blank();
      T.say('If you leave too early, there won\'t be any grass for your oxen to eat. If you leave too late, you may not get to Oregon before winter comes. If you leave at just the right time, there will be green grass and the weather will still be cool.');
      T.blank();
      await pause();
    }

    G = OT.newGame({ occupation: occ.id, names, month });
    T.clear();
    T.say(`Before leaving Independence you should buy equipment and supplies. You have ${money(G.money)} in cash, but you don't have to spend it all now.`);
    T.blank();
    T.say('You can buy whatever you need at Hiram\'s General Store.');
    T.blank();
    await pause();
    await shop(true);
    G.status = 'landmark';
    autosave();
    T.clear();
    landmarkPicture('independence');
    T.say(`Well then, you're ready to start. Good luck! You have a long and difficult journey ahead of you.`);
    T.blank();
    await pause();
    OT.depart(G, 0);
    return travel();
  }

  async function resume() {
    if (G.status === 'travel') return sizeUp();
    return landmark(false);
  }

  // ---------- Store ----------
  const ITEMS = [
    ['oxen', 'Oxen'], ['food', 'Food'], ['clothing', 'Clothing'], ['bullets', 'Ammunition'], ['wheel', 'Spare wheels'], ['axle', 'Spare axles'], ['tongue', 'Spare tongues'],
  ];
  const ITEM_HELP = {
    oxen: (p) => `There are 2 oxen in a yoke. I recommend at least 3 yoke. I charge ${money(p * 2)} a yoke.\n`,
    food: (p) => `I recommend you take at least 200 pounds of food for each person in your family. I see that you have 5 people in all. You'll need flour, sugar, bacon, and coffee. My price is ${Math.round(p * 100)} cents a pound.\n`,
    clothing: (p) => `You'll need warm clothing in the mountains. I recommend taking at least 2 sets of clothes per person. Each set is ${money(p)}.\n`,
    bullets: (p) => `I sell ammunition in boxes of 20 bullets. Each box costs ${money(p)}.\n`,
    wheel: (p) => `It's a good idea to have a few spare parts for your wagon. Wagon wheels are ${money(p)} each.\n`,
    axle: (p) => `Wagon axles are ${money(p)} each.\n`,
    tongue: (p) => `Wagon tongues are ${money(p)} each.\n`,
  };

  async function shop(opening) {
    picture(null);
    const prices = OT.prices(G);
    const cart = {};
    ITEMS.forEach(([k]) => (cart[k] = 0));
    const cost = (k) => (k === 'oxen' ? cart[k] * 2 : cart[k]) * prices[k];
    const total = () => ITEMS.reduce((a, [k]) => a + cost(k), 0);
    const lm = OT.LANDMARKS[G.at];
    for (;;) {
      T.clear();
      T.center(opening ? "HIRAM'S GENERAL STORE" : lm.name.toUpperCase());
      T.center(opening ? 'Independence, Missouri' : 'Trading post');
      T.center(OT.dateString(G));
      T.rule();
      ITEMS.forEach(([k, name], i) => {
        const right = opening ? money(cost(k)) : k === 'oxen' ? `${money(prices[k] * 2)}/yoke` : k === 'food' ? `${money(prices[k])}/lb` : money(prices[k]);
        option(`${i + 1}. ${name}`.padEnd(COLS - 14) + right.padStart(14), i + 1);
      });
      T.rule();
      if (opening) T.line('Total bill:'.padEnd(28) + money(total()).padStart(12));
      T.line('Amount you have:'.padEnd(28) + money(G.money).padStart(12));
      T.blank();
      option(`8. ${opening ? 'Leave the store' : 'Done shopping'}`, 8);
      T.blank();
      const n = await pick([1, 2, 3, 4, 5, 6, 7, 8], 'Which item would you like to buy? ');
      if (n <= 7) {
        const [k, name] = ITEMS[n - 1];
        T.clear();
        T.center(name.toUpperCase());
        T.rule();
        T.say(ITEM_HELP[k](prices[k]));
        const unit = k === 'oxen' ? 'yoke' : k === 'food' ? 'pounds' : k === 'bullets' ? 'boxes' : k === 'clothing' ? 'sets' : '';
        const room = k === 'oxen' ? Math.floor((OT.LIMITS.oxen - G.oxen) / 2) : OT.LIMITS[k] - Math.floor(G[k]);
        const qty = await number(`How many ${unit ? unit + ' ' : ''}do you want? `, room);
        if (opening) cart[k] = qty;
        else if (qty > 0) {
          const r = OT.buy(G, k, k === 'oxen' ? qty * 2 : qty);
          r.ok ? Sound.good() : Sound.bad();
          T.say(r.msg);
          await pause();
        }
        continue;
      }
      if (!opening) return;
      if (total() > G.money + 1e-9) {
        Sound.bad();
        T.blank();
        T.say(`That comes to ${money(total())}, but you only have ${money(G.money)}. Let's go over the list again.`);
        await pause();
        continue;
      }
      if (cart.oxen < 1) { Sound.bad(); T.blank(); T.say("Don't forget, you'll need oxen to pull your wagon."); await pause(); continue; }
      ITEMS.forEach(([k]) => { if (cart[k] > 0) OT.buy(G, k, k === 'oxen' ? cart[k] * 2 : cart[k]); });
      T.blank();
      T.say(`Thank you for your business. You have ${money(G.money)} left.`);
      await pause();
      return;
    }
  }

  // ---------- Status ----------
  function statusBlock() {
    T.pair('Date:', OT.dateString(G));
    T.pair('Weather:', OT.weatherString(G.weather));
    T.pair('Health:', OT.healthLabel(G.health));
    T.pair('Food:', `${Math.floor(G.food)} pounds`);
    if (G.next) T.pair('Next landmark:', `${G.milesToNext} miles`);
    T.pair('Miles traveled:', `${G.milesTraveled} miles`);
  }

  // ---------- Travel ----------
  async function travel() {
    G.status = 'travel';
    const zone = OT.LANDMARKS[G.next].zone;
    let moving = true;
    picture((f) => { if (moving) travelOffset += 0.6; Art.travelScene(ctx, { zone, weather: G.weather, offset: travelOffset, frame: moving ? f : 0, oxen: G.oxen }); });
    let stop = false;
    const onStop = (e) => { if (!e.key || e.key === 'Enter' || e.key === ' ') { if (e.preventDefault) e.preventDefault(); stop = true; } };
    const draw = () => {
      T.clear();
      statusBlock();
      T.blank();
      const el = T.line('Press ENTER to size up the situation', 'opt');
      el.tabIndex = 0;
    };
    draw();
    // Attach after the current key or click event finishes, so the Enter that
    // started travel doesn't also stop it.
    await new Promise((r) => setTimeout(r, 0));
    window.addEventListener('keydown', onStop);
    termEl.addEventListener('click', onStop);
    canvas.addEventListener('click', onStop);
    const cleanup = () => { window.removeEventListener('keydown', onStop); termEl.removeEventListener('click', onStop); canvas.removeEventListener('click', onStop); };
    try {
      for (;;) {
        await sleep(FAST ? 0 : 520);
        if (FAST) await new Promise((r) => setTimeout(r, 8));
        if (stop) { moving = false; cleanup(); return sizeUp(); }
        const res = OT.travelDay(G);
        draw();
        const events = res.events.filter((e) => e.type !== 'nofood' || G.food <= 0);
        if (events.length || G.status === 'dead' || res.arrived) {
          moving = false;
          cleanup();
          T.clear();
          statusBlock();
          await showEvents(events);
          if (G.status === 'dead') return gameOver();
          if (res.arrived) return arrival();
          if (G.broken) return broken();
          if (events.some((e) => e.type === 'blocked')) return sizeUp();
          return travel();
        }
      }
    } finally { cleanup(); }
  }

  async function showEvents(events) {
    for (const e of events) {
      if (e.type === 'riders') { await riders(); continue; }
      T.blank();
      if (e.type === 'death') Sound.death(); else if (e.type === 'good' || e.type === 'recover') Sound.good(); else Sound.bad();
      T.say(e.msg, 'inv');
      await pause();
    }
  }

  // The 1978 game's shootout: type the word as fast as you can.
  async function riders() {
    Sound.bad();
    T.clear();
    statusBlock();
    T.blank();
    T.say('RIDERS AHEAD. THEY LOOK HOSTILE.', 'inv');
    if (G.bullets <= 0) {
      T.say('You have no bullets.');
      const r = OT.resolveRiders(G, Infinity);
      r.msgs.forEach((m) => T.say(m));
      await pause();
      return;
    }
    await pause('Press ENTER when you are ready to draw');
    const word = ['BANG', 'BLAM', 'POW', 'WHAM'][Math.floor(Math.random() * 4)];
    T.blank();
    T.say(`TYPE ${word}`);
    const t0 = performance.now();
    const typed = (await ask('> ', { maxLength: 6, forceFocus: true })).toUpperCase();
    const ms = typed === word ? performance.now() - t0 : Infinity;
    Sound.shot();
    const r = OT.resolveRiders(G, ms);
    T.blank();
    if (ms !== Infinity) T.say(`Reaction time: ${(ms / 1000).toFixed(2)} seconds.`, 'dim');
    r.msgs.forEach((m) => T.say(m));
    await pause();
  }

  async function broken() {
    for (;;) {
      const part = G.broken;
      if (!part) return sizeUp();
      T.clear();
      statusBlock();
      T.blank();
      T.say(`Broken wagon ${part}. You have ${G[part]} spare.`);
      T.blank();
      const c = await choose(['Try to fix it (takes a day)', `Replace it with a spare`, 'Look for someone to trade', 'Check supplies']);
      if (c === 0) { const r = OT.repair(G); T.say(r.msg); r.ok ? Sound.good() : Sound.bad(); await pause(); }
      else if (c === 1) { const r = OT.replacePart(G); T.say(r.msg); r.ok ? Sound.good() : Sound.bad(); await pause(); }
      else if (c === 2) await trade();
      else await supplies();
      if (G.status === 'dead') return gameOver();
    }
  }

  // Menu while stopped on the trail.
  async function sizeUp() {
    G.status = 'travel';
    if (G.broken) return broken();
    autosave();
    for (;;) {
      const zone = OT.LANDMARKS[G.next].zone;
      picture((f) => Art.travelScene(ctx, { zone, weather: G.weather, offset: travelOffset, frame: 0, oxen: G.oxen }));
      T.clear();
      statusBlock();
      T.pair('Pace:', paceName());
      T.pair('Rations:', ratName());
      T.blank();
      T.say('You may:');
      const c = await choose(['Continue on trail', 'Check supplies', 'Look at map', 'Change pace', 'Change food rations', 'Stop to rest', 'Attempt to trade', 'Hunt for food', 'Save and quit']);
      if (c === 0) {
        if (G.oxen <= 0) { Sound.bad(); T.say('You have no oxen to pull the wagon. Try trading for some.'); await pause(); continue; }
        return travel();
      }
      if (await commonAction(c)) return;
      if (G.status === 'dead') return gameOver();
      if (G.broken) return broken();
    }
  }

  // Shared menu actions. Returns true if control flow left this menu.
  async function commonAction(c) {
    if (c === 1) await supplies();
    else if (c === 2) await map();
    else if (c === 3) await pace();
    else if (c === 4) await rations();
    else if (c === 5) await rest();
    else if (c === 6) await trade();
    else if (c === 7) await hunt();
    else if (c === 8) { autosave(); await title(); return true; }
    return false;
  }

  async function supplies() {
    T.clear();
    T.center('YOUR SUPPLIES');
    T.rule();
    T.pair('oxen', G.oxen + (G.oxInjured ? ' (1 injured)' : ''));
    T.pair('sets of clothing', G.clothing);
    T.pair('bullets', rounds(G.bullets));
    T.pair('wagon wheels', G.wheel);
    T.pair('wagon axles', G.axle);
    T.pair('wagon tongues', G.tongue);
    T.pair('pounds of food', Math.floor(G.food));
    T.pair('money left', money(G.money));
    T.blank();
    T.center('YOUR PARTY');
    T.rule();
    for (const p of G.party) T.pair(p.name + (p.leader ? '*' : ''), p.alive ? (p.ill ? p.ill.what.replace(/^a /, '') : 'well') : 'died');
    T.blank();
    await pause();
  }

  async function map() {
    picture((f) => Art.mapScene(ctx, { landmarks: OT.LANDMARKS, path: G.path, next: G.next, milesToNext: G.milesToNext, segmentLength: G.segmentLength }));
    T.clear();
    T.center('MAP OF THE TRAIL');
    T.blank();
    T.art(routeLines().join('\n'));
    T.blank();
    T.line(' ' + progressBar());
    T.line(` ${G.milesTraveled} miles traveled`, 'dim');
    T.blank();
    await pause();
  }

  async function pace() {
    T.clear();
    T.say(`Change pace (currently "${paceName()}")`);
    T.blank();
    OT.PACES.forEach((p) => T.say(`${p.name}: ${p.desc}`, 'dim'));
    T.blank();
    const c = await choose(OT.PACES.map((p) => `a ${p.name.toLowerCase()} pace`).concat(['find out what these different paces mean']));
    if (c < 3) G.pace = OT.PACES[c].id;
  }

  async function rations() {
    T.clear();
    T.say(`Change food rations (currently "${ratName()}")`);
    T.blank();
    const c = await choose(OT.RATIONS.map((r) => `${r.name} - ${r.lbs} lb per person per day`.replace(' - ', ': ')));
    G.rations = OT.RATIONS[c].id;
  }

  async function rest() {
    T.clear();
    const n = await number('How many days would you like to rest? ', 9);
    if (!n) return;
    const ev = OT.rest(G, n);
    T.clear();
    statusBlock();
    T.blank();
    for (const e of ev) T.say(e.msg);
    T.say(`You rested ${n} day${n > 1 ? 's' : ''}. Health is ${OT.healthLabel(G.health)}.`);
    await pause();
  }

  async function trade() {
    T.clear();
    const offer = OT.tradeOffer(G);
    if (!offer) { T.say('Nobody wants to trade with you today.'); await pause(); return; }
    const l = (o) => `${o.qty} ${OT.ITEM_LABEL[o.item]}`;
    T.say(`You meet another emigrant who wants ${l(offer.give)}. They will trade you ${l(offer.get)}.`);
    T.blank();
    if (G[offer.give.item] < offer.give.qty) { T.say("You don't have this.", 'dim'); await pause(); return; }
    if (await yesNo('Are you willing to trade? (Y/N)')) { const r = OT.acceptTrade(G, offer); Sound.good(); T.say(r.msg); await pause(); }
  }

  async function talk() {
    const lines = OT.TALK[G.at];
    if (!lines) return;
    const i = (G.talkIndex = ((G.talkIndex || 0) + 1)) % lines.length;
    const [who, text] = lines[i];
    T.clear();
    T.say(`${who} tells you:`, 'dim');
    T.blank();
    T.say(`"${text}"`);
    T.blank();
    await pause();
  }

  // ---------- Landmarks ----------
  function blurb(id) {
    return ({
      kansas: 'The first big river west of Independence. Ferries run when the water is high.',
      bigblue: 'A clear, quick river. Trains often camp at the springs nearby.',
      kearney: 'A new army post on the Platte River, built to protect emigrants.',
      chimney: 'A tall spire of clay and sandstone, visible for days across the plains.',
      laramie: 'An old trading post at the edge of the high plains. Last good resupply for weeks.',
      indrock: 'A granite dome covered with the names of travelers who came before.',
      southpass: 'The gentle crossing of the Continental Divide.',
      green: 'A deep, cold river. Few try to ford it.',
      bridger: 'A trading post run by mountain man Jim Bridger.',
      soda: 'Springs of naturally bubbling water.',
      hall: 'A Hudson\'s Bay Company post on the Snake River plain.',
      snake: 'A wide, dangerous crossing. The Shoshone know the safe routes.',
      boise: 'A small fort along the Snake. The Blue Mountains rise to the west.',
      bluemtns: 'Steep, forested ridges.',
      wallawalla: 'A trading post near the Columbia River.',
      dalles: 'The overland trail ends at the Columbia River.',
    })[id] || '';
  }

  async function arrival() {
    Sound.arrive();
    autosave();
    if (G.status === 'won') return finish();
    const lm = OT.LANDMARKS[G.at];
    landmarkPicture(G.at);
    T.clear();
    T.say(`You are now at ${lm.name}.`);
    T.say(OT.dateString(G), 'dim');
    T.blank();
    if (lm.type !== 'river' && await yesNo('Would you like to look around? (Y/N)')) {
      T.blank();
      T.say(blurb(G.at));
      T.blank();
      await pause();
    }
    return landmark(true);
  }

  async function landmark() {
    for (;;) {
      const lm = OT.LANDMARKS[G.at];
      if (G.status === 'dead') return gameOver();
      if (G.status === 'won') return finish();
      if (G.status === 'river') return river();
      if (G.status === 'dalles') return dalles();
      landmarkPicture(G.at);
      autosave();
      T.clear();
      T.line(lm.name, 'inv');
      T.line(OT.dateString(G));
      T.blank();
      T.pair('Weather:', OT.weatherString(G.weather));
      T.pair('Health:', OT.healthLabel(G.health));
      T.pair('Pace:', paceName());
      T.pair('Rations:', ratName());
      T.blank();
      T.say('You may:');
      const fort = lm.type === 'fort';
      const c = await choose(['Continue on trail', 'Check supplies', 'Look at map', 'Change pace', 'Change food rations', 'Stop to rest', 'Attempt to trade', 'Hunt for food', 'Save and quit', OT.TALK[G.at] ? 'Talk to people' : null, fort ? 'Buy supplies' : null]);
      if (c === 0) {
        if (G.oxen <= 0) { Sound.bad(); T.say('You have no oxen to pull the wagon.'); await pause(); continue; }
        if (G.status === 'fork') return fork();
        OT.depart(G, 0);
        return travel();
      }
      if (c === 9) { await talk(); continue; }
      if (c === 10) { await shop(false); continue; }
      if (await commonAction(c)) return;
      if (G.broken) { G.broken = null; } // repairs happen in camp at landmarks
    }
  }

  async function fork() {
    const lm = OT.LANDMARKS[G.at];
    for (;;) {
      T.clear();
      T.say('The trail divides here. You may:');
      T.blank();
      const c = await choose([...lm.fork.map((f, i) => `${f} (${lm.dist[i]} mi)`), 'See the map']);
      if (c === lm.fork.length) { await map(); landmarkPicture(G.at); continue; }
      OT.depart(G, c);
      return travel();
    }
  }

  // ---------- Rivers ----------
  async function river() {
    const lm = OT.LANDMARKS[G.at];
    for (;;) {
      const r = G.river;
      landmarkPicture(G.at);
      T.clear();
      T.line(lm.name, 'inv');
      T.line(OT.dateString(G));
      T.blank();
      T.pair('Weather:', OT.weatherString(G.weather));
      T.pair('River width:', `${r.width} feet`);
      T.pair('River depth:', `${r.depth.toFixed(1)} feet`);
      T.blank();
      T.say('You must cross the river in order to continue. You may:');
      const opts = [
        'attempt to ford the river',
        'caulk the wagon and float it across',
        lm.ferry ? `take a ferry across ($${lm.ferry})` : null,
        lm.guide ? 'hire a Shoshone guide (3 sets of clothing)' : null,
        'wait to see if conditions improve',
        'get more information',
      ];
      const c = await choose(opts);
      if (c === 4) { const ev = OT.riverWait(G); ev.forEach((e) => T.say(e.msg)); if (G.status === 'dead') return gameOver(); continue; }
      if (c === 5) {
        T.clear();
        T.say('To ford a river means to pull your wagon across a shallow part of the river, with the oxen still attached. It is safe only in water under about 2.5 feet.');
        T.blank();
        T.say(`To caulk the wagon means to seal it so that no water can get in. The wagon can then be floated across like a boat. The current here is ${r.swift ? 'swift, which makes this riskier' : 'moderate'}.`);
        T.blank();
        if (lm.ferry) T.say(`A ferry costs $${lm.ferry} and you may have to wait ${r.ferryWait} day${r.ferryWait > 1 ? 's' : ''}.`);
        if (lm.guide) T.say('A Shoshone guide knows the safe route and asks 3 sets of clothing.');
        T.blank();
        await pause();
        continue;
      }
      const method = ['ford', 'caulk', 'ferry', 'guide'][c];
      const res = OT.crossRiver(G, method);
      if (!res.ok) { Sound.bad(); T.blank(); res.msgs.forEach((m) => T.say(m)); await pause(); continue; }
      await crossingAnimation(method, lm.zone);
      T.clear();
      const bad = res.msgs.some((m) => /lost|drown|tipped|stuck/i.test(m));
      bad ? Sound.bad() : Sound.good();
      res.msgs.forEach((m) => T.say(m, bad ? 'inv' : ''));
      T.blank();
      await pause();
      if (G.status === 'dead') return gameOver();
      return landmark();
    }
  }

  function crossingAnimation(method, zone) {
    return new Promise((resolve) => {
      let p = 0;
      T.clear();
      T.say('Crossing...');
      picture((f) => {
        p = Math.min(1, p + (FAST ? 0.2 : 0.006));
        Art.crossingScene(ctx, { zone, frame: f, progress: p, method });
        if (p >= 1 && anim) { anim = null; resolve(); }
      });
    });
  }

  // ---------- The Dalles ----------
  async function dalles() {
    for (;;) {
      landmarkPicture('dalles');
      T.clear();
      T.line('The Dalles', 'inv');
      T.line(OT.dateString(G));
      T.blank();
      T.say('The trail divides here. You may:');
      const c = await choose(['float down the Columbia River', `take the Barlow Toll Road ($${OT.BARLOW_TOLL})`, 'check supplies', 'talk to people']);
      if (c === 0) return raft();
      if (c === 1) {
        const r = OT.takeBarlow(G);
        if (!r.ok) { Sound.bad(); T.say(r.msg); await pause(); continue; }
        T.clear();
        r.msgs.forEach((m) => T.say(m));
        await pause();
        return G.status === 'dead' ? gameOver() : finish();
      }
      if (c === 2) await supplies();
      if (c === 3) await talk();
    }
  }

  // ---------- Hunting ----------
  function hunt() {
    if (G.bullets < 0.05) { T.blank(); T.say('You have no bullets.'); Sound.bad(); return pause(); }
    return new Promise((resolve) => {
      const zone = OT.huntZone(G);
      const kinds = OT.HUNT_ANIMALS[zone];
      const rng = OT.makeRng(G.day * 31 + G.rngState);
      const brush = Array.from({ length: 6 }, (_, i) => ({ x: 14 + i * 46 + rng.int(-8, 8), y: 118 + rng.int(0, 30), tree: zone === 'rockies' || zone === 'cascades' ? rng.chance(0.5) : false }));
      const animals = [], flashes = [], kills = [];
      let fired = 0, shots = rounds(G.bullets), aim = { x: 140, y: 120 }, timeLeft = FAST ? 30 : 30 * 60, over = false;
      T.clear();
      T.say('HUNTING', 'inv');
      T.say(coarse ? 'Tap an animal to shoot.' : 'Click an animal, or aim with the arrow keys and press SPACE.');
      const info = T.line('');
      const stopEl = T.line('Press ENTER to stop hunting', 'opt');
      const upd = () => { info.textContent = `Bullets: ${shots}   Meat: ${kills.reduce((a, k) => a + OT.ANIMAL_MEAT[k], 0)} lb   ${Math.ceil(timeLeft / 60)}s`; };
      const spawn = () => {
        const kind = rng.pick(kinds), s = Art.ANIMAL_SHAPES[kind], dir = rng.chance(0.5) ? 1 : -1;
        animals.push({ kind, x: dir > 0 ? -30 : Art.W + 10, y: 108 + rng.int(0, 44), vx: dir * s.speed * (0.8 + rng() * 0.6), dead: false });
      };
      const toCanvas = (ev) => { const r = canvas.getBoundingClientRect(); return { x: Math.round((ev.clientX - r.left) / r.width * Art.W), y: Math.round((ev.clientY - r.top) / r.height * Art.H) }; };
      const shoot = (pt) => {
        if (over || shots <= 0) return;
        shots--; fired++; Sound.shot();
        flashes.push({ x: pt.x, y: pt.y, t: 6 });
        for (const a of animals) {
          if (a.dead) continue;
          const s = Art.ANIMAL_SHAPES[a.kind], pad = s.w < 10 ? 4 : 2;
          if (pt.x >= a.x - pad && pt.x <= a.x + s.w + pad && pt.y >= a.y - s.h - pad && pt.y <= a.y + pad) { a.dead = true; a.vx = 0; kills.push(a.kind); Sound.hit(); break; }
        }
        upd();
        if (shots <= 0) end();
      };
      const onMove = (ev) => { aim = toCanvas(ev); };
      const onDown = (ev) => { ev.preventDefault(); Sound.unlock(); aim = toCanvas(ev); shoot(aim); };
      const onKey = (ev) => {
        const k = ev.key;
        if (k === 'ArrowLeft') aim.x = Math.max(0, aim.x - 6);
        else if (k === 'ArrowRight') aim.x = Math.min(Art.W, aim.x + 6);
        else if (k === 'ArrowUp') aim.y = Math.max(90, aim.y - 6);
        else if (k === 'ArrowDown') aim.y = Math.min(Art.H, aim.y + 6);
        else if (k === ' ') shoot(aim);
        else if (k === 'Enter') end();
        else return;
        ev.preventDefault();
      };
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerdown', onDown);
      window.addEventListener('keydown', onKey);
      stopEl.addEventListener('click', () => end());
      async function end() {
        if (over) return;
        over = true;
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('keydown', onKey);
        const r = OT.finishHunt(G, fired, kills);
        T.clear();
        T.say(r.msg);
        T.blank();
        await pause();
        resolve();
      }
      upd();
      for (let i = 0; i < 3; i++) spawn();
      picture((f) => {
        if (!over) {
          timeLeft--;
          if (f % 30 === 0) upd();
          if (timeLeft <= 0) end();
          if (rng.chance(0.012) && animals.filter((a) => !a.dead).length < 5) spawn();
          for (const a of animals) a.x += a.vx;
          for (let i = animals.length - 1; i >= 0; i--) if (!animals[i].dead && (animals[i].x < -40 || animals[i].x > Art.W + 40)) animals.splice(i, 1);
        }
        for (let i = flashes.length - 1; i >= 0; i--) if (--flashes[i].t <= 0) flashes.splice(i, 1);
        Art.huntScene(ctx, { zone, brush, animals, flashes, aim, frame: f });
      });
    });
  }

  // ---------- Rafting ----------
  async function raft() {
    T.clear();
    T.say('You build a raft and load the wagon onto it.');
    T.blank();
    T.say(coarse ? 'Hold the left or right side of the picture to steer around the rocks.' : 'Steer with the LEFT and RIGHT arrow keys, or hold the mouse on either side of the picture.');
    T.blank();
    await pause('Press ENTER to push off');
    const hits = await new Promise((resolve) => {
      const rng = OT.makeRng(G.day * 17 + 99);
      const rocks = [];
      let raftX = Art.W / 2, vx = 0, hits = 0, hitFlash = 0, scroll = 0, t = 0, over = false;
      const dur = FAST ? 60 : 40 * 60;
      const keys = {};
      T.clear();
      T.say('THE COLUMBIA RIVER', 'inv');
      const info = T.line('');
      const upd = () => { info.textContent = `Rocks hit: ${hits}   ${Math.max(0, Math.ceil((dur - t) / 60))}s to go`; };
      const onKey = (ev) => { if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { keys[ev.key] = ev.type === 'keydown'; ev.preventDefault(); } };
      let hold = 0;
      const onDown = (ev) => { const r = canvas.getBoundingClientRect(); hold = (ev.clientX - r.left) < r.width / 2 ? -1 : 1; };
      const onUp = () => { hold = 0; };
      window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
      canvas.addEventListener('pointerdown', onDown); window.addEventListener('pointerup', onUp); canvas.addEventListener('pointerleave', onUp);
      upd();
      picture((f) => {
        if (!over) {
          t++;
          if (f % 20 === 0) upd();
          if (t > dur) {
            over = true;
            window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey);
            canvas.removeEventListener('pointerdown', onDown); window.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointerleave', onUp);
            resolve(hits);
          }
          const speed = 1.2 + (t / dur) * 1.3;
          scroll += speed;
          if (rng.chance(0.028 + (t / dur) * 0.02)) rocks.push({ x: 56 + rng() * (Art.W - 112), y: -10, r: rng.int(5, 10) });
          for (const r of rocks) r.y += speed;
          for (let i = rocks.length - 1; i >= 0; i--) if (rocks[i].y > Art.H + 20) rocks.splice(i, 1);
          let target = 0;
          if (keys.ArrowLeft || hold < 0) target -= 2.2;
          if (keys.ArrowRight || hold > 0) target += 2.2;
          vx += (target - vx) * 0.25;
          raftX = Math.max(58, Math.min(Art.W - 58, raftX + vx));
          if (hitFlash > 0) hitFlash--;
          else for (const r of rocks) if (Math.abs(r.x - raftX) < r.r + 12 && Math.abs(r.y - 139) < r.r / 2 + 7) { hits++; hitFlash = 50; Sound.bad(); upd(); break; }
        }
        Art.raftScene(ctx, { rocks, raftX, scroll, hitFlash, frame: f });
      });
    });
    const r = OT.finishRaft(G, hits);
    T.clear();
    r.msgs.forEach((m) => T.say(m));
    T.blank();
    await pause();
    return G.status === 'dead' ? gameOver() : finish();
  }

  // ---------- Endings ----------
  async function finish() {
    store.del('save');
    Sound.win();
    picture((f) => Art.landmarkScene(ctx, { id: 'willamette', landmark: OT.LANDMARKS.willamette, weather: null, frame: f, oxen: G.oxen }));
    T.clear();
    T.say('Congratulations! You have made it to Oregon! Let\'s see how many points you have received.');
    T.blank();
    await pause();
    const sc = OT.score(G);
    T.clear();
    T.center('POINTS FOR ARRIVING IN OREGON');
    T.rule();
    for (const [k, c, p] of sc.rows) T.line(`${String(c).padStart(5)} ${k}`.slice(0, 32).padEnd(32) + String(p).padStart(8));
    T.rule();
    T.line('Subtotal'.padEnd(32) + String(sc.raw).padStart(8));
    T.line(`Bonus for ${OT.occupation(G).name.replace('Be a ', '').split(' from')[0]} x${sc.bonus}`.padEnd(32) + String(sc.total).padStart(8), 'inv');
    T.blank();
    T.say(`You arrived on ${OT.dateString(G)} after ${G.milesTraveled} miles. Rating: ${rating(sc.total)}.`);
    T.art(WAGON);
    const top = store.get('top', []);
    top.push({ name: G.party[0].name, score: sc.total });
    store.set('top', top.sort((a, b) => b.score - a.score).slice(0, 20));
    T.blank();
    await pause();
    await topTen();
    return title();
  }

  async function gameOver() {
    store.del('save');
    Sound.death();
    picture(null);
    const leader = G.party[0];
    const d = G.deaths.find((x) => x.name === leader.name) || G.deaths[G.deaths.length - 1] || { cause: 'the hardships of the trail', date: OT.dateString(G) };
    T.clear();
    T.say(leader.alive ? 'Everyone in your party has died.' : `${leader.name} has died of ${d.cause}.`);
    T.blank();
    T.art(tombstone(leader.name, '', d.date.replace(', 1848', '')));
    T.blank();
    const ep = await ask('Your epitaph: ', { maxLength: 24, forceFocus: true, placeholder: 'Type a line, ENTER' });
    T.clear();
    T.art(tombstone(leader.name, ep, d.date.replace(', 1848', '')));
    T.blank();
    T.say(`All the way to ${d.where || 'the trail'}. ${G.milesTraveled} miles.`, 'dim');
    T.blank();
    await pause();
    return title();
  }

  // ---------- boot ----------
  document.getElementById('mute').addEventListener('click', () => { Sound.unlock(); toggleSound(); });
  if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
    try { window.claude.hot.snapshot(() => ({ G })); } catch (e) { /* optional */ }
  }
  const start = (data) => { if (data && data.G) { G = data.G; resume(); } else title(); };
  if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start);
  else start(window.claude && window.claude.hot && window.claude.hot.data);

  window.__TW = { get G() { return G; } };
})();
