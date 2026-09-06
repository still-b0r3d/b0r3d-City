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

import { EventEmitter } from './eventEmitter.js';
import { GameCanvas } from './gameCanvas.js';
import { GameTools } from './gameTools.js';
import * as Messages from './messages.ts';
import { MiscUtils } from './miscUtils.js';

// How far (in CSS pixels) a touch may move before it stops counting as a tap and starts
// counting as a drag/pan
var TAP_MOVE_THRESHOLD = 10;


var InputStatus = EventEmitter(function(map, gameCanvas) {
  this.gameTools = new GameTools(map);

  this.gameTools.addEventListener(Messages.QUERY_WINDOW_NEEDED, MiscUtils.reflectEvent.bind(this, Messages.QUERY_WINDOW_NEEDED));

  this.canvasID = MiscUtils.normaliseDOMid(canvasID);

  // Kept live rather than snapshotting tileWidth once, since it changes with zoom
  this._gameCanvas = gameCanvas;

  // Keyboard Movement
  this.up = false;
  this.down = false;
  this.left = false;
  this.right = false;
  this.escape = false;

  // Mouse movement
  this.mouseX = -1;
  this.mouseY = -1;

  // Mouse drags
  this._dragging = false;
  this._lastdragX = -1;
  this._lastdragY = -1;

  // Touch panning (one-finger drag scrolls the camera when no draggable tool is active)
  this._panLastX = null;
  this._panLastY = null;
  this._panAccumX = 0;
  this._panAccumY = 0;

  // Touch tap-vs-drag detection
  this._touchStartX = null;
  this._touchStartY = null;
  this._touchMoved = false;

  // Tool buttons
  this.toolName = null;
  this.currentTool = null;
  this.toolWidth = 0;
  this.toolColour = '';

  // Add the listeners
  $(document).keydown(keyDownHandler.bind(this));
  $(document).keyup(keyUpHandler.bind(this));

  this.getRelativeCoordinates = getRelativeCoordinates.bind(this);
  $(this.canvasID).on('mouseenter', mouseEnterHandler.bind(this));
  $(this.canvasID).on('mouseleave', mouseLeaveHandler.bind(this));
  $(this.canvasID).on('wheel', wheelHandler.bind(this));

  // Bound with the native API (not jQuery) and {passive: false}, since browsers default
  // touch listeners to passive -- without that, preventDefault() here is silently ignored
  // and the whole page scrolls/bounces underneath a pan gesture instead of just the map
  var canvasEl = document.querySelector(this.canvasID);
  canvasEl.addEventListener('touchstart', touchStartHandler.bind(this), {passive: false});
  canvasEl.addEventListener('touchmove', touchMoveHandler.bind(this), {passive: false});
  canvasEl.addEventListener('touchend', touchEndHandler.bind(this), {passive: false});
  canvasEl.addEventListener('touchcancel', touchEndHandler.bind(this), {passive: false});

  this.mouseDownHandler = mouseDownHandler.bind(this);
  this.mouseMoveHandler = mouseMoveHandler.bind(this);
  this.mouseUpHandler = mouseUpHandler.bind(this);
  this.canvasClickHandler = canvasClickHandler.bind(this);

  $('.toolButton').click(toolButtonHandler.bind(this));
  $('#budgetRequest').click(budgetHandler.bind(this));
  $('#evalRequest').click(evalHandler.bind(this));
  $('#disasterRequest').click(disasterHandler.bind(this));
  $('#pauseRequest').click(this.speedChangeHandler.bind(this));
  $('#screenshotRequest').click(screenshotHandler.bind(this));
  $('#settingsRequest').click(settingsHandler.bind(this));
  $('#saveRequest').click(saveHandler.bind(this));
  $('#highScoreRequest').click(highScoreHandler.bind(this));
  $('#debugRequest').click(debugHandler.bind(this));
  $('#zoomInRequest').click(zoomInHandler.bind(this));
  $('#zoomOutRequest').click(zoomOutHandler.bind(this));
  $('#infoDrawerToggle').click(infoDrawerToggleHandler);
  $('#toolsDrawerToggle').click(toolsDrawerToggleHandler);
});


var canvasID = '#' + GameCanvas.DEFAULT_ID;
var toolOutputID = '#toolOutput';


var keyDownHandler = function(e) {
  var handled = false;

  switch (e.keyCode) {
    case 38:
    case 87:
      this.up = true;
      handled = true;
      break;

    case 40:
    case 83:
      this.down = true;
      handled = true;
      break;

    case 39:
    case 68:
      this.right = true;
      handled = true;
      break;

    case 37:
    case 65:
      this.left = true;
      handled = true;
      break;

    case 27:
      this.escape = true;
      handled = true;
  }

  if (handled)
    e.preventDefault();
};


var keyUpHandler = function(e) {
  switch (e.keyCode) {
    case 38:
    case 87:
      this.up = false;
      break;

    case 40:
    case 83:
      this.down = false;
      break;

    case 39:
    case 68:
      this.right = false;
      break;

    case 37:
    case 65:
      this.left = false;
      break;

    case 27:
      this.escape = false;
  }
};


var getRelativeCoordinates = function(e) {
  var cRect = document.querySelector(this.canvasID).getBoundingClientRect();
  return {x: e.clientX - cRect.left, y: e.clientY - cRect.top};
};


var mouseEnterHandler = function(e) {
  if (this.currentTool === null)
    return;

  $(this.canvasID).on('mousemove', this.mouseMoveHandler);

  if (this.currentTool.isDraggable)
    $(this.canvasID).on('mousedown', this.mouseDownHandler);
  else
    $(this.canvasID).on('click', this.canvasClickHandler);
};


var mouseDownHandler = function(e) {
  if (e.which !== 1 || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey)
    return;

  var coords = this.getRelativeCoordinates(e);
  this.mouseX = coords.x;
  this.mouseY = coords.y;

  this._dragging = true;
  this._emitEvent(Messages.TOOL_CLICKED, {x: this.mouseX, y: this.mouseY});

  this._lastDragX = Math.floor(this.mouseX / this._gameCanvas.getScaledTileWidth());
  this._lastDragY = Math.floor(this.mouseY / this._gameCanvas.getScaledTileWidth());

  $(this.canvasID).on('mouseup', this.mouseUpHandler);
  e.preventDefault();
};


var mouseUpHandler = function(e) {
  this._dragging = false;
  this._lastDragX = -1;
  this._lastDragY = -1;
  $(this.canvasID).off('mouseup');
  e.preventDefault();
};


var mouseLeaveHandler = function(e) {
  $(this.canvasID).off('mousedown');
  $(this.canvasID).off('mousemove');
  $(this.canvasID).off('mouseup');

  // Watch out: we might have been mid-drag
  if (this._dragging) {
    this._dragging = false;
    this._lastDragX = -1;
    this._lastDragY = -1;
  }

  $(this.canvasID).off('click');

  this.mouseX = -1;
  this.mouseY = -1;
};


var mouseMoveHandler = function(e) {
  var coords = this.getRelativeCoordinates(e);
  this.mouseX = coords.x;
  this.mouseY = coords.y;

  if (this._dragging) {
    // XXX Work up how to patch up the path for fast mouse moves. My first attempt was too slow, and ended up missing
    // mouseUp events
    var x = Math.floor(this.mouseX / this._gameCanvas.getScaledTileWidth());
    var y = Math.floor(this.mouseY / this._gameCanvas.getScaledTileWidth());

    var lastX = this._lastDragX;
    var lastY = this._lastDragY;
    if (x !== lastX || y !== lastY) {
      this._emitEvent(Messages.TOOL_CLICKED, {x: this.mouseX, y: this.mouseY});
      this._lastDragX = x;
      this._lastDragY = y;
    }
  }
};


var canvasClickHandler = function(e) {
  if (e.which !== 1 || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || this.mouseX === -1 ||
     this._mouseY === -1 || this._dragging)
    return;

  this._emitEvent(Messages.TOOL_CLICKED, {x: this.mouseX, y: this.mouseY});
  e.preventDefault();
};


// Touch input has to do three different jobs a mouse splits across three separate DOM
// events (mousedown+drag, click, and nothing -- panning has no mouse equivalent at all):
//   - a draggable tool selected (road/rail/wire): touch-down starts painting immediately,
//     same as mousedown, and dragging paints a line, same as mousemove while dragging
//   - a non-draggable tool selected (zones, buildings, bulldozer, query): a short tap
//     places it once, same as a plain click -- but the placement only happens on
//     touchend, once we know the finger *didn't* turn out to be panning
//   - no draggable tool in progress: the drag pans the camera instead (see the
//     accumulator logic below, tile-quantized exactly like the keyboard controls, since
//     the engine assumes an integer tile origin throughout)
var touchStartHandler = function(e) {
  var touch = e.touches[0];
  if (!touch)
    return;

  var coords = this.getRelativeCoordinates(touch);
  this.mouseX = coords.x;
  this.mouseY = coords.y;

  this._touchStartX = touch.clientX;
  this._touchStartY = touch.clientY;
  this._touchMoved = false;

  this._panLastX = touch.clientX;
  this._panLastY = touch.clientY;
  this._panAccumX = 0;
  this._panAccumY = 0;

  if (this.currentTool !== null && this.currentTool.isDraggable) {
    this._dragging = true;
    this._emitEvent(Messages.TOOL_CLICKED, {x: this.mouseX, y: this.mouseY});
    this._lastDragX = Math.floor(this.mouseX / this._gameCanvas.getScaledTileWidth());
    this._lastDragY = Math.floor(this.mouseY / this._gameCanvas.getScaledTileWidth());
  }
};


var touchMoveHandler = function(e) {
  var touch = e.touches[0];
  if (!touch || this._panLastX === null)
    return;

  e.preventDefault();

  var coords = this.getRelativeCoordinates(touch);
  this.mouseX = coords.x;
  this.mouseY = coords.y;

  if (!this._touchMoved) {
    var totalDx = touch.clientX - this._touchStartX;
    var totalDy = touch.clientY - this._touchStartY;
    if (Math.sqrt(totalDx * totalDx + totalDy * totalDy) > TAP_MOVE_THRESHOLD)
      this._touchMoved = true;
  }

  if (this._dragging) {
    // Painting a draggable tool along the path, exactly like mouseMoveHandler
    var tileWidth = this._gameCanvas.getScaledTileWidth();
    var x = Math.floor(this.mouseX / tileWidth);
    var y = Math.floor(this.mouseY / tileWidth);

    if (x !== this._lastDragX || y !== this._lastDragY) {
      this._emitEvent(Messages.TOOL_CLICKED, {x: this.mouseX, y: this.mouseY});
      this._lastDragX = x;
      this._lastDragY = y;
    }

    return;
  }

  // Not painting: pan the camera instead
  var dx = touch.clientX - this._panLastX;
  var dy = touch.clientY - this._panLastY;
  this._panLastX = touch.clientX;
  this._panLastY = touch.clientY;

  this._panAccumX += dx;
  this._panAccumY += dy;

  var scaledTileWidth = this._gameCanvas.getScaledTileWidth();

  // Dragging right/down reveals what's to the left/above, i.e. the origin moves the
  // opposite way to the finger -- the classic "grab and drag the world" feel
  while (this._panAccumX >= scaledTileWidth) {
    this._gameCanvas.moveWest();
    this._panAccumX -= scaledTileWidth;
  }
  while (this._panAccumX <= -scaledTileWidth) {
    this._gameCanvas.moveEast();
    this._panAccumX += scaledTileWidth;
  }
  while (this._panAccumY >= scaledTileWidth) {
    this._gameCanvas.moveNorth();
    this._panAccumY -= scaledTileWidth;
  }
  while (this._panAccumY <= -scaledTileWidth) {
    this._gameCanvas.moveSouth();
    this._panAccumY += scaledTileWidth;
  }
};


var touchEndHandler = function(e) {
  if (this._dragging) {
    // End of a drag-paint gesture
    this._dragging = false;
    this._lastDragX = -1;
    this._lastDragY = -1;
  } else if (this.currentTool !== null && !this._touchMoved && e.type !== 'touchcancel') {
    // A genuine tap that didn't turn into a pan: place the tool once. touchcancel means
    // the OS interrupted the touch (an incoming call etc.), not a deliberate tap
    this._emitEvent(Messages.TOOL_CLICKED, {x: this.mouseX, y: this.mouseY});
  }

  this._panLastX = null;
  this._panLastY = null;
  this._touchStartX = null;
  this._touchStartY = null;
  this.mouseX = -1;
  this.mouseY = -1;
};


var toolButtonHandler = function(e) {
  // Remove highlight from last tool button
  $('.selected').each(function() {
    $(this).removeClass('selected');
    $(this).addClass('unselected');
  });

  // Add highlight
  $(e.target).removeClass('unselected');
  $(e.target).addClass('selected');

  this.toolName = $(e.target).attr('data-tool');
  this.toolWidth = $(e.target).attr('data-size');
  this.currentTool = this.gameTools[this.toolName];
  this.toolColour = $(e.target).attr('data-colour');
  $(toolOutputID).html('Tools');

  if (this.toolName !== 'query') {
    $(this.canvasID).removeClass('helpPointer');
    $(this.canvasID).addClass('pointer');
  } else {
    $(this.canvasID).removeClass('pointer');
    $(this.canvasID).addClass('helpPointer');
  }

  // On mobile the tool palette is an overlay drawer -- close it once a tool's picked so
  // the map underneath is immediately tappable, rather than making the player dismiss it
  // manually first. A no-op on desktop, where this class is never set.
  $('body').removeClass('showToolsDrawer');

  e.preventDefault();
};


InputStatus.prototype.speedChangeHandler = function(e) {
  var requestedSpeed = $('#pauseRequest').text();
  var newRequest = requestedSpeed === 'Pause' ? 'Play' : 'Pause';
  $('#pauseRequest').text(newRequest);
  this._emitEvent(Messages.SPEED_CHANGE, requestedSpeed);
};


InputStatus.prototype.clearTool = function() {
  if (this.toolName === 'query') {
    $(this.canvasID).removeClass('helpPointer');
    $(this.canvasID).addClass('pointer');
  }

  this.currentTool = null;
  this.toolWidth = 0;
  this.toolColour = '';
  $('.selected').removeClass('selected');
};


var wheelHandler = function(e) {
  e.preventDefault();

  if (e.originalEvent.deltaY < 0)
    this._gameCanvas.zoomIn();
  else if (e.originalEvent.deltaY > 0)
    this._gameCanvas.zoomOut();
};


var zoomInHandler = function(e) {
  e.preventDefault();
  this._gameCanvas.zoomIn();
};


var zoomOutHandler = function(e) {
  e.preventDefault();
  this._gameCanvas.zoomOut();
};


// Below 768px wide, the info/menu and tools panels become toggleable overlay drawers
// (see the CSS) instead of always-on. Mutually exclusive -- opening one closes the
// other, since both fully open at once wouldn't fit next to each other on a phone.
var infoDrawerToggleHandler = function(e) {
  e.preventDefault();
  $('body').toggleClass('showInfoDrawer').removeClass('showToolsDrawer');
};


var toolsDrawerToggleHandler = function(e) {
  e.preventDefault();
  $('body').toggleClass('showToolsDrawer').removeClass('showInfoDrawer');
};


var makeHandler = function(message) {
  var m = Messages[message];

  return function(e) {
    this._emitEvent(m);
  };
};


var budgetHandler = makeHandler('BUDGET_REQUESTED');
var highScoreHandler = makeHandler('HIGH_SCORE_REQUESTED');
var debugHandler = makeHandler('DEBUG_WINDOW_REQUESTED');
var disasterHandler = makeHandler('DISASTER_REQUESTED');
var evalHandler = makeHandler('EVAL_REQUESTED');
var screenshotHandler = makeHandler('SCREENSHOT_WINDOW_REQUESTED');
var settingsHandler = makeHandler('SETTINGS_WINDOW_REQUESTED');
var saveHandler = makeHandler('SAVE_REQUESTED');


export { InputStatus };
