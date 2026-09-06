b0r3d-city
==========

A custom b0r3d.org build of [micropolisJS](https://github.com/graememcc/micropolisJS), Graeme McCutcheon's hand-written JavaScript/HTML5 port of *Micropolis* (the open-source release of the original 1989 SimCity engine).

**Live at:** https://b0r3d.org/b0r3d-city/

Renamed from "sim-b0r3d-city" (itself renamed from "micropolisJS") to drop the "Sim...City" pattern the bundled [LICENSE](LICENSE)'s additional terms warn against — the SimCity trademark strikes again. Which makes this a fork of a fork of a game that's never once, in three-plus decades, been allowed to go by its own retail name: Maxis/EA open-sourced 1989's SimCity under the alias "Micropolis" specifically to sidestep this exact trademark, and here we are doing the identical dance for the identical reason. Some things just aren't allowed to have nice names.

The code is released under the GPLv3 with some additional terms — see [LICENSE](LICENSE) and [COPYING](COPYING).

## What's different from upstream

On top of the original micropolisJS engine, this fork adds:

- A donation-free, b0r3d.org-branded build (custom title/header/welcome text, its own build-ID scheme)
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
