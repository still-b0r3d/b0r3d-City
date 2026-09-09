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
// list generically, so no per-building code is needed. Every building needs its
// censusStat declaring in census.js's accumulator, which is the only hand-edit left:
// 4x4 placement maths used to want four switch cases per building in zoneUtils.js's
// checkBigZone, and is now derived from the size field here, and a demand building
// used to want its own line in valves.js, which is now derived from `valve` below.

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
    effect: { type: 'demand', censusStat: 'schoolPop', valve: 'residential', weight: 1 },
  },
  {
    id: 'casino', label: 'Casino', cost: 5000, size: 4, animated: false,
    colour: 'purple', textColour: 'white',
    effect: { type: 'demand', censusStat: 'casinoPop', valve: 'commercial', weight: 1 },
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
  // The cheap, sprawling route to commercial demand, where the Casino is the
  // compact, expensive one: two Arcades cost $2400 and cover 18 tiles for what one
  // $5000 Casino does in 16. Weight rather than a ceiling of its own -- see
  // valves.js on why every building feeding a valve shares that valve's ceiling.
  {
    id: 'arcade', label: 'Arcade', cost: 1200, size: 3, animated: false,
    colour: 'deeppink', textColour: 'white',
    effect: { type: 'demand', censusStat: 'arcadePop', valve: 'commercial', weight: 0.5 },
  },
  // Nothing fed the industrial valve before this one -- Schools and Casinos cover
  // residential and commercial, and industry had to grow entirely on its own. Priced
  // just under the Casino because industrial demand drags pollution along with it,
  // so it wants to be the slightly easier sell of the two, not the better deal.
  {
    id: 'dataCentre', label: 'Data Centre', cost: 4000, size: 4, animated: false,
    colour: 'darkslategray', textColour: 'white',
    effect: { type: 'demand', censusStat: 'dataCentrePop', valve: 'industrial', weight: 1 },
  },
  // The School's counterpart in the same way the Casino is the Arcade's: one of these
  // is worth six Schools toward the residential ceiling, for $4500 against their
  // $4800 -- and, the part that actually matters late on, 16 tiles against their 54.
  {
    id: 'university', label: 'University', cost: 4500, size: 4, animated: false,
    colour: 'darkred', textColour: 'white',
    effect: { type: 'demand', censusStat: 'universityPop', valve: 'residential', weight: 6 },
  },
  // The top of the land-value ladder: more than the Hospital's 400, at 1.5x its
  // price and with none of the Hospital's separate role in the city's own health
  // bookkeeping. Somewhere to put money once a neighbourhood already has everything
  // it needs and you want it to be worth more anyway.
  {
    id: 'museum', label: 'Museum', cost: 1500, size: 3, animated: false,
    colour: 'saddlebrown', textColour: 'white',
    effect: { type: 'coverage', censusStat: 'museumPop', landValueEffect: 500 },
  },
  // b0r3d.org's own cat, as a civic monument -- see rukus.html on the main site.
  // A coverage building rather than a demand one: the joke only works if having him
  // in the neighbourhood is straightforwardly a good thing, and 450 puts him just
  // above the Hospital's 400 and below the Museum's 500.
  {
    id: 'rukus', label: 'Rukus', cost: 3000, size: 4, animated: false,
    colour: 'slategray', textColour: 'white',
    effect: { type: 'coverage', censusStat: 'rukusPop', landValueEffect: 450 },
  },
  // The heaviest commercial draw in the game, and priced like it. Weight 2 means one
  // of these pulls as hard as two Casinos, which is the point of a $6000 building
  // that also eats a 4x4 of land.
  {
    id: 'amusementPark', label: 'Amusement Park', cost: 6000, size: 4, animated: false,
    colour: 'orangered', textColour: 'white',
    effect: { type: 'demand', censusStat: 'amusementParkPop', valve: 'commercial', weight: 2 },
  },
  // Big-box retail. Deliberately not named after the obvious real chain -- see the
  // rename this whole project went through, and keep allusions coy.
  {
    id: 'megamart', label: 'Megamart', cost: 3500, size: 4, animated: false,
    colour: 'steelblue', textColour: 'white',
    effect: { type: 'demand', censusStat: 'megamartPop', valve: 'commercial', weight: 1.5 },
  },
  // The cheapest thing on the toolbar that does anything at all, and the smallest
  // commercial nudge to match -- five of them are worth about one Casino.
  {
    id: 'bar', label: 'Bar', cost: 600, size: 3, animated: false,
    colour: 'darkolivegreen', textColour: 'white',
    effect: { type: 'demand', censusStat: 'barPop', valve: 'commercial', weight: 0.3 },
  },
  // Fast food, same naming caution as Megamart above.
  {
    id: 'burgerBaron', label: 'Burger Baron', cost: 900, size: 3, animated: false,
    colour: 'gold', textColour: 'black',
    effect: { type: 'demand', censusStat: 'burgerBaronPop', valve: 'commercial', weight: 0.4 },
  },
  // Future buildings just get appended here -- tile IDs below are computed
  // automatically from size + position in this list, never hand-picked.
  //
  // Tile budget: the sheets are 512x608, i.e. 1216 tiles, and the list above ends at
  // 1198, leaving 17. Both sheets were grown from 576 to 608 to fit the last five
  // buildings -- tileSet.js derives its tile count from the sheet's height, so nothing
  // in the code caps this, but the art files have to grow first, and every added row
  // costs startup time: TileSet slices each tile through canvas.toDataURL at roughly
  // 5.5ms a tile, across two sheets. Grow by the smallest whole number of rows that
  // fits what's being added, not in generous round numbers.
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
