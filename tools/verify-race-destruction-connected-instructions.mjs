import {verifyPlacedObjectDestruction} from './verify-placed-object-destruction-instructions.mjs';
const report = await verifyPlacedObjectDestruction({fixtures: 64, withRaceUpdate: true, output: 'analysis/race-destruction-connected-instruction-check.json'});
const {evidence, ...summary} = report; console.log(JSON.stringify(summary));
