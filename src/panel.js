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
var Panel = function(id, defaultPosition) {
  this._selector = MiscUtils.normaliseDOMid(id);
  this._el = $(this._selector);
  if (this._el.length === 0)
    throw new Error('Node ' + this._selector + ' not found');

  this._storageKey = STORAGE_PREFIX + id;
  this._defaultPosition = defaultPosition || null;
  this._dragging = false;

  allPanels.push(this);

  this._el.find('header').first().on('mousedown', this._startDrag.bind(this));
  $(document).on('mousemove', this._drag.bind(this));
  $(document).on('mouseup', this._endDrag.bind(this));
  desktopMediaQuery.addEventListener('change', this._onResize.bind(this));

  if (isDesktop())
    this._float();
};


Panel.prototype._float = function() {
  var pos = this._loadPosition() || this._defaultPosition || this._topCentreDefault();
  // transform:none neutralises .modal's centring transform (translate(-50%,-50%)) --
  // without it, left/top below would end up double-offset by the modal's own width/
  // height on top of wherever we're placing it. No-op for panels with no transform.
  this._el.css({position: 'fixed', margin: 0, transform: 'none', left: pos.left, top: pos.top});
};


// Doesn't measure the panel's own width -- it may still be display:none
// (initialHidden) the first time this runs, which would read as 0 -- so this
// is only approximately centred, not pixel-perfect. Fine for a starting spot.
Panel.prototype._topCentreDefault = function() {
  return {left: Math.round(window.innerWidth / 2) - 63, top: 60};
};


Panel.prototype._unfloat = function() {
  this._el.css({position: '', margin: '', transform: '', left: '', top: ''});
};


// Called by Game whenever this panel's window is opened or re-requested while
// already open, and internally on drag-start below, so both "open it" and "click/
// drag an already-open one" bring it above the rest of the stack.
Panel.prototype.focus = function() {
  topZIndex += 1;
  this._el.css('z-index', topZIndex);
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


Panel.prototype._keepOnScreen = function() {
  var el = this._el[0];
  var offset = this._el.offset();
  var maxLeft = Math.max(0, window.innerWidth - el.offsetWidth);
  var maxTop = Math.max(0, window.innerHeight - el.offsetHeight);

  this._el.css({
    left: MiscUtils.clamp(offset.left, 0, maxLeft),
    top: MiscUtils.clamp(offset.top, 0, maxTop)
  });
};


// Crossing the mobile breakpoint live (narrowing/widening the window, rotating a
// tablet) needs to hand control back and forth between panel.js's inline styles and
// style.css's drawer rules, or the panel can get stuck floating mid-drawer or vice
// versa. Bound to desktopMediaQuery's change event above, not window resize.
Panel.prototype._onResize = function() {
  if (isDesktop()) {
    this._float();
    this._keepOnScreen();
  } else {
    this._dragging = false;
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
    window.localStorage.setItem(this._storageKey, JSON.stringify({left: offset.left, top: offset.top}));
  } catch (e) {
    // Nothing we can do if storage is unavailable -- the panel just won't remember
  }
};


export { Panel };
