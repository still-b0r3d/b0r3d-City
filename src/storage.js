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

import { reflowTileValue } from './legacyTileFormat.js';
import { MiscUtils } from './miscUtils.js';

// A thin wrapper around localStorage, in case we wish to move to some other storage mechanism
// (such as indexedDB) in the future.
//
// Saves are named slots: each save's game data lives under its own
// KEY_PREFIX + slug(name) key, and an index (an array of {id, name, savedAt, meta})
// under INDEX_KEY lets us list/sort saves without loading every blob.
//
// Every localStorage touch in here can throw rather than just return null -- a browser
// with site data blocked throws on the very first access, and a full quota throws on
// write. Reads swallow that and report "nothing stored"; writes report the failure up
// to the caller, since silently losing a save the player asked for is the one outcome
// worth interrupting them about (see saveGame's return value and game.js's alert).

var slugify = function(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'save';
};


var readIndex = function() {
  try {
    var raw = window.localStorage.getItem(Storage.INDEX_KEY);
    return raw === null ? [] : JSON.parse(raw);
  } catch (e) {
    // Storage unreadable, or the index itself got corrupted. An empty list is the
    // safe reading of both: it destroys nothing by itself, and every caller treats
    // it as "no saves yet" rather than doing something irreversible.
    console.warn('Could not read the save index', e);
    return [];
  }
};


var writeIndex = function(index) {
  window.localStorage.setItem(Storage.INDEX_KEY, JSON.stringify(index));
};


// Versions prior to multi-slot saves kept a single save under one fixed key.
// Fold it into the index (once) so an existing save isn't orphaned/lost.
var migrateLegacySave = function() {
  var legacy;

  try {
    legacy = window.localStorage.getItem(Storage.LEGACY_KEY);
  } catch (e) {
    return;
  }

  if (legacy === null)
    return;

  var index = readIndex();
  if (!index.some(function(entry) { return entry.id === 'legacy'; })) {
    try {
      var gameData = JSON.parse(legacy);

      if (gameData.version !== Storage.CURRENT_VERSION)
        transitionOldSave(gameData);

      window.localStorage.setItem(Storage.KEY_PREFIX + 'legacy', JSON.stringify(gameData));
      index.push({id: 'legacy', name: gameData.name || 'Recovered save', savedAt: new Date().toISOString(), meta: {}});
      writeIndex(index);
    } catch (e) {
      // Leave LEGACY_KEY in place so a later attempt (with room freed up, or after
      // whatever made it unparseable is gone) can still rescue it, rather than
      // deleting the only copy on the way past.
      console.warn('Could not migrate the legacy save', e);
      return;
    }
  }

  try {
    window.localStorage.removeItem(Storage.LEGACY_KEY);
  } catch (e) {
    // Migrated fine, just couldn't tidy up -- the index check above stops this
    // re-importing it a second time.
  }
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


// Returns the save, or null if there isn't a readable one under this id -- a corrupt
// blob or an unrecognised version reads as "not there" rather than throwing out of
// the caller's click handler, which used to leave the Load button doing nothing at
// all with only a console message to explain it.
var getSave = function(id) {
  var savedGame;

  try {
    var raw = window.localStorage.getItem(Storage.KEY_PREFIX + id);
    if (raw === null)
      return null;

    savedGame = JSON.parse(raw);

    if (savedGame.version !== this.CURRENT_VERSION)
      this.transitionOldSave(savedGame);
  } catch (e) {
    console.warn('Could not load save ' + id, e);
    return null;
  }

  // Flag as a saved game for Game/Simulation etc...
  savedGame.isSavedGame = true;

  return savedGame;
};


// Returns {ok: true, id} or {ok: false, reason}, where reason is 'cap' (the save
// slots are full) or 'storage' (the browser refused the write -- out of quota, or
// site data blocked). The caller needs to tell those two apart: only the first is
// something the player can act on.
var saveGame = function(name, gameData, meta) {
  migrateLegacySave();

  var id = slugify(name);
  var index = readIndex();
  var isNewSlot = !index.some(function(entry) { return entry.id === id; });

  // Overwriting an existing slot never grows the save count, so only a
  // brand new name is checked against the cap.
  if (isNewSlot && index.length >= Storage.MAX_SAVES)
    return {ok: false, reason: 'cap'};

  gameData.version = this.CURRENT_VERSION;

  try {
    window.localStorage.setItem(Storage.KEY_PREFIX + id, JSON.stringify(gameData));
  } catch (e) {
    console.warn('Could not write save ' + id, e);
    return {ok: false, reason: 'storage'};
  }

  index = index.filter(function(entry) { return entry.id !== id; });
  index.push({id: id, name: name, savedAt: new Date().toISOString(), meta: meta || {}});

  try {
    writeIndex(index);
  } catch (e) {
    // The blob landed but the index didn't, so nothing can find it -- drop the blob
    // rather than leaving an invisible one behind eating the quota that just ran out.
    console.warn('Could not update the save index', e);
    try {
      window.localStorage.removeItem(Storage.KEY_PREFIX + id);
    } catch (ignored) {}
    return {ok: false, reason: 'storage'};
  }

  return {ok: true, id: id};
};


var deleteSave = function(id) {
  try {
    window.localStorage.removeItem(Storage.KEY_PREFIX + id);
    writeIndex(readIndex().filter(function(entry) { return entry.id !== id; }));
  } catch (e) {
    console.warn('Could not delete save ' + id, e);
  }
};


// Brings a save of any older version up to CURRENT_VERSION, in place. Every case
// below falls through to the next one: a v1 save needs v1's fixup *and* v2's *and*
// v3's, so the only `break` in here belongs to the last case. (This is why the
// 2026-09-08 bit-layout reflow in `case 3:` -- see legacyTileFormat.js -- has to be
// last: it was originally unreachable from cases 1 and 2, which stopped at a `break`
// of their own, so those saves loaded with a silently mis-decoded map.)
//
// Stamping the new version on the way out matters as much as the conversions
// themselves: migrateLegacySave writes the migrated data straight back to
// localStorage, and without this it would write it back still labelled with its old
// version, so getSave would migrate the already-migrated save all over again.
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

      /* falls through */
    case 3:
      for (var i = 0, l = savedGame.map.length; i < l; i++)
        savedGame.map[i].value = reflowTileValue(savedGame.map[i].value);

      /* falls through */
    case 4:
      // Simulation._startingYear became a saved field when scenarios learned to
      // survive a save/load (each starts in its own year). Everything written before
      // that is a 1900 city by definition -- scenarios couldn't be saved at all.
      savedGame._startingYear = 1900;

      break;

    default:
      throw new Error('Unknown save version!');
  }

  savedGame.version = Storage.CURRENT_VERSION;
};


// Probed by actually writing, not by testing `window.localStorage !== undefined`:
// browsers that block site data don't hide the property, they throw the moment it's
// touched -- and since this runs at module load, that throw took the whole game down
// before the splash screen rather than just disabling Save.
var canStore = function() {
  try {
    var probe = Storage.KEY_PREFIX + 'probe';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch (e) {
    return false;
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


Object.defineProperty(Storage, 'CURRENT_VERSION', MiscUtils.makeConstantDescriptor(5));
Object.defineProperty(Storage, 'LEGACY_KEY', MiscUtils.makeConstantDescriptor('micropolisJSGame'));
Object.defineProperty(Storage, 'KEY_PREFIX', MiscUtils.makeConstantDescriptor('micropolisJSGame_'));
Object.defineProperty(Storage, 'INDEX_KEY', MiscUtils.makeConstantDescriptor('micropolisJSSaveIndex'));
Object.defineProperty(Storage, 'MAX_SAVES', MiscUtils.makeConstantDescriptor(3));
Object.defineProperty(Storage, 'canStore', MiscUtils.makeConstantDescriptor(canStore()));


export { Storage };
