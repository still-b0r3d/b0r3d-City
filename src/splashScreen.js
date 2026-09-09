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

import { Config } from './config.js';
import { Game } from './game.js';
import { GameMap } from './gameMap.js';
import { reflowTileValue } from './legacyTileFormat.js';
import { MapGenerator } from './mapGenerator.js';
import { MiscUtils } from './miscUtils.js';
import { SCENARIOS } from './scenarios.js';
import { Simulation } from './simulation.js';
import { SplashCanvas } from './splashCanvas.js';
import { Storage } from './storage.js';
import { Text } from './text.js';

// The 8 original Micropolis scenario cities, converted from the classic
// binary .cty format (see scripts/convert-scenario-cities.mjs) into flat
// JSON tile arrays under scenarioCities/. These are dropped in as starting
// maps for freeform play -- no objectives or scripted events, just the
// classic map layouts to build on (or bulldoze).
var SCENARIO_CITIES = [
  { slug: 'dullsville', name: 'Dullsville' },
  { slug: 'san-francisco', name: 'San Francisco' },
  { slug: 'hamburg', name: 'Hamburg' },
  { slug: 'bern', name: 'Bern' },
  { slug: 'tokyo', name: 'Tokyo' },
  { slug: 'detroit', name: 'Detroit' },
  { slug: 'boston', name: 'Boston' },
  { slug: 'rio-de-janeiro', name: 'Rio de Janeiro' }
];

/*
 *
 * The SplashScreen is the first screen the player will see on launch. It is responsible for map generation,
 * placing UI on screen to allow the player to select a map or load a game, and finally launching the game.
 * This should not be called until the tiles and sprites have been loaded.
 *
 */

var onresize = null;


// If the window is initially too small, try and relaunch if it gets bigger.
// All three arguments have to be carried through: this used to pass only two, so the
// sprite sheet arrived as snowTileSet and the relaunched splash screen got `undefined`
// for its sprites -- meaning the recovery path built a game that couldn't draw a single
// sprite, which is worse than the too-small screen it was recovering from.
var makeResizeListener = function(tileSet, snowTileSet, spriteSheet) {
  return function(e) {
    $(window).off('resize');
    var s = new SplashScreen(tileSet, snowTileSet, spriteSheet);
  };
};


function SplashScreen(tileSet, snowTileSet, spriteSheet) {
  // We don't launch the game if the screen is too small, however, we should retain the right to do so
  // should the situation change...
  if ($('#tooSmall').is(':visible')) {
    onresize = makeResizeListener(tileSet, snowTileSet, spriteSheet);
    $(window).on('resize', onresize);
    return;
  }

  this.tileSet = tileSet;
  this.snowTileSet = snowTileSet;
  this.spriteSheet = spriteSheet;
  this.map = MapGenerator();

  // Set up listeners on buttons. When play is clicked, we will move on to get the player's desired
  // difficulty level and city name before launching the game properly
  $('#splashGenerate').click(regenerateMap.bind(this));
  $('#splashPlay').click(acquireNameAndDifficulty.bind(this));
  $('#splashLoad').click(showLoadList.bind(this));
  $('#loadBack').click(hideLoadList.bind(this));
  $('#splashScenarios').click(showScenarioList.bind(this));
  $('#scenarioBack').click(hideScenarioList.bind(this));
  $('#splashFullScenarios').click(showFullScenarioList.bind(this));
  $('#fullScenarioBack').click(hideFullScenarioList.bind(this));

  // Conditionally enable load/save buttons
  $('#saveRequest').prop('disabled', !Storage.canStore);
  $('#splashLoad').prop('disabled', !(Storage.canStore && Storage.listSaves().length > 0));

  // Paint the minimap
  this.splashCanvas = new SplashCanvas('splashContainer', tileSet);
  this.splashCanvas.paint(this.map);

  // Let's get some bits on screen!
  $('.awaitGeneration').toggle();
  $('#splashPlay').focus();
}


// Generate a new map at the user's request, and paint it
var regenerateMap = function(e) {
  e.preventDefault();

  this.map = MapGenerator();
  this.splashCanvas.paint(this.map);
};


// Exposes a small console-accessible cheat API for development/testing use,
// mirroring the in-game Cheat Menu actions. See devtools console:
// window.b0r3dCheats.addFunds(100000), .setFreeBuild(true),
// .triggerDisaster('fire'|'flood'|'tornado'|'monster'|'meltdown'|'crash'),
// .getState()
var exposeCheatAPI = function(g) {
  window.b0r3dCheats = {
    game: g,
    addFunds: function(amount) { g.cheatAddFunds(amount); },
    setFreeBuild: function(enabled) { g.cheatSetFreeBuild(enabled); },
    triggerDisaster: function(name) { g.cheatTriggerDisaster(name); },
    getState: function() { return g.cheatGetState(); }
  };
};


var escapeHtml = MiscUtils.escapeHtml;
var describeSave = function(entry) { return MiscUtils.describeSave(entry, Text); };


// self is the SplashScreen instance (its tileSet/snowTileSet/spriteSheet are
// needed to launch a Game once a save is picked) -- threaded through explicitly
// rather than relying on jQuery's `this`, since rows get rebound after a delete.
var renderLoadList = function(self) {
  var saves = Storage.listSaves();

  if (!saves.length) {
    $('#loadRows').html('<tr><td colspan="4">No saves yet.</td></tr>');
    return;
  }

  var rows = saves.map(function(entry) {
    return '<tr><td>' + escapeHtml(entry.name) + '</td><td>' + escapeHtml(describeSave(entry)) +
      '</td><td><button type="button" class="loadRowLoad" data-id="' + escapeHtml(entry.id) + '">Load</button></td>' +
      '<td><button type="button" class="cancel loadRowDelete" data-id="' + escapeHtml(entry.id) + '">Delete</button></td></tr>';
  });

  $('#loadRows').html(rows.join(''));

  $('.loadRowLoad').on('click', function(e) {
    loadSave.call(self, e);
  });

  $('.loadRowDelete').on('click', function() {
    var id = $(this).data('id');
    if (window.confirm('Delete this save? This cannot be undone.')) {
      Storage.deleteSave(id);
      renderLoadList(self);
      $('#splashLoad').prop('disabled', !(Storage.canStore && Storage.listSaves().length > 0));
    }
  });
};


var showLoadList = function(e) {
  e.preventDefault();
  renderLoadList(this);
  $('#splash').toggle();
  $('#loadList').toggle();
};


var hideLoadList = function(e) {
  e.preventDefault();
  $('#loadList').toggle();
  $('#splash').toggle();
};


var renderScenarioList = function(self) {
  var rows = SCENARIO_CITIES.map(function(city) {
    return '<tr><td>' + escapeHtml(city.name) + '</td><td><button type="button" class="scenarioRowPlay" data-slug="' +
      escapeHtml(city.slug) + '" data-name="' + escapeHtml(city.name) + '">Play</button></td></tr>';
  });

  $('#scenarioRows').html(rows.join(''));

  $('.scenarioRowPlay').on('click', function(e) {
    playScenario.call(self, e);
  });
};


var showScenarioList = function(e) {
  e.preventDefault();
  renderScenarioList(this);
  $('#splash').toggle();
  $('#scenarioList').toggle();
};


var hideScenarioList = function(e) {
  e.preventDefault();
  $('#scenarioList').toggle();
  $('#splash').toggle();
};


// Fetches one of scenarioCities/*.json's flat tile arrays and builds a
// GameMap from it. Shared by freeform Classic Cities and full Scenario mode
// below -- both start from the same map data, they just differ in what
// happens after the map is handed off.
//
// Those files hold raw packed tile values straight out of the original .cty binaries
// (see scripts/convert-scenario-cities.mjs), so they are permanently in the classic
// bit layout and have to be reflowed to the current one on the way in -- exactly as
// storage.js does for pre-2026-09-08 saves, and for the same reason. Without it 42%
// of a city's tiles silently decode as some other tile, and the map scan walks off
// the end of a zone-offset table on the first industrial zone it meets, taking the
// whole game down before it ever paints a frame.
var loadCityMap = function(slug) {
  return fetch('scenarioCities/' + slug + '.json')
    .then(function(response) {
      if (!response.ok)
        throw new Error('Failed to fetch scenario city ' + slug + ': ' + response.status);
      return response.json();
    })
    .then(function(data) {
      var map = new GameMap(data.width, data.height);
      for (var i = 0, l = data.map.length; i < l; i++)
        map.setTileValue(i % data.width, Math.floor(i / data.width), reflowTileValue(data.map[i]));
      return map;
    });
};


// Fetches a classic scenario city's tile data and builds a GameMap from it, then
// hands off to the same name/difficulty flow as "Play this map" -- these are
// freeform starting maps, not scripted scenarios with objectives.
var playScenario = function(e) {
  e.preventDefault();

  var slug = $(e.currentTarget).data('slug');
  var name = $(e.currentTarget).data('name');

  loadCityMap(slug)
    .then(function(map) {
      this.map = map;
      // Restore the same pre-state acquireNameAndDifficulty expects when called
      // from #splashPlay: #splash visible, everything else hidden.
      $('#scenarioList').toggle();
      $('#splash').toggle();
      $('#nameForm').val(name);
      acquireNameAndDifficulty.call(this, e);
    }.bind(this))
    .catch(function(err) {
      console.error(err);
      window.alert("Sorry, couldn't load that city. Please try again.");
    });
};


var renderFullScenarioList = function(self) {
  var rows = SCENARIOS.map(function(scenario) {
    return '<tr><td>' + escapeHtml(scenario.name) + ' <span class="scenarioYear">(' + scenario.year + ')</span></td>' +
      '<td class="scenarioBlurb">' + escapeHtml(scenario.blurb) + '</td>' +
      '<td><button type="button" class="fullScenarioRowPlay" data-slug="' + escapeHtml(scenario.slug) + '">Play</button></td></tr>';
  });

  $('#fullScenarioRows').html(rows.join(''));

  $('.fullScenarioRowPlay').on('click', function(e) {
    playFullScenario.call(self, e);
  });
};


var showFullScenarioList = function(e) {
  e.preventDefault();
  renderFullScenarioList(this);
  $('#splash').toggle();
  $('#fullScenarioList').toggle();
};


var hideFullScenarioList = function(e) {
  e.preventDefault();
  $('#fullScenarioList').toggle();
  $('#splash').toggle();
};


// Same map-loading path as Classic Cities, but stamps the chosen scenario
// definition onto the map so Game (game.js) can hand it to
// ScenarioController once the game actually launches.
var playFullScenario = function(e) {
  e.preventDefault();

  var slug = $(e.currentTarget).data('slug');
  var scenario = SCENARIOS.filter(function(s) { return s.slug === slug; })[0];
  if (!scenario)
    return;

  loadCityMap(scenario.mapSlug)
    .then(function(map) {
      map.scenario = scenario;
      this.map = map;
      $('#fullScenarioList').toggle();
      $('#splash').toggle();
      $('#nameForm').val(scenario.name);
      acquireNameAndDifficulty.call(this, e);
    }.bind(this))
    .catch(function(err) {
      console.error(err);
      window.alert("Sorry, couldn't load that scenario. Please try again.");
    });
};


// Fetches the chosen save's game data from the storage manager, and launches the game.
// We won't return from here.
var loadSave = function(e) {
  e.preventDefault();

  var savedGame = Storage.getSave($(e.currentTarget).data('id'));
  if (savedGame === null)
    return;

  // Remove installed event listeners
  $('#splashLoad').off('click');
  $('#splashGenerate').off('click');
  $('#splashPlay').off('click');
  $('#loadBack').off('click');

  // Hide the splashscreen UI
  $('#loadList').toggle();

  // Launch
  var g = new Game(savedGame, this.tileSet, this.snowTileSet, this.spriteSheet, Simulation.LEVEL_EASY);
  exposeCheatAPI(g);
};


// After a map has been selected, call this function to display a form asking the user for
// a city name and difficulty level.
var acquireNameAndDifficulty = function(e) {
  e.preventDefault();

  // Remove the initial event listeners
  $('#splashLoad').off('click');
  $('#splashGenerate').off('click');
  $('#splashPlay').off('click');

  // Get rid of the initial splash screen
  $('#splash').toggle();

  // As a convenience, the city name is not mandatory in debug mode
  if (Config.debug)
    $('#nameForm').removeAttr('required');

  // When the form is submitted, we'll be ready to launch the game
  $('#playForm').submit(play.bind(this));

  // Display the name and difficulty form
  $('#start').toggle();
  $('#nameForm').focus();
};


// This function should be called after the name/difficulty form has been submitted. The game will now be launched
// with the map selected earlier.
var play = function(e) {
  e.preventDefault();

  // As usual, uninstall event listeners, and hide the UI
  $('#playForm').off('submit');
  $('#start').toggle();

  // What values did the player specify?
  var difficulty = $('.difficulty:checked').val() - 0;
  var name = $('#nameForm').val();

  // Launch a new game
  var g = new Game(this.map, this.tileSet, this.snowTileSet, this.spriteSheet, difficulty, name);
  exposeCheatAPI(g);
};


export { SplashScreen };
