/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 *
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details. Alternatively,
 * consult http://micropolisjs.graememcc.co.uk/LICENSE and
 * http://micropolisjs.graememcc.co.uk/COPYING
 *
 */

// The exact same built output is deployed to two places: b0r3d.org (the
// "real"/current release) and still.b0r3d.org/lab/ (a rolling beta build).
// Rather than maintaining two divergent builds, everything that needs to
// differ between them is decided here at runtime from the hostname.
var IS_MAIN_SITE = window.location.hostname === 'b0r3d.org' || window.location.hostname === 'www.b0r3d.org';

var SiteEnv = {
  isMainSite: function() {
    return IS_MAIN_SITE;
  },

  // Kept as a separate leaderboard so beta-build scores (a possibly less
  // stable, still-changing version of the game) never mix with the main
  // site's "official" leaderboard.
  leaderboardKey: function() {
    return IS_MAIN_SITE ? 'sim_b0r3d_city' : 'sim_b0r3d_city_beta';
  }
};

export { SiteEnv };
