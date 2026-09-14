/* b0r3d-city dev menu.
 *
 * Only loaded once `?dev=1` has been seen (see src/devMode.js and micropolis.js), as its
 * own webpack chunk, so none of this is ever downloaded in normal play. Same switch and
 * the same shape as the B0r3d RPG's and z0mbie crystal's dev menus: the DEV MENU button
 * (bottom left) opens it, the ✕ in its header closes it, and backtick does both.
 *
 * THE ONE RULE: anything here that changes a city goes through act(), which calls
 * Game.markCheatsUsed -- the same one-way flag the Settings cheat menu trips -- so a city
 * the dev menu has touched can never be submitted to the leaderboard. Looking (status,
 * the tile inspector, overlays, opening windows, drawing a frame) goes through look()
 * and leaves the city clean. Cheat switches are deliberately not remembered across a
 * reload, so loading a real save in a dev browser can't taint it without being asked;
 * only harmless view preferences are.
 *
 * Sections, top to bottom: status, cheats, city, time, disasters & sprites, tile & map,
 * overlays, windows, scenario & quick start, saves, performance, log. A console API for
 * the same things lives on window.__bc.
 */

import { BaseTool } from '../baseTool.js';
import { Config } from '../config.js';
import { CUSTOM_BUILDINGS } from '../customBuildings.js';
import { DevMode } from '../devMode.js';
import * as Messages from '../messages.ts';
import { MiscUtils } from '../miscUtils.js';
import { ORDINANCES } from '../ordinances.js';
import { SCENARIOS } from '../scenarios.js';
import { SiteEnv } from '../siteEnv.js';
import { SCENARIO_CITIES } from '../splashScreen.js';
import { Storage } from '../storage.js';
import { Text } from '../text.js';
import * as TileFlags from '../tileFlags.ts';
import { DevOverlay } from './overlay.js';
import { DEV_CSS } from './style.js';
import * as Tools from './tools.js';
import { h, btn, num, text, sel, fillSel, check, row, wrap, lbl, note, sub, val, readJson, writeJson, fmt } from './ui.js';

var OPEN_KEY = 'b0r3d_city_dev_open';
var PREFS_KEY = 'b0r3d_city_dev_prefs';
var SHOWN_KEY = 'b0r3d_city_dev_shown';
var POS_KEY = 'b0r3d_city_dev_pos';
var OVERLAY_KEY = 'b0r3d_city_dev_overlay';
var QUICK_KEY = 'b0r3d_city_dev_quickstart';

// Same prefix panel.js uses for every window's remembered position and size.
var PANEL_POSITION_PREFIX = 'b0r3dCityPanel_';

// 16 phases make one tick of city time, four ticks a month, 48 a year.
var TICK_PHASES = 16;
var MONTH_PHASES = 64;

// gameCanvas.js's ZOOM_LEVELS, which it doesn't export.
var ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2, 3];

var SPEED_NAMES = ['paused', 'slow', 'medium', 'fast'];
var DIFFICULTIES = [['0', 'easy'], ['1', 'medium'], ['2', 'hard']];

// Below this width (or 600px tall) the panel becomes a bottom sheet -- the same
// breakpoint the game's own windows use to stop floating (see panel.js).
var ROOMY_QUERY = window.matchMedia('(min-width: 769px) and (min-height: 601px)');

var FLAG_BITS = [
  [TileFlags.POWERBIT, 'POWER'], [TileFlags.CONDBIT, 'COND'], [TileFlags.BURNBIT, 'BURN'],
  [TileFlags.BULLBIT, 'BULL'], [TileFlags.ANIMBIT, 'ANIM'], [TileFlags.ZONEBIT, 'ZONE']
];


var mountDevPanel = function() {
  var style = h('style', {id: 'devPanelStyle'});
  style.textContent = DEV_CSS;
  document.head.append(style);

  // Cheats: this page load only (see the top of the file).
  var cheats = {freeBuild: false, holdFunds: false, pinOn: false, turbo: 0};

  // Remembered: the numbers typed into the cheat fields, and view-only preferences.
  var prefs = readJson(PREFS_KEY, {
    holdAmount: 100000, pinRes: 2000, pinCom: 1500, pinInd: 1500,
    noBlink: false, queryDebug: false, logMessages: false, freeTool: true
  });
  var savePrefs = function() {
    writeJson(PREFS_KEY, prefs);
  };

  var overlayOptions = readJson(OVERLAY_KEY, {
    grid: false, blockMap: '', numbers: true, power: false, zones: false, sprites: false, repaint: false
  });

  var game = function() {
    return DevMode.getGame();
  };

  var overlay = null;
  var picked = null;
  var hover = null;
  var metrics = {frames: [], paintMs: 0, paintMax: 0, simMs: 0, simMax: 0, lastPaint: 0};

  // ---------------------------------------------------------------------------
  // log, act/look

  var logEl = h('pre', {class: 'dv-pre'});
  var log = function(message) {
    var stamp = new Date().toLocaleTimeString([], {hour12: false});
    logEl.textContent = ('[' + stamp + '] ' + message + '\n' + logEl.textContent).slice(0, 20000);
  };

  // Paints one frame without advancing anything -- the only way to see a change while
  // the Browser pane is hidden and requestAnimationFrame isn't firing.
  var redraw = function() {
    var g = game();
    if (g)
      g.paintFrame(false);
  };

  var updateBadge = function() {};

  var run = function(label, fn, taint) {
    var g = game();
    if (!g) {
      log(label + ': no city running');
      return undefined;
    }

    var out;
    try {
      out = fn(g);
    } catch (e) {
      console.error(e);
      log(label + ' failed: ' + e.message);
      return undefined;
    }

    if (taint)
      g.markCheatsUsed();

    log(label + (out !== undefined && out !== null && out !== '' ? ': ' + out : ''));
    redraw();
    updateBadge();
    return out;
  };

  // Changes the city: marks it cheated, so it stays off the leaderboard.
  var act = function(label, fn) {
    return run(label, fn, true);
  };

  // Only looks, or only changes what the player could change themselves: leaves it clean.
  var look = function(label, fn) {
    return run(label, fn, false);
  };

  var atPicked = function(label, fn) {
    return function() {
      if (!picked) {
        log(label + ': pick a tile first (tile & map section)');
        return;
      }

      act(label + ' at ' + picked.x + ',' + picked.y, function(g) {
        return fn(g, picked.x, picked.y);
      });
    };
  };

  // ---------------------------------------------------------------------------
  // sections

  var openState = readJson(OPEN_KEY, {status: true, cheats: true});
  var sections = [];

  var section = function(id, title, onOpen, children) {
    var d = h('details', {class: 'dv-sec', 'data-id': id}, h('summary', {}, title));
    children.forEach(function(child) {
      if (child)
        d.append(child);
    });

    d.open = !!openState[id];
    d.refresh = onOpen || null;
    d.addEventListener('toggle', function() {
      openState[id] = d.open;
      writeJson(OPEN_KEY, openState);
      if (d.open && d.refresh)
        d.refresh();
    });

    sections.push(d);
    return d;
  };

  var refreshOpenSections = function() {
    sections.forEach(function(d) {
      if (d.open && d.refresh)
        d.refresh();
    });
  };

  // ---------------------------------------------------------------------------
  // header, tab, show/hide, dragging

  var badge = h('span', {class: 'dv-badge'});
  var panel = h('div', {id: 'devPanel'});
  var tab = btn('DEV MENU', function() { setShown(true); }, 'dv-tab', 'Open the dev menu (backtick also works)');

  var activeCheats = function() {
    var on = [];
    if (cheats.freeBuild) on.push('free build');
    if (cheats.holdFunds) on.push('hold $' + fmt(prefs.holdAmount));
    if (cheats.pinOn) on.push('demand pinned');
    if (cheats.turbo > 0) on.push('turbo ' + cheats.turbo);
    return on;
  };

  updateBadge = function() {
    var on = activeCheats();
    var g = game();
    var parts = on.slice();
    if (g && g._cheatsUsed)
      parts.unshift('leaderboard off');
    badge.textContent = parts.join(' · ');
    tab.classList.toggle('hot', on.length > 0);
  };

  var shown = readJson(SHOWN_KEY, {shown: ROOMY_QUERY.matches}).shown;
  var pos = readJson(POS_KEY, {left: null, top: 48, width: '', height: ''});

  var placePanel = function() {
    if (!ROOMY_QUERY.matches || panel.hidden)
      return;

    if (pos.width)
      panel.style.width = pos.width;
    if (pos.height)
      panel.style.height = pos.height;

    // Default spot: just left of the Tools panel's default column (see game.js).
    var left = pos.left === null ? window.innerWidth - 222 - 370 : pos.left;
    panel.style.left = MiscUtils.clamp(left, 0, Math.max(0, window.innerWidth - panel.offsetWidth)) + 'px';
    panel.style.top = MiscUtils.clamp(pos.top, 0, Math.max(0, window.innerHeight - 60)) + 'px';
  };

  var setShown = function(on) {
    shown = on;
    panel.hidden = !on;
    tab.hidden = on;
    writeJson(SHOWN_KEY, {shown: on});
    placePanel();
  };

  var head = h('div', {class: 'dv-head'}, h('b', {}, 'DEV'), badge,
    btn('✕ close', function() { setShown(false); }, '', 'Close the dev menu (the DEV MENU button brings it back)'));

  var drag = null;
  head.addEventListener('mousedown', function(e) {
    if (!ROOMY_QUERY.matches || e.target.closest('button'))
      return;
    drag = {x: e.clientX, y: e.clientY, left: panel.offsetLeft, top: panel.offsetTop};
    e.preventDefault();
  });
  document.addEventListener('mousemove', function(e) {
    if (!drag)
      return;
    panel.style.left = (drag.left + e.clientX - drag.x) + 'px';
    panel.style.top = Math.max(0, drag.top + e.clientY - drag.y) + 'px';
  });
  document.addEventListener('mouseup', function() {
    if (!ROOMY_QUERY.matches || panel.hidden)
      return;
    // Also catches the end of a native resize-handle drag, which has no event of its own.
    var next = {left: panel.offsetLeft, top: panel.offsetTop, width: panel.style.width, height: panel.style.height};
    drag = null;
    if (next.left !== pos.left || next.top !== pos.top || next.width !== pos.width || next.height !== pos.height) {
      pos = next;
      writeJson(POS_KEY, pos);
    }
  });
  window.addEventListener('resize', placePanel);

  // ---------------------------------------------------------------------------
  // status

  var statusEl = h('div', {class: 'dv-status'});

  var fps = function() {
    var now = performance.now();
    metrics.frames = metrics.frames.filter(function(t) { return now - t < 1000; });
    return metrics.frames.length;
  };

  var spriteSummary = function(g) {
    var counts = {};
    g.simulation.spriteManager.getSpriteList().forEach(function(sprite) {
      var name = Tools.SPRITE_NAMES[sprite.type] || sprite.type;
      counts[name] = (counts[name] || 0) + 1;
    });
    var names = Object.keys(counts);
    return names.length ? names.map(function(n) { return counts[n] + ' ' + n; }).join(', ') : 'none';
  };

  var renderStatus = function() {
    var parts = [];
    var add = function(s, cls) { parts.push([s, cls]); };
    var g = game();

    add(SiteEnv.isMainSite() ? 'main site' : 'local/beta build');
    add('board ' + SiteEnv.leaderboardKey());

    if (!g) {
      add(DevMode.getSplash() ? 'splash screen (quick start is under scenario)' : 'loading tiles…');
    } else {
      var sim = g.simulation;
      var ev = sim.evaluation;
      var b = sim.budget;
      var c = sim.getCensus();
      var v = sim._valves;
      var d = sim.getDate();
      var p = sim.getPowerReport();
      var origin = g.gameCanvas.getTileOrigin();

      if (g._cheatsUsed)
        add('LEADERBOARD OFF: cheats/dev used', 'warn');
      else
        add('clean city: leaderboard allowed', 'ok');

      add('"' + g.name + '"');
      add(Text.months[d.month] + ' ' + d.year);
      add('cityTime ' + sim._cityTime);
      add('phase ' + sim._phaseCycle + ' · cycle ' + sim._simCycle);
      add(SPEED_NAMES[sim.getSpeed()] + (cheats.turbo ? ' + turbo ' + cheats.turbo : ''));
      add(Text.gameLevel['' + sim._gameLevel]);
      if (b.awaitingValues)
        add('waiting on a budget decision', 'warn');
      add('$' + fmt(b.totalFunds));
      add('tax ' + b.cityTax + '%');
      add('cash flow ' + fmt(b.cashFlow));
      add('pop ' + fmt(ev.cityPop));
      add(ev.cityClass);
      add('score ' + ev.cityScore);
      add('R ' + v.resValve + ' C ' + v.comValve + ' I ' + v.indValve + (v.devPin ? ' (pinned)' : ''));
      add('res ' + fmt(c.resPop) + ' com ' + fmt(c.comPop) + ' ind ' + fmt(c.indPop));
      add('zones ' + c.poweredZoneCount + ' powered / ' + c.unpoweredZoneCount + ' not');
      add('roads ' + c.roadTotal + ' · rail ' + c.railTotal);
      add('crime ' + Math.round(c.crimeAverage) + ' · pollution ' + Math.round(c.pollutionAverage) +
          ' · land ' + Math.round(c.landValueAverage) + ' · traffic ' + Math.round(c.trafficAverage || 0));
      add('power ' + fmt(p.consumption) + '/' + fmt(p.capacity) + ' (in ' + p.imported + ', out ' + p.exported + ')');
      add('sprites: ' + spriteSummary(g));
      add('zoom ' + g.gameCanvas.getScale() + 'x @ ' + origin.x + ',' + origin.y);
      if (hover)
        add('cursor ' + hover.x + ',' + hover.y);
      if (picked)
        add('picked ' + picked.x + ',' + picked.y);
      if (g.scenarioController)
        add('scenario ' + g.scenarioController.scenario.name + (g.scenarioController._finished ? ' (over)' : ''));
      if (ff)
        add(ffText, 'warn');
    }

    var sincePaint = performance.now() - metrics.lastPaint;
    if (g && metrics.lastPaint && sincePaint > 1500)
      add('no frames for ' + (sincePaint / 1000).toFixed(0) + 's (hidden tab? use draw frame)', 'warn');
    else
      add(fps() + ' fps');

    statusEl.replaceChildren.apply(statusEl, parts.map(function(part) {
      return h('span', {class: part[1] || ''}, part[0]);
    }));
  };

  var statusSec = section('status', 'status', renderStatus, [
    statusEl,
    row(
      btn('draw frame', function() { look('drew a frame', function() {}); }, '', 'Paint once without moving anything, for a tab that isn\'t animating'),
      btn('step sprites 1s', function() {
        act('moved sprites 60 frames', function(g) {
          for (var i = 0; i < 60; i++)
            g.simulation.spriteManager.moveObjects(g.simulation._constructSimData());
        });
      }, '', 'What 60 animation frames would have moved'),
      btn('copy state', function() {
        var g = game();
        if (!g)
          return log('no city running');
        var state = g.cheatGetState();
        state.population = g.simulation.evaluation.cityPop;
        state.score = g.simulation.evaluation.cityScore;
        state.cityTime = g.simulation._cityTime;
        var json = JSON.stringify(state);
        if (navigator.clipboard)
          navigator.clipboard.writeText(json).then(function() { log('state copied: ' + json); });
        else
          log(json);
      })
    ),
    row(
      btn('turn dev menu off', function() {
        try {
          window.localStorage.removeItem(DevMode.DEV_KEY);
        } catch (e) {
          // storage blocked
        }
        window.location.href = window.location.pathname + '?dev=0';
      }, 'bad', 'Forget ?dev=1 in this browser and reload without the menu')
    )
  ]);

  // ---------------------------------------------------------------------------
  // cheats

  var holdIn = num(prefs.holdAmount, {min: '0', step: '1000'});
  var pinResIn = num(prefs.pinRes, {min: '-2000', max: '2000', step: '100', class: 'dv-num sm'});
  var pinComIn = num(prefs.pinCom, {min: '-1500', max: '1500', step: '100', class: 'dv-num sm'});
  var pinIndIn = num(prefs.pinInd, {min: '-1500', max: '1500', step: '100', class: 'dv-num sm'});

  var applyPin = function(g) {
    var valves = g.simulation._valves;
    valves.devPin = cheats.pinOn ? {res: prefs.pinRes, com: prefs.pinCom, ind: prefs.pinInd} : null;
    valves.applyDevPin();
    valves._emitEvent(Messages.VALVES_UPDATED);
  };

  var readPinInputs = function() {
    prefs.pinRes = val(pinResIn);
    prefs.pinCom = val(pinComIn);
    prefs.pinInd = val(pinIndIn);
    savePrefs();
    var g = game();
    if (g && cheats.pinOn) {
      g.markCheatsUsed();
      applyPin(g);
    }
  };
  [pinResIn, pinComIn, pinIndIn].forEach(function(input) {
    input.addEventListener('change', readPinInputs);
  });

  var setPinPreset = function(res, com, ind) {
    pinResIn.value = res;
    pinComIn.value = com;
    pinIndIn.value = ind;
    readPinInputs();
  };

  holdIn.addEventListener('change', function() {
    prefs.holdAmount = Math.max(0, val(holdIn));
    savePrefs();
    updateBadge();
  });

  var cheatBox = function(key, label, title, apply) {
    var box = check(label, cheats[key], function(on) {
      cheats[key] = on;
      var g = game();
      if (g) {
        if (on)
          g.markCheatsUsed();
        apply(g, on);
        redraw();
      }
      updateBadge();
      log(label + (on ? ' on' : ' off'));
    }, title);
    return box;
  };

  var applyBlink = function(g, off) {
    var am = g.gameCanvas.animationManager;
    am.blinkPeriod = off ? 1e9 : 500;
    if (off)
      am.shouldBlink = false;
  };

  var prefBox = function(key, label, title, apply) {
    return check(label, prefs[key], function(on) {
      prefs[key] = on;
      savePrefs();
      var g = game();
      if (g && apply)
        apply(g, on);
      log(label + (on ? ' on' : ' off'));
    }, title);
  };

  var disastersBox = check('random disasters', false, function(on) {
    look('random disasters ' + (on ? 'on' : 'off'), function(g) {
      g.simulation.disasterManager.disastersEnabled = on;
    });
  }, 'The Settings window\'s Auto-disasters, not a cheat');

  var bulldozeBox = check('auto-bulldoze', true, function(on) {
    look('auto-bulldoze ' + (on ? 'on' : 'off'), function() {
      BaseTool.setAutoBulldoze(on);
    });
  }, 'The Settings window\'s Auto-bulldoze, not a cheat');

  var pinBox = cheatBox('pinOn', 'pin demand', 'Hold the R/C/I valves at these values (range ±2000 / ±1500 / ±1500)', applyPin);

  var cheatsSec = section('cheats', 'cheats', function() {
    var g = game();
    disastersBox.input.checked = !!(g && g.simulation.disasterManager.disastersEnabled);
    bulldozeBox.input.checked = BaseTool.getAutoBulldoze();
  }, [
    h('div', {class: 'dv-grid'},
      cheatBox('freeBuild', 'free build', 'Every tool costs nothing (the Settings cheat menu\'s Free Build)', function(g, on) {
        BaseTool.setFreeBuild(on);
      }),
      cheatBox('holdFunds', 'hold funds at', 'Tops funds back up to the amount below four times a second', function() {}),
      disastersBox,
      bulldozeBox,
      prefBox('noBlink', 'no power blink', 'Stop unpowered zones blinking, for clean screenshots', applyBlink),
      prefBox('queryDebug', 'query debug', 'Show the Query window\'s hidden engine readout', function(g, on) {
        Config.queryDebug = on;
      })
    ),
    row(lbl('hold $'), holdIn),
    row(pinBox, lbl('R'), pinResIn, lbl('C'), pinComIn, lbl('I'), pinIndIn),
    row(
      btn('max', function() { setPinPreset(2000, 1500, 1500); }, 'sm'),
      btn('zero', function() { setPinPreset(0, 0, 0); }, 'sm'),
      btn('min', function() { setPinPreset(-2000, -1500, -1500); }, 'sm')
    ),
    sub('funds'),
    row(
      btn('+$10k', function() { act('+$10,000', function(g) { g.simulation.budget.spend(-10000); }); }),
      btn('+$100k', function() { act('+$100,000', function(g) { g.simulation.budget.spend(-100000); }); }),
      btn('+$1M', function() { act('+$1,000,000', function(g) { g.simulation.budget.spend(-1000000); }); }),
      btn('$0', function() { act('funds to $0', function(g) { g.simulation.budget.setFunds(0); }); }, 'bad')
    ),
    note('Cheats last until the page reloads and are never re-applied on their own. Anything that changes the ' +
         'city marks it, and a marked city can\'t submit a high score, including after a save and reload.')
  ]);

  // ---------------------------------------------------------------------------
  // city

  var taxIn = num(7, {min: '0', max: '20', class: 'dv-num sm'});
  var roadIn = num(100, {min: '0', max: '100', class: 'dv-num sm'});
  var fireIn = num(100, {min: '0', max: '100', class: 'dv-num sm'});
  var policeIn = num(100, {min: '0', max: '100', class: 'dv-num sm'});
  var levelSel = sel(DIFFICULTIES);
  var yearIn = num(1900, {min: '0'});
  var autoBudgetBox = check('auto-budget', true, function(on) {
    look('auto-budget ' + (on ? 'on' : 'off'), function(g) {
      g.simulation.budget.setAutoBudget(on);
    });
  });
  var ordinanceBoxes = h('div', {class: 'dv-grid'});
  var neighbourTable = h('div', {class: 'dv-table'});

  var readCity = function() {
    var g = game();
    if (!g)
      return;

    var sim = g.simulation;
    var b = sim.budget;
    taxIn.value = b.cityTax;
    roadIn.value = Math.round(b.roadPercent * 100);
    fireIn.value = Math.round(b.firePercent * 100);
    policeIn.value = Math.round(b.policePercent * 100);
    levelSel.value = String(sim._gameLevel);
    yearIn.value = sim.getDate().year;
    autoBudgetBox.input.checked = b.autoBudget;

    ordinanceBoxes.replaceChildren.apply(ordinanceBoxes, ORDINANCES.map(function(ordinance) {
      var box = check(ordinance.label, sim.ordinances.isEnacted(ordinance.id), function() {}, ordinance.blurb);
      box.input.value = ordinance.id;
      return box;
    }));

    renderNeighbours(g);
  };

  var renderNeighbours = function(g) {
    var neighbours = g.simulation.neighbours;
    neighbourTable.replaceChildren.apply(neighbourTable, neighbours.getSummary().map(function(n) {
      var relIn = num(n.relations, {min: '0', max: '100', class: 'dv-num sm'});
      return h('div', {class: 'dv-tr'},
        h('span', {class: 'dv-td name'}, n.name + ': ' + (n.dealType === 'none' ? 'no deal' : n.dealType + ' ' + n.amount) +
          (n.cooloff ? ', cooloff ' + n.cooloff : '')),
        h('span', {class: 'dv-td dim'}, 'rel'),
        relIn,
        btn('set', function() {
          act(n.name + ' relations ' + val(relIn), function(gg) {
            gg.simulation.neighbours._stateOf(n.id).relations = MiscUtils.clamp(val(relIn), 0, 100);
            renderNeighbours(gg);
          });
        }, 'sm'));
    }));
  };

  var enactedIds = function() {
    return Array.prototype.slice.call(ordinanceBoxes.querySelectorAll('input:checked')).map(function(input) {
      return input.value;
    });
  };

  var citySec = section('city', 'city & economy', readCity, [
    row(lbl('tax %'), taxIn, btn('set', function() {
      act('tax ' + val(taxIn) + '%', function(g) {
        g.simulation.budget.setTax(MiscUtils.clamp(Math.round(val(taxIn)), 0, 20));
      });
    })),
    row(lbl('funding %'), h('span', {class: 'dv-td dim'}, 'road'), roadIn, h('span', {class: 'dv-td dim'}, 'fire'), fireIn,
        h('span', {class: 'dv-td dim'}, 'police'), policeIn,
      btn('set', function() {
        act('funding road ' + val(roadIn) + '% fire ' + val(fireIn) + '% police ' + val(policeIn) + '%', function(g) {
          var b = g.simulation.budget;
          b.roadPercent = MiscUtils.clamp(val(roadIn), 0, 100) / 100;
          b.firePercent = MiscUtils.clamp(val(fireIn), 0, 100) / 100;
          b.policePercent = MiscUtils.clamp(val(policeIn), 0, 100) / 100;
          b.updateFundEffects();
        });
      })),
    row(autoBudgetBox,
      btn('open budget', function() { look('opened the budget', function(g) { g.handleBudgetRequest(); }); }),
      btn('collect tax now', function() {
        act('collected tax', function(g) {
          var sim = g.simulation;
          sim.budget.collectTax(sim._gameLevel, sim.getCensus(), sim.ordinances, sim.neighbours);
          return 'tax take $' + fmt(sim.budget.taxFund) + ', cash flow ' + fmt(sim.budget.cashFlow);
        });
      }, '', 'The yearly settlement, now: tax, ordinance bill, neighbour contracts, budget')),
    row(
      btn('re-evaluate', function() {
        act('evaluated', function(g) {
          var sim = g.simulation;
          // The census is wiped at phase 0 and refilled by the map scan in phases 1-8, so
          // evaluating mid-scan scores a city with half its buildings uncounted. Run on
          // to phase 9, where the game's own evaluation happens, first.
          var ran = 0;
          while (sim._phaseCycle !== 9 && ran < 16 && sim.devStep(1) === 1)
            ran++;
          sim.evaluation.cityEvaluation(sim._constructSimData());
          return 'score ' + sim.evaluation.cityScore + ', ' + sim.evaluation.cityClass + ' (ran ' + ran + ' phases to finish the scan)';
        });
      }, '', 'Finish the current map scan, then run the yearly evaluation (score, class, approval)'),
      lbl('difficulty'), levelSel,
      btn('set', function() {
        act('difficulty ' + DIFFICULTIES[Number(levelSel.value)][1], function(g) {
          var level = Number(levelSel.value);
          var sim = g.simulation;
          sim.setLevel(level);
          sim.disasterManager._gameLevel = level;
          sim.evaluation.gameLevel = '' + level;
        });
      })),
    row(lbl('year'), yearIn, btn('set', function() {
      act('year set to ' + val(yearIn), function(g) {
        g.simulation._setYear(Math.round(val(yearIn)));
        return 'now ' + g.simulation.getDate().year + ' (can\'t go before the starting year)';
      });
    }, '', 'Moves the clock only; nothing is simulated in between')),
    sub('ordinances'),
    ordinanceBoxes,
    row(
      btn('apply', function() {
        act('ordinances applied', function(g) {
          g.simulation.ordinances.setEnacted(enactedIds(), g.simulation.getCensus());
          readCity();
          return g.simulation.ordinances.getEnacted().length + ' in force';
        });
      }, '', 'Same as the window: preconditions still apply'),
      btn('apply, ignore preconditions', function() {
        act('ordinances forced', function(g) {
          g.simulation.ordinances.setEnacted(enactedIds(), null);
          readCity();
          return g.simulation.ordinances.getEnacted().length + ' in force';
        });
      })
    ),
    sub('neighbours'),
    neighbourTable,
    row(
      btn('clear cooloffs', function() {
        act('neighbour cooloffs cleared', function(g) {
          g.simulation.neighbours._states.forEach(function(state) { state.cooloff = 0; });
          renderNeighbours(g);
        });
      }),
      btn('cancel all deals', function() {
        act('all power deals cancelled', function(g) {
          g.simulation.neighbours.getSummary().forEach(function(n) {
            g.simulation.neighbours.setDeal(n.id, 'none', 0);
          });
          renderNeighbours(g);
        });
      }),
      btn('settle year now', function() {
        act('neighbours settled', function(g) {
          var cost = g.simulation.neighbours.settleYear(g.simulation.budget);
          renderNeighbours(g);
          return 'net bill $' + fmt(cost);
        });
      })
    ),
    row(btn('↻ refresh', readCity))
  ]);

  // ---------------------------------------------------------------------------
  // time

  var ff = null;
  var ffText = '';
  var ffNote = h('div', {class: 'dv-note'}, 'idle');

  // Months at a time, in slices of ~40ms so the page stays responsive and Stop works.
  // Stops on its own when the city wants a budget decision (the engine won't simulate
  // past one either) or when a scenario finishes.
  var fastForward = function(label, months) {
    var g = game();
    if (!g)
      return log(label + ': no city running');
    if (ff)
      return log('already fast-forwarding');

    g.markCheatsUsed();
    updateBadge();

    var sim = g.simulation;
    var start = {date: sim.getDate(), pop: sim.evaluation.cityPop, t: performance.now()};
    var sc = g.scenarioController;
    var wasFinished = sc ? sc._finished : false;
    var done = 0;
    var reason = null;
    ff = {stop: false};

    var slice = function() {
      var t0 = performance.now();

      while (done < months && !reason && performance.now() - t0 < 40) {
        if (ff.stop) {
          reason = 'stopped';
          break;
        }

        if (sim.devStep(MONTH_PHASES) < MONTH_PHASES) {
          reason = 'the city wants a budget decision (open Budget, or turn auto-budget on)';
          break;
        }

        done++;

        if (sc && !wasFinished && sc._finished)
          reason = 'the scenario ended';
      }

      ffText = label + ': ' + done + '/' + months + ' months';
      ffNote.textContent = ffText;

      if (done < months && !reason) {
        window.setTimeout(slice, 0);
        return;
      }

      var end = sim.getDate();
      var seconds = ((performance.now() - start.t) / 1000).toFixed(1);
      ffText = '';
      ffNote.textContent = 'idle';
      ff = null;
      log(label + ': ' + done + ' months in ' + seconds + 's, ' + Text.months[start.date.month] + ' ' + start.date.year + ' → ' +
          Text.months[end.month] + ' ' + end.year + ', pop ' + fmt(start.pop) + ' → ' + fmt(sim.evaluation.cityPop) +
          (reason ? ' (' + reason + ')' : ''));
      redraw();
    };

    slice();
  };

  var ffYearIn = num(1950, {min: '0'});
  var turboSel = sel([['0', 'off'], ['4', '4 phases/tick'], ['16', '16 phases/tick'], ['64', '64 phases/tick'], ['256', '256 phases/tick']], '0');
  turboSel.addEventListener('change', function() {
    cheats.turbo = Number(turboSel.value);
    var g = game();
    if (g && cheats.turbo > 0)
      g.markCheatsUsed();
    updateBadge();
    log('turbo ' + (cheats.turbo ? cheats.turbo + ' phases per tick' : 'off'));
  });

  var timeSec = section('time', 'time', null, [
    row(
      btn('pause', function() { look('pause toggled', function(g) { g.handleSpeedSet('pause'); }); }),
      btn('slow', function() { look('speed slow', function(g) { g.handleSpeedSet('slow'); }); }),
      btn('medium', function() { look('speed medium', function(g) { g.handleSpeedSet('med'); }); }),
      btn('fast', function() { look('speed fast', function(g) { g.handleSpeedSet('fast'); }); })
    ),
    row(lbl('turbo'), turboSel),
    note('Turbo runs that many phases every game tick instead of waiting on the speed setting\'s timer. 16 phases = one tick of city time.'),
    sub('step'),
    row(
      btn('1 phase', function() { act('stepped', function(g) { return g.simulation.devStep(1) + ' phase'; }); }),
      btn('1 tick', function() { act('stepped', function(g) { return g.simulation.devStep(TICK_PHASES) + ' phases'; }); }),
      btn('1 month', function() { act('stepped', function(g) { return g.simulation.devStep(MONTH_PHASES) + ' phases'; }); })
    ),
    sub('fast-forward (simulated)'),
    row(
      btn('+1 month', function() { fastForward('+1 month', 1); }),
      btn('+6 months', function() { fastForward('+6 months', 6); }),
      btn('+1 year', function() { fastForward('+1 year', 12); }),
      btn('+5 years', function() { fastForward('+5 years', 60); }),
      btn('+10 years', function() { fastForward('+10 years', 120); })
    ),
    row(lbl('to year'), ffYearIn,
      btn('go', function() {
        var g = game();
        if (!g)
          return log('no city running');
        var d = g.simulation.getDate();
        var months = (Math.round(val(ffYearIn)) - d.year) * 12 - d.month;
        if (months <= 0)
          return log('that year is already here');
        fastForward('to ' + val(ffYearIn), months);
      }),
      btn('■ stop', function() {
        if (ff)
          ff.stop = true;
      }, 'bad')),
    row(btn('boom: pin max demand, +2 years', function() {
      var g = game();
      if (!g)
        return log('no city running');
      setPinPreset(2000, 1500, 1500);
      cheats.pinOn = true;
      pinBox.input.checked = true;
      g.markCheatsUsed();
      applyPin(g);
      log('demand pinned at maximum');
      fastForward('boom', 24);
    }, '', 'Honest growth, just fast: demand held at maximum while two years simulate')),
    ffNote,
    sub('clock only (nothing simulated)'),
    row(
      btn('+1 month', function() {
        act('clock +1 month', function(g) {
          g.simulation._cityTime += 4;
          g.simulation._updateTime();
        });
      }),
      btn('+1 year', function() {
        act('clock +1 year', function(g) {
          g.simulation._cityTime += 48;
          g.simulation._updateTime();
        });
      })
    )
  ]);

  // ---------------------------------------------------------------------------
  // disasters & sprites

  var hordeIn = num(12, {min: '1', max: '200', class: 'dv-num sm'});
  var spriteTable = h('div', {class: 'dv-table'});

  var renderedSpriteCount = -1;

  var renderSprites = function() {
    var g = game();
    if (!g) {
      spriteTable.replaceChildren(note('no city running'));
      return;
    }

    var list = g.simulation.spriteManager.getSpriteList();
    renderedSpriteCount = list.length;
    if (!list.length) {
      spriteTable.replaceChildren(note('no sprites'));
      return;
    }

    spriteTable.replaceChildren.apply(spriteTable, list.map(function(sprite) {
      var name = Tools.SPRITE_NAMES[sprite.type] || 'type ' + sprite.type;
      var tx = sprite.x >> 4;
      var ty = sprite.y >> 4;
      return h('div', {class: 'dv-tr'},
        h('span', {class: 'dv-td name'}, name),
        h('span', {class: 'dv-td dim'}, tx + ',' + ty + ' f' + sprite.frame),
        btn('go', function() { look('centred on ' + name, function(gg) { gg.gameCanvas.centreOn(tx, ty); }); }, 'sm'),
        btn('kill', function() {
          act('removed ' + name, function(gg) { Tools.killSprite(gg, sprite); });
          renderSprites();
        }, 'sm'));
    }));
  };

  var disasterBtn = function(label, fn) {
    return btn(label, function() { act(label, fn); });
  };

  var disastersSec = section('disasters', 'disasters & sprites', renderSprites, [
    wrap(
      disasterBtn('fire', function(g) { g.simulation.disasterManager.makeFire(); }),
      disasterBtn('6 fires', function(g) { for (var i = 0; i < 6; i++) g.simulation.disasterManager.makeFire(); }),
      disasterBtn('flood', function(g) { g.simulation.disasterManager.makeFlood(); }),
      disasterBtn('tornado', function(g) { g.simulation.spriteManager.makeTornado(); }),
      disasterBtn('earthquake', function(g) { g.simulation.disasterManager.makeEarthquake(); }),
      disasterBtn('monster', function(g) { g.simulation.spriteManager.makeMonster(); }),
      disasterBtn('meltdown', function(g) { g.simulation.disasterManager.makeMeltdown(); }),
      disasterBtn('plane crash', function(g) { g.simulation.disasterManager.makeCrash(); })
    ),
    row(lbl('zombies'), hordeIn, btn('horde', function() {
      act('zombie horde of ' + val(hordeIn), function(g) {
        g.simulation.spriteManager.makeZombies(MiscUtils.clamp(Math.round(val(hordeIn)), 1, 200));
      });
    })),
    note('Meltdown needs a nuclear plant; a plane crash spawns a plane first if there isn\'t one.'),
    sub('at the picked tile'),
    wrap.apply(null, Object.keys(Tools.atTile).map(function(key) {
      var place = atPicked(key, Tools.atTile[key]);
      return btn(key + ' here', function() {
        place();
        renderSprites();
      }, 'sm');
    })),
    sub('clean up'),
    wrap(
      btn('put out fires', function() { act('put out fires', function(g) { return Tools.extinguishFires(g) + ' tiles'; }); }),
      btn('drain floods', function() { act('drained floods', function(g) { return Tools.drainFloods(g) + ' tiles'; }); }),
      btn('clear rubble', function() { act('cleared rubble, debris, radiation', function(g) { return Tools.clearRubble(g) + ' tiles'; }); }),
      btn('remove all sprites', function() {
        act('removed sprites', function(g) { return Tools.killAllSprites(g); });
        renderSprites();
      }, '', 'Every sprite, including the trains, planes and boats the city runs on its own')
    ),
    sub('sprites'),
    spriteTable,
    row(btn('↻ refresh', renderSprites))
  ]);

  // ---------------------------------------------------------------------------
  // tile & map

  var pickBtn = btn('pick a tile', function() { setPicking(!picking); }, '', 'Then click the map. Clicks go to the menu, not the selected tool');
  var pickX = num(60, {min: '0', class: 'dv-num sm'});
  var pickY = num(50, {min: '0', class: 'dv-num sm'});
  var tileInfo = h('pre', {class: 'dv-pre'}, 'nothing picked');
  var tilePreview = h('canvas', {width: '48', height: '48'});
  var tileValueIn = num(0, {min: '0', class: 'dv-num'});
  var flagBoxes = FLAG_BITS.map(function(pair) {
    var box = check(pair[1], false, function() {});
    box.input.value = String(pair[0]);
    return box;
  });

  var toolOptions = function(g) {
    var tools = g.inputStatus.gameTools;
    var labels = {};
    CUSTOM_BUILDINGS.forEach(function(b) { labels[b.id] = b.label + ' (' + b.size + 'x' + b.size + ')'; });
    return Object.keys(tools).filter(function(key) {
      return tools[key] && typeof tools[key].doTool === 'function';
    }).sort().map(function(key) {
      return [key, labels[key] || key];
    });
  };
  var toolSel = sel([['road', 'road']], 'road');
  var freeToolBox = check('free', prefs.freeTool, function(on) {
    prefs.freeTool = on;
    savePrefs();
  });
  var zoomSel = sel(ZOOM_LEVELS.map(function(z, i) { return [String(i), z + 'x']; }), '2');

  var picking = false;
  var swallowUntil = 0;

  var setPicking = function(on) {
    picking = on;
    pickBtn.textContent = on ? 'click the map… (cancel)' : 'pick a tile';
    pickBtn.classList.toggle('on', on);
    var g = game();
    if (g)
      g.gameCanvas._canvas.classList.toggle('dv-picking', on);
  };

  var renderTile = function() {
    var g = game();
    if (!g || !picked) {
      tileInfo.textContent = g ? 'nothing picked' : 'no city running';
      return;
    }

    var info = Tools.inspectTile(g, picked.x, picked.y);
    if (!info) {
      tileInfo.textContent = 'off the map';
      return;
    }

    pickX.value = info.x;
    pickY.value = info.y;
    tileValueIn.value = info.value;
    flagBoxes.forEach(function(box) {
      box.input.checked = (info.flags & Number(box.input.value)) !== 0;
    });

    var lines = [
      info.x + ',' + info.y + '  value ' + info.value + '  flags 0x' + info.flags.toString(16) + ' ' + info.flagNames,
      info.kind,
      ''
    ];
    info.blocks.forEach(function(block) {
      lines.push((block.key + '            ').slice(0, 24) + ' ' + block.value + '   (' + block.size + 'x' + block.size + ')');
    });
    tileInfo.textContent = lines.join('\n');

    var ctx = tilePreview.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 48, 48);
    var image = g.tileSet[info.value];
    if (image) {
      try {
        ctx.drawImage(image, 0, 0, 48, 48);
      } catch (e) {
        // not drawable yet
      }
    }
  };

  var setPicked = function(x, y) {
    var g = game();
    if (!g || !g.gameMap.testBounds(x, y))
      return log('tile ' + x + ',' + y + ' is off the map');

    picked = {x: x, y: y};
    if (overlay) {
      overlay.picked = picked;
      overlay.draw();
    }
    renderTile();
    log('picked ' + x + ',' + y + ': ' + Tools.describeTile(g.gameMap.getTileValue(x, y)));
  };

  var readTileSection = function() {
    var g = game();
    if (g) {
      var current = toolSel.value;
      fillSel(toolSel, toolOptions(g), current);
      zoomSel.value = String(ZOOM_LEVELS.indexOf(g.gameCanvas.getScale()));
    }
    renderTile();
  };

  var pointToTile = function(g, clientX, clientY) {
    var el = g.gameCanvas._canvas;
    var rect = el.getBoundingClientRect();
    var tile = g.gameCanvas.canvasCoordinateToTileCoordinate(clientX - rect.left, clientY - rect.top);
    return tile && g.gameMap.testBounds(tile.x, tile.y) ? tile : null;
  };

  // Capture phase on the window, so a pick reaches the menu before the game's own canvas
  // handlers see anything -- otherwise the same click would also place whatever tool is
  // selected. Swallows the rest of that gesture (mouseup/click/touchend) too.
  var onPointer = function(e) {
    var g = game();
    if (!g || e.target !== g.gameCanvas._canvas)
      return;

    if (picking && (e.type === 'mousedown' || e.type === 'touchstart')) {
      var point = e.touches ? e.touches[0] : e;
      var tile = pointToTile(g, point.clientX, point.clientY);
      e.preventDefault();
      e.stopPropagation();
      swallowUntil = performance.now() + 800;
      setPicking(false);
      if (tile)
        setPicked(tile.x, tile.y);
      return;
    }

    if (performance.now() < swallowUntil && (e.type === 'mouseup' || e.type === 'click' || e.type === 'touchend')) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  ['mousedown', 'mouseup', 'click'].forEach(function(type) {
    window.addEventListener(type, onPointer, true);
  });
  window.addEventListener('touchstart', onPointer, {capture: true, passive: false});
  window.addEventListener('touchend', onPointer, {capture: true, passive: false});

  document.addEventListener('mousemove', function(e) {
    var g = game();
    if (!g)
      return;
    var next = e.target === g.gameCanvas._canvas ? pointToTile(g, e.clientX, e.clientY) : null;
    if ((next && hover && next.x === hover.x && next.y === hover.y) || (!next && !hover))
      return;
    hover = next;
    if (overlay)
      overlay.hover = hover;
  });

  var tileSec = section('tile', 'tile & map', readTileSection, [
    row(pickBtn, lbl('x'), pickX, lbl('y'), pickY,
      btn('use', function() { setPicked(Math.round(val(pickX)), Math.round(val(pickY))); }),
      btn('centre', function() {
        if (!picked)
          return log('pick a tile first');
        look('centred on ' + picked.x + ',' + picked.y, function(g) { g.gameCanvas.centreOn(picked.x, picked.y); });
      })),
    h('div', {class: 'dv-tile'}, tilePreview, tileInfo),
    row(btn('↻', renderTile, 'sm', 'Re-read the tile'),
      btn('query window here', function() {
        if (!picked)
          return log('pick a tile first');
        look('queried ' + picked.x + ',' + picked.y, function(g) { Tools.placeTool(g, 'query', picked.x, picked.y, true); });
      })),
    sub('edit tile'),
    row(lbl('value'), tileValueIn, btn('write', atPicked('wrote tile', function(g, x, y) {
      var flags = 0;
      flagBoxes.forEach(function(box) {
        if (box.input.checked)
          flags |= Number(box.input.value);
      });
      g.gameMap.setTile(x, y, Math.round(val(tileValueIn)), flags);
      renderTile();
      return 'value ' + val(tileValueIn) + ' flags 0x' + flags.toString(16);
    }), '', 'Writes the value and exactly these flags')),
    h('div', {class: 'dv-grid'}, flagBoxes[0], flagBoxes[1], flagBoxes[2], flagBoxes[3], flagBoxes[4], flagBoxes[5]),
    sub('build'),
    row(toolSel, freeToolBox, btn('place here', function() {
      var name = toolSel.value;
      atPicked('placed ' + name, function(g, x, y) {
        var result = Tools.placeTool(g, name, x, y, prefs.freeTool);
        renderTile();
        return result;
      })();
    })),
    wrap(
      btn('bulldoze here', atPicked('bulldozed', function(g, x, y) { return Tools.placeTool(g, 'bulldozer', x, y, true); })),
      btn('clear 8x8 to dirt', atPicked('cleared 8x8', function(g, x, y) { return Tools.clearArea(g, x, y, 8, 8) + ' tiles'; })),
      btn('every custom building from here', atPicked('placed every custom building', Tools.placeAllBuildings)),
      btn('stamp test town here', atPicked('stamped a test town', Tools.stampTestTown), '',
          '36x26 from here: 2 coal plants, a wire, 4 roads, 60 zones (R, C over R, I), all free'),
      btn('clear whole map', function() {
        if (!window.confirm('Clear every tile on the map to dirt?'))
          return;
        act('cleared the map', Tools.clearMap);
      }, 'bad')
    ),
    note('Picked-tile tools take their point the way the game does: a 3x3 or 4x4 building\'s point is one tile in from its top-left.'),
    sub('camera'),
    row(lbl('zoom'), zoomSel,
      btn('set', function() { look('zoom ' + ZOOM_LEVELS[Number(zoomSel.value)] + 'x', function(g) { g.gameCanvas._setZoomIndex(Number(zoomSel.value)); }); }),
      btn('map centre', function() {
        look('centred on the map', function(g) { g.gameCanvas.centreOn(Math.floor(g.gameMap.width / 2), Math.floor(g.gameMap.height / 2)); });
      }),
      btn('worst pollution', function() {
        look('centred on the pollution peak', function(g) {
          g.gameCanvas.centreOn(g.gameMap.pollutionMaxX, g.gameMap.pollutionMaxY);
          return g.gameMap.pollutionMaxX + ',' + g.gameMap.pollutionMaxY;
        });
      }))
  ]);

  // ---------------------------------------------------------------------------
  // overlays

  var saveOverlay = function() {
    writeJson(OVERLAY_KEY, overlayOptions);
    if (overlay)
      overlay.setOptions(overlayOptions);
  };

  var overlayBoxes = {};
  var overlayBox = function(key, label, title) {
    return overlayBoxes[key] = check(label, overlayOptions[key], function(on) {
      overlayOptions[key] = on;
      saveOverlay();
    }, title);
  };

  var blockMapSel = sel([['', 'none']], overlayOptions.blockMap);

  // For window.__bc.overlay, which changes the options from outside the checkboxes.
  var syncOverlayInputs = function() {
    overlaysSec.refresh();
    Object.keys(overlayBoxes).forEach(function(key) {
      overlayBoxes[key].input.checked = !!overlayOptions[key];
    });
    blockMapSel.value = overlayOptions.blockMap;
  };
  blockMapSel.addEventListener('change', function() {
    overlayOptions.blockMap = blockMapSel.value;
    saveOverlay();
  });

  var overlaysSec = section('overlays', 'map overlays', function() {
    var g = game();
    if (!g)
      return;
    fillSel(blockMapSel, [['', 'none']].concat(Object.keys(g.simulation.blockMaps).map(function(key) {
      var bm = g.simulation.blockMaps[key];
      return [key, key + ' (' + bm.blockSize + 'x' + bm.blockSize + ')'];
    })), overlayOptions.blockMap);
  }, [
    h('div', {class: 'dv-grid'},
      overlayBox('grid', 'tile grid', 'Every tile, with coordinates every 10'),
      overlayBox('power', 'power', 'Conductive tiles: yellow powered, red not'),
      overlayBox('zones', 'zone centres', 'ZONEBIT tiles, outlined 3x3 (cyan powered, pink not)'),
      overlayBox('sprites', 'sprite boxes', 'Every sprite\'s box, type, frame and tile'),
      overlayBox('repaint', 'repainted tiles', 'Tiles the paint loop actually redrew, fading over 20 frames'),
      overlayBox('numbers', 'block values', 'Print each block\'s raw value when zoomed in enough')
    ),
    row(lbl('block map'), blockMapSel),
    note('Block maps are scaled to the largest value on the map right now. Growth and city-centre distance are signed: red below zero, green above.')
  ]);

  // ---------------------------------------------------------------------------
  // windows

  var messageSel = sel(Object.keys(Text.messageText).sort().map(function(subject) { return [subject, subject]; }));

  var allPanels = function(g) {
    var list = [g.infoPanel, g.miscButtonsPanel, g.rciPanel, g.toolsPanel];
    Object.keys(g._panelsById).forEach(function(id) { list.push(g._panelsById[id]); });
    return list;
  };

  var windowBtn = function(label, handler) {
    return btn(label, function() { look('opened ' + label, function(g) { g[handler](); }); }, 'sm');
  };

  var windowsSec = section('windows', 'windows', null, [
    wrap(
      windowBtn('budget', 'handleBudgetRequest'),
      windowBtn('evaluation', 'handleEvalRequest'),
      windowBtn('city map', 'handleMapRequest'),
      windowBtn('graphs', 'handleGraphRequest'),
      windowBtn('ordinances', 'handleOrdinanceRequest'),
      windowBtn('neighbours', 'handleNeighbourRequest'),
      windowBtn('disasters', 'handleDisasterRequest'),
      windowBtn('settings', 'handleSettingsRequest'),
      windowBtn('save', 'handleSave'),
      windowBtn('high scores', 'handleHighScoreRequest'),
      windowBtn('screenshot', 'handleScreenshotRequest'),
      windowBtn('cheat menu', 'handleDebugRequest')
    ),
    row(
      btn('close all', function() {
        look('closed every window', function(g) {
          for (var i = 0; i < 40 && g._hasOpenWindow(); i++)
            g._getTopmostWindow().close();
        });
      }),
      btn('test congrats', function() {
        look('congrats popup', function(g) { g._showCongrats('Dev menu test popup. Nothing happened.', true); });
      }),
      btn('monster TV at pick', function() {
        if (!picked)
          return log('pick a tile first');
        look('monster TV', function(g) { g.monsterTV.show(picked.x, picked.y); });
      })
    ),
    sub('notification bar'),
    row(messageSel, btn('show', function() {
      look('notification', function(g) {
        var data = {name: 'Northport', direction: 'raised', rate: 250};
        if (picked) {
          data.x = picked.x;
          data.y = picked.y;
        }
        g.processFrontEndMessage({subject: messageSel.value, data: data});
        return messageSel.value;
      });
    })),
    note('Fired through the same handler the simulation uses. With a tile picked, the message links to it.'),
    sub('layout'),
    row(
      btn('re-run breakpoint layout', function() {
        look('breakpoint layout re-run', function(g) {
          allPanels(g).forEach(function(p) { p._onBreakpointChange(); });
        });
      }, '', 'What crossing the phone/desktop breakpoint does. The Browser pane\'s resize never fires it'),
      btn('forget window positions', function() {
        var removed = 0;
        try {
          Object.keys(window.localStorage).forEach(function(key) {
            if (key.indexOf(PANEL_POSITION_PREFIX) === 0) {
              window.localStorage.removeItem(key);
              removed++;
            }
          });
        } catch (e) {
          return log('storage blocked');
        }
        log('forgot ' + removed + ' window positions');
        if (removed && window.confirm('Forgot ' + removed + ' window positions. Reload to see the defaults? (Unsaved city progress is lost.)'))
          window.location.reload();
      })
    )
  ]);

  // ---------------------------------------------------------------------------
  // scenario & quick start

  var scenarioInfo = h('pre', {class: 'dv-pre'}, 'no scenario');
  var quick = readJson(QUICK_KEY, {kind: 'generated', slug: 'dullsville', difficulty: '0', name: ''});
  var kindSel = sel([['generated', 'random map'], ['classic', 'classic city'], ['scenario', 'scenario'], ['slot', 'save slot']], quick.kind);
  var whichSel = sel([]);
  var quickLevelSel = sel(DIFFICULTIES, quick.difficulty);
  var quickNameIn = text(quick.name, {placeholder: 'name (optional)'});

  var fillWhich = function() {
    var kind = kindSel.value;
    var options = [];
    if (kind === 'classic')
      options = SCENARIO_CITIES.map(function(c) { return [c.slug, c.name]; });
    else if (kind === 'scenario')
      options = SCENARIOS.map(function(s) { return [s.slug, s.name + ' (' + s.year + ')']; });
    else if (kind === 'slot')
      options = Storage.listSaves().map(function(s) { return [s.id, s.name]; });
    fillSel(whichSel, options.length ? options : [['', kind === 'slot' ? 'no saves' : '-']], quick.slug);
    whichSel.disabled = kind === 'generated';
  };
  kindSel.addEventListener('change', fillWhich);
  fillWhich();

  // From the splash screen this launches directly. With a city already running it has to
  // reload first (see devMode.js's autostart), so it asks.
  var launch = function(request, what) {
    var splash = DevMode.getSplash();
    if (!game() && splash) {
      log('launching ' + what);
      splash.devLaunch(request).then(function() {
        log('launched ' + what);
      }).catch(function(err) {
        log('launch failed: ' + err.message);
      });
      return;
    }

    if (!window.confirm('Reload and launch ' + what + '? Anything unsaved in this city is lost.'))
      return;

    if (!DevMode.setAutostart(request))
      return log('couldn\'t write the autostart (session storage blocked?)');

    window.location.reload();
  };

  var renderScenario = function() {
    var g = game();
    var sc = g && g.scenarioController;
    if (!sc) {
      scenarioInfo.textContent = g ? 'this city isn\'t a scenario' : 'no city running';
      return;
    }

    var s = sc.scenario;
    scenarioInfo.textContent = [
      s.name + ' (' + s.slug + ', map ' + s.mapSlug + ')',
      'objective ' + s.objective.type + (s.objective.metric ? ' ' + s.objective.metric : '') + ' target ' + s.objective.target +
        ', now ' + sc._objectiveValue() + (sc._objectiveMet() ? ' (met)' : ''),
      'from ' + s.year + ', deadline ' + (s.year + s.deadlineYears) + (s.surviveToDeadline ? ' (survive to it)' : ''),
      'disaster ' + (s.disaster ? s.disaster.type + (s.disaster.everyYears ? ' every ' + s.disaster.everyYears + 'y' : '') : 'none') +
        ', opening done ' + sc._openingDisasterDone + ', last wave ' + sc._lastWaveYear,
      'finished ' + sc._finished + ', ever had population ' + sc._everHadPopulation
    ].join('\n');
  };

  var scenarioAct = function(label, fn) {
    return btn(label, function() {
      act(label, function(g) {
        if (!g.scenarioController)
          throw new Error('this city isn\'t a scenario');
        var out = fn(g, g.scenarioController);
        renderScenario();
        return out;
      });
    });
  };

  var scenarioSec = section('scenario', 'scenario & quick start', function() {
    renderScenario();
    fillWhich();
  }, [
    scenarioInfo,
    wrap(
      scenarioAct('win now', function(g, sc) { sc._finish(true, 'objective'); }),
      scenarioAct('lose at deadline', function(g, sc) { sc._finish(false, 'deadline'); }),
      scenarioAct('lose by wipeout', function(g, sc) { sc._finish(false, 'wipeout'); }),
      scenarioAct('trigger its disaster', function(g, sc) {
        if (!sc.scenario.disaster)
          return 'this scenario has none';
        sc._triggerDisaster();
      }),
      scenarioAct('jump to a year before deadline', function(g, sc) {
        g.simulation._setYear(sc.scenario.year + sc.scenario.deadlineYears - 1);
        return 'now ' + g.simulation.getDate().year;
      })
    ),
    row(btn('↻ refresh', renderScenario)),
    sub('quick start'),
    row(kindSel, whichSel),
    row(lbl('difficulty'), quickLevelSel, quickNameIn),
    row(
      btn('launch', function() {
        quick = {kind: kindSel.value, slug: whichSel.value, difficulty: quickLevelSel.value, name: quickNameIn.value};
        writeJson(QUICK_KEY, quick);

        var request = {kind: quick.kind, difficulty: Number(quick.difficulty), name: quick.name || undefined};
        if (quick.kind === 'slot')
          request.id = quick.slug;
        else if (quick.kind !== 'generated')
          request.slug = quick.slug;

        launch(request, quick.kind === 'generated' ? 'a random map' : quick.kind + ' ' + quick.slug);
      }),
      btn('reload into this city', function() {
        var g = game();
        if (!g)
          return log('no city running');
        var data = g.getSaveData();
        data.version = Storage.CURRENT_VERSION;
        launch({kind: 'data', data: data}, 'this city again (a save/load round trip)');
      }, '', 'Saves to session storage, reloads the page, loads it back. Checks what survives a real reload')
    ),
    note('Starting a city doesn\'t mark it. Cheats and dev actions afterwards do.')
  ]);

  // ---------------------------------------------------------------------------
  // saves

  var saveTable = h('div', {class: 'dv-table'});
  var storageNote = h('div', {class: 'dv-note'});
  var saveNameIn = text('DevSave');
  var saveText = h('textarea', {class: 'dv-textarea', spellcheck: 'false', placeholder: 'export fills this; paste a save here to import'});

  var storageChars = function(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? raw.length : 0;
    } catch (e) {
      return 0;
    }
  };

  var renderSaves = function() {
    var saves = Storage.listSaves();
    saveTable.replaceChildren.apply(saveTable, saves.length ? saves.map(function(entry) {
      var kb = (storageChars(Storage.KEY_PREFIX + entry.id) / 1024).toFixed(0);
      return h('div', {class: 'dv-tr'},
        h('span', {class: 'dv-td name', title: MiscUtils.describeSave(entry, Text)}, entry.name),
        h('span', {class: 'dv-td dim'}, kb + ' KB'),
        btn('load', function() { launch({kind: 'slot', id: entry.id}, 'save "' + entry.name + '"'); }, 'sm'),
        btn('delete', function() {
          if (!window.confirm('Delete save "' + entry.name + '"? This cannot be undone.'))
            return;
          Storage.deleteSave(entry.id);
          log('deleted save ' + entry.name);
          renderSaves();
        }, 'sm bad'));
    }) : [note('no saves')]);

    var total = 0;
    try {
      Object.keys(window.localStorage).forEach(function(key) {
        total += key.length + storageChars(key);
      });
      storageNote.textContent = saves.length + '/' + Storage.MAX_SAVES + ' saves · this origin\'s localStorage holds ~' +
        (total / 1024).toFixed(0) + ' KB of characters (shared with the rest of the site)';
    } catch (e) {
      storageNote.textContent = 'storage blocked';
    }
  };

  var savesSec = section('saves', 'saves', renderSaves, [
    saveTable,
    storageNote,
    row(lbl('save as'), saveNameIn, btn('save now', function() {
      look('saved as ' + saveNameIn.value, function(g) {
        g.save(saveNameIn.value || 'DevSave');
        renderSaves();
      });
    }, '', 'The game\'s own save, cap and all')),
    row(
      btn('export', function() {
        look('exported', function(g) {
          var data = g.getSaveData();
          data.version = Storage.CURRENT_VERSION;
          saveText.value = JSON.stringify(data);
          return (saveText.value.length / 1024).toFixed(0) + ' KB';
        });
      }),
      btn('copy', function() {
        if (navigator.clipboard && saveText.value)
          navigator.clipboard.writeText(saveText.value).then(function() { log('save copied'); });
      }),
      btn('import', function() {
        var data;
        try {
          data = JSON.parse(saveText.value);
        } catch (e) {
          return log('import: not JSON (' + e.message + ')');
        }
        if (!data || !Array.isArray(data.map))
          return log('import: that isn\'t a b0r3d-city save');
        // Anything pasted in could be anything, so it arrives marked.
        data.cheatsUsed = true;
        launch({kind: 'data', data: data}, 'the pasted save');
      }, '', 'Reloads into the pasted city. It arrives marked, so it can\'t reach the leaderboard'),
      btn('↻', renderSaves, 'sm')
    ),
    saveText
  ]);

  // ---------------------------------------------------------------------------
  // performance

  var perfEl = h('pre', {class: 'dv-pre'});

  var renderPerf = function() {
    var g = game();
    var lines = [
      'fps ' + fps() + '   paint avg ' + metrics.paintMs.toFixed(2) + 'ms max ' + metrics.paintMax.toFixed(1) + 'ms',
      'sim phase avg ' + metrics.simMs.toFixed(2) + 'ms max ' + metrics.simMax.toFixed(1) + 'ms' +
        (cheats.turbo ? ' (turbo: per phase)' : '')
    ];
    if (g) {
      var gc = g.gameCanvas;
      lines.push('view ' + gc._totalTilesInViewX + 'x' + gc._totalTilesInViewY + ' tiles, canvas ' + gc.canvasWidth + 'x' + gc.canvasHeight);
      lines.push('sprites ' + g.simulation.spriteManager.spriteList.length + ', tile images ' + (g.tileSet.length || '?'));
      lines.push('open windows ' + g._openWindows.length);
    }
    if (performance.memory)
      lines.push('JS heap ' + (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + ' MB');
    perfEl.textContent = lines.join('\n');
  };

  var perfSec = section('perf', 'performance', renderPerf, [
    perfEl,
    row(btn('reset maxima', function() {
      metrics.paintMax = 0;
      metrics.simMax = 0;
      renderPerf();
    })),
    note('Averages are rolling. A sim phase is one of the 16 steps in a tick; the heavy ones are the map scans.')
  ]);

  // ---------------------------------------------------------------------------
  // log

  var logSec = section('log', 'dev log', null, [
    row(
      check('log simulation messages', prefs.logMessages, function(on) {
        prefs.logMessages = on;
        savePrefs();
      }, 'Every message the simulation sends the notification bar, with its tile'),
      btn('clear', function() { logEl.textContent = ''; }, 'sm')
    ),
    logEl
  ]);

  // ---------------------------------------------------------------------------
  // game hook-up

  var ema = function(prev, next) {
    return prev === 0 ? next : prev * 0.9 + next * 0.1;
  };

  DevMode.onGameStarted(function(g) {
    picked = null;
    hover = null;

    // Timing, and the overlay redraw, ride on this one game's paintFrame and simTick --
    // wrapped on the instance, so nothing is added to the game's own code path.
    var paintFrame = g.paintFrame;
    g.paintFrame = function(moveSprites) {
      var t0 = performance.now();
      paintFrame.call(g, moveSprites);
      var t1 = performance.now();
      metrics.paintMs = ema(metrics.paintMs, t1 - t0);
      metrics.paintMax = Math.max(metrics.paintMax, t1 - t0);
      metrics.lastPaint = t1;
      if (moveSprites !== false)
        metrics.frames.push(t1);
      if (overlay)
        overlay.draw();
    };

    var sim = g.simulation;
    var simTick = sim.simTick;
    sim.simTick = function() {
      var t0 = performance.now();

      if (cheats.turbo > 0 && !sim.isPaused()) {
        var ran = sim.devStep(cheats.turbo);
        if (ran > 0) {
          var perPhase = (performance.now() - t0) / ran;
          metrics.simMs = ema(metrics.simMs, perPhase);
          metrics.simMax = Math.max(metrics.simMax, perPhase);
        }
        return;
      }

      var before = sim._phaseCycle;
      simTick.call(sim);
      if (sim._phaseCycle !== before) {
        var took = performance.now() - t0;
        metrics.simMs = ema(metrics.simMs, took);
        metrics.simMax = Math.max(metrics.simMax, took);
      }
    };

    sim.addEventListener(Messages.FRONT_END_MESSAGE, function(message) {
      if (!prefs.logMessages)
        return;
      var data = message.data;
      log('sim: ' + message.subject + (data && data.x !== undefined ? ' @ ' + data.x + ',' + data.y : ''));
    });
    sim.addEventListener(Messages.BUDGET_NEEDED, function() {
      log('sim: the city wants a budget decision');
    });

    overlay = new DevOverlay(g);
    overlay.setOptions(overlayOptions);

    // Cheats from before this city started (switched on at the splash screen) apply to
    // it; that marks it, the same as switching them on now would.
    if (activeCheats().length) {
      g.markCheatsUsed();
      if (cheats.freeBuild)
        BaseTool.setFreeBuild(true);
      if (cheats.pinOn)
        applyPin(g);
      log('cheats already on apply to this city too: ' + activeCheats().join(', '));
    }

    if (prefs.noBlink)
      applyBlink(g, true);
    Config.queryDebug = !!prefs.queryDebug;

    log('city started: "' + g.name + '"' + (g.scenarioController ? ', scenario ' + g.scenarioController.scenario.name : '') +
        (g._cheatsUsed ? ' (already marked: leaderboard off)' : ''));
    refreshOpenSections();
    updateBadge();
  });

  // Four times a second: keep "hold funds" held, and refresh whatever's on show.
  window.setInterval(function() {
    var g = game();
    if (g && cheats.holdFunds) {
      var b = g.simulation.budget;
      if (b.totalFunds < prefs.holdAmount)
        b.setFunds(prefs.holdAmount);
    }

    if (!shown)
      return;
    if (statusSec.open)
      renderStatus();
    if (perfSec.open)
      renderPerf();
    // Only when the count changes: rebuilding the rows on every tick would swap buttons
    // out from under a click.
    if (g && disastersSec.open && g.simulation.spriteManager.spriteList.length !== renderedSpriteCount)
      renderSprites();
    updateBadge();
  }, 250);

  window.addEventListener('keydown', function(e) {
    if (e.code !== 'Backquote' || e.repeat)
      return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable))
      return;
    e.preventDefault();
    setShown(!shown);
  });

  // ---------------------------------------------------------------------------
  // console API

  window.__bc = {
    game: game,
    log: log,
    drawFrame: redraw,
    stepSprites: function(frames) {
      return act('moved sprites ' + frames + ' frames', function(g) {
        for (var i = 0; i < frames; i++)
          g.simulation.spriteManager.moveObjects(g.simulation._constructSimData());
      });
    },
    step: function(phases) {
      return act('stepped', function(g) { return g.simulation.devStep(phases); });
    },
    ff: function(months) {
      fastForward('console +' + months + ' months', months);
    },
    tile: function(x, y) {
      return game() ? Tools.inspectTile(game(), x, y) : null;
    },
    pick: setPicked,
    overlay: function(options) {
      Object.assign(overlayOptions, options);
      saveOverlay();
      syncOverlayInputs();
    },
    tools: Tools,
    act: act,
    look: look,
    open: function(id) {
      setShown(true);
      sections.forEach(function(d) {
        if (d.getAttribute('data-id') === id) {
          d.open = true;
          d.scrollIntoView({block: 'nearest'});
        }
      });
    }
  };

  panel.append(head, statusSec, cheatsSec, citySec, timeSec, disastersSec, tileSec, overlaysSec, windowsSec, scenarioSec,
    savesSec, perfSec, logSec);
  document.body.append(panel, tab);
  setShown(shown);
  updateBadge();
  refreshOpenSections();

  log('dev menu ready (' + (SiteEnv.isMainSite() ? 'main site' : 'local/beta build') + '). Backtick shows and hides it.');
};


export { mountDevPanel };
