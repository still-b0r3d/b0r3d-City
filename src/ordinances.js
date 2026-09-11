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

import { EventEmitter } from './eventEmitter.js';
import { ORDINANCES_CHANGED } from './messages.ts';

// City policies the mayor can enact: a recurring bill (or, for two of them, a
// recurring cheque) in exchange for a nudge to figures the simulation already
// computes. Deliberately the one feature here with no art and no map presence at all
// -- every effect below lands on a number some existing scan was going to produce
// anyway, which is what makes eight of them cheaper to add than one more building.
//
// Adding an ordinance is one entry in ORDINANCES plus, if it needs a kind of effect
// that doesn't exist yet, one line in collectModifiers below and one line at whichever
// scan consumes it. The window renders itself from this list (see ordinanceWindow.js),
// so there is no per-ordinance UI to write.
//
// COSTS. Settled annually, along with everything else in the budget -- collectTax runs
// every 48 city-time units and getDate calls that a year, so the "monthly" framing the
// budget window inherited from the original is the odd one out here, not this. Each
// ordinance costs `base` plus `perCapita` per head of population, so a policy that was
// affordable for a village doesn't stay free once it has a million people to apply it
// to. Negative figures are revenue.
//
// EFFECTS. Kept small on purpose. The demand nudges in particular are fixed rather
// than per-building, so unlike the civic buildings in customBuildings.js they can't be
// spammed -- each ordinance is enactable exactly once, and the largest total any valve
// can see from this file is 0.08 against valves.js's own 0.25 building ceiling and its
// hard clamp of 2. See VALVE_MAX_BOOST there for why that distinction matters.
var ORDINANCES = [
  {
    id: 'neighbourhoodWatch',
    label: 'Neighbourhood Watch',
    blurb: 'Residents keep an eye on the street. Crime rates fall citywide.',
    cost: { base: 80, perCapita: 0.10 },
    effects: { crime: 0.88 }
  },
  {
    id: 'pollutionControls',
    label: 'Pollution Controls',
    blurb: 'Emissions limits on industry. Cleaner air, and industry likes it rather less.',
    cost: { base: 150, perCapita: 0.20 },
    effects: { pollution: 0.80, demand: { industrial: -0.04 } }
  },
  {
    id: 'legalisedGambling',
    label: 'Legalised Gambling',
    blurb: 'A licence fee from every table in town. Commerce booms; so does crime.',
    cost: { base: -200, perCapita: -0.30 },
    effects: { crime: 1.18, demand: { commercial: 0.06 } }
  },
  {
    id: 'parkingFines',
    label: 'Parking Fines',
    blurb: 'Enforcement pays for itself and clears the streets. Shoppers are not thrilled.',
    cost: { base: -60, perCapita: -0.12 },
    effects: { trafficDecay: 8, demand: { commercial: -0.03 } }
  },
  {
    id: 'freeTransitPasses',
    label: 'Free Transit Passes',
    blurb: 'Nobody pays to ride. Traffic thins out and the city is easier to live in.',
    cost: { base: 120, perCapita: 0.22 },
    effects: { trafficDecay: 14, demand: { residential: 0.03 } }
  },
  {
    id: 'homelessShelters',
    label: 'Homeless Shelters',
    blurb: 'Somewhere to go. Fewer people on the street, and a little less crime.',
    cost: { base: 100, perCapita: 0.16 },
    effects: { crime: 0.94, demand: { residential: 0.05 } }
  },
  {
    id: 'touristAdvertising',
    label: 'Tourist Advertising',
    blurb: 'Billboards in every neighbouring city. Visitors spend, and the place looks smarter.',
    cost: { base: 200, perCapita: 0.10 },
    effects: { landValue: 4, demand: { commercial: 0.05 } }
  },
  {
    id: 'nuclearFreeZone',
    label: 'Nuclear-Free Zone',
    blurb: 'No fission within city limits. Costs nothing, and nobody will sell you a reactor.',
    cost: { base: 0, perCapita: 0 },
    effects: { landValue: 6, blocksTool: 'nuclear' },
    // The one ordinance with a precondition. Declaring the city nuclear-free while a
    // reactor is humming away in it is the sort of thing that would need explaining,
    // and blocking the tool after the fact wouldn't explain it -- so it can't be
    // enacted until the reactors are gone. Existing plants are never bulldozed on the
    // player's behalf.
    canEnact: function(census) {
      if (census.nuclearPowerPop > 0)
        return 'Not while the city still has a nuclear plant.';
      return null;
    }
  }
];


var ORDINANCES_BY_ID = {};
ORDINANCES.forEach(function(ordinance) {
  ORDINANCES_BY_ID[ordinance.id] = ordinance;
});


// What the simulation reads when no ordinance touches a given figure. Every consumer
// of these modifiers falls back to this object rather than to a scatter of `if
// (ordinances)` checks, so the scans read the same whether or not this feature exists.
var NO_MODIFIERS = {
  crime: 1,
  pollution: 1,
  landValue: 0,
  trafficDecay: 0,
  demand: { residential: 0, commercial: 0, industrial: 0 },
  blockedTools: {}
};


var Ordinances = EventEmitter(function() {
  this._enacted = {};
  this._modifiers = NO_MODIFIERS;
});


Ordinances.prototype.isEnacted = function(id) {
  return this._enacted[id] === true;
};


Ordinances.prototype.getEnacted = function() {
  return ORDINANCES.filter(function(ordinance) {
    return this._enacted[ordinance.id] === true;
  }.bind(this));
};


// Multiplicative effects (crime, pollution) compose by multiplying, so Neighbourhood
// Watch and Homeless Shelters together are 0.88 * 0.94 rather than either alone or the
// sum of both discounts; additive ones (land value, traffic decay, demand) just add.
// Recomputed on every change rather than on every read: the scans that consume these
// run several times a second and enacting a policy is a once-in-a-while click.
Ordinances.prototype._recomputeModifiers = function() {
  var modifiers = {
    crime: 1,
    pollution: 1,
    landValue: 0,
    trafficDecay: 0,
    demand: { residential: 0, commercial: 0, industrial: 0 },
    blockedTools: {}
  };

  this.getEnacted().forEach(function(ordinance) {
    var effects = ordinance.effects;

    if (effects.crime !== undefined)
      modifiers.crime *= effects.crime;

    if (effects.pollution !== undefined)
      modifiers.pollution *= effects.pollution;

    if (effects.landValue !== undefined)
      modifiers.landValue += effects.landValue;

    if (effects.trafficDecay !== undefined)
      modifiers.trafficDecay += effects.trafficDecay;

    if (effects.blocksTool !== undefined)
      modifiers.blockedTools[effects.blocksTool] = ordinance.label;

    if (effects.demand !== undefined) {
      Object.keys(effects.demand).forEach(function(valve) {
        modifiers.demand[valve] += effects.demand[valve];
      });
    }
  });

  this._modifiers = modifiers;
};


Ordinances.prototype.getModifiers = function() {
  return this._modifiers;
};


// Returns the reason this ordinance cannot currently be enacted, or null if it can.
// Already-enacted ordinances can always be repealed, so this only ever gates enacting.
Ordinances.prototype.blockedReason = function(id, census) {
  var ordinance = ORDINANCES_BY_ID[id];
  if (ordinance === undefined || ordinance.canEnact === undefined)
    return null;

  return ordinance.canEnact(census);
};


// Applies a whole set of decisions at once -- the window hands back the state of every
// checkbox rather than a diff, so this is where "what changed" is worked out. Silent
// if nothing actually moved, so closing the window on OK without touching anything
// doesn't churn the modifiers or fire an event.
Ordinances.prototype.setEnacted = function(enactedIDs, census) {
  var wanted = {};
  enactedIDs.forEach(function(id) {
    if (ORDINANCES_BY_ID[id] !== undefined)
      wanted[id] = true;
  });

  var changed = false;

  ORDINANCES.forEach(function(ordinance) {
    var isEnacted = this._enacted[ordinance.id] === true;
    var shouldBeEnacted = wanted[ordinance.id] === true;

    if (isEnacted === shouldBeEnacted)
      return;

    // A precondition that has stopped being met between the window opening and OK
    // being pressed silently drops that one change rather than failing the rest.
    if (shouldBeEnacted && census && this.blockedReason(ordinance.id, census) !== null)
      return;

    this._enacted[ordinance.id] = shouldBeEnacted;
    changed = true;
  }.bind(this));

  if (!changed)
    return;

  this._recomputeModifiers();
  this._emitEvent(ORDINANCES_CHANGED, this.getEnacted().length);
};


// The year's bill. Positive is money out; the two revenue-raising ordinances make this
// go negative, and budget.js handles that as income without a special case.
Ordinances.prototype.getAnnualCost = function(census) {
  var population = census.totalPop;

  return this.getEnacted().reduce(function(total, ordinance) {
    return total + ordinance.cost.base + Math.round(ordinance.cost.perCapita * population);
  }, 0);
};


// What one ordinance would cost this year at the city's current size, for the window's
// per-row label. Same arithmetic as getAnnualCost, for one row.
var annualCostOf = function(ordinance, census) {
  return ordinance.cost.base + Math.round(ordinance.cost.perCapita * census.totalPop);
};


Ordinances.prototype.save = function(saveData) {
  saveData.ordinances = this.getEnacted().map(function(ordinance) {
    return ordinance.id;
  });
};


Ordinances.prototype.load = function(saveData) {
  this._enacted = {};

  // Saves predating this feature have no ordinances key, and a save naming an
  // ordinance that has since been renamed or dropped loads without it rather than
  // refusing to load -- same treatment scenario slugs get in game.js.
  (saveData.ordinances || []).forEach(function(id) {
    if (ORDINANCES_BY_ID[id] !== undefined)
      this._enacted[id] = true;
  }.bind(this));

  this._recomputeModifiers();
  this._emitEvent(ORDINANCES_CHANGED, this.getEnacted().length);
};


export { Ordinances, ORDINANCES, NO_MODIFIERS, annualCostOf };
