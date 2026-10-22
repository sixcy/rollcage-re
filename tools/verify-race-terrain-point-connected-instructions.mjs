import {verifyTerrainPointLifecycle} from './verify-terrain-point-lifecycle-instructions.mjs';
await verifyTerrainPointLifecycle({fixtures: 96, frames: 64, withRaceUpdate: true, output: 'analysis/race-terrain-point-connected-instruction-check.json'});
