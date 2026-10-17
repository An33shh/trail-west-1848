/* Tiny square-wave sound kit. Original tunes written for this remake. */
(function (root) {
  'use strict';
  let ctx = null;
  let muted = false;

  function ensure() {
    if (ctx) return ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
    return ctx;
  }

  function tone(freq, start, dur, type, vol) {
    const c = ensure();
    if (!c || muted) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, c.currentTime + start);
    g.gain.linearRampToValueAtTime(vol || 0.05, c.currentTime + start + 0.01);
    g.gain.linearRampToValueAtTime(0, c.currentTime + start + dur);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + start);
    o.stop(c.currentTime + start + dur + 0.02);
  }

  const N = { C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, G5: 784, A3: 220, G3: 196 };

  function play(seq, tempo) {
    let t = 0;
    for (const [n, beats] of seq) { if (n) tone(N[n], t, beats * tempo * 0.9, 'square', 0.035); t += beats * tempo; }
  }

  const Sound = {
    unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); },
    toggle() { muted = !muted; return muted; },
    get muted() { return muted; },
    click() { tone(880, 0, 0.03, 'square', 0.03); },
    shot() { tone(140, 0, 0.08, 'sawtooth', 0.06); tone(90, 0.03, 0.1, 'square', 0.04); },
    hit() { tone(660, 0, 0.06); tone(880, 0.06, 0.08); },
    bad() { tone(220, 0, 0.15); tone(165, 0.15, 0.25); },
    good() { tone(523, 0, 0.08); tone(659, 0.08, 0.08); tone(784, 0.16, 0.14); },
    death() { play([['E4', 2], ['D4', 1], ['C4', 3], ['G3', 4]], 0.18); },
    // Opening tune: a short original melody in a folk style.
    title() { play([['G4', 1], ['C5', 1], ['C5', 1], ['D5', 1], ['E5', 2], ['D5', 1], ['C5', 1], ['A4', 2], ['G4', 2], ['C5', 1], ['E5', 1], ['G5', 2], ['E5', 1], ['D5', 1], ['C5', 4]], 0.16); },
    arrive() { play([['C5', 1], ['E5', 1], ['G5', 2]], 0.12); },
    win() { play([['C5', 1], ['E5', 1], ['G5', 1], ['C5', 1], ['E5', 1], ['G5', 2], ['E5', 1], ['G5', 4]], 0.14); },
  };
  root.Sound = Sound;
})(typeof window !== 'undefined' ? window : globalThis);
