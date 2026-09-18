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
import { DevMode } from './devMode.js';
import { SiteEnv } from './siteEnv.js';
import { SplashScreen } from './splashScreen.js';
import { TileSet } from './tileSet.js';

/*
 *
 * Our task in main is to load the tile image, create a TileSet from it, and then tell the SplashScreen to display
 * itself. We will never return here.
 *
 */


var tileSet;


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
//
// This used to retry with the whole tile sheet baked into the bundle as a data: URI
// (src/tileSetURI.ts, 156KB), for the one case where slicing the sheet on a canvas
// throws: a file:// page, whose canvas Chromium treats as tainted. Nothing serves the
// game that way any more -- the desktop build loads it over its own app:// scheme for
// exactly this reason -- and the baked copy had been left behind by every building
// added since, so it was trading a blank-buildings bug for a startup one.
var tileSetError = function() {
  alert('Failed to load tileset!');
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


// The dev menu (?dev=1, see devMode.js) is its own chunk, fetched only while it's on.
// Mounted now rather than once a city is running, so it's already there on the splash
// screen, where its quick-start lives.
if (DevMode.isEnabled()) {
  import(/* webpackChunkName: "dev" */ './dev/panel.js').then(function(module) {
    module.mountDevPanel();
  }).catch(function(err) {
    console.error('The dev menu failed to load', err);
  });
}


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
