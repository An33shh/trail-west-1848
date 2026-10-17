# Trail West 1848

A clean-room browser remake of the 1992 color Macintosh release of The Oregon Trail (often called Oregon Trail Deluxe). Private fan project.

Play: open `dist/index.html` in any modern browser. No server, no install.

## What's in the game

- 8 occupations with starting cash, score multipliers and perks (Doctor, Blacksmith, Carpenter, Farmer)
- Opening general store plus six forts with rising prices
- 18 landmarks, 3 forks in the trail, about 1,900 miles
- Daily weather by terrain zone and month, pace and rations, a party health meter, illness and injury per traveler
- Random events: broken parts, thieves, storms, blizzards, bad water, lost trail, abandoned wagons, wild fruit
- River crossings: ford, caulk and float, ferry, or a Shoshone guide at the Snake River
- Point-and-shoot hunting with carry limits
- Trading and talking to people at landmarks
- The Dalles: raft the Columbia (dodge-the-rocks mini-game) or pay the Barlow Road toll
- Final score, Oregon Top Ten, tombstone epitaph on death
- Autosave and "Continue journey" (stored in the browser)
- Keyboard, mouse and touch input; works at phone width

## Layout

```
docs/SPEC.md            mechanics spec, every tunable number, sources
src/engine.js           pure game rules, no DOM, runs in Node
src/art.js              all graphics, drawn procedurally on a 320x160 canvas
src/audio.js            square-wave sound and original tunes
src/ui.js               screens, input, animation
src/style.css           System 7 style window chrome
src/body.html           page markup
tools/build.js          bundles src/ into dist/
dist/index.html         playable single file
test/sim.js             headless balance simulation
test/ui_playthrough.py  full playthrough in headless Chromium
```

## Commands

```
node tools/build.js                 # rebuild dist/
node test/sim.js 400 steady         # balance: careful play
node test/sim.js 400 reckless       # balance: grueling pace, bare-bones rations
python3 test/ui_playthrough.py      # end-to-end browser test (needs playwright + chromium)
```

## Clean-room rules

1. No MECC, SoftKey, Learning Company or HMH binaries, disk images, art, sound, music or verbatim text in this repo.
2. All art is drawn in code. All dialogue is original.
3. Mechanics come from public descriptions of how the game plays. Numbers that were estimated are marked tunable in `docs/SPEC.md`.
4. If the original binary is analyzed later (for example with REA), findings are written into `docs/SPEC.md` as plain-language rules and numbers. Decompiled code never goes into `src/`.

## Accuracy work still open

The values most likely to differ from the 1992 release, in priority order:

1. Starting cash for Doctor, Merchant, Blacksmith, Saddlemaker, Teacher
2. Segment mileages and fort price markups
3. Event probabilities and the health curve
4. River depth ranges per crossing and ford/caulk failure odds
5. Barlow Road toll and duration

Observing the original running in an emulator (Basilisk II or Mini vMac with your own copy) and logging numbers per playthrough is the fastest way to close these.

## Legal

The Oregon Trail is a trademark of its owner. This project is not affiliated with or endorsed by them, uses a different name in-game, and contains no original assets. Keep the repository private.
