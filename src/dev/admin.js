/* b0r3d-city in b0r3d.org's admin mode (v0.89.7).
 *
 * Built on its own (webpack.admin.config.js) into the site's _admin/games/city.js, which
 * the admin core loads on this page once the owner's Cloudflare Access login lets it. It
 * mounts CITY HALL (panel.js, the old dev menu) as the page's face, and lists the same
 * powers as `city.*` commands so a script never has to click:
 * `await b0r3dAdmin.run('city.funds', 1000000)`.
 *
 * Everything that changes a city marks it (Game.markCheatsUsed), as the menu always did;
 * with admin mode attached the High Scores window then asks the owner before posting it
 * (highScoreWindow.js) instead of refusing.
 */

import { DevMode } from '../devMode.js';
import * as Tools from './tools.js';
import { mountDevPanel } from './panel.js';

var A = window.b0r3dAdmin;

if (A && window.__bc) {
  var face = mountDevPanel({
    openHub: function() { A.openHub(); },
    foot: A.local ? 'local copy · mock pi' : 'admin v' + A.version
  });

  var game = function() { return DevMode.getGame(); };
  var has = function() { return !!game(); };

  // A change to the city: through the panel's own act(), which marks it.
  var change = function(label, fn) {
    if (!game())
      throw new Error('no city running: start one first');
    return face.act(label, fn);
  };
  var look = function(label, fn) {
    if (!game())
      throw new Error('no city running: start one first');
    return face.look(label, fn);
  };

  var cheat = function(name, key, title, help) {
    return {
      name: name, title: title, group: 'Cheats', help: help, touchesRun: true, heavy: true,
      args: [{name: 'on', type: 'bool'}],
      get: function() { return face.cheatOn(key); },
      run: function(on) { return face.setCheat(key, on); }
    };
  };

  var DISASTERS = ['fire', 'flood', 'crash', 'meltdown', 'tornado', 'monster', 'zombies'];
  var SPEEDS = [['pause', 'paused'], ['slow', 'slow'], ['med', 'medium'], ['fast', 'fast']];

  A.register([
    {
      name: 'city.state', title: 'state', group: 'Read',
      get: function() { return state(); },
      run: function() { return state(); }
    },

    // ----- money and cheats
    {
      name: 'city.funds', title: 'funds', group: 'Money', touchesRun: true, heavy: true,
      available: has,
      args: [{name: 'funds', type: 'int', min: 0, max: 2000000000}],
      get: function() { return game() ? game().simulation.budget.totalFunds : undefined; },
      run: function(n) {
        change('funds to $' + n, function(g) { g.simulation.budget.setFunds(n); });
        return game().simulation.budget.totalFunds;
      }
    },
    {
      name: 'city.funds_add', title: 'add funds', group: 'Money', touchesRun: true, heavy: true,
      available: has,
      args: [{name: 'amount', type: 'int', min: 1, max: 1000000000, default: 100000}],
      run: function(n) {
        change('+$' + n, function(g) { g.simulation.budget.spend(-n); });
        return game().simulation.budget.totalFunds;
      }
    },
    cheat('city.free_build', 'freeBuild', 'free build', 'every tool costs nothing (this page load)'),
    cheat('city.hold_funds', 'holdFunds', 'hold funds', 'tops funds back up to the hold amount four times a second'),
    {
      name: 'city.hold_amount', title: 'hold funds at', group: 'Cheats',
      args: [{name: 'amount', type: 'int', min: 0, max: 2000000000}],
      get: function() { return face.holdAmount(); },
      run: function(n) { return face.holdAmount(n); }
    },
    cheat('city.pin_demand', 'pinOn', 'pin demand', 'hold the R/C/I valves at the panel\'s values'),

    // ----- time
    {
      name: 'city.speed', title: 'speed', group: 'Time',
      available: has,
      args: [{name: 'speed', type: 'pick', options: SPEEDS.map(function(s) { return {value: s[0], label: s[1]}; })}],
      run: function(s) {
        look('speed ' + s, function(g) { g.handleSpeedSet(s === 'pause' ? 'pause' : s); });
        return s;
      }
    },
    {
      name: 'city.step', title: 'step phases', group: 'Time', touchesRun: true, heavy: true,
      help: '16 phases make a tick, 64 a month',
      available: has,
      args: [{name: 'phases', type: 'int', min: 1, max: 100000, default: 64}],
      run: function(n) { return change('stepped', function(g) { return g.simulation.devStep(n); }); }
    },
    {
      name: 'city.ff', title: 'fast-forward months', group: 'Time', touchesRun: true, heavy: true,
      help: 'a year takes about a tenth of a second',
      available: has,
      args: [{name: 'months', type: 'int', min: 1, max: 1200, default: 12}],
      run: function(n) {
        face.fastForward('admin +' + n + ' months', n);
        return n + ' months';
      }
    },

    // ----- the city
    {
      name: 'city.year', title: 'year', group: 'City', touchesRun: true, heavy: true,
      available: has,
      args: [{name: 'year', type: 'int', min: 1900, max: 9999}],
      get: function() { return game() ? game().simulation.getDate().year : undefined; },
      run: function(y) {
        change('year ' + y, function(g) { g.simulation._setYear(y); });
        return game().simulation.getDate().year;
      }
    },
    {
      name: 'city.tax', title: 'tax rate', group: 'City',
      help: 'what the budget window sets; not a cheat',
      available: has,
      args: [{name: 'percent', type: 'int', min: 0, max: 20}],
      get: function() { return game() ? game().simulation.budget.cityTax : undefined; },
      run: function(n) {
        look('tax ' + n + '%', function(g) { g.simulation.budget.setTax(n); });
        return n;
      }
    },
    {
      name: 'city.evaluate', title: 're-evaluate', group: 'City',
      help: 'the yearly evaluation now (score, class, opinion)',
      available: has,
      run: function() {
        return look('re-evaluated', function(g) {
          var sim = g.simulation;
          // The census is wiped at phase 0 and refilled in phases 1-8, so finish the scan
          // to phase 9, where the game's own evaluation runs, first (as the panel does).
          var ran = 0;
          while (sim._phaseCycle !== 9 && ran < 16 && sim.devStep(1) === 1)
            ran++;
          sim.evaluation.cityEvaluation(sim._constructSimData());
          return 'score ' + sim.evaluation.cityScore + ', ' + sim.evaluation.cityClass;
        });
      }
    },
    {
      name: 'city.disaster', title: 'disaster', group: 'Disasters', touchesRun: true, heavy: true,
      available: has,
      args: [{name: 'disaster', type: 'pick', options: DISASTERS.map(function(d) { return {value: d, label: d}; })}],
      run: function(d) {
        change(d, function(g) { g.cheatTriggerDisaster(d); });
        return d;
      }
    },
    {
      name: 'city.fires_out', title: 'put out fires', group: 'Disasters', touchesRun: true,
      available: has,
      run: function() { return change('put out fires', function(g) { return Tools.extinguishFires(g) + ' tiles'; }); }
    },
    {
      name: 'city.floods_drain', title: 'drain floods', group: 'Disasters', touchesRun: true,
      available: has,
      run: function() { return change('drained floods', function(g) { return Tools.drainFloods(g) + ' tiles'; }); }
    },
    {
      name: 'city.rubble_clear', title: 'clear rubble', group: 'Disasters', touchesRun: true,
      available: has,
      run: function() { return change('cleared rubble', function(g) { return Tools.clearRubble(g) + ' tiles'; }); }
    },

    // ----- views (they change nothing)
    {
      name: 'city.save', title: 'save now', group: 'Views',
      available: has,
      run: function() {
        look('saved', function(g) { g.save(g.name); });
        return game().name;
      }
    },
    {
      name: 'city.frame', title: 'draw a frame', group: 'Read',
      help: 'paints once without moving anything, for a hidden pane where rAF never comes',
      available: has,
      run: function() {
        look('drew a frame', function() {});
        return 'drawn';
      }
    },
    {
      name: 'city.tile', title: 'read a tile', group: 'Read',
      available: has,
      args: [{name: 'x', type: 'int', min: 0, max: 255}, {name: 'y', type: 'int', min: 0, max: 255}],
      run: function(x, y) { return window.__bc.tile(x, y); }
    }
  ]);

  var state = function() {
    var g = game();
    if (!g)
      return {city: null, splash: !!DevMode.getSplash()};
    var ev = g.simulation.evaluation;
    var st = g.cheatGetState();
    return {
      city: g.name,
      year: g.simulation.getDate().year,
      funds: st.funds,
      population: ev.cityPop,
      score: ev.cityScore,
      cityClass: ev.cityClass,
      tax: g.simulation.budget.cityTax,
      paused: g.simulation.isPaused(),
      freeBuild: st.freeBuild,
      cheatsUsed: !!st.cheatsUsed,
      cheats: {freeBuild: face.cheatOn('freeBuild'), holdFunds: face.cheatOn('holdFunds'), pinOn: face.cheatOn('pinOn')},
      scenario: g.scenarioController ? g.scenarioController.scenario.name : null
    };
  };

  A.useFace({id: 'city', root: face.root, open: face.open, close: face.close, isOpen: face.isOpen});
}
