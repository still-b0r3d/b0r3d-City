/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 *
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details. Alternatively,
 * consult http://micropolisjs.graememcc.co.uk/LICENSE and
 * http://micropolisjs.graememcc.co.uk/COPYING
 *
 */

// The little the main bundle knows about the dev menu (v0.89.7).
//
// The menu is CITY HALL now, this game's face in b0r3d.org's admin mode: built on its
// own (webpack.admin.config.js) into the site's _admin/games/city.js, which Cloudflare
// Access only serves to the owner's login, and loaded by the site's js/devmode.js. The
// public ?dev=1 switch it used to have is gone. What's left here is what it needs from
// the running page -- the Game, the splash screen, and a one-reload "launch this" -- so
// it's always on, and deliberately tiny: it ships to every player.
//
// Anything the menu does that changes a city goes through Game.markCheatsUsed, the
// same one-way flag the Settings cheat menu trips, so a city it has touched stays off
// the public leaderboard (with admin mode attached, the High Scores window asks the
// owner instead -- see highScoreWindow.js).

// One reload's worth of "launch this straight away", written by the menu before it
// reloads the page. A running Game can't be torn down (see handleMainMenuRequest in
// game.js), so starting a different city from inside one means reloading and having
// the splash screen launch it the moment it's ready. sessionStorage rather than
// localStorage so a crash mid-launch can't trap the tab in a loop forever.
var AUTOSTART_KEY = 'b0r3d_city_dev_autostart';

var currentGame = null;
var currentSplash = null;
var gameListeners = [];


var DevMode = {
  // Called by splashScreen.js for every Game it launches: remembers it for the menu,
  // and tells admin mode (when the owner's login loaded it) a new city began, for its
  // "post this city?" question.
  gameStarted: function(game) {
    currentGame = game;

    if (window.b0r3dAdmin)
      window.b0r3dAdmin.runStart('city');

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

  // Read once and cleared in the same breath, so it launches exactly one city. Only the
  // menu writes it, into this tab's own sessionStorage.
  takeAutostart: function() {
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
