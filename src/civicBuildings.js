import { Position } from './position.ts';
import { CASINO, CIVICHOSPITAL, LIBRARY, SCHOOL } from "./tileValues.ts";

// Shared by all four of b0r3d-city's custom buildings: unpowered or road-disconnected
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


// Hospital and Library raise land value in a radius, the same coverage-map mechanism
// Police/Fire Station use for crime/fire risk (see emergencyServices.js and
// civicBuildingScan in blockMapUtils.js) -- both share one civicBuildingMap since they
// contribute to the same underlying "land value bonus", not two separate systems.
var HOSPITAL_LAND_VALUE_EFFECT = 400;
var LIBRARY_LAND_VALUE_EFFECT = 300;

var handleCoverageBuilding = function(censusStat, effect) {
  return function(map, x, y, simData) {
    simData.census[censusStat] += 1;
    var boost = Math.floor(applyCoverageModifiers(map, x, y, simData, effect));

    var civicBuildingMap = simData.blockMaps.civicBuildingMap;
    civicBuildingMap.worldSet(x, y, civicBuildingMap.worldGet(x, y) + boost);
  };
};


// School and Casino instead feed straight into valves.js's residential/commercial
// demand formula as a flat per-building nudge (see SCHOOL_RESIDENTIAL_BOOST/
// CASINO_COMMERCIAL_BOOST there) -- no coverage radius, just a citywide count, so no
// blockMap needed here, just a census accumulator.
var handleDemandBuilding = function(censusStat) {
  return function(map, x, y, simData) {
    simData.census[censusStat] += applyCoverageModifiers(map, x, y, simData, 1);
  };
};


// Deliberately its own census field, distinct from the pre-existing (and unrelated)
// census.hospitalPop the original auto-built hospital uses -- see the tileValues.ts
// comment on CIVICHOSPITAL for why these are two separate features. Sharing the field
// would incorrectly feed this building's count into the auto-hospital's own
// needHospital/eval-score logic.
var civicHospitalFound = handleCoverageBuilding('civicHospitalPop', HOSPITAL_LAND_VALUE_EFFECT);
var libraryFound = handleCoverageBuilding('libraryPop', LIBRARY_LAND_VALUE_EFFECT);
var schoolFound = handleDemandBuilding('schoolPop');
var casinoFound = handleDemandBuilding('casinoPop');


var CivicBuildings = {
  registerHandlers: function(mapScanner, repairManager) {
    mapScanner.addAction(CIVICHOSPITAL, civicHospitalFound);
    mapScanner.addAction(LIBRARY, libraryFound);
    mapScanner.addAction(SCHOOL, schoolFound);
    mapScanner.addAction(CASINO, casinoFound);
  }
};


export { CivicBuildings };
