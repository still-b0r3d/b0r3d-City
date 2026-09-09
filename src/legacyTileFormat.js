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

// The classic packed tile format: one integer per cell holding a tile value in the low
// bits and the six status flags (ANIMBIT/BULLBIT/etc) immediately above them. Every
// Micropolis descendant used the same 16-bit layout -- 10 bits of value (0-1023), flags
// at bits 10-15 -- until b0r3d-city widened it on 2026-09-08, moving the flags up to
// bits 13-18 to raise the tile-value ceiling to 8192 (see tileFlags.ts's BIT_START for
// why that ceiling had to move).
//
// Anything carrying raw packed values written before that change therefore has to be
// reflowed to the new layout on the way in, or it decodes wrong: flag bits land on what
// are now tile-value bits and vice versa, silently, without ever failing a range check.
// TWO such sources exist, which is why this lives in its own module rather than inside
// either one of them:
//
//   - saves      (storage.js, the v3 -> v4 transition)
//   - the classic scenario cities (scenarioCities/*.json, converted straight out of the
//     original .cty binaries by scripts/convert-scenario-cities.mjs, which preserves
//     their raw values as-is -- so those files are *permanently* in the old layout,
//     not merely old)
//
// The constants below are deliberately frozen literals rather than imports from
// tileFlags.ts: those live constants now describe the new layout, so importing them
// here would make this silently stop converting anything the moment it mattered most.

var OLD_VALUE_MASK = 0x3FF;    // old bits 0-9
var OLD_FLAGS_MASK = 0xFC00;   // old bits 10-15
var OLD_TO_NEW_FLAG_SHIFT = 3; // flags moved from bit 10 up to bit 13


// One raw packed value from the old layout, in the current one.
var reflowTileValue = function(oldRaw) {
  var value = oldRaw & OLD_VALUE_MASK;
  var flags = (oldRaw & OLD_FLAGS_MASK) << OLD_TO_NEW_FLAG_SHIFT;
  return value | flags;
};


export { reflowTileValue };
