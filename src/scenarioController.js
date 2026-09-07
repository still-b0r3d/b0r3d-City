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

import * as Messages from './messages.ts';

// Drives one scenario's objective/deadline/scripted-disaster once a Game has
// been launched with a scenario attached (see scenarios.js and
// splashScreen.js's playFullScenario). Lives for the lifetime of that one
// playthrough: it wires itself up to the simulation's own DATE_UPDATED/
// POPULATION_UPDATED events in the constructor, and tears that wiring down
// the moment the scenario is won or lost.
var SCRIPTED_DISASTER_DELAY_MS = 1500;

function ScenarioController(game, scenario) {
  this.game = game;
  this.scenario = scenario;
  this._finished = false;
  this._everHadPopulation = false;

  this._onDateUpdated = this._onDateUpdated.bind(this);
  this._onPopulationUpdated = this._onPopulationUpdated.bind(this);

  var simulation = game.simulation;
  simulation.setStartingYear(scenario.year);
  simulation.addEventListener(Messages.DATE_UPDATED, this._onDateUpdated);
  simulation.addEventListener(Messages.POPULATION_UPDATED, this._onPopulationUpdated);

  if (scenario.disaster) {
    this._disasterTimeout = setTimeout(this._triggerDisaster.bind(this), SCRIPTED_DISASTER_DELAY_MS);
  }
}


ScenarioController.prototype._triggerDisaster = function() {
  var simulation = this.game.simulation;

  switch (this.scenario.disaster.type) {
    case 'earthquake':
      simulation.disasterManager.makeEarthquake();
      break;

    case 'fire':
      // makeFire() only ignites the first flammable tile it happens to find
      // in up to 40 random tries, so one call is a single house fire -- a
      // firebombed city needs several independent fires going at once.
      for (var i = 0; i < 6; i++)
        simulation.disasterManager.makeFire();
      break;

    case 'flood':
      simulation.disasterManager.makeFlood();
      break;

    case 'meltdown':
      simulation.disasterManager.makeMeltdown();
      break;

    case 'monster':
    case 'monsterWaves':
      simulation.spriteManager.makeMonster();
      break;
  }
};


ScenarioController.prototype._onPopulationUpdated = function(population) {
  if (this._finished)
    return;

  if (population > 0)
    this._everHadPopulation = true;
  else if (this._everHadPopulation)
    this._finish(false, 'wipeout');
};


ScenarioController.prototype._onDateUpdated = function(date) {
  if (this._finished)
    return;

  var yearsElapsed = date.year - this.scenario.year;
  var disaster = this.scenario.disaster;

  // Recurring waves (Zombies): DATE_UPDATED fires every month, so only
  // re-trigger on the year boundary.
  if (disaster && disaster.type === 'monsterWaves' && date.month === 0 &&
      yearsElapsed > 0 && yearsElapsed % disaster.everyYears === 0) {
    this._triggerDisaster();
  }

  // DATE_UPDATED fires once immediately on load, before the city's had a
  // single real simulation pass -- trafficAverage/crimeAverage/cityScore are
  // all still at their just-initialised defaults at that point, which would
  // let a 'below' objective (or a low 'score' target) win the instant the
  // city loads. Give it a year of real simulation before checking anything.
  if (yearsElapsed < 1)
    return;

  var met = this._objectiveMet();

  if (!this.scenario.surviveToDeadline && met) {
    this._finish(true, 'objective');
    return;
  }

  if (yearsElapsed >= this.scenario.deadlineYears)
    this._finish(this.scenario.surviveToDeadline && met, 'deadline');
};


ScenarioController.prototype._objectiveMet = function() {
  var simulation = this.game.simulation;
  var objective = this.scenario.objective;

  switch (objective.type) {
    case 'population':
      return simulation.evaluation.cityPop >= objective.target;

    case 'score':
      return simulation.evaluation.cityScore >= objective.target;

    case 'below':
      return simulation.getCensus()[objective.metric] <= objective.target;

    default:
      return false;
  }
};


ScenarioController.prototype._finish = function(won, reason) {
  if (this._finished)
    return;

  this._finished = true;
  clearTimeout(this._disasterTimeout);

  var game = this.game;
  var simulation = game.simulation;
  simulation.removeEventListener(Messages.DATE_UPDATED, this._onDateUpdated);
  simulation.removeEventListener(Messages.POPULATION_UPDATED, this._onPopulationUpdated);

  if (!game.isPaused)
    game.handlePause();

  game._showCongrats(this._buildMessage(won, reason), true);
};


ScenarioController.prototype._buildMessage = function(won, reason) {
  var scenario = this.scenario;
  var simulation = this.game.simulation;
  var pop = simulation.evaluation.cityPop;
  var score = simulation.evaluation.cityScore;
  var year = simulation.getDate().year;

  var headline;
  if (won)
    headline = scenario.flavorWin;
  else if (reason === 'wipeout')
    headline = scenario.name + ' has fallen. ' + scenario.flavorLose;
  else
    headline = scenario.flavorLose;

  return headline + ' (' + year + ' — population ' + pop + ', score ' + score + ')';
};


export { ScenarioController };
