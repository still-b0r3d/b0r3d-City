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
