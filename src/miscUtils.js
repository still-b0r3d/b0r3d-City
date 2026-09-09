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

var clamp = function(value, min, max) {
  if (value < min)
    return min;
  if (value > max)
    return max;

  return value;
};


// `writeable` was a misspelling of `writable`, so the property was ignored entirely --
// harmless in practice only because Object.defineProperty already defaults writable to
// false, which is what was meant. Spelled correctly the intent is now actually stated.
var makeConstantDescriptor = function(value) {
  return {configurable: false, enumerable: false,
          writable: false, value: value};
};


var normaliseDOMid = function(id) {
  return (id[0] !== '#' ? '#' : '') + id;
};


var reflectEvent = function(message, value) {
  this._emitEvent(message, value);
};


var escapeHtml = function(s) {
  return String(s).replace(/[&<>"']/g, function(ch) {
    return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch];
  });
};


// Formats a save's date/population/city-class metadata into a display
// string, e.g. "Mar 1900, 1234 pop., Town". Shared by the save list
// (saveWindow.js) and the load-game list (splashScreen.js) -- same save
// index entries, same summary format in both places. Takes the Text module
// as a parameter rather than importing it directly -- text.js pulls in
// simulation.js, which itself imports MiscUtils, so importing Text here
// would create a circular dependency.
var describeSave = function(entry, Text) {
  var meta = entry.meta || {};
  var bits = [];

  if (meta.date)
    bits.push(Text.months[meta.date.month] + ' ' + meta.date.year);

  if (meta.population !== undefined)
    bits.push(meta.population + ' pop.');

  if (meta.cityClass !== undefined && Text.cityClass[meta.cityClass])
    bits.push(Text.cityClass[meta.cityClass]);

  // Scenario saves resume into their objective and deadline, not into freeform play,
  // so say which one before the player commits to loading it.
  if (meta.scenarioName)
    bits.push(meta.scenarioName + ' scenario');

  return bits.join(', ');
};


var MiscUtils = {
  clamp: clamp,
  makeConstantDescriptor: makeConstantDescriptor,
  normaliseDOMid: normaliseDOMid,
  reflectEvent: reflectEvent,
  escapeHtml: escapeHtml,
  describeSave: describeSave
};


export { MiscUtils };
