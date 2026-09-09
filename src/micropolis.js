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

import { Config } from './config.js';
import { SiteEnv } from './siteEnv.js';
import { SplashScreen } from './splashScreen.js';
import { TileSet } from './tileSet.js';
import { TileSetURI } from './tileSetURI.ts';

/*
 *
 * Our task in main is to load the tile image, create a TileSet from it, and then tell the SplashScreen to display
 * itself. We will never return here.
 *
 */


var fallbackImage, tileSet;


var onAllTilesLoaded = function() {
  // Kick things off properly
  var sprites = $('#sprites')[0];
  if (sprites.complete) {
    $('#loadingBanner').css('display', 'none');
    var s = new SplashScreen(tileSet, sprites);
  } else {
     window.setTimeout(onAllTilesLoaded, 0);
  }
};


// XXX Replace with an error dialog
var onFallbackError = function() {
  fallbackImage.onload = fallbackImage.onerror = null;
  alert('Failed to load tileset!');
};


var onFallbackLoad = function() {
  fallbackImage.onload = fallbackImage.onerror = null;
  tileSet = new TileSet(fallbackImage, onAllTilesLoaded, onFallbackError);
};


var tileSetError = function() {
  // We might be running locally in Chrome, which handles the security context of file URIs differently, which makes
  // things go awry when we try to create an image from a "tainted" canvas (one we've painted on). Let's try creating
  // the tileset by URI instead
  fallbackImage = new Image();
  fallbackImage.onload = onFallbackLoad;
  fallbackImage.onerror = onFallbackError;
  fallbackImage.src = TileSetURI;
};


// #wrapper (everything below the header: the splash screen, then the map) is
// absolutely positioned, so it has to be told how far down to start rather than simply
// following the header. Publishing the header's real height as a custom property is
// what lets css/style.css stop guessing at it per breakpoint -- see the comment on
// #wrapper there for what the guesses cost. Re-run on resize (the header wraps to a
// second row on a narrow enough phone) and once webfonts land, since the title is set
// in one and the header sizes to it.
var syncHeaderHeight = function() {
  var header = document.getElementById('header');
  if (header)
    document.documentElement.style.setProperty('--headerHeight', header.offsetHeight + 'px');
};

syncHeaderHeight();
window.addEventListener('resize', syncHeaderHeight);
if (document.fonts && document.fonts.ready)
  document.fonts.ready.then(syncHeaderHeight);


// Check for debug parameter in URL
Config.debug = window.location.search.slice(1).split('&').some(function(param) {
  return param.trim().toLowerCase() === 'debug=1';
});


// The beta build (anywhere but the main site) gets a visible label so it's
// never mistaken for the current release, in both the title bar and the header.
if (!SiteEnv.isMainSite()) {
  document.title = document.title + ' (Beta Build)';
  var titleEl = document.getElementById('title');
  if (titleEl)
    titleEl.insertAdjacentHTML('beforeend', ' <small>(Beta Build)</small>');
}


var tiles = $('#tiles')[0];
tileSet = new TileSet(tiles, onAllTilesLoaded, tileSetError);
