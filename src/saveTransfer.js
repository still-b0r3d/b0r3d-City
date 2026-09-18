/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 *
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details. Alternatively,
 * consult http://micropolisjs.graememcc.co.uk/LICENSE and
 * http://micropolisjs.graememcc.co.uk/COPYING
 *
 */

import { Storage } from './storage.js';

// The browser half of saves-as-files (see Storage.exportSave / parseSaveFile for the
// format): handing the player a file, and taking one back. Nothing here knows what a
// save contains -- it moves text between localStorage and the disk.

// The file is named after the slot's id (the slugged name), so "Rukus Falls" comes out
// as b0r3d-city-rukus-falls.json: readable, and safe on every filesystem without any
// further escaping. The ".json" is deliberate -- it's what the file is, and it's what
// the import picker filters on.
var fileNameFor = function(id) {
  return 'b0r3d-city-' + id + '.json';
};


// Downloads the slot as a file. In a browser this lands in Downloads; the desktop
// build puts up a Save As dialog. Returns false if there was nothing readable to
// export, so the caller can say so.
var download = function(id) {
  var file = Storage.exportSave(id);
  if (!file)
    return false;

  var blob = new Blob([JSON.stringify(file)], {type: 'application/json'});
  var url = URL.createObjectURL(blob);

  var link = document.createElement('a');
  link.href = url;
  link.download = fileNameFor(id);
  document.body.appendChild(link);
  link.click();
  link.remove();

  // The click has started the download by the time this runs; the URL just has to
  // outlive the dispatch, not the transfer.
  window.setTimeout(function() { URL.revokeObjectURL(url); }, 0);
  return true;
};


// Opens the file picker and reads whatever the player chooses. onParsed gets
// Storage.parseSaveFile's result (or {ok: false, reason: 'unreadable'} if the file
// couldn't be read at all) and the file's own name, for the error message. Dismissing
// the picker calls nothing, since there's nothing to report.
var pick = function(onParsed) {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';

  input.addEventListener('change', function() {
    var file = input.files && input.files[0];
    if (!file)
      return;

    var reader = new FileReader();
    reader.onload = function() { onParsed(Storage.parseSaveFile(reader.result), file.name); };
    reader.onerror = function() { onParsed({ok: false, reason: 'unreadable'}, file.name); };
    reader.readAsText(file);
  });

  input.click();
};


// One wording for every way an import can fail, shared by whoever offers the button.
var describeFailure = function(result, fileName) {
  switch (result.reason) {
    case 'invalid':
      return '"' + fileName + '" isn\'t a b0r3d-city save.';
    case 'version':
      return '"' + fileName + '" was saved by a newer version of the game than this one.';
    case 'unreadable':
      return '"' + fileName + '" couldn\'t be read.';
    case 'cap':
      return 'You already have ' + Storage.MAX_SAVES + ' saves, the most this game keeps. Delete one first.';
    case 'storage':
      return "This browser wouldn't store the save. It may be out of space, or set to block site data for this page.";
    default:
      return 'The save could not be imported.';
  }
};


var SaveTransfer = {
  download: download,
  pick: pick,
  describeFailure: describeFailure
};


export { SaveTransfer };
