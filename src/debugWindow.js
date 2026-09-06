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

import { DEBUG_WINDOW_CLOSED } from './messages.ts';
import { ModalWindow } from './modalWindow.js';
import { MiscUtils } from './miscUtils.js';

var DebugWindow = ModalWindow(function() {
  $(debugCancelID).on('click', cancel.bind(this));
  $(debugFormID).on('submit', submit.bind(this));

  $(cheatAddFundsButtonID).on('click', function(e) {
    e.preventDefault();
    var amount = parseInt($(cheatFundsAmountID).val(), 10);
    if (amount > 0)
      this.close([{action: DebugWindow.ADD_FUNDS, data: amount}]);
  }.bind(this));

  $('.cheatDisasterButton').on('click', function(e) {
    e.preventDefault();
    var disaster = $(e.currentTarget).data('disaster');
    this.close([{action: DebugWindow.TRIGGER_DISASTER, data: disaster}]);
  }.bind(this));
});


var debugCancelID = '#debugCancel';
var debugFormID = '#debugForm';
var debugOKID = '#debugOK';
var cheatFundsAmountID = '#cheatFundsAmount';
var cheatAddFundsButtonID = '#cheatAddFundsButton';
var cheatFreeBuildYesID = '#cheatFreeBuildYes';
var cheatFreeBuildNoID = '#cheatFreeBuildNo';


DebugWindow.prototype.close = function(actions) {
  actions = actions || [];
  this._emitEvent(DEBUG_WINDOW_CLOSED, actions);
  this._toggleDisplay();
};


var cancel = function(e) {
  e.preventDefault();
  this.close([]);
};


var submit = function(e) {
  e.preventDefault();

  // Adding funds is now its own explicit button (see above) -- OK only ever
  // applies the Free Build setting, so closing the menu never silently
  // grants cash the player didn't ask for.
  var shouldFreeBuild = $('.cheatFreeBuildSetting:checked').val() === 'true';
  this.close([{action: DebugWindow.FREE_BUILD_CHANGED, data: shouldFreeBuild}]);
};


DebugWindow.prototype.open = function(cheatData) {
  cheatData = cheatData || {};

  $(cheatFundsAmountID).val(100000);

  if (cheatData.freeBuild)
    $(cheatFreeBuildYesID).prop('checked', true);
  else
    $(cheatFreeBuildNoID).prop('checked', true);

  this._toggleDisplay();
};


var defineAction = (function() {
  var uid = 0;

  return function(name) {
    Object.defineProperty(DebugWindow, name, MiscUtils.makeConstantDescriptor(uid));
    uid += 1;
  };
})();


defineAction('ADD_FUNDS');
defineAction('FREE_BUILD_CHANGED');
defineAction('TRIGGER_DISASTER');


export { DebugWindow };
