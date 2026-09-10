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

import { BaseSprite } from './baseSprite.js';
import { SPRITE_DYING, SPRITE_MOVED } from './messages.ts';
import { Random } from './random.ts';
import * as SpriteConstants from './spriteConstants.ts';

// b0r3d-city's own disaster, and the first one here that doesn't break anything.
//
// Every other disaster in this game destroys tiles: the monster and the tornado call
// SpriteUtils.destroyMapTile on everything they touch, fires and floods spread across
// the map, and a meltdown leaves ground nobody can build on for the rest of the city's
// life. A zombie deliberately does none of that. It attacks the people, not the
// buildings -- which is both the right story and, as it turns out, the version that
// fits this simulation best, because the machinery for "nobody wants to live here" was
// already built and the machinery for "your buildings are gone" is the part players
// have to spend an hour undoing.
//
// The whole effect is one number written into blockMaps.zombieMap, which
// pollutionTerrainLandValueScan subtracts from land value in exactly the way it adds
// this fork's civic buildings (see the civicBuildingMap line there -- this is its mirror
// image, and deliberately so). Everything else falls out of the simulation on its own:
//
//   - residential.js grows and decays zones on land value minus pollution, so a street
//     the horde is standing on stops being somewhere people move to, and starts being
//     somewhere they leave.
//   - crimeScan computes crime as (128 - landValue) + density - police, so crime rises
//     where they are without this ever touching the crime map. The causal chain is the
//     game's own rather than something asserted on top of it.
//   - both show up live on the City Maps overlays, which is where a player will
//     actually watch an outbreak happen.
//
// And it is all recoverable. The dread decays out of zombieMap once they're gone (see
// Simulation's _clearCensus), land value climbs back, and the zones refill. A city
// survives a wave; it just has a bad decade.

// Roughly fifteen seconds of animation frames. move() is driven by SpriteManager's
// moveObjects from the animation loop, not the simulation clock, so this is wall time
// and matches how long the monster lasts.
var ZOMBIE_LIFETIME = 900;

// One pixel a move against the monster's two -- sixteen world pixels to the tile, so
// this is a shamble rather than a charge, and gives a player time to see one coming.
var ZOMBIE_SPEED = 1;

// How much dread one zombie lays down in its block per move, and the ceiling any one
// block can hold however many of them are standing in it. The scan divides by 20 (as
// it does for civic buildings), so a saturated block loses 30 off a land value whose
// whole range is 1-250: enough to visibly push a decent neighbourhood down a grade and
// stall its growth, nowhere near enough to flatten it.
var DREAD_PER_MOVE = 40;
var DREAD_MAX = 600;

// Police pressure. policeStationEffectMap runs 0-1000, and at the top of that range a
// zombie burns through its lifetime this many times faster than it otherwise would --
// so a properly policed city clears a wave in a fraction of the time an unpoliced one
// does. This is the scenario's actual strategy: the answer to the horde is police
// stations, and the map overlay for police coverage is now there to plan them with.
var POLICE_ATTRITION = 6;

// How far off a straight line to the city centre each step can wander. Without this a
// horde spawned along one edge walks inward as a rank of identical sprites in perfect
// formation, which reads as a bug rather than as a crowd.
var WANDER = 3;

// Animation frames per art frame. The sheet holds a four-step shamble; at one art
// frame every eight moves the cycle takes about half a second, which is the right side
// of comical for something moving this slowly.
var FRAMES_PER_STEP = 8;
var FRAME_COUNT = 4;


function ZombieSprite(map, spriteManager, x, y) {
  this.init(SpriteConstants.SPRITE_ZOMBIE, map, spriteManager, x, y);

  // 32x32 art in a 48px sheet cell, drawn from the cell's top-left -- gameCanvas takes
  // a width x width square, so width is what decides how much of the cell is read.
  // Offsets are half of that, to centre the figure on its own coordinate.
  this.width = 32;
  this.height = 32;
  this.xOffset = -16;
  this.yOffset = -16;

  this.frame = 1;
  this.count = ZOMBIE_LIFETIME;
  this._stepCount = 0;

  // They head for the city centre, which the simulation already maintains and which is
  // where the people are. The monster heads for peak pollution instead: it is drawn to
  // what the city has done to the landscape, where these are drawn to the city itself.
  this.destX = map.cityCentreX << 4;
  this.destY = map.cityCentreY << 4;
}


BaseSprite(ZombieSprite);


// Lifetime spent per move. Always at least 1, so a zombie standing in an unpoliced
// corner still eventually falls over rather than becoming permanent scenery.
ZombieSprite.prototype._attrition = function(blockMaps) {
  var coverage = blockMaps.policeStationEffectMap.worldGet(this.worldX, this.worldY);
  if (coverage <= 0)
    return 1;

  return 1 + Math.floor((Math.min(1000, coverage) / 1000) * POLICE_ATTRITION);
};


ZombieSprite.prototype._spreadDread = function(blockMaps) {
  var zombieMap = blockMaps.zombieMap;
  var current = zombieMap.worldGet(this.worldX, this.worldY);

  zombieMap.worldSet(this.worldX, this.worldY, Math.min(DREAD_MAX, current + DREAD_PER_MOVE));
};


ZombieSprite.prototype.move = function(spriteCycle, disasterManager, blockMaps) {
  this._stepCount++;

  if (this._stepCount % FRAMES_PER_STEP === 0)
    this.frame = (this.frame % FRAME_COUNT) + 1;

  // Shamble towards the centre of town, one axis at a time with a wobble on the other,
  // rather than along a true diagonal -- it looks less purposeful, which is the point.
  var dx = this.destX - this.x;
  var dy = this.destY - this.y;

  if (Math.abs(dx) > ZOMBIE_SPEED)
    this.x += dx > 0 ? ZOMBIE_SPEED : -ZOMBIE_SPEED;

  if (Math.abs(dy) > ZOMBIE_SPEED)
    this.y += dy > 0 ? ZOMBIE_SPEED : -ZOMBIE_SPEED;

  if ((this._stepCount & 7) === 0) {
    this.x += Random.getRandom(WANDER * 2) - WANDER;
    this.y += Random.getRandom(WANDER * 2) - WANDER;
  }

  // Wandered off the edge of the world, or simply ran out. Frame 0 is how a sprite
  // says it's finished -- SpriteManager.pruneDeadSprites collects it afterwards.
  if (this.spriteNotInBounds()) {
    this.frame = 0;
    this._emitEvent(SPRITE_DYING);
    return;
  }

  this.count -= this._attrition(blockMaps);

  if (this.count <= 0) {
    this.frame = 0;
    this._emitEvent(SPRITE_DYING);
    return;
  }

  this._spreadDread(blockMaps);
  this._emitEvent(SPRITE_MOVED, {x: this.worldX, y: this.worldY});
};


export { ZombieSprite, ZOMBIE_LIFETIME };
