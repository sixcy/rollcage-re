import {verifyRacePhysicsConnected} from './verify-race-physics-connected-instructions.mjs';
console.log(JSON.stringify(await verifyRacePhysicsConnected({withPostFrame: true, output: 'analysis/race-physics-respawn-connected-instruction-check.json'})));
