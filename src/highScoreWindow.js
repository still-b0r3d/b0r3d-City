/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 *
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details. Alternatively,
 * consult http://micropolisjs.graememcc.co.uk/LICENSE and
 * http://micropolisjs.graememcc.co.uk/COPYING
 *
 */

import $ from "jquery";

import { HIGH_SCORE_WINDOW_CLOSED } from './messages.ts';
import { MiscUtils } from './miscUtils.js';
import { ModalWindow } from './modalWindow.js';
import { SiteEnv } from './siteEnv.js';

// still.b0r3d.org's shared per-game leaderboard backend (see GAMES in
// still-app.py) only allows [a-z0-9_]+ in its game-key URL segment, so this
// stays the underscored `sim_b0r3d_city` key from before the game was
// renamed to "b0r3d-city" -- purely an internal identifier now, kept as-is
// to avoid a backend/data migration for no user-visible benefit. SiteEnv
// picks the main-site vs beta-build key so the two deployments' scores
// never mix (see SiteEnv.leaderboardKey).
var GAME_KEY = SiteEnv.leaderboardKey();

// The leaderboard backend always lives on still.b0r3d.org regardless of
// which of the two sites is currently serving this game -- admin
// moderation of both boards happens there too, since that's where the
// data actually is. An absolute URL works whether this happens to be
// same-origin (the beta build, served from still.b0r3d.org itself) or
// cross-origin (the main site); CORS for the main site's origin is
// already set up on that backend for the shared visit counter.
var API_BASE = 'https://still.b0r3d.org/api/';

// Run tokens (v0.89.8). The backend hands out a token when a run begins
// (POST /api/<game>/start) and wants it back with the score: a token is good
// for one post, says when the run began, and the backend refuses a score sent
// under two seconds after it. It can't prove a city was played, only rule out
// the instant scripted post. A city spans sessions and a token lives twelve
// hours, so one is minted whenever a Game is built (a new city or a loaded
// one) and again when this window opens if the last one has aged out. Only
// the live sites ask: a copy anywhere else could never post one, and would
// only make the backend hand out tokens nobody uses.
var TOKEN_HOSTS = ['b0r3d.org', 'www.b0r3d.org', 'still.b0r3d.org'];
var TOKEN_FRESH_MS = 11 * 3600 * 1000;
var TOKEN_MIN_AGE_MS = 2500;
var runToken = null;

var startRun = function() {
  if (TOKEN_HOSTS.indexOf(window.location.hostname) === -1)
    return;
  runToken = null;
  $.ajax({url: API_BASE + GAME_KEY + '/start', method: 'POST'}).done(function(data) {
    if (data && typeof data.runToken === 'string')
      runToken = {token: data.runToken, at: Date.now()};
  });
};

var freshToken = function() {
  return runToken && Date.now() - runToken.at < TOKEN_FRESH_MS ? runToken : null;
};

// The backend's "level" field is a plain integer (shared schema with the
// other arcade games' numeric levels), so the city's evaluation class name
// is stored/sent as a 1-6 ordinal and translated back to its label here.
var CLASS_LABELS = ['VILLAGE', 'TOWN', 'CITY', 'CAPITAL', 'METROPOLIS', 'MEGALOPOLIS'];

var HighScoreWindow = ModalWindow(function() {
  // One of these per Game, so this is a run starting: ask for its token (above)
  startRun();
  $(highScoreCancelID).on('click', cancel.bind(this));
  $(highScoreFormID).on('submit', submit.bind(this));

  $(highScoreNameID).on('input', function() {
    var cleaned = $(highScoreNameID).val().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
    $(highScoreNameID).val(cleaned);
  });
});


var highScoreCancelID = '#highScoreCancel';
var highScoreFormID = '#highScoreSubmitForm';
var highScoreNameID = '#highScoreName';
var highScoreStatusID = '#highScoreStatus';
var highScoreRowsID = '#highScoreRows';
var highScoreCurrentScoreID = '#highScoreCurrentScore';
var highScoreCurrentClassID = '#highScoreCurrentClass';
var highScoreCurrentPopulationID = '#highScoreCurrentPopulation';


var escapeHtml = MiscUtils.escapeHtml;


var formatNumber = function(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};


var renderScores = function(list) {
  if (!list || !list.length) {
    $(highScoreRowsID).html('<tr><td colspan="5">No scores yet &mdash; be the first!</td></tr>');
    return;
  }

  var rows = list.map(function(entry, i) {
    return '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(entry.name) + '</td><td>' +
      escapeHtml(entry.score) + '</td><td>' + escapeHtml(HighScoreWindow.levelToClassName(entry.level)) + '</td><td>' +
      escapeHtml(formatNumber(entry.population || 0)) + '</td></tr>';
  });
  $(highScoreRowsID).html(rows.join(''));
};


var refreshScores = function() {
  $(highScoreRowsID).html('<tr><td colspan="5">Loading&hellip;</td></tr>');

  $.getJSON(API_BASE + GAME_KEY + '/scores').done(function(data) {
    renderScores(data.scores);
  }).fail(function() {
    $(highScoreRowsID).html('<tr><td colspan="5">Leaderboard unreachable right now.</td></tr>');
  });
};


// With b0r3d.org's admin mode attached (only ever for the owner's Cloudflare Access login),
// a cheated city isn't simply refused: this button hands it to admin mode, which asks the
// owner whether to post it and sends a yes through the Pi's Access-checked admin route
// (v0.89.7). Without admin mode it never appears.
var offerAdminPost = function(self) {
  var admin = window.b0r3dAdmin;
  if (!admin || !admin.offerPost)
    return;

  var button = $('<button type="button" id="highScoreAdminPost">Post via admin…</button>');
  $(highScoreStatusID).append(' ').append(button);
  button.on('click', function(e) {
    e.preventDefault();
    button.prop('disabled', true);
    admin.offerPost({game: 'city', noun: 'city', board: GAME_KEY, score: self._currentScore, level: self._currentLevel,
      extra: {population: self._currentPopulation}}).then(function(result) {
      if (result && result.posted) {
        renderScores(result.scores);
        $(highScoreStatusID).text(result.insertedId !== null && result.insertedId !== undefined ?
          'Posted through admin mode: made the top 10!' : 'Posted through admin mode, but not a top 10.');
      } else {
        $(highScoreStatusID).text(result && result.error ? 'Admin post failed: ' + result.error : 'Not posted.');
        offerAdminPost(self);
      }
    });
  });
};


var cancel = function(e) {
  e.preventDefault();
  this.close();
};


var submit = function(e) {
  e.preventDefault();

  // Belt and braces -- the form's hidden whenever this is true (see open()), but don't
  // rely on that alone to keep a cheated score off the board
  if (this._cheatsUsed)
    return;

  var name = $(highScoreNameID).val();
  if (!name) {
    $(highScoreStatusID).text('Enter a name first.');
    return;
  }

  var self = this;
  $(highScoreStatusID).text('Submitting…');

  var payload = {name: name, score: self._currentScore, level: self._currentLevel,
    population: self._currentPopulation, cheatsUsed: self._cheatsUsed};
  var token = freshToken();
  if (token)
    payload.runToken = token.token;
  // Spent by this post whatever the backend says; a failed post mints a new one
  runToken = null;

  var send = function() {
    $.ajax({
      url: API_BASE + GAME_KEY + '/submit',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(payload)
    }).done(function(data) {
      renderScores(data.scores);
      $(highScoreStatusID).text(data.insertedId !== null && data.insertedId !== undefined ?
        'Made the top 10!' : 'Submitted — not quite a top 10 this time.');
    }).fail(function(xhr) {
      var why = xhr && xhr.responseJSON && xhr.responseJSON.error;
      $(highScoreStatusID).text(why ? 'The board turned it down: ' + why + '.' : 'Submission failed — try again later.');
      startRun();
    });
  };

  // The backend refuses a score sent under two seconds after its token, and a
  // token minted as this window opened can be that young
  var wait = token ? Math.max(0, TOKEN_MIN_AGE_MS - (Date.now() - token.at)) : 0;
  setTimeout(send, wait);
};


HighScoreWindow.prototype.close = function() {
  this._toggleDisplay();
  this._emitEvent(HIGH_SCORE_WINDOW_CLOSED);
};


HighScoreWindow.prototype.open = function(data) {
  data = data || {};
  this._currentScore = data.score || 0;
  this._currentLevel = data.level || 1;
  this._currentPopulation = data.population || 0;
  this._cheatsUsed = !!data.cheatsUsed;

  $(highScoreCurrentScoreID).text(this._currentScore);
  $(highScoreCurrentClassID).text(HighScoreWindow.levelToClassName(this._currentLevel));
  $(highScoreCurrentPopulationID).text(formatNumber(this._currentPopulation));
  $(highScoreNameID).val('');

  // A tab left open past the token's twelve hours asks for a new one
  if (!freshToken())
    startRun();

  if (this._cheatsUsed) {
    $(highScoreFormID).hide();
    $(highScoreStatusID).text('Score submission is disabled for this city — cheats were used.');
    offerAdminPost(this);
  } else {
    $(highScoreFormID).show();
    $(highScoreStatusID).text('');
  }

  refreshScores();

  this._toggleDisplay();
};


// Game calls this whenever a cheat is used (see Game.markCheatsUsed), so a window
// that's already open when it happens loses its submit form there and then, instead of
// waiting to be closed and reopened. Harmless while closed: open() sets it all again.
HighScoreWindow.prototype.markCheatsUsed = function() {
  // Once is enough: a cheat after the first would only rewrite the same line (and drop
  // admin mode's button from it).
  if (this._cheatsUsed)
    return;
  this._cheatsUsed = true;
  $(highScoreFormID).hide();
  $(highScoreStatusID).text('Score submission is disabled for this city — cheats were used.');
  offerAdminPost(this);
};


HighScoreWindow.classNameToLevel = function(className) {
  var idx = CLASS_LABELS.indexOf(className);
  return idx === -1 ? 1 : idx + 1;
};


HighScoreWindow.levelToClassName = function(level) {
  return CLASS_LABELS[level - 1] || String(level);
};


export { HighScoreWindow };
