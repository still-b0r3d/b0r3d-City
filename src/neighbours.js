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
import * as Messages from './messages.ts';
import { MiscUtils } from './miscUtils.js';
import { Random } from './random.ts';

// Three towns over the city limits that will trade electricity with you: buy their
// surplus instead of building the next plant, or sell them yours and let somebody else
// pay for the coal. Built entirely out of plumbing that already existed -- the power
// grid has always had a total capacity that the scan measures consumption against (see
// powerManager.js), and the budget has always settled a set of recurring line items
// once a year (see budget.js), so a contract is just an addend to the first and a line
// in the second.
//
// The reason this is a strategic layer rather than a cheat code is that importing is
// cheap per year but never stops costing, the rates move, and a neighbour you have
// annoyed will walk away and take their megawatts with them -- generally at the worst
// possible moment, since the moment you notice is the moment your grid was relying on
// them.
//
// THE ONE LIMIT WORTH KNOWING. Imported power raises what the grid can *carry*; it
// cannot start one. doPowerScan distributes power by walking outwards from each plant
// it found during the map scan, so a city with contracts but no plant of its own has a
// larger capacity and an empty power stack, and nothing gets powered. That is a
// consequence of how the original distributes power rather than a decision made here,
// and rather than work around it with an invented connection point somewhere on the
// map, the neighbours window says so plainly the moment a city is in that position --
// see the warning in neighbourWindow.js. So this defers your second power plant, and
// every one after it, but never your first.

// Rates are dollars per 100 units of power per year, which is the scale that makes
// them comparable to the thing they replace: a coal plant is $3000 up front for 700
// units (see COAL_POWER_STRENGTH), so Northport's opening rate of $240 buys the same
// 700 units for $1680 a year. Cheap in year one, a bad deal by year three, which is
// exactly the trade this is meant to offer.
var NEIGHBOURS = [
  {
    id: 'northport',
    name: 'Northport',
    blurb: 'Big, dull and dependable. Charges accordingly.',
    capacity: 1200,
    buyRate: 240,
    sellRate: 150,
    // How far this neighbour's rates can move in a single renegotiation, as a
    // percentage. Northport is the steady one; Ashgrove is the gamble.
    volatility: 5
  },
  {
    id: 'ashgrove',
    name: 'Ashgrove',
    blurb: 'Cheapest power for miles. Ask them why.',
    capacity: 800,
    buyRate: 190,
    sellRate: 110,
    volatility: 14
  },
  {
    id: 'lowmoor',
    name: 'Lowmoor',
    blurb: 'Small, and short of power. Pays well for yours.',
    capacity: 500,
    buyRate: 210,
    sellRate: 175,
    volatility: 8
  }
];


var NEIGHBOURS_BY_ID = {};
NEIGHBOURS.forEach(function(neighbour) {
  NEIGHBOURS_BY_ID[neighbour.id] = neighbour;
});


// Contract sizes are set in steps rather than by the unit, since a slider that can
// pick 337 units of power is a slider nobody uses well.
var AMOUNT_STEP = 100;

var DEAL_NONE = 'none';
var DEAL_IMPORT = 'import';
var DEAL_EXPORT = 'export';

// Relations run 0-100 and start neutral. What they actually gate is whether a
// neighbour will keep dealing with you: below WALK_AWAY_RELATIONS they start rolling
// to terminate, and a terminated deal takes a few years to be offered again.
var STARTING_RELATIONS = 55;
var WALK_AWAY_RELATIONS = 30;
var HONOURED_YEAR = 3;
var CANCELLED_BY_PLAYER = -15;
var UNPAID_BILL = -20;
var COOLOFF_YEARS = 3;


var makeState = function(neighbour) {
  return {
    id: neighbour.id,
    relations: STARTING_RELATIONS,
    dealType: DEAL_NONE,
    amount: 0,
    // Rates drift from the definition's opening figures, so these are state rather
    // than constants once the first year has been settled.
    buyRate: neighbour.buyRate,
    sellRate: neighbour.sellRate,
    // Years left before this neighbour will deal again after walking away.
    cooloff: 0
  };
};


var Neighbours = EventEmitter(function() {
  this._states = NEIGHBOURS.map(makeState);

  // Last year's settlement, for the budget window's line item and the neighbours
  // window's summary. Positive is money out.
  this.annualCost = 0;
});


Neighbours.prototype._stateOf = function(id) {
  for (var i = 0; i < this._states.length; i++)
    if (this._states[i].id === id)
      return this._states[i];

  return null;
};


// Everything the neighbours window needs to draw itself: the definition, the live
// state, and the year's cash figure for each contract.
Neighbours.prototype.getSummary = function() {
  return NEIGHBOURS.map(function(neighbour) {
    var state = this._stateOf(neighbour.id);

    return {
      id: neighbour.id,
      name: neighbour.name,
      blurb: neighbour.blurb,
      capacity: neighbour.capacity,
      relations: state.relations,
      dealType: state.dealType,
      amount: state.amount,
      buyRate: state.buyRate,
      sellRate: state.sellRate,
      cooloff: state.cooloff,
      annualCost: annualCostOf(state)
    };
  }.bind(this));
};


// Power the neighbours are supplying this year, which powerManager adds to what the
// city's own plants can deliver.
Neighbours.prototype.getImportedPower = function() {
  return this._states.reduce(function(total, state) {
    return total + (state.dealType === DEAL_IMPORT ? state.amount : 0);
  }, 0);
};


// Power promised to the neighbours, which comes off the grid's capacity before the
// city gets any. This is the whole cost of an export contract as far as the simulation
// is concerned: sell more than you can spare and your own city browns out, because the
// power scan has that much less to hand out. See doPowerScan.
Neighbours.prototype.getExportedPower = function() {
  return this._states.reduce(function(total, state) {
    return total + (state.dealType === DEAL_EXPORT ? state.amount : 0);
  }, 0);
};


var annualCostOf = function(state) {
  if (state.dealType === DEAL_IMPORT)
    return Math.round(state.amount / 100 * state.buyRate);

  if (state.dealType === DEAL_EXPORT)
    return -Math.round(state.amount / 100 * state.sellRate);

  return 0;
};


// The year's net bill across every contract. Negative is income.
Neighbours.prototype.getAnnualCost = function() {
  return this._states.reduce(function(total, state) {
    return total + annualCostOf(state);
  }, 0);
};


// Applies the window's decisions. Signing or resizing a contract is free; walking away
// from one is not, which is the only thing stopping a player from cancelling every
// December and re-signing every January to dodge the bill.
Neighbours.prototype.setDeal = function(id, dealType, amount) {
  var neighbour = NEIGHBOURS_BY_ID[id];
  var state = this._stateOf(id);
  if (neighbour === undefined || state === null)
    return;

  if (state.cooloff > 0)
    return;

  amount = MiscUtils.clamp(Math.round(amount / AMOUNT_STEP) * AMOUNT_STEP, 0, neighbour.capacity);
  if (amount === 0)
    dealType = DEAL_NONE;

  var wasTrading = state.dealType !== DEAL_NONE;
  var willTrade = dealType !== DEAL_NONE;

  if (wasTrading && !willTrade)
    state.relations = MiscUtils.clamp(state.relations + CANCELLED_BY_PLAYER, 0, 100);

  state.dealType = willTrade ? dealType : DEAL_NONE;
  state.amount = willTrade ? amount : 0;

  this._emitEvent(Messages.NEIGHBOURS_CHANGED);
};


// Settles the year with every neighbour, and lets each of them react to how it went.
// Called from budget.collectTax, which is the only place in the game where a year
// actually ticks over. Returns the net cash figure so the budget can fold it into the
// same arithmetic as roads, fire and police.
//
// Note what is *not* here: selling more power than the city can spare costs no
// relations at all. The neighbour gets their contracted power either way -- exports
// come off the top of the grid's capacity, before the city itself is served -- so the
// only one who suffers is the mayor who sold it, in blackouts. The one thing that does
// sour a neighbour is a bill the city cannot pay.
Neighbours.prototype.settleYear = function(budget) {
  var cost = this.getAnnualCost();
  this.annualCost = cost;

  // Can the city actually cover what it owes? Anything it can't is a defaulted bill,
  // and every importing neighbour hears about it.
  var owed = this._states.reduce(function(total, state) {
    var stateCost = annualCostOf(state);
    return total + (stateCost > 0 ? stateCost : 0);
  }, 0);
  var defaulted = owed > 0 && (budget.totalFunds + budget.taxFund) < owed;

  this._states.forEach(function(state) {
    var neighbour = NEIGHBOURS_BY_ID[state.id];

    if (state.cooloff > 0) {
      state.cooloff--;
      return;
    }

    if (state.dealType === DEAL_NONE) {
      // Idle neighbours drift back towards neutral, so a city that fell out with
      // somebody years ago isn't locked out of dealing with them forever.
      state.relations += state.relations < STARTING_RELATIONS ? 2 : (state.relations > STARTING_RELATIONS ? -1 : 0);
      state.relations = MiscUtils.clamp(state.relations, 0, 100);
      return;
    }

    if (defaulted && annualCostOf(state) > 0)
      state.relations += UNPAID_BILL;
    else
      state.relations += HONOURED_YEAR;

    state.relations = MiscUtils.clamp(state.relations, 0, 100);

    this._renegotiate(state, neighbour);

    // Bad relations, and they start looking for another customer. Rolled rather than
    // triggered at a threshold so that a city on thin ice gets a year or two of
    // warning notices before the power actually goes off.
    if (state.relations < WALK_AWAY_RELATIONS && Random.getChance(3)) {
      state.dealType = DEAL_NONE;
      state.amount = 0;
      state.cooloff = COOLOFF_YEARS;
      this._emitEvent(Messages.FRONT_END_MESSAGE, {
        subject: Messages.NEIGHBOUR_DEAL_ENDED,
        data: { name: neighbour.name }
      });
    }
  }.bind(this));

  if (defaulted) {
    this._emitEvent(Messages.FRONT_END_MESSAGE, { subject: Messages.NEIGHBOUR_BILL_UNPAID });
  }

  this._emitEvent(Messages.NEIGHBOURS_CHANGED);
  return cost;
};


// Rates move a little every year, in the direction relations point. A neighbour who
// likes you shades their price your way; one who doesn't does the opposite. Only
// announced when the move is big enough to matter, or every city with a contract would
// get three notifications every January forever.
Neighbours.prototype._renegotiate = function(state, neighbour) {
  var swing = Random.getRandom(neighbour.volatility * 2) - neighbour.volatility;

  // Relations tilt the swing by up to five percentage points either way.
  swing += Math.round((state.relations - STARTING_RELATIONS) / 10) * (state.dealType === DEAL_IMPORT ? -1 : 1);

  var rateKey = state.dealType === DEAL_IMPORT ? 'buyRate' : 'sellRate';
  var oldRate = state[rateKey];
  var newRate = Math.max(20, Math.round(oldRate * (100 + swing) / 100));

  // Rates are held within half to double the opening figure, so a long game can't
  // drift into either free power or absurdity.
  var opening = neighbour[rateKey];
  state[rateKey] = MiscUtils.clamp(newRate, Math.round(opening / 2), opening * 2);

  var change = state[rateKey] - oldRate;
  if (Math.abs(change) * 100 < oldRate * 4)
    return;

  this._emitEvent(Messages.FRONT_END_MESSAGE, {
    subject: Messages.NEIGHBOUR_RATE_CHANGED,
    data: {
      name: neighbour.name,
      direction: change > 0 ? 'raised' : 'cut',
      rate: state[rateKey]
    }
  });
};


Neighbours.prototype.save = function(saveData) {
  saveData.neighbours = this._states.map(function(state) {
    return {
      id: state.id, relations: state.relations, dealType: state.dealType,
      amount: state.amount, buyRate: state.buyRate, sellRate: state.sellRate,
      cooloff: state.cooloff
    };
  });
};


Neighbours.prototype.load = function(saveData) {
  // Saves predating this feature have no neighbours key: those cities start with
  // three neutral neighbours and no contracts, which is where a new city starts too.
  this._states = NEIGHBOURS.map(makeState);

  (saveData.neighbours || []).forEach(function(saved) {
    var state = this._stateOf(saved.id);
    if (state === null)
      return;

    state.relations = saved.relations;
    state.dealType = saved.dealType;
    state.amount = saved.amount;
    state.buyRate = saved.buyRate;
    state.sellRate = saved.sellRate;
    state.cooloff = saved.cooloff;
  }.bind(this));

  this._emitEvent(Messages.NEIGHBOURS_CHANGED);
};


export { Neighbours, NEIGHBOURS, AMOUNT_STEP, DEAL_NONE, DEAL_IMPORT, DEAL_EXPORT };
