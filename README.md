b0r3d-city
==========

A custom b0r3d.org build of [micropolisJS](https://github.com/graememcc/micropolisJS), Graeme McCutcheon's hand-written JavaScript/HTML5 port of *Micropolis*, a 2008 open-source city-building engine release.

**Live at:** https://b0r3d.org/b0r3d-city/

Renamed from "sim-b0r3d-city" (itself renamed from "micropolisJS") to put real distance between this project and a certain very-trademarked city-building game whose name we're not going to type here either — the kind of naming collision the bundled [LICENSE](LICENSE)'s additional terms exist specifically to warn against. Fittingly, that makes this a fork of a fork of a game that's never once, in almost twenty years, been allowed to go by its own retail name: its original publisher released it open-source under an alias for the exact same reason back in 2008, and here we are doing the identical dance. Some things just aren't allowed to have nice names.

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
