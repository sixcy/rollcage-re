import {verifyPeriodicBodySpawn} from './verify-periodic-body-spawn-instructions.mjs';
await verifyPeriodicBodySpawn({fixtures: 600, lifecycleFixtures: 12, withRaceUpdate: true, output: 'analysis/race-periodic-body-connected-instruction-check.json'});
