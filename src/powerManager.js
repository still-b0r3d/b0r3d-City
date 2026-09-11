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

import { BlockMap } from './blockMap.ts';
import { forEachCardinalDirection } from './direction.ts';
import { EventEmitter } from './eventEmitter.js';
import { Position } from './position.ts';
import { NOT_ENOUGH_POWER } from './messages.ts';
import { Random } from './random.ts';
import { ANIMBIT, BURNBIT, CONDBIT, POWERBIT } from "./tileFlags.ts";
import { NUCLEAR, POWERPLANT } from "./tileValues.ts";

var COAL_POWER_STRENGTH = 700;
var NUCLEAR_POWER_STRENGTH = 2000;


var PowerManager = EventEmitter(function(map, neighbours) {
  this._map = map;
  // Optional: a PowerManager built without one simply has no external market, which
  // is what every caller had before neighbour deals existed.
  this._neighbours = neighbours || null;
  this._powerStack = [];
  this.powerGridMap = new BlockMap(this._map.width, this._map.height, 1);

  // The last scan's figures, for the neighbours window to show the player what their
  // grid actually looks like before they go and sell half of it. Consumption is only
  // meaningful once a scan has completed without bailing out, hence the flag.
  //
  // Generation is recorded here rather than recomputed from the census on demand, even
  // though recomputing it is one multiplication: the census is cleared and refilled
  // over eight simulation phases, so asking it how many power plants the city has at
  // an arbitrary moment can return any figure between none of them and all of them.
  // Reading it here, at the one point where the whole census is known to be current,
  // is what keeps "generated" and "available" in the window agreeing with each other.
  this.lastCapacity = 0;
  this.lastGenerated = 0;
  this.lastConsumption = 0;
  this.lastScanCompleted = true;
});


// What the city's own plants can deliver, plus whatever the neighbours are contracted
// to supply, minus whatever has been promised to them. Exports come off the top: the
// contracted power leaves before the city gets any of it, so overselling doesn't
// short-change the neighbour, it browns out the seller. That asymmetry is the whole
// risk in an export contract, and it is one subtraction.
PowerManager.prototype.getCapacity = function(census) {
  var generated = this.getGeneratedPower(census);

  if (this._neighbours === null)
    return generated;

  return Math.max(0, generated + this._neighbours.getImportedPower() - this._neighbours.getExportedPower());
};


// What the city's own plants produce, before anything is traded either way.
PowerManager.prototype.getGeneratedPower = function(census) {
  return census.coalPowerPop * COAL_POWER_STRENGTH +
         census.nuclearPowerPop * NUCLEAR_POWER_STRENGTH;
};


PowerManager.prototype.setTilePower = function(x, y) {
  var tile = this._map.getTile(x, y);
  var tileValue = tile.getValue();

  if (tileValue === NUCLEAR || tileValue === POWERPLANT ||
      this.powerGridMap.worldGet(x, y) > 0) {
    tile.addFlags(POWERBIT);
    return;
  }

  tile.removeFlags(POWERBIT);
};


PowerManager.prototype.clearPowerStack = function() {
  this._powerStackPointer = 0;
  this._powerStack = [];
};


PowerManager.prototype.testForConductive = function(pos, testDir) {
  var movedPos = Position.move(pos, testDir);

  if (this._map.isPositionInBounds(movedPos)) {
    if (this._map.getTile(movedPos.x, movedPos.y).isConductive()) {
      if (this.powerGridMap.worldGet(movedPos.x, movedPos.y) === 0)
          return true;
    }
  }

  return false;
};


// Note: the algorithm is buggy: if you have two adjacent power
// plants, the second will be regarded as drawing power from the first
// rather than as a power source itself
PowerManager.prototype.doPowerScan = function(census) {
  // Clear power this._map.
  this.powerGridMap.clear();

  // Power the grid can deliver: the city's own plants, plus imports, less exports.
  var maxPower = this.getCapacity(census);

  this.lastCapacity = maxPower;
  this.lastGenerated = this.getGeneratedPower(census);
  this.lastScanCompleted = false;

  var powerConsumption = 0; // Amount of power used.

  while (this._powerStack.length > 0) {
    var pos = this._powerStack.pop();
    var anyDir = undefined;
    var conNum;
    do {
      powerConsumption++;
      if (powerConsumption > maxPower) {
        this.lastConsumption = powerConsumption;
        this._emitEvent(NOT_ENOUGH_POWER);
        return;
      }

      if (anyDir)
        pos = Position.move(pos, anyDir);

      this.powerGridMap.worldSet(pos.x, pos.y, 1);
      conNum = 0;

      forEachCardinalDirection(dir => {
        if (conNum >= 2) {
          return;
        }

        if (this.testForConductive(pos, dir)) {
          conNum++;
          anyDir = dir;
        }
      });

      if (conNum > 1)
        this._powerStack.push(new Position(pos.x, pos.y));
    } while (conNum);
  }

  this.lastConsumption = powerConsumption;
  this.lastScanCompleted = true;
};


PowerManager.prototype.coalPowerFound = function(map, x, y, simData) {
  simData.census.coalPowerPop += 1;

  this._powerStack.push(new Position(x, y));

  // Ensure animation runs
  var dX = [-1, 2, 1, 2];
  var dY = [-1, -1, 0, 0];

  for (var i = 0; i < 4; i++)
    map.addTileFlags(x + dX[i], y + dY[i], ANIMBIT);
};


var dX = [1, 2, 1, 2];
var dY = [-1, -1, 0, 0];
var meltdownTable = [30000, 20000, 10000];

PowerManager.prototype.nuclearPowerFound = function(map, x, y, simData) {
  // TODO With the auto repair system, zone gets repaired before meltdown
  // In original Micropolis code, we bail and don't repair if melting down
  if (simData.disasterManager.disastersEnabled &&
      Random.getRandom(meltdownTable[simData.gameLevel]) === 0) {
    simData.disasterManager.doMeltdown(x, y);
    return;
  }

  simData.census.nuclearPowerPop += 1;
  this._powerStack.push(new Position(x, y));

  // Ensure animation bits set
  for (var i = 0; i < 4; i++)
    map.addTileFlags(x, y, ANIMBIT | CONDBIT | POWERBIT | BURNBIT);
};


PowerManager.prototype.registerHandlers = function(mapScanner, repairManager) {
  mapScanner.addAction(POWERPLANT, this.coalPowerFound.bind(this));
  mapScanner.addAction(NUCLEAR, this.nuclearPowerFound.bind(this));
  repairManager.addAction(POWERPLANT, 7, 4);
  repairManager.addAction(NUCLEAR, 7, 4);
};


export { PowerManager };
