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

import { AirplaneSprite } from './airplaneSprite.js';
import { BoatSprite } from './boatSprite.js';
import { CopterSprite } from './copterSprite.js';
import { EventEmitter } from './eventEmitter.js';
import { ExplosionSprite } from './explosionSprite.js';
import * as Messages from './messages.ts';
import { MiscUtils } from './miscUtils.js';
import { MonsterSprite } from './monsterSprite.js';
import { Random } from './random.ts';
import * as SpriteConstants from './spriteConstants.ts';
import { SpriteUtils } from './spriteUtils.js';
import { CHANNEL, RIVER } from "./tileValues.ts";
import { TornadoSprite } from './tornadoSprite.js';
import { TrainSprite } from './trainSprite.js';
import { ZombieSprite } from './zombieSprite.js';

// Zombies arrive as a wave; this is how many when nobody says otherwise. Sized so a
// horde reads as a crowd converging on the city rather than a handful of strays, while
// staying well inside what the sprite loop paints comfortably.
var DEFAULT_HORDE_SIZE = 12;

var SpriteManager = EventEmitter(function(map) {
  this.spriteList = [];
  this.map = map;
  this.spriteCycle = 0;
});


SpriteManager.prototype.getSprite = function(type) {
  var filteredList = this.spriteList.filter(function (s) {
    return s.frame !== 0 && s.type === type;
  });

  if (filteredList.length === 0)
    return null;

  return filteredList[0];
};


SpriteManager.prototype.getSpriteList = function() {
  return this.spriteList.slice();
};


SpriteManager.prototype.getSpritesInView = function(startX, startY, pixelWidth, pixelHeight) {
  var sprites = [];
  startX = SpriteUtils.worldToPix(startX);
  startY = SpriteUtils.worldToPix(startY);
  var lastX = startX + pixelWidth;
  var lastY = startY + pixelHeight;

  return this.spriteList.filter(function(s) {
    var spriteLeft = s.x + s.xOffset;
    var spriteTop = s.y + s.yOffset;
    var spriteRight = s.x + s.xOffset + s.width;
    var spriteBottom = s.y + s.yOffset + s.width;

    var leftInBounds = spriteLeft >= startX && spriteLeft < lastX;
    var rightInBounds = spriteRight >= startX && spriteRight < lastX;
    var topInBounds = spriteTop >= startY && spriteTop < lastY;
    var bottomInBounds = spriteBottom >= startY && spriteBottom < lastY;

    return (leftInBounds || rightInBounds) && (topInBounds || bottomInBounds);
  });
};


SpriteManager.prototype.moveObjects = function(simData) {
  var disasterManager = simData.disasterManager;
  var blockMaps = simData.blockMaps;

  this.spriteCycle += 1;

  var list = this.spriteList.slice();

  for (var i = 0, l = list.length; i < l; i++) {
    var sprite = list[i];

    if (sprite.frame === 0)
      continue;

    sprite.move(this.spriteCycle, disasterManager, blockMaps);
  }

  this.pruneDeadSprites();
};


SpriteManager.prototype.makeSprite = function(type, x, y) {
  var newSprite = new constructors[type](this.map, this, x, y);

  // Listen for crashes
  for (var i = 0, l = Messages.CRASHES.length; i < l; i++)
    newSprite.addEventListener(Messages.CRASHES[i], MiscUtils.reflectEvent.bind(this, Messages.CRASHES[i]));

  if (type == SpriteConstants.SPRITE_HELICOPTER)
    newSprite.addEventListener(Messages.HEAVY_TRAFFIC, MiscUtils.reflectEvent.bind(this, Messages.HEAVY_TRAFFIC));

  this.spriteList.push(newSprite);
  return newSprite;
};


SpriteManager.prototype.makeTornado = function() {
  var sprite = this.getSprite(SpriteConstants.SPRITE_TORNADO);
  if (sprite !== null) {
    sprite.count = 200;
    this._emitEvent(Messages.TORNADO_SIGHTED, {trackable: true, x: sprite.worldX, y: sprite.worldY, sprite: sprite});
    return;
  }

  var x = Random.getRandom(SpriteUtils.worldToPix(this.map.width) - 800) + 400;
  var y = Random.getRandom(SpriteUtils.worldToPix(this.map.height) - 200) + 100;

  sprite = this.makeSprite(SpriteConstants.SPRITE_TORNADO, x, y);
  this._emitEvent(Messages.TORNADO_SIGHTED, {trackable: true, x: sprite.worldX, y: sprite.worldY, sprite: sprite});
};


SpriteManager.prototype.makeExplosion = function(x, y) {
  if (this.map.testBounds(x, y))
    this.makeExplosionAt(SpriteUtils.worldToPix(x), SpriteUtils.worldToPix(y));
};


SpriteManager.prototype.makeExplosionAt = function(x, y) {
  this.makeSprite(SpriteConstants.SPRITE_EXPLOSION, x, y);
};


SpriteManager.prototype.generatePlane = function(x, y) {
  if (this.getSprite(SpriteConstants.SPRITE_AIRPLANE) !== null)
    return;

  this.makeSprite(SpriteConstants.SPRITE_AIRPLANE,
                  SpriteUtils.worldToPix(x),
                  SpriteUtils.worldToPix(y));
};


SpriteManager.prototype.generateTrain = function(census, x, y) {
  if (census.totalPop > 10 &&
      this.getSprite(SpriteConstants.SPRITE_TRAIN) === null &&
      Random.getRandom(25) === 0)
    this.makeSprite(SpriteConstants.SPRITE_TRAIN,
                    SpriteUtils.worldToPix(x) + 8,
                    SpriteUtils.worldToPix(y) + 8);
};


SpriteManager.prototype.generateShip = function() {
  // XXX This code is borked. The map generator will never
  // place a channel tile on the edges of the map
  var x,y;

  if (Random.getChance(3)) {
    for (x = 4; x < this.map.width - 2; x++) {
      if (this.map.getTileValue(x, 0) === CHANNEL)  {
        this.makeShipHere(x, 0);
        return;
      }
    }
  }

  if (Random.getChance(3)) {
    for (y = 1; y < this.map.height - 2; y++) {
      if (this.map.getTileValue(0, y) === CHANNEL)  {
        this.makeShipHere(0, y);
        return;
      }
    }
  }

  if (Random.getChance(3)) {
    for (x = 4; x < this.map.width - 2; x++) {
      if (this.map.getTileValue(x, this.map.height - 1) === CHANNEL)  {
        this.makeShipHere(x, this.map.height - 1);
        return;
      }
    }
  }

  if (Random.getChance(3)) {
    for (y = 1; y < this.map.height - 2; y++) {
      if (this.map.getTileValue(this.map.width - 1, y) === CHANNEL)  {
        this.makeShipHere(this.map.width - 1, y);
        return;
      }
    }
  }
};


SpriteManager.prototype.getBoatDistance = function(x, y) {
  var dist = 99999;
  var pixelX = SpriteUtils.worldToPix(x) + 8;
  var pixelY = SpriteUtils.worldToPix(y) + 8;

  for (var i = 0, l = this.spriteList.length; i < l; i++) {
    var sprite = this.spriteList[i];
    if (sprite.type === SpriteConstants.SPRITE_SHIP && sprite.frame !== 0) {
      var sprDist = Math.abs(sprite.x - pixelX) + Math.abs(sprite.y - pixelY);

      dist = Math.min(dist, sprDist);
    }
  }

  return dist;
};


SpriteManager.prototype.makeShipHere = function(x, y) {
  this.makeSprite(SpriteConstants.SPRITE_SHIP,
                  SpriteUtils.worldToPix(x),
                  SpriteUtils.worldToPix(y));
};


SpriteManager.prototype.generateCopter = function(x, y) {
  if (this.getSprite(SpriteConstants.SPRITE_HELICOPTER) !== null)
    return;

  this.makeSprite(SpriteConstants.SPRITE_HELICOPTER,
                  SpriteUtils.worldToPix(x),
                  SpriteUtils.worldToPix(y));
};


SpriteManager.prototype.makeMonsterAt = function(x, y) {
  var sprite = this.makeSprite(SpriteConstants.SPRITE_MONSTER,
                  SpriteUtils.worldToPix(x),
                  SpriteUtils.worldToPix(y));
  this._emitEvent(Messages.MONSTER_SIGHTED, {trackable: true, x: x, y: y, sprite: sprite});
};


SpriteManager.prototype.makeMonster = function() {
  var sprite = this.getSprite(SpriteConstants.SPRITE_MONSTER);
  if (sprite !== null) {
    sprite.soundCount = 1;
    sprite.count = 1000;
    sprite.destX = SpriteUtils.worldToPix(this.map.pollutionMaxX);
    sprite.destY = SpriteUtils.worldToPix(this.map.pollutionMaxY);
  }

  var done = 0;
  for (var i = 0; i < 300; i++)  {
    var x = Random.getRandom(this.map.width - 20) + 10;
    var y = Random.getRandom(this.map.height - 10) + 5;

    var tile = this.map.getTile(x, y);
    if (tile.getValue() === RIVER) {
      this.makeMonsterAt(x, y);
      done = 1;
      break;
    }
  }

  if (done === 0)
    this.makeMonsterAt(60, 50);
};


SpriteManager.prototype.makeZombieAt = function(x, y) {
  var sprite = this.makeSprite(SpriteConstants.SPRITE_ZOMBIE,
                  SpriteUtils.worldToPix(x),
                  SpriteUtils.worldToPix(y));
  this._emitEvent(Messages.ZOMBIE_SIGHTED, {trackable: true, x: x, y: y, sprite: sprite});
};


// How far out of town a horde appears, in tiles from the city centre. They still arrive
// from outside and converge inwards -- that part of the original idea was right -- but
// they used to spawn on the edge of the *map*, and that was a bug rather than a
// difficulty setting.
//
// The arithmetic, since it is the whole reason the zombies read as doing nothing before
// v0.89.6: a zombie moves one world pixel per animation frame, i.e. a sixteenth of a
// tile, and ZOMBIE_LIFETIME is 900 frames. Its entire life therefore covers 56 tiles,
// best case. On a 120x100 map the distance from an edge to the centre is 50-60, so a
// spawn on the left or right edge could not reach town at all, and one on the top or
// bottom arrived with a second or two left -- at which point police coverage, which
// only exists over the built-up part of the map, burned through what was left.
//
// Worse, it meant the dread they laid down on the way in landed on undeveloped tiles,
// and pollutionTerrainLandValueScan does not give undeveloped tiles a land value to
// lose. Nearly the whole effect was being written into blocks where it could not be
// read. Spawning them here instead puts their entire lifetime over ground that has a
// value: 18-28 tiles is comfortably outside a young city, still visibly "from
// somewhere else", and about a third of the travel budget.
var HORDE_SPAWN_MIN_RADIUS = 18;
var HORDE_SPAWN_MAX_RADIUS = 28;


// A wave, not a single zombie -- one shambler is a curiosity, and the threat is that
// there are a lot of them. Scattered around a ring rather than clumped, so a player
// watching the map sees a crowd closing in from every side rather than a single file.
//
// Only the first one is announced. Emitting ZOMBIE_SIGHTED per zombie would fire the
// notification bar and MonsterTV a dozen times in one frame, each replacing the last.
SpriteManager.prototype.makeZombies = function(count) {
  count = count || DEFAULT_HORDE_SIZE;

  var centreX = this.map.cityCentreX;
  var centreY = this.map.cityCentreY;

  for (var i = 0; i < count; i++) {
    var angle = (Random.getRandom(359) * Math.PI) / 180;
    var radius = HORDE_SPAWN_MIN_RADIUS +
                 Random.getRandom(HORDE_SPAWN_MAX_RADIUS - HORDE_SPAWN_MIN_RADIUS);

    // Clamped rather than retried: on a city near a corner of the map some of the ring
    // is off the edge of the world, and a zombie pinned to the boundary there is still
    // in roughly the right direction and still walks inward.
    var x = MiscUtils.clamp(Math.round(centreX + Math.cos(angle) * radius), 0, this.map.width - 1);
    var y = MiscUtils.clamp(Math.round(centreY + Math.sin(angle) * radius), 0, this.map.height - 1);

    if (i === 0) {
      this.makeZombieAt(x, y);
      continue;
    }

    this.makeSprite(SpriteConstants.SPRITE_ZOMBIE,
                    SpriteUtils.worldToPix(x), SpriteUtils.worldToPix(y));
  }
};


SpriteManager.prototype.pruneDeadSprites = function(type) {
  this.spriteList = this.spriteList.filter(function (s) {
    return s.frame !== 0;
  });
};


var constructors = {};
constructors[SpriteConstants.SPRITE_TRAIN] = TrainSprite;
constructors[SpriteConstants.SPRITE_SHIP] = BoatSprite;
constructors[SpriteConstants.SPRITE_MONSTER] = MonsterSprite;
constructors[SpriteConstants.SPRITE_HELICOPTER] = CopterSprite;
constructors[SpriteConstants.SPRITE_AIRPLANE] = AirplaneSprite;
constructors[SpriteConstants.SPRITE_TORNADO] = TornadoSprite;
constructors[SpriteConstants.SPRITE_EXPLOSION] = ExplosionSprite;
constructors[SpriteConstants.SPRITE_ZOMBIE] = ZombieSprite;


export { SpriteManager };
