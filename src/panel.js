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

import { MiscUtils } from './miscUtils.js';

// First slice of a floating/draggable panel abstraction meant to eventually replace
// ModalWindow for non-blocking UI (budget, eval, etc) -- proven out here against the
// RCI/demand graph first. Below the CSS mobile breakpoint (768px, must match
// style.css) this deliberately does nothing: dragging and remembered position stay
// desktop-only, so mobile keeps the drawer-based layout exactly as it is today.
var MOBILE_BREAKPOINT = 768;
var STORAGE_PREFIX = 'b0r3dCityPanel_';

// A shared MediaQueryList rather than a plain window 'resize' listener -- resize
// doesn't reliably fire for every kind of viewport change (some devtools/emulator
// viewport overrides don't dispatch it at all), where matchMedia's change event is
// the purpose-built, more reliable signal for "did we cross this breakpoint".
var desktopMediaQuery = window.matchMedia('(min-width: ' + (MOBILE_BREAKPOINT + 1) + 'px)');

function isDesktop() {
  return desktopMediaQuery.matches;
}

// Shared across every Panel instance so bring-to-front is a total order across all
// of them, not just within one panel's own drags. Starts at .modal's own CSS
// z-index (20, see style.css) so the first-ever focus() still rises above anything
// that's never been focused, rather than starting below it.
var topZIndex = 20;

// Every Panel that's ever been constructed, so a dragged one can check proximity
// against all the others for edge-snapping. Panels live for the whole game session
// (none are ever destroyed), so this never needs pruning.
var allPanels = [];

// How close (px) an edge needs to get before it snaps into alignment.
var SNAP_THRESHOLD = 15;


// id: DOM id of the panel's outer element, which must contain a child <header> to
// serve as the drag handle -- every rciPanel/.modal window already has one (used
// today for a title bar), so this needs no markup changes to attach to them.
// defaultPosition: optional {left, top} used the first time this panel is ever
// shown, before the player has dragged it anywhere -- if omitted, defaults to
// top-centre, which is the one spot guaranteed clear of both the #leftStack column
// and the #controls column at any width this runs at (isDesktop() gates floating on
// a 768px minimum, well past where either sidebar reaches). Callers whose content is
// wide enough to need better centring (e.g. the 500px-wide .modal windows) should
// pass their own defaultPosition rather than rely on this fallback.
// opts: optional {resizable, minWidth, minHeight, onResize}. resizable adds a
// drag handle in the bottom-right corner (desktop only, same as dragging); the
// panel's content is expected to be laid out so it can actually grow/shrink into
// whatever size is picked (flex/overflow, not a fixed intrinsic size) -- see
// rciPanel and #controls for the two panels that use this today. onResize fires
// on every mousemove while resizing, so content that needs to redraw itself to
// the new size (the RCI graph) can do so immediately rather than waiting for its
// own next unrelated update.
var Panel = function(id, defaultPosition, opts) {
  this._selector = MiscUtils.normaliseDOMid(id);
  this._el = $(this._selector);
  if (this._el.length === 0)
    throw new Error('Node ' + this._selector + ' not found');

  opts = opts || {};
  this._storageKey = STORAGE_PREFIX + id;
  this._defaultPosition = defaultPosition || null;
  this._dragging = false;

  this._resizable = !!opts.resizable;
  this._minWidth = opts.minWidth || 120;
  this._minHeight = opts.minHeight || 80;
  this._onResizeCallback = opts.onResize || null;
  this._resizing = false;

  allPanels.push(this);

  this._el.find('header').first().on('mousedown', this._startDrag.bind(this));
  $(document).on('mousemove', this._drag.bind(this));
  $(document).on('mouseup', this._endDrag.bind(this));
  desktopMediaQuery.addEventListener('change', this._onBreakpointChange.bind(this));

  if (this._resizable) {
    this._handle = $('<div class="panelResizeHandle"></div>');
    this._el.append(this._handle);
    this._handle.on('mousedown', this._startResize.bind(this));
    $(document).on('mousemove', this._resizeMove.bind(this));
    $(document).on('mouseup', this._endResize.bind(this));
  }

  if (isDesktop())
    this._float();
};


Panel.prototype._float = function() {
  var pos = this._loadPosition() || this._defaultPosition || this._topCentreDefault();
  // transform:none neutralises .modal's centring transform (translate(-50%,-50%)) --
  // without it, left/top below would end up double-offset by the modal's own width/
  // height on top of wherever we're placing it. No-op for panels with no transform.
  var css = {position: 'fixed', margin: 0, transform: 'none', left: pos.left, top: pos.top};
  if (this._resizable && pos.width && pos.height) {
    css.width = pos.width;
    css.height = pos.height;
  }
  this._el.css(css);

  if (this._onResizeCallback)
    this._onResizeCallback();
};


// Doesn't measure the panel's own width -- it may still be display:none
// (initialHidden) the first time this runs, which would read as 0 -- so this
// is only approximately centred, not pixel-perfect. Fine for a starting spot.
Panel.prototype._topCentreDefault = function() {
  return {left: Math.round(window.innerWidth / 2) - 63, top: 60};
};


Panel.prototype._unfloat = function() {
  // Clearing width/height is a no-op for non-resizable panels (they never get an
  // inline size in the first place) and hands control back to style.css's drawer
  // rules for resizable ones, same as position/left/top below.
  this._el.css({position: '', margin: '', transform: '', left: '', top: '', width: '', height: ''});
};


// Called by Game whenever this panel's window is opened or re-requested while
// already open, and internally on drag-start below, so both "open it" and "click/
// drag an already-open one" bring it above the rest of the stack.
Panel.prototype.focus = function() {
  topZIndex += 1;
  this._el.css('z-index', topZIndex);

  // Opening is the first moment a modal window is measurable (they're display:none
  // until then, which _keepOnScreen can't work with), so it's also the first chance
  // to catch one whose remembered position came from a wider window than this one.
  this._keepOnScreen();
};


Panel.prototype._startDrag = function(e) {
  if (!isDesktop())
    return;

  this.focus();
  this._dragging = true;
  this._dragStartX = e.clientX;
  this._dragStartY = e.clientY;

  var offset = this._el.offset();
  this._elStartLeft = offset.left;
  this._elStartTop = offset.top;
  e.preventDefault();
};


Panel.prototype._drag = function(e) {
  if (!this._dragging)
    return;

  var left = this._elStartLeft + (e.clientX - this._dragStartX);
  var top = this._elStartTop + (e.clientY - this._dragStartY);
  var snapped = this._snap(left, top);

  this._el.css({left: snapped.left, top: snapped.top});
};


// Pulls this panel's edges into line with the nearest edge of any other visible
// panel once within SNAP_THRESHOLD px -- either edge-to-edge (this panel's right
// meeting another's left, say) or edge-to-matching-edge (both left edges lining
// up), so a few windows dragged near each other click together into a deliberate
// cluster -- e.g. Budget and Settings side by side as a makeshift menu -- instead
// of needing pixel-perfect placement. X and Y snap independently of each other.
Panel.prototype._snap = function(left, top) {
  var width = this._el[0].offsetWidth;
  var height = this._el[0].offsetHeight;
  var right = left + width;
  var bottom = top + height;

  var snappedLeft = null;
  var snappedTop = null;

  for (var i = 0; i < allPanels.length && (snappedLeft === null || snappedTop === null); i++) {
    var other = allPanels[i];
    if (other === this || !other._el.is(':visible'))
      continue;

    var oOffset = other._el.offset();
    var oLeft = oOffset.left;
    var oTop = oOffset.top;
    var oRight = oLeft + other._el[0].offsetWidth;
    var oBottom = oTop + other._el[0].offsetHeight;

    if (snappedLeft === null) {
      if (Math.abs(right - oLeft) < SNAP_THRESHOLD)
        snappedLeft = oLeft - width; // this panel's right edge meets other's left edge
      else if (Math.abs(left - oRight) < SNAP_THRESHOLD)
        snappedLeft = oRight; // this panel's left edge meets other's right edge
      else if (Math.abs(left - oLeft) < SNAP_THRESHOLD)
        snappedLeft = oLeft; // left edges align
      else if (Math.abs(right - oRight) < SNAP_THRESHOLD)
        snappedLeft = oRight - width; // right edges align
    }

    if (snappedTop === null) {
      if (Math.abs(bottom - oTop) < SNAP_THRESHOLD)
        snappedTop = oTop - height; // this panel's bottom edge meets other's top edge
      else if (Math.abs(top - oBottom) < SNAP_THRESHOLD)
        snappedTop = oBottom; // this panel's top edge meets other's bottom edge
      else if (Math.abs(top - oTop) < SNAP_THRESHOLD)
        snappedTop = oTop; // top edges align
      else if (Math.abs(bottom - oBottom) < SNAP_THRESHOLD)
        snappedTop = oBottom - height; // bottom edges align
    }
  }

  return {
    left: snappedLeft === null ? left : snappedLeft,
    top: snappedTop === null ? top : snappedTop
  };
};


Panel.prototype._endDrag = function() {
  if (!this._dragging)
    return;

  this._dragging = false;
  this._keepOnScreen();
  this._savePosition();
};


// Pulls this panel back inside the viewport if any of it has ended up outside. The
// only handle a panel offers is its own header, so a panel that ends up fully
// off-screen can't be dragged back -- and with #controls (the entire build toolbar)
// among them, that leaves a player with no way to build and nothing to click. It's
// easy to reach, too: a panel's default position is worked out once, from the window
// width at the time, and a remembered one can be from a session at any width at all,
// so simply making the window narrower is enough to strand one.
Panel.prototype._keepOnScreen = function() {
  // offsetWidth/Height read 0 while a panel is hidden -- every modal window starts
  // that way, and the sidebar panels are .initialHidden until the game reveals them
  // -- which would clamp against a zero-sized box and park them somewhere no more
  // useful. focus() and Game's reveal both re-run this once they're measurable.
  if (!isDesktop() || !this._el.is(':visible'))
    return;

  var el = this._el[0];
  var offset = this._el.offset();
  var maxLeft = Math.max(0, window.innerWidth - el.offsetWidth);
  var maxTop = Math.max(0, window.innerHeight - el.offsetHeight);

  this._el.css({
    left: MiscUtils.clamp(offset.left, 0, maxLeft),
    top: MiscUtils.clamp(offset.top, 0, maxTop)
  });
};


// Every panel at once. Bound to window resize below (the case that strands a panel in
// the first place) and called by Game once it un-hides the sidebar panels, which is
// when a remembered-from-a-wider-window position first becomes measurable.
Panel.keepAllOnScreen = function() {
  for (var i = 0; i < allPanels.length; i++)
    allPanels[i]._keepOnScreen();
};


// Debounced rather than run per event: dragging a window's edge fires resize
// continuously, and each pass reads back every visible panel's geometry. A timer
// rather than requestAnimationFrame, which doesn't run at all while the page is
// hidden -- a resize arriving in a backgrounded tab would leave a coalescing flag set
// with no frame ever coming to clear it, silently disabling this listener for the rest
// of the session.
var clampTimer = null;
window.addEventListener('resize', function() {
  window.clearTimeout(clampTimer);
  clampTimer = window.setTimeout(Panel.keepAllOnScreen, 100);
});


Panel.prototype._startResize = function(e) {
  if (!isDesktop())
    return;

  this.focus();
  this._resizing = true;
  this._resizeStartX = e.clientX;
  this._resizeStartY = e.clientY;
  this._resizeStartWidth = this._el[0].offsetWidth;
  this._resizeStartHeight = this._el[0].offsetHeight;
  // The handle sits inside the same header-bearing element as the drag handle --
  // without this, the mousedown would also bubble up and could be mistaken for
  // the start of a drag by anything else listening on the document.
  e.stopPropagation();
  e.preventDefault();
};


Panel.prototype._resizeMove = function(e) {
  if (!this._resizing)
    return;

  var width = this._resizeStartWidth + (e.clientX - this._resizeStartX);
  var height = this._resizeStartHeight + (e.clientY - this._resizeStartY);

  width = MiscUtils.clamp(width, this._minWidth, window.innerWidth - 20);
  height = MiscUtils.clamp(height, this._minHeight, window.innerHeight - 20);

  this._el.css({width: width, height: height});

  if (this._onResizeCallback)
    this._onResizeCallback();
};


Panel.prototype._endResize = function() {
  if (!this._resizing)
    return;

  this._resizing = false;
  this._keepOnScreen();
  this._savePosition();
};


// Crossing the mobile breakpoint live (narrowing/widening the window, rotating a
// tablet) needs to hand control back and forth between panel.js's inline styles and
// style.css's drawer rules, or the panel can get stuck floating mid-drawer or vice
// versa. Bound to desktopMediaQuery's change event above, not window resize.
Panel.prototype._onBreakpointChange = function() {
  if (isDesktop()) {
    this._float();
    this._keepOnScreen();
  } else {
    this._dragging = false;
    this._resizing = false;
    this._unfloat();
  }
};


Panel.prototype._loadPosition = function() {
  try {
    var raw = window.localStorage.getItem(this._storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    // Private browsing / storage disabled -- fall back to the default position
    return null;
  }
};


Panel.prototype._savePosition = function() {
  try {
    var offset = this._el.offset();
    var data = {left: offset.left, top: offset.top};
    if (this._resizable) {
      data.width = this._el[0].offsetWidth;
      data.height = this._el[0].offsetHeight;
    }
    window.localStorage.setItem(this._storageKey, JSON.stringify(data));
  } catch (e) {
    // Nothing we can do if storage is unavailable -- the panel just won't remember
  }
};


export { Panel };
