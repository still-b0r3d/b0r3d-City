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

import { EventEmitter } from './eventEmitter.js';
import { MiscUtils } from './miscUtils.js';

var ModalWindow = function(constructorFunction, focusID) {
  focusID = focusID ? MiscUtils.normaliseDOMid(focusID) : null;

  var newConstructor = function(opacityLayerID, windowID) {
    this._opacityLayer =  MiscUtils.normaliseDOMid(opacityLayerID);
    this._windowID = MiscUtils.normaliseDOMid(windowID);
    constructorFunction.call(this);
  };


  newConstructor.prototype._toggleDisplay = function() {
    var modalWindow = $(this._windowID);
    modalWindow = modalWindow.length === 0 ? null : modalWindow;
    if (modalWindow === null)
      throw new Error('Node ' + this._windowID + ' not found');

    // The backdrop (_opacityLayer) used to be toggled right here alongside the window
    // itself, back when exactly one window could ever be open at a time. Now that
    // Game tracks a whole set of open windows, a shared backdrop can't be toggled
    // independently by each one -- two windows open/closing in either order would
    // desync it from the true count. Game.prototype._updateBackdrop owns it instead,
    // driven by _openWindows.length; _opacityLayer is kept on the instance (unused
    // here) since every caller still passes it and it may yet be useful for a
    // per-window backdrop policy (e.g. only budget dimming) later.
    modalWindow.toggle();

    if (focusID !== null)
      $(focusID).focus();
    else
      $(this._windowID + ' input[type=submit]').focus();
  };


  return EventEmitter(newConstructor);
};


export { ModalWindow };
