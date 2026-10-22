import {verifyGameImageCopy} from './verify-game-image-copy-instructions.mjs';
console.log(JSON.stringify(await verifyGameImageCopy({withTexture: true, output: 'analysis/game-texture-construction-instruction-check.json'})));
