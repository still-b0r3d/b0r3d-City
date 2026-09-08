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

// Single source of truth for b0r3d-city's own custom placeable buildings (as opposed to
// the original engine's zones/buildings, which stay named individually in
// tileValues.ts). Adding a new building is: draw its art at the next free tile offset
// in images/tiles.png/images/tilessnow.png, then add one entry to RAW_BUILDINGS below --
// gameTools.js, civicBuildings.js, zoneUtils.js and the toolbar all consume this list
// generically, no per-building code required for the common case. A 4x4 building also
// needs one switch case added to zoneUtils.js's checkBigZone, following the casino
// case there as the template -- that one part of 4x4 placement math isn't generated.

// First tile ID past the original engine's own tile range (0-1023) -- see tileFlags.ts's
// BIT_START for why 1024 was once a hard ceiling here, and why it no longer is.
var CUSTOM_BUILDING_BASE = 1024;

var RAW_BUILDINGS = [
  {
    id: 'hospital', label: 'Hospital', cost: 1000, size: 3, animated: false,
    colour: 'lightblue', textColour: null,
    effect: { type: 'coverage', censusStat: 'civicHospitalPop', landValueEffect: 400 },
  },
  {
    id: 'school', label: 'School', cost: 800, size: 3, animated: false,
    colour: 'orange', textColour: null,
    effect: { type: 'demand', censusStat: 'schoolPop' },
  },
  {
    id: 'casino', label: 'Casino', cost: 5000, size: 4, animated: false,
    colour: 'purple', textColour: 'white',
    effect: { type: 'demand', censusStat: 'casinoPop' },
  },
  {
    id: 'library', label: 'Library', cost: 1000, size: 3, animated: false,
    colour: 'tan', textColour: null,
    effect: { type: 'coverage', censusStat: 'libraryPop', landValueEffect: 300 },
  },
  // Future buildings just get appended here -- tile IDs below are computed
  // automatically from size + position in this list, never hand-picked.
];

// baseTile/centreTile/lastTile follow BuildingTool's own convention
// (baseTile = centreTile - size - 1, see buildingTool.js) -- each building occupies
// size*size contiguous tile IDs starting at baseTile.
var nextBase = CUSTOM_BUILDING_BASE;
var CUSTOM_BUILDINGS = RAW_BUILDINGS.map(function(building) {
  var baseTile = nextBase;
  var lastTile = baseTile + (building.size * building.size) - 1;
  var centreTile = baseTile + building.size + 1;
  nextBase = lastTile + 1;

  return Object.assign({}, building, {
    baseTile: baseTile,
    centreTile: centreTile,
    lastTile: lastTile,
  });
});


export { CUSTOM_BUILDINGS, CUSTOM_BUILDING_BASE };
