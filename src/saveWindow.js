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

import { SAVE_WINDOW_CLOSED } from './messages.ts';
import { MiscUtils } from './miscUtils.js';
import { ModalWindow } from './modalWindow.js';
import { Storage } from './storage.js';
import { Text } from './text.js';

var SaveWindow = ModalWindow(function() {
  $(saveFormID).on('submit', submit.bind(this));
  $(saveCancelID).on('click', cancel.bind(this));
});


var saveFormID = '#saveForm';
var saveNameID = '#saveName';
var saveCancelID = '#saveCancel';
var saveStatusID = '#saveStatus';
var saveExistingID = '#saveExisting';
var saveRowsID = '#saveRows';


var escapeHtml = MiscUtils.escapeHtml;
var describeSave = function(entry) { return MiscUtils.describeSave(entry, Text); };


var renderSaves = function(saves) {
  if (!saves.length) {
    $(saveExistingID).hide();
    return;
  }

  $(saveExistingID).show();

  var rows = saves.map(function(entry) {
    return '<tr><td class="pointer saveRowName" data-name="' + escapeHtml(entry.name) + '">' +
      escapeHtml(entry.name) + '</td><td>' + escapeHtml(describeSave(entry)) +
      '</td><td><button type="button" class="cancel saveRowDelete" data-id="' + escapeHtml(entry.id) + '">Delete</button></td></tr>';
  });

  $(saveRowsID).html(rows.join(''));

  $('.saveRowName').on('click', function() {
    $(saveNameID).val($(this).data('name')).focus();
  });

  $('.saveRowDelete').on('click', function() {
    var id = $(this).data('id');
    if (window.confirm('Delete this save? This cannot be undone.')) {
      Storage.deleteSave(id);
      $(saveStatusID).text('');
      renderSaves(Storage.listSaves());
    }
  });
};


var submit = function(e) {
  e.preventDefault();

  var name = $(saveNameID).val().trim();
  if (!name)
    return;

  var existing = Storage.findSave(name);

  if (!existing && Storage.listSaves().length >= Storage.MAX_SAVES) {
    $(saveStatusID).text('You already have ' + Storage.MAX_SAVES +
      ' saves, the most this game keeps. Delete one below, or save over an existing name, first.');
    return;
  }

  // Names collide after slugifying (case/punctuation-insensitive), so the
  // save this is about to overwrite may not be spelled the way it was just
  // typed -- name the actual existing entry, not the newly-typed name.
  if (existing && !window.confirm('This will overwrite the existing save "' + existing.name +
      '" and rename it to "' + name + '". Continue?'))
    return;

  this.close(name);
};


var cancel = function(e) {
  e.preventDefault();
  this.close(null);
};


SaveWindow.prototype.close = function(name) {
  this._toggleDisplay();
  this._emitEvent(SAVE_WINDOW_CLOSED, name);
};


SaveWindow.prototype.open = function(data) {
  data = data || {};
  $(saveNameID).val(data.defaultName || '');
  $(saveStatusID).text('');
  renderSaves(data.saves || []);
  this._toggleDisplay();
  $(saveNameID).focus();
};


export { SaveWindow };
