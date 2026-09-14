/* b0r3d-city dev menu -- things done to a city.
 *
 * Only ever loaded as part of the dev chunk (see src/devMode.js). Everything here works
 * through the engine's own objects and tools, the same calls the game makes, so a
 * result seen here is a result the game would give. None of these mark the city as
 * cheated on their own -- panel.js does that around every call that changes the city.
 */

import { BaseTool } from '../baseTool.js';
import { CUSTOM_BUILDINGS } from '../customBuildings.js';
import * as Messages from '../messages.ts';
import * as SpriteConstants from '../spriteConstants.ts';
import { SpriteUtils } from '../spriteUtils.js';
import * as TileFlags from '../tileFlags.ts';
import { TileUtils } from '../tileUtils.js';
import * as TileValues from '../tileValues.ts';


var SPRITE_NAMES = {};
SPRITE_NAMES[SpriteConstants.SPRITE_TRAIN] = 'train';
SPRITE_NAMES[SpriteConstants.SPRITE_HELICOPTER] = 'helicopter';
SPRITE_NAMES[SpriteConstants.SPRITE_AIRPLANE] = 'plane';
SPRITE_NAMES[SpriteConstants.SPRITE_SHIP] = 'ship';
SPRITE_NAMES[SpriteConstants.SPRITE_MONSTER] = 'monster';
SPRITE_NAMES[SpriteConstants.SPRITE_TORNADO] = 'tornado';
SPRITE_NAMES[SpriteConstants.SPRITE_EXPLOSION] = 'explosion';
SPRITE_NAMES[SpriteConstants.SPRITE_ZOMBIE] = 'zombie';

var TOOL_RESULTS = ['ok', 'failed', 'no money', 'needs bulldozing'];

var FLAG_NAMES = [
  [TileFlags.POWERBIT, 'POWER'],
  [TileFlags.CONDBIT, 'COND'],
  [TileFlags.BURNBIT, 'BURN'],
  [TileFlags.BULLBIT, 'BULL'],
  [TileFlags.ANIMBIT, 'ANIM'],
  [TileFlags.ZONEBIT, 'ZONE']
];


var inRange = function(v, lo, hi) {
  return v >= lo && v <= hi;
};


// What a tile value is, in words. Ordered the same way mapWindow.js's baseColourFor
// classifies tiles, and from the same named ranges, so the two can't disagree about
// what something is.
var describeTile = function(v) {
  for (var i = 0; i < CUSTOM_BUILDINGS.length; i++) {
    var b = CUSTOM_BUILDINGS[i];
    if (inRange(v, b.baseTile, b.lastTile))
      return b.label + (v === b.centreTile ? ' (centre)' : '') + ' [custom ' + b.baseTile + '-' + b.lastTile + ']';
  }

  if (v === TileValues.DIRT) return 'dirt';
  if (inRange(v, TileValues.WATER_LOW, TileValues.WATER_HIGH)) return 'water';
  if (inRange(v, TileValues.WOODS_LOW, TileValues.WOODS5)) return 'woods';
  if (inRange(v, TileValues.RUBBLE, TileValues.LASTRUBBLE)) return 'rubble';
  if (inRange(v, TileValues.FLOOD, TileValues.LASTFLOOD)) return 'flood';
  if (v === TileValues.RADTILE) return 'radioactive';
  if (inRange(v, TileValues.FIREBASE, TileValues.LASTFIRE)) return 'fire';
  if (inRange(v, TileValues.ROADBASE, TileValues.LASTROAD)) return 'road';
  if (inRange(v, TileValues.POWERBASE, TileValues.LASTPOWER)) return 'power line';
  if (inRange(v, TileValues.RAILBASE, TileValues.LASTRAIL)) return 'rail';
  if (v >= TileValues.RESBASE && v < TileValues.COMBASE) return 'residential';
  if (v >= TileValues.COMBASE && v < TileValues.INDBASE) return 'commercial';
  if (v >= TileValues.INDBASE && v < TileValues.PORTBASE) return 'industrial';
  if (inRange(v, TileValues.PORTBASE, TileValues.LASTPORT)) return 'seaport';
  if (v >= TileValues.AIRPORTBASE && v < TileValues.COALBASE) return 'airport';
  if (inRange(v, TileValues.COALBASE, TileValues.LASTPOWERPLANT)) return 'coal power';
  if (v >= TileValues.FIRESTBASE && v < TileValues.POLICESTBASE) return 'fire station';
  if (v >= TileValues.POLICESTBASE && v < TileValues.STADIUMBASE) return 'police station';
  if (v >= TileValues.STADIUMBASE && v < TileValues.NUCLEARBASE) return 'stadium';
  if (inRange(v, TileValues.NUCLEARBASE, TileValues.LASTZONE)) return 'nuclear power';
  if (inRange(v, TileValues.HBRDG0, TileValues.HBRDG3) || inRange(v, TileValues.VBRDG0, TileValues.VBRDG3)) return 'drawbridge';
  if (inRange(v, TileValues.TINYEXP, TileValues.LASTTINYEXP)) return 'explosion debris';
  if (v >= TileValues.FOUNTAIN && v < TileValues.INDBASE2) return 'fountain/park';
  return 'animation frame / other';
};


var flagNames = function(flags) {
  var names = FLAG_NAMES.filter(function(pair) {
    return (flags & pair[0]) !== 0;
  }).map(function(pair) {
    return pair[1];
  });

  return names.length ? names.join(' ') : 'none';
};


// Everything the menu shows about one tile, including every block map's reading for the
// block it falls in.
var inspectTile = function(game, x, y) {
  var map = game.gameMap;
  if (!map.testBounds(x, y))
    return null;

  var value = map.getTileValue(x, y);
  var flags = map.getTileFlags(x, y);
  var blockMaps = game.simulation.blockMaps;

  return {
    x: x,
    y: y,
    value: value,
    flags: flags,
    flagNames: flagNames(flags),
    kind: describeTile(value),
    blocks: Object.keys(blockMaps).map(function(key) {
      var bm = blockMaps[key];
      return {key: key, size: bm.blockSize, value: bm.worldGet(x, y)};
    })
  };
};


var forEachTile = function(map, fn) {
  for (var x = 0; x < map.width; x++)
    for (var y = 0; y < map.height; y++)
      fn(x, y, map.getTileValue(x, y));
};


var extinguishFires = function(game) {
  var map = game.gameMap;
  var count = 0;

  forEachTile(map, function(x, y, v) {
    if (inRange(v, TileValues.FIREBASE, TileValues.LASTFIRE)) {
      map.setTo(x, y, TileUtils.randomRubble());
      count++;
    }
  });

  return count;
};


var drainFloods = function(game) {
  var map = game.gameMap;
  var count = 0;

  forEachTile(map, function(x, y, v) {
    if (inRange(v, TileValues.FLOOD, TileValues.LASTFLOOD)) {
      map.setTile(x, y, TileValues.DIRT, 0);
      count++;
    }
  });

  game.simulation.disasterManager._floodCount = 0;
  return count;
};


var clearRubble = function(game) {
  var map = game.gameMap;
  var count = 0;

  forEachTile(map, function(x, y, v) {
    if (inRange(v, TileValues.RUBBLE, TileValues.LASTRUBBLE) || inRange(v, TileValues.TINYEXP, TileValues.LASTTINYEXP) ||
        v === TileValues.RADTILE) {
      map.setTile(x, y, TileValues.DIRT, 0);
      count++;
    }
  });

  return count;
};


// Straight to dirt, flags and all -- clearing only the value leaves the old terrain's
// flag bits behind, and prepareBuildingSite then still refuses the site.
var clearArea = function(game, x0, y0, w, h) {
  var map = game.gameMap;
  var count = 0;

  for (var x = Math.max(0, x0); x < Math.min(map.width, x0 + w); x++) {
    for (var y = Math.max(0, y0); y < Math.min(map.height, y0 + h); y++) {
      map.setTile(x, y, TileValues.DIRT, 0);
      count++;
    }
  }

  return count;
};


// Through the tool itself: doTool stages the change, modifyIfEnoughFunding lands it.
// `free` lifts the cost for this one placement only, whatever the Free Build switch is.
var placeTool = function(game, toolName, x, y, free) {
  var tool = game.inputStatus.gameTools[toolName];
  if (!tool || typeof tool.doTool !== 'function')
    throw new Error('No tool called ' + toolName);

  var wasFree = BaseTool.getFreeBuild();
  if (free)
    BaseTool.setFreeBuild(true);

  try {
    tool.doTool(x, y, game.simulation.blockMaps);
    tool.modifyIfEnoughFunding(game.simulation.budget);
  } finally {
    BaseTool.setFreeBuild(wasFree);
  }

  return TOOL_RESULTS[tool.result] || String(tool.result);
};


// Every custom building, left to right from (x, y), wrapping to a new row at the map's
// edge. Each site is cleared to dirt first, so it works anywhere on the map. For
// checking art, Query names and bulldozing across the whole registry in one go.
var placeAllBuildings = function(game, x, y) {
  var map = game.gameMap;
  var left = x;
  var cursorX = x;
  var cursorY = y;
  var placed = 0;

  CUSTOM_BUILDINGS.forEach(function(building) {
    if (cursorX + building.size > map.width) {
      cursorX = left;
      cursorY += 5;
    }

    if (cursorY + building.size > map.height)
      return;

    clearArea(game, cursorX, cursorY, building.size, building.size);
    // A building's doTool point is one in from its top-left corner at either size.
    if (placeTool(game, building.id, cursorX + 1, cursorY + 1, true) === 'ok')
      placed++;

    cursorX += building.size + 1;
  });

  return placed + ' of ' + CUSTOM_BUILDINGS.length + ' placed';
};


// A small powered, road-connected grid of zones, for watching growth on a fresh map
// without building it by hand. 36x26 tiles from (x, y):
//
//   - two coal plants down the left edge -- one alone (700 units) comes up a unit short
//     for sixty zones plus their wiring, and the top band browns out
//   - a wire running down beside them, which roads cross as powered crossings
//   - roads across the full width at rows 4, 11, 18 and 25
//   - two rows of 3x3 zones between each pair of roads, touching a road and each other,
//     so power passes from the wire along every row
//
// Residential in the top band, commercial over residential in the middle, industrial at
// the bottom. All free.
var TOWN_W = 36;
var TOWN_H = 26;

var stampTestTown = function(game, x, y) {
  var map = game.gameMap;
  var ox = Math.max(0, Math.min(x, map.width - TOWN_W));
  var oy = Math.max(0, Math.min(y, map.height - TOWN_H));
  var results = {};
  var tally = function(result) {
    results[result] = (results[result] || 0) + 1;
  };

  clearArea(game, ox, oy, TOWN_W, TOWN_H);

  tally(placeTool(game, 'coal', ox + 1, oy + 1, true));

  for (var wy = oy; wy < oy + TOWN_H; wy++)
    tally(placeTool(game, 'wire', ox + 4, wy, true));

  [4, 11, 18, 25].forEach(function(dy) {
    for (var rx = ox; rx < ox + TOWN_W; rx++)
      tally(placeTool(game, 'road', rx, oy + dy, true));
  });

  // Rows 12-15, between the second and third roads, still against the wire.
  tally(placeTool(game, 'coal', ox + 1, oy + 13, true));

  var bands = [['residential', 'residential'], ['commercial', 'residential'], ['industrial', 'industrial']];
  bands.forEach(function(band, i) {
    var roadY = oy + 4 + i * 7;

    band.forEach(function(zone, j) {
      var centreY = roadY + 2 + j * 3;
      for (var cx = ox + 6; cx + 1 < ox + TOWN_W; cx += 3)
        tally(placeTool(game, zone, cx, centreY, true));
    });
  });

  return (ox !== x || oy !== y ? 'moved to ' + ox + ',' + oy + ' to fit, ' : '') + Object.keys(results).map(function(key) {
    return results[key] + ' placements ' + key;
  }).join(', ');
};


var clearMap = function(game) {
  var map = game.gameMap;
  clearArea(game, 0, 0, map.width, map.height);
  return map.width * map.height + ' tiles';
};


// The at-a-tile disasters and vehicles. The global versions the game already has are
// called straight from panel.js; these are the ones that only exist as a "somewhere
// random" in the engine, pinned to a chosen tile instead.
var atTile = {
  fire: function(game, x, y) {
    var dm = game.simulation.disasterManager;
    game.gameMap.setTo(x, y, TileUtils.randomFire());
    dm._emitEvent(Messages.FIRE_REPORTED, {showable: true, x: x, y: y});
  },

  flood: function(game, x, y) {
    var dm = game.simulation.disasterManager;
    game.gameMap.setTile(x, y, TileValues.FLOOD, 0);
    dm._floodCount = 30;
    dm._emitEvent(Messages.FLOODING_REPORTED, {showable: true, x: x, y: y});
  },

  explosion: function(game, x, y) {
    game.simulation.spriteManager.makeExplosion(x, y);
  },

  tornado: function(game, x, y) {
    var sm = game.simulation.spriteManager;
    var sprite = sm.makeSprite(SpriteConstants.SPRITE_TORNADO, SpriteUtils.worldToPix(x), SpriteUtils.worldToPix(y));
    sm._emitEvent(Messages.TORNADO_SIGHTED, {trackable: true, x: x, y: y, sprite: sprite});
  },

  monster: function(game, x, y) {
    game.simulation.spriteManager.makeMonsterAt(x, y);
  },

  zombie: function(game, x, y) {
    game.simulation.spriteManager.makeZombieAt(x, y);
  },

  meltdown: function(game, x, y) {
    game.simulation.disasterManager.doMeltdown(x, y);
  },

  plane: function(game, x, y) {
    var sm = game.simulation.spriteManager;
    if (sm.getSprite(SpriteConstants.SPRITE_AIRPLANE) !== null)
      return 'there is already a plane (one at a time)';
    sm.generatePlane(x, y);
  },

  helicopter: function(game, x, y) {
    var sm = game.simulation.spriteManager;
    if (sm.getSprite(SpriteConstants.SPRITE_HELICOPTER) !== null)
      return 'there is already a helicopter (one at a time)';
    sm.generateCopter(x, y);
  },

  ship: function(game, x, y) {
    game.simulation.spriteManager.makeShipHere(x, y);
  },

  train: function(game, x, y) {
    game.simulation.spriteManager.makeSprite(SpriteConstants.SPRITE_TRAIN,
      SpriteUtils.worldToPix(x) + 8, SpriteUtils.worldToPix(y) + 8);
  }
};


var killSprite = function(game, sprite) {
  sprite.frame = 0;
  game.simulation.spriteManager.pruneDeadSprites();
};


var killAllSprites = function(game) {
  var sm = game.simulation.spriteManager;
  var count = sm.spriteList.length;
  sm.spriteList.forEach(function(sprite) {
    sprite.frame = 0;
  });
  sm.pruneDeadSprites();
  return count;
};


export {
  SPRITE_NAMES, describeTile, flagNames, inspectTile, extinguishFires, drainFloods, clearRubble, clearArea,
  placeTool, placeAllBuildings, stampTestTown, clearMap, atTile, killSprite, killAllSprites
};
