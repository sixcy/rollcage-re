import {verifyRaceHudFonts} from './verify-race-hud-fonts-instructions.mjs';
console.log(JSON.stringify(await verifyRaceHudFonts({fixtures: 12, withLayout: true, output: 'analysis/race-hud-parent-connected-instruction-check.json'})));
