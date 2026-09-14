/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 *
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details. Alternatively,
 * consult http://micropolisjs.graememcc.co.uk/LICENSE and
 * http://micropolisjs.graememcc.co.uk/COPYING
 *
 */

// The dev menu's switch, and the little the main bundle has to know about it.
//
// `?dev=1` turns the menu on and remembers it in this browser; `?dev=0` turns it off
// again -- the same switch the B0r3d RPG and z0mbie crystal use. The menu itself
// (src/dev/) is a separate webpack chunk that micropolis.js only fetches while this is
// on, so a normal visit never downloads any of it. Everything here is deliberately
// tiny for the same reason: it ships to every player.
//
// Anything the menu does that changes a city goes through Game.markCheatsUsed, the
// same one-way flag the Settings cheat menu trips, so a city the dev menu has touched
// can never reach the leaderboard.

var DEV_KEY = 'b0r3d_city_dev';

// One reload's worth of "launch this straight away", written by the dev menu before it
// reloads the page. A running Game can't be torn down (see handleMainMenuRequest in
// game.js), so starting a different city from inside one means reloading and having
// the splash screen launch it the moment it's ready. sessionStorage rather than
// localStorage so a crash mid-launch can't trap the tab in a loop forever.
var AUTOSTART_KEY = 'b0r3d_city_dev_autostart';

var enabled = (function() {
  try {
    var q = new URLSearchParams(window.location.search).get('dev');
    if (q === '1')
      window.localStorage.setItem(DEV_KEY, '1');
    if (q === '0')
      window.localStorage.removeItem(DEV_KEY);
    return window.localStorage.getItem(DEV_KEY) === '1';
  } catch (e) {
    return false;
  }
})();

var currentGame = null;
var currentSplash = null;
var gameListeners = [];


var DevMode = {
  DEV_KEY: DEV_KEY,

  isEnabled: function() {
    return enabled;
  },

  // Called by splashScreen.js for every Game it launches, dev menu on or not. Only
  // does anything with the dev menu on: remembers the game for the menu, and exposes
  // the console API, which used to be on every page -- see TODO.md's leaderboard note.
  gameStarted: function(game) {
    if (!enabled)
      return;

    currentGame = game;

    window.b0r3dCheats = {
      game: game,
      addFunds: function(amount) { game.cheatAddFunds(amount); },
      setFreeBuild: function(value) { game.cheatSetFreeBuild(value); },
      triggerDisaster: function(name) { game.cheatTriggerDisaster(name); },
      getState: function() { return game.cheatGetState(); }
    };

    gameListeners.forEach(function(listener) {
      listener(game);
    });
  },

  getGame: function() {
    return currentGame;
  },

  onGameStarted: function(listener) {
    gameListeners.push(listener);
    if (currentGame)
      listener(currentGame);
  },

  setSplash: function(splash) {
    if (enabled)
      currentSplash = splash;
  },

  getSplash: function() {
    return currentGame ? null : currentSplash;
  },

  setAutostart: function(request) {
    try {
      window.sessionStorage.setItem(AUTOSTART_KEY, JSON.stringify(request));
      return true;
    } catch (e) {
      return false;
    }
  },

  // Read once and cleared in the same breath, so it launches exactly one city.
  takeAutostart: function() {
    if (!enabled)
      return null;

    try {
      var raw = window.sessionStorage.getItem(AUTOSTART_KEY);
      window.sessionStorage.removeItem(AUTOSTART_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
};


export { DevMode };
