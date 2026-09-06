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
import { TileSetSnowURI } from './tileSetSnowURI.ts';

/*
 *
 * Our task in main is to load the tile image, create a TileSet from it, and then tell the SplashScreen to display
 * itself. We will never return here.
 *
 */


var fallbackImage, tileSet, snowTileSet;


var onTilesLoaded = function() {
  var snowTiles = $('#snowtiles')[1];
  snowTileSet = new TileSet(snowTiles, onAllTilesLoaded, onFallbackTilesLoaded);
};


var onAllTilesLoaded = function() {
  // Kick things off properly
  var sprites = $('#sprites')[0];
  if (sprites.complete) {
    $('#loadingBanner').css('display', 'none');
    var s = new SplashScreen(tileSet, snowTileSet, sprites);
  } else {
     window.setTimeout(onAllTilesLoaded, 0);
  }
};


// XXX Replace with an error dialog
var onFallbackError = function() {
  fallbackImage.onload = fallbackImage.onerror = null;
  alert('Failed to load tileset!');
};


var onFallbackSnowLoad = function() {
  fallbackImage.onload = fallbackImage.onerror = null;
  snowTileSet = new TileSet(fallbackImage, onAllTilesLoaded, onFallbackError);
};


var onFallbackTilesLoaded = function() {
  fallbackImage = new Image();
  fallbackImage.onload = onFallbackSnowLoad;
  fallbackImage.onerror = onFallbackError;
  fallbackImage.src = TileSetSnowURI;
};


var onFallbackLoad = function() {
  fallbackImage.onload = fallbackImage.onerror = null;
  tileSet = new TileSet(fallbackImage, onFallbackTilesLoaded, onFallbackError);
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


// Check for debug parameter in URL
Config.debug = window.location.search.slice(1).split('&').some(function(param) {
  return param.trim().toLowerCase() === 'debug=1';
});


// The beta build (anywhere but the main site) gets a visible label so it's
// never mistaken for the current release -- title bar, header, and the
// tweet-share text all pick up the current page's real URL/label instead
// of a hardcoded one, so this keeps working correctly if either deployment
// ever moves again.
if (!SiteEnv.isMainSite()) {
  document.title = document.title + ' (Beta Build)';
  var titleEl = document.getElementById('title');
  if (titleEl)
    titleEl.insertAdjacentHTML('beforeend', ' <small>(Beta Build)</small>');
}

var tweetButton = document.querySelector('.twitter-share-button');
if (tweetButton) {
  var gameLabel = SiteEnv.isMainSite() ? 'b0r3d-city' : 'b0r3d-city (beta build)';
  var gameUrl = window.location.origin + window.location.pathname;
  tweetButton.setAttribute('data-text', "I'm city-building like it's 1989! Playing " + gameLabel + ', a HTML5 retro city-builder ' + gameUrl);
}


var tiles = $('#tiles')[0];
tileSet = new TileSet(tiles, onTilesLoaded, tileSetError);
var snowtiles = $('#snowtiles')[1];
