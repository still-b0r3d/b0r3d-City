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

// Scenario definitions for full Scenario mode: the 8 classic Micropolis cities
// (loaded from scenarioCities/*.json, same as freeform Classic Cities) plus an
// original Zombies scenario, each with an objective, a deadline, and -- for
// most of them -- a scripted disaster that hits shortly after the city loads.
//
// Objective types, checked by scenarioController.js:
//   'population' -- evaluation.cityPop must reach `target`
//   'score'      -- evaluation.cityScore must reach `target`
//   'below'      -- census[metric] must be at or under `target`
// All three win as soon as the condition is met. `surviveToDeadline` instead
// defers the check to the deadline itself (used by Zombies, where briefly
// touching the population target mid-game shouldn't end things early).
//
// These targets and timeframes are our own tuning for this engine/build, not
// a reproduction of the original scenarios' numbers -- treat them as a
// starting point to rebalance once people have actually played them.
//
// Disaster types, triggered by scenarioController.js shortly after the city
// loads (and, for 'monsterWaves', again every `everyYears` years):
//   'earthquake', 'fire', 'flood', 'meltdown', 'monster', 'monsterWaves'

var SCENARIOS = [
  {
    slug: 'dullsville',
    name: 'Dullsville',
    mapSlug: 'dullsville',
    year: 1900,
    deadlineYears: 20,
    blurb: 'A sleepy little town going nowhere fast. Give it a reason to grow.',
    disaster: null,
    objective: { type: 'population', target: 8000 },
    flavorWin: "Dullsville isn't dull anymore.",
    flavorLose: 'Twenty years on, Dullsville is still Dullsville.'
  },
  {
    slug: 'san-francisco',
    name: 'San Francisco',
    mapSlug: 'san-francisco',
    year: 1906,
    deadlineYears: 10,
    blurb: 'The earthquake just hit. Rebuild before the city gives up on itself.',
    disaster: { type: 'earthquake' },
    objective: { type: 'score', target: 650 },
    flavorWin: 'San Francisco rebuilt, and rebuilt well.',
    flavorLose: 'The rubble never really got cleared.'
  },
  {
    slug: 'hamburg',
    name: 'Hamburg',
    mapSlug: 'hamburg',
    year: 1944,
    deadlineYears: 10,
    blurb: "The bombing raids just ended. The city's still burning.",
    disaster: { type: 'fire' },
    objective: { type: 'score', target: 650 },
    flavorWin: 'Hamburg rose from the ashes.',
    flavorLose: 'The fires took more than the buildings.'
  },
  {
    slug: 'bern',
    name: 'Bern',
    mapSlug: 'bern',
    year: 1965,
    deadlineYears: 15,
    blurb: 'Gridlock, everywhere. Untangle the traffic before it strangles the city.',
    disaster: null,
    objective: { type: 'below', metric: 'trafficAverage', target: 80 },
    flavorWin: 'Bern finally gets where it needs to go, on time.',
    flavorLose: 'Nobody in Bern has gone anywhere in years.'
  },
  {
    slug: 'tokyo',
    name: 'Tokyo',
    mapSlug: 'tokyo',
    year: 1957,
    deadlineYears: 10,
    blurb: "Something enormous just came ashore. It's angry.",
    disaster: { type: 'monster' },
    objective: { type: 'score', target: 600 },
    flavorWin: 'The monster returned to the sea. Tokyo endures.',
    flavorLose: 'Tokyo is a monster movie now, not a city.'
  },
  {
    slug: 'detroit',
    name: 'Detroit',
    mapSlug: 'detroit',
    year: 1972,
    deadlineYears: 15,
    blurb: 'Crime has the run of the place. Take the city back.',
    disaster: null,
    objective: { type: 'below', metric: 'crimeAverage', target: 60 },
    flavorWin: 'The streets belong to Detroit again.',
    flavorLose: 'The streets never stopped belonging to crime.'
  },
  {
    slug: 'boston',
    name: 'Boston',
    mapSlug: 'boston',
    year: 2010,
    deadlineYears: 10,
    blurb: 'The reactor melted down. Contain the damage and rebuild around it.',
    disaster: { type: 'meltdown' },
    objective: { type: 'score', target: 650 },
    flavorWin: 'Boston contained the damage and moved on.',
    flavorLose: 'The reactor is still the only thing anyone remembers.'
  },
  {
    slug: 'rio-de-janeiro',
    name: 'Rio de Janeiro',
    mapSlug: 'rio-de-janeiro',
    year: 2047,
    deadlineYears: 10,
    blurb: 'The water rose and it has not gone back down. Rebuild above the flood line.',
    disaster: { type: 'flood' },
    objective: { type: 'score', target: 650 },
    flavorWin: 'Rio rebuilt higher, and held.',
    flavorLose: 'The water won.'
  },
  {
    slug: 'zombies',
    name: 'Zombies',
    mapSlug: 'dullsville',
    year: 2031,
    deadlineYears: 25,
    blurb: "It's a quiet town. It won't stay that way -- the horde returns every few years, and it's not picky about who's in the way.",
    disaster: { type: 'monsterWaves', everyYears: 5 },
    objective: { type: 'population', target: 5000 },
    surviveToDeadline: true,
    flavorWin: 'The horde stopped coming. The town held.',
    flavorLose: 'The horde came back one time too many.'
  }
];


var getScenario = function(slug) {
  for (var i = 0, l = SCENARIOS.length; i < l; i++) {
    if (SCENARIOS[i].slug === slug)
      return SCENARIOS[i];
  }
  return null;
};


export { SCENARIOS, getScenario };
