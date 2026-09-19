# Plan: v0.89.6 "the UI pass"

**Built 2026-09-19, all eight sections in one version.** The owner handed the
whole thing over ("do whatever you think is best... Fix anything else you find
along the way"), so the four open questions at the bottom were decided here
rather than asked. What was decided, and what changed at build:

1. **The cheat menu is kept and renamed "Sandbox"** (option 2 of the three).
   Cutting it would have left `?dev=1` as the only sandbox, and that is a URL
   nobody discovers. Its button moved into the Menu panel under "Game"; `#debug`
   is gone and the FPS readout is its own corner element. The Settings label and
   the window's own title say Sandbox too. The `cheatMenu*` element ids and the
   `cheatsUsed` save flag were **not** renamed -- that flag is what keeps a city
   off the leaderboard and it reaches into the save format.
2. **Town Info survives as a scenario-only panel**, retitled "Objective". It is
   `hidden` (not `initialHidden`) so `revealControls()` leaves it alone, and
   `ScenarioController._showPanel` shows it and calls `Panel.stackColumn()`.
3. **Leisure and Business did not merge.** The split that worked was moving Port
   and Airport out of Transport and into a new **Industry** group with the Data
   Centre -- all three are big, expensive and placed for what they do to
   industrial demand. That leaves Transport as just Road and Rail, which is right:
   they are the two most-clicked tools and they sit at the top where the pointer
   already is. Seven groups, not the six planned. Business is gone; its buildings
   are in Leisure.
4. **The colour tokens were not taken.** Once the per-ID tool-button rules were
   deleted (sixteen of them) and the colours moved into `toolRegistry.js`, the
   remaining named colours in `style.css` are mostly one-offs on individual modal
   headers. Tokenising them would have been churn without the re-skin they exist
   to enable, and the re-skin is not happening (see Decided). Left for whenever
   the tile pass does happen.

**Found and fixed at build, not in the plan:**

- Collapsing a tool group set `.hidden` and nothing happened: `.toolGroupBody`
  declares `display: flex` later in `style.css` than `.hidden` declares
  `display: none`, and at equal specificity the later rule wins. Needed an
  explicit `.toolGroupBody.hidden`.
- Every tooltip appeared on top of the panel it described. It was measured with
  `offsetWidth` while still `display: none`, so the measurement was 0 and the
  anchor maths put it at the button's own left edge. Show, then measure.
- The HUD bar broke the phone layout: `#wrapper` clears the header's measured
  height, but the readouts are `initialHidden` until a city starts, so the bar
  grew from one row to two with no resize event and no font load to re-trigger
  the measurement. `micropolis.js` now has a `ResizeObserver` on the header.
- `MonsterTV` has always been `right: 50px`, directly on top of the Tools panel.
  Widening `#controls` to 198px made it obvious. Moved to the left.
- `src/dev/panel.js` listed `g.rciPanel` in `allPanels()`, which is now undefined.
- `#toolOutput` read the literal word "Tools" under a panel header reading
  "Tools". It names the tool in hand now, with `refreshToolOutput()` shared by
  the click handler, the hotkeys and `Game`'s tool-failed path.

**Verified:** 1366x768, 375x812 (phone portrait) and 932x430 (phone landscape),
with both drawers opened at each. Freeform and the Zombies scenario. `npx jest`
is 160/162, the same two pre-existing failures `TODO.md` documents. `npx webpack
--mode production` builds clean. The zombie change measured in-game: a wave of 12
spawns 18-28 tiles out and all 12 reach the centre with ~500 frames of life left,
laying dread across 27 blocks at the 1000 cap. **Not verified: a real phone** --
the emulator is not a touchscreen.

Landscape turned up one more of the same kind of leftover: `@media (max-height:
742px)` carried `header { height: 15px }`, which was fine for a banner holding a
title and clipped every readout in the HUD to a sliver. Removed; the bar sizes to
its contents at any height and `#wrapper` follows it.

---

Planned 2026-09-19, from a read of `index.html`, `css/style.css`, `panel.js`,
`inputStatus.js`, `rci.js` and `customBuildings.js`, then walked in the browser
at 1366x768.

The owner's opener: the build menu has no groups "like later games". That turned
out to be the visible corner of a wider thing — most of this game's chrome is
still the fork's, untouched since micropolisJS, and the parts b0r3d-city added
were appended to it rather than designed into it.

## Decided

**The palette stays.** The owner's call, asked directly. `darkslategray` chrome,
`mintcream` panels, `dirtbg.png`, the Chunk slab-serif for headings — all of it
keeps its current values. The site's dark-neon look (which z0mbie crystal, the
RPG and overscan all share) was the alternative and was turned down.

The reason it is the right call, recorded so a later session doesn't relitigate
it: `images/tiles.png` is the fork's art and is not changing in this version. It
is drawn bright — lime greens, salmon dirt, mid-blue water. Dark chrome around a
bright cartoon map is not automatically an improvement on light chrome that
agrees with the map. A real re-skin wants a tile pass with it, and that is well
past a point release.

**Colour tokens are still worth taking**, at the same values. `style.css` has 82
uses of CSS named colours and exactly one custom property in 1,717 lines, so
there is nothing to change centrally today. Naming them changes no pixels and is
what makes a future re-skin one block instead of 82 edits. If the owner would
rather not, strike this line — nothing else here depends on it.

**Version is 0.89.6**, the owner's call. The save anti-cheat and leaderboard
trust work stays parked for ~0.9 and is not touched here.

## Context — what's there (v0.89.5)

Four sidebar panels, all `Panel` instances (floating, draggable, snapping, with
remembered positions): Town Info, Menu, the demand graph, and Tools. Twelve
modal windows on top of that. A 35px header, a 26px footer, and a floating
`#debug` box. On a phone the left three collapse into a drawer behind a
hamburger and Tools into a drawer of its own.

The layout system underneath is in good shape — `panel.js` is the newest code in
the project and `shrinkColumnToFit` already solves a real problem carefully.
What sits *in* the panels is the part that has never been designed.

## 1. The build menu

The thing that started this. `#buttons` holds **34 tool buttons in one 172px
column**, each with a different background colour, and on a 768px-tall viewport
the last six are below the fold with no sign they exist.

Two causes, both worth naming:

- 16 tools are hand-authored in `index.html`; the other 18 come from
  `renderCustomBuildingButtons()` in `game.js`, appended **in registry order** —
  which is the order they were added over the preceding fortnight. The list is
  not sorted by anything a player can perceive.
- `data-colour` exists for the placement outline (`mouseBox.js`). Using it as
  the button's background is what turns the panel into a paint chart.

**Groups.** Query and Bulldoze pin at the top, outside the groups — they are
verbs, not buildings, and you reach for them constantly. Then:

*(As built -- see the note at the top for why this differs from what was planned.)*

| Group | Members |
|---|---|
| Zones | Residential, Commercial, Industrial |
| Transport | Road, Rail |
| Power | Wire, Coal, Nuclear |
| Industry | Port, Airport, Data Centre |
| Services | Police, Fire, Hospital, School, University, Library, Recycling Centre |
| Leisure | Park, Stadium, Large Park, Arcade, Casino, Amusement Park, Megamart, Bar, Burger Baron |
| Landmarks | Museum, Rukus, Arch, Observatory, City Hall |

Collapsible, with the group's member count in the header, and which groups are
open remembered in localStorage (`b0r3dCityToolGroups`) next to the panel
positions.

Mechanically this is cheap. The click handler is already delegated
(`$('#buttons').on('click', '.toolButton', ...)`), so headers and wrappers
inside `#buttons` break nothing. A `group:` field on each `customBuildings.js`
entry plus a group table for the 16 engine tools is the whole data change.

**Icons.** Every one of the 34 has tile art in `images/tiles.png` and the
toolbar shows none of it. The sheet is already in the DOM as `#tiles`. A 16px
crop of each building's `centreTile` as the button's icon is the single biggest
"later games" tell available, and the tile IDs are already computed in
`customBuildings.js`. The engine tools need a small hand-written tile map.

**Neutral buttons.** With groups and icons, the per-button background goes away
and `data-colour` becomes a small swatch or a left border — still there, still
matching the placement outline, no longer the whole button.

**Affordability.** Nothing dims when you cannot afford it. At $20,000 starting
funds more than half this list is out of reach and looks identical to the rest.

**Tooltips.** The registry knows City Hall is land value +600 and Megamart is
commercial weight 1.5. None of it reaches the player, and there are 34 of these
now — a player has no way to learn what any of them do. A hover tooltip built
from the same registry entry costs almost nothing and is arguably the biggest
actual gap in the game, not just in the UI.

**Hotkeys.** `keyDownHandler` binds WASD, the arrows and Escape. That is all.
34 tools and not one keyboard shortcut. Letter keys per group, or 1-9 within the
open group — decide when building.

## 2. The HUD bar

The header is `darkslategray` plus a `repeating-linear-gradient(-45deg, ...)`
stripe and the Chunk serif, 35px tall, holding nothing but the words
"b0r3d-city". The footer is another 26px for a build hash and three links. That
is 61px of chrome doing almost nothing, in a layout whose own source has several
paragraphs about fighting for vertical space (`shrinkColumnToFit`, the
`SHORT_BREAKPOINT` work).

Replace it with a bar that carries: funds, date, population, city class and
score, the R/C/I demand bars, and the speed control. Which means Town Info and
the demand panel can go, and the left column drops from three panels to one.

**Mobile is the argument for this, not against it.** Today the demand graph
lives in the left drawer behind the hamburger — the one reading a player glances
at constantly is the one they cannot see without opening a drawer. Three 9px
bars in a status bar are visible the whole time. The header already wraps to
`height: auto` under 768px (see the width-only cosmetics block in `style.css`),
so the bar wraps to a second row rather than needing its own mobile design.

The keep/drop call on Town Info is not quite free: `scenarioInfo` lives inside
it, and `scenarioController.js` unhides and updates that block. Scenario
objective and deadline are three lines and do not belong in a status bar. Either
Town Info survives as a scenario-only panel, or the objective moves into the
notification area. Decide when building.

## 3. The demand graph

`rci.js` draws three bars on a canvas with everything expressed in "rectangle
units" (`_padding = 3`, `_buckets = 10`) and an integer `_rectSize` chosen to
fit the panel. That integer floor is why it looks chunky and why resizing snaps
instead of scaling. It has no numbers, no scale, no zero line, and its bar
colours (`rgb(0,255,0)`, `rgb(0,0,139)`, `rgb(255,255,0)`) do not match the zone
buttons they represent.

Rebuilt for the HUD it can be far simpler: three bars above and below a baseline,
coloured to match the zone tools, with the value on hover. The `VALVES_UPDATED`
subscription and the +/-2000 vs +/-1500 scaling fix stay exactly as they are —
that part is correct and was hard-won.

## 4. Middle-mouse pan

There is no mouse panning at all. `mouseDownHandler` and `canvasClickHandler`
both bail on `e.which !== 1`; the only camera input is WASD/arrows and the touch
handlers.

Touch already has a proper implementation — `_panAccumX/_panAccumY` accumulating
pixels and committing whole tile steps once they pass `scaledTileWidth`. Middle
drag reuses that accumulator directly. Needs `preventDefault` on the aux events
to suppress the browser's middle-click autoscroll, and it must work **with a
tool selected** — that is the entire point of using a button the tools do not
want.

## 5. Duplicate speed, and the Settings window

Settings has `#speedSelect`, a radio of Slow/Medium/Fast. The Menu panel has
`#speedControls`, four buttons: Pause/Slow/Med/Fast. Different code paths that
do not sync — Settings goes through `SettingsWindow.SPEED` to `game.js`'s
`handleSettingsWindowClosure`, the buttons emit `SPEED_SET_REQUESTED` to
`handleSpeedSet` — and the Settings one cannot pause.

Cut the Settings radio. The in-game row is strictly better. One thing follows
it: `defaultSpeed` is what Pause restores to, and Settings is what sets it
today, so it needs to track the last non-paused speed instead.

## 6. The cheat menu and the `#debug` box

`src/dev/panel.js` is a **strict superset** of the old Cheat Menu. Its cheats
section has free build, funds (+$10k/+$100k/+$1M/$0), hold-funds and valve
pinning; its disasters section has all seven of the old ones plus earthquake,
six-fires, sized zombie hordes and cleanup tools. As a developer tool the Cheat
Menu is fully redundant.

Its only remaining job is being a sandbox a normal player can find, since
`?dev=1` is invisible. That is a product call, and it is **open**:

1. Cut it. `?dev=1` is a URL you can hand to anyone who wants to mess about.
2. Keep it, rename it "Sandbox". `cheatsUsed` already fences the leaderboard, so
   it costs nothing, and "cheat menu" undersells it as a toy.
3. Keep it, fix only the packaging.

The packaging needs fixing whichever way that goes. `#debug` is a floating box
hard-positioned at `top: 580px`, outside the Panel system entirely, that holds
the FPS counter *and* the Cheats button. Those two have nothing to do with each
other, and the dev panel already has its own performance section.

## 7. The sweep

Small, individually trivial, collectively most of why the game reads as a fork:

- `<noscript>` still says "Hey, thanks for your interest in micropolisJS!" —
  player-facing, and the only place that name still appears outside the licence
  files.
- Zoom In and Zoom Out are list items in the Menu panel. They are map controls
  and belong on the map.
- The twelve modal windows have individually-coloured headers (`#congratsHeader`
  is limegreen, `#debugHeader` has its own) with no shared system.
- `#tooSmall` — "Uh-oh! I won't be able to fit in all the controls, buttons and
  gizmos!" is fork voice, not b0r3d voice.
- The Menu panel is eleven flat buttons with the speed row and the zoom buttons
  in the middle of them. Grouping applies here too, smaller: city (Budget,
  Ordinances, Neighbours, Evaluation), views (City Maps, Graphs, Take Picture),
  game (Save, High Scores, Settings, Main Menu).

## 8. The zombies

Not UI. Riding along because the owner asked, 2026-09-19: "the zombies we added
dont really seem to do anything?"

They are wired correctly end to end — sprite writes dread into
`blockMaps.zombieMap`, `pollutionTerrainLandValueScan` subtracts it from land
value, `residential.js` decays zones on land value, `crimeScan` computes crime
from it. The chain is real. Three things compound to make it invisible, and the
first is a bug, not tuning:

**They die before they arrive.** They spawn on a random *map* edge and move one
world-pixel per animation frame — 1/16 of a tile. `ZOMBIE_LIFETIME` is 900
frames, so a zombie's entire life covers **56 tiles at best**. On a 120x100 map,
edge to centre is 50-60. A left or right edge spawn mathematically cannot reach
town; a top or bottom one arrives with a second or two left. Then
`POLICE_ATTRITION` multiplies the burn rate by up to 7x — and police coverage
exists *only around the built-up city*, so the ones that do arrive die on
arrival. The intended strategy ("the answer to the horde is police stations")
works so well it deletes the disaster.

**The dread lands where it cannot be read.** `pollutionTerrainLandValueScan`
only writes land value to developed tiles; undeveloped ones are set to 0
regardless. The 40-per-move dread laid across the countryside on the long walk
in goes into blocks with no land value to lose.

**A direct hit is under the noise floor.** `zombieMap` has chunk size 8 — one
cell is a 64-tile block. Cap 600, divisor 20, so a fully saturated block loses
**30 off a 1-250 scale**, and only while they are standing in it. The scan that
reads it runs every 7 sim cycles at medium speed, about 5.6 seconds of wall
time, and `_clearCensus` decays the dread 8% a cycle. A zombie that lives two
seconds in town can miss the scan entirely.

Cheapest real fix, in order: spawn at the edge of the **developed area** rather
than the map, so the whole lifetime is spent on land with a value to lose; drop
`zombieMap`'s chunk to 2 to match `landValueMap`, so it is a street they ruin
rather than a 64-tile block; make police attrition ramp rather than bite on
contact.

## Order

The HUD bar (2) before the demand graph (3), which is part of it. The build menu
(1) is independent and is the headline, so it can go first or in parallel. 4, 5,
6 and 7 are independent of everything. 8 is its own thing entirely and could be
cut to a later version without touching the rest.

## Open, for the owner

All four of the questions this section held were decided at build -- see the note
at the top of the file. What is genuinely still open:

- **The colour tokens**, deferred rather than declined. They belong with the tile
  pass, whenever that happens.
- **Whether Transport-as-two-items reads right in play.** It is deliberate (the
  two most-used tools, at the top, in their own tiny group) but it is the one
  grouping decision that looks odd sitting still.

## Exit

Walked at 1366x768, 375x812 and 932x430 -- the last being the case the
`SHORT_BREAKPOINT` work exists for -- freeform and in the Zombies scenario, with
both mobile drawers opened at each. `npx jest` and a production build both clean
of regressions.

**Owed:** a run on a real phone. An emulated viewport is not a touchscreen, and
the tool drawer is the part of this that a thumb has to actually use.
