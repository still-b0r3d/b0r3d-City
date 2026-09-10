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

import { ModalWindow } from './modalWindow.js';
import { MAP_WINDOW_CLOSED } from './messages.ts';
import * as TileValues from './tileValues.ts';
import * as TileFlags from './tileFlags.ts';

// The city-wide data map, restoring the one piece of the 1989 original that this port
// never had: a whole-map view with selectable data overlays (crime, pollution, land
// value, population, traffic, growth, service coverage, power).
//
// The data itself was never the missing part. Simulation builds and refreshes fourteen
// BlockMaps every tick (see simulation.js's blockMaps) because zone growth and decay
// read them -- the sim cannot run without them. Nothing had ever rendered one. Until
// this window the only way to see crime or land value was the Query tool, one tile at
// a time, which is exactly what the original micropolisJS About page told players to
// do instead.
//
// A floating window rather than another entry in the left-hand column: at 120x100
// tiles this wants to be a few hundred pixels square to be readable at all, which is
// two to three times the height that column has to give (see Panel.setColumn's
// shrinkColumnToFit -- a panel this tall there would squeeze Town Info and the demand
// graph to their floors on anything but a very tall window). Non-blocking like Query
// and Evaluation, and for the same reason: it exists to watch a live city, so freezing
// the sim to look at it would defeat the point.


// Both the overlay colours and #mapLegendBar's CSS gradient are generated from these,
// so the legend cannot drift out of step with what is drawn on the map.
// Each stop is [position 0-1, r, g, b].
//
// Viridis for the "more of this" maps (population, land value, coverage): perceptually
// uniform, and readable without colour discrimination in a way green-to-red is not.
var RAMP_SEQUENTIAL = [
  [0.0, 68, 1, 84], [0.25, 59, 82, 139], [0.5, 33, 145, 140],
  [0.75, 94, 201, 98], [1.0, 253, 231, 37]
];

// The "this is a problem" maps (crime, pollution, traffic). Pale yellow through to red
// rather than green through red: alpha carries the low end (see sampleBlockMap -- a
// near-zero value is nearly transparent and simply shows the city underneath), so the
// ramp never needs a "good" colour of its own, and never asks the player to tell red
// from green to read it.
var RAMP_HAZARD = [
  [0.0, 255, 245, 160], [0.5, 255, 160, 40], [1.0, 200, 12, 12]
];

// Service coverage (police, fire, and this fork's own civic land-value buildings).
// Deliberately a different family from both of the above: coverage is neither a problem
// nor a quantity of city, it is a question of where the map is and is not looked after,
// and reads best as its own colour.
var RAMP_COVERAGE = [
  [0.0, 40, 30, 90], [0.5, 70, 130, 210], [1.0, 190, 240, 255]
];

// Rate of growth is the one signed map (-200 to +200), so it gets a diverging ramp with
// the neutral point in the middle. Alpha comes from distance either side of that centre
// (see the growth entry below), so a stable neighbourhood shows as plain city rather
// than as a colour the player has to decode as "nothing happening".
var RAMP_GROWTH = [
  [0.0, 200, 30, 30], [0.5, 130, 130, 130], [1.0, 40, 200, 60]
];


// Linear interpolation between the two ramp stops either side of t, which is clamped to
// 0-1 -- callers normalise their own map's range before calling.
var rampColour = function(ramp, t) {
  if (t <= 0)
    return [ramp[0][1], ramp[0][2], ramp[0][3]];

  var last = ramp[ramp.length - 1];
  if (t >= 1)
    return [last[1], last[2], last[3]];

  for (var i = 1; i < ramp.length; i++) {
    if (t > ramp[i][0])
      continue;

    var lo = ramp[i - 1];
    var hi = ramp[i];
    var span = hi[0] - lo[0];
    var f = span === 0 ? 0 : (t - lo[0]) / span;

    return [
      Math.round(lo[1] + (hi[1] - lo[1]) * f),
      Math.round(lo[2] + (hi[2] - lo[2]) * f),
      Math.round(lo[3] + (hi[3] - lo[3]) * f)
    ];
  }

  return [last[1], last[2], last[3]];
};


// The legend bar under the map, built from the same ramp array the pixels are, so the
// two cannot disagree.
var rampToCSSGradient = function(ramp) {
  var stops = ramp.map(function(stop) {
    return 'rgb(' + stop[1] + ',' + stop[2] + ',' + stop[3] + ') ' + Math.round(stop[0] * 100) + '%';
  });

  return 'linear-gradient(to right, ' + stops.join(', ') + ')';
};


// The base map: every tile classified into one of a handful of colours, the way a
// minimap has always done it. Deliberately NOT painted from the tile sheet -- at one
// screen pixel per tile there is nothing of a 16x16 tile left to see, and TileSet holds
// each tile as its own Image (see tileSet.js), so 12,000 drawImage calls would cost far
// more than the flat colour they would average out to anyway.
//
// Ordered by tile value, and every range is a named constant from tileValues.ts, so
// this stays correct if the engine's tile layout is renumbered again (it was, on
// 2026-09-08 -- see the custom-building note at the end of that file).
var baseColourFor = function(tileValue) {
  // b0r3d-city's own civic buildings live past the original engine's range entirely.
  if (tileValue >= 1024)
    return [150, 120, 190];

  if (tileValue === TileValues.DIRT)
    return [186, 172, 138];

  if (tileValue >= TileValues.WATER_LOW && tileValue <= TileValues.WATER_HIGH)
    return [56, 100, 168];

  if (tileValue >= TileValues.WOODS_LOW && tileValue <= TileValues.WOODS5)
    return [64, 122, 62];

  if (tileValue >= TileValues.RUBBLE && tileValue <= TileValues.LASTRUBBLE)
    return [124, 116, 100];

  if (tileValue >= TileValues.FLOOD && tileValue <= TileValues.LASTFLOOD)
    return [90, 150, 200];

  if (tileValue === TileValues.RADTILE)
    return [140, 220, 60];

  if (tileValue >= TileValues.FIREBASE && tileValue <= TileValues.LASTFIRE)
    return [240, 120, 20];

  if (tileValue >= TileValues.ROADBASE && tileValue <= TileValues.LASTROAD)
    return [70, 70, 74];

  if (tileValue >= TileValues.POWERBASE && tileValue <= TileValues.LASTPOWER)
    return [210, 190, 90];

  if (tileValue >= TileValues.RAILBASE && tileValue <= TileValues.LASTRAIL)
    return [110, 82, 62];

  // The three zone families, each running from its own base up to the next one's.
  if (tileValue >= TileValues.RESBASE && tileValue < TileValues.COMBASE)
    return [70, 200, 70];

  if (tileValue >= TileValues.COMBASE && tileValue < TileValues.INDBASE)
    return [70, 110, 230];

  if (tileValue >= TileValues.INDBASE && tileValue < TileValues.PORTBASE)
    return [225, 205, 60];

  if (tileValue >= TileValues.PORTBASE && tileValue <= TileValues.LASTPORT)
    return [80, 160, 200];

  if (tileValue >= TileValues.AIRPORTBASE && tileValue < TileValues.COALBASE)
    return [190, 130, 210];

  if (tileValue >= TileValues.COALBASE && tileValue <= TileValues.LASTPOWERPLANT)
    return [90, 90, 96];

  if (tileValue >= TileValues.FIRESTBASE && tileValue < TileValues.POLICESTBASE)
    return [210, 60, 60];

  if (tileValue >= TileValues.POLICESTBASE && tileValue < TileValues.STADIUMBASE)
    return [40, 60, 160];

  if (tileValue >= TileValues.STADIUMBASE && tileValue < TileValues.NUCLEARBASE)
    return [130, 60, 170];

  if (tileValue >= TileValues.NUCLEARBASE && tileValue <= TileValues.LASTZONE)
    return [180, 220, 90];

  // Bridges read as road on a map of this size, whatever their tile range says.
  if (tileValue >= TileValues.HBRDG0 && tileValue <= TileValues.HBRDG3)
    return [70, 70, 74];

  if (tileValue >= TileValues.VBRDG0 && tileValue <= TileValues.VBRDG3)
    return [70, 70, 74];

  if (tileValue >= TileValues.FOUNTAIN && tileValue < TileValues.INDBASE2)
    return [80, 150, 80];

  // Everything left is animation frames and engine filler (smoke, explosions, the
  // stadium's match animation) sitting on top of a zone that is already coloured around
  // it -- a neutral grey reads as "built" without pretending to be a category.
  return [120, 120, 126];
};


// Under a data overlay the city has to stop competing with the data: without this a
// bright yellow industrial zone and a high pollution reading are the same colour, and
// the overlay is least readable exactly where it matters most. Desaturated and lifted
// towards mid-grey, the base keeps every road, coastline and zone edge the player
// navigates by, and gives the ramp a neutral ground to sit on.
var toBackdrop = function(rgb) {
  var grey = Math.round(rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11);
  var muted = Math.round(grey * 0.55 + 40);

  return [muted, muted, muted];
};


// The BlockMap-backed overlays all sample the same way: read the block this tile falls
// in, normalise into 0-1 against the range simulation.js documents for that map, and
// take both a ramp colour and an alpha from it. Alpha rising with the value is what
// makes a quiet map look quiet -- the low end fades out to the city underneath instead
// of flooding the window with the ramp's first colour.
//
// MIN_VISIBLE_ALPHA keeps a genuinely nonzero reading from being invisible; a true zero
// returns null and paints no overlay at all.
var MIN_VISIBLE_ALPHA = 0.25;
var MAX_ALPHA = 0.88;

var sampleBlockMap = function(blockMap, x, y, max, ramp) {
  var value = blockMap.worldGet(x, y);
  if (value <= 0)
    return null;

  var t = Math.min(1, value / max);
  var colour = rampColour(ramp, t);

  return [colour[0], colour[1], colour[2], MIN_VISIBLE_ALPHA + (MAX_ALPHA - MIN_VISIBLE_ALPHA) * t];
};


// Every view the window offers. `blockMap`/`max` name the map in simulation.js's
// blockMaps and the top of the range documented there; `sample`/`sampleTile` override
// that for the two views that are not a straight 0-to-max read (growth is signed, power
// is a tile flag rather than a BlockMap at all).
var OVERLAYS = [
  {
    id: 'city', label: 'City',
    description: 'The whole city at a glance.'
  },
  {
    id: 'population', label: 'Population Density',
    blockMap: 'populationDensityMap', max: 510, ramp: RAMP_SEQUENTIAL,
    low: 'Empty', high: 'Packed',
    description: 'Where your citizens actually live.'
  },
  {
    id: 'landValue', label: 'Land Value',
    blockMap: 'landValueMap', max: 250, ramp: RAMP_SEQUENTIAL,
    low: 'Slum', high: 'Prime',
    description: 'What the ground is worth. Parks, water and civic buildings lift it; pollution and crime sink it.'
  },
  {
    id: 'crime', label: 'Crime',
    blockMap: 'crimeRateMap', max: 250, ramp: RAMP_HAZARD,
    low: 'Safe', high: 'Dangerous',
    description: 'Rises with density and poverty, falls near police stations.'
  },
  {
    id: 'pollution', label: 'Pollution',
    blockMap: 'pollutionDensityMap', max: 255, ramp: RAMP_HAZARD,
    low: 'Clean', high: 'Filthy',
    description: 'Industry, traffic and power plants. Nobody wants to live in the red.'
  },
  {
    id: 'traffic', label: 'Traffic',
    blockMap: 'trafficDensityMap', max: 240, ramp: RAMP_HAZARD,
    low: 'Clear', high: 'Gridlocked',
    description: 'Where the roads are struggling. Rail takes the pressure off.'
  },
  {
    id: 'growth', label: 'Rate of Growth',
    blockMap: 'rateOfGrowthMap', ramp: RAMP_GROWTH,
    low: 'Declining', high: 'Booming',
    description: 'Which neighbourhoods are on the way up, and which are emptying out.',
    // Signed, -200 to +200, so the neutral point is the middle of the ramp rather than
    // its start, and alpha comes from distance either side of it -- a stable block is
    // transparent rather than grey, so "nothing is happening here" needs no decoding.
    sample: function(blockMap, x, y) {
      var value = blockMap.worldGet(x, y);
      if (value === 0)
        return null;

      var magnitude = Math.min(1, Math.abs(value) / 200);
      var clamped = Math.max(-200, Math.min(200, value));
      var colour = rampColour(RAMP_GROWTH, (clamped + 200) / 400);

      return [colour[0], colour[1], colour[2], MIN_VISIBLE_ALPHA + (MAX_ALPHA - MIN_VISIBLE_ALPHA) * magnitude];
    }
  },
  {
    id: 'police', label: 'Police Coverage',
    blockMap: 'policeStationEffectMap', max: 1000, ramp: RAMP_COVERAGE,
    low: 'None', high: 'Full',
    description: 'How far your police stations actually reach.'
  },
  {
    id: 'fire', label: 'Fire Coverage',
    blockMap: 'fireStationEffectMap', max: 1000, ramp: RAMP_COVERAGE,
    low: 'None', high: 'Full',
    description: 'How far your fire stations actually reach.'
  },
  {
    id: 'civic', label: 'Civic Buildings',
    blockMap: 'civicBuildingEffectMap', max: 1000, ramp: RAMP_COVERAGE,
    low: 'None', high: 'Strong',
    description: 'The land-value bonus from Hospitals, Libraries, Museums and Large Parks.'
  },
  {
    id: 'power', label: 'Power Grid',
    ramp: null,
    low: 'Unpowered', high: 'Powered',
    description: 'Anything that conducts electricity, and whether it is actually getting any.',
    // The only view backed by tile flags rather than a BlockMap: CONDBIT marks a tile as
    // part of the grid at all, POWERBIT whether the grid is reaching it. Binary by
    // nature, so no ramp -- an unpowered zone is the thing the player is looking for,
    // and a gradient would only bury it.
    sampleTile: function(flags) {
      if ((flags & TileFlags.CONDBIT) === 0)
        return null;

      if ((flags & TileFlags.POWERBIT) !== 0)
        return [250, 230, 90, 0.85];

      return [230, 40, 40, 0.9];
    }
  }
];

var OVERLAYS_BY_ID = {};
OVERLAYS.forEach(function(overlay) {
  OVERLAYS_BY_ID[overlay.id] = overlay;
});


var mapFormID = '#mapButtons';
var mapSelectID = '#mapOverlaySelect';
var mapContainerID = '#mapCanvasContainer';


var MapWindow = ModalWindow(function() {
  $(mapFormID).on('submit', submit.bind(this));

  this._currentOverlay = 'city';
  this._map = null;
  this._blockMaps = null;
  this._gameCanvas = null;
  this._isOpen = false;

  // Drawn at one pixel per tile and scaled up on the way out, rather than as 12,000
  // scaled fillRects: one putImageData plus one drawImage, and the scale becomes a
  // property of the blit instead of something every tile has to know about.
  this._buffer = document.createElement('canvas');
  this._bufferCtx = null;
  this._imageData = null;

  this._canvas = document.createElement('canvas');
  this._canvas.id = 'mapCanvas';
  $(mapContainerID).append(this._canvas);
  $(this._canvas).on('click', clickHandler.bind(this));

  var select = $(mapSelectID);
  OVERLAYS.forEach(function(overlay) {
    select.append($('<option></option>').attr('value', overlay.id).text(overlay.label));
  });
  select.on('change', overlayChanged.bind(this));
});


var submit = function(e) {
  e.preventDefault();
  this.close();
};


var overlayChanged = function() {
  this._currentOverlay = $(mapSelectID).val();
  this._updateLegend();
  this.update();
};


// Click-to-navigate, the other half of what the original's map window was for: the data
// view is also the fastest way across a 120x100 map. Centres the main view on whatever
// was clicked -- GameCanvas.centreOn already clamps to the map's edges, so a click in a
// corner does the sensible thing rather than scrolling into the void.
var clickHandler = function(e) {
  if (!this._map || !this._gameCanvas)
    return;

  var rect = this._canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0)
    return;

  var x = Math.floor((e.clientX - rect.left) / rect.width * this._map.width);
  var y = Math.floor((e.clientY - rect.top) / rect.height * this._map.height);

  x = Math.max(0, Math.min(this._map.width - 1, x));
  y = Math.max(0, Math.min(this._map.height - 1, y));

  this._gameCanvas.centreOn(x, y);
  this.update();
};


MapWindow.prototype.close = function() {
  this._isOpen = false;
  this._emitEvent(MAP_WINDOW_CLOSED);
  this._toggleDisplay();
};


// Called once per game, before the window is ever opened: the map and blockMaps are
// live references held for the lifetime of the city, so every later update() re-reads
// whatever the simulation has done to them since, rather than working from a snapshot.
MapWindow.prototype.setData = function(map, blockMaps, gameCanvas) {
  this._map = map;
  this._blockMaps = blockMaps;
  this._gameCanvas = gameCanvas;

  this._buffer.width = map.width;
  this._buffer.height = map.height;
  this._bufferCtx = this._buffer.getContext('2d');
  this._imageData = this._bufferCtx.createImageData(map.width, map.height);
};


MapWindow.prototype._updateLegend = function() {
  var overlay = OVERLAYS_BY_ID[this._currentOverlay];

  $('#mapDescription').text(overlay.description);

  // The plain city view has categories, not a scale, so it gets no gradient bar at all
  // rather than a meaningless one.
  if (!overlay.low) {
    $('#mapLegend').hide();
    return;
  }

  $('#mapLegend').show();
  $('#mapLegendLow').text(overlay.low);
  $('#mapLegendHigh').text(overlay.high);

  // Power is the one view with two discrete states rather than a scale, so its bar is a
  // hard split at the midpoint instead of a blend between them.
  var gradient = overlay.ramp ? rampToCSSGradient(overlay.ramp)
                              : 'linear-gradient(to right, rgb(230,40,40) 0 50%, rgb(250,230,90) 50% 100%)';
  $('#mapLegendBar').css('background-image', gradient);
};


// Sizes the visible canvas to whatever the window has been resized to while keeping the
// map's aspect ratio, then blits the buffer up to it. Integer scaling wherever there is
// room for it, and nearest-neighbour either way -- a data map is a grid of samples, and
// smoothing invents gradients between neighbouring blocks that the simulation never
// computed.
MapWindow.prototype._resizeCanvas = function() {
  var container = $(mapContainerID);
  var availableWidth = container.width();
  var availableHeight = container.height();

  if (availableWidth <= 0 || availableHeight <= 0)
    return false;

  // Deliberately NOT snapped to a whole number of pixels per tile. Snapping keeps every
  // tile the same size, but throws away everything up to the next whole step to do it:
  // at the default window size the fit is 2.9 pixels a tile, and rounding that down to
  // 2 loses a third of the map's area for a distinction almost nothing here can show.
  // The data overlays are the reason -- five of the seven BlockMaps behind them are
  // 2x2-tile blocks (see simulation.js), so their real resolution is 60x50, and a heat
  // map at that scale reads no differently for a road being 2px wide in one place and
  // 3px in another. Size wins.
  var scale = Math.min(availableWidth / this._map.width, availableHeight / this._map.height);

  // Floor, not round: rounding up can hand back a canvas a pixel wider than the box it
  // was measured against, which the flex container then has to absorb -- and since this
  // runs on every resize mousemove, a canvas that grows its own container is a feedback
  // loop, not a one-pixel cosmetic problem.
  var width = Math.max(1, Math.floor(this._map.width * scale));
  var height = Math.max(1, Math.floor(this._map.height * scale));

  if (this._canvas.width !== width || this._canvas.height !== height) {
    this._canvas.width = width;
    this._canvas.height = height;
  }

  return true;
};


// The viewport box: where the main game view currently is, drawn over the map so this
// window doubles as a "you are here". Inset by half a line width so the stroke lands
// inside the box rather than straddling its edge, and drawn twice (dark under light) so
// it stays visible over both a bright ramp and a dark one.
MapWindow.prototype._paintViewport = function(ctx) {
  if (!this._gameCanvas || !this._gameCanvas.ready)
    return;

  var origin = this._gameCanvas.getTileOrigin();
  var max = this._gameCanvas.getMaxTile();
  var scaleX = this._canvas.width / this._map.width;
  var scaleY = this._canvas.height / this._map.height;

  var left = origin.x * scaleX;
  var top = origin.y * scaleY;
  var width = (max.x - origin.x + 1) * scaleX;
  var height = (max.y - origin.y + 1) * scaleY;

  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.strokeRect(left + 1.5, top + 1.5, width - 3, height - 3);

  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.strokeRect(left + 1.5, top + 1.5, width - 3, height - 3);
};


// Blits the already-computed buffer to the visible canvas and draws the viewport box
// over it. Split out from update() because these two halves run at very different
// rates: the pixels only change when the simulation's data does (monthly), but the
// viewport box moves whenever the player pans, which is every frame while they're
// holding an arrow key. Presenting is one drawImage and two strokeRects; recomputing
// the pixels is a pass over every tile on the map.
MapWindow.prototype._present = function() {
  var ctx = this._canvas.getContext('2d');

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
  ctx.drawImage(this._buffer, 0, 0, this._map.width, this._map.height,
                0, 0, this._canvas.width, this._canvas.height);

  this._paintViewport(ctx);
};


// The cheap half, called from Game's animation loop: repaints the viewport box against
// the last rendered data rather than re-reading the map. Skipped entirely while the
// window is closed, which is the common case.
MapWindow.prototype.refreshViewport = function() {
  if (!this._isOpen || !this._map || !this._imageData)
    return;

  if (!this._resizeCanvas())
    return;

  this._present();
};


// Repaints from live simulation data. Cheap enough to call on demand (one pass over
// 120x100 tiles into a typed array), but pointless while hidden, so Game only calls it
// on the events that matter while the window is actually up -- see the DATE_UPDATED
// wiring there.
MapWindow.prototype.update = function() {
  if (!this._isOpen || !this._map || !this._imageData)
    return;

  if (!this._resizeCanvas())
    return;

  var overlay = OVERLAYS_BY_ID[this._currentOverlay];
  var blockMap = overlay.blockMap ? this._blockMaps[overlay.blockMap] : null;
  var isPlain = overlay.id === 'city';
  var data = this._imageData.data;
  var width = this._map.width;
  var height = this._map.height;

  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var rgb = baseColourFor(this._map.getTileValue(x, y));
      var r, g, b;

      if (isPlain) {
        r = rgb[0];
        g = rgb[1];
        b = rgb[2];
      } else {
        var backdrop = toBackdrop(rgb);
        var sample;

        if (overlay.sampleTile)
          sample = overlay.sampleTile(this._map.getTileFlags(x, y));
        else if (overlay.sample)
          sample = overlay.sample(blockMap, x, y);
        else
          sample = sampleBlockMap(blockMap, x, y, overlay.max, overlay.ramp);

        if (sample === null) {
          r = backdrop[0];
          g = backdrop[1];
          b = backdrop[2];
        } else {
          var alpha = sample[3];
          r = Math.round(backdrop[0] * (1 - alpha) + sample[0] * alpha);
          g = Math.round(backdrop[1] * (1 - alpha) + sample[1] * alpha);
          b = Math.round(backdrop[2] * (1 - alpha) + sample[2] * alpha);
        }
      }

      var i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  this._bufferCtx.putImageData(this._imageData, 0, 0);
  this._present();
};


// Wired up as this window's Panel onResize, so the map rescales live under the resize
// handle rather than waiting for the next monthly update (which never comes at all if
// the player has paused).
MapWindow.prototype.resize = function() {
  this.update();
};


MapWindow.prototype.open = function() {
  this._isOpen = true;
  this._toggleDisplay();

  // After _toggleDisplay, never before: the container has no measurable size while the
  // window is still display:none, and _resizeCanvas would size the canvas to zero.
  this._updateLegend();
  this.update();
};


export { MapWindow };
