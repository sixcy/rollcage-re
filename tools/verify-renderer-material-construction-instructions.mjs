import {pathToFileURL} from 'node:url';
import {verifyRendererShaderNames} from './verify-renderer-shader-names-instructions.mjs';
export const verifyRendererMaterialConstruction=({fixtures=1200,output='analysis/renderer-material-construction-instruction-check.json'}={})=>verifyRendererShaderNames({fixtures,output,material:true});
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await verifyRendererMaterialConstruction({fixtures:Number(process.argv[2]??1200)})));
