import {verifyRaceHudFonts} from './verify-race-hud-fonts-instructions.mjs';
console.log(JSON.stringify(await verifyRaceHudFonts({fixtures: 4, mipmaps: true, output: 'analysis/race-hud-fonts-default-mipmaps-instruction-check.json'})));
