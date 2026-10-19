# Trail West 1848

Green-screen browser remake of the 1985 Oregon Trail. Plain JS, no dependencies, no bundler.

## Commands

- Build: `node tools/build.js` (writes `dist/index.html` and `dist/trail-west.html`; commit `dist/`)
- Balance sim: `node test/sim.js 400 steady` and `node test/sim.js 400 reckless` (must print `errors: 0`)
- Browser playthrough: `python3 test/ui_playthrough.py test/out 480 1` (needs Python Playwright + Chromium)
- Publish (GitHub public repo + Pages + Netlify): follow `PUBLISH.md`, which runs `bash tools/publish.sh`

## Layout

- `src/engine.js` pure rules, no DOM, also loaded by Node tests
- `src/art.js` scenes drawn in code on 280x160, reduced to 1-bit green by `Art.phosphor`
- `src/ui.js` 40-column terminal, typed menus, hunting and rafting
- `docs/SPEC.md` every rule and tunable number with sources

## Rules

- Clean room: never add MECC, SoftKey, Learning Company or HMH binaries, disk images, art, sound or verbatim text.
- Don't call the game "The Oregon Trail" in the UI or repo name. It's "Trail West 1848".
- No em dashes or en dashes in any text, docs or commit messages.
- Keep commit author email as the GitHub noreply address already set in this repo.
