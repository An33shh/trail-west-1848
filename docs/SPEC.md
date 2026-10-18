# Mechanics Spec

Clean-room specification for a green-screen remake that follows the 1985 Apple II rules of The Oregon Trail, plus the typed shootout from the 1978 text version. Written from public, documented descriptions of how the game plays. No original code, art, sound, or text was used. Every number marked **(tunable)** is an estimate chosen to match documented behavior and should be adjusted against real gameplay observation.

## Rules for this repo

1. No MECC/SoftKey/HMH binaries, disk images, graphics, sounds, music, or verbatim game text in the repo.
2. All art is drawn procedurally in code. All dialogue and flavor text is written fresh.
3. If a binary is analyzed later (for example with REA), findings go into this file as plain-language rules and numbers. Decompiled code never goes into `src/`.

## Setting

- Year 1848. Independence, Missouri to the Willamette Valley, Oregon.
- Party of 5: the leader plus 4 named members.
- Departure month: March, April, May, June, or July.

## Occupations

Documented: starting cash and score multiplier are the only differences.

| Occupation | Cash | Score x |
|---|---|---|
| Banker from Boston | $1600 | 1 |
| Carpenter from Ohio | $800 | 2 |
| Farmer from Illinois | $400 | 3 |

## Riders (from the 1978 text game)

Rare event, likelier on the plains. The player presses ENTER when ready, then types the word shown (BANG, BLAM, POW or WHAM). Under 1.5 s: riders flee. Under 3.5 s: driven off, may lose some food. Slower or mistyped: wagon raided, a traveler may be shot. Costs up to half a box of bullets.

## Supplies

Base prices at Independence. Each later fort applies a markup that rises with distance (tunable: +25% per fort).

| Item | Unit | Price |
|---|---|---|
| Oxen | 1 yoke (2 oxen) | $40 |
| Food | 1 lb | $0.20 |
| Clothing | 1 set | $10 |
| Bullets | 1 box (20) | $2 |
| Wagon wheel / axle / tongue | 1 | $10 |

Carry limits: 20 oxen, 2000 lb food, 99 clothing, 99 boxes, 3 of each spare part.

## Route

18 landmarks, 3 forks, about 2000 miles. Segment miles are (tunable).

```
Independence ── 102 ── Kansas River ── 82 ── Big Blue River ── 118 ── Fort Kearney
── 250 ── Chimney Rock ── 86 ── Fort Laramie ── 190 ── Independence Rock ── 102 ── South Pass
South Pass forks:
   left  ── 57 ── Green River ── 144 ── Soda Springs
   right ── 125 ── Fort Bridger ── 162 ── Soda Springs
Soda Springs ── 57 ── Fort Hall ── 182 ── Snake River ── 114 ── Fort Boise ── 160 ── Blue Mountains
Blue Mountains forks:
   left  ── 55 ── Fort Walla Walla ── 120 ── The Dalles
   right ── 125 ── The Dalles
The Dalles: raft the Columbia (mini-game) or pay the Barlow Road toll ($30 tunable), then Willamette Valley.
```

Types: river (Kansas, Big Blue, Green, Snake), fort (Kearney, Laramie, Bridger, Hall, Boise, Walla Walla), natural (Chimney Rock, Independence Rock, South Pass, Soda Springs, Blue Mountains), town (Independence, The Dalles), end (Willamette Valley).

Terrain zones for weather, hunting animals and travel graphics: plains, high plains, rockies, high desert, snake plain, cascades.

## Daily turn

One "travel" action advances one day:

1. Weather rolled from zone + month climate table, plus noise.
2. Miles = base 18 x pace x oxen factor x terrain factor x weather factor (tunable).
   - Pace: steady 1.0, strenuous 1.5, grueling 2.0.
   - Oxen factor: min(1, oxen/6), 0 if no oxen.
   - Terrain: plains 1.0, rockies and cascades 0.75.
3. Food used = rations lb x living members. Filling 3, meager 2, bare bones 1.
4. Health update (below).
5. At most one random event.
6. Stop on landmark arrival.

Resting costs one day, uses food, and improves health. At a landmark, resting heals faster.

## Health model

Party health is a damage meter, 0 = perfect. Each day it decays 10% then accumulates:

- Pace: steady +0, strenuous +2, grueling +4
- Rations: filling +0, meager +2, bare bones +4
- No food: +6
- Cold weather with fewer than 2 sets of clothing per person: +2 to +6
- Very hot: +1
- Each sick or injured member: +1

Display: 0-34 good, 35-69 fair, 70-104 poor, 105+ very poor. When very poor, daily death risk rises. Individual members can catch illnesses (exhaustion, typhoid, cholera, measles, dysentery, fever) or injuries (broken arm, broken leg, snakebite, drowned only at rivers). Illness lasts about 10 days; recovery odds improve with rest and the Doctor perk. A member who stays sick while health is poor or worse may die.

## Random events (per day, tunable odds)

Bad: ox injured, ox died, member sick, member injured, broken wheel/axle/tongue, thief, lost trail (lose days), rough trail (slow), heavy fog, hail, severe thunderstorm, blizzard (mountains, late months), bad water, no water, inadequate grass, fire in wagon.
Good: wild fruit (+food), abandoned wagon (random supplies), helpful traveler.

A broken part: try to repair (1 day, odds better for Carpenter/Blacksmith), else replace with a spare, else stuck until trading for one.

## Rivers

Each crossing rolls width (ft) and depth (ft). Flow swiftness rises in spring months.

- Ford: safe under 2.5 ft, risky to 3 ft, disaster risk above.
- Caulk and float: moderate risk, worse if swift; safe when depth is low.
- Ferry: Kansas, Big Blue, Green cost $5 and wait 1-5 days. Very low risk.
- Snake River: a Shoshone guide crosses you for 3 sets of clothing. Very low risk.
- Wait a day: depth changes.

Failure outcomes: lose supplies, wagon stuck in mud (lose a day), member drowned (rare), wagon tipped.

## Hunting

Mouse, touch or arrow-key aim shooter. Animals by zone: bison, deer, elk, antelope, bear, rabbit, squirrel. Each shot costs one bullet. Max 100 lb carried back per hunt (documented). Over-hunting an area is not modeled (tunable).

## Trading

At landmarks or on the trail, a random traveler offers one item for another. Accept or decline. Takes a day.

## Talk to people

Each landmark has 2-3 short original lines from fellow emigrants and locals, written for this remake.

## Ending and score

Arriving at Willamette Valley ends the game. Points:

| Item | Points |
|---|---|
| Person, good health | 500 |
| Person, fair | 400 |
| Person, poor | 300 |
| Person, very poor | 200 |
| Wagon | 50 |
| Each ox | 4 |
| Each spare part | 2 |
| Each set of clothing | 2 |
| Bullets | 1 per 50 |
| Food | 1 per 25 lb |
| Cash | 1 per $5 |

Total x occupation bonus. Top-ten list stored per browser. Death of the whole party ends the game with an epitaph the player writes.

## Sources for documented behavior

- R. Philip Bouchard, landmark design notes: philipbouchard.com/oregon-trail/real-geography.html
- Bouchard, game walkthrough: died-of-dysentery.com/oregon-trail.html
- Giant Bomb, The Oregon Trail Deluxe overview (occupations and score bonuses)
- Wikipedia, The Oregon Trail (1985 video game) and series article
- StrategyWiki, The Oregon Trail walkthrough and gameplay pages
