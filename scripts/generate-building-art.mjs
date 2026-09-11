/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 *
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details. Alternatively,
 * consult http://micropolisjs.graememcc.co.uk/LICENSE and
 * http://micropolisjs.graememcc.co.uk/COPYING
 *
 * The name/term "MICROPOLIS" is a registered trademark of Micropolis (https://www.micropolis.com) GmbH
 * (Micropolis Corporation, the "licensor") and is licensed here to the authors/publishers of the "Micropolis"
 * city simulation game and its source code (the project or "licensee(s)") as a courtesy of the owner.
 *
 */

// Draws the art for the custom buildings listed in BUILDING_ART below straight into
// images/tiles.png, at the tile offsets customBuildings.js computes for them.
//
// The rest of the sheet is hand-drawn; this script only exists because the buildings it
// knows about were added in one go, and it is far easier to review "an arch is two
// piers and a half-round opening" as code than as a diff of 2,304 pixels. It rewrites
// only the tiles it owns, so running it again is idempotent and cannot touch anything
// drawn by hand. It also grows the sheet by whole 16px rows if the buildings it draws
// need tiles past the end of the current image -- see customBuildings.js's tile budget
// note, which is the thing to keep honest when adding to this file.
//
//   node scripts/generate-building-art.mjs [--preview <path.png>]
//
// --preview additionally writes a magnified sheet of just these buildings, which is the
// only practical way to check the result without loading the game.

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

var ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
var TILES_PATH = path.join(ROOT, 'images', 'tiles.png');
var TILE_SIZE = 16;
var TILES_PER_ROW = 32;

// The first tile ID past the original engine's range, mirroring
// customBuildings.js's CUSTOM_BUILDING_BASE. Tile IDs are derived by walking the same
// list in the same order, rather than hard-coded here, so the two files can't drift.
var CUSTOM_BUILDING_BASE = 1024;

// Sizes of every registry entry that precedes the ones drawn below, in registry order.
// Only the sizes matter -- each building occupies size*size contiguous tiles -- so this
// is the minimum needed to land on the right offset without importing the registry
// itself (which is ESM in a source tree webpack owns, and drags in jQuery via its
// consumers).
var PRECEDING_SIZES = [3, 3, 4, 3, 4, 3, 4, 4, 3, 4, 4, 4, 3, 3];


// ---------------------------------------------------------------------------
// PNG: 8-bit RGBA, non-interlaced. That is what tiles.png already is, and all
// this needs to read and write.
// ---------------------------------------------------------------------------

var paeth = function(a, b, c) {
  var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
};


var decodePNG = function(buf) {
  var off = 8, width = 0, height = 0, idat = [];

  while (off < buf.length) {
    var len = buf.readUInt32BE(off);
    var type = buf.toString('ascii', off + 4, off + 8);

    if (type === 'IHDR') {
      width = buf.readUInt32BE(off + 8);
      height = buf.readUInt32BE(off + 12);
      if (buf[off + 16] !== 8 || buf[off + 17] !== 6 || buf[off + 20] !== 0)
        throw new Error('tiles.png is not 8-bit RGBA, non-interlaced');
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(off + 8, off + 8 + len));
    }

    off += 12 + len;
    if (type === 'IEND')
      break;
  }

  var raw = zlib.inflateSync(Buffer.concat(idat));
  var stride = width * 4;
  var data = Buffer.alloc(height * stride);

  for (var y = 0; y < height; y++) {
    var filter = raw[y * (stride + 1)];
    var line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);

    for (var x = 0; x < stride; x++) {
      var a = x >= 4 ? data[y * stride + x - 4] : 0;
      var b = y > 0 ? data[(y - 1) * stride + x] : 0;
      var c = (x >= 4 && y > 0) ? data[(y - 1) * stride + x - 4] : 0;
      var v = line[x];

      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);

      data[y * stride + x] = v & 0xff;
    }
  }

  return { width: width, height: height, data: data };
};


var CRC_TABLE = (function() {
  var table = [];
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++)
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();


var crc32 = function(buf) {
  var c = 0xffffffff;
  for (var i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};


var pngChunk = function(type, data) {
  var len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);

  var typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  var crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));

  return Buffer.concat([len, typed, crc]);
};


var encodePNG = function(image) {
  var stride = image.width * 4;
  var raw = Buffer.alloc(image.height * (stride + 1));

  for (var y = 0; y < image.height; y++) {
    raw[y * (stride + 1)] = 0;
    image.data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
};


// ---------------------------------------------------------------------------
// A canvas the size of one building, drawn in isolation and then sliced into
// tiles. Deterministic noise (see rnd) so re-running produces byte-identical
// output and an unchanged git diff.
// ---------------------------------------------------------------------------

var Canvas = function(size) {
  this.width = this.height = size;
  this.data = Buffer.alloc(size * size * 4);
  this._seed = 0x2f6e2b1;
};


// xorshift, so the "noise" in grass and concrete is the same on every run.
Canvas.prototype.rnd = function(n) {
  var x = this._seed;
  x ^= x << 13; x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5; x >>>= 0;
  this._seed = x;
  return x % n;
};


Canvas.prototype.set = function(x, y, colour) {
  if (x < 0 || y < 0 || x >= this.width || y >= this.height)
    return;

  var i = (y * this.width + x) * 4;
  this.data[i] = colour[0];
  this.data[i + 1] = colour[1];
  this.data[i + 2] = colour[2];
  this.data[i + 3] = colour.length > 3 ? colour[3] : 255;
};


// Jitters each channel by up to +/-spread, which is what makes the hand-drawn grass and
// concrete on the rest of the sheet read as texture rather than as flat fill.
Canvas.prototype.setNoisy = function(x, y, colour, spread) {
  if (!spread)
    return this.set(x, y, colour);

  var d = this.rnd(spread * 2 + 1) - spread;
  this.set(x, y, [
    Math.max(0, Math.min(255, colour[0] + d)),
    Math.max(0, Math.min(255, colour[1] + d)),
    Math.max(0, Math.min(255, colour[2] + d))
  ]);
};


Canvas.prototype.rect = function(x0, y0, w, h, colour, spread) {
  for (var y = y0; y < y0 + h; y++)
    for (var x = x0; x < x0 + w; x++)
      this.setNoisy(x, y, colour, spread);
};


Canvas.prototype.outline = function(x0, y0, w, h, colour) {
  for (var x = x0; x < x0 + w; x++) {
    this.set(x, y0, colour);
    this.set(x, y0 + h - 1, colour);
  }
  for (var y = y0; y < y0 + h; y++) {
    this.set(x0, y, colour);
    this.set(x0 + w - 1, y, colour);
  }
};


Canvas.prototype.hLine = function(x0, x1, y, colour) {
  for (var x = x0; x <= x1; x++)
    this.set(x, y, colour);
};


Canvas.prototype.vLine = function(x, y0, y1, colour) {
  for (var y = y0; y <= y1; y++)
    this.set(x, y, colour);
};


// Filled disc, clipped to the half/quadrant given by `keep` ('all', 'top').
Canvas.prototype.disc = function(cx, cy, r, colour, keep) {
  for (var y = cy - r; y <= cy + r; y++) {
    if (keep === 'top' && y > cy)
      continue;

    for (var x = cx - r; x <= cx + r; x++) {
      var dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r * r)
        this.set(x, y, colour);
    }
  }
};


// Isoceles triangle with a flat base, apex centred above it -- the pediment on the
// City Hall and the roof on the Recycling Centre.
Canvas.prototype.pediment = function(cx, apexY, baseY, halfWidth, colour) {
  var rows = baseY - apexY;
  for (var y = apexY; y <= baseY; y++) {
    var w = Math.round(halfWidth * (y - apexY) / rows);
    this.hLine(cx - w, cx + w, y, colour);
  }
};


// The 5x7 sign font the rest of the sheet already uses (I is 3 wide), read off the
// existing labels pixel by pixel. E and Y are new -- no existing sign needed them --
// and are drawn to match.
var FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..']
};

var SIGN_PLATE = [56, 56, 68];
var SIGN_BORDER = [140, 140, 152];
var SIGN_TEXT = [243, 243, 13];


var textWidth = function(text) {
  var w = 0;
  for (var i = 0; i < text.length; i++) {
    if (!FONT[text[i]])
      throw new Error('No glyph for "' + text[i] + '" -- add one to FONT');
    w += FONT[text[i]][0].length + (i > 0 ? 1 : 0);
  }
  return w;
};


// A label plate, centred horizontally, with its top edge at plateY. Two pixels of
// plate around the text on every side plus a 1px border, matching the existing signs.
Canvas.prototype.sign = function(text, plateY) {
  var tw = textWidth(text);
  var pw = tw + 6;
  var ph = 7 + 6;
  var px = Math.floor((this.width - pw) / 2);

  this.rect(px, plateY, pw, ph, SIGN_PLATE, 4);
  this.outline(px, plateY, pw, ph, SIGN_BORDER);

  var cursor = px + 3;
  var top = plateY + 3;

  for (var i = 0; i < text.length; i++) {
    var glyph = FONT[text[i]];
    for (var row = 0; row < glyph.length; row++)
      for (var col = 0; col < glyph[row].length; col++)
        if (glyph[row][col] === '#')
          this.set(cursor + col, top + row, SIGN_TEXT);

    cursor += glyph[0].length + 1;
  }
};


// ---------------------------------------------------------------------------
// The buildings
// ---------------------------------------------------------------------------

var GRASS = [60, 176, 41];
var GRASS_SHADOW = [44, 150, 30];
var CONCRETE = [123, 127, 135];
var CONCRETE_DARK = [88, 95, 102];
var OUTLINE = [42, 44, 50];


// Grass everywhere, plus a band of darker grass along the bottom: every hand-drawn
// building on the sheet sits on something, and an untouched green square reads as an
// unfinished tile rather than as a lawn.
var groundwork = function(c) {
  c.rect(0, 0, c.width, c.height, GRASS, 9);
};


var drawRecyclingCentre = function(c) {
  groundwork(c);

  // Yard. The plant is a working site, so it gets a concrete apron rather than lawn,
  // and the sign sits on the apron the way the Data Centre's does.
  c.rect(1, 29, 46, 19, CONCRETE_DARK, 8);

  // Shed, with a corrugated roof overhanging it on both sides, in the green every
  // recycling bin in the world is painted.
  c.rect(5, 13, 30, 19, [166, 170, 175], 4);
  c.outline(5, 13, 30, 19, OUTLINE);
  c.hLine(6, 33, 18, [140, 144, 150]);

  c.rect(2, 8, 36, 6, [46, 122, 62], 3);
  c.outline(2, 8, 36, 6, OUTLINE);
  for (var x = 4; x < 37; x += 3)
    c.vLine(x, 9, 12, [36, 98, 50]);

  // Roller door, half up, with the dark of the building interior behind it
  c.rect(8, 21, 11, 11, [40, 43, 48]);
  c.outline(8, 21, 11, 11, OUTLINE);
  c.rect(9, 22, 9, 3, [128, 132, 138]);
  c.hLine(9, 17, 24, [92, 96, 102]);

  // Sorting bins in the usual colour code -- three of them side by side is the one
  // detail that says "recycling" rather than "shed" at 48 pixels.
  var bins = [[21, [40, 120, 200]], [26, [206, 174, 44]], [31, [70, 160, 84]]];
  bins.forEach(function(bin) {
    c.rect(bin[0], 22, 4, 10, bin[1]);
    c.outline(bin[0], 22, 4, 10, OUTLINE);
    c.hLine(bin[0], bin[0] + 3, 22, [235, 235, 235]);
  });

  // A skip out on the apron, half-full
  c.rect(38, 23, 8, 9, [70, 150, 80]);
  c.outline(38, 23, 8, 9, OUTLINE);
  c.hLine(39, 44, 24, [120, 190, 130]);
  c.hLine(39, 44, 28, [52, 118, 62]);

  c.sign('RECY', 34);
};


var drawArch = function(c) {
  groundwork(c);

  // Paved plaza the arch stands on
  c.rect(3, 33, 42, 12, CONCRETE, 7);
  c.outline(3, 33, 42, 12, [96, 100, 108]);

  var STONE = [206, 198, 176];
  var STONE_SHADE = [174, 166, 146];

  // One solid slab of masonry, which the opening is then cut out of. Drawing it as
  // two piers plus a lintel instead leaves nowhere for the curve to sit: the haunches
  // of an arch are the part of the wall directly above the springing line, so if the
  // gap between the piers is the same width as the curve, the curve lands entirely
  // behind the stone and what's left reads as a doorway.
  c.rect(6, 4, 36, 34, STONE, 5);

  // Cornice: one lighter course along the top, one shaded underneath, which is the
  // whole of what makes a flat slab read as carved stone at this size.
  c.hLine(6, 41, 4, [226, 220, 202]);
  c.hLine(6, 41, 5, [226, 220, 202]);
  c.hLine(6, 41, 12, STONE_SHADE);

  // The opening: square-cut below the springing line, half-round above it. The apex
  // lands at y=17, five courses clear of the cornice, so there is visibly stone
  // carrying the arch rather than a lintel resting on two legs.
  var cx = 24, springY = 24, r = 7;
  for (var y = 15; y < 38; y++) {
    for (var x = cx - r; x <= cx + r; x++) {
      var dx = x - cx, dy = y - springY;
      if (y < springY && dx * dx + dy * dy > r * r)
        continue;

      // Grass shows through the opening, since the arch is a way through rather
      // than a building -- the same grass as the surround, darkened as if in shade.
      c.setNoisy(x, y, y >= 33 ? [96, 100, 108] : GRASS_SHADOW, 5);
    }
  }

  // Shading down the inside faces of the opening, and the two impost blocks the arch
  // springs from
  c.vLine(cx - r, springY, 37, STONE_SHADE);
  c.vLine(cx + r, springY, 37, STONE_SHADE);
  c.hLine(cx - r - 3, cx - r, springY - 1, STONE_SHADE);
  c.hLine(cx + r, cx + r + 3, springY - 1, STONE_SHADE);

  c.outline(6, 4, 36, 34, OUTLINE);

  c.sign('ARCH', 34);
};


var drawObservatory = function(c) {
  groundwork(c);

  // The hill it sits on: three progressively narrower courses, so the dome reads as
  // being up somewhere rather than parked on a lawn.
  c.rect(2, 36, 44, 12, [92, 140, 62], 6);
  c.rect(6, 32, 36, 6, [104, 150, 70], 5);

  // Drum
  c.rect(12, 22, 24, 12, [198, 200, 206], 4);
  c.outline(12, 22, 24, 12, OUTLINE);
  for (var x = 15; x < 34; x += 6) {
    c.rect(x, 25, 3, 5, [58, 92, 130]);
    c.set(x, 25, [120, 160, 200]);
  }

  // Dome
  c.disc(24, 22, 12, [222, 224, 230], 'top');
  c.disc(24, 22, 12, OUTLINE, 'top');
  c.disc(24, 22, 11, [222, 224, 230], 'top');
  c.disc(24, 23, 9, [244, 246, 250], 'top');

  // Shutter slit, and the telescope looking out of it
  c.rect(22, 11, 5, 12, [46, 50, 58]);
  c.outline(22, 11, 5, 12, [150, 152, 158]);
  for (var t = 0; t < 6; t++)
    c.set(24 + Math.floor(t / 2), 12 - t, [118, 122, 130]);
  c.set(27, 7, [86, 90, 98]);
  c.set(27, 6, [86, 90, 98]);

  c.sign('OBS', 36);
};


var drawCityHall = function(c) {
  groundwork(c);

  var STONE = [214, 206, 186];
  var STONE_SHADE = [178, 170, 152];
  var ROOF = [96, 104, 118];

  // Forecourt and steps
  c.rect(4, 50, 56, 12, CONCRETE, 7);
  for (var s = 0; s < 3; s++)
    c.hLine(10 + s * 2, 53 - s * 2, 50 + s, [176, 180, 188]);

  // Main block
  c.rect(6, 26, 52, 26, STONE, 4);
  c.outline(6, 26, 52, 26, OUTLINE);

  // Portico columns. Six of them, 3px wide, with the shadowed recess behind.
  c.rect(12, 30, 40, 20, [150, 143, 126], 3);
  for (var i = 0; i < 6; i++) {
    var cxx = 13 + i * 7;
    c.rect(cxx, 30, 3, 20, STONE);
    c.vLine(cxx + 2, 30, 49, STONE_SHADE);
  }
  c.hLine(12, 51, 29, STONE_SHADE);

  // Pediment
  c.pediment(32, 16, 28, 28, STONE);
  c.pediment(32, 18, 27, 25, STONE_SHADE);
  c.pediment(32, 19, 26, 23, STONE);

  // Clock tower, because a hall with no clock is just a bank
  c.rect(27, 4, 11, 14, STONE, 3);
  c.outline(27, 4, 11, 14, OUTLINE);
  c.disc(32, 10, 4, [246, 242, 228]);
  c.disc(32, 10, 4, OUTLINE);
  c.disc(32, 10, 3, [246, 242, 228]);
  c.vLine(32, 8, 10, [40, 42, 48]);
  c.hLine(32, 34, 10, [40, 42, 48]);
  c.rect(29, 1, 7, 4, ROOF);
  c.pediment(32, -2, 2, 6, ROOF);

  // Doors, dead centre under the pediment
  c.rect(29, 38, 7, 12, [86, 62, 40]);
  c.outline(29, 38, 7, 12, OUTLINE);
  c.vLine(32, 39, 49, [56, 40, 26]);

  c.sign('HALL', 50);
};


// Registry order matters: tile IDs are handed out by walking this list after
// PRECEDING_SIZES, exactly as customBuildings.js does. Keep the two in step.
var BUILDING_ART = [
  { id: 'recyclingCentre', size: 3, draw: drawRecyclingCentre },
  { id: 'arch', size: 3, draw: drawArch },
  { id: 'observatory', size: 3, draw: drawObservatory },
  { id: 'cityHall', size: 4, draw: drawCityHall }
];


// ---------------------------------------------------------------------------
// Slicing and writing
// ---------------------------------------------------------------------------

var tileOrigin = function(tileID) {
  return {
    x: (tileID % TILES_PER_ROW) * TILE_SIZE,
    y: Math.floor(tileID / TILES_PER_ROW) * TILE_SIZE
  };
};


var growSheet = function(sheet, tilesNeeded) {
  var rowsNeeded = Math.ceil(tilesNeeded / TILES_PER_ROW);
  var height = rowsNeeded * TILE_SIZE;
  if (height <= sheet.height)
    return sheet;

  var grown = {
    width: sheet.width,
    height: height,
    data: Buffer.alloc(sheet.width * height * 4)
  };
  sheet.data.copy(grown.data, 0);
  console.log('Grew tiles.png from ' + sheet.height + 'px to ' + height + 'px (' +
              ((height - sheet.height) / TILE_SIZE) + ' new row(s))');
  return grown;
};


// Copies one building's canvas into the sheet, tile by tile in the order BuildingTool
// lays them down (left to right, top to bottom from baseTile).
var blit = function(sheet, canvas, baseTile, size) {
  for (var ty = 0; ty < size; ty++) {
    for (var tx = 0; tx < size; tx++) {
      var origin = tileOrigin(baseTile + ty * size + tx);

      for (var py = 0; py < TILE_SIZE; py++) {
        for (var px = 0; px < TILE_SIZE; px++) {
          var src = ((ty * TILE_SIZE + py) * canvas.width + (tx * TILE_SIZE + px)) * 4;
          var dst = ((origin.y + py) * sheet.width + (origin.x + px)) * 4;
          canvas.data.copy(sheet.data, dst, src, src + 4);
        }
      }
    }
  }
};


var writePreview = function(placed, outPath) {
  var SCALE = 6;
  var gap = 2;
  var width = 0, height = 0;

  placed.forEach(function(p) {
    width += p.canvas.width + gap;
    height = Math.max(height, p.canvas.height);
  });

  var preview = {
    width: width * SCALE,
    height: height * SCALE,
    data: Buffer.alloc(width * SCALE * height * SCALE * 4)
  };

  var ox = 0;
  placed.forEach(function(p) {
    for (var y = 0; y < p.canvas.height; y++) {
      for (var x = 0; x < p.canvas.width; x++) {
        var src = (y * p.canvas.width + x) * 4;
        for (var a = 0; a < SCALE; a++)
          for (var b = 0; b < SCALE; b++) {
            var dst = (((y * SCALE + a) * preview.width) + (ox + x) * SCALE + b) * 4;
            p.canvas.data.copy(preview.data, dst, src, src + 4);
          }
      }
    }
    ox += p.canvas.width + gap;
  });

  fs.writeFileSync(outPath, encodePNG(preview));
  console.log('Preview written to ' + outPath);
};


var main = function() {
  var sheet = decodePNG(fs.readFileSync(TILES_PATH));

  var nextTile = CUSTOM_BUILDING_BASE;
  PRECEDING_SIZES.forEach(function(size) { nextTile += size * size; });

  var placed = [];
  BUILDING_ART.forEach(function(building) {
    placed.push({ building: building, baseTile: nextTile, canvas: null });
    nextTile += building.size * building.size;
  });

  sheet = growSheet(sheet, nextTile);

  placed.forEach(function(p) {
    var canvas = new Canvas(p.building.size * TILE_SIZE);
    p.building.draw(canvas);
    p.canvas = canvas;
    blit(sheet, canvas, p.baseTile, p.building.size);
    console.log(p.building.id + ': tiles ' + p.baseTile + '-' +
                (p.baseTile + p.building.size * p.building.size - 1));
  });

  fs.writeFileSync(TILES_PATH, encodePNG(sheet));
  console.log('Wrote ' + TILES_PATH + ' (' + sheet.width + 'x' + sheet.height + ', ' +
              (sheet.width / TILE_SIZE) * (sheet.height / TILE_SIZE) + ' tiles, ' +
              ((sheet.width / TILE_SIZE) * (sheet.height / TILE_SIZE) - nextTile) + ' spare)');

  var previewIndex = process.argv.indexOf('--preview');
  if (previewIndex !== -1 && process.argv[previewIndex + 1])
    writePreview(placed, process.argv[previewIndex + 1]);
};


main();
