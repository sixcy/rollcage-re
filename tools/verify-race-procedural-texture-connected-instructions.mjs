import {verifyProceduralTextureStorage} from './verify-procedural-texture-storage-instructions.mjs';
await verifyProceduralTextureStorage({fixtures: 4, withRaceUpdate: true, output: 'analysis/race-procedural-texture-connected-instruction-check.json'});
