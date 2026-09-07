b0r3d-city
==========

A custom b0r3d.org build of [micropolisJS](https://github.com/graememcc/micropolisJS), Graeme McCutcheon's hand-written JavaScript/HTML5 port of *Micropolis*, a 2008 open-source city-building engine release.

**Live at:** https://b0r3d.org/b0r3d-city/

**Windows desktop build:** [still-b0r3d/b0r3d-City-Desktop](https://github.com/still-b0r3d/b0r3d-City-Desktop) — a portable Electron wrapper around this game's build output, kept in its own repo rather than here so this repo doesn't carry the wrapper's ~100MB binary.

Renamed from "sim-b0r3d-city" (itself renamed from "micropolisJS") to put real distance between this project and a certain very-trademarked city-building game whose name we're not going to type here either — the kind of naming collision the bundled [LICENSE](LICENSE)'s additional terms exist specifically to warn against. Fittingly, that makes this a fork of a fork of a game that's never once, in almost twenty years, been allowed to go by its own retail name: its original publisher released it open-source under an alias for the exact same reason back in 2008, and here we are doing the identical dance. Some things just aren't allowed to have nice names.

The code is released under the GPLv3 with some additional terms — see [LICENSE](LICENSE) and [COPYING](COPYING).

## What's different from upstream

On top of the original micropolisJS engine, this fork adds:

- A donation-free, b0r3d.org-branded build (custom title/header/welcome text, its own build-ID scheme)
- A real windowing UI: every dialog (Budget, Evaluation, Settings, etc) is a draggable, independently-positioned window instead of one fixed, centred modal at a time, several can be open together, and dragging one near another snaps it into alignment along the shared edge. Budget is the sole exception that still pauses the sim/dims the screen &mdash; it's the one dialog whose numbers are a snapshot you're meant to act on before time moves again; everything else runs against a live, still-ticking city
- Four new placeable civic buildings &mdash; Hospital, School, Casino, Library &mdash; each with a real gameplay effect (land-value or demand) rather than just decoration
- A cheat menu (add funds, free build, one-click disasters), with a `window.b0r3dCheats` console API for testing
- Named, multi-slot saves (capped at 3, with overwrite/delete confirmation), replacing the original single-slot silent-overwrite save
- A shared global leaderboard, tied into b0r3d.org's other arcade games' backend
- Map zoom (0.5x&ndash;3x)
- Touch support: one-finger pan, tap-to-place (drag-to-paint for road/rail/wire), and a toggleable drawer layout for phone-width screens

## Development

```
npm install
npm run dev     # webpack-dev-server, http://localhost:8080
npm run build   # production build to dist/
```

## Credit

Based on [micropolisJS](https://github.com/graememcc/micropolisJS) by Graeme McCutcheon, itself a port of the open-source *Micropolis*.
