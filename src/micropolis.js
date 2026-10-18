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

// The game's own modules, handed to admin mode's CITY HALL face (window.__bc.lib below).
import * as BaseToolModule from './baseTool.js';
import * as ConfigModule from './config.js';
import * as CustomBuildingsModule from './customBuildings.js';
import * as DevModeModule from './devMode.js';
import * as MessagesModule from './messages.ts';
import * as MiscUtilsModule from './miscUtils.js';
import * as OrdinancesModule from './ordinances.js';
import * as ScenariosModule from './scenarios.js';
import * as SiteEnvModule from './siteEnv.js';
import * as SplashScreenModule from './splashScreen.js';
import * as SpriteConstantsModule from './spriteConstants.ts';
import * as SpriteUtilsModule from './spriteUtils.js';
import * as StorageModule from './storage.js';
import * as TextModule from './text.js';
import * as TileFlagsModule from './tileFlags.ts';
import * as TileUtilsModule from './tileUtils.js';
import * as TileValuesModule from './tileValues.ts';

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

// A ResizeObserver as well as the two triggers above, because since v0.89.6 the header
// is a HUD bar whose height changes for reasons neither of them sees. The case that
// actually broke: its readouts are .initialHidden until a city starts, so on a phone the
// bar is one row on the splash screen and two rows once the game reveals them -- no
// resize event, no font load, and #wrapper went on starting at the one-row height with
// the second row hidden underneath the map. An observer catches that, and every other
// reflow (a drawer opening, a long city name, rotating the phone) for free.
if (window.ResizeObserver) {
  var header = document.getElementById('header');
  if (header)
    new ResizeObserver(syncHeaderHeight).observe(header);
}


// Check for debug parameter in URL
Config.debug = window.location.search.slice(1).split('&').some(function(param) {
  return param.trim().toLowerCase() === 'debug=1';
});


// window.__bc (v0.89.7): what b0r3d.org's admin mode drives, and what tests use. The
// dev menu that used to load here behind ?dev=1 is gone from this bundle: it's CITY
// HALL now, built on its own (webpack.admin.config.js) into the site's
// _admin/games/city.js, which only the owner's Cloudflare Access login can load. It
// takes every engine module it needs from `lib` instead of bundling copies of its own
// (a copy of devMode.js would never hear of the running Game). Once mounted it adds its
// console API here too (game, step, ff, tile, pick, overlay, act, look, open).
window.__bc = {
  lib: {
    baseTool: BaseToolModule, config: ConfigModule, customBuildings: CustomBuildingsModule,
    devMode: DevModeModule, messages: MessagesModule, miscUtils: MiscUtilsModule,
    ordinances: OrdinancesModule, scenarios: ScenariosModule, siteEnv: SiteEnvModule,
    splashScreen: SplashScreenModule, spriteConstants: SpriteConstantsModule,
    spriteUtils: SpriteUtilsModule, storage: StorageModule, text: TextModule,
    tileFlags: TileFlagsModule, tileUtils: TileUtilsModule, tileValues: TileValuesModule
  },
  game: function() { return DevMode.getGame(); }
};


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
