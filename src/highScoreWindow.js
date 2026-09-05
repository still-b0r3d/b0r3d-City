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
import { ModalWindow } from './modalWindow.js';

// still.b0r3d.org's shared per-game leaderboard backend (see GAMES in
// still-app.py) only allows [a-z0-9_]+ in its game-key URL segment, so this
// has to be an underscored key even though the game displays as
// "sim-b0r3d-city" and lives at /lab/sim-b0r3d-city/.
var GAME_KEY = 'sim_b0r3d_city';

// The backend's "level" field is a plain integer (shared schema with the
// other arcade games' numeric levels), so the city's evaluation class name
// is stored/sent as a 1-6 ordinal and translated back to its label here.
var CLASS_LABELS = ['VILLAGE', 'TOWN', 'CITY', 'CAPITAL', 'METROPOLIS', 'MEGALOPOLIS'];

var HighScoreWindow = ModalWindow(function() {
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


var escapeHtml = function(s) {
  return String(s).replace(/[&<>"']/g, function(ch) {
    return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch];
  });
};


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

  $.getJSON('/api/' + GAME_KEY + '/scores').done(function(data) {
    renderScores(data.scores);
  }).fail(function() {
    $(highScoreRowsID).html('<tr><td colspan="5">Leaderboard unreachable right now.</td></tr>');
  });
};


var cancel = function(e) {
  e.preventDefault();
  this.close();
};


var submit = function(e) {
  e.preventDefault();

  var name = $(highScoreNameID).val();
  if (!name) {
    $(highScoreStatusID).text('Enter a name first.');
    return;
  }

  var self = this;
  $(highScoreStatusID).text('Submitting…');

  $.ajax({
    url: '/api/' + GAME_KEY + '/submit',
    method: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({name: name, score: self._currentScore, level: self._currentLevel, population: self._currentPopulation})
  }).done(function(data) {
    renderScores(data.scores);
    $(highScoreStatusID).text(data.insertedId !== null && data.insertedId !== undefined ?
      'Made the top 10!' : 'Submitted — not quite a top 10 this time.');
  }).fail(function() {
    $(highScoreStatusID).text('Submission failed — try again later.');
  });
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

  $(highScoreCurrentScoreID).text(this._currentScore);
  $(highScoreCurrentClassID).text(HighScoreWindow.levelToClassName(this._currentLevel));
  $(highScoreCurrentPopulationID).text(formatNumber(this._currentPopulation));
  $(highScoreNameID).val('');
  $(highScoreStatusID).text('');

  refreshScores();

  this._toggleDisplay();
};


HighScoreWindow.classNameToLevel = function(className) {
  var idx = CLASS_LABELS.indexOf(className);
  return idx === -1 ? 1 : idx + 1;
};


HighScoreWindow.levelToClassName = function(level) {
  return CLASS_LABELS[level - 1] || String(level);
};


export { HighScoreWindow };
