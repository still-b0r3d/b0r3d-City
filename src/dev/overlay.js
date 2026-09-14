/* b0r3d-city dev menu -- drawing over the main map.
 *
 * Only ever loaded as part of the dev chunk (see src/devMode.js). A second canvas laid
 * exactly over #MicropolisCanvas, with pointer events off, so nothing here can get in
 * the way of a click or change what the game itself paints. panel.js redraws it after
 * every frame the game paints (and after "draw frame" in a hidden tab).
 *
 * Deliberately not sharing mapWindow.js's ramps: that window is a finished player view
 * with fixed ranges, and this is a debugging view that auto-scales to whatever the map
 * actually holds and prints the raw numbers when there's room.
 */

import * as TileFlags from '../tileFlags.ts';
import { SPRITE_NAMES } from './tools.js';

// Every block map whose values can go negative. Everything else is 0-and-up.
var SIGNED_MAPS = {rateOfGrowthMap: true, cityCentreDistScoreMap: true};

// How many frames a repainted tile stays highlighted, fading out over that time.
var REPAINT_FRAMES = 20;


function DevOverlay(game) {
  this.game = game;
  this.options = {grid: false, blockMap: '', numbers: true, power: false, zones: false, sprites: false, repaint: false};
  this.picked = null;
  this.hover = null;

  this.canvas = document.createElement('canvas');
  this.canvas.id = 'devOverlay';
  var gameCanvasEl = game.gameCanvas._canvas;
  gameCanvasEl.parentNode.insertBefore(this.canvas, gameCanvasEl.nextSibling);

  this._repaints = [];
  this._originalPaintOne = null;
}


DevOverlay.prototype.isActive = function() {
  var o = this.options;
  return !!(o.grid || o.blockMap || o.power || o.zones || o.sprites || o.repaint || this.picked || this.hover);
};


DevOverlay.prototype.setOptions = function(options) {
  Object.assign(this.options, options);
  this._trackRepaints(!!this.options.repaint);
  this.draw();
};


// Wraps this one GameCanvas's _paintOne while the repaint view is on, and puts the
// original back when it goes off, so the game pays nothing for it otherwise. Only tile
// paints count: the full-map screenshot calls _paintOne too, but always passes an
// explicit width, which the diff-based repaint in _paintTiles never does.
DevOverlay.prototype._trackRepaints = function(on) {
  var gameCanvas = this.game.gameCanvas;
  var self = this;

  if (on && !this._originalPaintOne) {
    var original = this._originalPaintOne = gameCanvas._paintOne;
    gameCanvas._paintOne = function(ctx, tileVal, x, y, w) {
      if (w === undefined)
        self._repaints.push({x: x, y: y, age: 0});
      return original.apply(this, arguments);
    };
  } else if (!on && this._originalPaintOne) {
    delete gameCanvas._paintOne;
    this._originalPaintOne = null;
    this._repaints = [];
  }
};


var heatColour = function(t, alpha) {
  // Pale yellow through orange to red, same family as the map window's hazard ramp.
  var r = 255;
  var g = Math.round(240 - 220 * t);
  var b = Math.round(150 - 150 * Math.min(1, t * 2));
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
};


var signedColour = function(t, alpha) {
  // t in -1..1: red for negative, green for positive.
  return t < 0 ? 'rgba(230,50,50,' + alpha + ')' : 'rgba(60,210,90,' + alpha + ')';
};


DevOverlay.prototype.draw = function() {
  var game = this.game;
  var gameCanvas = game.gameCanvas;
  var canvas = this.canvas;

  if (!gameCanvas.ready)
    return;

  if (!this.isActive()) {
    if (canvas.width !== 0) {
      canvas.width = 0;
      canvas.height = 0;
    }
    return;
  }

  var source = gameCanvas._canvas;
  if (canvas.width !== source.width || canvas.height !== source.height) {
    canvas.width = source.width;
    canvas.height = source.height;
  }
  canvas.style.left = source.offsetLeft + 'px';
  canvas.style.top = source.offsetTop + 'px';

  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  var map = game.gameMap;
  var w = gameCanvas.getScaledTileWidth();
  var origin = gameCanvas.getTileOrigin();
  var viewW = gameCanvas._totalTilesInViewX;
  var viewH = gameCanvas._totalTilesInViewY;
  var x0 = Math.max(0, origin.x);
  var y0 = Math.max(0, origin.y);
  var x1 = Math.min(map.width, origin.x + viewW);
  var y1 = Math.min(map.height, origin.y + viewH);
  var sx = function(x) { return (x - origin.x) * w; };
  var sy = function(y) { return (y - origin.y) * w; };
  var x, y;

  if (this.options.blockMap) {
    var key = this.options.blockMap;
    var bm = game.simulation.blockMaps[key];

    if (bm) {
      var size = bm.blockSize;
      var max = 0;
      var bx, by, value;

      for (bx = 0; bx < bm.width; bx++)
        for (by = 0; by < bm.height; by++)
          max = Math.max(max, Math.abs(bm.get(bx, by)));

      var showNumbers = this.options.numbers && w * size >= 26;
      ctx.font = Math.max(8, Math.min(12, Math.floor(w * size / 3))) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (bx = Math.floor(x0 / size); bx <= Math.floor((x1 - 1) / size); bx++) {
        for (by = Math.floor(y0 / size); by <= Math.floor((y1 - 1) / size); by++) {
          if (bx >= bm.width || by >= bm.height)
            continue;

          value = bm.get(bx, by);
          if (value === 0 && !showNumbers)
            continue;

          var t = max === 0 ? 0 : value / max;
          if (value !== 0) {
            ctx.fillStyle = SIGNED_MAPS[key] ? signedColour(t, 0.15 + 0.55 * Math.abs(t)) : heatColour(t, 0.15 + 0.55 * t);
            ctx.fillRect(sx(bx * size), sy(by * size), size * w, size * w);
          }

          if (showNumbers) {
            ctx.fillStyle = 'rgba(0,0,0,0.75)';
            ctx.fillText(String(value), sx(bx * size) + size * w / 2 + 1, sy(by * size) + size * w / 2 + 1);
            ctx.fillStyle = '#fff';
            ctx.fillText(String(value), sx(bx * size) + size * w / 2, sy(by * size) + size * w / 2);
          }
        }
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      for (bx = Math.floor(x0 / size) * size; bx <= x1; bx += size) {
        ctx.beginPath();
        ctx.moveTo(sx(bx) + 0.5, sy(y0));
        ctx.lineTo(sx(bx) + 0.5, sy(y1));
        ctx.stroke();
      }
      for (by = Math.floor(y0 / size) * size; by <= y1; by += size) {
        ctx.beginPath();
        ctx.moveTo(sx(x0), sy(by) + 0.5);
        ctx.lineTo(sx(x1), sy(by) + 0.5);
        ctx.stroke();
      }
    }
  }

  if (this.options.power || this.options.zones) {
    for (x = x0; x < x1; x++) {
      for (y = y0; y < y1; y++) {
        var flags = map.getTileFlags(x, y);

        if (this.options.power && (flags & TileFlags.CONDBIT)) {
          ctx.fillStyle = (flags & TileFlags.POWERBIT) ? 'rgba(255,225,40,0.35)' : 'rgba(255,40,40,0.5)';
          ctx.fillRect(sx(x), sy(y), w, w);
        }

        if (this.options.zones && (flags & TileFlags.ZONEBIT)) {
          ctx.strokeStyle = (flags & TileFlags.POWERBIT) ? '#35e0ff' : '#ff4df0';
          ctx.lineWidth = 2;
          ctx.strokeRect(sx(x - 1) + 1, sy(y - 1) + 1, 3 * w - 2, 3 * w - 2);
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fillRect(sx(x) + w / 2 - 2, sy(y) + w / 2 - 2, 4, 4);
        }
      }
    }
  }

  if (this.options.grid && w >= 6) {
    ctx.lineWidth = 1;
    for (x = x0; x <= x1; x++) {
      ctx.strokeStyle = x % 10 === 0 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.moveTo(sx(x) + 0.5, sy(y0));
      ctx.lineTo(sx(x) + 0.5, sy(y1));
      ctx.stroke();
    }
    for (y = y0; y <= y1; y++) {
      ctx.strokeStyle = y % 10 === 0 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.moveTo(sx(x0), sy(y) + 0.5);
      ctx.lineTo(sx(x1), sy(y) + 0.5);
      ctx.stroke();
    }

    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (x = Math.ceil(x0 / 10) * 10; x < x1; x += 10) {
      for (y = Math.ceil(y0 / 10) * 10; y < y1; y += 10) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(sx(x) + 1, sy(y) + 1, 38, 12);
        ctx.fillStyle = '#fff';
        ctx.fillText(x + ',' + y, sx(x) + 3, sy(y) + 2);
      }
    }
  }

  if (this.options.sprites) {
    var scale = gameCanvas.getScale();
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';

    game.simulation.spriteManager.getSpriteList().forEach(function(sprite) {
      // The same maths _processSprites draws them with, so the box sits on the sprite.
      var left = (sprite.x + sprite.xOffset - origin.x * 16) * scale;
      var top = (sprite.y + sprite.yOffset - origin.y * 16) * scale;
      var size = sprite.width * scale;

      ctx.strokeStyle = '#7fd4ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(left + 0.5, top + 0.5, size, size);

      var label = (SPRITE_NAMES[sprite.type] || 'type ' + sprite.type) + ' f' + sprite.frame +
                  ' @' + (sprite.x >> 4) + ',' + (sprite.y >> 4);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(left, top - 12, ctx.measureText(label).width + 4, 12);
      ctx.fillStyle = '#7fd4ff';
      ctx.fillText(label, left + 2, top);
    });
  }

  if (this.options.repaint && this._repaints.length) {
    var keep = [];
    this._repaints.forEach(function(hit) {
      var alpha = 0.5 * (1 - hit.age / REPAINT_FRAMES);
      ctx.fillStyle = 'rgba(255,0,220,' + alpha.toFixed(3) + ')';
      ctx.fillRect(hit.x * w, hit.y * w, w, w);
      hit.age++;
      if (hit.age < REPAINT_FRAMES)
        keep.push(hit);
    });
    // Bounded, in case a hidden tab paints for a long time without this ever drawing.
    this._repaints = keep.slice(-20000);
  }

  if (this.hover) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx(this.hover.x) + 0.5, sy(this.hover.y) + 0.5, w - 1, w - 1);
  }

  if (this.picked) {
    ctx.strokeStyle = '#e3b341';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx(this.picked.x) + 1, sy(this.picked.y) + 1, w - 2, w - 2);
  }
};


DevOverlay.prototype.destroy = function() {
  this._trackRepaints(false);
  this.canvas.remove();
};


export { DevOverlay };
