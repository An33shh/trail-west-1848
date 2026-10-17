/*
 * Trail engine: pure game logic, no DOM.
 * Clean-room implementation of the rules in docs/SPEC.md.
 * Runs in the browser (window.OT) and in Node (module.exports) for tests.
 */
(function (root) {
  'use strict';

  // ---------- RNG (mulberry32, seedable for tests) ----------
  function makeRng(seed) {
    let a = seed >>> 0;
    const rng = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
    rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
    rng.chance = (p) => rng() < p;
    return rng;
  }

  // ---------- Static data ----------
  const OCCUPATIONS = [
    { id: 'banker', name: 'Banker from Boston', cash: 1600, bonus: 1.0, perk: 'None. Money is its own advantage.' },
    { id: 'doctor', name: 'Doctor from Chicago', cash: 1200, bonus: 1.0, perk: 'Sick travelers recover faster.' },
    { id: 'merchant', name: 'Merchant from Cincinnati', cash: 1400, bonus: 1.5, perk: 'None.' },
    { id: 'blacksmith', name: 'Blacksmith from Pittsburgh', cash: 1100, bonus: 2.0, perk: 'Better at fixing broken wagon parts.' },
    { id: 'carpenter', name: 'Carpenter from Ohio', cash: 800, bonus: 2.0, perk: 'Better at fixing broken wagon parts.' },
    { id: 'saddlemaker', name: 'Saddlemaker from Kentucky', cash: 900, bonus: 2.5, perk: 'None.' },
    { id: 'farmer', name: 'Farmer from Illinois', cash: 400, bonus: 3.0, perk: 'Oxen stay healthier.' },
    { id: 'teacher', name: 'Teacher from Vermont', cash: 400, bonus: 3.5, perk: 'None. The hardest start.' },
  ];

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const START_MONTHS = [2, 3, 4, 5, 6]; // March..July (0-indexed)

  const BASE_PRICES = { oxen: 20, food: 0.20, clothing: 10, bullets: 2, wheel: 10, axle: 10, tongue: 10 };
  const LIMITS = { oxen: 20, food: 2000, clothing: 99, bullets: 99, wheel: 3, axle: 3, tongue: 3 };
  const ITEM_LABEL = { oxen: 'oxen', food: 'pounds of food', clothing: 'sets of clothing', bullets: 'boxes of bullets', wheel: 'wagon wheels', axle: 'wagon axles', tongue: 'wagon tongues' };

  // Route graph. dist is miles to each entry in next[].
  const LANDMARKS = {
    independence: { name: 'Independence, Missouri', type: 'town', zone: 'plains', next: ['kansas'], dist: [102], x: 0.94, y: 0.62 },
    kansas: { name: 'Kansas River Crossing', type: 'river', zone: 'plains', next: ['bigblue'], dist: [82], x: 0.88, y: 0.58, ferry: 5 },
    bigblue: { name: 'Big Blue River Crossing', type: 'river', zone: 'plains', next: ['kearney'], dist: [118], x: 0.83, y: 0.52, ferry: 5 },
    kearney: { name: 'Fort Kearney', type: 'fort', zone: 'plains', next: ['chimney'], dist: [250], x: 0.76, y: 0.47 },
    chimney: { name: 'Chimney Rock', type: 'natural', zone: 'highplains', next: ['laramie'], dist: [86], x: 0.64, y: 0.44 },
    laramie: { name: 'Fort Laramie', type: 'fort', zone: 'highplains', next: ['indrock'], dist: [190], x: 0.59, y: 0.42 },
    indrock: { name: 'Independence Rock', type: 'natural', zone: 'rockies', next: ['southpass'], dist: [102], x: 0.51, y: 0.39 },
    southpass: { name: 'South Pass', type: 'natural', zone: 'rockies', next: ['green', 'bridger'], dist: [57, 125], x: 0.46, y: 0.40, fork: ['Take the Sublette Cutoff to the Green River', 'Head to Fort Bridger'] },
    green: { name: 'Green River Crossing', type: 'river', zone: 'rockies', next: ['soda'], dist: [144], x: 0.42, y: 0.37, ferry: 5 },
    bridger: { name: 'Fort Bridger', type: 'fort', zone: 'rockies', next: ['soda'], dist: [162], x: 0.42, y: 0.46 },
    soda: { name: 'Soda Springs', type: 'natural', zone: 'highdesert', next: ['hall'], dist: [57], x: 0.36, y: 0.36 },
    hall: { name: 'Fort Hall', type: 'fort', zone: 'snakeplain', next: ['snake'], dist: [182], x: 0.33, y: 0.33 },
    snake: { name: 'Snake River Crossing', type: 'river', zone: 'snakeplain', next: ['boise'], dist: [114], x: 0.24, y: 0.35, guide: true },
    boise: { name: 'Fort Boise', type: 'fort', zone: 'snakeplain', next: ['bluemtns'], dist: [160], x: 0.18, y: 0.30 },
    bluemtns: { name: 'Blue Mountains', type: 'natural', zone: 'cascades', next: ['wallawalla', 'dalles'], dist: [55, 125], x: 0.14, y: 0.24, fork: ['Head to Fort Walla Walla', 'Cut straight to The Dalles'] },
    wallawalla: { name: 'Fort Walla Walla', type: 'fort', zone: 'cascades', next: ['dalles'], dist: [120], x: 0.13, y: 0.15 },
    dalles: { name: 'The Dalles', type: 'dalles', zone: 'cascades', next: ['willamette'], dist: [100], x: 0.08, y: 0.20 },
    willamette: { name: 'Willamette Valley, Oregon', type: 'end', zone: 'cascades', next: [], dist: [], x: 0.03, y: 0.22 },
  };

  const ZONES = {
    plains: { temp: 0, rain: 1.0, speed: 1.0, label: 'prairie' },
    highplains: { temp: -3, rain: 0.7, speed: 1.0, label: 'high plains' },
    rockies: { temp: -15, rain: 0.6, speed: 0.75, label: 'mountains' },
    highdesert: { temp: -6, rain: 0.4, speed: 0.9, label: 'high desert' },
    snakeplain: { temp: -2, rain: 0.35, speed: 0.9, label: 'Snake River plain' },
    cascades: { temp: -8, rain: 1.3, speed: 0.75, label: 'mountains' },
  };
  // Mean daily temperature (F) by month for the plains baseline.
  const MONTH_TEMP = [25, 30, 42, 55, 65, 75, 81, 78, 68, 55, 41, 30];

  const PACES = [
    { id: 'steady', name: 'Steady', mult: 1.0, dmg: 0, desc: 'About 8 hours a day, resting often.' },
    { id: 'strenuous', name: 'Strenuous', mult: 1.5, dmg: 3, desc: 'Dawn to dusk, short rests.' },
    { id: 'grueling', name: 'Grueling', mult: 2.0, dmg: 6, desc: 'Every waking hour. People wear down fast.' },
  ];
  const RATIONS = [
    { id: 'filling', name: 'Filling', lbs: 3, dmg: 0, desc: 'Full, balanced meals.' },
    { id: 'meager', name: 'Meager', lbs: 2, dmg: 3, desc: 'Small meals, people stay hungry.' },
    { id: 'barebones', name: 'Bare bones', lbs: 1, dmg: 6, desc: 'Barely enough to live on.' },
  ];

  const ILLNESSES = ['exhaustion', 'typhoid', 'cholera', 'measles', 'dysentery', 'a fever'];
  const INJURIES = ['a broken arm', 'a broken leg', 'a snakebite'];
  const SERIOUS = ['typhoid', 'cholera', 'dysentery', 'measles', 'a snakebite'];

  // Original flavor lines written for this remake.
  const TALK = {
    independence: [
      ['A storekeeper', 'Every family that rolls out of here thinks they packed too much. By Fort Laramie half of them wish they had packed more.'],
      ['A wagon master', 'Oxen are slow, but they eat what the trail gives them. Horses want grain you will not have.'],
      ['A schoolteacher', 'Write everything down. You will forget which week was which before you reach the mountains.'],
    ],
    kansas: [
      ['A ferryman', 'River runs high this time of year. Five dollars buys you a dry wagon.'],
      ['A traveler from Indiana', 'We tried to ford upstream and lost a barrel of flour. Measure the depth before you decide.'],
    ],
    bigblue: [
      ['An emigrant woman', 'We waited two days for the water to fall. The children caught fish the whole time.'],
      ['A scout', 'Past here the country opens up. Watch your water. Not every creek is fit to drink.'],
    ],
    kearney: [
      ['A soldier', 'The army just put this post up. We count the wagons going by and there are more every week.'],
      ['A trader', 'Prices only go up from here. Buy what you need while you can.'],
    ],
    chimney: [
      ['A young man', 'You can see that spire for two days before you reach it. Feels like it never gets closer.'],
      ['A preacher', 'Carve your name if you like. Plenty have. The rock does not seem to mind.'],
    ],
    laramie: [
      ['A clerk at the post', 'Lighten your wagon here. The climb ahead will kill oxen hauling furniture.'],
      ['A Lakota trader', 'Good buffalo country north of the river this season. Do not waste the meat.'],
    ],
    indrock: [
      ['A guide', 'Reach this rock by the Fourth of July and you will likely beat the snow. Later than that, hurry.'],
      ['A girl with a chisel', 'I wrote my whole family on the north side. Mother says it is vanity. I say it is history.'],
    ],
    southpass: [
      ['A trapper', 'Hard to believe this is the top of the continent. It is wide as a meadow.'],
      ['An emigrant', 'Cutoff saves time but there is a long dry stretch. Fill every keg you have.'],
    ],
    green: [
      ['A ferry operator', 'This river does not forgive. Deep, cold, and fast. I would not swim it.'],
      ['A mountain man', 'Ferry or wait. Those are your two smart choices.'],
    ],
    bridger: [
      ['A blacksmith', 'If your iron is cracked, now is the time. Next forge is a long way off.'],
      ['A trader', 'Folks bound for the Salt Lake split off here. You keep north.'],
    ],
    soda: [
      ['A traveler', 'The water bubbles like it was boiling but it is cold. Tastes like a bad tonic.'],
      ['A boy', 'There is a spring over there that spouts every few seconds. We call it the steamboat.'],
    ],
    hall: [
      ['A Hudson Bay man', 'Some here will tell you to turn for California. Oregon is still the better farmland.'],
      ['A Shoshone woman', 'Downriver the crossing is dangerous. My people know where it is safe.'],
    ],
    snake: [
      ['A Shoshone guide', 'Give me clothing and I will take your wagon across where the bottom is good.'],
      ['An emigrant', 'Three islands out there. The current between them is the trouble.'],
    ],
    boise: [
      ['A trader', 'The Blue Mountains are next. Steep up and steep down. Lock your wheels on the descent.'],
      ['An emigrant', 'My oxen are nearly done. I traded a rocking chair for two fresh ones.'],
    ],
    bluemtns: [
      ['A missionary', 'The Whitman place is north of here. Many trains stop for help and supplies.'],
      ['A guide', 'Timber everywhere. You will need to cut road in places.'],
    ],
    wallawalla: [
      ['A clerk', 'From here the Columbia carries you west if you can build a raft or buy a boat.'],
      ['A Cayuse man', 'Good horses here. Your oxen look tired.'],
    ],
    dalles: [
      ['A raft builder', 'The river is quicker but the rocks have taken many. Keep to the channel.'],
      ['A toll collector', 'The Barlow Road goes around Mount Hood. Rough, but it keeps you dry. Pay at the gate.'],
    ],
  };

  // ---------- Helpers ----------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const alive = (s) => s.party.filter((p) => p.alive);

  function healthLabel(h) {
    if (h < 35) return 'good';
    if (h < 70) return 'fair';
    if (h < 105) return 'poor';
    return 'very poor';
  }

  function dateOf(s) {
    const d = new Date(Date.UTC(1848, s.startMonth, 1));
    d.setUTCDate(d.getUTCDate() + s.day);
    return d;
  }
  function dateString(s) {
    const d = dateOf(s);
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, 1848`;
  }

  function occupation(s) {
    return OCCUPATIONS.find((o) => o.id === s.occupation);
  }

  function priceMultiplier(s) {
    return 1 + 0.25 * s.fortsVisited;
  }

  function prices(s) {
    const m = priceMultiplier(s);
    const out = {};
    for (const k in BASE_PRICES) out[k] = Math.round(BASE_PRICES[k] * m * 100) / 100;
    return out;
  }

  function log(s, msg) {
    s.log.push({ date: dateString(s), msg });
    if (s.log.length > 200) s.log.shift();
  }

  // ---------- Setup ----------
  function newGame(opts) {
    const occ = OCCUPATIONS.find((o) => o.id === opts.occupation) || OCCUPATIONS[0];
    const seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 2 ** 31);
    const names = (opts.names || []).slice(0, 5);
    while (names.length < 5) names.push(['Jacob', 'Sarah', 'Ezra', 'Mary', 'Henry'][names.length]);
    const s = {
      seed,
      rngState: seed,
      occupation: occ.id,
      money: occ.cash,
      startMonth: START_MONTHS.includes(opts.month) ? opts.month : 3,
      day: 0,
      party: names.map((n, i) => ({ name: n || `Traveler ${i + 1}`, alive: true, ill: null, leader: i === 0 })),
      health: 0,
      oxen: 0, food: 0, clothing: 0, bullets: 0, wheel: 0, axle: 0, tongue: 0,
      pace: 'steady', rations: 'filling',
      at: 'independence',
      next: null,
      milesToNext: 0,
      segmentLength: 0,
      milesTraveled: 0,
      path: ['independence'],
      fortsVisited: 0,
      oxInjured: false,
      broken: null,
      weather: null,
      river: null,
      status: 'store', // store | landmark | travel | river | fork | dalles | won | dead
      log: [],
      deaths: [],
    };
    s.weather = rollWeather(s, rngFor(s));
    log(s, `The party leaves ${LANDMARKS.independence.name} with ${occ.name.toLowerCase()} ${s.party[0].name} in charge.`);
    return s;
  }

  // Each call advances a persisted RNG state so saves are deterministic.
  function rngFor(s) {
    const r = makeRng(s.rngState);
    s.rngState = Math.floor(r() * 2 ** 31) ^ (s.day * 2654435761);
    return r;
  }

  // ---------- Store ----------
  function buy(s, item, qty) {
    if (!(item in BASE_PRICES) || qty <= 0) return { ok: false, msg: 'Nothing to buy.' };
    const p = prices(s)[item];
    const have = s[item];
    const room = LIMITS[item] - have;
    if (room <= 0) return { ok: false, msg: `Your wagon can't hold more ${ITEM_LABEL[item]}.` };
    qty = Math.min(qty, room);
    const cost = Math.round(p * qty * 100) / 100;
    if (cost > s.money + 1e-9) return { ok: false, msg: `That costs $${cost.toFixed(2)}. You have $${s.money.toFixed(2)}.` };
    s.money = Math.round((s.money - cost) * 100) / 100;
    s[item] += qty;
    return { ok: true, msg: `Bought ${qty} ${ITEM_LABEL[item]} for $${cost.toFixed(2)}.`, qty, cost };
  }

  function sell(s, item, qty) {
    // Store buys back at half price. Used for correcting mistakes in the opening store.
    qty = Math.min(qty, s[item]);
    if (qty <= 0) return { ok: false, msg: 'Nothing to return.' };
    const refund = Math.round(prices(s)[item] * qty * (s.day === 0 && s.at === 'independence' ? 1 : 0.5) * 100) / 100;
    s[item] -= qty;
    s.money = Math.round((s.money + refund) * 100) / 100;
    return { ok: true, msg: `Returned ${qty} ${ITEM_LABEL[item]} for $${refund.toFixed(2)}.` };
  }

  // ---------- Departure / arrival ----------
  function canLeave(s) {
    if (s.oxen < 2) return 'You need at least one yoke of oxen to pull the wagon.';
    return null;
  }

  function depart(s, forkIndex) {
    const lm = LANDMARKS[s.at];
    const idx = lm.next.length > 1 ? (forkIndex || 0) : 0;
    s.next = lm.next[idx];
    s.segmentLength = lm.dist[idx];
    s.milesToNext = lm.dist[idx];
    s.status = 'travel';
    log(s, `Left ${lm.name}. ${s.milesToNext} miles to ${LANDMARKS[s.next].name}.`);
  }

  function arrive(s) {
    s.at = s.next;
    s.next = null;
    s.milesToNext = 0;
    s.path.push(s.at);
    const lm = LANDMARKS[s.at];
    log(s, `Arrived at ${lm.name}.`);
    if (lm.type === 'fort') s.fortsVisited += 1;
    if (lm.type === 'river') { s.river = rollRiver(s, rngFor(s)); s.status = 'river'; }
    else if (lm.type === 'dalles') s.status = 'dalles';
    else if (lm.type === 'end') s.status = 'won';
    else if (lm.next.length > 1) s.status = 'fork';
    else s.status = 'landmark';
  }

  // ---------- Weather ----------
  function rollWeather(s, rng) {
    const zoneId = s.next ? LANDMARKS[s.next].zone : LANDMARKS[s.at].zone;
    const zone = ZONES[zoneId];
    const m = dateOf(s).getUTCMonth();
    const temp = MONTH_TEMP[m] + zone.temp + rng.int(-12, 12);
    let label;
    if (temp < 10) label = 'very cold';
    else if (temp < 30) label = 'cold';
    else if (temp < 50) label = 'cool';
    else if (temp < 70) label = 'warm';
    else if (temp < 90) label = 'hot';
    else label = 'very hot';
    const wetChance = 0.18 * zone.rain;
    let precip = null;
    if (rng.chance(wetChance)) {
      if (temp < 32) precip = rng.chance(0.3) ? 'heavy snow' : 'snow';
      else precip = rng.chance(0.25) ? 'heavy rain' : 'rain';
    }
    return { temp, label, precip, zone: zoneId };
  }

  function weatherString(w) {
    return w.precip ? `${w.label}, ${w.precip}` : w.label;
  }

  // ---------- Health ----------
  function dailyHealth(s, rng, resting) {
    const living = alive(s);
    const pace = PACES.find((p) => p.id === s.pace);
    const rat = RATIONS.find((r) => r.id === s.rations);
    s.health *= resting ? 0.82 : 0.9;
    if (!resting) s.health += pace.dmg;
    if (s.food <= 0) s.health += 6;
    else s.health += rat.dmg;
    const w = s.weather;
    if (w.temp < 32) {
      const need = living.length * (w.temp < 10 ? 3 : 2);
      const short = clamp(need - s.clothing, 0, need);
      s.health += need ? (short / need) * (w.temp < 10 ? 6 : 3) : 0;
    }
    if (w.temp >= 90) s.health += 1;
    if (w.precip === 'heavy rain' || w.precip === 'heavy snow') s.health += 1;
    s.health += living.filter((p) => p.ill).length;
    s.health = clamp(s.health, 0, 200);
  }

  function processIllness(s, rng, resting) {
    const events = [];
    const doctor = s.occupation === 'doctor';
    for (const p of alive(s)) {
      if (!p.ill) continue;
      p.ill.days -= 1;
      let recover = 0.08 + (resting ? 0.06 : 0) + (doctor ? 0.06 : 0) + (s.health < 35 ? 0.04 : 0);
      if (p.ill.days <= 0) recover += 0.25;
      if (rng.chance(recover)) {
        events.push({ type: 'recover', msg: `${p.name} is well again.` });
        p.ill = null;
        continue;
      }
      const serious = SERIOUS.includes(p.ill.what);
      let die = serious ? 0.007 : 0.0015;
      if (s.health > 35) die += (s.health - 35) * 0.0007;
      if (s.health >= 105) die *= 2;
      if (doctor) die *= 0.7;
      if (resting) die *= 0.6;
      if (rng.chance(die)) {
        const what = p.ill.what;
        killMember(s, p, what);
        events.push({ type: 'death', msg: `${p.name} has died of ${what}.`, name: p.name });
      }
    }
    // Starvation or ruin can take healthy people too.
    if (s.health >= 140) {
      const victims = alive(s);
      if (victims.length && rng.chance(0.06)) {
        const p = rng.pick(victims);
        const cause = s.food <= 0 ? 'starvation' : 'exhaustion';
        killMember(s, p, cause);
        events.push({ type: 'death', msg: `${p.name} has died of ${cause}.`, name: p.name });
      }
    }
    return events;
  }

  function killMember(s, p, cause) {
    p.alive = false;
    s.deaths.push({ name: p.name, cause: cause || 'unknown causes', date: dateString(s), where: s.next ? `near ${LANDMARKS[s.next].name}` : LANDMARKS[s.at].name });
    log(s, `${p.name} died of ${cause}.`);
    if (p.leader || alive(s).length === 0) s.status = 'dead';
  }

  // ---------- Random events ----------
  function randomEvent(s, rng) {
    const living = alive(s);
    const w = s.weather;
    const zone = w.zone;
    const m = dateOf(s).getUTCMonth();
    const farmer = s.occupation === 'farmer';
    const ill = 0.022 + s.health * 0.001;

    const table = [
      { p: ill * (s.occupation === 'doctor' ? 0.7 : 1), fn: () => {
        const cands = living.filter((p) => !p.ill);
        if (!cands.length) return null;
        const p = rng.pick(cands);
        const what = rng.pick(ILLNESSES);
        p.ill = { what, days: rng.int(6, 14) };
        return { type: 'ill', msg: `${p.name} has ${what}.` };
      } },
      { p: 0.005, fn: () => {
        const cands = living.filter((p) => !p.ill);
        if (!cands.length) return null;
        const p = rng.pick(cands);
        const what = rng.pick(INJURIES);
        p.ill = { what, days: rng.int(8, 16) };
        return { type: 'ill', msg: `${p.name} has ${what}.` };
      } },
      { p: (farmer ? 0.005 : 0.012), fn: () => {
        if (s.oxen < 1 || s.oxInjured) return null;
        s.oxInjured = true;
        return { type: 'bad', msg: 'One of the oxen is injured. You will travel slower.' };
      } },
      { p: (farmer ? 0.003 : 0.007) + (s.health > 70 ? 0.004 : 0), fn: () => {
        if (s.oxen < 1) return null;
        s.oxen -= 1;
        return { type: 'bad', msg: s.oxen > 0 ? 'One of your oxen has died.' : 'Your last ox has died. You cannot move.' };
      } },
      { p: 0.013, fn: () => {
        const part = rng.pick(['wheel', 'axle', 'tongue']);
        s.broken = part;
        return { type: 'broken', msg: `A wagon ${part} broke.`, part };
      } },
      { p: 0.007, fn: () => {
        const opts = ['food', 'clothing', 'bullets', 'oxen'].filter((k) => s[k] > 0);
        if (!opts.length) return null;
        const k = rng.pick(opts);
        const amt = Math.min(s[k], k === 'food' ? Math.ceil(s.food * rng.int(10, 30) / 100) : k === 'oxen' ? 1 : Math.max(1, Math.ceil(s[k] * 0.25)));
        s[k] -= amt;
        return { type: 'bad', msg: `A thief came in the night and stole ${amt} ${ITEM_LABEL[k]}.` };
      } },
      { p: 0.006, fn: () => { const d = rng.int(1, 4); s.lostDays = d; return { type: 'delay', msg: `Lost trail. You lose ${d} day${d > 1 ? 's' : ''}.`, days: d }; } },
      { p: ZONES[zone].speed < 1 ? 0.012 : 0.004, fn: () => { s.slowToday = 0.5; return { type: 'delay', msg: 'Rough trail. Slow going today.' }; } },
      { p: 0.005, fn: () => { s.lostDays = 1; return { type: 'delay', msg: 'Heavy fog. You lose a day.', days: 1 }; } },
      { p: (zone === 'plains' || zone === 'highplains') && m >= 4 && m <= 7 ? 0.008 : 0, fn: () => {
        s.lostDays = 1;
        const lost = Math.min(s.food, rng.int(5, 30));
        s.food -= lost;
        return { type: 'delay', msg: `Severe thunderstorm. You lose a day${lost ? ` and ${lost} pounds of food` : ''}.`, days: 1 };
      } },
      { p: (zone === 'plains' || zone === 'highplains') && m >= 5 && m <= 7 ? 0.004 : 0, fn: () => {
        s.lostDays = 1;
        return { type: 'delay', msg: 'Hail storm. You lose a day.', days: 1 };
      } },
      { p: w.temp < 25 ? 0.05 : 0, fn: () => {
        const d = rng.int(1, 3); s.lostDays = d; s.health += 4;
        return { type: 'delay', msg: `Blizzard. You lose ${d} day${d > 1 ? 's' : ''}.`, days: d };
      } },
      { p: 0.007, fn: () => { s.health += 6; return { type: 'bad', msg: 'Bad water.' }; } },
      { p: zone === 'highdesert' || zone === 'snakeplain' ? 0.012 : 0.003, fn: () => { s.health += 5; return { type: 'bad', msg: 'No water.' }; } },
      { p: zone !== 'plains' && m >= 6 ? 0.008 : 0.003, fn: () => { s.health += 2; if (rng.chance(0.25) && s.oxen > 0) { s.oxen -= 1; return { type: 'bad', msg: 'Inadequate grass. An ox wandered off looking for forage.' }; } return { type: 'bad', msg: 'Inadequate grass for the oxen.' }; } },
      { p: 0.003, fn: () => {
        const k = rng.pick(['food', 'clothing', 'bullets']);
        const amt = k === 'food' ? Math.min(s.food, rng.int(20, 80)) : Math.min(s[k], rng.int(1, 3));
        if (!amt) return null;
        s[k] -= amt;
        return { type: 'bad', msg: `A fire in the wagon. You lose ${amt} ${ITEM_LABEL[k]}.` };
      } },
      { p: m >= 4 && m <= 8 && ZONES[zone].rain > 0.5 ? 0.012 : 0, fn: () => {
        const amt = rng.int(10, 40); s.food = Math.min(LIMITS.food, s.food + amt);
        return { type: 'good', msg: `You find wild fruit. +${amt} pounds of food.` };
      } },
      { p: 0.006, fn: () => {
        const gains = [];
        const k = rng.pick(['food', 'clothing', 'bullets', 'wheel', 'axle', 'tongue', 'oxen']);
        const amt = k === 'food' ? rng.int(20, 100) : k === 'oxen' ? (rng.chance(0.5) ? 1 : 0) : rng.int(1, 3);
        if (!amt) return { type: 'good', msg: 'You find an abandoned wagon, but it has nothing useful.' };
        s[k] = Math.min(LIMITS[k], s[k] + amt); gains.push(`${amt} ${ITEM_LABEL[k]}`);
        return { type: 'good', msg: `You find an abandoned wagon with ${gains.join(', ')}.` };
      } },
      { p: s.broken ? 0 : 0.003, fn: () => { s.health = Math.max(0, s.health - 10); return { type: 'good', msg: 'A passing family shares a hot meal and news from home. Spirits lift.' }; } },
    ];
    for (const e of table) {
      if (e.p > 0 && rng.chance(e.p)) {
        const r = e.fn();
        if (r) { log(s, r.msg); return r; }
      }
    }
    return null;
  }

  // ---------- Travel ----------
  function speed(s) {
    if (s.oxen <= 0) return 0;
    const pace = PACES.find((p) => p.id === s.pace);
    const zone = ZONES[LANDMARKS[s.next].zone];
    let oxFactor = Math.min(1, s.oxen / 6);
    if (s.oxInjured) oxFactor *= 0.75;
    let weatherFactor = 1;
    if (s.weather.precip === 'heavy rain') weatherFactor = 0.7;
    if (s.weather.precip === 'snow') weatherFactor = 0.7;
    if (s.weather.precip === 'heavy snow') weatherFactor = 0.4;
    // Sick people slow the wagon.
    const sick = alive(s).filter((p) => p.ill).length;
    const sickFactor = 1 - 0.06 * sick;
    return 20 * pace.mult * oxFactor * zone.speed * weatherFactor * sickFactor;
  }

  function eatOneDay(s) {
    const rat = RATIONS.find((r) => r.id === s.rations);
    s.food = Math.max(0, s.food - rat.lbs * alive(s).length);
  }

  function travelDay(s) {
    const out = { events: [], arrived: false, miles: 0 };
    if (s.status !== 'travel') return out;
    if (s.broken) { out.events.push({ type: 'blocked', msg: `You can't travel with a broken ${s.broken}.` }); return out; }
    if (s.oxen <= 0) { out.events.push({ type: 'blocked', msg: 'You have no oxen to pull the wagon.' }); return out; }
    const rng = rngFor(s);
    s.day += 1;
    s.weather = rollWeather(s, rng);
    s.slowToday = 1; s.lostDays = 0;
    eatOneDay(s);
    dailyHealth(s, rng, false);
    const ev = randomEvent(s, rng);
    if (ev) out.events.push(ev);
    for (const e of processIllness(s, rng, false)) out.events.push(e);
    if (s.status === 'dead') return out;
    if (s.lostDays) {
      // Extra lost days consume food and time but no miles.
      for (let i = 1; i < s.lostDays; i++) { s.day += 1; eatOneDay(s); dailyHealth(s, rng, true); }
    } else if (!s.broken) {
      const miles = Math.max(1, Math.round(speed(s) * s.slowToday));
      const step = Math.min(miles, s.milesToNext);
      s.milesToNext -= step;
      s.milesTraveled += step;
      out.miles = step;
      if (s.milesToNext <= 0) { arrive(s); out.arrived = true; }
    }
    if (s.food <= 0 && !out.events.some((e) => e.type === 'nofood')) out.events.push({ type: 'nofood', msg: 'You have run out of food.' });
    return out;
  }

  function rest(s, days) {
    const rng = rngFor(s);
    const events = [];
    const atLandmark = s.status !== 'travel';
    for (let i = 0; i < days && s.status !== 'dead'; i++) {
      s.day += 1;
      s.weather = rollWeather(s, rng);
      eatOneDay(s);
      dailyHealth(s, rng, true);
      if (atLandmark) s.health *= 0.9;
      if (s.oxInjured && rng.chance(0.3)) { s.oxInjured = false; events.push({ type: 'recover', msg: 'The injured ox has recovered.' }); }
      for (const e of processIllness(s, rng, true)) events.push(e);
    }
    log(s, `Rested ${days} day${days > 1 ? 's' : ''}.`);
    return events;
  }

  // ---------- Broken parts ----------
  function repair(s) {
    if (!s.broken) return { ok: false, msg: 'Nothing is broken.' };
    const rng = rngFor(s);
    const skilled = s.occupation === 'carpenter' || s.occupation === 'blacksmith';
    s.day += 1; eatOneDay(s); dailyHealth(s, rng, true);
    if (rng.chance(skilled ? 0.6 : 0.3)) {
      const part = s.broken; s.broken = null;
      log(s, `Repaired the ${part}.`);
      return { ok: true, msg: `You spent a day and repaired the ${part}.` };
    }
    return { ok: false, msg: `You spent a day trying, but the ${s.broken} can't be fixed.` };
  }

  function replacePart(s) {
    if (!s.broken) return { ok: false, msg: 'Nothing is broken.' };
    const part = s.broken;
    if (s[part] <= 0) return { ok: false, msg: `You have no spare ${part}.` };
    s[part] -= 1; s.broken = null;
    log(s, `Replaced the broken ${part}.`);
    return { ok: true, msg: `You replaced the broken ${part} with a spare.` };
  }

  // ---------- Rivers ----------
  function rollRiver(s, rng) {
    const id = s.at;
    const m = dateOf(s).getUTCMonth();
    const spring = m >= 3 && m <= 5;
    const base = { kansas: [620, 2.0, 5.5], bigblue: [200, 1.5, 4.5], green: [400, 4.5, 12], snake: [1000, 4.0, 10] }[id] || [300, 2, 5];
    let depth = base[1] + rng() * (base[2] - base[1]);
    if (spring) depth *= 1.15; else if (m >= 7) depth *= 0.85;
    depth = Math.round(depth * 10) / 10;
    const width = Math.round(base[0] * (0.85 + rng() * 0.3));
    const swift = spring && rng.chance(0.5);
    return { width, depth, swift, ferryWait: rng.int(1, 5) };
  }

  function riverWait(s) {
    const events = rest(s, 1);
    const r = s.river; const rng = rngFor(s);
    r.depth = Math.max(1, Math.round((r.depth + (rng() - 0.55) * 0.8) * 10) / 10);
    r.swift = rng.chance(r.swift ? 0.6 : 0.2);
    return events;
  }

  function crossRiver(s, method) {
    const lm = LANDMARKS[s.at];
    const r = s.river;
    const rng = rngFor(s);
    const res = { ok: true, msgs: [] };
    if (method === 'ferry') {
      if (!lm.ferry) return { ok: false, msgs: ['There is no ferry here.'] };
      if (s.money < lm.ferry) return { ok: false, msgs: [`The ferry costs $${lm.ferry}. You don't have enough money.`] };
      s.money -= lm.ferry;
      for (let i = 0; i < r.ferryWait; i++) { s.day += 1; eatOneDay(s); dailyHealth(s, rng, true); }
      res.msgs.push(`You waited ${r.ferryWait} day${r.ferryWait > 1 ? 's' : ''} for the ferry.`);
      if (rng.chance(0.03)) res.msgs.push(loseSupplies(s, rng, 0.1, 'The ferry scraped a sandbar. Some supplies went overboard.'));
      else res.msgs.push('The ferry got your party and wagon safely across.');
    } else if (method === 'guide') {
      if (!lm.guide) return { ok: false, msgs: ['No guide is offering help here.'] };
      if (s.clothing < 3) return { ok: false, msgs: ['The guide asks for 3 sets of clothing. You don\'t have enough.'] };
      s.clothing -= 3;
      s.day += 1; eatOneDay(s);
      if (rng.chance(0.03)) res.msgs.push(loseSupplies(s, rng, 0.08, 'Even the guide could not keep everything dry.'));
      else res.msgs.push('The guide led your wagon safely across.');
    } else if (method === 'ford') {
      s.day += 1; eatOneDay(s);
      if (r.depth < 2.5) {
        res.msgs.push(rng.chance(0.08) ? (s.lostDays = 1, s.day += 1, 'The wagon got stuck in mud. You lose a day.') : 'You forded the river safely.');
      } else if (r.depth < 3.0) {
        if (rng.chance(0.4)) res.msgs.push(loseSupplies(s, rng, 0.2, 'Water swamped the wagon bed. Some supplies were lost.'));
        else res.msgs.push('The water was high but you made it across.');
      } else {
        res.msgs.push(disaster(s, rng, Math.min(0.95, 0.45 + (r.depth - 3) * 0.12)));
      }
    } else if (method === 'caulk') {
      s.day += 1; eatOneDay(s);
      let risk = 0.12 + (r.swift ? 0.18 : 0) + (r.depth > 6 ? 0.08 : 0);
      if (r.depth < 1.5) { res.msgs.push('The river is too shallow to float. You drag the wagon across.'); risk = 0.02; }
      if (rng.chance(risk)) res.msgs.push(disaster(s, rng, 0.5));
      else res.msgs.push('You caulked the wagon and floated it across.');
    } else {
      return { ok: false, msgs: ['Unknown method.'] };
    }
    for (const m of res.msgs) log(s, m);
    s.river = null;
    s.status = s.status === 'dead' ? 'dead' : 'landmark';
    return res;
  }

  function loseSupplies(s, rng, frac, prefix) {
    const lost = [];
    for (const k of ['food', 'clothing', 'bullets', 'wheel', 'axle', 'tongue']) {
      if (s[k] > 0 && rng.chance(0.6)) {
        const amt = Math.max(1, Math.round(s[k] * frac * (0.5 + rng())));
        const take = Math.min(s[k], amt);
        s[k] -= take; lost.push(`${take} ${ITEM_LABEL[k]}`);
      }
    }
    if (rng.chance(frac) && s.oxen > 0) { s.oxen -= 1; lost.push('1 ox'); }
    return lost.length ? `${prefix} Lost: ${lost.join(', ')}.` : prefix.replace(/Some supplies.*$/, 'Nothing important was lost.');
  }

  function disaster(s, rng, severity) {
    let msg = loseSupplies(s, rng, 0.35 * severity + 0.1, 'The wagon tipped over!');
    if (rng.chance(0.35 * severity)) {
      const cands = alive(s).filter((p) => !p.leader);
      if (cands.length) {
        const p = rng.pick(cands);
        killMember(s, p, 'drowning');
        msg += ` ${p.name} drowned.`;
      }
    }
    return msg;
  }

  // ---------- Hunting ----------
  const HUNT_ANIMALS = {
    plains: ['bison', 'deer', 'rabbit', 'squirrel', 'antelope'],
    highplains: ['bison', 'antelope', 'rabbit', 'deer'],
    rockies: ['elk', 'deer', 'bear', 'squirrel', 'rabbit'],
    highdesert: ['antelope', 'rabbit', 'deer'],
    snakeplain: ['rabbit', 'antelope', 'deer', 'bear'],
    cascades: ['deer', 'elk', 'bear', 'squirrel'],
  };
  const ANIMAL_MEAT = { bison: 400, elk: 300, bear: 200, deer: 80, antelope: 60, rabbit: 4, squirrel: 2 };

  function huntZone(s) { return s.next ? LANDMARKS[s.next].zone : LANDMARKS[s.at].zone; }

  function finishHunt(s, bulletsFired, kills) {
    const rng = rngFor(s);
    s.bullets = Math.max(0, s.bullets - Math.ceil(bulletsFired / 20 * 100) / 100);
    s.bullets = Math.round(s.bullets * 100) / 100;
    const shot = kills.reduce((a, k) => a + (ANIMAL_MEAT[k] || 0), 0);
    const carry = Math.min(100 + 25 * (alive(s).length - 1), shot);
    const room = LIMITS.food - s.food;
    const kept = Math.min(carry, room);
    s.food += kept;
    s.day += 1; eatOneDay(s); dailyHealth(s, rng, true);
    let msg;
    if (!shot) msg = 'You came back empty-handed.';
    else if (kept < shot) msg = `You shot ${shot} pounds of meat but could only carry ${kept} pounds back to the wagon.`;
    else msg = `You shot ${shot} pounds of meat and brought it all back.`;
    log(s, msg);
    return { shot, kept, msg };
  }

  // ---------- Trading ----------
  function tradeOffer(s) {
    const rng = rngFor(s);
    s.day += 1; eatOneDay(s);
    const items = ['oxen', 'food', 'clothing', 'bullets', 'wheel', 'axle', 'tongue'];
    const qty = { oxen: [1, 2], food: [40, 150], clothing: [1, 4], bullets: [1, 5], wheel: [1, 1], axle: [1, 1], tongue: [1, 1] };
    // If stuck with a broken part, travelers are likelier to offer that part.
    let get = s.broken && s[s.broken] === 0 && rng.chance(0.5) ? s.broken : rng.pick(items);
    const giveable = items.filter((k) => k !== get && s[k] > 0);
    if (!giveable.length) return null;
    const give = rng.pick(giveable);
    const offer = {
      get: { item: get, qty: rng.int(...qty[get]) },
      give: { item: give, qty: rng.int(...qty[give]) },
    };
    return offer;
  }

  function acceptTrade(s, offer) {
    if (s[offer.give.item] < offer.give.qty) return { ok: false, msg: `You don't have ${offer.give.qty} ${ITEM_LABEL[offer.give.item]}.` };
    s[offer.give.item] -= offer.give.qty;
    s[offer.get.item] = Math.min(LIMITS[offer.get.item], s[offer.get.item] + offer.get.qty);
    const msg = `Traded ${offer.give.qty} ${ITEM_LABEL[offer.give.item]} for ${offer.get.qty} ${ITEM_LABEL[offer.get.item]}.`;
    log(s, msg);
    return { ok: true, msg };
  }

  // ---------- The Dalles ----------
  const BARLOW_TOLL = 30;
  function takeBarlow(s) {
    if (s.money < BARLOW_TOLL) return { ok: false, msg: `The toll is $${BARLOW_TOLL}. You can't afford it.` };
    s.money -= BARLOW_TOLL;
    const rng = rngFor(s);
    const msgs = [`You paid the $${BARLOW_TOLL} toll and took the Barlow Road around Mount Hood.`];
    const days = 9 + rng.int(0, 4);
    for (let i = 0; i < days && s.status !== 'dead'; i++) {
      s.day += 1; s.weather = rollWeather(s, rng); eatOneDay(s); dailyHealth(s, rng, false);
      if (rng.chance(0.08)) { const r = randomEvent(s, rng); if (r && r.type !== 'broken') msgs.push(r.msg); else s.broken = null; }
      for (const e of processIllness(s, rng, false)) msgs.push(e.msg);
    }
    msgs.push(`After ${days} hard days the road came down into the valley.`);
    s.milesTraveled += LANDMARKS.dalles.dist[0];
    if (s.status !== 'dead') { s.next = 'willamette'; arrive(s); }
    return { ok: true, msgs };
  }

  function finishRaft(s, hits) {
    const rng = rngFor(s);
    const msgs = [];
    s.day += 4; for (let i = 0; i < 4; i++) eatOneDay(s);
    s.milesTraveled += LANDMARKS.dalles.dist[0];
    if (hits === 0) msgs.push('You guided the raft down the Columbia without a scratch.');
    for (let i = 0; i < hits && s.status !== 'dead'; i++) {
      if (rng.chance(0.3)) {
        const cands = alive(s).filter((p) => !p.leader);
        if (cands.length) { const p = rng.pick(cands); killMember(s, p, 'drowning'); msgs.push(`The raft hit a rock. ${p.name} was swept away and drowned.`); continue; }
      }
      msgs.push(loseSupplies(s, rng, 0.25, 'The raft hit a rock.'));
    }
    if (s.status !== 'dead') { s.next = 'willamette'; arrive(s); }
    return { ok: true, msgs };
  }

  // ---------- Score ----------
  function score(s) {
    const living = alive(s);
    const hl = healthLabel(s.health);
    const perPerson = { good: 500, fair: 400, poor: 300, 'very poor': 200 }[hl];
    const rows = [
      ['Travelers in ' + hl + ' health', living.length, living.length * perPerson],
      ['Wagon', 1, 50],
      ['Oxen', s.oxen, s.oxen * 4],
      ['Spare parts', s.wheel + s.axle + s.tongue, (s.wheel + s.axle + s.tongue) * 2],
      ['Sets of clothing', s.clothing, s.clothing * 2],
      ['Bullets', Math.floor(s.bullets * 20), Math.floor(s.bullets * 20 / 50)],
      ['Pounds of food', Math.floor(s.food), Math.floor(s.food / 25)],
      ['Cash', '$' + Math.floor(s.money), Math.floor(s.money / 5)],
    ];
    const raw = rows.reduce((a, r) => a + r[2], 0);
    const bonus = occupation(s).bonus;
    return { rows, raw, bonus, total: Math.round(raw * bonus) };
  }

  const OT = {
    makeRng, OCCUPATIONS, MONTHS, START_MONTHS, BASE_PRICES, LIMITS, ITEM_LABEL, LANDMARKS, ZONES, PACES, RATIONS, TALK,
    HUNT_ANIMALS, ANIMAL_MEAT, BARLOW_TOLL,
    newGame, buy, sell, prices, priceMultiplier, canLeave, depart, travelDay, rest, repair, replacePart,
    riverWait, crossRiver, finishHunt, huntZone, tradeOffer, acceptTrade, takeBarlow, finishRaft, score,
    healthLabel, dateString, dateOf, weatherString, alive, occupation, speed,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = OT;
  else root.OT = OT;
})(typeof window !== 'undefined' ? window : globalThis);
