import {verifyRaceHudRenderer} from './verify-race-hud-renderer-connected-instructions.mjs';
console.log(JSON.stringify(await verifyRaceHudRenderer({fixtures: 6, withLayout: true, output: 'analysis/race-hud-layout-renderer-connected-instruction-check.json'})));
