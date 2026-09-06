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


var escapeHtml = function(s) {
  return String(s).replace(/[&<>"']/g, function(ch) {
    return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch];
  });
};


var describeSave = function(entry) {
  var meta = entry.meta || {};
  var bits = [];

  if (meta.date)
    bits.push(Text.months[meta.date.month] + ' ' + meta.date.year);

  if (meta.population !== undefined)
    bits.push(meta.population + ' pop.');

  if (meta.cityClass !== undefined && Text.cityClass[meta.cityClass])
    bits.push(Text.cityClass[meta.cityClass]);

  return bits.join(', ');
};


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

  var exists = Storage.saveExists(name);

  if (!exists && Storage.listSaves().length >= Storage.MAX_SAVES) {
    $(saveStatusID).text('You already have ' + Storage.MAX_SAVES +
      ' saves, the most this game keeps. Delete one below, or save over an existing name, first.');
    return;
  }

  if (exists && !window.confirm('A save named "' + name + '" already exists. Overwrite it?'))
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
