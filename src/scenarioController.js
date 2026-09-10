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

import $ from "jquery";

import * as Messages from './messages.ts';

// Drives one scenario's objective/deadline/scripted-disaster once a Game has
// been launched with a scenario attached (see scenarios.js and
// splashScreen.js's playFullScenario). Lives for the lifetime of that one
// playthrough: it wires itself up to the simulation's own DATE_UPDATED/
// POPULATION_UPDATED events in the constructor, and tears that wiring down
// the moment the scenario is won or lost.
//
// A playthrough now survives a save/load: everything below that can't be
// recomputed from the map is written out by save() and handed back through the
// constructor's savedState (see game.js). Without it, saving mid-scenario
// quietly threw away the objective, the deadline and the year, and handed back
// an ordinary freeform city.
var SCRIPTED_DISASTER_DELAY_MS = 1500;

// Names for the census fields a 'below' objective can target. Only these two are
// used today; anything else falls back to the raw field name rather than being a
// silent blank in the panel.
var METRIC_LABELS = {
  trafficAverage: 'Traffic',
  crimeAverage: 'Crime',
  pollutionAverage: 'Pollution'
};

var scenarioPanelID = '#scenarioInfo';
var scenarioNameID = '#scenarioName';
var scenarioProgressID = '#scenarioProgress';
var scenarioDeadlineID = '#scenarioDeadline';


var formatNumber = function(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};


function ScenarioController(game, scenario, savedState) {
  this.game = game;
  this.scenario = scenario;
  this._finished = false;
  this._everHadPopulation = false;

  // Each scenario's scripted disaster is a one-off that happens *to* you as the city
  // loads, not a recurring hazard -- so a restored game must not stage the earthquake
  // you already dug yourself out of all over again.
  this._openingDisasterDone = false;

  // Zombies' recurring waves are derived from the date rather than a timer, so they
  // need no state of their own except a note of the last year one actually fired:
  // DATE_UPDATED fires again immediately on load, and without this, reloading a save
  // made in January of a wave year would summon a second horde on the spot.
  this._lastWaveYear = null;

  if (savedState) {
    this._finished = !!savedState.finished;
    this._everHadPopulation = !!savedState.everHadPopulation;
    this._openingDisasterDone = !!savedState.openingDisasterDone;
    this._lastWaveYear = savedState.lastWaveYear === undefined ? null : savedState.lastWaveYear;
  }

  this._onDateUpdated = this._onDateUpdated.bind(this);
  this._onPopulationUpdated = this._onPopulationUpdated.bind(this);

  var simulation = game.simulation;

  // Only on a fresh start: a restored game already has its own (authoritative)
  // starting year back from the save, and stamping the scenario's over the top would
  // be harmless today only because they happen to agree.
  if (!savedState)
    simulation.setStartingYear(scenario.year);

  this._showPanel();

  // A scenario that already ended before the save was made stays ended: no listeners,
  // no timers, just the panel left showing how it finished.
  if (this._finished) {
    this._renderPanel(true);
    return;
  }

  simulation.addEventListener(Messages.DATE_UPDATED, this._onDateUpdated);
  simulation.addEventListener(Messages.POPULATION_UPDATED, this._onPopulationUpdated);

  if (scenario.disaster && !this._openingDisasterDone)
    this._disasterTimeout = setTimeout(this._triggerOpeningDisaster.bind(this), SCRIPTED_DISASTER_DELAY_MS);

  this._renderPanel();
}


// Everything a playthrough can't rebuild by looking at the map. Merged into the same
// flat save object every other component writes into (see Game.save).
ScenarioController.prototype.save = function(saveData) {
  saveData.scenario = {
    slug: this.scenario.slug,
    finished: this._finished,
    everHadPopulation: this._everHadPopulation,
    openingDisasterDone: this._openingDisasterDone,
    lastWaveYear: this._lastWaveYear
  };
};


ScenarioController.prototype._triggerOpeningDisaster = function() {
  this._openingDisasterDone = true;
  this._disasterTimeout = null;
  this._triggerDisaster();
};


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

    // The Zombies scenario used to be listed under monsterWaves above, which meant the
    // thing arriving every five years was Godzilla with a different name on the splash
    // screen. It has its own disaster now -- see zombieSprite.js.
    case 'zombieWaves':
      simulation.spriteManager.makeZombies();
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

  // Recurring waves (Zombies): DATE_UPDATED fires every month, so only re-trigger on
  // the year boundary, and only once for any given year. Any disaster type ending in
  // "Waves" recurs -- keeps monsterWaves working for anything that still wants it while
  // zombieWaves gets the same treatment without a second condition here.
  var recurring = disaster && /Waves$/.test(disaster.type);

  if (recurring && date.month === 0 &&
      yearsElapsed > 0 && yearsElapsed % disaster.everyYears === 0 &&
      this._lastWaveYear !== date.year) {
    this._lastWaveYear = date.year;
    this._triggerDisaster();
  }

  this._renderPanel();

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


// The objective's current value, in the same units as objective.target -- shared by
// the win check and the progress readout, so the number the player is watching is
// literally the one being tested.
ScenarioController.prototype._objectiveValue = function() {
  var simulation = this.game.simulation;
  var objective = this.scenario.objective;

  switch (objective.type) {
    case 'population':
      return simulation.evaluation.cityPop;

    case 'score':
      return simulation.evaluation.cityScore;

    case 'below':
      return simulation.getCensus()[objective.metric];

    default:
      return null;
  }
};


ScenarioController.prototype._objectiveMet = function() {
  var objective = this.scenario.objective;
  var value = this._objectiveValue();

  if (value === null)
    return false;

  return objective.type === 'below' ? value <= objective.target : value >= objective.target;
};


ScenarioController.prototype._showPanel = function() {
  $(scenarioPanelID).show();
  $(scenarioNameID).text(this.scenario.name);
};


// What's being measured, in one word, so the progress line reads as a sentence.
ScenarioController.prototype._objectiveLabel = function() {
  var objective = this.scenario.objective;

  switch (objective.type) {
    case 'population':
      return 'Pop';

    case 'score':
      return 'Score';

    case 'below':
      return METRIC_LABELS[objective.metric] || objective.metric;

    default:
      return '';
  }
};


// The whole point of the panel: the goal and the clock, both live, in the three lines
// Town Info can spare. Before this, a scenario's objective and deadline were shown once
// on the splash screen and then never again -- a timed challenge with no way to read
// either the target or the time remaining while playing it.
ScenarioController.prototype._renderPanel = function(finished) {
  var objective = this.scenario.objective;
  var value = this._objectiveValue();
  var deadlineYear = this.scenario.year + this.scenario.deadlineYears;

  if (value !== null) {
    // "Score 606 / 650", or "Traffic 112 / under 80" where lower is the goal.
    var target = (objective.type === 'below' ? 'under ' : '') + formatNumber(objective.target);
    $(scenarioProgressID).text(this._objectiveLabel() + ' ' + formatNumber(value) + ' / ' + target);
  }

  if (finished || this._finished) {
    $(scenarioDeadlineID).text('Scenario over');
    return;
  }

  // Zombies wins by still being there at the end rather than by hitting the target
  // early, so it gets "Survive to" instead of a deadline to beat.
  var yearsLeft = Math.max(0, deadlineYear - this.game.simulation.getDate().year);
  $(scenarioDeadlineID).text((this.scenario.surviveToDeadline ? 'Survive to ' : 'By ') + deadlineYear +
    ' · ' + (yearsLeft === 1 ? '1 year left' : yearsLeft + ' years left'));
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

  this._renderPanel(true);

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
