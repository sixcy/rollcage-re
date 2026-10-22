import {verifyRendererSceneNodes} from './verify-renderer-scene-nodes-instructions.mjs';
console.log(JSON.stringify(await verifyRendererSceneNodes({withRegistration: true, output: 'analysis/renderer-manager-registration-instruction-check.json'})));
