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

export const SPRITE_TRAIN = 1;
export const SPRITE_HELICOPTER = 2;
export const SPRITE_AIRPLANE = 3;
export const SPRITE_SHIP = 4;
export const SPRITE_MONSTER = 5;
export const SPRITE_TORNADO = 6;
export const SPRITE_EXPLOSION = 7;

// b0r3d-city's own. 8 is not a new row on the sprite sheet: it is the row the original
// engine's bus occupied, which micropolisJS never implemented (there has never been a
// SPRITE_BUS constant or a constructor for one), so the art there was dormant and the
// sheet needs no growing. See src/zombieSprite.js.
export const SPRITE_ZOMBIE = 8;
