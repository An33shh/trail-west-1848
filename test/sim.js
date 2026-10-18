// Headless balance and smoke test. Plays many games with a simple bot.
// Usage: node test/sim.js [games]
const OT = require('../src/engine.js');

function bot(occ, seed, style) {
  const s = OT.newGame({ occupation: occ, names: ['Ada', 'Ben', 'Cal', 'Dee', 'Eli'], month: 3, seed });
  const budget = s.money;
  // Shopping list scaled to cash.
  const plan = budget >= 1000
    ? { oxen: 8, food: 900, clothing: 10, bullets: 10, wheel: 1, axle: 1, tongue: 1 }
    : { oxen: 6, food: 500, clothing: 5, bullets: 8, wheel: 1, axle: 1, tongue: 0 };
  for (const k of ['oxen', 'clothing', 'bullets', 'wheel', 'axle', 'tongue', 'food']) {
    let q = plan[k];
    while (q > 0 && !OT.buy(s, k, q).ok) q = Math.floor(q * 0.8);
  }
  if (OT.canLeave(s)) return { s, fail: 'cannot leave' };
  s.pace = style === 'reckless' ? 'grueling' : 'steady';
  s.rations = style === 'reckless' ? 'barebones' : 'filling';
  OT.depart(s);
  let guard = 0;
  while (guard++ < 3000) {
    if (s.status === 'dead' || s.status === 'won') break;
    if (s.status === 'travel') {
      if (s.broken) {
        if (s[s.broken] > 0) OT.replacePart(s);
        else {
          const r = OT.repair(s);
          if (!r.ok) {
            const o = OT.tradeOffer(s);
            if (o && o.get.item === s.broken && s[o.give.item] >= o.give.qty) { OT.acceptTrade(s, o); OT.replacePart(s); }
          }
        }
        continue;
      }
      if (s.oxen <= 0) {
        const o = OT.tradeOffer(s);
        if (o && o.get.item === 'oxen' && s[o.give.item] >= o.give.qty) OT.acceptTrade(s, o);
        continue;
      }
      if (style !== 'reckless' && OT.healthLabel(s.health) === 'poor' || OT.healthLabel(s.health) === 'very poor') { OT.rest(s, 2); continue; }
      if (s.food < 100 && s.bullets >= 1) {
        const z = OT.huntZone(s);
        const kills = [OT.makeRng(s.day + seed).pick(OT.HUNT_ANIMALS[z]), OT.makeRng(s.day * 7 + seed).pick(OT.HUNT_ANIMALS[z])];
        OT.finishHunt(s, 12, kills);
        continue;
      }
      const res = OT.travelDay(s);
      if (res.events.some((e) => e.type === 'riders')) OT.resolveRiders(s, 1000 + (seed % 4) * 1000);
    } else if (s.status === 'river') {
      const lm = OT.LANDMARKS[s.at];
      if (lm.guide && s.clothing >= 3) OT.crossRiver(s, 'guide');
      else if (lm.ferry && s.money >= lm.ferry) OT.crossRiver(s, 'ferry');
      else if (s.river.depth < 2.5) OT.crossRiver(s, 'ford');
      else OT.crossRiver(s, 'caulk');
    } else if (s.status === 'landmark' || s.status === 'fork') {
      const lm = OT.LANDMARKS[s.at];
      if (lm.type === 'fort') {
        if (s.food < 400) { let q = 400 - Math.floor(s.food); while (q > 0 && !OT.buy(s, 'food', q).ok) q = Math.floor(q / 2); }
        if (s.oxen < 4) OT.buy(s, 'oxen', 2);
      }
      OT.depart(s, s.status === 'fork' ? 0 : 0);
    } else if (s.status === 'dalles') {
      const r = OT.takeBarlow(s);
      if (!r.ok) OT.finishRaft(s, Math.random() < 0.5 ? 0 : 1);
    } else break;
  }
  return { s };
}

const N = parseInt(process.argv[2] || '400', 10);
const STYLE = process.argv[3] || 'steady';
const results = {};
let errors = 0;
for (const occ of OT.OCCUPATIONS.map((o) => o.id)) {
  const r = { won: 0, dead: 0, other: 0, days: [], survivors: [], score: [] };
  r.deaths = 0;
  for (let i = 0; i < N; i++) {
    try {
      const { s, fail } = bot(occ, 1000 + i, STYLE);
      if (fail) { r.other++; continue; }
      if (s.status === 'won') {
        r.won++; r.days.push(s.day); r.survivors.push(OT.alive(s).length); r.score.push(OT.score(s).total);
        if (!(s.milesTraveled > 1700 && s.milesTraveled < 2200)) throw new Error('mileage off: ' + s.milesTraveled);
      } else if (s.status === 'dead') r.dead++;
      else r.other++;
      r.deaths += s.deaths.length;
      for (const k of ['oxen', 'food', 'clothing', 'bullets', 'wheel', 'axle', 'tongue', 'money']) {
        if (!(s[k] >= 0) || !Number.isFinite(s[k])) throw new Error(`bad ${k}=${s[k]}`);
      }
    } catch (e) { errors++; if (errors < 5) console.error(occ, i, e.message); }
  }
  const avg = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(0) : '-');
  results[occ] = { win: (100 * r.won / N).toFixed(0) + '%', dead: r.dead, stuck: r.other, avgDays: avg(r.days), avgSurvivors: r.survivors.length ? (r.survivors.reduce((a, b) => a + b, 0) / r.survivors.length).toFixed(2) : '-', avgScore: avg(r.score), deathsPerGame: (r.deaths / N).toFixed(2) };
}
console.table(results);
console.log('errors:', errors);
process.exit(errors ? 1 : 0);
