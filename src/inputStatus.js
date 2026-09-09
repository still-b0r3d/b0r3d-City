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

// How much the distance between two touches must change (as a ratio) to trigger one
// discrete pinch-zoom step -- e.g. 1.3 means the fingers have to move 30% further apart
// (or closer together) before zooming in (or out) one ZOOM_LEVELS step.
var PINCH_ZOOM_STEP_RATIO = 1.3;

// How long (in ms) a draggable tool's touch-down placement is held back before
// committing, giving a second finger landing moments later (the start of a two-finger
// pan) a chance to cancel it first -- see touchStartHandler. Committed early, on the
// first touchmove or touchend, if either fires before this expires, so real single-
// finger taps/drags are only ever delayed by a few ms in practice, not the full amount.
var PENDING_PLACEMENT_DELAY = 50;


var getTouchDistance = function(touch0, touch1) {
  var dx = touch0.clientX - touch1.clientX;
  var dy = touch0.clientY - touch1.clientY;
  return Math.sqrt(dx * dx + dy * dy);
};


var getTouchMidpoint = function(touches) {
  return {x: (touches[0].clientX + touches[1].clientX) / 2,
          y: (touches[0].clientY + touches[1].clientY) / 2};
};


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

  // Read as a one-shot: Game clears it as soon as it acts on it (see handleInput),
  // so _escapeHeld is what stops the OS's key auto-repeat re-arming it over and over
  // while the key is simply being held down.
  this.escape = false;
  this._escapeHeld = false;

  // Mouse movement
  this.mouseX = -1;
  this.mouseY = -1;

  // Mouse drags
  this._dragging = false;
  this._lastDragX = -1;
  this._lastDragY = -1;

  // Touch panning (one-finger drag scrolls the camera when no draggable tool is active;
  // with two fingers down, pan tracks their midpoint instead of a single finger, so pan
  // and pinch-zoom -- which reads the *distance* between the same two touches -- don't
  // interfere with each other)
  this._panLastX = null;
  this._panLastY = null;
  this._panAccumX = 0;
  this._panAccumY = 0;
  this._pinchStartDist = null;

  // See PENDING_PLACEMENT_DELAY above
  this._pendingPlacementTimer = null;
  this._pendingPlacementX = -1;
  this._pendingPlacementY = -1;

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

  // Delegated (not bound directly to each button) since game.js renders the custom
  // buildings' toolButtons into #buttons at runtime, after this constructor may already
  // have run -- a direct .click() binding here would never see those.
  $('#buttons').on('click', '.toolButton', toolButtonHandler.bind(this));
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
  $('#cancelToolToggle').click(cancelToolHandler.bind(this));
});


var canvasID = '#' + GameCanvas.DEFAULT_ID;
var toolOutputID = '#toolOutput';


// True while the keystroke belongs to something the player is typing into rather than
// to the game. These handlers are bound to the document, so they see every key pressed
// anywhere on the page -- including inside a window's own fields.
var isTypingTarget = function(target) {
  if (!target)
    return false;

  var tag = target.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || target.isContentEditable === true;
};


var keyDownHandler = function(e) {
  // Escape is meaningful wherever it's pressed, a focused field included -- there it's
  // the natural way to dismiss the dialog the field belongs to (Game closes the topmost
  // window when it sees this).
  if (e.keyCode === 27) {
    // Only the first keydown of a press counts. Game treats this as a one-shot and
    // clears it the moment it acts, so without this guard the OS's auto-repeat would
    // keep re-arming it and a single held Escape would close every open window.
    if (!this._escapeHeld) {
      this._escapeHeld = true;
      this.escape = true;
    }

    e.preventDefault();
    return;
  }

  // Everything below is a camera-movement key, and those belong to the focused field
  // whenever there is one: preventDefault() at the end doesn't merely stop the camera
  // moving, it suppresses the keystroke outright. That meant W, A, S and D simply
  // could not be typed into a save name or a set of high-score initials, and the arrow
  // keys couldn't move the caret within one.
  if (isTypingTarget(e.target))
    return;

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
  }

  if (handled)
    e.preventDefault();
};


// Deliberately not gated on isTypingTarget the way keyDownHandler is: a key held down
// over the map and released after focus moved into a field still has to clear its flag,
// or the camera would keep panning on its own.
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
      this._escapeHeld = false;
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
  // `this._mouseY` here was a typo for `this.mouseY` -- there is no _mouseY, so that
  // half of the "is the pointer actually over the map" check has never once been true.
  if (e.which !== 1 || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || this.mouseX === -1 ||
     this.mouseY === -1 || this._dragging)
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
// A second finger touching down always pans (by the two touches' midpoint) instead,
// regardless of which of the above applies -- otherwise a draggable tool has no way to
// pan at all, since one finger is already spoken for by painting -- and also enables
// pinch-to-zoom, read from how the distance between the two touches changes over the
// same gesture. See the e.touches.length >= 2 branches below.
var touchStartHandler = function(e) {
  var touch = e.touches[0];
  if (!touch)
    return;

  if (e.touches.length >= 2) {
    // A second finger just came down: switch to a two-finger pan regardless of the
    // selected tool, cancelling any in-progress single-finger paint so a multi-touch
    // gesture never also places something.
    if (this._dragging) {
      this._dragging = false;
      this._lastDragX = -1;
      this._lastDragY = -1;
    }

    // Cancels a still-pending touch-down placement from PENDING_PLACEMENT_DELAY ago
    // (see touchStartHandler's single-touch branch below) -- this is the case that
    // guard alone doesn't cover: without this, the first finger's draggable-tool
    // placement would still fire on its own timer a moment later even though the
    // gesture turned out to be a two-finger pan, not a paint.
    if (this._pendingPlacementTimer !== null) {
      clearTimeout(this._pendingPlacementTimer);
      this._pendingPlacementTimer = null;
    }

    this._touchMoved = true; // mid-gesture now; never treat a later touchend as a fresh tap
    var midpoint = getTouchMidpoint(e.touches);
    this._panLastX = midpoint.x;
    this._panLastY = midpoint.y;
    this._panAccumX = 0;
    this._panAccumY = 0;
    this._pinchStartDist = getTouchDistance(e.touches[0], e.touches[1]);
    return;
  }

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

  // Mirrors mouseDownHandler's modifier-key guard: a modifier held during the
  // gesture means "don't place the tool" here too. Falling through leaves
  // _dragging false, so touchMoveHandler treats the rest of the gesture as a
  // pan instead of a no-op.
  var modifierHeld = e.shiftKey || e.altKey || e.ctrlKey || e.metaKey;

  if (this.currentTool !== null && this.currentTool.isDraggable && !modifierHeld) {
    // Deferred rather than placed immediately: a second finger landing moments later
    // (the start of a two-finger pan, which physically can't touch down in the same
    // event as the first) would otherwise still leave this one tile placed even though
    // touchStartHandler's e.touches.length >= 2 branch cancels the *rest* of the drag.
    // Committed early -- by touchMoveHandler or touchEndHandler, whichever comes first
    // -- once we know for sure no second finger is coming, so a real single-finger tap
    // or drag is barely delayed at all in practice.
    this._pendingPlacementX = this.mouseX;
    this._pendingPlacementY = this.mouseY;
    var self = this;
    this._pendingPlacementTimer = setTimeout(function() {
      self._pendingPlacementTimer = null;
      commitPendingPlacement.call(self);
    }, PENDING_PLACEMENT_DELAY);
  }
};


// Fires the deferred touch-down placement scheduled in touchStartHandler above.
var commitPendingPlacement = function() {
  this._dragging = true;
  this._emitEvent(Messages.TOOL_CLICKED, {x: this._pendingPlacementX, y: this._pendingPlacementY});
  var tileWidth = this._gameCanvas.getScaledTileWidth();
  this._lastDragX = Math.floor(this._pendingPlacementX / tileWidth);
  this._lastDragY = Math.floor(this._pendingPlacementY / tileWidth);
};


// Shared by the one-finger pan (no draggable tool in progress) and the always-pan
// two-finger gesture below -- moves the camera by however many whole (zoom-scaled)
// tiles the accumulated drag distance covers, carrying any leftover fractional tile
// forward to the next call.
var applyPanAccumulator = function() {
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


var touchMoveHandler = function(e) {
  var touch = e.touches[0];
  if (!touch || this._panLastX === null)
    return;

  e.preventDefault();

  if (e.touches.length >= 2) {
    // Two (or more) fingers down: always pan (tracked via the midpoint of the first two
    // touches, not a single finger -- see the constructor comment), regardless of
    // tool/dragging state, plus pinch-to-zoom from how the distance between them changes.
    var midpoint = getTouchMidpoint(e.touches);
    this._panAccumX += midpoint.x - this._panLastX;
    this._panAccumY += midpoint.y - this._panLastY;
    this._panLastX = midpoint.x;
    this._panLastY = midpoint.y;
    applyPanAccumulator.call(this);

    if (this._pinchStartDist) {
      var dist = getTouchDistance(e.touches[0], e.touches[1]);
      var ratio = dist / this._pinchStartDist;

      // Steps through the existing discrete ZOOM_LEVELS exactly like the mouse wheel
      // does, rather than introducing a separate continuous-scale zoom -- crossing the
      // threshold re-anchors the reference distance, so a big continuous pinch steps
      // through several levels instead of only ever firing once.
      if (ratio >= PINCH_ZOOM_STEP_RATIO) {
        this._gameCanvas.zoomIn();
        this._pinchStartDist = dist;
      } else if (ratio <= 1 / PINCH_ZOOM_STEP_RATIO) {
        this._gameCanvas.zoomOut();
        this._pinchStartDist = dist;
      }
    }

    return;
  }

  var coords = this.getRelativeCoordinates(touch);
  this.mouseX = coords.x;
  this.mouseY = coords.y;

  if (!this._touchMoved) {
    var totalDx = touch.clientX - this._touchStartX;
    var totalDy = touch.clientY - this._touchStartY;
    if (Math.sqrt(totalDx * totalDx + totalDy * totalDy) > TAP_MOVE_THRESHOLD)
      this._touchMoved = true;
  }

  // Still only one finger down and it's already moving -- this was never going to be a
  // two-finger pan, so commit the deferred touch-down placement now rather than waiting
  // out the rest of PENDING_PLACEMENT_DELAY for no reason.
  if (this._pendingPlacementTimer !== null) {
    clearTimeout(this._pendingPlacementTimer);
    this._pendingPlacementTimer = null;
    commitPendingPlacement.call(this);
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
  this._panAccumX += touch.clientX - this._panLastX;
  this._panAccumY += touch.clientY - this._panLastY;
  this._panLastX = touch.clientX;
  this._panLastY = touch.clientY;

  applyPanAccumulator.call(this);
};


var touchEndHandler = function(e) {
  if (e.touches.length > 0) {
    // One finger lifted but at least one remains down -- this was a two-finger pan
    // dropping to one, not the end of the gesture. Don't reset any state, just
    // re-anchor to whichever touch is still down so the next touchmove doesn't see
    // a sudden jump from the lifted finger's last position to the remaining one's.
    var remaining = e.touches[0];
    this._panLastX = remaining.clientX;
    this._panLastY = remaining.clientY;
    this._pinchStartDist = null;
    return;
  }

  // The finger lifted before either PENDING_PLACEMENT_DELAY or a touchmove committed
  // this -- it was always just a single tap-and-release with no second finger involved,
  // so place it now instead of waiting out the rest of the timer. touchcancel (OS-
  // interrupted touch) is the one case that should place nothing, matching the tap
  // handling below.
  if (this._pendingPlacementTimer !== null) {
    clearTimeout(this._pendingPlacementTimer);
    this._pendingPlacementTimer = null;
    if (e.type !== 'touchcancel')
      commitPendingPlacement.call(this);
  }

  if (this._dragging) {
    // End of a drag-paint gesture
    this._dragging = false;
    this._lastDragX = -1;
    this._lastDragY = -1;
  } else if (this.currentTool !== null && !this._touchMoved && e.type !== 'touchcancel' &&
             !(e.shiftKey || e.altKey || e.ctrlKey || e.metaKey)) {
    // A genuine tap that didn't turn into a pan: place the tool once. touchcancel means
    // the OS interrupted the touch (an incoming call etc.), not a deliberate tap.
    // Modifier check mirrors canvasClickHandler's guard on the mouse-click path.
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


// Just reports the click. The button's label used to be flipped here too, which made
// the label and the actual paused state two separate sources of truth that could (and
// did) drift apart -- Game owns both now, and relabels from the real state.
InputStatus.prototype.speedChangeHandler = function(e) {
  this._emitEvent(Messages.SPEED_CHANGE);
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


// Always-visible fail-safe for touch, which has no Escape key: mirrors what Escape
// already does for tool selection on desktop (see Game.prototype.animate's handling
// of this.inputStatus.escape), for the case where a touch gesture (e.g. panning with
// a draggable tool still selected) placed something unwanted.
var cancelToolHandler = function(e) {
  e.preventDefault();
  this.clearTool();
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
