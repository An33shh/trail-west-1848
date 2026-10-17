/* Screens, input and animation. Depends on OT (engine), Art and Sound. */
(function () {
  'use strict';
  const OT = window.OT, Art = window.Art, Sound = window.Sound;
  const $ = (sel) => document.querySelector(sel);
  const canvas = $('#scene');
  const ctx = canvas.getContext('2d');
  canvas.width = Art.W; canvas.height = Art.H;
  ctx.imageSmoothingEnabled = false;

  const GAME_NAME = 'Trail West 1848';
  let G = null;            // engine state
  let anim = null;         // current canvas animation
  let travelTimer = null;
  let frame = 0;
  let travelOffset = 0;
  const setup = { occupation: 'banker', names: ['', '', '', '', ''], month: 3 };

  // ---------- storage (per-viewer convenience, never required) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('tw1848:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('tw1848:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem('tw1848:' + k); } catch (e) { /* ignore */ } },
  };
  function autosave() { if (G && G.status !== 'won' && G.status !== 'dead') store.set('save', G); }

  // ---------- animation loop ----------
  function loop() {
    requestAnimationFrame(loop);
    frame++;
    if (!anim) return;
    try { anim(frame); } catch (e) { console.error(e); anim = null; }
  }
  requestAnimationFrame(loop);
  function setAnim(fn) { anim = fn; }

  function sceneFor() {
    if (!G) return;
    if (G.status === 'travel') {
      const zone = OT.LANDMARKS[G.next].zone;
      return () => Art.travelScene(ctx, { zone, weather: G.weather, offset: travelOffset, frame: travelTimer ? frame : 0, oxen: G.oxen });
    }
    const id = G.at;
    return (f) => Art.landmarkScene(ctx, { id, landmark: OT.LANDMARKS[id], weather: G.weather, frame: f, oxen: G.oxen, river: G.river });
  }

  // ---------- small DOM helpers ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') el.className = attrs[k];
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }
  function btn(label, onclick, opts) {
    opts = opts || {};
    const b = h('button', { class: 'btn' + (opts.primary ? ' primary' : '') + (opts.on ? ' on' : ''), type: 'button', disabled: opts.disabled, id: opts.id }, label, opts.sub ? h('small', null, opts.sub) : null);
    b.addEventListener('click', () => { Sound.unlock(); Sound.click(); onclick(); });
    return b;
  }
  function panel(...kids) {
    const p = $('#panel');
    p.replaceChildren(...kids.flat().filter(Boolean));
    const first = p.querySelector('button:not([disabled]), input');
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
  }
  const money = (n) => '$' + n.toFixed(2);
  const lbs = (n) => Math.floor(n) + ' lb';
  const rounds = (boxes) => Math.floor(boxes * 20);

  function dialog(messages, onClose, opts) {
    opts = opts || {};
    const msgs = (Array.isArray(messages) ? messages : [messages]).filter(Boolean);
    if (!msgs.length) { onClose && onClose(); return; }
    const scrim = h('div', { class: 'dialog-scrim' });
    const close = () => { scrim.remove(); onClose && onClose(); };
    const ok = h('button', { class: 'btn primary', type: 'button' }, opts.button || 'OK');
    ok.addEventListener('click', () => { Sound.click(); close(); });
    scrim.append(h('div', { class: 'dialog', role: 'alertdialog', 'aria-live': 'assertive' },
      h('div', { class: 'icon', 'aria-hidden': 'true' }, opts.icon || '!'),
      ...msgs.map((m) => h('p', null, m)),
      h('div', { class: 'row end' }, ok)));
    $('.win').append(scrim);
    ok.focus({ preventScroll: true });
  }

  function hud(left, right) {
    const el = $('#hud');
    el.replaceChildren(h('span', null, left || ''), h('span', null, right || ''));
  }

  function renderStatus() {
    const s = $('#status');
    if (!G || G.status === 'store' && G.day === 0) { s.hidden = true; return; }
    s.hidden = false;
    const hl = OT.healthLabel(G.health);
    const cls = { good: 'h-good', fair: 'h-fair', poor: 'h-poor', 'very poor': 'h-very' }[hl];
    const nextLine = G.next ? `${OT.LANDMARKS[G.next].name.replace(' Crossing', '')}, ${G.milesToNext} mi` : OT.LANDMARKS[G.at].name;
    const cells = [
      ['Date', OT.dateString(G)],
      ['Weather', OT.weatherString(G.weather)],
      ['Health', hl],
      ['Food', lbs(G.food)],
      [G.next ? 'Next landmark' : 'Location', nextLine],
      ['Miles traveled', G.milesTraveled],
    ];
    s.replaceChildren(...cells.map(([k, v], i) => h('div', null, h('b', null, k), h('span', { class: i === 2 ? cls : '' }, v))));
  }

  // ---------- Title ----------
  function title() {
    stopTravel();
    G = null;
    renderStatus();
    hud('', '');
    setAnim((f) => Art.titleScene(ctx, f));
    const saved = store.get('save', null);
    panel(
      h('div', { class: 'eyebrow' }, 'Independence, Missouri to the Willamette Valley'),
      h('h1', null, GAME_NAME),
      h('p', null, 'Lead a wagon party of five across 2,000 miles of prairie, desert and mountains before the snow closes the passes.'),
      h('div', { class: 'menu' },
        saved ? btn('Continue journey', () => resume(saved), { primary: true, sub: `${saved.party[0].name}'s party, ${OT.dateString(saved)}` }) : null,
        btn('Travel the trail', () => { Sound.title(); chooseOccupation(); }, { primary: !saved }),
        btn('Learn about the trail', learn),
        btn('See the Oregon Top Ten', topTen),
      ),
      h('p', { class: 'muted' }, 'A clean-room fan remake. All art, sound and writing are original. Keyboard, mouse and touch all work.'),
    );
  }

  function resume(saved) {
    G = saved;
    if (G.status === 'travel') stopMenu(); else landmarkMenu();
  }

  function learn() {
    panel(
      h('h2', null, 'How the trail works'),
      h('p', null, 'You choose an occupation, outfit a wagon in Independence, then travel landmark to landmark. Rivers must be crossed, forts sell supplies at rising prices, and the weather turns against you as the months go by.'),
      h('p', null, 'Pace and rations are the two levers. A grueling pace and bare-bones meals cover ground fast but wear people down until they sicken. Rest at landmarks to recover.'),
      h('p', null, 'Arrive with people in good health, a full wagon and money left over for a high score. Poorer occupations multiply their score: a farmer earns triple, a teacher three and a half times.'),
      h('p', null, 'Hunting: tap or click animals to shoot. Each shot costs one bullet, and you can only carry so much meat back to the wagon.'),
      h('div', { class: 'row' }, btn('Back', title, { primary: true })),
    );
  }

  const LEGENDS = [
    ['Narcissa W.', 7650], ['Jesse A.', 6200], ['Tabitha B.', 5400], ['Peter B.', 4100], ['Marcus W.', 3200],
    ['Ezra M.', 2600], ['Nancy H.', 1900], ['Elijah W.', 1300], ['Lucy T.', 800], ['Jason L.', 400],
  ];
  function topTenList() {
    const mine = store.get('top', []);
    return LEGENDS.map(([n, s]) => ({ name: n, score: s, legend: true })).concat(mine).sort((a, b) => b.score - a.score).slice(0, 10);
  }
  function topTen() {
    const list = topTenList();
    panel(
      h('h2', null, 'The Oregon Top Ten'),
      h('div', { class: 'scroll-x' }, h('table', { class: 'sheet' },
        h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', { class: 'n' }, 'Points'), h('th', null, 'Rating'))),
        h('tbody', null, list.map((r) => h('tr', null, h('td', null, r.name), h('td', { class: 'n' }, r.score), h('td', null, rating(r.score))))))),
      h('p', { class: 'muted' }, 'Scores are kept in this browser only.'),
      h('div', { class: 'row' }, btn('Back', title, { primary: true })),
    );
  }
  function rating(sc) { return sc >= 7000 ? 'Trail guide' : sc >= 3000 ? 'Adventurer' : sc >= 1000 ? 'Settler' : 'Greenhorn'; }

  // ---------- Setup ----------
  function chooseOccupation() {
    setAnim((f) => Art.titleScene(ctx, f));
    panel(
      h('div', { class: 'eyebrow' }, 'Step 1 of 3'),
      h('h2', null, 'Many kinds of people made the trip. What will you be?'),
      h('div', { class: 'menu' }, OT.OCCUPATIONS.map((o) => btn(o.name, () => { setup.occupation = o.id; chooseNames(); }, {
        sub: `$${o.cash} · ${o.bonus === 1 ? 'no bonus' : 'score x' + o.bonus} · ${o.perk}`,
      }))),
      h('div', { class: 'row' }, btn('Back', title)),
    );
  }

  function chooseNames() {
    const labels = ['Wagon leader', 'Traveler 2', 'Traveler 3', 'Traveler 4', 'Traveler 5'];
    const defaults = ['Abigail', 'Thomas', 'Ruth', 'Samuel', 'Clara'];
    const inputs = labels.map((l, i) => h('input', { id: 'name' + i, maxlength: 14, value: setup.names[i] || defaults[i], autocomplete: 'off' }));
    panel(
      h('div', { class: 'eyebrow' }, 'Step 2 of 3'),
      h('h2', null, 'Who is traveling with you?'),
      h('div', { class: 'names' }, labels.map((l, i) => h('label', { for: 'name' + i }, l, inputs[i]))),
      h('div', { class: 'row' }, btn('Back', chooseOccupation), btn('Next', () => {
        setup.names = inputs.map((x, i) => x.value.trim() || defaults[i]);
        chooseMonth();
      }, { primary: true })),
    );
  }

  function chooseMonth() {
    const notes = {
      2: 'Early. Grass is thin and nights are cold.',
      3: 'The usual choice. Rivers run high.',
      4: 'Good grass, warm days.',
      5: 'Hot plains, little margin before snow.',
      6: 'Very late. Expect snow in the mountains.',
    };
    panel(
      h('div', { class: 'eyebrow' }, 'Step 3 of 3'),
      h('h2', null, 'When will you leave Independence?'),
      h('div', { class: 'menu' }, OT.START_MONTHS.map((m) => btn(OT.MONTHS[m], () => { setup.month = m; startGame(); }, { sub: notes[m], on: m === 3 }))),
      h('div', { class: 'row' }, btn('Back', chooseNames)),
    );
  }

  function startGame() {
    G = OT.newGame({ occupation: setup.occupation, names: setup.names, month: setup.month });
    shop(true);
  }

  // ---------- Store ----------
  const ITEMS = [
    ['oxen', 'Oxen', 'sold in yokes of 2', 2],
    ['food', 'Food', 'pounds', 50],
    ['clothing', 'Clothing', 'sets', 1],
    ['bullets', 'Bullets', 'boxes of 20', 1],
    ['wheel', 'Wagon wheels', 'spares', 1],
    ['axle', 'Wagon axles', 'spares', 1],
    ['tongue', 'Wagon tongues', 'spares', 1],
  ];

  function shop(opening) {
    stopTravel();
    renderStatus();
    setAnim(sceneFor());
    const prices = OT.prices(G);
    const cart = {};
    ITEMS.forEach(([k]) => (cart[k] = 0));
    const lm = OT.LANDMARKS[G.at];
    const totalEl = h('span');
    const msgEl = h('p', { class: 'muted', 'aria-live': 'polite' });
    const rows = [];

    function total() { return ITEMS.reduce((a, [k]) => a + cart[k] * prices[k], 0); }
    function refresh() {
      const t = total();
      totalEl.textContent = `Bill ${money(t)} · You have ${money(G.money)}`;
      totalEl.className = t > G.money ? 'h-poor' : '';
      rows.forEach((r) => r());
    }

    const table = h('table', { class: 'sheet' },
      h('thead', null, h('tr', null, h('th', null, 'Item'), h('th', { class: 'n' }, 'Have'), h('th', null, 'Buy'))),
      h('tbody', null, ITEMS.map(([k, name, unit, step]) => {
        const input = h('input', { id: 'buy-' + k, inputmode: 'numeric', value: '0', 'aria-label': 'Buy ' + name });
        const have = h('td', { class: 'n' });
        const set = (v) => {
          const max = OT.LIMITS[k] - G[k];
          cart[k] = Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
          input.value = cart[k];
          refresh();
        };
        input.addEventListener('change', () => set(input.value));
        rows.push(() => { have.textContent = k === 'bullets' ? rounds(G.bullets) : k === 'food' ? Math.floor(G.food) : G[k]; });
        const price = k === 'oxen' ? `${money(prices.oxen * 2)}/yoke` : k === 'food' ? `${money(prices.food)}/lb` : money(prices[k]);
        return h('tr', null,
          h('td', null, name, h('div', { class: 'muted' }, `${price} · ${unit}`)),
          have,
          h('td', null, h('span', { class: 'qty' },
            h('button', { type: 'button', 'aria-label': 'Less ' + name, onclick: () => set(cart[k] - step) }, '-'),
            input,
            h('button', { type: 'button', 'aria-label': 'More ' + name, onclick: () => set(cart[k] + step) }, '+'))));
      })));

    function checkout() {
      const t = total();
      if (t > G.money + 1e-9) { msgEl.textContent = `That bill is ${money(t)}. You only have ${money(G.money)}.`; Sound.bad(); return false; }
      const bought = [];
      ITEMS.forEach(([k]) => { if (cart[k] > 0) { const r = OT.buy(G, k, cart[k]); if (r.ok) bought.push(r.msg); } });
      ITEMS.forEach(([k]) => (cart[k] = 0));
      document.querySelectorAll('[id^="buy-"]').forEach((i) => (i.value = '0'));
      refresh();
      return true;
    }

    const advice = opening
      ? h('div', { class: 'quote' }, h('p', null, 'Most families take at least three yoke of oxen, a few sets of clothing each, and enough food for the first few hundred miles. Spare parts are cheap here and dear out there.'), h('cite', null, 'Hiram, keeper of the general store'))
      : h('p', { class: 'muted' }, `Prices here are ${Math.round((OT.priceMultiplier(G) - 1) * 100)}% higher than in Independence.`);

    panel(
      h('div', { class: 'eyebrow' }, opening ? 'Independence, Missouri · ' + OT.dateString(G) : lm.name),
      h('h2', null, opening ? "Hiram's General Store" : 'Trading post'),
      advice,
      h('div', { class: 'scroll-x' }, table),
      h('div', { class: 'row' }, totalEl),
      msgEl,
      h('div', { class: 'row' },
        btn('Buy', () => { if (checkout()) { msgEl.textContent = 'Loaded into the wagon.'; Sound.good(); } }, { primary: true }),
        btn(opening ? 'Leave for Oregon' : 'Done', () => {
          if (!opening && total() > G.money + 1e-9) {
            Sound.bad();
            return dialog(`You can't afford that bill, so nothing was bought.`, landmarkMenu);
          }
          if (total() > 0 && !checkout()) return;
          if (opening) {
            const why = OT.canLeave(G);
            if (why) { msgEl.textContent = why; Sound.bad(); return; }
            G.status = 'landmark';
            autosave();
            dialog([`You leave Independence on ${OT.dateString(G)}.`, 'Set your pace and rations from the menu any time. Good luck.'], () => departFrom(), { icon: '✦' });
          } else landmarkMenu();
        })),
    );
    refresh();
  }

  // ---------- Landmarks ----------
  function departFrom() {
    OT.depart(G, 0);
    travel();
  }

  function landmarkMenu() {
    stopTravel();
    renderStatus();
    setAnim(sceneFor());
    const lm = OT.LANDMARKS[G.at];
    hud(lm.name, '');
    if (G.status === 'river') return riverMenu();
    if (G.status === 'dalles') return dallesMenu();
    if (G.status === 'won') return finish();
    if (G.status === 'dead') return gameOver();
    const actions = [
      btn('Continue on the trail', () => {
        if (G.status === 'fork') return forkMenu();
        departFrom();
      }, { primary: true }),
      btn('Check supplies', supplies),
      btn('Look at map', showMap),
      btn('Change pace', choosePace, { sub: OT.PACES.find((p) => p.id === G.pace).name }),
      btn('Change food rations', chooseRations, { sub: OT.RATIONS.find((r) => r.id === G.rations).name }),
      btn('Stop to rest', restMenu),
      btn('Attempt to trade', trade),
      OT.TALK[G.at] ? btn('Talk to people', talk) : null,
      lm.type === 'fort' ? btn('Buy supplies', () => shop(false)) : null,
      btn('Go hunting', hunt, { disabled: G.bullets < 0.05, sub: G.bullets < 0.05 ? 'No bullets' : null }),
    ];
    panel(
      h('div', { class: 'eyebrow' }, OT.dateString(G)),
      h('h2', null, lm.name),
      h('div', { class: 'menu' }, actions),
      h('div', { class: 'row' }, btn('Save and quit', () => { autosave(); title(); })),
    );
    autosave();
  }

  function forkMenu() {
    const lm = OT.LANDMARKS[G.at];
    panel(
      h('h2', null, 'The trail divides here.'),
      h('div', { class: 'menu' }, lm.fork.map((label, i) => btn(label, () => { OT.depart(G, i); travel(); }, { sub: `${lm.dist[i]} miles to ${OT.LANDMARKS[lm.next[i]].name}` }))),
      h('div', { class: 'row' }, btn('Back', landmarkMenu)),
    );
  }

  // ---------- Travel ----------
  function travel() {
    renderStatus();
    G.status = 'travel';
    stopTravel();
    const scene = sceneFor();
    setAnim((f) => { if (travelTimer) travelOffset += 0.6; scene(f); });
    hud(OT.LANDMARKS[G.next].name, `${G.milesToNext} mi`);
    panel(
      h('p', null, `Traveling at a ${OT.PACES.find((p) => p.id === G.pace).name.toLowerCase()} pace on ${OT.RATIONS.find((r) => r.id === G.rations).name.toLowerCase()} rations.`),
      h('div', { class: 'row' }, btn('Size up the situation', stopMenu, { primary: true, id: 'stopbtn' })),
      h('p', { class: 'muted' }, 'Press the button any time to stop and use the menu.'),
    );
    travelTimer = setInterval(tick, window.__TW_FAST ? 15 : 550);
  }

  function stopTravel() { if (travelTimer) { clearInterval(travelTimer); travelTimer = null; } }

  function tick() {
    const res = OT.travelDay(G);
    renderStatus();
    hud(G.next ? OT.LANDMARKS[G.next].name : OT.LANDMARKS[G.at].name, G.next ? `${G.milesToNext} mi` : '');
    const notable = res.events.filter((e) => e.type !== 'nofood' || G.food <= 0);
    if (G.status === 'dead') { stopTravel(); Sound.death(); return dialog(notable.map((e) => e.msg), gameOver); }
    if (notable.length) {
      stopTravel();
      const types = notable.map((e) => e.type);
      if (types.includes('death')) Sound.death(); else if (types.some((t) => t === 'good' || t === 'recover')) Sound.good(); else Sound.bad();
      const after = () => {
        if (res.arrived) return arrival();
        if (G.broken) return brokenMenu();
        if (types.includes('blocked')) return stopMenu();
        travel();
      };
      return dialog(notable.map((e) => e.msg), after);
    }
    if (res.arrived) { stopTravel(); arrival(); }
  }

  function arrival() {
    Sound.arrive();
    const lm = OT.LANDMARKS[G.at];
    autosave();
    if (G.status === 'won') return finish();
    dialog([`You have reached ${lm.name}.`, describe(G.at)], landmarkMenu, { icon: '✦' });
  }

  function describe(id) {
    return ({
      kansas: 'The first big river west of Independence. Ferries run when the water is high.',
      bigblue: 'A clear, quick river named for its color. Many trains camp at the springs nearby.',
      kearney: 'A new army post on the Platte River, built to protect emigrants.',
      chimney: 'A tall spire of clay and sandstone, visible for days across the plains.',
      laramie: 'An old fur trading post at the edge of the high plains. Last good resupply for weeks.',
      indrock: 'A great granite dome covered with the names of travelers who came before.',
      southpass: 'The gentle crossing of the Continental Divide. The trail splits ahead.',
      green: 'A deep, cold river. Few try to ford it.',
      bridger: 'A trading post run by mountain man Jim Bridger.',
      soda: 'Springs of naturally bubbling water. Some say it cures what ails you.',
      hall: 'A Hudson\'s Bay Company post on the Snake River plain.',
      snake: 'A wide, dangerous river crossing. The Shoshone know safe routes across.',
      boise: 'A small fort along the Snake. The Blue Mountains rise to the west.',
      bluemtns: 'Steep, forested ridges. The trail divides on the far side.',
      wallawalla: 'A trading post near the Columbia River.',
      dalles: 'The overland trail ends at the Columbia. Raft the river or take the Barlow toll road.',
    })[id] || '';
  }

  function stopMenu() {
    stopTravel();
    renderStatus();
    setAnim(sceneFor());
    if (G.broken) return brokenMenu();
    panel(
      h('div', { class: 'eyebrow' }, `${G.milesToNext} miles to ${OT.LANDMARKS[G.next].name}`),
      h('div', { class: 'menu' },
        btn('Continue on the trail', () => {
          if (G.oxen <= 0) { Sound.bad(); return dialog('You have no oxen to pull the wagon. Try trading for some.'); }
          travel();
        }, { primary: true }),
        btn('Check supplies', supplies),
        btn('Look at map', showMap),
        btn('Change pace', choosePace, { sub: OT.PACES.find((p) => p.id === G.pace).name }),
        btn('Change food rations', chooseRations, { sub: OT.RATIONS.find((r) => r.id === G.rations).name }),
        btn('Stop to rest', restMenu),
        btn('Attempt to trade', trade),
        btn('Go hunting', hunt, { disabled: G.bullets < 0.05, sub: G.bullets < 0.05 ? 'No bullets' : null }),
      ),
      h('div', { class: 'row' }, btn('Save and quit', () => { autosave(); title(); })),
    );
    autosave();
  }

  function back() { return G.status === 'travel' ? stopMenu() : landmarkMenu(); }

  function brokenMenu() {
    stopTravel();
    renderStatus();
    const part = G.broken;
    panel(
      h('h2', null, `Broken wagon ${part}`),
      h('p', null, `You can try to repair it, which takes a day, or replace it with a spare. You have ${G[part]} spare ${part}${G[part] === 1 ? '' : 's'}.`),
      h('div', { class: 'menu' },
        btn('Try to repair', () => { const r = OT.repair(G); renderStatus(); r.ok ? Sound.good() : Sound.bad(); dialog(r.msg, () => (G.broken ? brokenMenu() : stopMenu())); }),
        btn('Replace with a spare', () => { const r = OT.replacePart(G); r.ok ? Sound.good() : Sound.bad(); dialog(r.msg, () => (G.broken ? brokenMenu() : stopMenu())); }, { disabled: G[part] < 1 }),
        btn('Look for someone to trade', trade),
        btn('Check supplies', supplies),
      ),
    );
  }

  // ---------- Info screens ----------
  function supplies() {
    const party = OT.alive(G).length;
    panel(
      h('h2', null, 'Your supplies'),
      h('div', { class: 'scroll-x' }, h('table', { class: 'sheet' }, h('tbody', null,
        [['Oxen', G.oxen + (G.oxInjured ? ' (one injured)' : '')], ['Sets of clothing', G.clothing], ['Bullets', rounds(G.bullets)],
         ['Wagon wheels', G.wheel], ['Wagon axles', G.axle], ['Wagon tongues', G.tongue], ['Pounds of food', Math.floor(G.food) + (G.food > 0 ? `, about ${Math.floor(G.food / Math.max(1, party * OT.RATIONS.find((r) => r.id === G.rations).lbs))} days` : '')], ['Money left', money(G.money)]]
          .map(([k, v]) => h('tr', null, h('td', null, k), h('td', { class: 'n' }, v)))))),
      h('h2', null, 'Your party'),
      h('div', { class: 'party' }, G.party.map((p) => h('div', null, h('span', null, p.name + (p.leader ? ' (leader)' : '')), h('span', { class: p.alive ? (p.ill ? 'h-fair' : 'h-good') : 'muted' }, p.alive ? (p.ill ? 'has ' + p.ill.what : 'well') : 'died')))),
      h('div', { class: 'row' }, btn('Back', back, { primary: true })),
    );
  }

  function showMap() {
    setAnim(() => Art.mapScene(ctx, { landmarks: OT.LANDMARKS, path: G.path, next: G.next, milesToNext: G.milesToNext, segmentLength: G.segmentLength }));
    hud('', '');
    panel(
      h('h2', null, 'Map of the trail'),
      h('p', null, `You have traveled ${G.milesTraveled} miles. The red line shows your route so far.`),
      h('div', { class: 'row' }, btn('Back', () => { setAnim(sceneFor()); back(); }, { primary: true })),
    );
  }

  function choosePace() {
    panel(
      h('h2', null, 'Change pace'),
      h('div', { class: 'menu' }, OT.PACES.map((p) => btn(p.name, () => { G.pace = p.id; back(); }, { sub: p.desc, on: G.pace === p.id }))),
      h('div', { class: 'row' }, btn('Back', back)),
    );
  }

  function chooseRations() {
    panel(
      h('h2', null, 'Change food rations'),
      h('div', { class: 'menu' }, OT.RATIONS.map((r) => btn(r.name, () => { G.rations = r.id; back(); }, { sub: `${r.desc} ${r.lbs} lb per person per day.`, on: G.rations === r.id }))),
      h('div', { class: 'row' }, btn('Back', back)),
    );
  }

  function restMenu() {
    panel(
      h('h2', null, 'How many days would you like to rest?'),
      h('div', { class: 'menu' }, [1, 2, 3, 5, 7].map((d) => btn(`${d} day${d > 1 ? 's' : ''}`, () => {
        const ev = OT.rest(G, d);
        renderStatus();
        if (G.status === 'dead') { Sound.death(); return dialog(ev.map((e) => e.msg), gameOver); }
        dialog(ev.map((e) => e.msg).concat([`You rested ${d} day${d > 1 ? 's' : ''}. Health is ${OT.healthLabel(G.health)}.`]), back);
      }))),
      h('div', { class: 'row' }, btn('Back', back)),
    );
  }

  function trade() {
    const offer = OT.tradeOffer(G);
    renderStatus();
    if (!offer) return dialog('Nobody wants to trade with you today.', back);
    const lbl = (o) => `${o.qty} ${OT.ITEM_LABEL[o.item]}`;
    const can = G[offer.give.item] >= offer.give.qty;
    panel(
      h('h2', null, 'A traveler wants to trade'),
      h('p', null, `They would like ${lbl(offer.give)}. In exchange they offer ${lbl(offer.get)}.`),
      h('p', { class: 'muted' }, `You have ${offer.give.item === 'bullets' ? rounds(G.bullets) + ' bullets' : Math.floor(G[offer.give.item]) + ' ' + OT.ITEM_LABEL[offer.give.item]}.`),
      h('div', { class: 'row' },
        btn('Accept', () => { const r = OT.acceptTrade(G, offer); r.ok ? Sound.good() : Sound.bad(); dialog(r.msg, G.broken ? brokenMenu : back); }, { primary: true, disabled: !can }),
        btn('Decline', G.broken ? brokenMenu : back)),
    );
  }

  function talk() {
    const lines = OT.TALK[G.at];
    let i = 0;
    const show = () => {
      const [who, text] = lines[i % lines.length];
      panel(
        h('div', { class: 'quote' }, h('p', null, text), h('cite', null, who)),
        h('div', { class: 'row' }, btn('Talk to someone else', () => { i++; show(); }), btn('Done', landmarkMenu, { primary: true })),
      );
    };
    show();
  }

  // ---------- Rivers ----------
  function riverMenu() {
    const lm = OT.LANDMARKS[G.at];
    const r = G.river;
    hud(lm.name, '');
    const opts = [
      btn('Attempt to ford the river', () => cross('ford'), { sub: 'Safe only in shallow water.' }),
      btn('Caulk the wagon and float it', () => cross('caulk'), { sub: 'Risky in swift water.' }),
      lm.ferry ? btn(`Take the ferry ($${lm.ferry})`, () => cross('ferry'), { disabled: G.money < lm.ferry, sub: `Wait about ${r.ferryWait} day${r.ferryWait > 1 ? 's' : ''}.` }) : null,
      lm.guide ? btn('Hire a Shoshone guide', () => cross('guide'), { disabled: G.clothing < 3, sub: 'Costs 3 sets of clothing.' }) : null,
      btn('Wait a day to see if conditions change', () => { const ev = OT.riverWait(G); renderStatus(); if (G.status === 'dead') return dialog(ev.map((e) => e.msg), gameOver); dialog(ev.map((e) => e.msg), riverMenu); }),
      btn('Check supplies', () => { supplies(); }),
      btn('Talk to people', talk),
    ];
    panel(
      h('div', { class: 'eyebrow' }, OT.dateString(G)),
      h('h2', null, lm.name),
      h('p', null, `The river is ${r.width} feet across and ${r.depth.toFixed(1)} feet deep in the middle. The current is ${r.swift ? 'swift' : 'moderate'}.`),
      h('div', { class: 'menu' }, opts),
    );
  }

  function cross(method) {
    stopTravel();
    let p = 0;
    const zone = OT.LANDMARKS[G.at].zone;
    panel(h('p', null, 'Crossing the river...'));
    const res = OT.crossRiver(G, method);
    if (!res.ok) { Sound.bad(); return dialog(res.msgs, riverMenu); }
    setAnim((f) => {
      p = Math.min(1, p + 0.006);
      Art.crossingScene(ctx, { zone, frame: f, progress: p, method });
      if (p >= 1) {
        setAnim(sceneFor());
        renderStatus();
        const bad = res.msgs.some((m) => /lost|drown|tipped|stuck/i.test(m));
        bad ? Sound.bad() : Sound.good();
        dialog(res.msgs, () => (G.status === 'dead' ? gameOver() : landmarkMenu()));
      }
    });
  }

  // ---------- The Dalles ----------
  function dallesMenu() {
    panel(
      h('div', { class: 'eyebrow' }, OT.dateString(G)),
      h('h2', null, 'The Dalles'),
      h('p', null, 'The wagon road ends here at the Columbia River. You can build a raft and float the last stretch, or pay to take the Barlow Road over the shoulder of Mount Hood.'),
      h('div', { class: 'menu' },
        btn('Raft down the Columbia', raftIntro, { primary: true, sub: 'Steer clear of the rocks.' }),
        btn(`Take the Barlow Road ($${OT.BARLOW_TOLL})`, () => {
          const r = OT.takeBarlow(G);
          renderStatus();
          if (!r.ok) { Sound.bad(); return dialog(r.msg, dallesMenu); }
          dialog(r.msgs, () => (G.status === 'dead' ? gameOver() : finish()));
        }, { disabled: G.money < OT.BARLOW_TOLL, sub: 'Slow, but no rapids.' }),
        btn('Check supplies', supplies),
        btn('Talk to people', talk),
      ),
    );
  }

  // ---------- Hunting mini-game ----------
  function hunt() {
    stopTravel();
    const zone = OT.huntZone(G);
    const kinds = OT.HUNT_ANIMALS[zone];
    const rng = OT.makeRng(G.day * 31 + G.rngState);
    const brush = Array.from({ length: 7 }, (_, i) => ({ x: 20 + i * 44 + rng.int(-8, 8), y: 118 + rng.int(0, 30), tree: zone === 'rockies' || zone === 'cascades' ? rng.chance(0.5) : false }));
    const animals = [];
    const flashes = [];
    const kills = [];
    let fired = 0;
    let shots = rounds(G.bullets);
    let aim = { x: 160, y: 110 };
    let timeLeft = 30 * 60;
    let over = false;

    const info = h('p', { class: 'muted', 'aria-live': 'polite' });
    function updateInfo() { info.textContent = `Bullets: ${shots} · Meat: ${kills.reduce((a, k) => a + OT.ANIMAL_MEAT[k], 0)} lb · ${Math.ceil(timeLeft / 60)}s`; }
    function spawn() {
      const kind = rng.pick(kinds);
      const s = Art.ANIMAL_SHAPES[kind];
      const dir = rng.chance(0.5) ? 1 : -1;
      animals.push({ kind, x: dir > 0 ? -30 : Art.W + 10, y: 108 + rng.int(0, 44), vx: dir * s.speed * (0.8 + rng() * 0.6), dead: false });
    }
    function toCanvas(ev) {
      const r = canvas.getBoundingClientRect();
      return { x: Math.round((ev.clientX - r.left) / r.width * Art.W), y: Math.round((ev.clientY - r.top) / r.height * Art.H) };
    }
    function shoot(pt) {
      if (over || shots <= 0) return;
      shots--; fired++;
      Sound.shot();
      flashes.push({ x: pt.x, y: pt.y, t: 6 });
      for (const a of animals) {
        if (a.dead) continue;
        const s = Art.ANIMAL_SHAPES[a.kind];
        const pad = s.w < 10 ? 4 : 2;
        if (pt.x >= a.x - pad && pt.x <= a.x + s.w + pad && pt.y >= a.y - s.h - pad && pt.y <= a.y + pad) {
          a.dead = true; a.vx = 0; kills.push(a.kind); Sound.hit(); break;
        }
      }
      updateInfo();
      if (shots <= 0) end();
    }
    const onMove = (ev) => { aim = toCanvas(ev); };
    const onDown = (ev) => { ev.preventDefault(); Sound.unlock(); aim = toCanvas(ev); shoot(aim); };
    const onKey = (ev) => {
      const k = ev.key;
      if (k === 'ArrowLeft') aim.x = Math.max(0, aim.x - 6);
      else if (k === 'ArrowRight') aim.x = Math.min(Art.W, aim.x + 6);
      else if (k === 'ArrowUp') aim.y = Math.max(90, aim.y - 6);
      else if (k === 'ArrowDown') aim.y = Math.min(Art.H, aim.y + 6);
      else if (k === ' ' || k === 'Enter') shoot(aim);
      else return;
      ev.preventDefault();
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    function cleanup() {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    }
    function end() {
      if (over) return;
      over = true;
      cleanup();
      const r = OT.finishHunt(G, fired, kills);
      renderStatus();
      setAnim(sceneFor());
      dialog(r.msg, () => (G.status === 'dead' ? gameOver() : back()));
    }
    hud('Hunting', '');
    updateInfo();
    panel(
      h('h2', null, 'Hunting'),
      h('p', null, 'Tap or click an animal to shoot. On a keyboard, aim with the arrow keys and fire with Space.'),
      info,
      h('div', { class: 'row' }, btn('Stop hunting', end, { primary: true })),
    );
    for (let i = 0; i < 3; i++) spawn();
    setAnim((f) => {
      if (!over) {
        timeLeft--;
        if (f % 60 === 0) updateInfo();
        if (timeLeft <= 0) end();
        if (rng.chance(0.012) && animals.filter((a) => !a.dead).length < 5) spawn();
        for (const a of animals) a.x += a.vx;
        for (let i = animals.length - 1; i >= 0; i--) if (!animals[i].dead && (animals[i].x < -40 || animals[i].x > Art.W + 40)) animals.splice(i, 1);
      }
      for (let i = flashes.length - 1; i >= 0; i--) if (--flashes[i].t <= 0) flashes.splice(i, 1);
      Art.huntScene(ctx, { zone, brush, animals, flashes, aim, frame: f });
    });
  }

  // ---------- Rafting mini-game ----------
  function raftIntro() {
    panel(
      h('h2', null, 'Rafting the Columbia'),
      h('p', null, 'Steer left and right to miss the rocks. Use the arrow keys, drag on the river, or the buttons below on a phone. It lasts about 40 seconds.'),
      h('div', { class: 'row' }, btn('Push off', raft, { primary: true }), btn('Back', dallesMenu)),
    );
  }

  function raft() {
    const rng = OT.makeRng(G.day * 17 + 99);
    const rocks = [];
    let raftX = 160, vx = 0, hits = 0, hitFlash = 0, scroll = 0, t = 0, over = false;
    const dur = 40 * 60;
    const keys = {};
    const info = h('p', { class: 'muted', 'aria-live': 'polite' });
    const upd = () => { info.textContent = `Hits: ${hits} · ${Math.max(0, Math.ceil((dur - t) / 60))}s to go`; };
    const onKey = (ev) => { if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { keys[ev.key] = ev.type === 'keydown'; ev.preventDefault(); } };
    let dragX = null;
    const onDown = (ev) => { const r = canvas.getBoundingClientRect(); dragX = (ev.clientX - r.left) / r.width * Art.W; };
    const onMove = (ev) => { if (dragX == null) return; const r = canvas.getBoundingClientRect(); dragX = (ev.clientX - r.left) / r.width * Art.W; };
    const onUp = () => { dragX = null; };
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    const hold = (dir) => { const b = btn(dir < 0 ? '◀' : '▶', () => {}); const on = () => (keys[dir < 0 ? 'ArrowLeft' : 'ArrowRight'] = true); const off = () => (keys[dir < 0 ? 'ArrowLeft' : 'ArrowRight'] = false); b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); return b; };
    panel(h('h2', null, 'On the river'), info, h('div', { class: 'touchpad' }, hold(-1), hold(1)));
    hud('The Columbia River', '');
    function end() {
      over = true;
      window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey);
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      const r = OT.finishRaft(G, hits);
      renderStatus();
      dialog(r.msgs, () => (G.status === 'dead' ? gameOver() : finish()));
    }
    setAnim((f) => {
      if (!over) {
        t++;
        if (f % 20 === 0) upd();
        if (t > dur) return end();
        const speed = 1.2 + t / dur * 1.3;
        scroll += speed;
        if (rng.chance(0.028 + t / dur * 0.02)) rocks.push({ x: 56 + rng() * 208, y: -10, r: rng.int(5, 10) });
        for (const r of rocks) r.y += speed;
        for (let i = rocks.length - 1; i >= 0; i--) if (rocks[i].y > Art.H + 20) rocks.splice(i, 1);
        let target = 0;
        if (keys.ArrowLeft) target -= 2.2;
        if (keys.ArrowRight) target += 2.2;
        if (dragX != null) target = Math.max(-2.2, Math.min(2.2, (dragX - raftX) * 0.12));
        vx += (target - vx) * 0.25;
        raftX = Math.max(58, Math.min(Art.W - 58, raftX + vx));
        if (hitFlash > 0) hitFlash--;
        else for (const r of rocks) {
          if (Math.abs(r.x - raftX) < r.r + 12 && Math.abs(r.y - 139) < r.r / 2 + 7) { hits++; hitFlash = 50; Sound.bad(); upd(); break; }
        }
      }
      Art.raftScene(ctx, { rocks, raftX, scroll, hitFlash, frame: f });
    });
    upd();
  }

  // ---------- Endings ----------
  function finish() {
    stopTravel();
    store.del('save');
    renderStatus();
    Sound.win();
    setAnim((f) => Art.landmarkScene(ctx, { id: 'willamette', landmark: OT.LANDMARKS.willamette, weather: null, frame: f, oxen: G.oxen }));
    hud('Willamette Valley, Oregon', '');
    const sc = OT.score(G);
    const leader = G.party[0].name;
    const top = store.get('top', []);
    top.push({ name: leader, score: sc.total });
    store.set('top', top.sort((a, b) => b.score - a.score).slice(0, 20));
    panel(
      h('div', { class: 'eyebrow' }, OT.dateString(G)),
      h('h1', null, 'You made it to Oregon!'),
      h('p', null, `${OT.alive(G).length} of 5 travelers arrived after ${G.day} days and ${G.milesTraveled} miles.`),
      h('div', { class: 'scroll-x' }, h('table', { class: 'sheet' },
        h('thead', null, h('tr', null, h('th', null, 'Item'), h('th', { class: 'n' }, 'Count'), h('th', { class: 'n' }, 'Points'))),
        h('tbody', null,
          sc.rows.map(([k, c, p]) => h('tr', null, h('td', null, k), h('td', { class: 'n' }, c), h('td', { class: 'n' }, p))),
          h('tr', null, h('td', null, 'Subtotal'), h('td'), h('td', { class: 'n' }, sc.raw)),
          h('tr', null, h('td', null, `Occupation bonus x${sc.bonus}`), h('td'), h('td', { class: 'n' }, h('b', null, sc.total)))))),
      h('p', null, `Rating: ${rating(sc.total)}.`),
      G.deaths.length ? h('p', { class: 'muted' }, 'Lost on the trail: ' + G.deaths.map((d) => `${d.name} (${d.cause})`).join(', ') + '.') : null,
      h('div', { class: 'row' }, btn('See the Top Ten', topTen, { primary: true }), btn('Play again', title)),
    );
  }

  function gameOver() {
    stopTravel();
    store.del('save');
    renderStatus();
    setAnim(sceneFor());
    const leader = G.party[0];
    const d = G.deaths.find((x) => x.name === leader.name) || G.deaths[G.deaths.length - 1] || { cause: 'the hardships of the trail', where: '', date: OT.dateString(G) };
    const input = h('input', { id: 'epitaph', maxlength: 40, placeholder: 'Write an epitaph', autocomplete: 'off' });
    const stone = h('div', { class: 'stone' }, h('b', null, 'Here lies ' + leader.name), h('p', { class: 'muted' }, d.date), h('p', { id: 'epitaph-line' }, ''));
    panel(
      h('h2', null, leader.alive ? 'Everyone in your party has died.' : `${leader.name}, your wagon leader, has died of ${d.cause}.`),
      h('p', null, `The journey ended ${d.where ? d.where.toLowerCase().startsWith('near') ? d.where : 'at ' + d.where : 'on the trail'} after ${G.milesTraveled} miles.`),
      h('div', { class: 'tomb' }, stone, h('div', { class: 'row epitaph' }, input, btn('Carve it', () => { $('#epitaph-line').textContent = input.value.trim(); }))),
      h('div', { class: 'row' }, btn('Try again', title, { primary: true })),
    );
  }

  // ---------- chrome ----------
  $('#mute').addEventListener('click', () => { Sound.unlock(); const m = Sound.toggle(); $('#mute').textContent = m ? '×' : '♪'; $('#mute').setAttribute('aria-label', m ? 'Sound off' : 'Sound on'); });

  // Keep a game in progress when this page is updated while open.
  if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
    try { window.claude.hot.snapshot(() => ({ G })); } catch (e) { /* optional */ }
  }
  const start = (data) => { if (data && data.G) resume(data.G); else title(); };
  if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start);
  else start(window.claude && window.claude.hot && window.claude.hot.data);

  // Expose for automated checks.
  window.__TW = { get G() { return G; } };
})();
