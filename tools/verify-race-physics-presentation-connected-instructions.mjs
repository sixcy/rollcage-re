import {verifyRacePhysicsConnected} from './verify-race-physics-connected-instructions.mjs';
console.log(JSON.stringify(await verifyRacePhysicsConnected({withPostFrame: true, withPresentation: true, output: 'analysis/race-physics-presentation-connected-instruction-check.json'})));
