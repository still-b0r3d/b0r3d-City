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

import { Random } from './random.ts';
import { TileUtils } from './tileUtils.js';
import { DIRT, IZB, RADTILE } from "./tileValues.ts";
import { ZoneUtils } from './zoneUtils.js';

var xDelta = [-1,  0,  1,  0 ];
var yDelta = [ 0, -1,  0,  1 ];

var fireFound = function(map, x, y, simData) {
  simData.census.firePop += 1;

  if ((Random.getRandom16() & 3) !== 0)
    return;

  // Try to set neighbouring tiles on fire as well.
  //
  // Until v0.89.9 this read the burning tile itself (map.getTile(x, y)) instead of the
  // neighbour, and a fire tile is not combustible, so the body below never ran and fire
  // never spread: every fire was one tile that burned for a while and went out. Had it
  // run, it would have thrown on an undefined `tileUtils`, marked the wrong zone as
  // burning, and handed makeExplosionAt tile coordinates where it wants pixels. This is
  // the original's DoFire (s_sim.c), neighbour and all.
  for (var i = 0; i < 4; i++) {
    if (Random.getChance(7)) {
      var xTem = x + xDelta[i];
      var yTem = y + yDelta[i];

      if (map.testBounds(xTem, yTem)) {
        var tile = map.getTile(xTem, yTem);
        if (!tile.isCombustible())
            continue;

        if (tile.isZone()) {
          // Neighbour is a zone and burnable
          ZoneUtils.fireZone(map, xTem, yTem, simData.blockMaps);

          // Industrial zones etc really go boom. The explosion is placed in pixels, at
          // the middle of the tile.
          if (tile.getValue() > IZB)
            simData.spriteManager.makeExplosionAt((xTem << 4) + 8, (yTem << 4) + 8);
        }

        map.setTo(xTem, yTem, TileUtils.randomFire());
      }
    }
  }

  // Compute likelyhood of fire running out of fuel
  var rate = 10; // Likelyhood of extinguishing (bigger means less chance)
  i = simData.blockMaps.fireStationEffectMap.worldGet(x, y);

  if (i > 100)
    rate = 1;
  else if (i > 20)
    rate = 2;
  else if (i > 0)
    rate = 3;

  // Decide whether to put out the fire.
  if (Random.getRandom(rate) === 0)
    map.setTo(x, y, TileUtils.randomRubble());
};


var radiationFound = function(map, x, y, simData) {
  if (Random.getChance(4095))
    map.setTile(x, y, DIRT, 0);
};


var floodFound = function(map, x, y, simData) {
  simData.disasterManager.doFlood(x, y, simData.blockMaps);
};


var MiscTiles = {
  registerHandlers: function(mapScanner, repairManager) {
    mapScanner.addAction(TileUtils.isFire, fireFound, true);
    mapScanner.addAction(RADTILE, radiationFound, true);
    mapScanner.addAction(TileUtils.isFlood, floodFound, true);
  }
};


export { MiscTiles };
