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

import { MiscUtils } from './miscUtils.js';

// A thin wrapper around localStorage, in case we wish to move to some other storage mechanism
// (such as indexedDB) in the future.
//
// Saves are named slots: each save's game data lives under its own
// KEY_PREFIX + slug(name) key, and an index (an array of {id, name, savedAt, meta})
// under INDEX_KEY lets us list/sort saves without loading every blob.

var slugify = function(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'save';
};


var readIndex = function() {
  var raw = window.localStorage.getItem(Storage.INDEX_KEY);
  return raw === null ? [] : JSON.parse(raw);
};


var writeIndex = function(index) {
  window.localStorage.setItem(Storage.INDEX_KEY, JSON.stringify(index));
};


// Versions prior to multi-slot saves kept a single save under one fixed key.
// Fold it into the index (once) so an existing save isn't orphaned/lost.
var migrateLegacySave = function() {
  var legacy = window.localStorage.getItem(Storage.LEGACY_KEY);
  if (legacy === null)
    return;

  var index = readIndex();
  if (!index.some(function(entry) { return entry.id === 'legacy'; })) {
    var gameData = JSON.parse(legacy);

    if (gameData.version !== Storage.CURRENT_VERSION)
      transitionOldSave(gameData);

    window.localStorage.setItem(Storage.KEY_PREFIX + 'legacy', JSON.stringify(gameData));
    index.push({id: 'legacy', name: gameData.name || 'Recovered save', savedAt: new Date().toISOString(), meta: {}});
    writeIndex(index);
  }

  window.localStorage.removeItem(Storage.LEGACY_KEY);
};


var listSaves = function() {
  migrateLegacySave();

  return readIndex().sort(function(a, b) {
    return b.savedAt.localeCompare(a.savedAt);
  });
};


// Returns the existing index entry a given name would collide with -- names
// are compared after slugify(), so e.g. "City A" and "CITY A" match the same
// entry -- or null if the name is free. Callers need the actual matched
// entry (not just a yes/no) so they can tell the player which save they're
// about to overwrite, since it may not be spelled the way they just typed it.
var findSave = function(name) {
  var id = slugify(name);
  var matches = readIndex().filter(function(entry) { return entry.id === id; });
  return matches.length ? matches[0] : null;
};


var getSave = function(id) {
  var raw = window.localStorage.getItem(Storage.KEY_PREFIX + id);
  if (raw === null)
    return null;

  var savedGame = JSON.parse(raw);

  if (savedGame.version !== this.CURRENT_VERSION)
    this.transitionOldSave(savedGame);

  // Flag as a saved game for Game/Simulation etc...
  savedGame.isSavedGame = true;

  return savedGame;
};


var saveGame = function(name, gameData, meta) {
  migrateLegacySave();

  var id = slugify(name);
  var index = readIndex();
  var isNewSlot = !index.some(function(entry) { return entry.id === id; });

  // Overwriting an existing slot never grows the save count, so only a
  // brand new name is checked against the cap.
  if (isNewSlot && index.length >= Storage.MAX_SAVES)
    return null;

  gameData.version = this.CURRENT_VERSION;
  window.localStorage.setItem(Storage.KEY_PREFIX + id, JSON.stringify(gameData));

  index = index.filter(function(entry) { return entry.id !== id; });
  index.push({id: id, name: name, savedAt: new Date().toISOString(), meta: meta || {}});
  writeIndex(index);

  return id;
};


var deleteSave = function(id) {
  window.localStorage.removeItem(Storage.KEY_PREFIX + id);
  writeIndex(readIndex().filter(function(entry) { return entry.id !== id; }));
};


var transitionOldSave = function(savedGame) {
  switch (savedGame.version) {
    case 1:
      savedGame.everClicked = false;

      /* falls through */
    case 2:
      savedGame.pollutionMaxX = Math.floor(savedGame.width / 2);
      savedGame.pollutionMaxY = Math.floor(savedGame.height / 2);
      savedGame.cityCentreX = Math.floor(savedGame.width / 2);
      savedGame.cityCentreY = Math.floor(savedGame.height / 2);

      break;

    default:
      throw new Error('Unknown save version!');
  }
};


var Storage = {
  listSaves: listSaves,
  findSave: findSave,
  getSave: getSave,
  saveGame: saveGame,
  deleteSave: deleteSave,
  transitionOldSave: transitionOldSave
};


Object.defineProperty(Storage, 'CURRENT_VERSION', MiscUtils.makeConstantDescriptor(3));
Object.defineProperty(Storage, 'LEGACY_KEY', MiscUtils.makeConstantDescriptor('micropolisJSGame'));
Object.defineProperty(Storage, 'KEY_PREFIX', MiscUtils.makeConstantDescriptor('micropolisJSGame_'));
Object.defineProperty(Storage, 'INDEX_KEY', MiscUtils.makeConstantDescriptor('micropolisJSSaveIndex'));
Object.defineProperty(Storage, 'MAX_SAVES', MiscUtils.makeConstantDescriptor(3));
Object.defineProperty(Storage, 'canStore', MiscUtils.makeConstantDescriptor(window.localStorage !== undefined));


export { Storage };
