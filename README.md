b0r3d-city
==========

A custom b0r3d.org build of [micropolisJS](https://github.com/graememcc/micropolisJS), Graeme McCutcheon's hand-written JavaScript/HTML5 port of *Micropolis*, a 2008 open-source city-building engine release.

**Live at:** https://b0r3d.org/b0r3d-city/

**Windows desktop build:** [still-b0r3d/b0r3d-City-Desktop](https://github.com/still-b0r3d/b0r3d-City-Desktop) — a portable Electron wrapper around this game's build output, kept in its own repo rather than here so this repo doesn't carry the wrapper's ~100MB binary.

The code is released under the GPLv3 with some additional terms — see [LICENSE](LICENSE) and [COPYING](COPYING).

## What's different from upstream

On top of the original micropolisJS engine, this fork adds:

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
