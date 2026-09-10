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

import { HISTORY_LENGTH } from './census.js';
import { ModalWindow } from './modalWindow.js';
import { GRAPH_WINDOW_CLOSED } from './messages.ts';

// The city's history, plotted. Like the map window before it, this restores something
// the 1989 original had and this port never grew: the data has been computed, rotated
// and written into every save file since the fork began, and nothing has ever drawn it.
//
// census.js keeps twelve arrays -- six series (residential, commercial and industrial
// population, crime, pollution, cash flow) at two sampling rates -- and every one of
// them is in Census's saveProps, so anyone's saved city is already carrying its own
// history. The only code that has ever read them is valves.js, which takes exactly
// three values (comHist10[1], indHist10[1], resHist10[1]) for its employment sum.
// simulation.js's simTick has carried a bare "// TODO Graphs" the whole time.
//
// Sampling rates, derived rather than assumed (see simulation.js): _cityTime advances
// once per 16-phase cycle, 48 of them make a year, and the censuses fire on
// _cityTime % 4 and % 40. So the "10" arrays are monthly -- 120 months, ten years --
// and the "120" arrays are every ten months, which over 120 slots is a hundred years,
// not the hundred and twenty their name suggests. The name counts entries, not years.


// Two independent Y scales, because these six series genuinely aren't in the same
// units and pretending otherwise would be a lie told with a straight face. R/C/I are
// zone populations and belong on a shared scale, since the interesting question is
// which sector is outgrowing which. Crime, pollution and cash flow are all 0-255
// indices out of census.js and belong on a shared scale of their own. Each axis is
// drawn and labelled on its own side so it's clear which series answers to which.
var AXIS_POPULATION = 'population';
var AXIS_INDEX = 'index';

// Cash flow is stored as cashFlow/20 + 128 clamped to 0-255 (see take10Census), so 128
// is break-even, not zero. Worth a reference line whenever that series is showing --
// otherwise a player reads the middle of the chart as "no money moving" and the bottom
// as "broke", when the bottom is actually "haemorrhaging".
var CASHFLOW_BREAK_EVEN = 128;
var INDEX_MAX = 255;

var SERIES = [
  {
    id: 'res', label: 'Residential', colour: 'rgb(0, 170, 0)',
    // Plotted exactly as stored, including take10Census's division by 8. That divisor
    // is not an encoding to undo -- it is what makes these three series comparable to
    // each other, which is the whole reason to draw them on one chart. resPop counts
    // residents where comPop and indPop count zones, and the raw numbers run about
    // eight to one; scaling residential back up buries commercial and industrial along
    // the axis (measured on Rio: 4.2k against 186 and 289, both flat on the floor of
    // the chart). Left as stored they read 525, 186 and 289, and the question the chart
    // exists to answer -- which sector is outgrowing which -- is legible again.
    axis: AXIS_POPULATION, defaultOn: true, scale: 1
  },
  {
    id: 'com', label: 'Commercial', colour: 'rgb(40, 70, 200)',
    axis: AXIS_POPULATION, defaultOn: true, scale: 1
  },
  {
    id: 'ind', label: 'Industrial', colour: 'rgb(200, 170, 0)',
    axis: AXIS_POPULATION, defaultOn: true, scale: 1
  },
  {
    id: 'crime', label: 'Crime', colour: 'rgb(210, 30, 30)',
    axis: AXIS_INDEX, defaultOn: false, scale: 1
  },
  {
    id: 'pollution', label: 'Pollution', colour: 'rgb(140, 95, 30)',
    axis: AXIS_INDEX, defaultOn: false, scale: 1
  },
  {
    id: 'money', label: 'Cash Flow', colour: 'rgb(150, 40, 190)',
    axis: AXIS_INDEX, defaultOn: false, scale: 1
  }
];

var RANGES = [
  { id: '10', label: '10 Years', suffix: 'Hist10', countProp: 'histCount10', years: 10 },
  { id: '120', label: '100 Years', suffix: 'Hist120', countProp: 'histCount120', years: 100 }
];

var RANGES_BY_ID = {};
RANGES.forEach(function(range) {
  RANGES_BY_ID[range.id] = range;
});

// Room for the axis labels either side and the year labels underneath. The left
// gutter is wider because population runs to five digits where the right-hand axis
// never passes 255.
var PADDING = { left: 46, right: 34, top: 10, bottom: 18 };

var graphFormID = '#graphButtons';
var graphContainerID = '#graphCanvasContainer';
var graphLegendID = '#graphLegend';
var graphRangeID = '#graphRange';


// Short forms for the population axis, which reaches five figures in a real city and
// would otherwise push the plot area around as the numbers grow.
var formatPopulation = function(value) {
  if (value >= 10000)
    return Math.round(value / 1000) + 'k';

  if (value >= 1000)
    return (value / 1000).toFixed(1) + 'k';

  return String(Math.round(value));
};


var GraphWindow = ModalWindow(function() {
  $(graphFormID).on('submit', submit.bind(this));

  this._census = null;
  this._isOpen = false;
  this._range = '10';

  this._visible = {};
  SERIES.forEach(function(series) {
    this._visible[series.id] = series.defaultOn;
  }.bind(this));

  this._canvas = document.createElement('canvas');
  this._canvas.id = 'graphCanvas';
  $(graphContainerID).append(this._canvas);

  buildRangeButtons.call(this);
  buildLegend.call(this);
});


var submit = function(e) {
  e.preventDefault();
  this.close();
};


var buildRangeButtons = function() {
  var container = $(graphRangeID);

  RANGES.forEach(function(range) {
    var button = $('<button></button>', {
      type: 'button',
      'class': 'graphRangeButton' + (range.id === this._range ? ' graphRangeSelected' : ''),
      text: range.label
    }).attr('data-range', range.id);

    button.on('click', function() {
      this._range = range.id;
      $('.graphRangeButton').removeClass('graphRangeSelected');
      button.addClass('graphRangeSelected');
      this.update();
    }.bind(this));

    container.append(button);
  }.bind(this));
};


// One toggle per series, each carrying its own line colour as a swatch, so the legend
// and the controls are the same thing rather than two lists to keep in step.
var buildLegend = function() {
  var container = $(graphLegendID);

  SERIES.forEach(function(series) {
    var id = 'graphToggle_' + series.id;
    var wrapper = $('<label></label>', {'class': 'graphLegendItem', 'for': id});
    var checkbox = $('<input>', {type: 'checkbox', id: id, checked: series.defaultOn});

    checkbox.on('change', function() {
      this._visible[series.id] = checkbox.prop('checked');
      this.update();
    }.bind(this));

    wrapper.append(checkbox);
    wrapper.append($('<span></span>', {'class': 'graphSwatch'}).css('background-color', series.colour));
    wrapper.append($('<span></span>', {'class': 'graphSeriesLabel', text: series.label}));
    wrapper.append($('<span></span>', {'class': 'graphSeriesValue', id: 'graphValue_' + series.id}));

    container.append(wrapper);
  }.bind(this));
};


GraphWindow.prototype.close = function() {
  this._isOpen = false;
  this._emitEvent(GRAPH_WINDOW_CLOSED);
  this._toggleDisplay();
};


// A live reference, held for the life of the city: the arrays are rotated in place by
// take10Census/take120Census, so every later update() sees whatever has happened since
// rather than a snapshot taken when the window opened.
GraphWindow.prototype.setData = function(census) {
  this._census = census;
};


GraphWindow.prototype._resizeCanvas = function() {
  var container = $(graphContainerID);
  var width = Math.floor(container.width());
  var height = Math.floor(container.height());

  if (width <= 0 || height <= 0)
    return false;

  if (this._canvas.width !== width || this._canvas.height !== height) {
    this._canvas.width = width;
    this._canvas.height = height;
  }

  return true;
};


// Readings for one series, oldest first. The arrays are stored newest-first (index 0
// is the most recent reading, see rotate10Arrays), and only the first `count` of them
// are real -- the rest are the zeros the array was initialised with, which would
// otherwise plot as a long flat run of nothing before the city's actual history.
GraphWindow.prototype._readSeries = function(series, range, count) {
  var data = this._census[series.id + range.suffix];
  var values = [];

  for (var i = count - 1; i >= 0; i--)
    values.push(data[i] * series.scale);

  return values;
};


// The top of each axis, computed from whatever is actually on screen. The population
// axis is data-driven and rounded up to something a human would pick; the index axis
// is fixed at 255, because these are bounded indices and rescaling them would make a
// calm city's crime look identical to a disaster's.
GraphWindow.prototype._axisMaxima = function(range, count) {
  var populationMax = 0;
  var anyPopulation = false;

  SERIES.forEach(function(series) {
    if (!this._visible[series.id] || series.axis !== AXIS_POPULATION)
      return;

    anyPopulation = true;
    this._readSeries(series, range, count).forEach(function(value) {
      if (value > populationMax)
        populationMax = value;
    });
  }.bind(this));

  if (!anyPopulation || populationMax <= 0)
    populationMax = 100;

  // Round up to a 1/2/5 x power of ten, so the gridlines land on numbers worth
  // reading rather than on whatever the peak happened to be.
  var magnitude = Math.pow(10, Math.floor(Math.log(populationMax) / Math.LN10));
  var normalised = populationMax / magnitude;
  var step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;

  return {population: step * magnitude, index: INDEX_MAX};
};


GraphWindow.prototype._plotArea = function() {
  return {
    left: PADDING.left,
    top: PADDING.top,
    right: this._canvas.width - PADDING.right,
    bottom: this._canvas.height - PADDING.bottom
  };
};


GraphWindow.prototype._paintGrid = function(ctx, area, maxima, range) {
  var divisions = 4;

  ctx.fillStyle = 'rgb(255, 255, 255)';
  ctx.fillRect(area.left, area.top, area.right - area.left, area.bottom - area.top);

  ctx.font = '9px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;

  for (var i = 0; i <= divisions; i++) {
    var fraction = i / divisions;
    // +0.5 so a 1px line lands on a pixel instead of straddling two and rendering
    // as a soft 2px smear.
    var y = Math.round(area.bottom - fraction * (area.bottom - area.top)) + 0.5;

    ctx.strokeStyle = i === 0 ? 'rgb(120, 120, 120)' : 'rgb(224, 224, 224)';
    ctx.beginPath();
    ctx.moveTo(area.left, y);
    ctx.lineTo(area.right, y);
    ctx.stroke();

    ctx.fillStyle = 'rgb(90, 90, 90)';
    ctx.textAlign = 'right';
    ctx.fillText(formatPopulation(maxima.population * fraction), area.left - 4, y);

    ctx.textAlign = 'left';
    ctx.fillText(String(Math.round(maxima.index * fraction)), area.right + 4, y);
  }

  // Time runs left (oldest) to right (now), so the axis is labelled at its ends
  // rather than at every gridline -- there is no room for more, and "how long ago"
  // is the only thing the horizontal position has to say.
  ctx.fillStyle = 'rgb(90, 90, 90)';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('← ' + range.years + ' years ago', area.left, area.bottom + 4);
  ctx.textAlign = 'right';
  ctx.fillText('now', area.right, area.bottom + 4);

  ctx.strokeStyle = 'rgb(120, 120, 120)';
  ctx.strokeRect(area.left + 0.5, area.top + 0.5, area.right - area.left, area.bottom - area.top);
};


GraphWindow.prototype._paintSeries = function(ctx, area, maxima, values, series) {
  if (values.length === 0)
    return;

  var max = series.axis === AXIS_POPULATION ? maxima.population : maxima.index;
  var plotWidth = area.right - area.left;
  var plotHeight = area.bottom - area.top;

  // A single reading has no line to draw, so it gets a dot instead of vanishing --
  // which is what a city in its first month would otherwise show.
  var step = values.length > 1 ? plotWidth / (values.length - 1) : 0;

  ctx.strokeStyle = series.colour;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();

  for (var i = 0; i < values.length; i++) {
    var x = area.left + i * step;
    var y = area.bottom - Math.min(1, values[i] / max) * plotHeight;

    if (i === 0)
      ctx.moveTo(x, y);
    else
      ctx.lineTo(x, y);
  }

  if (values.length === 1) {
    ctx.fillStyle = series.colour;
    ctx.fillRect(area.right - 2, area.bottom - Math.min(1, values[0] / max) * plotHeight - 2, 4, 4);
    return;
  }

  ctx.stroke();
};


GraphWindow.prototype._paintBreakEven = function(ctx, area, maxima) {
  var y = Math.round(area.bottom - (CASHFLOW_BREAK_EVEN / maxima.index) * (area.bottom - area.top)) + 0.5;

  ctx.save();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = 'rgba(150, 40, 190, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(area.left, y);
  ctx.lineTo(area.right, y);
  ctx.stroke();
  ctx.restore();
};


// The legend doubles as a readout: each series shows its most recent value, which is
// the number the chart itself can't give you off a shared, rescaling axis.
GraphWindow.prototype._updateLegendValues = function(range, count) {
  SERIES.forEach(function(series) {
    var el = $('#graphValue_' + series.id);

    if (count === 0) {
      el.text('');
      return;
    }

    var latest = this._census[series.id + range.suffix][0] * series.scale;

    if (series.id === 'money') {
      // Undo the stored encoding rather than showing a number between 0 and 255 that
      // means nothing to anyone: (value - 128) * 20 is the cash flow it came from.
      var flow = (latest - CASHFLOW_BREAK_EVEN) * 20;
      el.text((flow >= 0 ? '+$' : '-$') + Math.abs(flow));
      return;
    }

    el.text(series.axis === AXIS_POPULATION ? formatPopulation(latest) : String(Math.round(latest)));
  }.bind(this));
};


GraphWindow.prototype.update = function() {
  if (!this._isOpen || !this._census)
    return;

  if (!this._resizeCanvas())
    return;

  var range = RANGES_BY_ID[this._range];
  var count = Math.min(HISTORY_LENGTH, this._census[range.countProp] || 0);
  var area = this._plotArea();
  var maxima = this._axisMaxima(range, count);
  var ctx = this._canvas.getContext('2d');

  ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
  this._paintGrid(ctx, area, maxima, range);

  if (this._visible.money && count > 0)
    this._paintBreakEven(ctx, area, maxima);

  SERIES.forEach(function(series) {
    if (!this._visible[series.id])
      return;

    this._paintSeries(ctx, area, maxima, this._readSeries(series, range, count), series);
  }.bind(this));

  if (count === 0) {
    ctx.fillStyle = 'rgb(120, 120, 120)';
    ctx.font = 'italic 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No history yet — give the city a month.',
                 (area.left + area.right) / 2, (area.top + area.bottom) / 2);
  }

  this._updateLegendValues(range, count);
};


// Panel's onResize, so the chart follows the resize handle rather than waiting for the
// next census -- which on the 100-year range is ten months away, and never arrives at
// all if the player has paused.
GraphWindow.prototype.resize = function() {
  this.update();
};


GraphWindow.prototype.open = function() {
  this._isOpen = true;
  this._toggleDisplay();

  // After _toggleDisplay: the container has no measurable size while the window is
  // still hidden, and _resizeCanvas would size the canvas to nothing.
  this.update();
};


export { GraphWindow };
