import {verifyGameImageCopy} from './verify-game-image-copy-instructions.mjs';
console.log(JSON.stringify(await verifyGameImageCopy({withMipmaps: true, output: 'analysis/game-image-mipmaps-instruction-check.json'})));
