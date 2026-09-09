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
// in images/tiles.png/images/tilessnow.png, then add one entry to RAW_BUILDINGS below
// -- gameTools.js, civicBuildings.js, zoneUtils.js and the toolbar all consume this
// list generically, so no per-building code is needed. A coverage-effect building
// also needs its censusStat declaring in census.js's accumulator, which is the only
// hand-edit left: 4x4 placement maths used to want four switch cases per building in
// zoneUtils.js's checkBigZone, and is now derived from the size field here.

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
  // The 1x1 park tool (parkTool.js) scatters woods and the odd fountain and does
  // nothing for land value; this is the deliberate, expensive version of the same
  // idea. Coverage rather than demand: a park earns its keep by making the blocks
  // around it nicer to live in, which is exactly what the civicBuildingMap models.
  // 350 sits between the Library (300) and the Hospital (400) -- more than a
  // reading room, less than an emergency department, and it costs 4x the footprint
  // of either.
  {
    id: 'largePark', label: 'Large Park', cost: 2000, size: 4, animated: false,
    colour: 'forestgreen', textColour: 'white',
    effect: { type: 'coverage', censusStat: 'largeParkPop', landValueEffect: 350 },
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
