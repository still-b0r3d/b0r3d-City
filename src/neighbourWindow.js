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

import { NEIGHBOUR_WINDOW_CLOSED } from './messages.ts';
import { ModalWindow } from './modalWindow.js';
import { AMOUNT_STEP, DEAL_EXPORT, DEAL_IMPORT, DEAL_NONE } from './neighbours.js';

// One block per neighbouring town: who they are, how they feel about the city, and a
// contract to buy or sell electricity. Rendered from the live state each time it is
// opened, since rates drift and relations move on their own.
//
// The figures at the top are the point of the window. A power contract is a decision
// about the grid before it is a decision about money, and there was previously nowhere
// in the game that told a player what their grid's headroom actually was -- only
// whether it had already run out, via the blackout notice.
var NeighbourWindow = ModalWindow(function() {
  $(neighbourCancelID).on('click', cancel.bind(this));
  $(neighbourFormID).on('submit', submit.bind(this));
  $(neighbourListID).on('change', '.neighbourDeal', onDealChanged.bind(this));
  $(neighbourListID).on('input change', '.neighbourAmount', onAmountChanged.bind(this));
});


var neighbourCancelID = '#neighbourCancel';
var neighbourFormID = '#neighbourForm';
var neighbourListID = '#neighbourList';
var neighbourPowerID = '#neighbourPower';
var neighbourWarningID = '#neighbourWarning';


var describeCost = function(cost) {
  if (cost === 0)
    return 'no charge';

  return cost > 0 ? '$' + cost + '/yr out' : '$' + (-cost) + '/yr in';
};


// The row a control belongs to, and the state it currently shows. Both handlers below
// need the same three elements, so they are found once here.
var rowFor = function(element) {
  var row = $(element).closest('.neighbourRow');

  return {
    row: row,
    dealType: row.find('.neighbourDeal').val(),
    amount: row.find('.neighbourAmount').val() - 0,
    buyRate: row.data('buyrate') - 0,
    sellRate: row.data('sellrate') - 0
  };
};


// What this row's contract would cost per year, given whatever the controls are set to
// right now. Mirrors annualCostOf in neighbours.js -- the same arithmetic has to happen
// here because the player needs the figure before they commit to it, not after.
var costOfRow = function(state) {
  if (state.dealType === DEAL_IMPORT)
    return Math.round(state.amount / 100 * state.buyRate);

  if (state.dealType === DEAL_EXPORT)
    return -Math.round(state.amount / 100 * state.sellRate);

  return 0;
};


var refreshRow = function(state) {
  var trading = state.dealType !== DEAL_NONE;

  state.row.find('.neighbourAmount').prop('disabled', !trading);
  state.row.find('.neighbourAmountLabel')
    .text(trading ? state.amount + ' units' : 'no contract');
  state.row.find('.neighbourRowCost').text(describeCost(costOfRow(state)));
};


var onDealChanged = function(e) {
  var state = rowFor(e.target);

  // Picking a contract type from "none" with the slider still at zero would leave a
  // control that is enabled but says nothing is being traded, so it opens at one step.
  if (state.dealType !== DEAL_NONE && state.amount === 0) {
    state.amount = AMOUNT_STEP;
    state.row.find('.neighbourAmount').val(AMOUNT_STEP);
  }

  refreshRow(state);
};


var onAmountChanged = function(e) {
  refreshRow(rowFor(e.target));
};


NeighbourWindow.prototype.close = function(data) {
  data = data || { cancelled: true };
  this._emitEvent(NEIGHBOUR_WINDOW_CLOSED, data);
  this._toggleDisplay();
};


var cancel = function(e) {
  e.preventDefault();
  this.close({ cancelled: true });
};


var submit = function(e) {
  e.preventDefault();

  var deals = [];

  $('.neighbourRow').each(function() {
    var row = $(this);

    // A neighbour who has walked away has no controls to read.
    if (row.hasClass('neighbourCooloff'))
      return;

    deals.push({
      id: row.data('neighbour'),
      dealType: row.find('.neighbourDeal').val(),
      amount: row.find('.neighbourAmount').val() - 0
    });
  });

  this.close({ cancelled: false, deals: deals });
};


// A 0-100 relations figure as a short bar plus a word, since the number on its own says
// nothing about which end is good.
var RELATIONS_WORDS = [
  [80, 'warm'], [60, 'friendly'], [40, 'businesslike'], [25, 'cool'], [0, 'hostile']
];

var describeRelations = function(relations) {
  var word = 'hostile';
  for (var i = 0; i < RELATIONS_WORDS.length; i++) {
    if (relations >= RELATIONS_WORDS[i][0]) {
      word = RELATIONS_WORDS[i][1];
      break;
    }
  }

  return word;
};


var buildRow = function(neighbour) {
  var row = $('<div>')
    .addClass('neighbourRow')
    .data('neighbour', neighbour.id)
    .data('buyrate', neighbour.buyRate)
    .data('sellrate', neighbour.sellRate);

  var head = $('<div>').addClass('neighbourHead');
  head.append($('<span>').addClass('neighbourName').text(neighbour.name));
  head.append($('<span>').addClass('neighbourRelations')
    .text(describeRelations(neighbour.relations) + ' (' + neighbour.relations + '/100)'));
  row.append(head);

  row.append($('<div>').addClass('neighbourBlurb').text(neighbour.blurb));

  if (neighbour.cooloff > 0) {
    row.addClass('neighbourCooloff');
    row.append($('<div>').addClass('neighbourBlurb')
      .text('Will not deal with this city for another ' + neighbour.cooloff +
            (neighbour.cooloff === 1 ? ' year.' : ' years.')));
    return row;
  }

  row.append($('<div>').addClass('neighbourRates')
    .text('Sells at $' + neighbour.buyRate + ' / buys at $' + neighbour.sellRate +
          ' per 100 units · up to ' + neighbour.capacity + ' units'));

  var controls = $('<div>').addClass('neighbourControls');

  var select = $('<select>').addClass('neighbourDeal');
  [[DEAL_NONE, 'No contract'], [DEAL_IMPORT, 'Buy their power'], [DEAL_EXPORT, 'Sell them ours']]
    .forEach(function(option) {
      select.append($('<option>').attr('value', option[0]).text(option[1]));
    });
  select.val(neighbour.dealType);

  var slider = $('<input>')
    .attr('type', 'range')
    .addClass('neighbourAmount')
    .attr('min', 0)
    .attr('max', neighbour.capacity)
    .attr('step', AMOUNT_STEP)
    .val(neighbour.amount)
    .prop('disabled', neighbour.dealType === DEAL_NONE);

  controls.append(select).append(slider);
  row.append(controls);

  var readout = $('<div>').addClass('neighbourReadout');
  readout.append($('<span>').addClass('neighbourAmountLabel')
    .text(neighbour.dealType === DEAL_NONE ? 'no contract' : neighbour.amount + ' units'));
  readout.append($('<span>').addClass('neighbourRowCost').text(describeCost(neighbour.annualCost)));
  row.append(readout);

  return row;
};


// neighbourData: { neighbours: <summary array>, power: {capacity, consumption, imported,
// exported, generated, scanCompleted} }
NeighbourWindow.prototype.open = function(neighbourData) {
  var power = neighbourData.power;

  // Consumption from a scan that bailed out early is a floor, not a figure -- it
  // stopped counting the moment it ran out of power to hand out -- so it is reported
  // as the shortfall it is rather than as a number that looks precise.
  var used = power.scanCompleted ? (power.consumption + ' in use') : 'demand exceeds supply';

  $(neighbourPowerID).text(
    'Grid: ' + power.generated + ' generated' +
    (power.imported ? ', ' + power.imported + ' imported' : '') +
    (power.exported ? ', ' + power.exported + ' sold on' : '') +
    ' — ' + power.capacity + ' available, ' + used);

  // Imported power raises what the grid can carry but cannot start one: the power scan
  // spreads outwards from the city's own plants, so with no plant there is nothing for
  // the imports to spread from. Said here, at the moment it becomes true, because a
  // player who has just signed for 500 units and seen nothing light up has no other way
  // to find that out. See the note at the top of neighbours.js.
  $(neighbourWarningID).text(
    (power.imported > 0 && power.generated === 0)
      ? 'The city has no power plant of its own. Imported power raises the grid\'s ' +
        'capacity, but it cannot reach the zones until there is a plant here to carry it.'
      : '');

  var list = $(neighbourListID);
  list.empty();
  neighbourData.neighbours.forEach(function(neighbour) {
    list.append(buildRow(neighbour));
  });

  this._toggleDisplay();
};


export { NeighbourWindow };
