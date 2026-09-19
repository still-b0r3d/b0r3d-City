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

// What the Tools panel is built from. Before v0.89.6 the sixteen engine tools were
// hand-authored <button>s in index.html and the custom buildings were appended after
// them from customBuildings.js -- which is why the panel was 34 buttons in registry
// order, i.e. the order things happened to get added. Both halves now come through
// here, in groups, and index.html holds no tool markup at all.
//
// Adding a custom building is still only a customBuildings.js entry: everything below
// reads that list generically (including the blurb, which is derived from the same
// `effect` the simulation uses -- see describeEffect). Only the sixteen engine tools
// are named individually here, because only they have no registry of their own.

import { CUSTOM_BUILDINGS } from './customBuildings.js';
import * as TileValues from './tileValues.ts';

// Group order is the order they appear in the panel, and it is deliberate rather than
// alphabetical: the things a player reaches for every few seconds are at the top, and
// the things they place once a decade are at the bottom.
//
// Transport is only Road and Rail, which looks thin next to Services' seven -- that is
// the point. They are the two most-clicked tools in the game and they sit directly
// under the pinned pair where the pointer already is. Port and Airport are in Industry
// with the Data Centre instead: all three are big, expensive, and placed for what they
// do to industrial demand rather than to move anyone around.
var GROUPS = [
  { id: 'zones',      label: 'Zones' },
  { id: 'transport',  label: 'Transport' },
  { id: 'power',      label: 'Power' },
  { id: 'industry',   label: 'Industry' },
  { id: 'services',   label: 'Services' },
  { id: 'leisure',    label: 'Leisure' },
  { id: 'landmarks',  label: 'Landmarks' }
];


// The sixteen tools the engine ships with. `cost` here is the display figure, matching
// what the buttons said before this file existed, and is also what the affordability
// check uses -- so it has to be what the tool will actually charge for one ordinary
// use. That is GameTools' own figure for all of them but Bulldozer, whose constructor
// cost (10) is the zone-clearing case: BulldozerTool.layDoze charges 1 for a plain
// tile, which is the case a player meets.
//
// `icon` is a tile id in images/tiles.png, drawn as a 16x16 crop by the toolbar (see
// style.css's .toolIcon). Query and Bulldozer have no tile of their own -- they aren't
// things you place -- so they carry a glyph instead.
//
// `key` is a keyboard shortcut. Deliberately only the tools reached for constantly:
// thirty-four letters nobody can remember is worse than nine anybody can.
var ENGINE_TOOLS = [
  { id: 'residential', label: 'Residential', cost: 100,   size: 3, colour: 'lime',       group: 'zones',     icon: TileValues.FREEZ,         key: '1',
    blurb: 'Somewhere to live. Grows on land value once it has power and a road.' },
  { id: 'commercial',  label: 'Commercial',  cost: 100,   size: 3, colour: 'blue',       group: 'zones',     icon: TileValues.COMCLR,        key: '2',
    blurb: 'Shops and offices. Wants traffic as much as it wants power.' },
  { id: 'industrial',  label: 'Industrial',  cost: 100,   size: 3, colour: 'yellow',     group: 'zones',     icon: TileValues.INDCLR,        key: '3',
    blurb: 'Jobs, and the pollution that comes with them. Keep it downwind.' },

  { id: 'road',        label: 'Road',        cost: 10,    size: 1, colour: 'black',      group: 'transport', icon: TileValues.ROADBASE,      key: '4',
    blurb: 'Drag to lay a run. Everything needs one; heavy traffic wears them out.' },
  { id: 'rail',        label: 'Rail',        cost: 20,    size: 1, colour: 'brown',      group: 'transport', icon: TileValues.RAILBASE,      key: '5',
    blurb: 'Twice the price of road and carries far more. Costs more to maintain.' },

  { id: 'wire',        label: 'Wire',        cost: 5,     size: 1, colour: 'khaki',      group: 'power',     icon: TileValues.LHPOWER,       key: '6',
    blurb: 'Carries power from a plant to a zone. Zones touching a powered zone need none.' },
  { id: 'coal',        label: 'Coal',        cost: 3000,  size: 4, colour: 'gray',       group: 'power',     icon: TileValues.POWERPLANT,
    blurb: 'Cheap power, and a pollution source that never stops.' },
  { id: 'nuclear',     label: 'Nuclear',     cost: 5000,  size: 4, colour: 'mistyrose',  group: 'power',     icon: TileValues.NUCLEAR,
    blurb: 'Clean, and far more power per plant. Can melt down.' },

  { id: 'port',        label: 'Port',        cost: 3000,  size: 4, colour: 'dodgerblue', group: 'industry',  icon: TileValues.PORT,
    blurb: 'Needs water along one side. Industry will not grow far past this.' },
  { id: 'airport',     label: 'Airport',     cost: 10000, size: 6, colour: 'violet',     group: 'industry',  icon: TileValues.AIRPORT,
    blurb: 'The biggest footprint in the game, and what late commerce waits on.' },

  { id: 'police',      label: 'Police',      cost: 500,   size: 3, colour: 'darkblue',   group: 'services',  icon: TileValues.POLICESTATION,
    blurb: 'Cuts crime in a radius. Funded from the budget -- underfund it and it stops working.' },
  { id: 'fire',        label: 'Fire',        cost: 500,   size: 3, colour: 'red',        group: 'services',  icon: TileValues.FIRESTATION,
    blurb: 'Stops fires spreading in a radius. Same funding caveat as the police.' },

  { id: 'park',        label: 'Park',        cost: 10,    size: 1, colour: 'darkgreen',  group: 'leisure',   icon: TileValues.WOODS,         key: '7',
    blurb: 'Scatters woods and the odd fountain. Pretty; does nothing for land value.' },
  { id: 'stadium',     label: 'Stadium',     cost: 5000,  size: 4, colour: 'indigo',     group: 'leisure',   icon: TileValues.STADIUM,
    blurb: 'A city of any size is expected to have one. Residents notice if it does not.' }
];


// Query and Bulldozer sit above the groups and outside them. They are verbs rather
// than buildings -- you reach for them between placing other things, not instead of
// placing them -- and burying either one inside a collapsed group would be daft.
var PINNED_TOOLS = [
  { id: 'query',     label: 'Query',    cost: 0, size: 1, colour: 'cyan',   glyph: '?', key: 'q',
    blurb: 'Click any tile to read what the simulation thinks of it.' },
  { id: 'bulldozer', label: 'Bulldoze', cost: 1, size: 1, colour: 'salmon', glyph: '✕', key: 'x',
    blurb: 'Clears a tile. Drag to clear a run. Zones cost more than bare ground.' }
];


// Which group each custom building belongs in. Kept here rather than as a `group` field
// in customBuildings.js so that file stays what its own header says it is -- a
// description of what a building *does* in the simulation, with nothing about how it is
// presented. A building missing from this map falls into 'landmarks', so adding one
// without touching this file still works; it just may not land where you wanted.
var CUSTOM_GROUPS = {
  hospital: 'services',
  school: 'services',
  university: 'services',
  library: 'services',
  recyclingCentre: 'services',

  largePark: 'leisure',
  arcade: 'leisure',
  casino: 'leisure',
  amusementPark: 'leisure',
  bar: 'leisure',
  burgerBaron: 'leisure',
  megamart: 'leisure',

  dataCentre: 'industry',

  museum: 'landmarks',
  rukus: 'landmarks',
  arch: 'landmarks',
  observatory: 'landmarks',
  cityHall: 'landmarks'
};


// The tooltip's second line for a custom building, read off the same `effect` the
// simulation runs on. Derived rather than written per building so customBuildings.js
// stays the only file a new building has to touch -- and so the tooltip cannot drift
// away from what the building actually does, which a hand-written line would.
var describeEffect = function(effect) {
  if (!effect)
    return '';

  if (effect.type === 'coverage')
    return 'Raises land value nearby, by ' + effect.landValueEffect + ' at its strongest.';

  if (effect.type === 'cleanup')
    return 'Pulls pollution down in a radius around it.';

  if (effect.type === 'demand') {
    var valve = effect.valve === 'residential' ? 'people wanting to move in' :
                effect.valve === 'commercial' ? 'demand for shops and offices' :
                'demand for industry';
    var weight = effect.weight === 1 ? '' :
                 effect.weight > 1 ? ' Worth ' + effect.weight + ' ordinary ones.' :
                 ' A small nudge rather than a shove.';
    return 'Raises ' + valve + '.' + weight;
  }

  return '';
};


var customToolEntry = function(building) {
  return {
    id: building.id,
    label: building.label,
    cost: building.cost,
    size: building.size,
    colour: building.colour,
    textColour: building.textColour,
    group: CUSTOM_GROUPS[building.id] || 'landmarks',
    icon: building.centreTile,
    blurb: describeEffect(building.effect)
  };
};


// Groups, in panel order, each with its tools in the order declared above and then its
// custom buildings in customBuildings.js order. Computed once at module load: nothing
// here changes during a game.
var TOOL_GROUPS = (function() {
  var byId = {};
  var groups = GROUPS.map(function(group) {
    var entry = { id: group.id, label: group.label, tools: [] };
    byId[group.id] = entry;
    return entry;
  });

  ENGINE_TOOLS.forEach(function(tool) {
    byId[tool.group].tools.push(tool);
  });

  CUSTOM_BUILDINGS.forEach(function(building) {
    var tool = customToolEntry(building);
    byId[tool.group].tools.push(tool);
  });

  return groups;
})();


// Every tool in one flat list, pinned pair first -- for the hotkey table and for
// anything that wants to look a tool up without caring which group it is in.
var ALL_TOOLS = PINNED_TOOLS.concat(TOOL_GROUPS.reduce(function(acc, group) {
  return acc.concat(group.tools);
}, []));


// Every tool by its data-tool id, for anything that has an id and wants the entry.
var TOOLS_BY_ID = (function() {
  var byId = {};
  ALL_TOOLS.forEach(function(tool) {
    byId[tool.id] = tool;
  });
  return byId;
})();


var TOOLS_BY_KEY = (function() {
  var byKey = {};
  ALL_TOOLS.forEach(function(tool) {
    if (tool.key)
      byKey[tool.key] = tool.id;
  });
  return byKey;
})();


export { TOOL_GROUPS, PINNED_TOOLS, ALL_TOOLS, TOOLS_BY_ID, TOOLS_BY_KEY };
