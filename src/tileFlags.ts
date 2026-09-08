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

// Bit-masks for statusBits
//
// b0r3d-city widened the tile-value/flag split 2026-09-08: tile values used to be
// capped at 1024 (bit 10 was the first flag bit), which became a real ceiling on how
// many custom buildings could ever be added -- see the removed comment block that used
// to sit above CIVICHOSPITALBASE in tileValues.ts for the incident this caused. Flags
// now start at bit 13 instead of bit 10, giving tile values 8192 legal slots (0-8191)
// instead of 1024 -- comfortably inside the 32-bit range JS bitwise operators support,
// with no reason to have been stingier. Any save made before this change stores raw
// tile+flag integers in the OLD layout; storage.js's CURRENT_VERSION bump/migration is
// what keeps those loading correctly -- see storage.js's `case 3:` transition.
export const NOFLAGS  = 0x0000;
export const POWERBIT = 0x40000; // bit 18, tile has power.
export const CONDBIT  = 0x20000; // bit 17. tile can conduct electricity.
export const BURNBIT  = 0x10000; // bit 16, tile can be lit.
export const BULLBIT  = 0x8000;  // bit 15, tile is bulldozable.
export const ANIMBIT  = 0x4000;  // bit 14, tile is animated.
export const ZONEBIT  = 0x2000;  // bit 13, tile is the center tile of the zone.

export const BLBNBIT   = BULLBIT | BURNBIT;
export const BLBNCNBIT = BULLBIT | BURNBIT | CONDBIT;
export const BNCNBIT   = BURNBIT | CONDBIT;
export const ASCBIT    = ANIMBIT | CONDBIT | BURNBIT;
export const ALLBITS   = POWERBIT | CONDBIT | BURNBIT | BULLBIT | ANIMBIT | ZONEBIT;

export const BIT_START = 0x2000;
export const BIT_END = 0x80000;
export const BIT_MASK = BIT_START - 1;
