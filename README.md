b0r3d-city
==========

A custom b0r3d.org build of [micropolisJS](https://github.com/graememcc/micropolisJS), Graeme McCutcheon's hand-written JavaScript/HTML5 port of *Micropolis*, a 2008 open-source city-building engine release.

**Live at:** https://b0r3d.org/b0r3d-city/

**Version:** 0.89, plus everything under "What's New Since v0.89" below — see [Changelog](#changelog).

The code is released under the GPLv3 with some additional terms — see [LICENSE](LICENSE) and [COPYING](COPYING).

## Downloads

The web version at the link above is always current. For a desktop build, grab one from [this repo's Releases](https://github.com/still-b0r3d/b0r3d-City/releases):

- **`b0r3d-city.exe`** — the full game, offline. Bundles a snapshot of this version, so it works with no internet connection, but won't pick up anything past v0.89 on its own.
- **`b0r3d-city-online.exe`** — a thin launcher that just opens the live site above in its own window. Needs a connection, but always shows whatever's actually live.

Both are unsigned portable Windows executables — no install required, just run one. Windows SmartScreen may warn on first run.

## Changelog

Everything this fork adds on top of the original micropolisJS engine, newest first. See also the in-game [About page](https://b0r3d.org/b0r3d-city/about.html), which carries the same changelog plus a Known Issues section for players.

### What's New Since v0.89

- **City Maps &mdash; the window this port never had.** A whole-city view with eleven selectable overlays: population density, land value, crime, pollution, traffic, rate of growth, police and fire coverage, the land-value bonus from civic buildings, and the power grid. The data was never the missing part &mdash; the simulation builds and refreshes fourteen block maps every tick, because zone growth and decay read them and it cannot run without them, and nothing had ever rendered one. Until now the only way to see crime or land value was the Query tool, one tile at a time, which is exactly what the original micropolisJS About page told players to do instead. It doubles as navigation: click anywhere to jump the main view there, and a box tracks where you're currently looking. Resizable from its bottom-right corner, like the Demand and Tools panels.
- **Nine more civic buildings:** Arcade, Museum, University, Data Centre, Rukus, Amusement Park, Megamart, Bar and Burger Baron. The Bar, Burger Baron and Arcade are the cheap, small routes to commercial demand; the Amusement Park and Megamart are the expensive, high-pull ones. The University is the School's heavyweight counterpart &mdash; one is worth six of them, in a fraction of the space. The Museum raises nearby land value harder than anything else you can build, Hospital included, and the Data Centre is the first building in the game that pushes *industrial* demand; nothing did before. Rukus is [the site's cat](https://b0r3d.org/rukus.html), as a civic monument.
- **Startup is roughly eight times faster** &mdash; first load went from about 13 seconds to under two. The game shipped two tile sheets and only ever rendered from one; the second was downloaded, decoded and sliced into an `Image` per tile on every launch, then never painted, because the seasonal swap that would have used it has been commented out for as long as this fork has existed. Removing it also drops 130KB of PNG and takes the bundle from 607KB to 451KB.
- **The tile sheet grew from 576 to 608 pixels** to fit the new art &mdash; 1,216 tiles, of which 17 are still free. Worth knowing before adding more: every extra row costs startup time, since `TileSet` turns each tile into its own `Image` via `canvas.toDataURL`.
- **Civic demand buildings now share one ceiling per demand type,** rather than each kind of building adding a ceiling of its own. Adding more kinds otherwise re-breaks the economy the same way stacking Schools once did, since the growth ratio they feed is clamped a few lines later. Each building carries a weight saying how much of a School or Casino it counts for, so a University can be worth six Schools without needing a second ceiling.
- **Main Menu button:** the Menu panel has a way back to the splash screen now, ruled off from the rest of the list since it's the only entry there that throws the city away. It confirms first and pauses the city while it asks.
- **Landscape phones fixed:** a phone turned sideways used to get the full desktop layout squeezed into a screen not tall enough for it &mdash; panels overlapping, Zoom Out buried and unclickable. "Compact" now means small in either dimension, not just narrow, so it drops into the scrollable drawer layout instead.
- **Large Park:** a 4x4, $2,000 counterpart to the small Park tool. Where Park just scatters some trees, Large Park is the deliberate, expensive version &mdash; it raises land value in the blocks around it, same as the Hospital and Library.
- **Twitter widget removed:** the old share-to-Twitter button and everything it pulled in from platform.twitter.com is gone.
- **Left-side panels no longer overlap:** on shorter windows, the Town Info/Menu/Demand column now shrinks the resizable Demand graph to make room instead of stacking panels on top of each other and burying buttons underneath.
- **Schools and Casinos rebalanced:** buying enough of them used to pin residential/commercial demand permanently at maximum, effectively turning off the economy. The boost each one gives now tapers off the more you build.
- **Scenarios now survive a save:** saving mid-scenario used to silently throw the scenario away. Scenario saves now reload exactly as you left them, disasters, deadlines and all.
- **Scenario goal shown while you play:** Town Info now shows the current scenario, your score against the target, and how many years are left, the whole time you're playing &mdash; not just once, on the splash screen.
- **Bug-fix sweep:** Classic Cities and Scenarios crashing on load is fixed, along with a batch of smaller ones &mdash; stranded off-screen panels, unclickable mobile drawer toggles, W/A/S/D and the arrow keys not working while typing a save name or high-score initials, every pre-built city wrongly congratulating you for "reaching" the size it already started at, Query misreporting custom building names, one Escape press closing every open window instead of just the top one, a stuck Pause button label, and a bad tile that could freeze the whole map's rendering.

### Version 0.89 &mdash; First Release

- A donation-free, b0r3d.org-branded build (custom title/header/welcome text, its own build-ID scheme)
- A real windowing UI: dialogs are draggable, stackable windows that snap to each other's edges, instead of one fixed modal at a time &mdash; Budget's still the exception that pauses the sim while open
- Full Scenario mode: 9 scenarios (the 8 classic Micropolis cities plus an original Zombies scenario), each with an objective, a deadline, and &mdash; for most of them &mdash; a scripted disaster already underway when you arrive
- Classic Cities: the same 8 historical maps as freeform starting points, no objective or deadline attached
- Four new placeable civic buildings &mdash; Hospital, School, Casino, Library &mdash; each with a real gameplay effect (land-value or demand) rather than just decoration
- A cheat menu (add funds, free build, one-click disasters), with a `window.b0r3dCheats` console API for testing
- Named, multi-slot saves (capped at 3, with overwrite/delete confirmation), replacing the original single-slot silent-overwrite save
- A shared global leaderboard, tied into b0r3d.org's other arcade games' backend, with cheat-tainted cities blocked from submitting a score
- Map zoom (0.5x&ndash;3x)
- Touch support: one-finger pan, two-finger pan, tap-to-place (drag-to-paint for road/rail/wire), and a toggleable drawer layout for phone-width screens
- A pile of long-standing upstream engine bugs fixed along the way &mdash; traffic simulation and earthquakes had never actually worked, and a bad sprite draw could silently freeze the whole game

## Development

```
npm install
npm run dev     # webpack-dev-server, http://localhost:8080
npm run build   # production build to dist/
```

## Credit

Based on [micropolisJS](https://github.com/graememcc/micropolisJS) by Graeme McCutcheon, itself a port of the open-source *Micropolis*.
