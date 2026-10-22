import {verifyWormholeState} from './verify-wormhole-state-instructions.mjs';
console.log(JSON.stringify(await verifyWormholeState({withRaceUpdate: true, fixtures: 280, frames: 4, output: 'analysis/race-wormhole-messages-connected-instruction-check.json'})));
