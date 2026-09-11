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

import { ORDINANCE_WINDOW_CLOSED } from './messages.ts';
import { ModalWindow } from './modalWindow.js';
import { ORDINANCES, annualCostOf } from './ordinances.js';

// The list of city policies, one checkbox each. Rendered from the ORDINANCES registry
// rather than hand-authored in index.html, for the same reason the custom buildings'
// tool buttons are (see renderCustomBuildingButtons in game.js): adding an ordinance
// should be one entry in one array, not an entry plus a block of markup plus a handler.
// index.html carries only the shell -- the header, the empty list, and the buttons.
//
// The rows are rebuilt on every open rather than once at construction, because what
// each policy costs depends on how big the city has grown since the window was last
// looked at.
var OrdinanceWindow = ModalWindow(function() {
  $(ordinanceCancelID).on('click', cancel.bind(this));
  $(ordinanceFormID).on('submit', submit.bind(this));
  $(ordinanceListID).on('change', '.ordinanceCheck', updateTotal.bind(this));
});


var ordinanceCancelID = '#ordinanceCancel';
var ordinanceFormID = '#ordinanceForm';
var ordinanceListID = '#ordinanceList';
var ordinanceTotalID = '#ordinanceTotal';


// Both the per-row figure and the running total read better as "costs $400 a year" or
// "earns $700 a year" than as a signed number, since two of the eight are revenue and
// a minus sign in front of a dollar amount is exactly the sort of thing that gets
// misread at a glance.
var describeCost = function(cost) {
  if (cost === 0)
    return 'free';

  return cost > 0 ? 'costs $' + cost + '/yr' : 'earns $' + (-cost) + '/yr';
};


var describeTotal = function(cost) {
  if (cost === 0)
    return 'Nothing enacted';

  return cost > 0 ? 'Total: $' + cost + ' a year' : 'Total: $' + (-cost) + ' a year in revenue';
};


// The total the checkboxes currently add up to, which is not the same as what the city
// is paying right now -- that only changes when OK is pressed. Recomputed from the DOM
// so it stays honest while the player is still making up their mind.
var updateTotal = function() {
  var total = 0;

  $('.ordinanceCheck:checked').each(function() {
    total += $(this).data('cost') - 0;
  });

  $(ordinanceTotalID).text(describeTotal(total));
};


OrdinanceWindow.prototype.close = function(data) {
  data = data || { cancelled: true };
  this._emitEvent(ORDINANCE_WINDOW_CLOSED, data);
  this._toggleDisplay();
};


var cancel = function(e) {
  e.preventDefault();
  this.close({ cancelled: true });
};


var submit = function(e) {
  e.preventDefault();

  var enacted = [];
  $('.ordinanceCheck:checked').each(function() {
    enacted.push($(this).data('ordinance'));
  });

  this.close({ cancelled: false, enacted: enacted });
};


// ordinanceData: { isEnacted, blockedReason, census } -- the first two are functions
// taking an ordinance id, so the window asks about each row as it draws it rather than
// being handed a pair of parallel structures to keep in step.
OrdinanceWindow.prototype.open = function(ordinanceData) {
  var list = $(ordinanceListID);
  list.empty();

  ORDINANCES.forEach(function(ordinance) {
    var cost = annualCostOf(ordinance, ordinanceData.census);
    var isEnacted = ordinanceData.isEnacted(ordinance.id);

    // A blocked ordinance is one that can't be *enacted* -- one already in force can
    // always be repealed, so the block never applies to a ticked box.
    var blockedReason = isEnacted ? null : ordinanceData.blockedReason(ordinance.id);

    var row = $('<div>').addClass('ordinanceRow' + (blockedReason ? ' ordinanceBlocked' : ''));

    var checkbox = $('<input>')
      .attr('type', 'checkbox')
      .attr('id', 'ordinance-' + ordinance.id)
      .addClass('ordinanceCheck')
      .data('ordinance', ordinance.id)
      .data('cost', cost)
      .prop('checked', isEnacted)
      .prop('disabled', blockedReason !== null);

    var label = $('<label>')
      .attr('for', 'ordinance-' + ordinance.id)
      .addClass('ordinanceLabel')
      .text(ordinance.label);

    var cash = $('<span>').addClass('ordinanceCost').text(describeCost(cost));
    var blurb = $('<div>').addClass('ordinanceBlurb').text(blockedReason || ordinance.blurb);

    row.append(checkbox).append(label).append(cash).append(blurb);
    list.append(row);
  });

  updateTotal.call(this);
  this._toggleDisplay();
};


export { OrdinanceWindow };
