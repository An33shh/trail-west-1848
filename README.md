# Trail West 1848

A clean-room browser remake of The Oregon Trail as it was played on green monochrome screens: the 1985 Apple II game's landmarks, store, rivers and hunting, shown as 1-bit green hi-res pictures above a 40-column text terminal where you type your choices. It also brings back the 1978 text game's shootout, where you type BANG as fast as you can. Private fan project.

Play: open `dist/index.html` in any modern browser. No server, no install.

## What's in the game

- Banker ($1600), carpenter ($800, 2x points), farmer ($400, 3x points)
- Typed numbered menus, typed names and quantities, tappable lines on phones
- Hiram's General Store with a running bill, six forts with rising prices
- 18 landmarks, 3 forks, about 1,900 miles; ASCII route map and progress bar
- Weather by zone and month, pace and rations, party health, illness and injury per traveler
- Random events, including hostile riders: type the word shown (BANG, BLAM, POW, WHAM) before they close in
- River crossings: ford, caulk and float, ferry, or a Shoshone guide at the Snake River
- Hunting with mouse, touch or arrow keys; 100 lb carry limit per hunt
- The Dalles: raft the Columbia or pay the Barlow Road toll
- Score table, Oregon Top Ten, ASCII tombstone with your epitaph
- Autosave and "Continue journey" (stored in the browser)

## How the pictures work

Scenes are composed in code on a 280x160 canvas (the Apple II hi-res width), then reduced to 1 bit per pixel: a pixel lights up where brightness changes (outlines) or where the area's fill pattern says so. Fills use four fixed patterns (black, sparse dots, checkerboard, solid), the same tricks monochrome hi-res art relied on. Scanlines and glow are CSS on top.

## Layout

```
docs/SPEC.md            mechanics spec, every tunable number, sources
src/engine.js           pure game rules, no DOM, runs in Node
src/art.js              all graphics, drawn in code, reduced to 1-bit green
src/audio.js            square-wave sound and original tunes
src/ui.js               40-column terminal, typed menus, mini-games
src/style.css           monitor bezel, phosphor glow, scanlines
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

1. Segment mileages and fort price markups
2. Event probabilities and the health curve
3. River depth ranges per crossing and ford/caulk failure odds
4. Barlow Road toll and duration

Observing the original running in an emulator (Basilisk II or Mini vMac with your own copy) and logging numbers per playthrough is the fastest way to close these.

## Legal

The Oregon Trail is a trademark of its owner. This project is not affiliated with or endorsed by them, uses a different name in-game, and contains no original assets. Keep the repository private.
