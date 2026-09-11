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

// Cost of maintaining 1 police station
var policeMaintenanceCost = 100;

// Cost of maintaining 1 fire station
var fireMaintenanceCost = 100;

// Cost of maintaining 1 road tile
var roadMaintenanceCost = 1;

// Cost of maintaining 1 rail tile
var railMaintenanceCost = 2;


var Budget = EventEmitter(function() {
  Object.defineProperties(this,
   {MAX_ROAD_EFFECT: MiscUtils.makeConstantDescriptor(32),
    MAX_POLICESTATION_EFFECT: MiscUtils.makeConstantDescriptor(1000),
    MAX_FIRESTATION_EFFECT:  MiscUtils.makeConstantDescriptor(1000)});

  this.roadEffect = this.MAX_ROAD_EFFECT;
  this.policeEffect = this.MAX_POLICESTATION_EFFECT;
  this.fireEffect = this.MAX_FIRESTATION_EFFECT;
  this.totalFunds = 0;
  this.cityTax = 7;
  this.cashFlow = 0;
  this.taxFund = 0;

  // These values denote how much money is required to fully maintain the relevant services
  this.roadMaintenanceBudget = 0;
  this.fireMaintenanceBudget = 0;
  this.policeMaintenanceBudget = 0;

  // The two fixed commitments, settled in full each January before the funding sliders
  // get a look in. Unlike the three above, these are not percent-funded: an ordinance
  // is either in force or repealed and a power contract is either signed or torn up,
  // so there is nothing sensible for a slider to mean. Both can be negative --
  // Legalised Gambling and a power export contract are income -- and the budget window
  // shows them as one combined line rather than as sliders. See ordinances.js and
  // neighbours.js.
  this.ordinanceBudget = 0;
  this.neighbourBudget = 0;

  // Percentage of budget used
  this.roadPercent = 1;
  this.firePercent = 1;
  this.policePercent = 1;

  // Cash value of spending. Should equal Math.round(_MaintenanceBudget * _Percent)
  this.roadSpend = 0;
  this.fireSpend = 0;
  this.policeSpend = 0;

  this.awaitingValues = false;
  this.autoBudget = true;
});


var saveProps = ['autoBudget', 'totalFunds', 'policePercent', 'roadPercent', 'firePercent', 'roadSpend',
                 'policeSpend', 'fireSpend', 'roadMaintenanceBudget', 'policeMaintenanceBudget',
                 'fireMaintenanceBudget', 'cityTax', 'roadEffect', 'policeEffect', 'fireEffect',
                 'ordinanceBudget', 'neighbourBudget'];

Budget.prototype.save = function(saveData) {
  for (var i = 0, l = saveProps.length; i < l; i++)
    saveData[saveProps[i]] = this[saveProps[i]];
};


Budget.prototype.load = function(saveData) {
  for (var i = 0, l = saveProps.length; i < l; i++)
    this[saveProps[i]] = saveData[saveProps[i]];

  // Saves written before ordinances and neighbour deals existed carry neither figure.
  // Both are recomputed from scratch by the next collectTax anyway; this is only so
  // that a budget window opened in the meantime has a number to print.
  if (typeof this.ordinanceBudget !== 'number')
    this.ordinanceBudget = 0;
  if (typeof this.neighbourBudget !== 'number')
    this.neighbourBudget = 0;

  this._emitEvent(Messages.AUTOBUDGET_CHANGED, this.autoBudget);
  this._emitEvent(Messages.FUNDS_CHANGED, this.totalFunds);
};


Budget.prototype.setAutoBudget = function(value) {
  this.autoBudget = value;
  this._emitEvent(Messages.AUTOBUDGET_CHANGED, this.autoBudget);
};


var RLevels = [0.7, 0.9, 1.2];
var FLevels = [1.4, 1.2, 0.8];


// What the city owes this year that no slider can reduce. Deducted before the funding
// percentages are worked out, so ordinances and power contracts have first claim on
// the money and it is roads, fire and police that get squeezed when there isn't
// enough -- which is the right way round: the contract was signed, the ordinance was
// enacted, and neither can be part-paid. Negative when the revenue-raising ordinances
// and export contracts outweigh the rest, in which case this simply adds to the pot.
Budget.prototype.fixedCommitments = function() {
  return this.ordinanceBudget + this.neighbourBudget;
};

// Calculates the best possible outcome in terms of funding the various services
// given the player's current funds and tax yield. On entry, roadPercent etc. are
// assumed to contain the desired percentage level, and taxFunds should contain the
// most recent tax collected. On exit, the *Percent members will be updated with what
// we can actually afford to spend. Returns an object containing the amount of cash
// that would be spent on each service.
Budget.prototype._calculateBestPercentages = function() {
  // How much would we be spending based on current percentages?
  // Note: the *Budget items are updated every January by collectTax
  this.roadSpend = Math.round(this.roadMaintenanceBudget * this.roadPercent);
  this.fireSpend = Math.round(this.fireMaintenanceBudget * this.firePercent);
  this.policeSpend = Math.round(this.policeMaintenanceBudget * this.policePercent);
  var total = this.roadSpend + this.fireSpend + this.policeSpend;

  // If we don't have any services on the map, we can bail early
  if (total === 0) {
    this.roadPercent = 1;
    this.firePercent = 1;
    this.policePercent = 1;
    return {road: 1, fire: 1, police: 1};
  }

  // How much are we actually going to spend?
  var roadCost = 0;
  var fireCost = 0;
  var policeCost = 0;

  var cashRemaining = this.totalFunds + this.taxFund - this.fixedCommitments();

  // Spending priorities: road, fire, police
  if (cashRemaining >= this.roadSpend)
    roadCost = this.roadSpend;
  else
    roadCost = cashRemaining;
  cashRemaining -= roadCost;

  if (cashRemaining >= this.fireSpend)
    fireCost = this.fireSpend;
  else
    fireCost = cashRemaining;
  cashRemaining -= fireCost;

  if (cashRemaining >= this.policeSpend)
    policeCost = this.policeSpend;
  else
    policeCost = cashRemaining;
  cashRemaining -= policeCost;

  if (this.roadMaintenanceBudget > 0)
    this.roadPercent = (roadCost / this.roadMaintenanceBudget).toPrecision(2) - 0;
  else
    this.roadPercent = 1;

  if (this.fireMaintenanceBudget > 0)
    this.firePercent = (fireCost / this.fireMaintenanceBudget).toPrecision(2) - 0;
  else
    this.firePercent = 1;

  if (this.policeMaintenanceBudget > 0)
    this.policePercent = (policeCost / this.policeMaintenanceBudget).toPrecision(2) - 0;
  else
    this.policePercent = 1;

  return {road: roadCost, police: policeCost, fire: fireCost};
};


// User initiated budget
Budget.prototype.doBudgetWindow = function() {
  return this.doBudgetNow(true);
};


Budget.prototype.doBudgetNow = function(fromWindow) {
  var costs = this._calculateBestPercentages();

  if (!this.autoBudget && !fromWindow) {
    this.autoBudget = false;
    this.awaitingValues = true;
    this._emitEvent(Messages.BUDGET_NEEDED);
    return;
  }

  var roadCost = costs.road;
  var policeCost = costs.police;
  var fireCost = costs.fire;
  var totalCost = roadCost + policeCost + fireCost + this.fixedCommitments();
  var cashRemaining = this.totalFunds + this.taxFund - totalCost;

  // Autobudget
  if ((cashRemaining > 0 && this.autoBudget) || fromWindow) {
    // Either we were able to fully fund services, or we have just normalised user input. Go ahead and spend.
    this.awaitingValues = false;
    this.doBudgetSpend(roadCost, fireCost, policeCost);
    return;
  }

  // Uh-oh. Not enough money. Make this the user's problem.
  // They don't know it yet, but they're about to get a budget window.
  this.setAutoBudget(false);
  this.awaitingValues = true;
  this._emitEvent(Messages.BUDGET_NEEDED);
  this._emitEvent(Messages.NO_MONEY);
};


Budget.prototype.doBudgetSpend = function(roadValue, fireValue, policeValue) {
  this.roadSpend = roadValue;
  this.fireSpend = fireValue;
  this.policeSpend = policeValue;
  var total = this.roadSpend + this.fireSpend + this.policeSpend + this.fixedCommitments();

  this.spend(-(this.taxFund - total));
  this.updateFundEffects();
};


Budget.prototype.updateFundEffects = function() {
  // The caller is assumed to have correctly set the percentage spend
  this.roadSpend = Math.round(this.roadMaintenanceBudget * this.roadPercent);
  this.fireSpend = Math.round(this.fireMaintenanceBudget * this.firePercent);
  this.policeSpend = Math.round(this.policeMaintenanceBudget * this.policePercent);

  // Update the effect this level of spending will have on infrastructure deterioration
  this.roadEffect = this.MAX_ROAD_EFFECT;
  this.policeEffect = this.MAX_POLICESTATION_EFFECT;
  this.fireEffect = this.MAX_FIRESTATION_EFFECT;

  if (this.roadMaintenanceBudget > 0)
    this.roadEffect = Math.floor(this.roadEffect * this.roadSpend / this.roadMaintenanceBudget);

  if (this.fireMaintenanceBudget > 0)
    this.fireEffect = Math.floor(this.fireEffect * this.fireSpend / this.fireMaintenanceBudget);

  if (this.policeMaintenanceBudget > 0)
    this.policeEffect = Math.floor(this.policeEffect * this.policeSpend / this.policeMaintenanceBudget);
};


Budget.prototype.collectTax = function(gameLevel, census, ordinances, neighbours) {
  this.cashFlow = 0;

  // How much would it cost to fully fund every service?
  this.policeMaintenanceBudget = census.policeStationPop * policeMaintenanceCost;
  this.fireMaintenanceBudget = census.fireStationPop * fireMaintenanceCost;

  var roadCost = census.roadTotal * roadMaintenanceCost;
  var railCost = census.railTotal * railMaintenanceCost;
  this.roadMaintenanceBudget = Math.floor((roadCost + railCost) * RLevels[gameLevel]);

  this.taxFund = Math.floor(Math.floor(census.totalPop * census.landValueAverage / 120) * this.cityTax * FLevels[gameLevel]);

  // The year's fixed commitments, worked out after the tax take is known, because
  // settleYear has to decide whether the city can actually cover its power bills --
  // and a defaulted bill is what costs a mayor their standing with the neighbours.
  // Both arguments are optional so that a Budget can still be driven on its own.
  this.ordinanceBudget = ordinances ? ordinances.getAnnualCost(census) : 0;
  this.neighbourBudget = neighbours ? neighbours.settleYear(this) : 0;

  if (census.totalPop > 0) {
    this.cashFlow = this.taxFund - (this.policeMaintenanceBudget + this.fireMaintenanceBudget +
                                    this.roadMaintenanceBudget + this.fixedCommitments());
    this.doBudgetNow(false);
  } else {
    // We don't want roads etc deteriorating when population hasn't yet been established
    // (particularly early game)
    this.roadEffect   = this.MAX_ROAD_EFFECT;
    this.policeEffect = this.MAX_POLICESTATION_EFFECT;
    this.fireEffect   = this.MAX_FIRESTATION_EFFECT;
  }
};


Budget.prototype.setTax = function(amount) {
  if (amount === this.cityTax)
    return;

  this.cityTax = amount;
};


Budget.prototype.setFunds = function(amount) {
  if (amount === this.totalFunds)
    return;

  this.totalFunds = Math.max(0, amount);

  this._emitEvent(Messages.FUNDS_CHANGED, this.totalFunds);
  if (this.totalFunds === 0)
    this._emitEvent(Messages.NO_MONEY);
};


Budget.prototype.spend = function(amount) {
  this.setFunds(this.totalFunds - amount);
};


Budget.prototype.shouldDegradeRoad = function() {
  return this.roadEffect < Math.floor(15 * this.MAX_ROAD_EFFECT / 16);
};


export { Budget };
