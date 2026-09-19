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

// Builds the Tools panel from toolRegistry.js: the pinned pair, then a collapsible
// section per group. Every button still carries the data-tool/data-size/data-colour
// attributes and the .toolButton class InputStatus' delegated click handler reads, so
// nothing about how a tool is *selected* changed in v0.89.6 -- only what the panel
// looks like and what it can tell you.

import $ from "jquery";

import { TOOL_GROUPS, PINNED_TOOLS, ALL_TOOLS } from './toolRegistry.js';

// images/tiles.png is 512x624 with 16px tiles, so 32 to a row. Icons are drawn as a
// background-position crop of that same sheet rather than through TileSet, which cuts
// every tile into its own Image via canvas.toDataURL -- 5ms a tile, and the reason
// startup takes as long as it does (see TODO.md). A CSS crop costs nothing and the
// sheet is already being downloaded.
var TILE_SIZE = 16;
var TILES_PER_ROW = 32;

// Which groups the player has collapsed, remembered the same way panel positions are.
var STORAGE_KEY = 'b0r3dCityToolGroups';

var collapsed = (function() {
  try {
    var raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    // Private browsing / storage disabled -- every group just starts open
    return {};
  }
})();


var saveCollapsed = function() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsed));
  } catch (e) {
    // Nothing to do; the panel simply won't remember between sessions
  }
};


var tileIcon = function(tile) {
  var x = (tile % TILES_PER_ROW) * TILE_SIZE;
  var y = Math.floor(tile / TILES_PER_ROW) * TILE_SIZE;

  return $('<span>')
    .addClass('toolIcon')
    .css('background-position', -x + 'px ' + -y + 'px');
};


var glyphIcon = function(glyph) {
  return $('<span>').addClass('toolIcon toolGlyph').text(glyph);
};


var costLabel = function(cost) {
  return cost > 0 ? '$' + cost : '';
};


// One row in the panel. The colour that used to be the whole button's background is now
// a 3px stripe down its left edge: still there, still the colour the placement outline
// will be, no longer the thing you see first.
var buildButton = function(tool) {
  var button = $('<button>')
    .attr('id', tool.id + 'Button')
    .attr('type', 'button')
    .attr('data-size', tool.size)
    .attr('data-tool', tool.id)
    .attr('data-colour', tool.colour)
    .attr('data-cost', tool.cost)
    .addClass('toolButton unselected')
    .css('border-left-color', tool.colour);

  button.append(tool.icon !== undefined && tool.icon !== null ?
                tileIcon(tool.icon) : glyphIcon(tool.glyph || '?'));
  button.append($('<span>').addClass('toolLabel').text(tool.label));
  button.append($('<span>').addClass('toolCost').text(costLabel(tool.cost)));

  if (tool.key)
    button.append($('<span>').addClass('toolKey').text(tool.key.toUpperCase()));

  return button;
};


var buildGroup = function(group) {
  var isCollapsed = !!collapsed[group.id];

  var header = $('<button>')
    .attr('type', 'button')
    .attr('data-group', group.id)
    .addClass('toolGroupHeader')
    .append($('<span>').addClass('toolGroupArrow').text(isCollapsed ? '▸' : '▾'))
    .append($('<span>').addClass('toolGroupLabel').text(group.label))
    .append($('<span>').addClass('toolGroupCount').text(group.tools.length));

  var body = $('<div>')
    .addClass('toolGroupBody')
    .attr('data-group', group.id);

  if (isCollapsed)
    body.addClass('hidden');

  group.tools.forEach(function(tool) {
    body.append(buildButton(tool));
  });

  return $('<div>').addClass('toolGroup').append(header).append(body);
};


// Hover help. A panel of its own rather than a title attribute: thirty-four buildings
// whose whole difference from each other is a number in customBuildings.js need more
// than a half-second-delayed OS tooltip, and this one can be styled to match the
// panel it belongs to. Pointer-only -- a long press on a phone is not a hover, and
// the drawer has no room beside it anyway.
var tooltip = null;

var showTooltip = function(button) {
  var tool = ALL_TOOLS.filter(function(t) {
    return t.id === button.attr('data-tool');
  })[0];

  if (!tool || !tool.blurb)
    return;

  if (tooltip === null) {
    tooltip = $('<div>').attr('id', 'toolTooltip').addClass('controlShadow');
    $('body').append(tooltip);
  }

  var facts = [tool.size + '×' + tool.size];
  if (tool.cost > 0)
    facts.push('$' + tool.cost);

  tooltip.empty()
    .append($('<div>').addClass('toolTipTitle').text(tool.label))
    .append($('<div>').addClass('toolTipFacts').text(facts.join(' · ')))
    .append($('<div>').addClass('toolTipBlurb').text(tool.blurb));

  // Shown before it is measured, not after: offsetWidth/offsetHeight both read 0 while
  // an element is display:none, so measuring first put every tooltip at
  // (button.left - 0 - 8) -- i.e. directly on top of the panel it was describing.
  tooltip.addClass('open');

  // Anchored to the button's left edge, since the Tools panel lives against the right
  // of the screen -- and clamped so a tool near the bottom of a long list doesn't put
  // its own tooltip off the bottom of the window.
  var offset = button.offset();
  var width = tooltip[0].offsetWidth;
  var height = tooltip[0].offsetHeight;
  var top = Math.min(offset.top, Math.max(0, window.innerHeight - height - 4));
  var left = Math.max(4, offset.left - width - 8);

  tooltip.css({ top: top, left: left });
};


var hideTooltip = function() {
  if (tooltip !== null)
    tooltip.removeClass('open');
};


// Dim what the player cannot buy. Costs come off the registry via data-cost rather than
// being re-read from the tools, so this is a string compare and a class toggle per
// button -- cheap enough to run on every funds change without thinking about it.
var Toolbar = {};

Toolbar.setFunds = function(funds) {
  $('#buttons .toolButton').each(function() {
    var button = $(this);
    var cost = parseInt(button.attr('data-cost'), 10) || 0;
    button.toggleClass('unaffordable', cost > funds);
  });
};


Toolbar.render = function() {
  var buttons = $('#buttons');

  // Idempotent for the same reason renderCustomBuildingButtons was: Game() can run more
  // than once per page load (load a save, start a new game after one already ran) and
  // #buttons is not cleared between them.
  if (buttons.children().length > 0)
    return;

  var pinned = $('<div>').addClass('toolPinned');
  PINNED_TOOLS.forEach(function(tool) {
    pinned.append(buildButton(tool));
  });
  buttons.append(pinned);

  TOOL_GROUPS.forEach(function(group) {
    buttons.append(buildGroup(group));
  });

  buttons.on('click', '.toolGroupHeader', function() {
    var id = $(this).attr('data-group');
    collapsed[id] = !collapsed[id];
    saveCollapsed();

    $(this).find('.toolGroupArrow').text(collapsed[id] ? '▸' : '▾');
    buttons.find('.toolGroupBody[data-group="' + id + '"]').toggleClass('hidden', !!collapsed[id]);
  });

  buttons.on('mouseenter', '.toolButton', function() {
    showTooltip($(this));
  });

  buttons.on('mouseleave', '.toolButton', hideTooltip);

  // A tool picked on a phone closes the drawer under it (see toolButtonHandler), and a
  // scroll shouldn't leave a tooltip stranded over the map.
  buttons.on('scroll', hideTooltip);
  buttons.on('click', '.toolButton', hideTooltip);
};


export { Toolbar };
