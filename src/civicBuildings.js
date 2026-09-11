import { Position } from './position.ts';
import { CUSTOM_BUILDINGS } from './customBuildings.js';

// Shared by every one of b0r3d-city's custom buildings: unpowered or road-disconnected
// halves a building's effectiveness, exactly matching Police/Fire Station's treatment
// (see emergencyServices.js) -- these just have no budget slider of their own to also
// scale by, so each uses a fixed strength instead of one read from simData.budget.
var applyCoverageModifiers = function(map, x, y, simData, effect) {
  var isPowered = map.getTile(x, y).isPowered();
  if (!isPowered)
    effect = effect / 2;

  var connectedToRoads = simData.trafficManager.findPerimeterRoad(new Position(x, y));
  if (!connectedToRoads)
    effect = effect / 2;

  return effect;
};


// Hospital, Library, Large Park and Museum raise land value in a radius, the same coverage-map mechanism
// Police/Fire Station use for crime/fire risk (see emergencyServices.js and
// civicBuildingScan in blockMapUtils.js) -- both share one civicBuildingMap since they
// contribute to the same underlying "land value bonus", not four separate systems.
// Effect strength (400/300/350/500) lives on each building's registry entry in
// customBuildings.js, not duplicated here.
var handleCoverageBuilding = function(censusStat, effect) {
  return function(map, x, y, simData) {
    simData.census[censusStat] += 1;
    var boost = Math.floor(applyCoverageModifiers(map, x, y, simData, effect));

    var civicBuildingMap = simData.blockMaps.civicBuildingMap;
    civicBuildingMap.worldSet(x, y, civicBuildingMap.worldGet(x, y) + boost);
  };
};


// The Recycling Centre is a coverage building pointed the other way: same map, same
// smoothing, same halving when it is unpowered or off the road network, but its score
// is subtracted from pollution instead of added to land value. Its own map rather than
// a negative entry in civicBuildingMap, because the two are consumed at different
// points of pollutionTerrainLandValueScan -- land value is computed per 2x2 block
// before the pollution readings have been smoothed, and this has to apply after.
var handleCleanupBuilding = function(censusStat, effect) {
  return function(map, x, y, simData) {
    simData.census[censusStat] += 1;
    var boost = Math.floor(applyCoverageModifiers(map, x, y, simData, effect));

    var wasteMap = simData.blockMaps.wasteMap;
    wasteMap.worldSet(x, y, wasteMap.worldGet(x, y) + boost);
  };
};


// School, University, Casino, Arcade and Data Centre instead feed straight into
// valves.js's residential/commercial/industrial demand formula as a citywide nudge
// (see VALVE_MAX_BOOST there, and the `valve`/`weight` fields each carries in the
// registry) -- no coverage radius, just a count, so no blockMap needed here, just a
// census accumulator.
var handleDemandBuilding = function(censusStat) {
  return function(map, x, y, simData) {
    simData.census[censusStat] += applyCoverageModifiers(map, x, y, simData, 1);
  };
};


// civicHospitalPop is deliberately its own census field, distinct from the
// pre-existing (and unrelated) census.hospitalPop the original auto-built hospital
// uses (see makeHospital in residential.js) -- sharing the field would incorrectly
// feed this building's count into the auto-hospital's own needHospital/eval-score
// logic. Dispatches generically on each registry entry's effect.type instead of one
// hand-written handler per building.
var makeHandler = function(effect) {
  switch (effect.type) {
    case 'coverage':
      return handleCoverageBuilding(effect.censusStat, effect.landValueEffect);

    case 'cleanup':
      return handleCleanupBuilding(effect.censusStat, effect.pollutionEffect);

    case 'demand':
      return handleDemandBuilding(effect.censusStat);

    default:
      throw new Error('Unknown custom building effect type "' + effect.type + '"');
  }
};


var buildingHandlers = CUSTOM_BUILDINGS.map(function(building) {
  return { centreTile: building.centreTile, handler: makeHandler(building.effect) };
});


var CivicBuildings = {
  registerHandlers: function(mapScanner, repairManager) {
    buildingHandlers.forEach(function(entry) {
      mapScanner.addAction(entry.centreTile, entry.handler);
    });
  }
};


export { CivicBuildings };
