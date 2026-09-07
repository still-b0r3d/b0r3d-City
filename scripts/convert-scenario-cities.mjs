// Converter: classic Micropolis .cty binary saves -> b0r3d-city's flat
// row-major tile-value JSON format (see scenarioCities/*.json). Re-run
// this if the source .cty files ever need to be re-pulled or more added.
// Usage: node scripts/convert-scenario-cities.mjs [path to a micropoliscore
// checkout's content/micropolis/cities directory]
//
// .cty layout (see micropoliscore/packages/micropolis-engine/src/fileio.cpp):
//   6 history segments x 480 bytes + 1 misc-history segment of 240 bytes
//   = 3120 bytes, then WORLD_W*WORLD_H (120*100=12000) big-endian uint16
//   tile values, addressed column-major: index = x*WORLD_H + y.
//
// b0r3d-city's GameMap (src/gameMap.js) stores tiles row-major:
//   index = x + y*width, and each raw tile value is the SAME 16-bit
//   layout (low 10 bits = tile id, high 6 bits = ANIMBIT/BULLBIT/etc,
//   see src/tileFlags.ts) as the original engine -- both are direct
//   descendants of the same C source, so no tile-id remapping is needed,
//   just the column-major -> row-major transpose.

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const WORLD_W = 120;
const WORLD_H = 100;
const HISTORY_LENGTH = 480;
const MISC_HISTORY_LENGTH = 240;
const HISTORY_SIZE = 6 * HISTORY_LENGTH + MISC_HISTORY_LENGTH; // 3120
const MAP_SIZE_SHORTS = WORLD_W * WORLD_H; // 12000
const EXPECTED_SIZE = HISTORY_SIZE + MAP_SIZE_SHORTS * 2; // 27120

const SRC_DIR = process.argv[2] || join(__dirname, '..', '..', 'micropoliscore', 'content', 'micropolis', 'cities');
const OUT_DIR = join(__dirname, '..', 'scenarioCities');

const CITIES = [
  { file: 'scenario_dullsville.cty', slug: 'dullsville', name: 'Dullsville' },
  { file: 'scenario_san_francisco.cty', slug: 'san-francisco', name: 'San Francisco' },
  { file: 'scenario_hamburg.cty', slug: 'hamburg', name: 'Hamburg' },
  { file: 'scenario_bern.cty', slug: 'bern', name: 'Bern' },
  { file: 'scenario_tokyo.cty', slug: 'tokyo', name: 'Tokyo' },
  { file: 'scenario_detroit.cty', slug: 'detroit', name: 'Detroit' },
  { file: 'scenario_boston.cty', slug: 'boston', name: 'Boston' },
  { file: 'scenario_rio_de_janeiro.cty', slug: 'rio-de-janeiro', name: 'Rio de Janeiro' },
];

mkdirSync(OUT_DIR, { recursive: true });

for (const city of CITIES) {
  const path = join(SRC_DIR, city.file);
  const buf = readFileSync(path);

  if (buf.length !== EXPECTED_SIZE) {
    throw new Error(`${city.file}: expected ${EXPECTED_SIZE} bytes, got ${buf.length}`);
  }

  const map = new Array(MAP_SIZE_SHORTS);

  for (let x = 0; x < WORLD_W; x++) {
    for (let y = 0; y < WORLD_H; y++) {
      const srcIndex = x * WORLD_H + y; // column-major, as written by fileio.cpp
      const byteOffset = HISTORY_SIZE + srcIndex * 2;
      const rawValue = buf.readUInt16BE(byteOffset);

      const dstIndex = x + y * WORLD_W; // row-major, as read by GameMap
      map[dstIndex] = rawValue;
    }
  }

  const out = {
    name: city.name,
    width: WORLD_W,
    height: WORLD_H,
    map,
  };

  const outPath = join(OUT_DIR, `${city.slug}.json`);
  writeFileSync(outPath, JSON.stringify(out));
  console.log(`${city.file} -> ${outPath} (${JSON.stringify(out).length} bytes)`);
}

console.log('Done.');
