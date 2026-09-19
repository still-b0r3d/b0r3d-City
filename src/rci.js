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

import { VALVES_UPDATED } from './messages.ts';
import { MiscUtils } from './miscUtils.js';

// The demand readout. Rebuilt in v0.89.6 for its new home: it used to be a panel of its
// own in the left-hand column, and is now three small bars in the HUD bar along the top.
//
// The old drawing code laid everything out in "rectangle units" -- a _padding of 3, a
// _buckets of 10, and an integer _rectSize chosen so a whole number of them fitted the
// panel. That is why it looked chunky, why resizing it snapped between sizes instead of
// scaling, and why it could not be made short and wide: its unit grid was 21 across by
// 29 down, so a 60x30 box got a rectSize of 1 and drew itself 21 pixels wide in the
// corner. None of that survives. What does survive is the part that was hard-won:
//
//   - the +/-2000 vs +/-1500 scaling. Residential demand runs to +/-2000 and the other
//     two only to +/-1500, so commercial and industrial have to be brought onto
//     residential's scale or they read low. The bug fixed when that was last touched
//     (the test said `index > 1`, which caught industrial but not commercial, so the C
//     bar drew 25% short for years) is fixed the same way here, by scaling both.
//   - the VALVES_UPDATED subscription, and update() being the only entry point.

// What each valve's full deflection is worth, in the units the simulation reports.
var RES_RANGE = 2000;
var COM_IND_RANGE = 1500;

// Bar colours. These are the zone tools' own colours (lime / blue / yellow, see
// toolRegistry.js) lifted toward the light, because the HUD bar they sit on is
// darkslategray and a pure blue bar on it is unreadable. Same hues, same order, so the
// link between "the C bar is high" and "place a Commercial zone" survives.
var COLOURS = ['#5dd35d', '#5b9bff', '#e8d44d'];
var LABELS = ['R', 'C', 'I'];

// Room under the bars for the R/C/I letters.
var LABEL_HEIGHT = 9;

// Bars are this wide, with this much air between them, at any container size. Fixed
// rather than proportional: at HUD scale a bar narrower than about five pixels stops
// reading as a bar, and there is no reason for these to grow if the window does.
var BAR_WIDTH = 7;
var BAR_GAP = 5;


function RCI(parentNode, eventSource, id) {
  if (arguments.length < 2)
    throw new Error('RCI constructor called with too few arguments ' + [].toString.apply(arguments));

  if (id === undefined)
    id = RCI.DEFAULT_ID;

  if (typeof(parentNode) === 'string') {
    var orig = parentNode;
    parentNode = $(MiscUtils.normaliseDOMid(parentNode));
    parentNode = parentNode.length === 0 ? null : parentNode[0];
    if (parentNode === null)
      throw new Error('Node ' + orig + ' not found');
  }

  this._canvas = $('<canvas></canvas>', {id: id})[0];
  this._lastData = null;

  // Remove any existing element with the same id
  var elems = $(MiscUtils.normaliseDOMid(id));
  var current = elems.length > 0 ? elems[0] : null;
  if (current !== null) {
    if (current.parentNode === parentNode)
      parentNode.replaceChild(this._canvas, current);
    else
      throw new Error('ID ' + id + ' already exists in document!');
  } else
    parentNode.appendChild(this._canvas);

  eventSource.addEventListener(VALVES_UPDATED, this.update.bind(this));
}


// Backing-store size follows devicePixelRatio, CSS size follows the container. Without
// this the bars are a blurry smear on any laptop with a retina-class screen -- which is
// most of them, and was not obvious in the old panel only because everything in it was
// a hard-edged rectangle several pixels across.
RCI.prototype._sizeCanvas = function() {
  var rect = this._canvas.parentNode.getBoundingClientRect();
  var ratio = window.devicePixelRatio || 1;

  var width = Math.max(1, Math.floor(rect.width));
  var height = Math.max(1, Math.floor(rect.height));

  this._canvas.style.width = width + 'px';
  this._canvas.style.height = height + 'px';
  this._canvas.width = Math.round(width * ratio);
  this._canvas.height = Math.round(height * ratio);

  var ctx = this._canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  return {ctx: ctx, width: width, height: height};
};


RCI.prototype.update = function(data) {
  this._lastData = data;

  var surface = this._sizeCanvas();
  var ctx = surface.ctx;
  var width = surface.width;
  var height = surface.height;

  ctx.clearRect(0, 0, width, height);

  // The three bars, centred as a group, with the baseline halfway up what's left after
  // the label row.
  var plotHeight = height - LABEL_HEIGHT;
  var halfHeight = plotHeight / 2;
  var baseline = halfHeight;
  var totalWidth = 3 * BAR_WIDTH + 2 * BAR_GAP;
  var left = Math.round((width - totalWidth) / 2);

  // The zero line, drawn first so the bars sit on top of it. Faint: it is a reference,
  // not a thing to look at.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.fillRect(left - 3, Math.round(baseline), totalWidth + 6, 1);

  var values = [data.residential, data.commercial, data.industrial];

  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (var i = 0; i < 3; i++) {
    var x = left + i * (BAR_WIDTH + BAR_GAP);

    // Both commercial and industrial are brought onto residential's scale -- see the
    // note at the top of this file for why the old code only did it to industrial.
    var range = i === 0 ? RES_RANGE : COM_IND_RANGE;
    var fraction = MiscUtils.clamp(values[i] / range, -1, 1);
    var barHeight = Math.round(Math.abs(fraction) * halfHeight);

    if (barHeight > 0) {
      ctx.fillStyle = COLOURS[i];
      ctx.fillRect(x, fraction >= 0 ? baseline - barHeight : baseline + 1,
                   BAR_WIDTH, barHeight);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillText(LABELS[i], x + BAR_WIDTH / 2, plotHeight + 1);
  }
};


// Redraw at whatever size the container is now. Called on window resize by the HUD (the
// panel that used to own this and drive it through Panel's onResize is gone), and a
// no-op until the first VALVES_UPDATED has given it something to draw.
RCI.prototype.resize = function() {
  if (this._lastData)
    this.update(this._lastData);
};


Object.defineProperty(RCI, 'DEFAULT_ID', MiscUtils.makeConstantDescriptor('RCICanvas'));

export { RCI };
