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

import { MiscUtils } from './miscUtils.js';

// How many readings each history array holds. Exported because graphWindow.js plots
// against it, and because Census.load falls back to it for saves written before the
// fill counters existed.
var HISTORY_LENGTH = 120;

var arrs = ['res', 'com', 'ind', 'crime',
            'money', 'pollution'];
function Census() {
  this.clearCensus();
  this.changed = false;
  this.crimeRamp = 0;
  this.pollutionRamp = 0;

  // Set externally
  this.landValueAverage = 0;
  this.pollutionAverage = 0;
  this.crimeAverage = 0;
  this.totalPop = 0;

  var createArray = function(arrName) {
    this[arrName] = [];
    for (var a = 0; a < HISTORY_LENGTH; a++)
      this[arrName][a] = 0;
  };

  for (var i = 0; i < arrs.length; i++) {
    var name10 = arrs[i] + 'Hist10';
    var name120 = arrs[i] + 'Hist120';
    createArray.call(this, name10);
    createArray.call(this, name120);
  }

  // How many of the 120 slots in each set of arrays hold a real reading rather than
  // the zero they were initialised to. The arrays themselves can't answer this -- a
  // genuine reading of 0 (no commercial population yet, say) is indistinguishable
  // from an unfilled slot -- and graphWindow.js needs it, or a city three years old
  // plots as seven years of flat zero before its actual history, which reads as a bug
  // rather than as "there is no history here yet".
  this.histCount10 = 0;
  this.histCount120 = 0;
}


var rotate10Arrays = function() {
  for (var i = 0; i < arrs.length; i++) {
    var name10 = arrs[i] + 'Hist10';
    this[name10].pop();
    this[name10].unshift(0);
  }
};


var rotate120Arrays = function() {
  for (var i = 0; i < arrs.length; i++) {
    var name120 = arrs[i] + 'Hist120';
    this[name120].pop();
    this[name120].unshift(0);
  }
};


Census.prototype.clearCensus = function() {
  this.poweredZoneCount = 0;
  this.unpoweredZoneCount = 0;
  this.firePop = 0;
  this.roadTotal = 0;
  this.railTotal = 0;
  this.resPop = 0;
  this.comPop = 0;
  this.indPop = 0;
  this.resZonePop = 0;
  this.comZonePop = 0;
  this.indZonePop = 0;
  this.hospitalPop = 0;
  this.churchPop = 0;
  this.policeStationPop = 0;
  this.fireStationPop = 0;
  this.civicHospitalPop = 0;
  this.libraryPop = 0;
  this.schoolPop = 0;
  this.casinoPop = 0;
  this.largeParkPop = 0;
  this.arcadePop = 0;
  this.dataCentrePop = 0;
  this.universityPop = 0;
  this.museumPop = 0;
  this.rukusPop = 0;
  this.amusementParkPop = 0;
  this.megamartPop = 0;
  this.barPop = 0;
  this.burgerBaronPop = 0;
  this.stadiumPop = 0;
  this.coalPowerPop = 0;
  this.nuclearPowerPop = 0;
  this.seaportPop = 0;
  this.airportPop = 0;
};


var saveProps = ['resPop', 'comPop', 'indPop', 'crimeRamp', 'pollutionRamp', 'landValueAverage', 'pollutionAverage',
             'crimeAverage', 'totalPop', 'resHist10', 'resHist120', 'comHist10', 'comHist120', 'indHist10',
             'indHist120', 'crimeHist10', 'crimeHist120', 'moneyHist10', 'moneyHist120', 'pollutionHist10',
             'pollutionHist120', 'histCount10', 'histCount120'];

Census.prototype.save = function(saveData) {
  for (var i = 0, l = saveProps.length; i < l; i++)
    saveData[saveProps[i]] = this[saveProps[i]];
};


Census.prototype.load = function(saveData) {
  for (var i = 0, l = saveProps.length; i < l; i++)
    this[saveProps[i]] = saveData[saveProps[i]];

  // The two counters were added alongside the graph window, so saves written before
  // that don't carry them. Their history is real and worth plotting, and there's no
  // way to recover how much of it is genuine after the fact, so those saves are
  // treated as having a full set -- which is exactly the whole-array plot they'd have
  // got if the counters had never existed. Only affects pre-existing saves; anything
  // saved from here on carries the true count.
  if (typeof this.histCount10 !== 'number')
    this.histCount10 = HISTORY_LENGTH;
  if (typeof this.histCount120 !== 'number')
    this.histCount120 = HISTORY_LENGTH;
};


Census.prototype.take10Census = function(budget) {
  var resPopDenom = 8;

  rotate10Arrays.call(this);

  this.resHist10[0] = Math.floor(this.resPop / resPopDenom);
  this.comHist10[0] = this.comPop;
  this.indHist10[0] = this.indPop;

  this.crimeRamp += Math.floor((this.crimeAverage - this.crimeRamp) / 4);
  this.crimeHist10[0] = Math.min(this.crimeRamp, 255);

  this.pollutionRamp += Math.floor((this.pollutionAverage - this.pollutionRamp) / 4);
  this.pollutionHist10[0] = Math.min(this.pollutionRamp, 255);

  var x = Math.floor(budget.cashFlow / 20) + 128;
  this.moneyHist10[0] = MiscUtils.clamp(x, 0, 255);

  var resPopScaled = this.resPop >> 8;

  if (this.hospitalPop < this.resPopScaled)
    this.needHospital = 1;
  else if (this.hospitalPop > this.resPopScaled)
    this.needHospital = -1;
  else if (this.hospitalPop === this.resPopScaled)
    this.needHospital = 0;

  if (this.histCount10 < HISTORY_LENGTH)
    this.histCount10++;

  this.changed = true;
};


Census.prototype.take120Census = function() {
  rotate120Arrays.call(this);
  var resPopDenom = 8;

  this.resHist120[0] = Math.floor(this.resPop / resPopDenom);
  this.comHist120[0] = this.comPop;
  this.indHist120[0] = this.indPop;
  this.crimeHist120[0] = this.crimeHist10[0];
  this.pollutionHist120[0] = this.pollutionHist10[0];
  this.moneyHist120[0] = this.moneyHist10[0];

  if (this.histCount120 < HISTORY_LENGTH)
    this.histCount120++;

  this.changed = true;
};


export { Census, HISTORY_LENGTH };
