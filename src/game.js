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

import { BaseTool } from './baseTool.js';
import { BudgetWindow } from './budgetWindow.js';
import { Config } from './config.js';
import { CongratsWindow } from './congratsWindow.js';
import { DebugWindow } from './debugWindow.js';
import { DisasterWindow } from './disasterWindow.js';
import { EvaluationWindow } from './evaluationWindow.js';
import { GameCanvas } from './gameCanvas.js';
import { GameMap } from './gameMap.js';
import { HighScoreWindow } from './highScoreWindow.js';
import { InfoBar } from './infoBar.js';
import { InputStatus } from './inputStatus.js';
import * as Messages from './messages.ts';
import { MonsterTV } from './monsterTV.js';
import { Notification } from './notification.js';
import { QueryWindow } from './queryWindow.js';
import { Random } from './random.ts';
import { RCI } from './rci.js';
import { SaveWindow } from './saveWindow.js';
import { ScreenshotLinkWindow } from './screenshotLinkWindow.js';
import { ScreenshotWindow } from './screenshotWindow.js';
import { SettingsWindow } from './settingsWindow.js';
import { Simulation } from './simulation.js';
import { Storage } from './storage.js';
import { Text } from './text.js';
import { TouchWarnWindow } from './touchWarnWindow.js';

var disasterTimeout = 20 * 1000;


function Game(gameMap, tileSet, snowTileSet, spriteSheet, difficulty, name) {
  difficulty = difficulty || 0;
  var savedGame;

  if (!gameMap.isSavedGame) {
    this.gameMap = gameMap;
    savedGame = null;
  } else {
    this.gameMap = new GameMap(120, 100);
    savedGame = gameMap;
  }

  this.tileSet = tileSet;
  this.snowTileSet = snowTileSet;
  this.defaultSpeed = Simulation.SPEED_MED;
  this.simulation = new Simulation(this.gameMap, difficulty, this.defaultSpeed, savedGame);

  this.name = name || 'MyTown';
  this.everClicked = false;
  // One-way flag: never reset to false once a cheat actually does something (as opposed
  // to just opening the cheat menu, which alone doesn't affect gameplay). Persisted in
  // saves so a save/load cycle can't launder a cheated city back onto the leaderboard.
  // Initialized here, before the possible load() below, for the same reason
  // everClicked is -- load() needs to be able to override this default.
  this._cheatsUsed = false;

  if (savedGame)
    this.load(savedGame);

  this.rci = new RCI('RCIContainer', this.simulation);

  // Note: must init canvas before inputStatus
  this.gameCanvas = new GameCanvas('canvasContainer');
  this.gameCanvas.init(this.gameMap, this.tileSet, spriteSheet);
  this.inputStatus = new InputStatus(this.gameMap, this.gameCanvas);

  this.dialogOpen = false;
  this._openWindow = null;
  this.cheatMenuEnabled = false;
  this.mouse = null;
  this.lastCoord = null;
  this.simNeededBudget = false;
  this.isPaused = false;
  this.lastBadMessageTime = null;

  // Initialise monsterTV
  this.monsterTV = new MonsterTV(this.gameMap, tileSet, spriteSheet, this.gameCanvas.animationManager);

  var opacityLayerID = 'opaque';

  this.genericDialogClosure = genericDialogClosure.bind(this);

  // Hook up listeners to open/close evaluation window
  this.handleEvalRequest = makeWindowOpenHandler('eval', function() {
    return [this.simulation.evaluation];
  }.bind(this));

  this.evalWindow = new EvaluationWindow(opacityLayerID, 'evalWindow');
  this.evalWindow.addEventListener(Messages.EVAL_WINDOW_CLOSED, this.genericDialogClosure);
  this.inputStatus.addEventListener(Messages.EVAL_REQUESTED, this.handleEvalRequest.bind(this));

  // ... and similarly for the budget window
  this.handleBudgetRequest = makeWindowOpenHandler('budget', function() {
    var budgetData = {
      roadMaintenanceBudget: this.simulation.budget.roadMaintenanceBudget,
      roadRate: Math.floor(this.simulation.budget.roadPercent * 100),
      fireMaintenanceBudget: this.simulation.budget.fireMaintenanceBudget,
      fireRate: Math.floor(this.simulation.budget.firePercent * 100),
      policeMaintenanceBudget: this.simulation.budget.policeMaintenanceBudget,
      policeRate: Math.floor(this.simulation.budget.policePercent * 100),
      taxRate: this.simulation.budget.cityTax,
      totalFunds: this.simulation.budget.totalFunds,
      taxesCollected: this.simulation.budget.taxFund
    };

    return [budgetData];
  }.bind(this));

  this.budgetWindow = new BudgetWindow(opacityLayerID, 'budget');
  this.budgetWindow.addEventListener(Messages.BUDGET_WINDOW_CLOSED, this.handleBudgetWindowClosure.bind(this));
  this.inputStatus.addEventListener(Messages.BUDGET_REQUESTED, this.handleBudgetRequest.bind(this));

  // ... and also the disaster window
  this.disasterWindow = new DisasterWindow(opacityLayerID, 'disasterWindow');
  this.disasterWindow.addEventListener(Messages.DISASTER_WINDOW_CLOSED, this.handleDisasterWindowClosure.bind(this));
  this.inputStatus.addEventListener(Messages.DISASTER_REQUESTED, this.handleDisasterRequest.bind(this));

  // ... the debug window
  this.debugWindow = new DebugWindow(opacityLayerID, 'debugWindow');
  this.debugWindow.addEventListener(Messages.DEBUG_WINDOW_CLOSED, this.handleDebugWindowClosure.bind(this));
  this.inputStatus.addEventListener(Messages.DEBUG_WINDOW_REQUESTED, this.handleDebugRequest.bind(this));

  // ... the settings window
  this.handleSettingsRequest = makeWindowOpenHandler('settings', function() {
    return [{autoBudget: this.simulation.budget.autoBudget, autoBulldoze: BaseTool.getAutoBulldoze(),
             speed: this.defaultSpeed, disasters: this.simulation.disasterManager.disastersEnabled,
             cheatMenu: this.cheatMenuEnabled}];
  }.bind(this));
  this.settingsWindow = new SettingsWindow(opacityLayerID, 'settingsWindow');
  this.settingsWindow.addEventListener(Messages.SETTINGS_WINDOW_CLOSED, this.handleSettingsWindowClosure.bind(this));
  this.inputStatus.addEventListener(Messages.SETTINGS_WINDOW_REQUESTED, this.handleSettingsRequest.bind(this));

  // ... the screenshot window
  this.screenshotWindow = new ScreenshotWindow(opacityLayerID, 'screenshotWindow');
  this.screenshotWindow.addEventListener(Messages.SCREENSHOT_WINDOW_CLOSED, this.handleScreenshotWindowClosure.bind(this));
  this.inputStatus.addEventListener(Messages.SCREENSHOT_WINDOW_REQUESTED, this.handleScreenshotRequest.bind(this));

  // ... the screenshot link window
  this.screenshotLinkWindow = new ScreenshotLinkWindow(opacityLayerID, 'screenshotLinkWindow');
  this.screenshotLinkWindow.addEventListener(Messages.SCREENSHOT_LINK_CLOSED, this.genericDialogClosure);

  // ... the save window
  this.saveWindow = new SaveWindow(opacityLayerID, 'saveWindow');
  this.saveWindow.addEventListener(Messages.SAVE_WINDOW_CLOSED, this.handleSaveWindowClosure.bind(this));

  // ... the high score window
  this.highScoreWindow = new HighScoreWindow(opacityLayerID, 'highScoreWindow');
  this.highScoreWindow.addEventListener(Messages.HIGH_SCORE_WINDOW_CLOSED, this.genericDialogClosure);
  this.inputStatus.addEventListener(Messages.HIGH_SCORE_REQUESTED, this.handleHighScoreRequest.bind(this));

  // ... the touch warn window
  this.touchWindow = new TouchWarnWindow(opacityLayerID, 'touchWarnWindow');
  this.touchWindow.addEventListener(Messages.TOUCH_WINDOW_CLOSED, this.genericDialogClosure);

  // ... and finally the query window
  this.queryWindow = new QueryWindow(opacityLayerID, 'queryWindow');
  this.queryWindow.addEventListener(Messages.QUERY_WINDOW_CLOSED, this.genericDialogClosure);
  this.inputStatus.addEventListener(Messages.QUERY_WINDOW_NEEDED, this.handleQueryRequest.bind(this));

  // Listen for clicks on the save button
  this.inputStatus.addEventListener(Messages.SAVE_REQUESTED, this.handleSave.bind(this));

  // Listen for front end messages
  this.simulation.addEventListener(Messages.FRONT_END_MESSAGE, this.processFrontEndMessage.bind(this));

  // Listen for budget messages
  this.simulation.addEventListener(Messages.BUDGET_NEEDED, this.handleMandatoryBudget.bind(this));

  // Listen for tool clicks
  this.inputStatus.addEventListener(Messages.TOOL_CLICKED, this.handleTool.bind(this));

  // And pauses
  this.inputStatus.addEventListener(Messages.SPEED_CHANGE, this.handlePause.bind(this));

  // And date changes
  // XXX Not yet activated
  //this.simulation.addEventListener(Messages.DATE_UPDATED, this.onDateChange.bind(this));

  this.infoBar = InfoBar('cclass', 'population', 'score', 'funds', 'date', 'name');
  var initialValues = {
    classification: this.simulation.evaluation.cityClass,
    population: this.simulation.evaluation.cityPop,
    score: this.simulation.evaluation.cityScore,
    funds: this.simulation.budget.totalFunds,
    date: this.simulation.getDate(),
    name: this.name
  };
  this.infoBar(this.simulation, initialValues);

  this._notificationBar = new Notification('#notifications', this.gameCanvas, Text.messageText[Messages.WELCOME]);

  // Track when various milestones are first reached
  this._reachedTown = this._reachedCity = this._reachedCapital = this._reachedMetropolis = this._reacedMegalopolis = false;
  this.congratsWindow = new CongratsWindow(opacityLayerID, 'congratsWindow');
  this.congratsWindow.addEventListener(Messages.CONGRATS_WINDOW_CLOSED, this.genericDialogClosure);

  // Touch is a properly supported input now (zoom, pan, tap-to-place, and a mobile
  // drawer layout all exist), so the old "you might be in for a bad time" warning this
  // listener triggered no longer applies -- left disabled rather than deleted, along
  // with TouchWarnWindow/#touchWarnWindow themselves, matching how orphaned-but-present
  // pages/code are handled elsewhere on this site.
  // this.touchListener = touchListener.bind(this);
  // window.addEventListener('touchstart', this.touchListener, false);

  // Unhide controls
  this.revealControls();

  // Run the sim
  this.tick = tick.bind(this);
  this.tick();

  // Paint the map
  this.frameCount = 0;
  this.animStart = new Date();
  this.lastElapsed = -1;

  var debug = Config.debug || Config.gameDebug;
  if (debug) {
    this.cheatMenuEnabled = true;
    $('#debug').toggle();
  }

  this.commonAnimate = commonAnimate.bind(this);
  this.animate = animate.bind(this);
  this.animate();
}


Game.prototype.save = function(saveName) {
  var saveData = {name: this.name, everClicked: this.everClicked, cheatsUsed: this._cheatsUsed};
  BaseTool.save(saveData);
  this.simulation.save(saveData);

  var meta = {
    population: this.simulation.evaluation.cityPop,
    cityClass: this.simulation.evaluation.cityClass,
    date: this.simulation.getDate()
  };

  var id = Storage.saveGame(saveName, saveData, meta);

  // saveGame refuses a brand-new slot once MAX_SAVES is already reached --
  // normally caught by saveWindow.js's own pre-check before this ever runs,
  // but that check and this write are two separate localStorage reads, so a
  // save from another tab in between can still let a doomed save through.
  // The save dialog has already closed by this point, so an alert is the
  // only way left to tell the player nothing was actually written.
  if (id === null)
    window.alert('Save failed: you already have ' + Storage.MAX_SAVES + ' saves. Delete one, then try again.');
};


Game.prototype.load = function(saveData) {
  this.name = saveData.name;
  this.everClicked = saveData.everClicked;
  // Older saves predate this field -- default to false rather than undefined
  this._cheatsUsed = saveData.cheatsUsed || false;
  BaseTool.load(saveData);
  this.simulation.load(saveData);
};


var nextFrame =
  window.requestAnimationFrame ||
  window.mozRequestAnimationFrame ||
  window.webkitRequestAnimationFrame;


Game.prototype.revealControls = function() {
 $('.initialHidden').each(function(e) {
   $(this).removeClass('initialHidden');
 });

 this._notificationBar.news({subject: Messages.WELCOME});
 this.rci.update({residential: 750, commercial: 750, industrial: 750});
};


var genericDialogClosure = function() {
  this.dialogOpen = false;
  this._openWindow = null;
};


Game.prototype.onDateChange = function(date) {
  if (date.month === 10 && Random.getChance(10))
    this.gameCanvas.changeTileSet(this.snowTileSet);
  else if (date.month === 1)
    this.gameCanvas.changeTileSet(this.tileSet);
};


Game.prototype.handleDisasterWindowClosure = function(request) {
  this.dialogOpen = false;

  if (request === DisasterWindow.DISASTER_NONE)
    return;

  switch (request) {
    case DisasterWindow.DISASTER_MONSTER:
      this.simulation.spriteManager.makeMonster();
      break;

    case DisasterWindow.DISASTER_FIRE:
      this.simulation.disasterManager.makeFire();
      break;

    case DisasterWindow.DISASTER_FLOOD:
      this.simulation.disasterManager.makeFlood();
      break;

    case DisasterWindow.DISASTER_CRASH:
      this.simulation.disasterManager.makeCrash();
      break;

    case DisasterWindow.DISASTER_MELTDOWN:
      this.simulation.disasterManager.makeMeltdown();
      break;

    case DisasterWindow.DISASTER_TORNADO:
      this.simulation.spriteManager.makeTornado();
  }
};


Game.prototype.handleSettingsWindowClosure = function(actions) {
  this.dialogOpen = false;

  for (var i = 0, l = actions.length; i < l; i++) {
    var a = actions[i];

    switch (a.action) {
      case SettingsWindow.AUTOBUDGET:
        this.simulation.budget.setAutoBudget(a.data);
        break;

      case SettingsWindow.AUTOBULLDOZE:
        BaseTool.setAutoBulldoze(a.data);
        break;

      case SettingsWindow.SPEED:
        this.defaultSpeed = a.data;
        this.simulation.setSpeed(this.defaultSpeed);
        break;

      case SettingsWindow.DISASTERS_CHANGED:
        this.simulation.disasterManager.disastersEnabled = a.data;
        break;

      case SettingsWindow.CHEAT_MENU_CHANGED:
        this.cheatMenuEnabled = a.data;
        if (a.data) {
          this.frameCount = 0;
          this.animStart = new Date();
          this.lastElapsed = -1;
        }
        $('#debug')[a.data ? 'show' : 'hide']();
        break;

      default:
        console.warn('Unexpected action', a);
    }
  }
};


Game.prototype.cheatAddFunds = function(amount) {
  this._cheatsUsed = true;
  this.simulation.budget.spend(-amount);
};


Game.prototype.cheatSetFreeBuild = function(enabled) {
  // Only turning it on counts as "using" it -- switching it back off isn't itself a cheat
  if (enabled)
    this._cheatsUsed = true;
  BaseTool.setFreeBuild(enabled);
};


Game.prototype.cheatTriggerDisaster = function(name) {
  this._cheatsUsed = true;

  switch (name) {
    case 'fire':
      this.simulation.disasterManager.makeFire();
      break;

    case 'flood':
      this.simulation.disasterManager.makeFlood();
      break;

    case 'crash':
      this.simulation.disasterManager.makeCrash();
      break;

    case 'meltdown':
      this.simulation.disasterManager.makeMeltdown();
      break;

    case 'tornado':
      this.simulation.spriteManager.makeTornado();
      break;

    case 'monster':
      this.simulation.spriteManager.makeMonster();
      break;

    default:
      console.warn('Unknown disaster cheat', name);
  }
};


Game.prototype.cheatGetState = function() {
  return {
    funds: this.simulation.budget.totalFunds,
    cheatMenuEnabled: this.cheatMenuEnabled,
    freeBuild: BaseTool.getFreeBuild(),
    cheatsUsed: this._cheatsUsed,
    date: this.simulation.getDate ? this.simulation.getDate() : null
  };
};


Game.prototype.handleDebugWindowClosure = function(actions) {
  this.dialogOpen = false;

  for (var i = 0, l = actions.length; i < l; i++) {
    var a = actions[i];

    switch (a.action) {
      case DebugWindow.ADD_FUNDS:
        this.cheatAddFunds(a.data);
        break;

      case DebugWindow.FREE_BUILD_CHANGED:
        this.cheatSetFreeBuild(a.data);
        break;

      case DebugWindow.TRIGGER_DISASTER:
        this.cheatTriggerDisaster(a.data);
        break;

      default:
        console.warn('Unexpected action', a);
    }
  }
};


Game.prototype.handleScreenshotWindowClosure = function(action) {
  this.dialogOpen = false;

  if (action === null)
    return;

  var dataURI;
  if (action === ScreenshotWindow.SCREENSHOT_VISIBLE)
    dataURI = this.gameCanvas.screenshotVisible();
  else if (action === ScreenshotWindow.SCREENSHOT_ALL)
    dataURI = this.gameCanvas.screenshotMap();

  this.dialogOpen = true;
  this._openWindow = 'screenshotLinkWindow';
  this.screenshotLinkWindow.open(dataURI);
};


Game.prototype.handleBudgetWindowClosure = function(data) {
  this.dialogOpen = false;

  if (!data.cancelled) {
    this.simulation.budget.roadPercent = data.roadPercent / 100;
    this.simulation.budget.firePercent = data.firePercent / 100;
    this.simulation.budget.policePercent = data.policePercent / 100;
    this.simulation.budget.setTax(data.taxPercent - 0);
    if (this.simNeededBudget) {
      this.simulation.budget.doBudgetWindow();
      this.simNeededBudget = false;
    } else {
      this.simulation.budget.updateFundEffects();
    }
  }
};


var makeWindowOpenHandler = function(winName, customFn) {
  customFn = customFn || null;

  return function() {
    if (this.dialogOpen) {
      console.warn('Request made to open ' + winName + ' window. There is a dialog open!');
      return;
    }

    this.dialogOpen = true;
    this._openWindow = winName + 'Window';
    var win = winName + 'Window';
    var data = [];

    if (customFn)
      data = customFn();

    this[win].open.apply(this[win], data);
  };
};


Game.prototype.handleDebugRequest = makeWindowOpenHandler('debug', function() {
  return [{freeBuild: BaseTool.getFreeBuild()}];
}.bind(this));
Game.prototype.handleDisasterRequest = makeWindowOpenHandler('disaster');
Game.prototype.handleQueryRequest = makeWindowOpenHandler('query');
Game.prototype.handleScreenshotRequest = makeWindowOpenHandler('screenshot');


Game.prototype.handleMandatoryBudget = function() {
  this.simNeededBudget = true;
  this.handleBudgetRequest();
};


Game.prototype.handleTool = function(data) {
  var x = data.x;
  var y = data.y;

  // Were was the tool clicked?
  var tileCoords = this.gameCanvas.canvasCoordinateToTileCoordinate(x, y);

  if (tileCoords === null)
    return;

  var tool = this.inputStatus.currentTool;

  var budget = this.simulation.budget;
  var evaluation = this.simulation.evaluation;

  // do it!
  tool.doTool(tileCoords.x, tileCoords.y, this.simulation.blockMaps);

  tool.modifyIfEnoughFunding(budget);
  switch (tool.result) {
    case tool.TOOLRESULT_NEEDS_BULLDOZE:
      $('#toolOutput').text(Text.toolMessages.needsDoze);
      break;

    case tool.TOOLRESULT_NO_MONEY:
      $('#toolOutput').text(Text.toolMessages.noMoney);
      break;

    default:
      $('#toolOutput').html('Tools');
  }
};


Game.prototype.handleSave = function() {
  if (this.dialogOpen) {
    console.warn('Request made to open save window. There is a dialog open!');
    return;
  }

  this.dialogOpen = true;
  this._openWindow = 'saveWindow';
  this.saveWindow.open({defaultName: this.name, saves: Storage.listSaves()});
};


Game.prototype.handleSaveWindowClosure = function(name) {
  this.dialogOpen = false;
  this._openWindow = null;

  if (name)
    this.save(name);
};


Game.prototype.handleHighScoreRequest = function() {
  if (this.dialogOpen) {
    console.warn('Request made to open high score window. There is a dialog open!');
    return;
  }

  this.dialogOpen = true;
  this._openWindow = 'highScoreWindow';
  this.highScoreWindow.open({
    score: this.simulation.evaluation.cityScore,
    level: HighScoreWindow.classNameToLevel(this.simulation.evaluation.cityClass),
    population: this.simulation.evaluation.cityPop,
    cheatsUsed: this._cheatsUsed
  });
};


Game.prototype.handlePause = function() {
  // XXX Currently only offer pause and run to the user
  // No real difference among the speeds until we optimise
  // the sim
  this.isPaused = !this.isPaused;

  if (this.isPaused)
    this.simulation.setSpeed(Simulation.SPEED_PAUSED);
  else
    this.simulation.setSpeed(this.defaultSpeed);
};


Game.prototype.handleInput = function() {
  if (!this.dialogOpen) {
    // Handle keyboard movement

    if (this.inputStatus.left)
      this.gameCanvas.moveWest();
    else if (this.inputStatus.up)
      this.gameCanvas.moveNorth();
    else if (this.inputStatus.right)
      this.gameCanvas.moveEast();
    else if (this.inputStatus.down)
      this.gameCanvas.moveSouth();
  }

  if (this.inputStatus.escape) {
    // We need to handle escape, as InputStatus won't know what dialogs are showing
    if (this.dialogOpen) {
      this.dialogOpen = false;
      this[this._openWindow].close();
      this._openWindow = null;
    } else
      this.inputStatus.clearTool();
  }
};


// Will be bound on construction
var touchListener = function(e) {
  window.removeEventListener('touchstart', this.touchListener, false);
  this._openWindow = 'touchWindow';
  this.dialogOpen = true;
  this.touchWindow.open();
};


Game.prototype.processFrontEndMessage = function(message) {
  var subject = message.subject;
  var d = new Date();

  if (Text.goodMessages[subject] !== undefined) {
    var cMessage = this.name + ' is now a ';

    switch (subject) {
      case Messages.REACHED_CAPITAL:
        if (!this._reachedCapital) {
          this._reachedCapital = true;
          cMessage += 'capital!';
        }
        break;

      case Messages.REACHED_CITY:
        if (!this._reachedCity) {
          this._reachedCity = true;
          cMessage += 'city!';
        }
        break;

      case Messages.REACHED_MEGALOPOLIS:
        if (!this._reachedMegalopolis) {
          this._reachedMegalopolis = true;
          cMessage += 'megalopolis!';
        }
        break;

      case Messages.REACHED_METROPOLIS:
        if (!this._reachedMetropolis) {
          this._reachedMetropolis = true;
          cMessage += 'metropolis!';
        }
        break;

      case Messages.REACHED_TOWN:
        if (!this._reachedTown) {
          this._reachedTown = true;
          cMessage += 'town!';
        }
        break;
    }

    if (this.lastBadMessageTime === null || d - this.lastBadMessageTime > disasterTimeout) {
      this.lastBadMessageTime = null;
      this._notificationBar.goodNews(message);
    }

    if (cMessage !== (this.name + ' is now a ')) {
      this.dialogOpen = true;
      this._openWindow = 'congratsWindow';
      this.congratsWindow.open(cMessage);
    }

    return;
  }

  // Show disaster if applicable
  if (message.data) {
    if (message.data.showable)
    this.monsterTV.show(message.data.x, message.data.y);
    else if (message.data.trackable)
    this.monsterTV.track(message.data.x, message.data.y, message.data.sprite);
  }

  if (Text.badMessages[subject] !== undefined) {
    this._notificationBar.badNews(message);
    if (Messages.DISASTER_MESSAGES.indexOf(message.subject) !== -1)
      this.lastBadMessageTime = d;
    return;
  }

  if (Text.neutralMessages[subject] !== undefined) {
    if (this.lastBadMessageTime === null || d - this.lastBadMessageTime > disasterTimeout) {
      this.lastBadMessageTime = null;
      this._notificationBar.news(message);
    }
    return;
  }

  console.warn('Unexpected message: ', subject);
};


Game.prototype.calculateMouseForPaint = function() {
  // Determine whether we need to draw a tool outline in the
  // canvas
  var mouse = null;

  if (this.inputStatus.mouseX !== -1 && this.inputStatus.toolWidth > 0) {
    var tileCoords = this.gameCanvas.canvasCoordinateToTileOffset(this.inputStatus.mouseX, this.inputStatus.mouseY);
    if (tileCoords !== null) {
      mouse = {};

      mouse.x = tileCoords.x;
      mouse.y = tileCoords.y;

      // The inputStatus fields came from DOM attributes, so will be strings.
      // Coerce back to numbers.
      mouse.width = this.inputStatus.toolWidth - 0;
      mouse.height = this.inputStatus.toolWidth - 0;
      mouse.colour = this.inputStatus.toolColour || 'yellow';
    }
  }

  return mouse;
};


Game.prototype.calculateSpritesForPaint = function(canvas) {
  var origin = canvas.getTileOrigin();
  var spriteList = this.simulation.spriteManager.getSpritesInView(origin.x, origin.y, canvas.canvasWidth, canvas.canvasHeight);

  if (spriteList.length === 0)
    return null;

  return spriteList;
};


var tick = function() {
  this.handleInput();

  if (this.dialogOpen) {
    window.setTimeout(this.tick, 0);
    return;
  }

  if (!this.simulation.isPaused() && !$('#tooSmall').is(':visible')) {
    // Run the sim
    this.simulation.simTick();
  }

  // Run this even when paused: you can still build when paused
  this.mouse = this.calculateMouseForPaint();

  window.setTimeout(this.tick, 0);
};


var commonAnimate = function() {
  if (this.dialogShowing) {
    nextFrame(this.animate);
    return;
  }

  if (!this.isPaused)
    this.simulation.spriteManager.moveObjects(this.simulation._constructSimData());

  var sprites = this.calculateSpritesForPaint(this.gameCanvas);
  this.gameCanvas.paint(this.mouse, sprites, this.isPaused);

  sprites = this.calculateSpritesForPaint(this.monsterTV.canvas);
  this.monsterTV.paint(sprites, this.isPaused);

  nextFrame(this.animate);
};


var animate = function() {
  if (this.cheatMenuEnabled) {
    var date = new Date();
    var elapsed = Math.floor((date - this.animStart) / 1000);

    if (elapsed > this.lastElapsed && this.frameCount > 0) {
      $('#fpsValue').text(Math.floor(this.frameCount/elapsed));
      this.lastElapsed = elapsed;
    }

    this.frameCount++;
  }

  this.commonAnimate();
};


export { Game };
