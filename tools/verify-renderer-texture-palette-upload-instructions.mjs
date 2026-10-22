import {verifyRendererTextureUpload} from './verify-renderer-texture-upload-instructions.mjs';
console.log(JSON.stringify(await verifyRendererTextureUpload({withPalettes: true, output: 'analysis/renderer-texture-palette-upload-instruction-check.json'})));
