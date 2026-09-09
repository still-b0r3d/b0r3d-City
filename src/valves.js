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

import { CUSTOM_BUILDINGS } from './customBuildings.js';
import { EventEmitter } from './eventEmitter.js';
import { VALVES_UPDATED } from './messages.ts';
import { MiscUtils } from './miscUtils.js';

var Valves = EventEmitter(function () {
  this.resValve = 0;
  this.comValve = 0;
  this.indValve = 0;
  this.resCap = false;
  this.comCap = false;
  this.indCap = false;
});


var RES_VALVE_RANGE = 2000;
var COM_VALVE_RANGE = 1500;
var IND_VALVE_RANGE = 1500;

// b0r3d-city's own civic buildings nudge their respective demand ratios directly,
// independent of the organic employment/migration math below.
//
// The nudge saturates rather than scaling linearly with how many you've built. It used
// to be a flat +0.05 per building, which sounds small but is applied to a *growth
// ratio* that normally sits around 1.0-1.3 against a hard ceiling of 2.0 (resRatioMax
// below) -- so roughly fourteen schools, about $11,000, pinned residential demand at
// maximum permanently and the employment loop stopped mattering at all. That's not a
// civic building any more, it's an off switch for the economy.
//
// The curve below is boost = MAX * n / (n + HALF), which is worth exactly the old
// +0.05 for the first building (so a single school feels the same as it always did),
// keeps every later one worth something without ever reaching the cap, and tops out at
// MAX no matter how many are crammed in. HALF is the count at which half the maximum
// has been earned.
//
// MAX is per *valve*, not per building type: everything feeding residential demand
// draws on one shared 0.25 rather than each new building type stacking a fresh 0.25
// on top. That is what stops the fix above being quietly undone by adding more kinds
// of building -- resRatio is clamped to resRatioMax (2) below and normally sits
// around 1.0-1.3, so two independent 0.25s would put that clamp back within easy
// reach and pin demand at maximum again, which is the exact failure this curve
// exists to prevent. Each building's `weight` in customBuildings.js says how much of
// a School/Casino one of it counts for against the shared ceiling, so a University
// can be worth six Schools without needing a second ceiling of its own.
var VALVE_MAX_BOOST = {
  residential: 0.25,
  commercial: 0.25,
  industrial: 0.25,
};
var DEMAND_BOOST_HALF_POINT = 4;

// Which census counters feed which valve, grouped once at load rather than rebuilt on
// every setValves call (this runs each tick). Read straight from the registry, so a
// new demand building needs no line here -- see customBuildings.js.
var DEMAND_STATS_BY_VALVE = {};
CUSTOM_BUILDINGS.forEach(function(building) {
  var effect = building.effect;
  if (effect.type !== 'demand')
    return;

  var stats = DEMAND_STATS_BY_VALVE[effect.valve] || (DEMAND_STATS_BY_VALVE[effect.valve] = []);
  stats.push({ censusStat: effect.censusStat, weight: effect.weight });
});

// count is fractional by design: civicBuildings.js scores an unpowered or
// road-disconnected building as a fraction of a working one, matching how Police/Fire
// coverage is treated, so a neglected school is worth proportionally less here too.
var saturatingBoost = function(count, maxBoost) {
  if (count <= 0)
    return 0;

  return maxBoost * count / (count + DEMAND_BOOST_HALF_POINT);
};


var demandBoost = function(census, valve) {
  var stats = DEMAND_STATS_BY_VALVE[valve];
  if (stats === undefined)
    return 0;

  var count = 0;
  for (var i = 0, l = stats.length; i < l; i++)
    count += census[stats[i].censusStat] * stats[i].weight;

  return saturatingBoost(count, VALVE_MAX_BOOST[valve]);
};


var taxTable = [
  200, 150, 120, 100, 80, 50, 30, 0, -10, -40, -100,
  -150, -200, -250, -300, -350, -400, -450, -500, -550, -600];
var extMarketParamTable = [1.2, 1.1, 0.98];

Valves.prototype.save = function(saveData) {
  saveData.resValve = this.resValve;
  saveData.comValve = this.comValve;
  saveData.indValve = this.indValve;
};


Valves.prototype.load = function(saveData) {
  this.resValve = saveData.resValve;
  this.comValve = saveData.comValve;
  this.indValve = saveData.indValve;

  this._emitEvent(VALVES_UPDATED);
};


Valves.prototype.setValves = function(gameLevel, census, budget) {
  var resPopDenom = 8;
  var birthRate = 0.02;
  var labourBaseMax = 1.3;
  var internalMarketDenom = 3.7;
  var projectedIndPopMin = 5.0;
  var resRatioDefault = 1.3;
  var resRatioMax = 2;
  var comRatioMax = 2;
  var indRatioMax = 2;
  var taxMax = 20;
  var taxTableScale = 600;
  var employment, labourBase;

  // Residential zones scale their population index when reporting it to the census
  var normalizedResPop = census.resPop / resPopDenom;
  census.totalPop = Math.round(normalizedResPop + census.comPop + census.indPop);

  // A lack of developed commercial and industrial zones means there are no employment opportunities, which constrain
  // growth. (This might hurt initially if, for example, the player lays out an initial grid, as the residential zones
  // will likely develop first, so the residential valve will immediately crater).
  if (census.resPop > 0)
    employment = (census.comHist10[1] + census.indHist10[1]) / normalizedResPop;
  else
    employment = 1;

  // Given the employment rate, calculate expected migration, add in births, and project the new population.
  var migration = normalizedResPop * (employment - 1);
  var births = normalizedResPop * birthRate;
  var projectedResPop = normalizedResPop + migration + births;

  // Examine how many zones require workers
  labourBase = census.comHist10[1] + census.indHist10[1];
  if (labourBase > 0.0)
    labourBase = census.resHist10[1] / labourBase;
  else
    labourBase = 1;
  labourBase = MiscUtils.clamp(labourBase, 0.0, labourBaseMax);

  // Project future industry and commercial needs, taking into account available labour, and competition from
  // other global cities
  var internalMarket = (normalizedResPop + census.comPop + census.indPop) / internalMarketDenom;
  var projectedComPop = internalMarket * labourBase;
  var projectedIndPop = census.indPop * labourBase * extMarketParamTable[gameLevel];
  projectedIndPop = Math.max(projectedIndPop, projectedIndPopMin);

  // Calculate the expected percentage changes in each population type
  var resRatio;
  if (normalizedResPop > 0)
    resRatio = projectedResPop / normalizedResPop;
  else
    resRatio = resRatioDefault;

  var comRatio;
  if (census.comPop > 0)
    comRatio = projectedComPop / census.comPop;
  else
    comRatio = projectedComPop;

  var indRatio;
  if (census.indPop > 0)
    indRatio = projectedIndPop / census.indPop;
  else
    indRatio = projectedIndPop;

  resRatio += demandBoost(census, 'residential');
  comRatio += demandBoost(census, 'commercial');
  indRatio += demandBoost(census, 'industrial');

  resRatio = Math.min(resRatio, resRatioMax);
  comRatio = Math.min(comRatio, comRatioMax);
  indRatio = Math.min(indRatio, indRatioMax);

  // Constrain growth according to the tax level.
  var z = Math.min((budget.cityTax + gameLevel), taxMax);
  resRatio = (resRatio - 1) * taxTableScale + taxTable[z];
  comRatio = (comRatio - 1) * taxTableScale + taxTable[z];
  indRatio = (indRatio - 1) * taxTableScale + taxTable[z];

  this.resValve = MiscUtils.clamp(this.resValve + Math.round(resRatio), -RES_VALVE_RANGE, RES_VALVE_RANGE);
  this.comValve = MiscUtils.clamp(this.comValve + Math.round(comRatio), -COM_VALVE_RANGE, COM_VALVE_RANGE);
  this.indValve = MiscUtils.clamp(this.indValve + Math.round(indRatio), -IND_VALVE_RANGE, IND_VALVE_RANGE);

  if (this.resCap && this.resValve > 0)
    this.resValve = 0;

  if (this.comCap && this.comValve > 0)
      this.comValve = 0;

  if (this.indCap && this.indValve > 0)
      this.indValve = 0;

  this._emitEvent(VALVES_UPDATED);
};


export { Valves };
